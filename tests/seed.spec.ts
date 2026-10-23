import { expect, test } from '../flows/test';
import { forceEnglish } from '../flows/common';

// Seed cho agent planner/generator (trang bắt đầu của mọi kịch bản) và đồng thời là smoke test đăng nhập.
test('seed: đã đăng nhập, mở danh sách YCTD, UI tiếng Anh', async ({ page }) => {
  await forceEnglish(page); // ép tiếng Anh + khôi phục phiên đăng nhập (.auth/session.json)
  const list = page.waitForResponse((r) => r.url().includes('/api/recruitment-requests') && r.request().method() === 'GET');
  await page.goto('/recruitment-requests');

  expect((await list).status()).toBe(200);
  await expect(page.getByText('List of Recruitment Requests')).toBeVisible();
});
