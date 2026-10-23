import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { ensureLoggedIn, hold, runAuth } from '../../flows/common';
import { SLOT, clickSlot, resolveClash, slotTexts } from '../../flows/slots';
import { aiFieldValues, aiPickElement, aiRecover, aiVerifyElement, shapeOf } from '../../flows/ai';
import { autoValue, fmtDate, makeProfile, shiftDate, valueOrNull } from '../../flows/fake-person';
// @ts-ignore — module .mjs dùng chung với web
import { makeLib } from '../../web/qa-lib.mjs';
// @ts-ignore
import { loginFlags, normPath } from '../../web/recorder.mjs';
// @ts-ignore
import { openStore } from '../../web/store.mjs';
// @ts-ignore
import { isWriteApi } from '../../web/analysis.mjs';
// @ts-ignore
import { RISKY, overallStatus, verifyExpected, applyVerification } from '../../web/runlib.mjs';

// Chạy lại một flow đã lưu. Web ghi file đầu vào (data/run-input/<runId>.json) rồi truyền đường dẫn qua QA_RUN_INPUT:
// { runId, flowId, version, testCaseId, steps, expected, params:{values, fallbackFirst, omit, expectNoWrite, allowRisky} }.
// Làm đúng từng bước thật trên staging, chụp ảnh từng bước, xác minh kết quả thực tế rồi ghi báo cáo vào data/qa.db.
const inputFile = process.env.QA_RUN_INPUT;
const input = inputFile ? JSON.parse(readFileSync(inputFile, 'utf8')) : null;
test.describe.configure({ timeout: 900_000 });
// Tài khoản: của tester nếu đã được nhớ lúc quay, ngược lại tài khoản QA trong .env.
const auth = runAuth();
// Cửa sổ cùng kích thước lúc quay: giao diện co giãn đổi bố cục theo kích thước (menu thu gọn, nút ẩn/hiện) nên đổi kích thước là bấm sai chỗ.
const recVp = (input?.steps ?? []).map((s: any) => s.act).find((a: any) => a?.vw && a?.vh);
test.use({ storageState: existsSync(auth.state) ? auth.state : undefined, ...(recVp && !process.env.QA_FULLSCREEN ? { viewport: { width: recVp.vw, height: recVp.vh } } : {}) });

/**
 * Menu trái: khi thu gọn, mục con chỉ hiện ở lớp phủ lúc di chuột vào nhóm; khi mở rộng, nhóm phải đang mở.
 * Làm như người dùng: thử nhóm đã ghi trước, không có thì lần lượt thử từng nhóm (hover; nếu menu mở rộng thì bấm mở nhóm).
 */
async function revealMenuItem(page: Page, a: any): Promise<void> {
  const found = async () => (await page.evaluateHandle((x: any) => (window as any).__qaLib.resolve(x), a)).asElement() !== null;
  if (await found()) return;
  const titles = page.locator('nz-sider .ant-menu-submenu-title');
  const n = await titles.count();
  const names = await titles.allInnerTexts();
  const norm = (t: string) => t.split(String.fromCharCode(10)).join(' ').trim();
  const hit = (i: number) => Number(!(a.menuGroup && norm(names[i]).includes(a.menuGroup)));
  const order = [...names.keys()].sort((x, y) => hit(x) - hit(y));
  const collapsed = (await page.locator('nz-sider.ant-layout-sider-collapsed').count()) > 0;
  for (const i of order.slice(0, n)) {
    const t = titles.nth(i);
    await t.hover().catch(() => undefined);
    if (!collapsed && !(await t.locator('xpath=ancestor::li[1]').evaluate((li) => li.classList.contains('ant-menu-submenu-open')).catch(() => true))) await t.click().catch(() => undefined);
    await page.waitForTimeout(600);
    if (await found()) return; // chuột đang ở nhóm → lớp phủ còn mở, bước bấm ngay sau đó
  }
}

