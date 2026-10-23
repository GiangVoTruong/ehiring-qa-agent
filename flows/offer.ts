import { aiFieldValues } from './ai';
import { fmtDate, makeProfile, portalValue, preferOption, valueOrNull } from './fake-person';
import { expect, test, type Page } from '@playwright/test';
import { forceEnglish, readRegistry } from './common';
import { authToken, openQaCard, pass } from './applications';

// Từ vòng Offer tới vòng HRIS (dừng TRƯỚC nút "Convert candidates to employees" — nút đó đẩy nhân viên sang HRIS thật).
// Kiến thức: knowledge/ui-walkthrough-applications.md mục 10.

const qaUser = () => process.env.QA_USERNAME!;

/** Ngày sinh của talent bắt buộc để tạo tờ trình (ô DOB trong modal bị khoá, lấy từ hồ sơ talent). */
async function ensureTalentDob(page: Page): Promise<void> {
  const talent = readRegistry().filter((e) => e.flow === 'talents').pop();
  if (!talent) return;
  await forceEnglish(page);
  await page.goto(`/talents/${talent.id}/edit`);
  const dob = page.getByPlaceholder('Enter date of birth...');
  await dob.waitFor();
  if (await dob.inputValue()) return;
  await dob.click();
  await dob.fill('01/01/1995');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.ant-modal:visible').last().getByRole('button', { name: 'Save' }).click(); // "Do you want to save these changes?"
  await page.waitForTimeout(3000);
}

async function planTitleOf(page: Page): Promise<string> {
  return ((await page.locator('body').innerText()).match(/\[(?:AUTOTEST|QA-AUTO)\] PATD[^-\n]*?\d{12,}/)?.[0] ?? '').trim();
}

/** Mở menu ⋮ của dòng tờ trình (icon không có tên) bằng toạ độ ở mép phải của dòng, rồi chọn mục. */
async function proposalMenu(page: Page, item: string): Promise<void> {
  const row = page.locator('.tbody.expand').first();
  await row.waitFor();
  await page.waitForTimeout(800);
  const b = (await row.boundingBox())!;
  await page.mouse.click(b.x + b.width - 24, b.y + b.height / 2);
  const entries = page.locator('.ant-dropdown:visible li');
  await entries.first().waitFor();
  await page.waitForTimeout(300);
  await entries.filter({ hasText: item }).first().click();
}

