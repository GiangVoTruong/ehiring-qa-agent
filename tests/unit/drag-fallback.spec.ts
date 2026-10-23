import { expect, test } from '@playwright/test';
// @ts-ignore — module .mjs dùng chung với web
import { makeLib } from '../../web/qa-lib.mjs';

// Cột nguồn còn 2 thẻ khác; thẻ đã quay (thẻ thứ nhất) không còn. Cùng đoạn tìm thẻ cùng cột như bộ chạy lại dùng.
const HTML = `
<main>
  <div class="col" id="c1"><div class="cdk-drag" id="b">Ứng viên B</div><div class="cdk-drag" id="c">Ứng viên C</div></div>
  <div class="col" id="c2"></div>
</main>`;

test('thẻ đã quay không còn: lấy thẻ khác trong cùng cột', async ({ page }) => {
  await page.setContent(HTML);
  await page.evaluate(`window.__qaLib = (${makeLib})()`);
  const recorded = await page.evaluate(() => (window as any).__qaLib.pathOf(document.getElementById('b')!)); // đường dẫn của thẻ từng có ở vị trí đầu
  const parent = recorded.split(' > ').slice(0, -1).join(' > ');
  const id = await page.evaluate((p: string) => {
    const vis = (e: Element) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const f = [...document.querySelectorAll('[cdkdrag], .cdk-drag, [draggable=true]')].filter(vis).find((c) => (window as any).__qaLib.pathOf(c).startsWith(p));
    return f ? f.id : null;
  }, parent);
  expect(id).toBe('b'); // thẻ đầu còn lại trong cột nguồn (không phải cột đích c2)
});
