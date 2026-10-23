import { expect, test } from '@playwright/test';
import { aiRecover } from '../../flows/ai';

const RISKY = /delete|xoá|xóa|remove|send onboarding email/i;
const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; delete process.env.QA_AI_CLI; delete process.env.QA_AI_MAX_RECOVER; });

/** Model giả: đọc danh sách phần tử trong yêu cầu rồi chọn phần tử có chữ `want` và trả hành động `action`. */
function fakeModel(want: RegExp, action: string, extra: Record<string, unknown> = {}) {
  let calls = 0;
  globalThis.fetch = (async (_u: any, init: any) => {
    calls++;
    const body = JSON.parse(String(init.body));
    const text = body.messages[0].content.find((c: any) => c.type === 'text').text;
    const list = JSON.parse(text).phanTuTrenTrang as { i: number; text: string; label: string }[];
    const hit = list.find((c) => want.test(`${c.text} ${c.label}`));
    return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ action, index: hit?.i, reason: 'thử phần tử khác cùng mục đích', confidence: 0.9, ...extra }) }] }), { status: 200 });
  }) as any;
  return () => calls;
}

const HTML = `<div class="ant-modal"><p>Chọn chi nhánh</p><div class="ant-select-dropdown"><div class="ant-select-item-option" id="o1" onclick="document.title='opt1'">Chi nhánh Hà Nội</div></div>
<button id="save" onclick="document.title='saved'">Lưu thay đổi</button><button id="del" onclick="document.title='deleted'">Delete all</button></div>`;

test('bước lỗi: AI chọn phần tử khác cùng mục đích và bấm', async ({ page }) => {
  process.env.ANTHROPIC_API_KEY = 'k';
  await page.setContent(HTML);
  fakeModel(/Lưu/, 'click');
  const r = await aiRecover(page, { type: 'click', text: 'Save', title: 'Bấm «Save»' }, 'Không tìm thấy phần tử', RISKY);
  expect(r?.done).toBe(true);
  expect(r?.note).toContain('click');
  expect(await page.title()).toBe('saved');
});

test('danh sách chọn có mục: AI chọn một mục (pick_option)', async ({ page }) => {
  process.env.ANTHROPIC_API_KEY = 'k';
  await page.setContent(HTML);
  fakeModel(/Hà Nội/, 'pick_option');
  const r = await aiRecover(page, { type: 'click', text: 'Chi nhánh cũ', title: 'Chọn dữ liệu «Chi nhánh cũ»' }, 'NO_DATA: danh sách chọn không có mục nào', RISKY);
  expect(r?.done).toBe(true);
  expect(await page.title()).toBe('opt1');
});

test('AI đề xuất nút nguy hiểm thì không bấm và coi như không xử lý được', async ({ page }) => {
  process.env.ANTHROPIC_API_KEY = 'k';
  await page.setContent(HTML);
  fakeModel(/Delete/, 'click');
  const r = await aiRecover(page, { type: 'click', text: 'Save', title: 'Bấm «Save»' }, 'Không tìm thấy phần tử', RISKY);
  expect(r).toBeNull();
  expect(await page.title()).not.toBe('deleted');
});

test('AI nói bỏ qua (skip) thì trả skipped; độ chắc thấp thì không làm gì', async ({ page }) => {
  process.env.ANTHROPIC_API_KEY = 'k';
  await page.setContent(HTML);
  fakeModel(/./, 'skip');
  expect((await aiRecover(page, { type: 'click', text: 'x', title: 'x' }, 'lỗi', RISKY))?.skipped).toBe(true);
  fakeModel(/Lưu/, 'click', { confidence: 0.2 });
  expect(await aiRecover(page, { type: 'click', text: 'x', title: 'x' }, 'lỗi', RISKY)).toBeNull();
});

test('giới hạn số lần AI xử lý mỗi lượt chạy', async ({ page }) => {
  process.env.ANTHROPIC_API_KEY = 'k'; process.env.QA_AI_MAX_RECOVER = '1';
  await page.setContent(HTML);
  const calls = fakeModel(/Lưu/, 'click');
  // module đã dùng vài lần ở các test trước trong cùng tiến trình: đặt giới hạn bằng 1 thì mọi lần sau đều bị chặn, không gọi thêm model
  const before = calls();
  await aiRecover(page, { type: 'click', text: 'x', title: 'x' }, 'lỗi', RISKY);
  await aiRecover(page, { type: 'click', text: 'x', title: 'x' }, 'lỗi', RISKY);
  expect(calls() - before).toBeLessThanOrEqual(1);
});

test('không bật AI thì không làm gì', async ({ page }) => {
  await page.setContent(HTML);
  expect(await aiRecover(page, { type: 'click', text: 'x', title: 'x' }, 'lỗi', RISKY)).toBeNull();
});
