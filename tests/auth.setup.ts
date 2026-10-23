import { expect, test as setup } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { AUTH_SESSION, AUTH_STATE, loadCredentials } from '../flows/common';
// @ts-ignore — module .mjs dùng chung với máy ghi của web (không có kiểu)
import { signInIfNeeded } from '../web/auto-login.mjs';

// Đăng nhập tài khoản QA trong .env (SSO hoặc local, kèm mã OTP) bằng đúng đoạn đăng nhập mà máy ghi và bộ chạy lại dùng.
setup('đăng nhập bằng tài khoản QA', async ({ page, baseURL }) => {
  const { QA_USERNAME, QA_PASSWORD } = process.env;
  if (!QA_USERNAME || !QA_PASSWORD) throw new Error('Thiếu QA_USERNAME / QA_PASSWORD trong .env');
  const creds = loadCredentials('.auth/none.json'); // luôn lấy từ .env (không dùng tài khoản tester đã nhớ)

  await page.addInitScript(() => localStorage.setItem('locale', 'en')); // không khôi phục phiên cũ: đây là đăng nhập mới
  await page.goto('/recruitment-requests');
  await signInIfNeeded(page, creds);

  const appUrl = new RegExp(`^${baseURL!.replace(/[.]/g, '\\.')}/(?!auth/)`);
  await expect(page).toHaveURL(appUrl, { timeout: 30_000 });
  await page.context().storageState({ path: AUTH_STATE });
  writeFileSync(AUTH_SESSION, await page.evaluate(() => JSON.stringify(sessionStorage)));
});
