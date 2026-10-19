import { fmtDate, makeProfile, portalValue, preferOption } from './fake-person';
import { expect, type Page } from '@playwright/test';
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
async function fillPortalForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Xác nhận gửi' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
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
  const nextEmpty = () =>
    page.evaluate(() => {
      document.querySelectorAll('[data-qa-i]').forEach((e) => e.removeAttribute('data-qa-i'));
      const els = Array.from(document.querySelectorAll('input, textarea, button')) as HTMLElement[];
      for (const e of els) {
        const r = e.getBoundingClientRect();
        const el = e as HTMLInputElement;
        if (!r.width || el.disabled || el.type === 'file' || el.type === 'checkbox') continue;
        // Ô chọn Radix: role=combobox, còn trống khi có data-placeholder (vd «Tên trường» placeholder "Nhập tên trường" không bắt đầu bằng "Chọn").
        const isCombo = e.tagName === 'BUTTON' && e.getAttribute('role') === 'combobox';
        const isSelect = isCombo || (e.tagName === 'BUTTON' && /^Chọn /.test(e.innerText.trim()));
        if (e.tagName === 'BUTTON' && !isSelect) continue;
        if (isCombo && !e.hasAttribute('data-placeholder')) continue;
        const label = ((e.closest('div')?.parentElement as HTMLElement | null)?.innerText ?? '').split('\n')[0].trim();
        // Bộ đếm mục chỉ tính một mục là xong khi MỌI ô của mục đó có dữ liệu (cả ô không có dấu *) → điền hết ô trống.
        if (!isSelect && el.value) continue;
        e.setAttribute('data-qa-i', '1');
        return { label, select: isSelect, placeholder: el.placeholder ?? '', tag: e.tagName };
      }
      return null;
    });

    // Checkbox "Cam kết: …" / "Tôi xác nhận đã đọc…" mới là bắt buộc; câu hỏi khảo sát (quen ai ở Shinhan, nợ xấu CIC…) KHÔNG tích vì sẽ mở thêm ô bắt buộc.
  const isCommitment = (b: ReturnType<Page['locator']>) =>
    b.evaluate((e) => /^(Cam kết:|Tôi xác nhận)/.test(((e.closest('label,div')?.parentElement as HTMLElement | null)?.innerText ?? '').trim()));
  // Câu hỏi khảo sát (quen ai ở Shinhan, nợ xấu CIC, vi phạm pháp luật, từng phỏng vấn…): mục «Thông tin khác» chỉ tính xong khi đã trả lời → tích hết rồi điền các ô chi tiết lộ ra.
  for (const b of await page.getByRole('checkbox').all()) {
    if ((await b.getAttribute('aria-checked')) !== 'true' && !(await isCommitment(b))) {
      await b.scrollIntoViewIfNeeded();
      await b.click({ timeout: 5000 }).catch(() => undefined);
    }
  }
  const runLoop = async () => {
    let lastKey = '';
    let stuck = 0;
    for (let guard = 0; guard < 120; guard++) {
      const f = await nextEmpty();
      if (!f) break;
      const key = `${f.label}|${f.placeholder}`;
      stuck = key === lastKey ? stuck + 1 : 0;
      lastKey = key;
      if (stuck >= 3) throw new Error(`Ô «${f.label}» (${f.placeholder}) điền rồi vẫn trống — dừng để tránh lặp vô hạn`);
      const target = page.locator('[data-qa-i="1"]');
      await target.scrollIntoViewIfNeeded();
      if (f.select) {
        // Dropdown kiểu Radix (role=combobox → role=option): bấm ô rồi chọn lựa chọn đầu tiên.
        await page.waitForTimeout(1200); // Phường/Xã nạp danh sách theo Tỉnh sau khi chọn Tỉnh
        await target.click();
        // Tỉnh/Thành phố: danh sách có cả mục lạ ở đầu (vd "Cục Cảnh Sát…") không có phường/xã → chọn Hà Nội để ô Phường/Xã có dữ liệu.
        const want = preferOption(profile, f.label);
        const prefer = want ? page.getByRole('option').filter({ hasText: want }).first() : undefined;
        const opt = prefer && (await prefer.waitFor({ timeout: /^Tỉnh/.test(f.label) ? 6000 : 2500 }).then(() => true, () => false)) ? prefer : page.getByRole('option').first();
        if (await opt.waitFor({ timeout: 10_000 }).then(() => true, () => false)) {
          await opt.click();
        } else {
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(300);
        if ((await target.getAttribute('aria-expanded').catch(() => null)) === 'true') await page.keyboard.press('Escape');
        continue;
      }
      const n = (seen[f.label] = (seen[f.label] ?? 0) + 1);
      const l = f.label.toLowerCase();
      const ph = f.placeholder.toLowerCase();
      const v = portalValue(profile, f.label, f.placeholder, f.tag, n);
      await target.fill(v, { timeout: 8000 });
      if (/ngày|dd\/mm/.test(l + ph)) await page.keyboard.press('Tab');
    }
  };
  await runLoop();
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
  const send = page.getByRole('button', { name: 'Xác nhận gửi' });
  await expect(send).toBeEnabled({ timeout: 10_000 }).catch(() => undefined);
  const ok = await send.isEnabled().catch(() => false);
  if (!ok) {
    const left = await nextEmpty();
    throw new Error(`Nút "Xác nhận gửi" chưa bật — ô bắt buộc còn trống: ${left ? left.label : '(không tìm thấy, xem ảnh)'}`);
  }
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
