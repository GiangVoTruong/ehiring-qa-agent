import { expect, type Locator, type Page } from '@playwright/test';
import { QA_PREFIX, addToRegistry, field, forceEnglish, pick } from './common';
import type { CreatedRequest } from './recruitment-requests';

export interface CreatedPlan {
  id: string;
  code: string;
  name: string;
  requestId: string;
}

const dropdown = (page: Page) => page.locator('.ant-select-dropdown:visible');

function qaUser(): string {
  const user = process.env.QA_USERNAME;
  if (!user) throw new Error('Thiếu QA_USERNAME trong .env');
  return user;
}

/** Chọn user trong nz-select tìm phía server: phải gõ từng ký tự rồi chờ đúng dòng, sau đó đóng dropdown. */
async function pickUser(page: Page, select: Locator): Promise<void> {
  const qa = qaUser();
  await select.scrollIntoViewIfNeeded();
  await select.locator('nz-select-top-control').click();
  await select.locator('input').pressSequentially(qa, { delay: 30 });
  await dropdown(page).locator('.ant-select-item-option').filter({ hasText: qa }).first().click();
  await page.keyboard.press('Escape');
  await expect(dropdown(page)).toHaveCount(0);
}

/**
 * Bước 2 "Setup hiring stages": form có sẵn các vòng mặc định nhưng thiếu người.
 *  - Interviewers (Shortlist, Interview…): nz-select người → chọn QA.
 *  - Final approver (Interview, Offer): ô bấm được mở khung "Set up a review process" → Approver = QA → Save.
 *  - "Review Candidate Information": ô tuy ghi "Chọn thành viên" nhưng thực ra chọn loại tài liệu → chọn mục đầu.
 */
async function fillStages(page: Page): Promise<void> {
  const rows = page.locator('tbody tr:visible').filter({ has: page.locator('nz-select') });
  await expect(rows.first()).toBeVisible();

  // Interviewers: các nz-select còn placeholder (dòng Review có ô tài liệu cũng placeholder này → bỏ qua dòng đó)
  const stageRows = rows.filter({ hasNotText: 'Review Candidate Information' });
  for (let guard = 0; guard < 10; guard++) {
    const pending = stageRows.locator('nz-select').filter({ hasText: 'Chọn thành viên' });
    if (!(await pending.count())) break;
    await pickUser(page, pending.first());
  }

  // Dòng Interview: Final approver là nz-select thứ 3 của dòng, bắt buộc, đang rỗng
  const interviews = stageRows.filter({ has: page.locator('nz-select').first().filter({ hasText: /^\s*Interview\s*$/ }) });
  for (let i = 0; i < (await interviews.count()); i++) {
    const approver = interviews.nth(i).locator('nz-select').nth(2);
    if (!(await approver.locator('nz-select-item').count())) await pickUser(page, approver);
  }

  // Final approver / mọi ô "Chọn thành viên" dạng bấm được còn lại
  for (let guard = 0; guard < 10; guard++) {
    const cell = rows.locator('td div[style*="cursor: pointer"]').filter({ hasText: 'Chọn thành viên' });
    if (!(await cell.count())) break;
    await cell.first().scrollIntoViewIfNeeded();
    await cell.first().click();
    const modal = page.locator('.ant-modal:visible').last();
    await pickUser(page, modal.locator('nz-select').first());
    // Modal có lúc chưa kịp nhận người duyệt khi bấm Save lần đầu → bấm lại tới khi đóng.
    await expect(async () => {
      if (await modal.count()) await modal.getByRole('button', { name: /^(Save|Lưu)$/ }).click({ timeout: 3000 });
      await expect(modal).toHaveCount(0, { timeout: 4000 });
    }).toPass({ timeout: 30_000 });
  }

  // Review Candidate Information: chọn loại tài liệu
  const review = rows.filter({ hasText: 'Review Candidate Information' });
  if (await review.count()) {
    const docs = review.first().locator('nz-select').nth(1);
    if ((await docs.innerText()).includes('Chọn thành viên')) {
      await docs.locator('nz-select-top-control').click();
      await dropdown(page).locator('.ant-select-item-option').first().click();
      await page.keyboard.press('Escape');
      await expect(dropdown(page)).toHaveCount(0);
    }
  }
}

/**
 * Ô "Recruitment Request Code" của form tạo kế hoạch (chỉ liệt kê YCTD Open) có đưa ra YCTD này không?
 * Tìm theo hậu tố thời gian trong tên vì ô không tìm được theo mã. Không lưu gì.
 */
export async function requestSelectable(page: Page, request: CreatedRequest): Promise<boolean> {
  await forceEnglish(page);
  await page.goto('/recruitment-plans');
  await page.getByRole('button', { name: 'Create recruitment plan' }).click();
  const select = field(page, 'Recruitment Request Code').locator('nz-select');
  await select.locator('nz-select-top-control').click();
  const search = page.waitForResponse(
    (r) => r.url().includes('/api/recruitment-requests?') && decodeURIComponent(r.url()).includes('"$text"'),
  );
  await select.locator('input').pressSequentially(request.title.split(' ').pop()!, { delay: 30 });
  await (await search).finished();
  await page.waitForTimeout(500);
  return (await dropdown(page).locator('.ant-select-item-option').filter({ hasText: request.code }).count()) > 0;
}

/** Đọc trạng thái kế hoạch từ response GET mà app tự gọi khi mở trang (cùng lý do với recruitment-requests.read). */
export async function read(page: Page, plan: CreatedPlan): Promise<{ status: string; endDate?: string; websites: number }> {
  await forceEnglish(page);
  await page.goto('about:blank');
  const detail = page.waitForResponse(
    (r) => new URL(r.url()).pathname === `/api/recruitment-plans/${plan.id}` && r.request().method() === 'GET',
  );
  await page.goto(`/recruitment-plans/${plan.id}`);
  const body = await (await detail).json();
  return { status: body.status, endDate: body.endDate, websites: (body.websites ?? []).length };
}

