import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { AUTH_STATE } from './flows/common';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  testDir: 'tests',
  // Staging dùng DB chung và gửi email/thông báo thật: chạy tuần tự, không retry để không che lỗi.
  workers: 1,
  retries: 0,
  // Web "Chạy luồng" đặt PW_OUTPUT_DIR riêng: lượt chạy khác (VS Code, MCP, terminal) dùng chung `test-results` sẽ xoá file trace giữa chừng → lỗi ENOENT khi đóng trình duyệt.
  outputDir: process.env.PW_OUTPUT_DIR || 'test-results',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'https://shinhanbank.stg.talentx.vn',
    // Chromium đi kèm Playwright không resolve được id.paas.ttgt.vn → dùng Chrome hệ thống.
    channel: 'chrome',
    // Xem thao tác trực tiếp: `set SLOWMO=400&& npx playwright test --headed ...` (mili-giây giữa các thao tác).
    // QA_FULLSCREEN=1 (web đặt khi chạy hiện Chrome): cửa sổ phóng to, trang theo đúng kích thước cửa sổ (không bị cắt 1280x720).
    ...(process.env.QA_FULLSCREEN ? { viewport: null } : {}),
    launchOptions: {
      slowMo: Number(process.env.SLOWMO) || 0,
      ...(process.env.QA_FULLSCREEN ? { args: ['--start-maximized'] } : {}),
    },
    trace: 'retain-on-failure',
    // Chờ một thao tác tối đa 20s thay vì treo tới hết timeout cả test (lần trước một nhãn sai làm treo 6 phút).
    actionTimeout: 20_000,
    screenshot: 'only-on-failure',
  },
  // `e2e` đứng đầu: MCP của agent Playwright (`.mcp.json`) lấy project đầu tiên làm project chính.
  projects: [
    {
      name: 'e2e',
      testIgnore: /[\\/](unit|custom)[\\/]/,
      dependencies: ['setup'],
      use: { storageState: AUTH_STATE },
    },
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    // Quy trình tự soạn từ web: KHÔNG phụ thuộc `setup` (setup mở rồi đóng một trình duyệt riêng để đăng nhập);
    // dùng phiên đã lưu, hết hạn thì đăng nhập ngay trong cùng cửa sổ → chỉ MỘT cửa sổ Chrome suốt lượt chạy.
    { name: 'procedure', testMatch: /custom[\\/](procedure|scratch|replay)\.spec\.ts/, use: { storageState: AUTH_STATE } },
    { name: 'unit', testDir: 'tests/unit' },
    // Chỉ chạy khi user yêu cầu dọn dữ liệu: `npm run cleanup`.
    {
      name: 'cleanup',
      testMatch: /\.cleanup\.ts$/,
      dependencies: ['setup'],
      use: { storageState: AUTH_STATE },
    },
  ],
});