/** Tờ trình offer: tạo bản nháp → gửi duyệt → người duyệt (QA) duyệt. Bỏ qua phần đã làm. */
export async function proposal(page: Page, planId: string): Promise<void> {
  await ensureTalentDob(page);
  await openQaCard(page, planId);
  const title = await planTitleOf(page);
  // Mã thời gian trong tên kế hoạch/YCTD: lấy từ registry (ổn định), không có thì từ chữ trên trang.
  const suffix = readRegistry().find((e) => e.id === planId)?.title.match(/\d{12,}/)?.[0] ?? title.match(/\d{12,}/)?.[0] ?? '';
  if (!suffix) throw new Error('Không xác định được mã thời gian của kế hoạch để chọn đúng tờ trình cần duyệt');
  const has = async (t: string | RegExp) => (await page.getByText(t).locator('visible=true').count()) > 0; // chỉ tính chữ đang hiện (bố cục rộng render sẵn các tab ẩn)
  await page.waitForTimeout(3000); // danh sách tờ trình nạp muộn hơn khung thẻ
  if (await has('Approved')) return;
  if (await has(/Form for additional information|Review Candidate Information|Convert candidates to employees/)) return; // thẻ đã qua vòng Offer

  if (!(await has('Draft')) && !(await has('Waiting for signature'))) {
    await page.getByText('Create a recruitment proposal').click();
    const m = page.locator('.ant-modal:visible').last();
    await m.getByRole('button', { name: 'Create draft' }).waitFor();
    await page.waitForTimeout(1500); // chờ modal nạp xong dữ liệu talent
    // Line Manager: nz-select người dùng — gõ từng ký tự, chờ đúng dòng QA (danh sách đầu có cả người thật).
    const idx = await m.locator('nz-select').evaluateAll((els) => els.findIndex((e) => e.parentElement?.innerText.includes('Line Manager')));
    expect(idx).toBeGreaterThanOrEqual(0);
    const lm = m.locator('nz-select').nth(idx);
    await lm.scrollIntoViewIfNeeded();
    await lm.locator('nz-select-top-control').click();
    await lm.locator('input').pressSequentially(qaUser(), { delay: 30 });
    const qaOpt = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: qaUser() }).first();
    await qaOpt.waitFor({ timeout: 15_000 });
    await qaOpt.click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await m.locator('[placeholder="Vd: 8,000,000"]').fill('10000000'); // Base salary
    await m.locator('[placeholder="Vd: 8,000,000"]').blur();
    const saved = page.waitForResponse((r) => /\/offers\/config$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await m.getByRole('button', { name: 'Create draft' }).click();
    expect((await saved).status()).toBeLessThan(300);
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.goto(page.url());
    await page.getByText('Transfer 1').first().waitFor();
  }

  if (!(await has('Waiting for signature'))) {
    await proposalMenu(page, 'See report');
    const m = page.locator('.ant-modal:visible').last();
    const submit = m.getByRole('button', { name: /Submitted for Approval/ });
    await submit.waitFor();
    const sent = page.waitForResponse((r) => /process-integration$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await submit.click();
    expect((await sent).status()).toBeLessThan(300);
    await page.waitForTimeout(1500);
  }

  // Người duyệt: tab "Recruitment proposals to approve" chứa cả tờ trình của người khác → chỉ bấm dòng có mã thời gian của kế hoạch này.
  await page.goto('/recruitment-task?tab=offer-letter');
  // Bảng chia cột cố định nên chữ và nút nằm ở các <tr> khác nhau → ghép theo toạ độ dọc: nút Approve cùng hàng với chữ mã thời gian.
  const labels = page.getByText(suffix);
  await labels.first().waitFor({ timeout: 30_000 });
  const approveBtns = page.locator('span.btn_approval').filter({ hasText: 'Approve' }); // nút duyệt là <span>, không phải <button>
  await expect(approveBtns.first()).toBeVisible({ timeout: 15_000 });
  const centerY = async (loc: ReturnType<Page['locator']>) => {
    const bb = await loc.boundingBox();
    return bb ? bb.y + bb.height / 2 : undefined;
  };
  const labelYs: number[] = [];
  for (let i = 0; i < (await labels.count()); i++) {
    const y = await centerY(labels.nth(i));
    if (y !== undefined) labelYs.push(y);
  }
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < (await approveBtns.count()); i++) {
    const by = await centerY(approveBtns.nth(i));
    if (by === undefined) continue;
    for (const ly of labelYs) {
      const d = Math.abs(by - ly);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
  }
  expect(bestDist, 'nút Approve phải cùng hàng với tờ trình của kế hoạch này (bảng có tờ trình của người khác)').toBeLessThan(40);
  await approveBtns.nth(best).click();
  const dlg = page.locator('.ant-modal:visible').last();
  const approved = page.waitForResponse((r) => /\/offers\/[^/]+\/approve$/.test(new URL(r.url()).pathname) && r.request().method() === 'PATCH');
  await dlg.getByRole('button', { name: /Agree/ }).click();
  expect((await approved).status()).toBe(200);
  await openQaCard(page, planId);
  await expect(page.getByText('Approved').first()).toBeVisible({ timeout: 20_000 });
}

/**
 * Điền form bổ sung thông tin trên cổng ứng viên (cả dạng 15 mục bàn giao lẫn dạng đầy đủ "1/10 mục"): chỉ điền ô BẮT BUỘC (nhãn có dấu *)
 * còn trống, theo thứ tự từ trên xuống. Ô chọn là dropdown tuỳ biến: bấm rồi ↓ + Enter. Tỉnh phải chọn trước thì Phường/Xã mới bật.
 * Mục tài liệu chưa có file: loại giấy tờ + ngày bổ sung dự kiến + lý do (đã điền sẵn từ bản nháp thì bỏ qua).
 */
const SECTION_TITLES = '^(Thông tin chung|Thông tin cá nhân|Thông tin gia đình|Gia đình|(Thông tin )?người liên hệ khẩn cấp|(Thông tin )?kinh nghiệm làm việc|(Thông tin )?học vấn|Đào tạo( ngắn hạn)?|Kỹ năng|Đặc điểm tính cách|Thông tin khác|Tài liệu.*|Hồ sơ.*)$';

