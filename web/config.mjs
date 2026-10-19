// Cấu hình dùng chung cho web (đọc .env một lần).
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
export const PORT = Number(process.env.WEB_PORT) || 4310;
export const BASE_URL = process.env.BASE_URL || 'https://shinhanbank.stg.talentx.vn';
export const AUTH_STATE = join(ROOT, '.auth/state.json');
export const AUTH_SESSION = join(ROOT, '.auth/session.json');
// Tài khoản tester nhập khi quay: nhớ lại để quay/chạy lại các lần sau (chỉ nằm trên máy này, .auth/ không đưa lên git).
export const CRED_FILE = join(ROOT, '.auth/credentials.json');
export const USER_STATE = join(ROOT, '.auth/user-state.json');
export const USER_SESSION = join(ROOT, '.auth/user-session.json');
export const KNOWLEDGE = process.env.KNOWLEDGE_DIR ? resolve(process.env.KNOWLEDGE_DIR) : join(ROOT, 'knowledge');
export const ALLOWED_HOST = /(^|\.)stg\.(ehiring\.com\.vn|talentx\.vn)$/; // chỉ staging eHiring — tránh dùng phiên QA ở nơi khác
