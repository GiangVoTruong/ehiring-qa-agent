// Một nơi duy nhất cho TOTP + đăng nhập tự động: web/auto-login.mjs (dùng chung với máy ghi của web).
// @ts-ignore — module .mjs không có kiểu
import { secondsLeft as _secondsLeft, totp as _totp } from '../web/auto-login.mjs';

/** Mã TOTP (RFC 6238, SHA-1, 6 số, bước 30 giây) — cùng thuật toán với Google Authenticator. */
export const totp: (secret: string, now?: number, digits?: number, stepSec?: number) => string = _totp;
/** Giây còn lại của mã hiện tại. */
export const secondsLeft: (now?: number, stepSec?: number) => number = _secondsLeft;
