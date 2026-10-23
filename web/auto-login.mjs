// Đăng nhập tự động dùng chung cho máy ghi (web) và các luồng chạy lại (flows/, tests/): bấm đúng form (local hoặc SSO) + tự điền mã OTP.
// Một nơi duy nhất: flows/common.ts và flows/totp.ts chỉ re-export từ đây.
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { ROOT } from './config.mjs';

// ---------- TOTP (RFC 6238, SHA-1, 6 số, bước 30 giây — cùng thuật toán với Google Authenticator) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(s) {
  const bits = s.toUpperCase().replace(/[\s=-]/g, '').split('').map((c) => {
    const v = B32.indexOf(c);
    if (v < 0) throw new Error(`Secret TOTP có ký tự không hợp lệ: «${c}»`);
    return v.toString(2).padStart(5, '0');
  }).join('');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
export function totp(secret, now = Date.now(), digits = 6, stepSec = 30) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / stepSec)));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, '0');
}
/** Giây còn lại của mã hiện tại (để chờ sang mã mới khi mã vừa dùng đã bị từ chối vì dùng lại). */
export const secondsLeft = (now = Date.now(), stepSec = 30) => stepSec - (Math.floor(now / 1000) % stepSec);

export const TOTP_FILE = '.auth/totp.json';
/** Secret TOTP theo tên tài khoản: .auth/totp.json {"tài_khoản": "SECRET"} (nằm ngoài git); không có thì QA_TOTP_SECRET trong .env. */
export function totpSecretFor(username, file = TOTP_FILE) {
  const path = isAbsolute(file) ? file : join(ROOT, file);
  try { if (existsSync(path)) { const v = JSON.parse(readFileSync(path, 'utf8'))[username]; if (v) return String(v); } } catch { /* file hỏng: bỏ qua */ }
  return process.env.QA_TOTP_SECRET || undefined;
}

// ---------- Thao tác trên trang đăng nhập ----------
/** Trang đăng nhập của app có nút «Sign in with SSO»: bấm nút đó trước để sang form IdP (#username). Không có nút thì thôi. */
export async function chooseSso(page) {
  const re = /Sign in with SSO|Đăng nhập (bằng|với) SSO/i;
  const sso = page.getByRole('button', { name: re }).or(page.getByRole('link', { name: re })).first();
  const idp = page.locator('#username');
  const which = await Promise.race([
    sso.waitFor({ state: 'visible', timeout: 8000 }).then(() => 'sso', () => 'none'),
    idp.waitFor({ state: 'visible', timeout: 8000 }).then(() => 'idp', () => 'none'),
  ]);
  if (which === 'sso') await sso.click();
}

/**
 * Trang «Xác thực 2 bước» (ô nhập mã 6 số): nếu hiện ra và có secret TOTP thì tự tính mã và xác nhận. Không có trang OTP thì không làm gì.
 * Mã đã dùng ở bước 30 giây hiện tại bị từ chối (chống dùng lại) → chờ sang mã mới rồi thử lại một lần.
 */
export async function submitOtpIfAsked(page, secret) {
  const box = page.locator('#otp, input[autocomplete="one-time-code"], input[placeholder="123456"], input[inputmode="numeric"][maxlength="6"]').first();
  if (!(await box.waitFor({ state: 'visible', timeout: 6000 }).then(() => true, () => false))) return false;
  if (!secret) throw new Error('Trang đòi mã xác thực 2 bước nhưng chưa có secret: đặt QA_TOTP_SECRET trong .env (hoặc totpSecret trong .auth/credentials.json).');
  for (let attempt = 0; attempt < 2; attempt++) {
    if (secondsLeft() < 4) await page.waitForTimeout((secondsLeft() + 1) * 1000); // sắp hết bước: lấy mã của bước kế để khỏi hết hạn giữa chừng
    await box.fill(totp(secret));
    await page.getByRole('button', { name: /Xác nhận|Verify|Submit|Sign in|Đăng nhập/i }).or(page.locator('#kc-login')).first().click();
    if (await box.waitFor({ state: 'hidden', timeout: 8000 }).then(() => true, () => false)) return true;
    await page.waitForTimeout((secondsLeft() + 1) * 1000); // bị từ chối: chờ sang bước 30 giây tiếp theo
  }
  throw new Error('Mã xác thực 2 bước bị từ chối hai lần — kiểm tra secret OTP có đúng của tài khoản này không.');
}

export const hasSession = (page) => page.evaluate(() => !!(localStorage.getItem('ehiring_sso_session_token') || sessionStorage.getItem('0-ehiring'))).catch(() => false);

/**
 * Trang đang ở màn đăng nhập thì đăng nhập (creds: { username, password, totpSecret?, local? }): tài khoản local điền form ngay trên trang của app,
 * tài khoản SSO bấm «Sign in with SSO» rồi điền form Keycloak. Đã có phiên thì không làm gì. Trả true nếu vừa đăng nhập.
 */
export async function signInIfNeeded(page, creds) {
  if (await hasSession(page)) return false;
  if (!creds.local) await chooseSso(page);
  const form = page.locator('#username');
  if (!(await form.waitFor({ timeout: 8000 }).then(() => true, () => false))) return false; // không có form đăng nhập: đang ở trong app
  await form.fill(creds.username);
  await page.locator('#password').fill(creds.password);
  await page.locator('#kc-login').or(page.getByRole('button', { name: /^(Sign in|Đăng nhập)$/ })).first().click();
  await submitOtpIfAsked(page, creds.totpSecret || totpSecretFor(creds.username));
  for (let i = 0; i < 60; i++) { if (await hasSession(page)) return true; await page.waitForTimeout(500); } // chờ app nhận token
  throw new Error('Đăng nhập chưa xong sau 30 giây (sai mật khẩu hoặc mã OTP?).');
}
