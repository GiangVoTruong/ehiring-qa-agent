import { expect, test as setup } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { AUTH_SESSION, AUTH_STATE } from '../flows/common';

setup('đăng nhập Keycloak bằng tài khoản QA', async ({ page, baseURL }) => {
  const { QA_USERNAME, QA_PASSWORD } = process.env;
  if (!QA_USERNAME || !QA_PASSWORD) throw new Error('Thiếu QA_USERNAME / QA_PASSWORD trong .env');

  await page.addInitScript(() => localStorage.setItem('locale', 'en')); // không khôi phục phiên cũ: đây là đăng nhập mới
  await page.goto('/recruitment-requests');

  // App redirect sang Keycloak (id.paas.ttgt.vn/realms/smc-staging).
  await page.locator('#username').fill(QA_USERNAME);
  await page.locator('#password').fill(QA_PASSWORD);
  const [submit] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/login-actions/authenticate')),
    page.locator('#kc-login').click(),
  ]);

  // Thành công: 302 về app. Keycloak trả 200 = vẽ lại trang (sai mật khẩu hoặc đòi OTP).
  if (submit.status() === 200) {
    await page.waitForLoadState();
    if (await page.locator('#otp').count()) throw new Error('Keycloak đòi OTP — cần QA_TOTP_SECRET (task 1.4b)');
    const message = await page.locator('#input-error, .kc-feedback-text').first().innerText();
    throw new Error(`Đăng nhập thất bại: ${message.trim()}`);
  }

  const appUrl = new RegExp(`^${baseURL!.replace(/[.]/g, '\\.')}/(?!auth/)`);
  await expect(page).toHaveURL(appUrl, { timeout: 30_000 });

  await page.context().storageState({ path: AUTH_STATE });
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('0-ehiring'))).toBeTruthy();
  writeFileSync(AUTH_SESSION, await page.evaluate(() => JSON.stringify(sessionStorage)));
});
