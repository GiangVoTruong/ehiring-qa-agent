import { test as base } from '@playwright/test';
import { ensureLoggedIn } from './common';

/** `test` cho các luồng e2e: đăng nhập (nếu phiên hết hạn) ngay trong cửa sổ đang chạy, không mở thêm một Chrome riêng chỉ để đăng nhập. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await ensureLoggedIn(page);
    await use(page);
  },
});
export { expect } from '@playwright/test';
