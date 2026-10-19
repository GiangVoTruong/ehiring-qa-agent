import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { ensureLoggedIn, hold, runAuth } from '../../flows/common';
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
test.use({ storageState: existsSync(auth.state) ? auth.state : undefined });

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
const params: { values?: Record<string, string>; fallbackFirst?: boolean; omit?: number[]; expectNoWrite?: boolean; allowRisky?: boolean } = input?.params ?? {};

/** Chọn DỮ LIỆU trong danh sách: cuộn danh sách tới khi thấy đúng mục; không thấy thì (tuỳ chọn) lấy mục đầu tiên; để trống = mục đầu tiên. */
async function pickData(page: Page, wanted: string): Promise<string> {
  // Danh sách nạp dữ liệu sau khi mở (hiện "No Data" + biểu tượng quay) → chờ tới khi có mục.
  await expect.poll(() => page.evaluate(() => !!(window as any).__qaLib.firstOption()), { timeout: 20_000, intervals: [500] }).toBe(true).catch(() => undefined);
  await page.waitForTimeout(500);
  if (wanted) {
    for (let i = 0; i < 40; i++) {
      const row = (await page.evaluateHandle((t: string) => (window as any).__qaLib.rowByText(t), wanted)).asElement();
      if (row) { await row.click({ timeout: 10_000 }); return wanted; }
      if (!(await page.evaluate(() => (window as any).__qaLib.scrollListDown()))) break; // hết danh sách
      await page.waitForTimeout(400);
    }
    if (!params.fallbackFirst) throw new Error(`Không thấy dữ liệu «${wanted}» trong danh sách (đã cuộn hết). Đổi dữ liệu hoặc bật "chọn mục đầu tiên nếu không thấy".`);
  }
  await page.evaluate(() => { const l = (window as any).__qaLib; const b = document.querySelector('cdk-virtual-scroll-viewport'); if (b) b.scrollTop = 0; return l; });
  await page.waitForTimeout(500);
  const first = (await page.evaluateHandle(() => (window as any).__qaLib.firstOption())).asElement();
  if (!first) throw new Error('Danh sách chọn đang trống, không có dữ liệu để chọn.');
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

  const observedWrites: { method: string; path: string; status: number }[] = [];
  const observedToasts: { kind: string; text: string }[] = [];
  page.on('response', (res) => {
    const q = res.request();
    if (!res.url().includes('/api/') || /monitoring\/traces/.test(res.url())) return;
    const path = normPath(new URL(res.url()).pathname.replace(/^\/api/, ''));
    if (isWriteApi(q.method(), path)) observedWrites.push({ method: q.method(), path, status: res.status() });
  });
  const drainToasts = async () => { const t = await page.evaluate(() => (window as any).__qaToasts.splice(0)).catch(() => []); observedToasts.push(...t); };

  const omit = new Set<number>(params.omit ?? []);
  const isLogin: boolean[] = loginFlags(steps.map((s: any) => ({ ...s.act, url: s.url }))); // chuỗi đăng nhập (kể cả mã xác nhận) đã được làm trước khi chạy
  const results: any[] = [];
  const drifts: any[] = [];
  let halted = false;
  let prevT = 0;

  await ensureLoggedIn(page, '/dashboard', auth);
  for (const [idx, s] of steps.entries()) {
    const a = s.act;
    const t0 = Date.now();
    let status = 'Passed', error: string | null = null, classification: string | null = null;
    const evidence: any = {};
    if (halted) { status = 'Blocked'; error = 'Không chạy vì một bước trước đã lỗi / bị chặn.'; }
    else if (omit.has(idx)) { status = 'Skipped'; error = 'Bỏ qua có chủ đích theo test case (kiểm tra thiếu dữ liệu).'; }
    else if (RISKY.test(s.text) && !params.allowRisky) { status = 'Blocked'; classification = 'policy'; error = 'Hành động khó đảo ngược / ra ngoài hệ thống — không tự chạy. Cần xác nhận riêng.'; halted = true; }
    else if (isLogin[idx]) { status = 'Skipped'; error = 'Đăng nhập đã được làm trước khi chạy nên bỏ qua bước này.'; }
    else if (a.secret || a.value === '***') { status = 'Needs review'; error = 'Giá trị nhạy cảm không được lưu khi quay — cần nhập tay hoặc cấu hình riêng.'; }
    else {
      try {
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
          } else if (a.type === 'click' && a.dataChoice) {
            const wanted = params.values && idx in params.values ? params.values[idx] : a.text;
            evidence.chosen = await pickData(page, wanted);
            console.log(`Dữ liệu bước ${idx + 1}: «${evidence.chosen}»`);
          } else if (a.type === 'click' && a.menu && a.text && !a.menuToggle) {
            await clickMenu(page, a);
            evidence.how = 'menu';
          } else if (a.menuToggle) {
            // Chỉ bấm nút thu/mở khi menu đang ở trạng thái trước-lúc-quay → sau khi bấm sẽ giống lúc quay.
            const collapsed = (await page.locator('nz-sider.ant-layout-sider-collapsed').count()) > 0;
            if (collapsed === !!a.siderCollapsed) await page.locator('.trigger-button').first().click();
          } else {
            let el: any = null;
            let tries = 0;
            await expect.poll(async () => {
              el = (await page.evaluateHandle((x: any) => (window as any).__qaLib.resolve(x), a)).asElement();
              if (!el && a.type === 'click' && a.text && a.menu !== false && tries++ % 3 === 2) await revealMenuItem(page, a);
              return !!el;
            }, { timeout: 20_000, intervals: [500], message: `Không tìm thấy phần tử: ${s.text}` }).toBe(true);
            evidence.how = await page.evaluate(() => (window as any).__qaLib.how());
            if (evidence.how === 'sel') drifts.push({ idx, old: a.sel, now: await el.evaluate((e: any) => (window as any).__qaLib.pathOf(e)) });
            if (a.type === 'click') {
              await el.scrollIntoViewIfNeeded().catch(() => undefined);
              await el.click({ timeout: 15_000 });
            } else if (a.type === 'file') {
              const name = String(a.value).split(',')[0].trim();
              await el.setInputFiles(existsSync(`fixtures/${name}`) ? `fixtures/${name}` : 'fixtures/qa-photo.png');
            } else {
              await el.fill(String(params.values && idx in params.values ? params.values[idx] : a.value ?? ''));
              if (a.enter) await page.keyboard.press('Enter');
            }
          }
          prevT = s.t;
          await page.waitForLoadState('domcontentloaded').catch(() => undefined);
          await page.waitForTimeout(700);
        });
        if (evidence.how === 'sel') { status = 'Needs review'; error = 'Phần tử chỉ tìm được bằng đường dẫn CSS (cách cuối cùng) — giao diện có thể đã đổi; xem đề xuất cập nhật.'; }
        else if (a.type === 'nav' && evidence.note) status = 'Skipped';
      } catch (e) {
        status = 'Failed'; classification = 'automation'; halted = true;
        error = String((e as Error).message).split('\n')[0].slice(0, 300);
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
    proposed = store.addVersion(flowId, { steps: next, expected: ver.expected, params: ver.params, analysis: ver.analysis, note: `Đề xuất sau lượt chạy ${runId}: ${drifts.length} phần tử đổi vị trí (chỉ tìm được bằng đường dẫn CSS).` });
  }
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
