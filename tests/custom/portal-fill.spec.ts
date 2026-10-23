import { test } from '@playwright/test';
import { fillPortalForm } from '../../flows/offer';

// Mở link form «Bổ sung thông tin» do web truyền vào (QA_PORTAL_URL) và điền dữ liệu giả lập giống thật.
// Cổng ứng viên không cần đăng nhập. QA_PORTAL_SUBMIT=1: tự bấm «Xác nhận gửi»; ngược lại dừng để người dùng kiểm tra và tự gửi.
const url = process.env.QA_PORTAL_URL;
const submit = process.env.QA_PORTAL_SUBMIT === '1';
test.use({ storageState: undefined });
test.describe.configure({ timeout: 900_000 });

test('Điền form Bổ sung thông tin từ link', async ({ page }) => {
  test.skip(!url, 'Thiếu QA_PORTAL_URL');
  await test.step('Mở link form', async () => { await page.goto(url!, { waitUntil: 'domcontentloaded' }); });
  await fillPortalForm(page, { submit, steps: true }); // mỗi mục trên form là một bước
  if (submit) await test.step('Gửi hồ sơ', async () => { await page.waitForTimeout(2_000); });
  else await test.step('Chờ bạn kiểm tra và tự gửi (đóng cửa sổ khi xong)', async () => { await page.waitForEvent('close', { timeout: 840_000 }).catch(() => undefined); });
});
