import { expect, test } from '@playwright/test';
import { hasClash, resolveClash, slotTexts } from '../../flows/slots';

// Hộp thoại giả: 3 khung giờ, bấm 08:30 thì hiện "Clash!" (bận), bấm khung khác thì hết báo; 10:30 đang bị khoá.
const HTML = `
<div class="ant-modal">
  <div id="msg"></div>
  <button id="a" onclick="msg.textContent='Clash! 1 of the people or rooms are busy'">08:30 – 09:30</button>
  <button id="b" onclick="msg.textContent=''">09:30 – 10:30</button>
  <button id="c" disabled>10:30 – 11:30</button>
  <button id="d" class="ant-btn-disabled">11:30 – 12:30</button>
</div>`;

test('liệt kê khung giờ còn bấm được, bỏ khung bị khoá', async ({ page }) => {
  await page.setContent(HTML);
  expect(await slotTexts(page)).toEqual(['08:30 – 09:30', '09:30 – 10:30']);
});

test('khung giờ bận (Clash!) thì tự đổi sang khung khác tới khi hết báo', async ({ page }) => {
  await page.setContent(HTML);
  await page.locator('#a').click();
  expect(await hasClash(page)).toBe(true);
  expect(await resolveClash(page, '08:30 – 09:30')).toBe('09:30 – 10:30');
  expect(await hasClash(page)).toBe(false);
});

test('không báo bận thì giữ nguyên khung giờ đã chọn', async ({ page }) => {
  await page.setContent(HTML);
  await page.locator('#b').click();
  expect(await resolveClash(page, '09:30 – 10:30')).toBeNull();
});
