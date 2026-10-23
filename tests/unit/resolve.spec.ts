import { expect, test } from '@playwright/test';
// @ts-ignore — module .mjs dùng chung với web
import { makeLib } from '../../web/qa-lib.mjs';

// Trang giả giống danh sách kế hoạch: bảng + bộ chọn «15 / page» nằm trong một khối form động có nhãn "15 / page".
const HTML = `
<main>
  <table><tbody>
    <tr><td>Kế hoạch A</td></tr><tr><td>Kế hoạch B</td></tr>
  </tbody></table>
  <div ehiringnoderefvar="size"><ehiring-section><span><span>15 / page</span></span></ehiring-section><div class="ant-select" id="pagesize">15 / page</div></div>
</main>`;

test('dòng trong bảng không còn bị nhầm với ô chọn «15 / page» khi không thấy chữ của dòng', async ({ page }) => {
  await page.setContent(HTML);
  await page.evaluate(`window.__l = (${makeLib})()`);
  // Bước đã quay: bấm dòng «[DEMO] PATD…» (không còn trên trang này), nhãn trường bị gắn nhầm "15 / page", đường dẫn nằm trong bảng.
  const step = { type: 'click', text: '[DEMO] PATD Giao dịch viên 60 2', field: '15 / page', sel: 'main > table > tbody > tr:nth-of-type(4) > td:nth-of-type(1)' };
  const found = await page.evaluate((s) => { const e = (window as any).__l.resolve(s); return e ? (e as HTMLElement).id || e.tagName : null; }, step);
  expect(found).not.toBe('pagesize'); // trước đây trả về ô chọn số dòng → bấm nhầm
  expect(found).toBeNull(); // không có dòng thứ 4 → không tìm thấy, để bước dự phòng (AI/báo lỗi) xử lý
});

test('ô chọn thật (ngoài bảng) vẫn tìm được theo nhãn trường khi chữ đã đổi', async ({ page }) => {
  await page.setContent(HTML.replace('</main>', '<div ehiringnoderefvar="st"><ehiring-section><span><span>Trạng thái</span></span></ehiring-section><div class="ant-select" id="status">Mới</div></div></main>'));
  await page.evaluate(`window.__l = (${makeLib})()`);
  const found = await page.evaluate((s) => { const e = (window as any).__l.resolve(s); return e ? (e as HTMLElement).id : null; }, { type: 'click', text: 'Chữ cũ đã đổi', field: 'Trạng thái', sel: '' });
  expect(found).toBe('status');
});
