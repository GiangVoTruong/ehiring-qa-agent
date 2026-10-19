import { expect, type Page } from '@playwright/test';
import { QA_PREFIX, addToRegistry, clearMulti, field, forceEnglish, pick, qaTitle } from './common';

export interface CreatedRequest {
  id: string;
  code: string;
  title: string;
}

function qaUser(): string {
  const user = process.env.QA_USERNAME;
  if (!user) throw new Error('Thiếu QA_USERNAME trong .env');
  return user;
}

/**
 * Tạo YCTD qua wizard 3 bước. Mọi người liên quan (Line Manager, TA Admin, Approver) là tài khoản QA.
 * Đơn vị ONCE › Cụm Once › Khối Once › Phòng Once (Team để trống) vì đây là đơn vị có định biên trên staging —
 * thiếu định biên thì bước 2 chặn bằng lỗi "Phải là số dương". Chọn North + Increase ⇒ mã `NI<YY><NNN>`.
 */
export async function create(page: Page, name = 'YCTD'): Promise<CreatedRequest> {
  const qa = qaUser();
  const title = qaTitle(name);
  await forceEnglish(page);
  await page.goto('/recruitment-requests/create');

  // Bước 1 — Basic Information
  await field(page, 'Recruitment Request').locator('input').fill(title);
  await pick(page, 'Area', 'North');
  await pick(page, 'Line Manager', qa, qa);
  await pick(page, 'Head Office / Business Unit', 'ONCE');
  await pick(page, 'Cluster', 'Cụm Once');
  await pick(page, 'Division / Region', 'Khối Once');
  // Nhãn đổi theo phiên bản form: bản cũ có đuôi "/ Transaction Office", bản mới rút gọn.
  const deptLabel = (await field(page, 'Department / Center / Branch / Transaction Office').count()) ? 'Department / Center / Branch / Transaction Office' : 'Department / Center / Branch';
  await pick(page, deptLabel, 'Phòng Once');
  await clearMulti(page, 'Recruitment Administrator (TA Admin)'); // điền sẵn người thật
  await pick(page, 'Recruitment Administrator (TA Admin)', qa, qa);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Bước 2 — Job Information
  await pick(page, 'Workplace', 'Office 127');
  await pick(page, 'Job title', 'Product Technical');
  await pick(page, 'Maximum Job Grade', 'J1');
  await pick(page, 'Recruitment Type', 'FTE');
  await pick(page, 'Recruitment Method', 'Increase');
  await pick(page, 'Loại Increase', 'New headcount');
  // Định biên tính bất đồng bộ (integration boundary); bấm Continue sớm thì form chặn "Phải là số dương".
  await expect(field(page, 'Remaining Vacancies').locator('input'), 'đơn vị phải còn định biên').toHaveValue(/^[1-9]\d*$/);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Bước 3 — Advanced Settings: một cấp duyệt, người duyệt là QA
  await pick(page, 'Approver', qa, qa);
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/recruitment-requests/config') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save' }).click();
  const res = await saved;
  if (!res.ok()) throw new Error(`Tạo YCTD lỗi ${res.status()}: ${await res.text()}`);

  const body = await res.json();
  const created = { id: String(body._id), code: String(body.code), title };
  addToRegistry({ flow: 'recruitment-requests', ...created });
  return created;
}

/** Màn duyệt (Approve/Reject/Cancel) và màn chi tiết (Cancel/Close/Reopen). */
const APPROVAL = 'process-approval';
const DETAIL = '';

/** Bấm nút, xác nhận modal (nhập lý do nếu có), chờ PATCH tương ứng. Trả về HTTP status. */
async function act(
  page: Page,
  req: CreatedRequest,
  screen: string,
  button: string,
  api: string,
  reason?: string,
): Promise<number> {
  await forceEnglish(page);
  await page.goto(`/recruitment-requests/${req.id}/${screen}`);
  await page.getByRole('button', { name: button }).click();
  const modal = page.locator('.ant-modal:visible').last();
  await modal.getByRole('button', { name: 'Agree' }).waitFor();
  if (reason !== undefined && (await modal.locator('input').count())) await modal.locator('input').first().fill(reason);
  const patched = page.waitForResponse(
    (r) => r.url().includes(`/api/recruitment-requests/${req.id}/${api}`) && r.request().method() === 'PATCH',
  );
  await modal.getByRole('button', { name: 'Agree' }).click();
  return (await patched).status();
}

export const approve = (page: Page, req: CreatedRequest) => act(page, req, APPROVAL, 'Approve request', 'approve');
export const reject = (page: Page, req: CreatedRequest, reason = `${QA_PREFIX} từ chối kiểm thử`) =>
  act(page, req, APPROVAL, 'Reject request', 'reject', reason);
export const cancel = (page: Page, req: CreatedRequest, reason = `${QA_PREFIX} huỷ kiểm thử`) =>
  act(page, req, DETAIL, 'Cancel request', 'change-status', reason);
/** Đóng YCTD — đóng luôn các kế hoạch tuyển dụng còn mở của nó. */
export const close = (page: Page, req: CreatedRequest, reason = `${QA_PREFIX} đóng kiểm thử`) =>
  act(page, req, DETAIL, 'Close request', 'change-status', reason);
export const reopen = (page: Page, req: CreatedRequest, reason = `${QA_PREFIX} mở lại kiểm thử`) =>
  act(page, req, DETAIL, 'Open request', 'change-status', reason);

/**
 * Đọc trạng thái YCTD từ response GET mà chính app gọi khi mở trang chi tiết.
 * Không tự gọi API: page.request (Node) không tin CA của staging, và token app gửi đi không phải token trong sessionStorage.
 */
export async function read(page: Page, req: CreatedRequest): Promise<{ statusCO: string; approvalStatus: string[] }> {
  await forceEnglish(page);
  await page.goto('about:blank'); // bỏ trang cũ: app tự GET lại sau PATCH, bắt nhầm response đó thì body đã mất
  const detail = page.waitForResponse(
    (r) => new URL(r.url()).pathname === `/api/recruitment-requests/${req.id}` && r.request().method() === 'GET',
  );
  await page.goto(`/recruitment-requests/${req.id}`);
  const body = await (await detail).json();
  return { statusCO: body.statusCO, approvalStatus: (body.approverTree ?? []).map((n: { status: string }) => n.status) };
}