/**
 * Chọn hành động ở menu trạng thái của trang kế hoạch rồi xác nhận modal. `reason` chỉ điền khi modal có ô lý do
 * (Đóng: bắt buộc). Trả HTTP status của request ghi tương ứng.
 */
async function act(page: Page, plan: CreatedPlan, item: RegExp, api: RegExp, reason?: string): Promise<number> {
  await forceEnglish(page);
  await page.goto(`/recruitment-plans/${plan.id}`);
  await page.locator('button.plan-status-button').click();
  // Con trỏ còn đứng trên nút → bong bóng gợi ý (ant-popover) che mục menu và chặn cú bấm. Đưa con trỏ ra chỗ trống.
  await page.mouse.move(4, 500);
  await page.waitForTimeout(500);
  const entries = page.locator('.ant-dropdown:visible li');
  await entries.first().waitFor({ timeout: 10_000 });
  const target = entries.filter({ hasText: item }).first();
  if (!(await target.count())) {
    throw new Error(`Menu trạng thái không có mục ${item}; hiện có: ${(await entries.allInnerTexts()).join(' | ')}`);
  }
  await target.click();

  const written = page.waitForResponse(
    (r) => api.test(new URL(r.url()).pathname) && ['PATCH', 'PUT', 'POST'].includes(r.request().method()),
  );
  const modal = page.locator('.ant-modal:visible').last();
  if (await modal.count()) {
    const input = modal.locator('input, textarea').first();
    if (reason !== undefined && (await input.count())) await input.fill(reason);
    await modal.getByRole('button', { name: /Confirm|OK|Agree/ }).click();
  }
  return (await written).status();
}

const planApi = (id: string, tail: string) => new RegExp(`^/api/recruitment-plans/${id}${tail}$`);
export const start = (page: Page, p: CreatedPlan) => act(page, p, /Start/i, planApi(p.id, ''));
// Nhãn menu tiếng Anh (khác tên hành động): tạm dừng = "On hold", đóng = "Closed".
export const pause = (page: Page, p: CreatedPlan) => act(page, p, /On hold/i, planApi(p.id, '/pause'));
export const resume = (page: Page, p: CreatedPlan) => act(page, p, /Continue|Resume/i, planApi(p.id, ''));
export const close = (page: Page, p: CreatedPlan, reason = `${QA_PREFIX} đóng kế hoạch kiểm thử`) =>
  act(page, p, /Closed/i, planApi(p.id, '/close'), reason);
export const extend = (page: Page, p: CreatedPlan, item: RegExp = /1\s*week/i) =>
  act(page, p, item, planApi(p.id, '/extend'));

/** Bước đang hiển thị của wizard: nhấn Continue tới khi `reached` hiện (form có lúc báo "chờ tải xong biểu mẫu"). */
async function continueTo(page: Page, reached: Locator): Promise<void> {
  await expect(async () => {
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(reached).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 40_000 });
}

/**
 * Tạo kế hoạch tuyển dụng từ một YCTD `[QA-AUTO]` đang Open. Người phụ trách (mặc định là người đăng nhập),
 * Interviewers và Final approver đều là tài khoản QA. Không publish (không gắn website) nên không lộ ra portal.
 */
export async function create(page: Page, request: CreatedRequest, name = 'PATD'): Promise<CreatedPlan> {
  await forceEnglish(page);
  await page.goto('/recruitment-plans');
  await page.getByRole('button', { name: 'Create recruitment plan' }).click();

  // Bước 1 — Recruitment information. Ô mã YCTD không tìm được theo mã (xem Nghi bug) → tìm bằng hậu tố thời gian trong tên.
  await pick(page, 'Recruitment Request Code', request.code, request.title.split(' ').pop());
  const planName = `${request.title.split(' ').slice(0, 1)[0]} ${name} ${request.title.split(' ').pop()}`;
  await field(page, 'Recruitment Plan').locator('input').fill(planName);
  await pick(page, 'Job Description', 'Tester');
  await pick(page, 'Talent Pool', 'TA POOL', 'TA POOL');
  await continueTo(page, page.getByText('Receive CVs').first());

  // Bước 2 — Setup hiring stages
  await fillStages(page);

  // Bước 3–5 (Background check, Competency Groups, Setup communication) đều có giá trị mặc định: bấm nút chính
  // ở cuối trang tới khi app gửi POST tạo kế hoạch. Form có lúc báo "chờ tải xong biểu mẫu" nên bấm lặp.
  const saved = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/recruitment-plans' && r.request().method() === 'POST', {
    timeout: 60_000,
  });
  const primary = page.getByRole('button', { name: /^(Continue|Save|Create|Finish|Submit|Complete)/ }).last();
  const clicker = (async () => {
    for (let i = 0; i < 20; i++) {
      await primary.click().catch(() => undefined);
      await page.waitForTimeout(1500);
    }
  })();
  const res = await Promise.race([saved, clicker.then(() => null)]);
  if (!res) throw new Error('Không thấy POST /api/recruitment-plans sau khi bấm hết các bước');
  if (!res.ok()) throw new Error(`Tạo kế hoạch lỗi ${res.status()}: ${await res.text()}`);

  const body = await res.json();
  const created = { id: String(body._id), code: String(body.code), name: planName, requestId: request.id };
  addToRegistry({ flow: 'recruitment-plans', id: created.id, code: created.code, title: planName });
  return created;
}
