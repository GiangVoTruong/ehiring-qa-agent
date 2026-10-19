import { expect, type Page } from '@playwright/test';
import { QA_PREFIX, forceEnglish } from './common';

function qaEmail(): string {
  const user = process.env.QA_USERNAME;
  if (!user) throw new Error('Thiếu QA_USERNAME trong .env');
  return `${user}@shinhanbank.com`;
}

/** Ứng viên vừa thêm có phải talent QA không (các bước gửi mail về sau chỉ chạy với talent QA). */
const lastAdded: { qa: boolean } = { qa: false };

/** Vào trang hồ sơ ứng viên của một kế hoạch có sẵn (`/recruitment-plans/:id/applications`). */
async function openPlan(page: Page, planId: string): Promise<void> {
  await forceEnglish(page);
  await page.goto(`/recruitment-plans/${planId}/applications`);
  await expect(page.locator('button:has([nztype="svg:user-add"])').first()).toBeVisible({ timeout: 30_000 });
}

/** Kế hoạch đã có ứng viên QA → không thêm nữa, làm tiếp từ vòng hiện tại của hồ sơ đó. */
export async function hasQaCandidate(page: Page, planId: string): Promise<boolean> {
  await forceEnglish(page);
  await page.goto(`/recruitment-plans/${planId}/applications`);
  const found = await page.getByText(/^\[qa-auto\] Ứng Viên/i).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
  if (found) lastAdded.qa = true;
  return found;
}

/**
 * Thêm một ứng viên vào kế hoạch (ưu tiên talent QA, không có thì ứng viên đầu danh sách pool): icon user-add → modal "Add talent" →
 * bỏ "All Talent Pools" không cần, mở ô Talent Name, chọn dòng có email QA → Add. Trả HTTP status của POST.
 * Talent không tạo mới (không xoá được) — dùng lại talent QA đã có trong hệ thống.
 */
export async function addCandidate(page: Page, planId: string): Promise<number> {
  await openPlan(page, planId);
  await page.locator('button:has([nztype="svg:user-add"])').first().click();
  const modal = page.locator('.ant-modal:visible').last();
  await expect(modal).toBeVisible();

  // Bỏ "All Talent Pools" rồi chọn pool TA POOL (pool của kế hoạch) — ô tìm theo tên/email không ra kết quả.
  await modal.locator('button.ant-checkbox-wrapper').first().click();
  const pool = modal.locator('nz-select').first();
  await pool.locator('nz-select-top-control').click();
  // Talent QA nằm trong pool riêng "[AUTOTEST] POOL …" (hoặc "[QA-AUTO] POOL …" tạo từ trước) (không ở TA POOL) → ưu tiên pool đó; không có thì TA POOL.
  const poolOpts = page.locator('.ant-select-dropdown:visible .ant-select-item-option');
  await poolOpts.first().waitFor();
  const qaPool = poolOpts.filter({ hasText: /\[(?:AUTOTEST|QA-AUTO)\] POOL/ });
  await ((await qaPool.count()) ? qaPool.first() : poolOpts.filter({ hasText: 'TA POOL' }).first()).click();
  await page.keyboard.press('Escape');

  const select = modal.locator('nz-select').last();
  await select.locator('nz-select-top-control').click();
  const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option');
  // Ưu tiên talent QA; nếu kế hoạch đã có talent QA thì lấy ứng viên đầu danh sách (đúng ý tester: chỉ cần "một ứng viên").
  const anyOption = await options.first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
  if (!anyOption) {
    // Danh sách trống: talent của pool đã nằm hết trong kế hoạch → dùng lại ứng viên QA có sẵn (nếu có).
    await page.keyboard.press('Escape');
    await modal.getByRole('button', { name: /Cancel|Close/ }).first().click().catch(() => page.keyboard.press('Escape'));
    await page.goto(`/recruitment-plans/${planId}/applications`);
    await expect(page.getByText(/^\[qa-auto\] Ứng Viên/).first()).toBeVisible({ timeout: 15_000 });
    lastAdded.qa = true;
    console.log('Kế hoạch đã có ứng viên QA → dùng lại, không thêm mới');
    return 200;
  }
  // Danh sách lười tải (cuộn mới ra thêm): cuộn tới khi thấy talent QA hoặc hết danh sách.
  const viewport = page.locator('.ant-select-dropdown:visible .cdk-virtual-scroll-viewport, .ant-select-dropdown:visible .ant-select-dropdown-menu, .ant-select-dropdown:visible [role=listbox]').first();
  let last = -1;
  for (let i = 0; i < 40 && !(await options.filter({ hasText: qaEmail() }).count()); i++) {
    const top = await viewport.evaluate((e) => { e.scrollTop += 300; return e.scrollTop; }).catch(() => -2);
    await page.waitForTimeout(700);
    if (top === last) break;
    last = top;
  }
  const isQa = (await options.filter({ hasText: qaEmail() }).count()) > 0;
  lastAdded.qa = isQa;
  const qa = isQa ? options.filter({ hasText: qaEmail() }).first() : options.first();
  const picked = (await qa.innerText()).replace(/\s+/g, ' ').trim();
  console.log('Ứng viên được thêm:', picked);
  await qa.click();
  await page.keyboard.press('Escape');

  const added = page.waitForResponse(
    (r) => /\/recruitment-plans\/[^/]+\/applications\/multiple-applications$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
  );
  await modal.getByRole('button', { name: 'Add', exact: true }).click();
  return (await added).status();
}

