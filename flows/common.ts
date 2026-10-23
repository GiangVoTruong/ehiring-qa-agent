import { expect, type Locator, type Page } from '@playwright/test';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
// @ts-ignore — module .mjs không có kiểu
import { TOTP_FILE as _TOTP_FILE, chooseSso as _chooseSso, submitOtpIfAsked as _submitOtp, totpSecretFor as _totpSecretFor } from '../web/auto-login.mjs';

/** Tiền tố đặt tên mọi bản ghi do bộ test tạo (để dọn đúng thứ mình tạo, không đụng dữ liệu thật). */
export const QA_PREFIX = '[AUTOTEST]';
/** Tiền tố của dữ liệu đã tạo trước khi đổi tên: vẫn nhận ra để dọn / dùng lại, nhưng KHÔNG dùng khi đặt tên mới. */
export const LEGACY_PREFIXES = ['[QA-AUTO]'];
export const isTestTitle = (title: string) => [QA_PREFIX, ...LEGACY_PREFIXES].some((p) => title.startsWith(p));
export const REGISTRY_FILE = '.qa-registry.json';
export const AUTH_STATE = '.auth/state.json';
/** Token OIDC của app nằm ở sessionStorage — storageState không lưu, nên setup ghi riêng ra file này. */
export const AUTH_SESSION = '.auth/session.json';
/** Tài khoản do tester tự nhập khi quay (hệ thống ghi nhớ) — tách khỏi phiên của tài khoản QA trong .env để không làm lệch các luồng cũ. */
export const CREDENTIALS_FILE = '.auth/credentials.json';
export const USER_STATE = '.auth/user-state.json';
export const USER_SESSION = '.auth/user-session.json';

// Đăng nhập tự động (TOTP, chọn SSO, điền mã 2 bước) nằm ở web/auto-login.mjs để máy ghi của web dùng chung.
export const TOTP_FILE: string = _TOTP_FILE;
export const totpSecretFor: (username: string, file?: string) => string | undefined = _totpSecretFor;
export const chooseSso: (page: Page) => Promise<void> = _chooseSso;
export const submitOtpIfAsked: (page: Page, secret?: string) => Promise<boolean> = _submitOtp;
export interface Credentials { username: string; password: string; source: 'saved' | 'env'; totpSecret?: string; local?: boolean }
/** Ưu tiên tài khoản đã nhớ lúc quay; không có thì dùng QA_USERNAME / QA_PASSWORD trong .env. */
export function loadCredentials(file = CREDENTIALS_FILE): Credentials {
  if (existsSync(file)) {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    if (j.username && j.password) return { username: j.username, password: j.password, source: 'saved', totpSecret: j.totpSecret || totpSecretFor(j.username), local: j.local === true };
  }
  const { QA_USERNAME, QA_PASSWORD } = process.env;
  if (!QA_USERNAME || !QA_PASSWORD) throw new Error('Chưa có tài khoản: hãy quay một luồng và nhập tài khoản ở màn hình đăng nhập, hoặc đặt QA_USERNAME / QA_PASSWORD trong .env');
  return { username: QA_USERNAME, password: QA_PASSWORD, source: 'env', totpSecret: totpSecretFor(QA_USERNAME), local: process.env.QA_LOGIN_LOCAL === '1' };
}
export interface RunAuth { state: string; session: string; creds: Credentials }
/** Phiên + tài khoản dùng khi chạy lại flow đã quay: của tester nếu đã nhớ, ngược lại của tài khoản QA. */
export function runAuth(file = CREDENTIALS_FILE): RunAuth {
  const saved = existsSync(file);
  return { state: saved ? USER_STATE : AUTH_STATE, session: saved ? USER_SESSION : AUTH_SESSION, creds: loadCredentials(file) };
}

export interface RegistryEntry {
  flow: string;
  id: string;
  title: string;
  code?: string;
  createdAt: string;
}

/**
 * Chuẩn bị trang trước page.goto: ép UI tiếng Anh (app đọc localStorage `locale`, mặc định `vi`) và khôi phục
 * sessionStorage đăng nhập. Không khôi phục thì mở thẳng trang sâu (vd chi tiết YCTD) có lúc gọi API trước khi
 * đăng nhập lại xong → 401 → màn "Back to Login Screen".
 */
export async function forceEnglish(page: Page, sessionFile = AUTH_SESSION): Promise<void> {
  const session = existsSync(sessionFile) ? readFileSync(sessionFile, 'utf8') : '{}';
  await page.addInitScript(
    ({ session, host }) => {
      if (location.host !== host) return; // bỏ qua trang Keycloak
      localStorage.setItem('locale', 'en');
      if (!sessionStorage.length) for (const [k, v] of Object.entries(JSON.parse(session))) sessionStorage.setItem(k, v as string);
    },
    { session, host: new URL(process.env.BASE_URL || 'https://shinhanbank.stg.talentx.vn').host },
  );
}

