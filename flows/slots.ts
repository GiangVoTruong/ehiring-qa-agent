import type { Page } from '@playwright/test';

// Khung giờ phỏng vấn dạng nút «08:30 – 09:30»: khung đã quay có thể không còn hoặc bị bận ("Clash! … busy") → chọn khung khác còn trống.
export const SLOT = /^\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}$/;
export const slotTexts = (page: Page): Promise<string[]> => page.evaluate(() => {
  const vis = (e: Element) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const re = /^\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}$/;
  return [...document.querySelectorAll('nz-modal-container button, .ant-modal button, [role=dialog] button')]
    .filter((b) => vis(b) && re.test((b as HTMLElement).innerText.replace(/\s+/g, ' ').trim()) && !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true' && !/disabled/.test(b.className))
    .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
});
export const clickSlot = async (page: Page, text: string) => { await page.locator('nz-modal-container button, .ant-modal button, [role=dialog] button').filter({ hasText: text }).first().click({ timeout: 5000 }); };
export const hasClash = (page: Page): Promise<boolean> => page.evaluate(() => /Clash!/i.test(document.body.innerText));

/** Sau khi chọn một khung giờ: nếu hộp báo bận ("Clash!") thì lần lượt thử khung khác tới khi hết báo. Trả khung giờ cuối cùng đã chọn (hoặc null nếu không phải đổi). */
export async function resolveClash(page: Page, current: string): Promise<string | null> {
  const tried = new Set<string>([current]);
  let last: string | null = null;
  for (let k = 0; k < 8; k++) {
    await page.waitForTimeout(500);
    if (!(await hasClash(page))) break;
    const next = (await slotTexts(page)).find((t) => !tried.has(t));
    if (!next) break;
    tried.add(next); await clickSlot(page, next); last = next;
  }
  return last;
}