/** Bấm một mục menu trái: mở nhóm (hover khi thu gọn / bấm khi mở rộng) rồi bấm; lớp phủ hoặc danh sách có thể vẽ lại giữa chừng nên thử lại với phần tử mới. */
async function clickMenu(page: Page, a: any): Promise<void> {
  let lastErr = '';
  for (let i = 0; i < 8; i++) {
    let el = (await page.evaluateHandle((x: any) => (window as any).__qaLib.resolve(x), a)).asElement();
    if (!el) {
      await revealMenuItem(page, a);
      await page.waitForTimeout(500); // chờ hiệu ứng mở nhóm
      el = (await page.evaluateHandle((x: any) => (window as any).__qaLib.resolve(x), a)).asElement();
    }
    if (el) {
      try { await el.click({ timeout: 4000 }); return; } catch (e) { lastErr = String((e as Error).message).split(String.fromCharCode(10))[0]; }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Không bấm được mục menu «${a.text}»${lastErr ? ': ' + lastErr : ''}`);
}

/** "Vào link" như người dùng: tìm mục menu có đường dẫn tương ứng (.nav-map.json) rồi hover nhóm + bấm; trang sâu hơn thì mở trang danh sách rồi tới đúng link. */
async function goViaMenu(page: Page, url: string): Promise<boolean> {
  if (!existsSync('.nav-map.json')) return false;
  const map: { group: string; text: string; href: string }[] = JSON.parse(readFileSync('.nav-map.json', 'utf8'));
  const path = url.split('?')[0];
  const e = map.filter((x) => path === x.href || path.startsWith(x.href + '/')).sort((a, b) => b.href.length - a.href.length)[0];
  if (!e) return false;
  const a = { type: 'click', text: e.text, menuGroup: e.group };
  let el: any = null;
  for (let i = 0; i < 6 && !el; i++) {
    el = (await page.evaluateHandle((x: any) => (window as any).__qaLib.resolve(x), a)).asElement();
    if (!el) await revealMenuItem(page, a);
  }
  if (!el) return false;
  console.log(`Vào bằng menu: «${e.group}» → «${e.text}»`);
  await el.click({ timeout: 15_000 });
  await page.waitForLoadState('domcontentloaded');
  if (path !== e.href) await page.goto(url);
  return true;
}

// Tham số dữ liệu do tester chọn trên web: { values: {chỉ số bước: chữ cần chọn}, fallbackFirst: bool }
const params: { values?: Record<string, string>; fallbackFirst?: boolean; omit?: number[]; expectNoWrite?: boolean; allowRisky?: boolean; autofill?: boolean; shiftDays?: number; exactData?: boolean } = input?.params ?? {};

/**
 * Chọn DỮ LIỆU trong danh sách. wanted = chữ cần chọn (tester chọn cụ thể); để trống = chọn ĐẠI một mục.
 * skip = các mục đã chọn trong cùng lượt mở danh sách (danh sách chọn nhiều): bỏ qua để mỗi bước chọn một mục KHÁC, không bấm lại mục cũ (bấm lại sẽ bỏ chọn).
 * reopen = mở lại danh sách nếu nó đã đóng sau lần chọn trước.
 */
async function pickData(page: Page, wanted: string, skip: string[], reopen?: () => Promise<void>): Promise<string> {
  const listOpen = () => page.evaluate(() => !!(window as any).__qaLib.firstOption([]) || !!document.querySelector('cdk-virtual-scroll-viewport, .ant-select-dropdown'));
  const hasOption = () => page.evaluate((s: string[]) => !!(window as any).__qaLib.firstOption(s), skip);
  const waitOption = (ms: number) => expect.poll(hasOption, { timeout: ms, intervals: [300] }).toBe(true).then(() => true, () => false);
  if (reopen && !(await listOpen())) await reopen();
  // Danh sách nạp dữ liệu sau khi mở (hiện "No Data" + biểu tượng quay) → chờ tới khi có mục.
  let ok = await waitOption(Number(process.env.QA_FIND_TIMEOUT_MS) || 8000);
  // Phương án khác khi danh sách vẫn trống: (1) đóng rồi mở lại; (2) gõ vài ký tự để danh sách có tìm kiếm nạp kết quả; (3) cuộn lên đầu.
  if (!ok && reopen) { await page.keyboard.press('Escape').catch(() => undefined); await reopen(); ok = await waitOption(4000); }
  for (const ch of ['a', 'e', 'n']) {
    if (ok) break;
    await page.keyboard.type(ch).catch(() => undefined);
    ok = await waitOption(2500);
    if (!ok) await page.keyboard.press('Backspace').catch(() => undefined);
  }
  if (!ok) { await page.evaluate(() => { const b = document.querySelector('cdk-virtual-scroll-viewport'); if (b) b.scrollTop = 0; }).catch(() => undefined); ok = await waitOption(2000); }
  if (wanted) {
    await page.waitForTimeout(500);
    for (let i = 0; i < 40; i++) {
      const row = (await page.evaluateHandle((t: string) => (window as any).__qaLib.rowByText(t), wanted)).asElement();
      if (row) { await row.click({ timeout: 10_000 }); return wanted; }
      if (!(await page.evaluate(() => (window as any).__qaLib.scrollListDown()))) break; // hết danh sách
      await page.waitForTimeout(400);
    }
    if (!params.fallbackFirst) throw new Error(`Không thấy dữ liệu «${wanted}» trong danh sách (đã cuộn hết). Đổi dữ liệu hoặc bật "chọn mục đầu tiên nếu không thấy".`);
  }
  await page.evaluate(() => { const b = document.querySelector('cdk-virtual-scroll-viewport'); if (b) b.scrollTop = 0; });
  const first = (await page.evaluateHandle((s: string[]) => (window as any).__qaLib.firstOption(s), skip)).asElement();
  if (!first) throw new Error('NO_DATA: danh sách chọn không có mục nào để chọn (đã thử mở lại, gõ tìm kiếm).');
  const label = (await first.innerText()).replace(/\s+/g, ' ').trim();
  await first.click({ timeout: 10_000 });
  return label;
}

test('Chạy lại flow đã lưu', async ({ page }) => {
  test.skip(!input, 'chỉ chạy từ web (cần QA_RUN_INPUT)');
  const { runId, flowId, steps, expected } = input;
  const store = openStore();
  const shotDir = `data/runs/${runId}`;
  mkdirSync(shotDir, { recursive: true });
  await page.context().addInitScript({ content: `window.__qaLib = (${makeLib})(); window.__qaToasts = []; setTimeout(() => { try { window.__qaLib.observeToasts((t) => window.__qaToasts.push(t)); } catch (e) {} }, 0);` });

  // Đếm các request XHR/fetch đang chạy: sau mỗi thao tác đợi tới khi trang "yên" (không còn request) thay vì chờ cố định.
  let inflight = 0;
  const tracked = (r: any) => ['xhr', 'fetch'].includes(r.resourceType()) && !/monitoring\/traces|\/notifications/.test(r.url());
  page.on('request', (r) => { if (tracked(r)) inflight++; });
  const done = (r: any) => { if (tracked(r)) inflight = Math.max(0, inflight - 1); };
  page.on('requestfinished', done); page.on('requestfailed', done);
  const settle = async () => {
    const t0 = Date.now(); let quietSince = Date.now();
    while (Date.now() - t0 < 6000) { if (inflight > 0) quietSince = Date.now(); else if (Date.now() - quietSince > 250) return; await page.waitForTimeout(50); }
  };
  const observedWrites: { method: string; path: string; status: number }[] = [];
  const observedToasts: { kind: string; text: string }[] = [];
  page.on('response', (res) => {
    const q = res.request();
    if (!res.url().includes('/api/') || /monitoring\/traces/.test(res.url())) return;
    const path = normPath(new URL(res.url()).pathname.replace(/^\/api/, ''));
    if (isWriteApi(q.method(), path)) observedWrites.push({ method: q.method(), path, status: res.status() });
  });
  const drainToasts = async () => { const t = await page.evaluate(() => (window as any).__qaToasts.splice(0)).catch(() => []); observedToasts.push(...t); };

  // Tự điền: mỗi lần chạy một hồ sơ giả lập giống thật (tên, SĐT, email QA, ngày dời theo ngày quay…) thay cho dữ liệu đã quay để không tạo bản ghi trùng.
  const profile = params.autofill ? makeProfile() : null;
  if (profile) console.log(`Tự điền dữ liệu: ${profile.fullName} (${profile.gender}, sinh ${fmtDate(profile.birth)}), SĐT ${profile.phone}, mã ${profile.seed % 1679616}`);
  const fieldSeen: Record<string, number> = {};
  const omit = new Set<number>(params.omit ?? []);
  const dupClick = (i: number) => { const p = steps[i - 1]?.act, c = steps[i]?.act; return i > 0 && c?.type === 'click' && p?.type === 'click' && !c.dataChoice && c.sel === p.sel && c.text === p.text && steps[i].t - steps[i - 1].t < 1500; };
  const isLogin: boolean[] = loginFlags(steps.map((s: any) => ({ ...s.act, url: s.url }))); // chuỗi đăng nhập (kể cả mã xác nhận) đã được làm trước khi chạy
  const results: any[] = [];
  // Bộ nhớ luồng: cách xử lý đã thành công ở các lượt chạy trước (xem store.listMemory) và những gì học thêm trong lượt này.
  const memory: { step_key: string; kind: string; data: any }[] = input.memory ?? [];
  const learned: { step_key: string; kind: string; data: any }[] = [];
  const keyOf = (i: number) => `${i}:${steps[i].act?.text || steps[i].act?.field || steps[i].act?.type || ''}`.slice(0, 120);
  const recordedOf = (i: number) => { const af = steps[i].after; return af ? { url: af.url, nut: (af.buttons ?? []).map((b: any) => b.text).slice(0, 15), truong: (af.fields ?? []).map((f: any) => f.label).slice(0, 15) } : null; };
  const drifts: any[] = [];
  let halted = false;
  let prevT = 0;
  let skipPicker = false;
  let picked: string[] = []; // các mục đã chọn kể từ lần mở danh sách gần nhất
  let opener: any = null; // bước bấm mở danh sách gần nhất (để mở lại nếu danh sách đóng sau khi chọn)

  await ensureLoggedIn(page, '/dashboard', auth);
  for (const [idx, s] of steps.entries()) {
    const a = s.act;
    const t0 = Date.now();
    let status = 'Passed', error: string | null = null, classification: string | null = null;
    const evidence: any = {};
    if (halted) { status = 'Blocked'; error = 'Không chạy vì một bước trước đã lỗi / bị chặn.'; }
    else if (omit.has(idx)) { status = 'Skipped'; error = 'Bỏ qua có chủ đích theo test case (kiểm tra thiếu dữ liệu).'; }
    else if (RISKY.test(s.text) && !params.allowRisky) { status = 'Blocked'; classification = 'policy'; error = 'Hành động khó đảo ngược / ra ngoài hệ thống — không tự chạy. Cần xác nhận riêng.'; halted = true; }
    else if (dupClick(idx)) { status = 'Skipped'; error = 'Bấm đúp cùng một nút — bỏ lần thứ hai vì sẽ đóng lại menu vừa mở.'; }
    else if (isLogin[idx]) { status = 'Skipped'; error = 'Đăng nhập đã được làm trước khi chạy nên bỏ qua bước này.'; }
    else if (a.secret || a.value === '***') { status = 'Needs review'; error = 'Giá trị nhạy cảm không được lưu khi quay — cần nhập tay hoặc cấu hình riêng.'; }
    else {
      try {
        skipPicker = false;
        if (!(a.type === 'click' && a.dataChoice)) { picked = []; if (a.type === 'click') opener = a; }
        await test.step(`${idx + 1}. ${s.text}`, async () => {
          if (a.type === 'nav') {
            // Chuyển trang do tester gõ/mở link tay → vào bằng menu như người dùng (không thấy trong menu thì mới mở link); còn lại là hệ quả của thao tác trước.
            if (!prevT) await page.goto(s.url);
            else if (s.t - prevT <= 3000) evidence.note = 'chuyển trang là hệ quả của thao tác trước';
            else if (!(await goViaMenu(page, s.url))) await page.goto(s.url);
          } else if (a.type === 'key') {
            await page.keyboard.press(a.key);
          } else if (a.type === 'scroll') {
            await page.evaluate((x: any) => (window as any).__qaLib.scrollTo(x), a).catch(() => undefined); // không thấy khung cuộn thì bỏ qua
          } else if (a.type === 'drag') {
            // Kéo thả giữa các cột (Angular CDK): thẻ gốc nằm trong cột `#listN`. Bản ghi cũ lưu nhầm BẢN XEM TRƯỚC (con trực tiếp của body) nên xác định cột theo `#listN` của chỗ thả.
            const cardSel = 'ehiring-talent-card.cdk-drag, .cdk-drag:not(.cdk-drag-preview), [cdkdrag]:not(.cdk-drag-preview)';
            const toList: string = a.toList || /#(list\d+)/.exec(a.to?.sel ?? '')?.[1] || '';
            const fromList: string = a.fromList || '';
            const isPreview = /^html > body > [^ >]+(:nth-of-type\(\d+\))?$/.test(a.from?.sel ?? '');
            // Thẻ mới thêm có thể chưa kịp hiện sau bước trước: chờ có thẻ trong bảng rồi mới chọn.
            await page.waitForSelector(cardSel, { state: 'visible', timeout: Number(process.env.QA_FIND_TIMEOUT_MS) || 8000 }).catch(() => undefined);
            const pickCard = async () => (await page.evaluateHandle(({ cardSel, fromList, toList, fromSel, isPreview }: any) => {
              const vis = (e: Element) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
              const lists = [...document.querySelectorAll('.cdk-drop-list, [cdkdroplist]')] as HTMLElement[];
              const cardsOf = (l: Element) => [...l.querySelectorAll(cardSel)].filter(vis);
              const byId = (id: string) => lists.find((l) => l.id === id);
              if (fromList && byId(fromList) && cardsOf(byId(fromList)!).length) return cardsOf(byId(fromList)!)[0];
              if (!isPreview && fromSel) { try { const e = document.querySelector(fromSel); if (e && vis(e)) return e; } catch { /* sel hỏng */ } }
              // Không biết cột nguồn: ưu tiên cột liền trước cột đích, rồi tới cột đầu tiên còn thẻ (khác cột đích).
              const n = Number(/\d+/.exec(toList)?.[0] ?? -1);
              const order = [byId('list' + (n - 1)), ...lists.filter((l) => l.id !== toList)].filter(Boolean) as HTMLElement[];
              for (const l of order) { const c = cardsOf(l); if (c.length) return c[0]; }
              return null;
            }, { cardSel, fromList, toList, fromSel: a.from?.sel ?? '', isPreview })).asElement();
            const from = await pickCard();
            if (!from) throw new Error(`Không có thẻ nào để kéo trong bảng (cột đích ${toList || 'không rõ'}).`);
            evidence.chosen = (await from.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 60);
            await from.scrollIntoViewIfNeeded().catch(() => undefined);
            const fb = await from.boundingBox();
            if (!fb) throw new Error('Thẻ cần kéo đang không hiển thị');
            const toEl = toList ? await page.$(`#${toList}`) : null;
            const tb = toEl ? await toEl.boundingBox() : null;
            const sx = fb.x + fb.width / 2, sy = fb.y + fb.height / 2;
            const tx = tb ? tb.x + tb.width / 2 : sx + (a.dx ?? 0), ty = tb ? Math.min(tb.y + Math.max(60, tb.height / 3), tb.y + tb.height - 10) : sy + (a.dy ?? 0);
            console.log(`Kéo thẻ «${evidence.chosen}» sang ${toList ? '#' + toList : 'vị trí đã quay'}`);
            await page.mouse.move(sx, sy); await page.mouse.down();
            await page.mouse.move(sx + 10, sy + 10, { steps: 3 });
            await page.mouse.move(tx, ty, { steps: 25 });
            await page.waitForTimeout(150);
            await page.mouse.up();
            evidence.note = tb ? `Kéo tới cột ${toList}.` : 'Không thấy cột đích, kéo theo khoảng cách đã quay.';
          } else if (a.type === 'click' && a.dataChoice) {
            // Mặc định chọn ĐẠI mục đầu tiên (dữ liệu quay hôm trước thường đã đổi/không còn, tìm mất thời gian); chỉ tìm đúng tên khi tester chọn dữ liệu cụ thể hoặc bật exactData.
            const wanted = params.values && idx in params.values ? params.values[idx] : params.exactData ? a.text : '';
            evidence.chosen = await pickData(page, wanted, picked, opener ? async () => { const el = (await page.evaluateHandle((x: any) => (window as any).__qaLib.resolve(x), opener)).asElement(); if (el) { await el.click({ timeout: 5000 }).catch(() => undefined); await page.waitForTimeout(300); } } : undefined);
            picked.push(evidence.chosen);
            console.log(`Dữ liệu bước ${idx + 1}: «${evidence.chosen}»`);
          } else if (a.type === 'click' && !a.picker && (/(Sun|Mon).*(Tue|Wed)/.test(a.text ?? '') || a.text === 'Điều hướng lịch')) {
            evidence.note = 'Bản quay cũ bấm trong lịch (tên bước là cả bảng lịch, đổi theo tháng) — bỏ qua; quay lại luồng để ghi ngày chọn.'; skipPicker = true;
          } else if (a.type === 'click' && a.picker) {
            // Lịch chọn ngày: nhập thẳng ngày vào ô (không cần mở lịch, không phụ thuộc tháng đang hiện). Bấm chuyển tháng/năm thì bỏ qua.
            if (!a.picker.date) { evidence.note = 'Điều hướng lịch — không cần vì ngày được nhập thẳng vào ô.'; skipPicker = true; }
            else {
              const shifted = shiftDate(a.picker.date, params.autofill ? params.shiftDays ?? 0 : 0) ?? a.picker.date;
              const [y, m, d] = shifted.split('-');
              const typed = /yyyy.*mm.*dd/i.test(a.picker.ph) ? shifted : `${d}/${m}/${y}`;
              const el = (await page.evaluateHandle((f: string) => (window as any).__qaLib.resolve({ type: 'input', field: f, nth: 0, sel: '' }), a.picker.field)).asElement();
              if (!el) throw new Error(`Không tìm thấy ô ngày «${a.picker.field}» để nhập ${typed}`);
              await el.click();
              await el.fill(typed, { timeout: 3000 }).catch(async () => { await page.keyboard.press('Control+A'); await page.keyboard.type(typed); }); // ô chỉ-đọc: gõ phím
              await page.keyboard.press('Enter');
              evidence.filled = { from: a.picker.date, to: typed };
            }
          } else if (a.type === 'click' && a.menu && a.text && !a.menuToggle) {
            await clickMenu(page, a);
            evidence.how = 'menu';
          } else if (a.menuToggle) {
            // Chỉ bấm nút thu/mở khi menu đang ở trạng thái trước-lúc-quay → sau khi bấm sẽ giống lúc quay.
            const collapsed = (await page.locator('nz-sider.ant-layout-sider-collapsed').count()) > 0;
            if (collapsed === !!a.siderCollapsed) await page.locator('.trigger-button').first().click();
          } else {
            let el: any = null;
            let handled = false;
            let tries = 0;
            try {
              await expect.poll(async () => {
                el = (await page.evaluateHandle((x: any) => (window as any).__qaLib.resolve(x), a)).asElement();
                if (!el && a.type === 'click' && a.text && a.menu !== false && tries++ % 3 === 2) await revealMenuItem(page, a);
                return !!el;
              }, { timeout: Number(process.env.QA_FIND_TIMEOUT_MS) || 8000, intervals: [400], message: `Không tìm thấy phần tử: ${s.text}` }).toBe(true); // lỗi thì báo sớm: sau mỗi bước trang đã yên (settle) nên 8 giây không thấy là không có
              evidence.how = await page.evaluate(() => (window as any).__qaLib.how());
              // Tìm ra nhưng chỉ bằng cách dò gần đúng (chữ gần giống / nhiều phần tử trùng chữ / đường dẫn CSS) → nhờ AI xác nhận trước khi bấm, tránh bấm nhầm.
              const dup = evidence.how === 'text' && (await page.evaluate(() => (window as any).__qaLib.matches())) > 1;
              const weak = a.type === 'click' ? ['text~', 'field', 'sel'].includes(evidence.how) || dup : evidence.how === 'sel';
              if (weak) {
                // Nhớ luồng: bước này đã từng được AI chọn lại phần tử thay thế / đã được AI xác nhận đúng thì dùng luôn, không hỏi AI mỗi lượt chạy.
                const key = keyOf(idx);
                const curPath: string = await el.evaluate((e: any) => (window as any).__qaLib.pathOf(e));
                const mt = memory.find((x) => x.step_key === key && x.kind === 'target');
                const h = mt ? (await page.evaluateHandle((x: any) => (window as any).__qaLib.resolve(x), { type: a.type, text: mt.data.text, sel: mt.data.sel, field: a.field, nth: 0, ctx: a.ctx })).asElement() : null;
                if (h) { el = h; evidence.how = 'memory'; evidence.note = `Dùng phần tử đã học từ lần chạy trước: «${mt!.data.text}».`; }
                else if (memory.some((x) => x.step_key === key && x.kind === 'verified' && x.data.sel === curPath)) { evidence.how = 'memory'; evidence.note = 'Phần tử này đã được xác nhận đúng ở lần chạy trước.'; }
                else {
                  const alt = await aiVerifyElement(page, { type: a.type, text: a.text, field: a.field, title: s.text }, el, RISKY);
                  if (alt) {
                    el = alt.el; evidence.how = 'ai'; evidence.healed = { text: alt.text, reason: alt.reason };
                    console.log(`AI sửa bước ${idx + 1}: không bấm phần tử dò được mà bấm «${alt.text}» — ${alt.reason}`);
                    learned.push({ step_key: key, kind: 'target', data: { text: alt.text, sel: await el.evaluate((e: any) => (window as any).__qaLib.pathOf(e)) } });
                  } else learned.push({ step_key: key, kind: 'verified', data: { sel: curPath } });
                }
              }
            } catch (notFound) {
              // Cách đã học từ lần chạy trước cho đúng bước này: thử trước, khỏi hỏi AI.
              for (const m of memory.filter((x) => x.step_key === keyOf(idx) && x.kind === 'target')) {
                const h = (await page.evaluateHandle((x: any) => (window as any).__qaLib.resolve(x), { type: a.type, text: m.data.text, sel: m.data.sel, field: a.field, nth: 0, ctx: a.ctx })).asElement();
                if (h) { el = h; evidence.how = 'memory'; evidence.note = `Dùng cách đã học từ lần chạy trước: «${m.data.text}».`; break; }
              }
              // Tự sửa: giao diện/nhãn đổi → hỏi AI phần tử nào khớp bước này (không bao giờ chọn nút nguy hiểm thay thế).
              // Khung giờ đã quay không còn / không có: chọn một khung giờ khác còn trống trong cùng hộp thoại.
              const slots = !el && a.type === 'click' && SLOT.test(a.text ?? '') ? await slotTexts(page) : [];
              if (slots.length) {
                const other = slots.find((t) => t !== a.text) ?? slots[0];
                await clickSlot(page, other);
                handled = true; evidence.how = 'slot'; evidence.chosen = other;
                evidence.note = `Khung giờ «${a.text}» không còn: đã chọn khung giờ khác «${other}».`;
              }
              // Mục menu trái đôi khi bị ghi như một lần bấm thường (vd. bấm vào chú thích nổi của menu thu gọn): chữ trùng một mục trong menu đã học thì bấm bằng menu.
              const navItem = !handled && !el && a.type === 'click' && a.text && existsSync('.nav-map.json') ? (JSON.parse(readFileSync('.nav-map.json', 'utf8')) as { group: string; text: string }[]).find((x) => x.text === a.text) : undefined;
              if (navItem) {
                await clickMenu(page, { type: 'click', text: navItem.text, menuGroup: navItem.group });
                handled = true; evidence.how = 'menu';
                evidence.note = `Bản ghi không nhận ra đây là mục menu: đã bấm bằng menu «${navItem.group}» → «${navItem.text}».`;
              } else if (!handled && !el) {
                const healed = await aiPickElement(page, { type: a.type, text: a.text, field: a.field, title: s.text }, RISKY);
                if (!healed) { evidence.note = 'Đã hỏi AI: không có phần tử nào trên trang khớp chắc chắn với bước này (bước có thể là thao tác ghi nhầm).'; throw notFound; }
                el = healed.el;
                evidence.how = 'ai';
                evidence.healed = { text: healed.text, reason: healed.reason };
                console.log(`AI tự sửa bước ${idx + 1}: dùng «${healed.text}» — ${healed.reason}`);
                learned.push({ step_key: keyOf(idx), kind: 'target', data: { text: healed.text, sel: await el.evaluate((e: any) => (window as any).__qaLib.pathOf(e)) } });
              }
            }
            if (!handled) {
            if (evidence.how === 'sel' || evidence.how === 'ai') drifts.push({ idx, old: a.sel, now: await el.evaluate((e: any) => (window as any).__qaLib.pathOf(e)) });
            if (a.type === 'click') {
              await el.scrollIntoViewIfNeeded().catch(() => undefined);
              await el.click({ timeout: 15_000 });
            } else if (a.type === 'file') {
              const name = String(a.value).split(',')[0].trim();
              await el.setInputFiles(existsSync(`fixtures/${name}`) ? `fixtures/${name}` : 'fixtures/qa-photo.png');
            } else {
              const given = params.values && idx in params.values;
              const recorded = String(given ? params.values![idx] : a.value ?? '');
              const key = a.field ?? '';
              fieldSeen[key] = (fieldSeen[key] ?? 0) + 1;
              let typed = profile && !given ? autoValue(profile, key, recorded, { n: fieldSeen[key], shiftDays: params.shiftDays ?? 0 }) : recorded;
              // Ô chưa có luật theo nhãn (form mới): nhờ AI đưa giá trị hợp lệ theo nhãn/placeholder/kiểu ô; chỉ gửi "hình dạng" giá trị đã quay, không gửi nội dung.
              if (profile && !given && recorded.trim() && !/^\d{1,3}$/.test(recorded.trim()) && !/@/.test(recorded) && !shiftDate(recorded.trim(), 0) && valueOrNull(profile, key, '', 'INPUT', fieldSeen[key]) == null) {
                const attr = (n: string) => el.getAttribute(n).catch(() => null);
                const ml = Number(await attr('maxlength')) || null;
                const ai = await aiFieldValues([{ key: 'f', label: key, placeholder: await attr('placeholder'), type: await attr('type'), maxlength: ml, shape: shapeOf(recorded) }], profile);
                if (ai.f) { typed = ai.f; evidence.note = 'Giá trị do AI đề xuất theo nhãn ô.'; }
              }
              if (typed !== recorded) evidence.filled = { from: recorded, to: typed };
              await el.fill(typed, { timeout: 5000 }).catch(async () => { await el.click(); await page.keyboard.press('Control+A'); await page.keyboard.type(typed); }); // ô ngày chỉ-đọc: gõ phím
              if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(typed)) await page.keyboard.press('Tab'); // rời ô để lịch ghi nhận ngày
              if (a.enter) await page.keyboard.press('Enter');
            }
            }
          }
          if (a.type === 'click' && SLOT.test(a.text ?? '')) {
            // Khung giờ bận: thử khung khác tới khi hộp hết báo "Clash!".
            const moved = await resolveClash(page, evidence.chosen ?? a.text);
            if (moved) { evidence.chosen = moved; evidence.note = `Khung giờ bận, đã đổi sang «${moved}».`; }
          }
          prevT = s.t;
          await page.waitForLoadState('domcontentloaded').catch(() => undefined);
          await settle();
        });
        if (evidence.how === 'text~') { evidence.note = 'Chữ trên nút đã đổi phần mã/số nên khớp theo chữ gần giống.'; }
        if (evidence.how === 'ai') { status = 'Needs review'; error = `AI đã chọn «${evidence.healed.text}» thay cho phần tử đã quay (${evidence.healed.reason}). Hãy kiểm tra rồi xác nhận phiên bản đề xuất.`; }
        else if (evidence.how === 'sel') { status = 'Needs review'; error = 'Phần tử chỉ tìm được bằng đường dẫn CSS (cách cuối cùng) — giao diện có thể đã đổi; xem đề xuất cập nhật.'; }
        else if ((a.type === 'nav' && evidence.note) || skipPicker) status = 'Skipped';
      } catch (e) {
        const msg = String((e as Error).message).split('\n')[0].slice(0, 300);
        // Bước lỗi: không dừng ngay. AI nhìn trang rồi thử cách khác (bấm phần tử khác, chọn mục khác trong danh sách…); không nguy hiểm mới được thử.
        let rec: { done: boolean; skipped?: boolean; note: string; detail?: { action: string; text: string } } | null = null;
        if (!RISKY.test(s.text)) {
          for (const m of memory.filter((x) => x.step_key === keyOf(idx) && x.kind === 'action')) {
            const ok = await page.getByText(m.data.text, { exact: true }).first().click({ timeout: 4000 }).then(() => true, () => false);
            if (ok) { rec = { done: true, note: `Dùng cách đã học: ${m.data.action} «${m.data.text}»` }; break; }
          }
          if (!rec) rec = await aiRecover(page, { type: a.type, text: a.text, field: a.field, ctx: a.ctx, title: s.text, recorded: recordedOf(idx) }, msg, RISKY).catch(() => null);
          if (rec?.detail) learned.push({ step_key: keyOf(idx), kind: 'action', data: rec.detail });
        }
        if (rec?.done) {
          status = rec.skipped ? 'Skipped' : 'Needs review'; classification = null;
          error = `Bước gặp lỗi («${msg}») nên AI xử lý: ${rec.note}`; evidence.note = rec.note; evidence.recovered = true;
          prevT = s.t; await settle();
        } else if (/^NO_DATA/.test(msg)) {
          // Danh sách thật sự không có dữ liệu: không dừng cả luồng; bước sau tự báo nếu thật sự cần dữ liệu đó.
          status = 'Needs review'; classification = null;
          error = 'Danh sách chọn không có dữ liệu (đã thử mở lại, gõ tìm kiếm, nhờ AI). Bỏ qua bước này, các bước sau có thể bị ảnh hưởng.';
        } else {
          status = 'Failed'; classification = 'automation'; halted = true;
          error = msg;
          if (a.text) evidence.candidates = await page.evaluate((t: string) => (window as any).__qaLib.similar(t), a.text).catch(() => []); // trên trang đang có gì gần giống
        }
      }
    }
    await drainToasts();
    const shot = `${shotDir}/${idx}.jpg`;
    if (status !== 'Blocked' && status !== 'Skipped') await page.screenshot({ path: shot, type: 'jpeg', quality: 45 }).then(() => (evidence.shot = shot)).catch(() => undefined);
    const row = { idx, title: s.text, status, classification, error, evidence, durationMs: Date.now() - t0 };
    results.push(row);
    store.addRunStep(runId, row);
  }

  // Xác minh KẾT QUẢ THỰC TẾ (không chỉ "click được"): API ghi + thông báo so với kỳ vọng rút từ bản quay.
  const automationFailed = results.some((r) => r.status === 'Failed' || r.status === 'Blocked');
  const verification = automationFailed
    ? [{ title: 'Xác minh kết quả', status: 'Blocked', classification: null, error: 'Không xác minh được vì luồng dừng giữa chừng.', evidence: {} }]
    : verifyExpected({ expected, observedWrites, observedToasts, params });
  for (const [k, v] of verification.entries()) { const row = { idx: steps.length + k, durationMs: 0, ...v }; results.push(row); store.addRunStep(runId, row); }

  const status = overallStatus(results);
  const testCase = input.testCaseId ? store.getTestCase(input.testCaseId) : null;
  const verdict = automationFailed ? null : verification.find((v: any) => v.title.startsWith('Giả thuyết'))?.status ?? null;
  const ruleChange = applyVerification(store, { flowId, testCase, verdict });
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  // Giao diện đổi nhưng vẫn chạy được → ĐỀ XUẤT phiên bản mới (không tự ghi đè flow đã lưu, không sửa kỳ vọng cho khớp).
  let proposed: number | null = null;
  if (drifts.length && status !== 'Failed') {
    const ver = store.getVersion(flowId, input.version);
    const next = JSON.parse(JSON.stringify(ver.steps));
    for (const d of drifts) next[d.idx].act.sel = d.now;
    proposed = store.proposeVersion(flowId, { steps: next, expected: ver.expected, params: ver.params, analysis: ver.analysis, note: `Đề xuất sau lượt chạy ${runId}: ${drifts.length} phần tử đổi vị trí (chỉ tìm được bằng đường dẫn CSS).` });
  }
  if (learned.length) store.addMemory(flowId, learned); // nhớ lại những gì đã xử lý thành công cho lần chạy sau
  store.finishRun(runId, status, {
    counts, observedWrites, observedToasts, drifts, proposedVersion: proposed, ruleChange,
    failures: results.filter((r) => r.status === 'Failed').map((r) => ({ title: r.title, classification: r.classification, error: r.error })),
    limits: ['Chỉ xác minh qua phản hồi API và thông báo trên giao diện; không đọc database backend nên chưa chứng minh được dữ liệu đã lưu đúng.'],
  });
  console.log(`##RUN|${runId}|${status}`);

  if (status === 'Failed' && process.env.QA_HOLD_ON_FAIL !== '0') {
    console.log('GIỮ CỬA SỔ: dừng đúng màn hình lỗi — thao tác tiếp bằng tay, đóng cửa sổ khi xong.');
    test.setTimeout(0);
    await page.waitForEvent('close', { timeout: 0 }).catch(() => undefined);
  } else if (status !== 'Failed') await hold(page);
  expect(status, `Kết quả lượt chạy: ${status}`).not.toBe('Failed');
});