// --- Dynamic form (ehiring-dynamic-form): DOM không có `name`, mỗi trường là một khối lá có nhãn riêng.
const FIELD_BLOCK = 'div[ehiringnoderefvar="element"]:not(:has(div[ehiringnoderefvar="element"]))';

/** Khối trường theo nhãn hiển thị (khớp chính xác). */
export function field(page: Page, label: string): Locator {
  return page
    .locator(FIELD_BLOCK)
    .filter({ has: page.locator('ehiring-section span span').getByText(label, { exact: true }) });
}

/** Chọn một lựa chọn trong nz-select; `search` để gõ tìm (ô user tìm phía server). */
export async function pick(page: Page, label: string, option: string | RegExp, search?: string): Promise<void> {
  const select = field(page, label).locator('nz-select');
  await select.locator('nz-select-top-control').click();
  if (search) await select.locator('input').fill(search);
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: option }).first().click();
  if ((await select.getAttribute('class'))?.includes('ant-select-multiple')) await page.keyboard.press('Escape');
}

/** Bỏ mọi lựa chọn đang có của nz-select chọn nhiều (vd TA Admin điền sẵn người thật). */
export async function clearMulti(page: Page, label: string): Promise<void> {
  const remove = field(page, label).locator('.ant-select-selection-item-remove');
  while (await remove.count()) await remove.first().click();
}

/** Giữ cửa sổ trình duyệt mở thêm `HOLD_MS` mili-giây ở cuối test để user xem (mặc định 0 = không giữ). */
export async function hold(page: Page, ms = Number(process.env.HOLD_MS) || 0): Promise<void> {
  if (ms) await page.waitForTimeout(ms);
}

/** Tên bản ghi test: tiền tố để nhận diện + hậu tố thời gian tới ms để không trùng. */
export function qaTitle(name: string, now = new Date()): string {
  return `${QA_PREFIX} ${name} ${now.toISOString().replace(/\D/g, '')}`;
}

/** Registry dạng JSON Lines: mỗi lần ghi nối thêm một dòng, không bao giờ ghi đè. */
export function addToRegistry(entry: Omit<RegistryEntry, 'createdAt'>, file = REGISTRY_FILE): void {
  appendFileSync(file, JSON.stringify({ ...entry, createdAt: new Date().toISOString() }) + '\n');
}

export function readRegistry(file = REGISTRY_FILE): RegistryEntry[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** Bỏ các bản ghi đã dọn khỏi registry (chỉ dùng sau cleanup). */
export function removeFromRegistry(ids: string[], file = REGISTRY_FILE): void {
  const keep = readRegistry(file).filter((e) => !ids.includes(e.id));
  writeFileSync(file, keep.map((e) => JSON.stringify(e) + '\n').join(''));
}

/** Bản ghi được phép dọn: vừa do mình tạo (có trong registry) vừa còn tiền tố. */
export function cleanupCandidates<T extends { id: string; title: string }>(records: T[], registry: RegistryEntry[]): T[] {
  const ids = new Set(registry.map((e) => e.id));
  return records.filter((r) => ids.has(r.id) && isTestTitle(r.title));
}

/** Phiên hết hạn → đăng nhập Keycloak ngay trong cửa sổ đang mở (không mở/đóng trình duyệt khác), rồi lưu lại phiên. */
export async function ensureLoggedIn(page: Page, path = '/dashboard', auth: RunAuth = { state: AUTH_STATE, session: AUTH_SESSION, creds: loadCredentials('.auth/none.json') }): Promise<void> {
  await forceEnglish(page, auth.session);
  await page.goto(path);
  if (await page.evaluate(() => !!(localStorage.getItem('ehiring_sso_session_token') || sessionStorage.getItem('0-ehiring'))).catch(() => false)) return; // phiên còn hạn: khỏi chờ trang đăng nhập
  if (!auth.creds.local) await chooseSso(page); // tài khoản local: form đăng nhập nằm ngay trên trang của app, không qua Keycloak
  const loginForm = page.locator('#username');
  if (!(await loginForm.waitFor({ timeout: 8000 }).then(() => true, () => false))) return;
  await loginForm.fill(auth.creds.username);
  await page.locator('#password').fill(auth.creds.password);
  await page.locator('#kc-login').or(page.getByRole('button', { name: /^(Sign in|Đăng nhập)$/ })).first().click();
  await submitOtpIfAsked(page, auth.creds.totpSecret);
  await expect(page.locator('#username')).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => !!(localStorage.getItem('ehiring_sso_session_token') || sessionStorage.getItem('0-ehiring'))), { timeout: 30_000 }).toBe(true); // token SSO mới ở localStorage, OIDC cũ ở sessionStorage
  await page.context().storageState({ path: auth.state });
  writeFileSync(auth.session, await page.evaluate(() => JSON.stringify(sessionStorage)));
}