/** Điền form cổng ứng viên bằng dữ liệu giả lập giống thật. submit=false: điền xong dừng lại (nút «Xác nhận gửi» đã bật) để người dùng tự kiểm tra và gửi. */
export async function fillPortalForm(page: Page, opts: { submit?: boolean; steps?: boolean } = {}): Promise<void> {
  await page.getByRole('button', { name: 'Xác nhận gửi' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  // Xem toàn bộ form trước khi điền: cuộn từ đầu tới cuối từng màn hình (để form vẽ đủ mọi mục), báo có bao nhiêu mục/ô, rồi về đầu trang.
  const overview = async () => {
    const info = await page.evaluate(async () => {
      const scroller = (Array.from(document.querySelectorAll('main, body, div')) as HTMLElement[]).filter((e) => e.scrollHeight > e.clientHeight + 200 && /auto|scroll/.test(getComputedStyle(e).overflowY)).sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? (document.scrollingElement as HTMLElement);
      const step = Math.max(250, Math.floor(window.innerHeight * 0.6));
      for (let y = 0, guard = 0; guard < 80; guard++) {
        scroller.scrollTo({ top: y, behavior: 'auto' });
        await new Promise((r) => setTimeout(r, 220));
        if (y >= scroller.scrollHeight - scroller.clientHeight) break;
        y += step;
      }
      scroller.scrollTo({ top: 0, behavior: 'auto' });
      await new Promise((r) => setTimeout(r, 200));
      return { inputs: document.querySelectorAll('input:not([type=checkbox]):not([type=file]), textarea, [role=combobox]').length, sections: document.querySelectorAll('main section, main [role=region], [role=region]').length };
    });
    console.log(`Đã xem toàn bộ form: ${info.sections} mục, ${info.inputs} ô nhập/chọn`);
  };
  // Mục «Thông tin chung» bắt buộc có ảnh chân dung: tải ảnh mẫu lên (ô file đầu tiên trên trang) nếu chưa có.
  const photoInput = page.locator('input[type=file]').first();
  if (!(await page.getByText(/Xoá|Xóa/).first().isVisible().catch(() => false))) {
    await photoInput.setInputFiles('fixtures/qa-photo.png');
    await page.waitForTimeout(2500);
  }
  const profile = makeProfile();
  console.log(`Hồ sơ giả lập: ${profile.fullName} (${profile.gender}, sinh ${fmtDate(profile.birth)}), CCCD ${profile.cccd}, ${profile.school}, từng làm ${profile.position} tại ${profile.company}`);
  const seen: Record<string, number> = {};
  // Tìm ô bắt buộc còn trống đầu tiên (đánh dấu data-qa-i để thao tác bằng locator).
  type EmptyField = { i: number; id: string; disabled: boolean; label: string; select: boolean; placeholder: string; tag: string; section: string };
  const scanEmpty = (): Promise<EmptyField[]> =>
    page.evaluate((titleSrc) => {
      const titleRe = new RegExp(titleSrc, 'i');
      const fixedAncestor = (n: Node | null) => { for (let e = n?.parentElement ?? null; e; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
      // Tiêu đề mục = chữ đứng ngay sau số thứ tự trong vòng tròn (1 Thông tin chung … 25 …), hoặc khớp tên đã biết; bỏ thanh điều hướng cố định. Quét chữ MỘT lần.
      const heads: { el: Element; name: string }[] = [];
      let afterNumber = false;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = (n.textContent ?? '').trim();
        if (!t || t.length > 80) continue;
        const isNum = /^\d{1,2}$/.test(t);
        if (!isNum && !afterNumber && !titleRe.test(t)) continue;
        if (fixedAncestor(n) || !((n.parentElement?.getBoundingClientRect().width ?? 0) > 0)) continue;
        if (isNum && (n.parentElement?.getBoundingClientRect().width ?? 99) <= 40) { afterNumber = true; continue; }
        const name = t; afterNumber = false;
        if (n.parentElement) heads.push({ el: n.parentElement, name });
      }
      const sectionOf = (e: Element) => { let name = ''; for (const h of heads) { if (h.el.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) name = h.name; else break; } return name; };
      document.querySelectorAll('[data-qa-i]').forEach((e) => e.removeAttribute('data-qa-i'));
      const out: { i: number; id: string; disabled: boolean; label: string; select: boolean; placeholder: string; tag: string; section: string }[] = [];
      for (const e of Array.from(document.querySelectorAll('input, textarea, button')) as HTMLElement[]) {
        const r = e.getBoundingClientRect();
        const el = e as HTMLInputElement;
        if (!r.width || el.type === 'file' || el.type === 'checkbox') continue; // ô đang khoá (Phường/Xã chờ Tỉnh) vẫn được ghi nhận: sẽ chờ mở khoá ngay tại chỗ
        const isCombo = e.tagName === 'BUTTON' && e.getAttribute('role') === 'combobox';
        const isSelect = isCombo || (e.tagName === 'BUTTON' && /^Chọn /.test(e.innerText.trim()));
        if (e.tagName === 'BUTTON' && !isSelect) continue;
        // Ô chọn còn trống: có data-placeholder (bản cũ) HOẶC chữ hiển thị là gợi ý «Chọn …/Nhập …» (span màu muted, bản mới).
        const shown = e.innerText.trim();
        const isEmptyCombo = e.hasAttribute('data-placeholder') || !!e.querySelector('span[class*="muted"]') || /^(Chọn|Nhập|Select)/i.test(shown) || shown === '';
        if (isCombo && !isEmptyCombo) continue;
        if (!isSelect && el.value) continue; // điền hết ô trống, kể cả ô không bắt buộc (bộ đếm mục chỉ xong khi mọi ô có dữ liệu)
        const label = ((e.closest('div')?.parentElement as HTMLElement | null)?.innerText ?? '').split('\n')[0].trim();
        const i = out.length;
        e.setAttribute('data-qa-i', String(i));
        out.push({ i, id: e.id || '', disabled: el.disabled, label, select: isSelect, placeholder: el.placeholder ?? '', tag: e.tagName, section: sectionOf(e) });
      }
      return out;
    }, SECTION_TITLES);
  const nextEmpty = async () => (await scanEmpty())[0] ?? null;

    // Checkbox "Cam kết: …" / "Tôi xác nhận đã đọc…" mới là bắt buộc; câu hỏi khảo sát (quen ai ở Shinhan, nợ xấu CIC…) KHÔNG tích vì sẽ mở thêm ô bắt buộc.
  const isCommitment = (b: ReturnType<Page['locator']>) =>
    b.evaluate((e) => /^(Cam kết:|Tôi xác nhận)/.test(((e.closest('label,div')?.parentElement as HTMLElement | null)?.innerText ?? '').trim()));
  // Điền từng mục theo thứ tự trên trang; mỗi mục là một bước riêng (khi steps=true) và được cuộn vào giữa màn hình trước khi điền.
  // Mỗi ô làm đúng quy trình: bấm mở/kích hoạt → chờ sẵn sàng → nhập hoặc chọn → ĐỌC LẠI giá trị thật trên giao diện; sai thì thử lại, vẫn sai thì báo lỗi (không giả định đã thành công).
  const norm = (t: string) => t.replace(/[\s.,/-]/g, '').toLowerCase();
  let tLap = Date.now();
  const lap = (what: string) => { const now = Date.now(); console.log(`      · ${what} (+${now - tLap}ms)`); tLap = now; }; // log từng bước nhỏ: đang làm gì, mất bao lâu
  const openField = async (t: ReturnType<Page['locator']>) => {
    await t.click({ timeout: 1000 }).catch(async () => {
      await t.click({ timeout: 500, force: true }).catch(async () => { await t.focus({ timeout: 500 }).catch(() => undefined); await page.keyboard.press('Enter'); }); // bị che/khó bấm: bấm ép rồi tới bàn phím
    });
  };
  const comboFilled = (t: ReturnType<Page['locator']>) =>
    t.evaluate((e) => { const x = (e as HTMLElement).innerText.trim(); return !(e.hasAttribute('data-placeholder') || e.querySelector('span[class*="muted"]') || /^(Chọn|Nhập|Select)/i.test(x) || x === ''); });
  const chooseOption = async (f: EmptyField, target: ReturnType<Page['locator']>, n: number) => {
    tLap = Date.now(); lap(`«${f.label}»: bắt đầu mở`);
    await openField(target); // 2. bấm để mở danh sách
    lap('đã bấm mở')
    const want = preferOption(profile, f.label);
    const listId = await target.getAttribute('aria-controls', { timeout: 300 }).catch(() => null);
    const scope = listId ? page.locator(`[id="${listId}"]`) : page;
    const items = scope.locator('[role=option], [role=menuitem], [role=listbox] li, [role=listbox] button, li[id], li[role]');
    let hasList = await items.first().waitFor({ state: 'visible', timeout: 250 }).then(() => true, () => false); // 3. chờ danh sách hiện
    lap(hasList ? 'thấy danh sách' : 'chưa thấy danh sách')
    if (!hasList) {
      // Ô tìm kiếm/gợi ý: gõ vài chữ đầu của giá trị phù hợp để danh sách lọc ra rồi chờ lại.
      const hint = valueOrNull(profile, f.label, f.placeholder, 'INPUT', n);
      if (hint) { await page.keyboard.type(hint.slice(0, 6), { delay: 30 }); hasList = await items.first().waitFor({ state: 'visible', timeout: 250 }).then(() => true, () => false); }
    }
    lap('chuẩn bị chọn');
    if (hasList) {
      const known = inventory.get(keyOf(f))?.options ?? [];
      const pickText = want ? known.find((t) => want.test(t)) : undefined; // chữ chính xác đã thấy lúc khảo sát
      const prefer = pickText ? items.filter({ hasText: pickText }).first() : want ? items.filter({ hasText: want }).first() : undefined;
      const opt = prefer && (await prefer.isVisible().catch(() => false)) ? prefer : items.first();
      await opt.click({ timeout: 1500 }).catch(async () => { console.log('      · bấm mục lỗi → chọn bằng bàn phím'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); });
      lap('đã bấm mục');
    } else {
      console.log(`  (không thấy danh sách của «${f.label}» — chọn bằng bàn phím)`);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    }
    if ((await target.getAttribute('aria-expanded', { timeout: 300 }).catch(() => null)) === 'true') await page.keyboard.press('Escape');
    lap('đóng danh sách xong');
  };
  const fillOne = async (f: EmptyField) => {
    const target = locOf(f);
    if (!(await target.count())) return false; // trang vẽ lại làm mất dấu: lần quét sau sẽ gặp lại
    if (f.disabled) { await expect(target).toBeEnabled({ timeout: 1000 }).catch(() => undefined); if (await target.isDisabled({ timeout: 500 })) return false; } // ô phụ thuộc: đợi ô trước (vd Tỉnh) mở khoá
    await target.evaluate((e) => e.scrollIntoView({ block: 'center' }), undefined, { timeout: 1500 }).catch(() => undefined); // 1. cuộn tới ô
    const lk = f.label.replace(/[*\s]+$/, '').replace(/\s*\(bắt buộc\)$/, ''); // «Ngày bắt đầu*» và «Ngày kết thúc» (không dấu *) phải đếm cùng nhịp
    const n = (seen[lk] = (seen[lk] ?? 0) + 1);
    if (f.select) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        await chooseOption(f, target, n);
        const ok = await expect.poll(() => comboFilled(target), { timeout: 2500, intervals: [100, 250] }).toBe(true).then(() => true, () => false); // 5. kiểm tra ô đã có giá trị
        if (ok) return true;
        console.log(`  (ô «${f.label}» chưa nhận lựa chọn, thử lại lần ${attempt + 1})`);
      }
      throw new Error(`Ô chọn «${f.label}» vẫn chưa có giá trị sau 2 lần chọn`);
    }
    const v = portalValue(profile, f.label, f.placeholder, f.tag, n);
    const isDate = /ngày|dd\/mm/.test((f.label + f.placeholder).toLowerCase());
    for (let attempt = 1; attempt <= 2; attempt++) {
      await openField(target); // 2. bấm vào ô để kích hoạt (mở lịch, focus)
      await expect(target).toBeEditable({ timeout: 1000 }).catch(() => undefined); // 3. chờ ô nhận được dữ liệu
      if (attempt === 1) await target.fill(v, { timeout: 8000 });
      else { await page.keyboard.press('Control+A'); await page.keyboard.type(v, { delay: 15 }); } // lần 2: gõ phím như người dùng
      if (isDate) await page.keyboard.press('Tab'); // rời ô để lịch ghi nhận ngày
      const got = await target.inputValue({ timeout: 800 }).catch(() => ''); // 5. đọc lại giá trị thực tế
      if (got && (norm(got) === norm(v) || norm(v).startsWith(norm(got)))) return true;
      console.log(`  (ô «${f.label}» đọc lại «${got}» khác «${v}», thử lại lần ${attempt + 1})`);
    }
    throw new Error(`Ô «${f.label}» không nhận giá trị «${v}» (đọc lại không khớp)`);
  };
  const sectionName = (f: { section: string }) => f.section || 'Thông tin khác trên form';
  const problems = new Set<string>(); // ô không nhập/chọn được: ghi lại, bỏ qua để điền tiếp phần còn lại, báo ở cuối
  const runLoop = async () => {
    let stuck = 0;
    for (let pass = 0; pass < 40; pass++) {
      const fields = (await scanEmpty()).filter((f) => !problems.has(`${sectionName(f)}|${f.label}`));
      if (!fields.length) break;
      let rescan = false;
      for (let k = 0; k < fields.length && !rescan;) {
        const name = sectionName(fields[k]);
        const body = async () => {
          while (k < fields.length && sectionName(fields[k]) === name) {
            const f = fields[k++];
            const t0 = Date.now();
            await fillOne(f).catch((e) => { problems.add(`${name}|${f.label}`); console.log(`  ✘ ${(e as Error).message}`); });
            console.log(`  [${name}] ${f.label || f.placeholder} (${Date.now() - t0}ms)`);
          }
        };
        await (opts.steps ? test.step(`Mục: ${name}`, body) : body());
      }
      if (!rescan) { const again = (await scanEmpty()).filter((x) => !problems.has(`${sectionName(x)}|${x.label}`)); if (!again.length) break; if (again.length >= fields.length) stuck++; if (stuck >= 3) throw new Error(`Ô «${again[0].label}» điền rồi vẫn trống`); }
    }
  };
  // Khảo sát: cuộn tới TỪNG ô theo thứ tự trang và bấm vào nó; ô chọn thì mở danh sách đọc hết các lựa chọn rồi đóng. Thu thập đủ loại ô + lựa chọn trước khi điền.
  const inventory = new Map<string, { kind: string; options: string[] }>();
  const keyOf = (f: { section: string; label: string }) => `${f.section}|${f.label}`;
  const timings: { what: string; ms: number }[] = [];
  const locOf = (f: EmptyField) => page.locator(f.id ? `[id="${f.id}"]` : `[data-qa-i="${f.i}"]`); // theo id: không mất khi ô được vẽ lại sau lúc chọn
  const surveyFields = async () => {
    const fields = await scanEmpty();
    let selects = 0;
    let prevF: { what: string; t: number } | null = null;
    for (const f of fields) {
      if (prevF) timings.push({ what: prevF.what, ms: Date.now() - prevF.t });
      prevF = { what: f.label, t: Date.now() };
      const target = locOf(f);
      if (!(await target.count())) continue;
      await target.evaluate((e) => e.scrollIntoView({ block: 'center' }), undefined, { timeout: 1500 }).catch(() => undefined);
      if (f.disabled) { inventory.set(keyOf(f), { kind: 'khoá (chờ ô trước)', options: [] }); console.log(`  [Khảo sát] ${f.section} › ${f.label}: đang khoá, phụ thuộc ô trước`); continue; }
      tLap = Date.now(); lap(`[Khảo sát] «${f.label}»: bấm`);
      await openField(target); // bấm vào ô để xem nó là loại gì
      lap('đã bấm')
      if (f.select) {
        selects++;
        const listId = await target.getAttribute('aria-controls', { timeout: 300 }).catch(() => null);
        const scope = listId ? page.locator(`[id="${listId}"]`) : page;
        const items = scope.locator('[role=option], [role=menuitem], [role=listbox] li, [role=listbox] button, li[id], li[role]');
        const has = await items.first().waitFor({ state: 'visible', timeout: 250 }).then(() => true, () => false);
        const options: string[] = []; // không đọc nội dung danh sách: chỉ cần biết ô mở ra được và có dữ liệu
        inventory.set(keyOf(f), { kind: has ? 'chọn' : 'chọn/tìm kiếm', options });
        console.log(`  [Khảo sát] ${f.section} › ${f.label}: ô chọn, ${has ? 'có dữ liệu' : 'không thấy danh sách'}`);
        await page.keyboard.press('Escape');
        if ((await target.getAttribute('aria-expanded', { timeout: 300 }).catch(() => null)) === 'true') await target.click({ timeout: 800 }).catch(() => undefined);
        lap('đã đóng')
      } else {
        const kind = f.tag === 'TEXTAREA' ? 'văn bản dài' : /ngày|dd\/mm/i.test(f.label + f.placeholder) ? 'ngày' : 'nhập';
        inventory.set(keyOf(f), { kind, options: [] });
        console.log(`  [Khảo sát] ${f.section} › ${f.label}: ô ${kind}`);
        if (kind === 'ngày') await page.keyboard.press('Escape'); // đóng lịch vừa mở
      }
    }
    if (prevF) timings.push({ what: (prevF as { what: string }).what, ms: Date.now() - (prevF as { t: number }).t });
    console.log(`Khảo sát xong: ${fields.length} ô (${selects} ô chọn)`);
    console.log('Khảo sát — 8 ô chậm nhất: ' + [...timings].sort((a, b) => b.ms - a.ms).slice(0, 8).map((t) => `${t.what} ${t.ms}ms`).join('; '));
    await page.evaluate(() => { for (const e of Array.from(document.querySelectorAll('main, body, div')) as HTMLElement[]) if (e.scrollTop) e.scrollTop = 0; window.scrollTo(0, 0); });
  };
  // Đọc một lần, điền một lần: mọi ô NHẬP chữ được gán giá trị cùng lúc ngay trong trang (setter gốc + sự kiện input/change/blur để form ghi nhận như người gõ).
  // Ô nào không nhận (bị xoá lại/che dữ liệu) sẽ được runLoop làm lại bằng quy trình bấm → nhập → đọc lại; ô chọn luôn đi qua quy trình đó.
  const batchFill = async () => {
    const fields = (await scanEmpty()).filter((f) => !f.select && !f.disabled);
    const rows = fields.map((f) => { const lk = f.label.replace(/[*\s]+$/, '').replace(/\s*\(bắt buộc\)$/, ''); const n = (seen[lk] = (seen[lk] ?? 0) + 1); return { f, n, rule: valueOrNull(profile, f.label, f.placeholder, f.tag, n) }; });
    // Ô chưa có luật theo nhãn (form mới): một lần hỏi AI cho cả lô; không có AI thì dùng giá trị mặc định như trước.
    const ai = await aiFieldValues(rows.filter((r) => r.rule == null).map((r) => ({ key: String(r.f.i), label: r.f.label, placeholder: r.f.placeholder, type: r.f.tag })), profile);
    if (Object.keys(ai).length) console.log(`AI đưa giá trị cho ${Object.keys(ai).length} ô chưa có luật`);
    const items = rows.map((r) => ({ i: r.f.i, v: r.rule ?? ai[String(r.f.i)] ?? portalValue(profile, r.f.label, r.f.placeholder, r.f.tag, r.n) }));
    const done = await page.evaluate((list) => {
      let ok = 0;
      for (const { i, v } of list) {
        const el = document.querySelector(`[data-qa-i="${i}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
        if (!el) continue;
        const set = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!;
        el.focus(); set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true }));
        ok++;
      }
      return ok;
    }, items);
    console.log(`Điền một lượt ${done}/${items.length} ô nhập`);
    await page.waitForTimeout(300);
  };
  // Mục cuối «Thông tin khác»: câu hỏi khảo sát (quen ai ở Shinhan, nợ xấu CIC, vi phạm pháp luật, từng phỏng vấn…) chỉ tính xong khi đã trả lời → tích hết rồi điền các ô chi tiết lộ ra.
  const answerSurvey = async () => {
    for (const b of await page.getByRole('checkbox').all()) {
      if ((await b.getAttribute('aria-checked')) !== 'true' && !(await isCommitment(b))) {
        await b.evaluate((e) => e.scrollIntoView({ block: 'center' }));
        await b.click({ timeout: 5000 }).catch(() => undefined);
      }
    }
  };
  const viewAll = async () => { await overview(); await surveyFields(); }; // cuộn qua cả trang rồi đi từng ô: bấm vào ô, mở ô chọn để đọc lựa chọn
  await (opts.steps ? test.step('Xem toàn bộ form (bấm từng ô)', viewAll) : viewAll());
  // Mục bắt buộc phải tải file (không có lựa chọn «ngày bổ sung + lý do»): hiện là «Chứng từ khác».
  const uploadRequired = async () => {
    for (const title of ['Chứng từ khác']) {
      const input = page.getByRole('region').filter({ has: page.getByText(title, { exact: true }) }).locator('input[type=file]').first();
      if (!(await input.count())) { console.log(`  (không thấy ô tải file của mục «${title}»)`); continue; }
      await input.setInputFiles('fixtures/qa-document.pdf', { timeout: 5000 }).then(() => console.log(`  Đã tải file mẫu cho mục «${title}»`), (e) => console.log(`  ✘ Không tải được file cho «${title}»: ${(e as Error).message.split(String.fromCharCode(10))[0]}`));
      await page.waitForTimeout(500);
    }
  };
  await (opts.steps ? test.step('Tải file bắt buộc', uploadRequired) : uploadRequired());
  await (opts.steps ? test.step('Điền một lượt các ô nhập', batchFill) : batchFill());
  await runLoop();
  await answerSurvey();
  await runLoop(); // ô chi tiết lộ ra sau khi trả lời khảo sát
  // 2 cam kết bổ sung chứng từ + 1 đồng ý chia sẻ dữ liệu (checkbox Radix role=checkbox).
  const boxes = page.getByRole('checkbox');
  for (let i = 0; i < (await boxes.count()); i++) {
    const b = boxes.nth(i);
    if ((await b.getAttribute('aria-checked')) === 'true') continue;
    if (!(await isCommitment(b))) continue;
    await b.scrollIntoViewIfNeeded();
    await b.click({ timeout: 5000 }).catch(() => undefined);
  }
  await page.waitForTimeout(800);
  const unchecked = await page.getByRole('checkbox').evaluateAll((els) => els.filter((e) => e.getAttribute('aria-checked') !== 'true').length);
  if (unchecked) {
    // Đồng ý chia sẻ dữ liệu: phải xem hết "Consent Form" (cuộn tới cuối) rồi bấm "Tôi đã đọc và đồng ý" mới đánh dấu được.
    await page.getByText('Consent Form').first().click();
    const dlg = page.locator('[role=dialog]').last();
    await dlg.waitFor();
    for (let i = 0; i < 40; i++) {
      await dlg.evaluate((d) => {
        for (const e of Array.from(d.querySelectorAll('*')) as HTMLElement[]) if (e.scrollHeight > e.clientHeight + 20) e.scrollTop = e.scrollHeight;
      });
      await page.waitForTimeout(400);
      if (await dlg.getByRole('button', { name: /đã đọc và đồng ý/ }).isEnabled().catch(() => false)) break;
    }
    await dlg.getByRole('button', { name: /đã đọc và đồng ý/ }).click();
    await page.waitForTimeout(800);
    for (const b of await page.getByRole('checkbox').all()) {
      if ((await b.getAttribute('aria-checked')) !== 'true' && (await isCommitment(b))) await b.click({ timeout: 5000 }).catch(() => undefined);
    }
    await runLoop(); // sau đồng ý có thể lộ thêm ô bắt buộc (vd «Tên & quan hệ phòng ban làm việc»)
  }
  if (problems.size) console.log(`Ô không điền được (${problems.size}): ${[...problems].join('; ')}`);
  const send = page.getByRole('button', { name: 'Xác nhận gửi' });
  await expect(send).toBeEnabled({ timeout: 10_000 }).catch(() => undefined);
  const ok = await send.isEnabled().catch(() => false);
  if (!ok) {
    const left = await nextEmpty();
    throw new Error(`Nút "Xác nhận gửi" chưa bật — ô bắt buộc còn trống: ${left ? left.label : '(không tìm thấy, xem ảnh)'}`);
  }
  if (opts.submit === false) return;
  const posted = page.waitForResponse((r) => /talent-extra-info$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 30_000 });
  await send.click();
  // Có thể hiện hộp xác nhận gửi hồ sơ → bấm nút xác nhận (nút cuối, không phải Huỷ/Đóng).
  const dlg = page.locator('[role=dialog]').last();
  if (await dlg.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
    await dlg.getByRole('button').last().click();
  }
  expect((await posted).status()).toBeLessThan(300);
}

/** Bổ sung thông tin: Pass sang vòng BSTT → gửi yêu cầu cho ứng viên → ứng viên (cổng) điền & gửi → Pass sang vòng Kiểm tra thông tin. */
export async function additionalInfo(page: Page, planId: string): Promise<void> {
  await openQaCard(page, planId);
  const has = async (t: string | RegExp) => (await page.getByText(t).locator('visible=true').count()) > 0; // chỉ tính chữ đang hiện (bố cục rộng render sẵn các tab ẩn)
  if (await has('Review Candidate Information')) return; // đã tới vòng kiểm tra

  if (!(await has('Form for additional information')) && !(await has('Additional information'))) {
    await pass(page, /Meet expectation/); // Offer → BSTT UV 2 (hồ sơ phải có tờ trình Approved)
  }
  const appUrl = page.url();
  if (!(await has('Resume'))) {
    // Chưa có dữ liệu ứng viên gửi → yêu cầu bổ sung và điền trên cổng.
    const requested = page.waitForResponse((r) => /email-advanced-info$/.test(new URL(r.url()).pathname) && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Request for Additional Information' }).click();
    await page.locator('.ant-modal:visible').last().getByRole('button', { name: 'Confirm' }).click();
    const res = await requested;
    expect(res.status()).toBeLessThan(300);
    const portalUrl = String((await res.json()).url);
    const portal = await page.context().newPage();
    try {
      await portal.goto(portalUrl);
      await fillPortalForm(portal).catch(async (e) => {
        await portal.screenshot({ path: 'test-results/portal-form-fail.png', fullPage: true });
        throw e;
      });
      await expect(portal.getByText(/Đã gửi hồ sơ thành công/)).toBeVisible({ timeout: 20_000 });
    } finally {
      await portal.close();
    }
    await page.goto(appUrl);
  }
  await pass(page, /Special(?! to offer)/); // BSTT UV 2 → Kiểm tra thông tin ứng viên (menu chỉ có Special / Special to offer)
  await page.waitForTimeout(2000);
  await page.reload(); // màn cũ chưa cập nhật vòng mới
  await expect(page.getByRole('button', { name: 'Pass all items' })).toBeVisible({ timeout: 20_000 });
}

/** Kiểm tra thông tin: Pass all items → Save changes → Pass sang HRIS. KHÔNG bấm "Convert candidates to employees". */
export async function verifyInfoToHris(page: Page, planId: string): Promise<void> {
  await openQaCard(page, planId);
  if ((await page.getByText('Convert candidates to employees').count()) > 0) return;
  await page.getByRole('button', { name: 'Pass all items' }).click();
  await page.locator('.ant-modal:visible').last().locator('button.ant-btn-primary').click(); // "Are you sure?" → Confirm
  await page.waitForTimeout(1500);
  const saved = page.waitForResponse((r) => /talent-extra-info\/review$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.locator('.ant-modal:visible').last().locator('button.ant-btn-primary').click(); // "Confirm saving this review?" → Confirm
  expect((await saved).status()).toBeLessThan(300);
  await page.waitForTimeout(1500);
  await pass(page, /Meet expectation/);
  await expect(page.getByText('Convert candidates to employees').first()).toBeVisible({ timeout: 20_000 });
}

export { authToken };