// ---- Đưa ứng viên tới vòng Offer: Pass → xác nhận CV (link mail) → Pass → tạo lịch phỏng vấn → đánh giá Passed → Pass "Special to offer" ----

interface MailInfo {
  subject: string;
  link?: string;
}

export async function authToken(page: Page): Promise<string> {
  const req = page.waitForRequest((r) => r.url().includes('/api/') && !!r.headers().authorization);
  await page.goto('/recruitment-requests');
  return (await req).headers().authorization;
}

const latestMails = (page: Page, authorization: string): Promise<MailInfo[]> =>
  page.evaluate(async (a) => {
    const r = await fetch('/api/emails/v2?limit=80&page=1&sort=createdAt,DESC', { headers: { authorization: a } });
    return (await r.json()).data.map((e: { subject: string; body: unknown }) => ({
      subject: e.subject,
      link: String(e.body).match(/evaluations\/multiple\/[A-Z0-9-]+/)?.[0],
    }));
  }, authorization);

/** Chờ mail mới (tiêu đề bắt đầu bằng `prefix`, chưa có trong `seen`) kèm link phiếu. */
async function waitLink(page: Page, authorization: string, prefix: string, seen: Set<string>, mustHave = ''): Promise<string> {
  let link = '';
  await expect(async () => {
    const mail = (await latestMails(page, authorization)).find((m) => m.subject.startsWith(prefix) && m.subject.includes(mustHave) && m.link && !seen.has(m.link));
    expect(mail?.link).toBeTruthy();
    link = mail!.link!;
  }).toPass({ timeout: 90_000, intervals: [3000] }).catch((e) => {
    throw new Error(`Không thấy mail "${prefix}…" mới cho kế hoạch này trong 90 giây. Với phiếu phỏng vấn: mail chỉ được gửi khi buổi phỏng vấn tới giờ bắt đầu — nếu hôm nay QA đã có nhiều buổi (giờ bị "Clash" nên bị đẩy sang khung xa), phiếu sẽ không tới ngay. Chạy vào ngày/giờ QA còn rảnh hoặc dọn lịch cũ. (${String(e.message).slice(0, 120)})`);
  });
  return link;
}

/** Bấm Pass trên thẻ ứng viên: chọn mục menu (nếu có) rồi xác nhận modal. */
export async function pass(page: Page, label?: RegExp): Promise<void> {
  await page.locator('.btn-action.accept').waitFor();
  await page.locator('.btn-action.accept').click();
  const items = page.locator('.ant-dropdown:visible li');
  await items.first().waitFor({ timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  if (await items.count()) await (label ? items.filter({ hasText: label }).first() : items.first()).click();
  const modal = page.locator('.ant-modal:visible').last();
  await modal.waitFor();
  const done = page.waitForResponse((r) => /\/applications\/[^/]+\/accept(-to\/\w+)?$|approve-interview$/.test(new URL(r.url()).pathname) && r.request().method() !== 'GET');
  await modal.getByRole('button', { name: /Confirm/ }).click();
  expect((await done).status()).toBeLessThan(300);
  await page.waitForTimeout(2500);
}

/** Mở thẻ ứng viên QA đầu tiên của kế hoạch, trả về URL thẻ. */
export async function openQaCard(page: Page, planId: string, appId?: string): Promise<string> {
  if (appId) {
    // Hồ sơ cụ thể do tester chỉ định: chỉ chạy tiếp khi đó là talent QA (các bước sau gửi mail cho ứng viên).
    await forceEnglish(page);
    await page.goto(`/recruitment-plans/${planId}/applications/${appId}`);
    await page.locator('.btn-action.accept').waitFor();
    const text = await page.locator('body').innerText();
    if (!text.includes(qaEmail()) && !/\[qa-auto\] Ứng Viên/i.test(text)) {
      throw new Error('Hồ sơ này KHÔNG phải talent QA — không chạy tiếp (các bước sau gửi mail cho ứng viên, tránh gửi nhầm người thật).');
    }
    return page.url();
  }
  await openPlan(page, planId);
  await page.getByText(/^\[qa-auto\] Ứng Viên/).first().click();
  await page.locator('.btn-action.accept').waitFor();
  return page.url();
}

export interface OfferResult {
  appUrl: string;
}

export async function toOffer(page: Page, planId: string, appId?: string): Promise<OfferResult> {
  if (!appId && !lastAdded.qa) {
    throw new Error('Ứng viên vừa thêm KHÔNG phải talent QA — không chạy tiếp (các bước sau gửi mail cho ứng viên, tránh gửi nhầm người thật).');
  }
  const authorization = await authToken(page);
  const seen = new Set((await latestMails(page, authorization)).map((m) => m.link).filter(Boolean) as string[]);
  const appUrl = await openQaCard(page, planId, appId);
  // Tên kế hoạch dùng để chọn đúng mail (nhiều kế hoạch test cùng gửi mail về một hộp thư QA).
  const planTitle = ((await page.locator('body').innerText()).match(/\[(?:AUTOTEST|QA-AUTO)\] PATD[^-\n]*?\d{12,}/)?.[0] ?? '').trim();
  const has = async (t: string | RegExp) => (await page.getByText(t).locator('visible=true').count()) > 0; // chỉ tính chữ đang hiện (bố cục rộng render sẵn các tab ẩn)

  // Tiếp tục từ vòng hiện tại của hồ sơ (dùng lại hồ sơ có sẵn nên có thể đã đi một đoạn).
  console.log('toOffer: url', appUrl);
  if (await has('Create a recruitment proposal')) {
    console.log('toOffer: đã ở vòng Offer');
    return { appUrl };
  }
  // Chỉ coi là đã qua Offer khi thấy nội dung riêng của các vòng sau. (Nút "Request for Additional Information" có ở MỌI vòng, kể cả Application → không dùng làm dấu hiệu.)
  const pastOffer = await has(/Form for additional information|Review Candidate Information|Convert candidates to employees/);
  if (pastOffer) {
    console.log('Hồ sơ đã qua vòng Offer → bỏ qua bước đưa tới Offer, làm tiếp');
    return { appUrl };
  }
  const atInterview = (await page.getByRole('button', { name: /Create Interview/ }).count()) > 0;
  const atCv = !atInterview && (await has('Interview Confirmation Form'));

  if (!atInterview && !atCv) {
    await pass(page, /Meet expectation/); // Application → CV tiềm năng, gửi phiếu xác nhận CV
  }
  if (!atInterview) {
    if (!(await has('Accepted'))) {
      const cvLink = await waitLink(page, authorization, 'Please confirm', seen, planTitle);
      await page.goto('/' + cvLink);
      await page.locator('textarea').first().fill(`${QA_PREFIX} xác nhận CV`);
      await page.locator('button').filter({ hasText: /^\s*Confirm\s*$/ }).first().click();
      const cvDone = page.waitForResponse((r) => /approve-cv$/.test(new URL(r.url()).pathname));
      await page.getByRole('button', { name: /Send evaluation/ }).click();
      expect((await cvDone).status()).toBe(200);
      seen.add(cvLink);
      await page.goto(appUrl);
    }
    await pass(page, /Meet expectation/); // → Phỏng vấn 1
  }

  if (!(await has('Passed'))) {
    let evLink: string;
    let groupId: string | undefined;
    if (await has('Not started')) {
      groupId = await findPendingGroup(page, authorization, planId); // buổi tạo từ lượt trước chưa được phát phiếu
    } else {
      groupId = await createOnlineInterview(page);
    }
    if (groupId) await startGroup(page, authorization, planId, groupId);
    evLink = await waitLink(page, authorization, 'Interview Evaluation', seen, planTitle);
    await page.goto('/' + evLink); // mở link = bắt đầu phiếu
    await page.getByRole('button', { name: 'Passed' }).waitFor();
    const boxes = page.locator('input[type=checkbox]');
    for (let i = 0; i < 4; i++) await boxes.nth(i * 5 + 3).check({ force: true });
    await page.getByRole('button', { name: 'Passed' }).click();
    await page.locator('textarea').first().fill(`(1) Strengths: ${QA_PREFIX} (2) Weaknesses: -`);
    await boxes.last().check({ force: true });
    const endDone = page.waitForResponse((r) => /\/end$/.test(new URL(r.url()).pathname) && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Finish' }).click();
    expect((await endDone).status()).toBe(200);
    await page.goto(appUrl);
    await expect(page.getByText('Passed', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  }
  await pass(page, /Special to offer/); // → thẳng vòng Offer
  await expect(page.getByText('Create a recruitment proposal')).toBeVisible({ timeout: 20_000 });
  return { appUrl };
}

/**
 * Tạo lịch phỏng vấn online (link giả). Giờ mặc định "Clash" với buổi khác của QA thì chọn khung rảnh gần nhất.
 * Trả `id` nhóm lịch (từ response POST) để bắt đầu thủ công bằng `startGroup` — cron chỉ phát phiếu khi giờ bắt đầu trong 30 phút tới.
 */
async function createOnlineInterview(page: Page): Promise<string> {
  await page.getByRole('button', { name: /Create Interview/ }).click();
  const m = page.locator('.ant-modal:visible').last();
  await m.waitFor();
  await m.getByText('Online Interview').click();
  await m.locator('[placeholder="Interview link"]').fill('https://meet.example.com/qa-auto');
  await page.waitForTimeout(1500);
  if (await m.getByText(/Clash!/).count()) {
    await m.getByText('Nearest free slots').locator('xpath=following::button[1]').click();
    await page.waitForTimeout(1500);
  }
  const sendBtn = page.getByRole('button', { name: /Send and Create/ });
  if (!(await sendBtn.isVisible().catch(() => false))) {
    const create = page.locator('.ant-modal:visible').first().getByRole('button', { name: /^Create$/ });
    await expect(create).toBeEnabled({ timeout: 15_000 });
    await create.click();
  }
  const created = page.waitForResponse(
    (r) => /\/schedule-groups\/by-recruitment-plan\/[^/]+$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
  );
  await page.locator('.ant-modal:visible').last().getByRole('button', { name: /Send and Create/ }).click();
  const body = await (await created).json();
  return String(body._id);
}

/** Bắt đầu buổi phỏng vấn ngay bằng API app dùng (PATCH …/:id/start) → tạo phiếu đánh giá + gửi mail, không chờ tới giờ. */
async function startGroup(page: Page, authorization: string, planId: string, groupId: string): Promise<void> {
  const status = await page.evaluate(
    async ({ a, planId, groupId }) => {
      const r = await fetch(`/api/schedule-groups/by-recruitment-plan/${planId}/${groupId}/start`, {
        method: 'PATCH',
        headers: { authorization: a, 'content-type': 'application/json' },
        body: '{}',
      });
      return { status: r.status, text: r.ok ? '' : (await r.text()).slice(0, 160) };
    },
    { a: authorization, planId, groupId },
  );
  // 400 "already happening" = cron đã bắt đầu rồi → coi như xong.
  if (status.status >= 300 && !/already happening/i.test(status.text)) throw new Error(`Bắt đầu buổi phỏng vấn lỗi ${status.status}: ${status.text}`);
}

/** Nhóm lịch phỏng vấn đang chờ (chưa bắt đầu) mới nhất của kế hoạch. */
async function findPendingGroup(page: Page, authorization: string, planId: string): Promise<string | undefined> {
  return page.evaluate(
    async ({ a, planId }) => {
      const r = await fetch(`/api/schedule-groups/by-recruitment-plan/${planId}?limit=50&page=1&sort[0]=createdAt,DESC`, { headers: { authorization: a } });
      const rows = (await r.json()).data ?? [];
      return rows.find((g: { status: string }) => g.status === 'pending')?._id as string | undefined;
    },
    { a: authorization, planId },
  );
}
