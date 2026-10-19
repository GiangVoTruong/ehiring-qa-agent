import { expect, test } from '@playwright/test';
import { forceEnglish } from '../../flows/common';
import * as rr from '../../flows/recruitment-requests';

// Assertion lấy từ knowledge/recruitment-requests.md. statusCO: '3' chờ duyệt · '0' Open · '1' Closed · '4' Cancelled · '2' bị từ chối.
// Mỗi kịch bản tự tạo YCTD riêng [AUTOTEST] (giữ lại trên staging, có trong .qa-registry.json).
test.describe.configure({ timeout: 150_000 });

const YY = String(new Date().getFullYear()).slice(2);

test('tạo → chờ duyệt, mã NI<YY><NNN>', async ({ page }) => {
  const req = await rr.create(page);
  expect(req.code).toMatch(new RegExp(`^NI${YY}\\d{3}$`));
  expect(await rr.read(page, req)).toEqual({ statusCO: '3', approvalStatus: ['pending'] });
});

test('duyệt cấp cuối → Open', async ({ page }) => {
  const req = await rr.create(page);
  expect(await rr.approve(page, req)).toBe(200);
  expect(await rr.read(page, req)).toEqual({ statusCO: '0', approvalStatus: ['approved'] });
});

test('từ chối → bị từ chối', async ({ page }) => {
  const req = await rr.create(page);
  expect(await rr.reject(page, req)).toBe(200);
  expect(await rr.read(page, req)).toEqual({ statusCO: '2', approvalStatus: ['rejected'] });
});

test('huỷ khi đang chờ duyệt → Cancelled', async ({ page }) => {
  const req = await rr.create(page);
  expect(await rr.cancel(page, req)).toBe(200);
  expect(await rr.read(page, req)).toEqual({ statusCO: '4', approvalStatus: ['pending'] });
});

test('đã huỷ thì không được duyệt', async ({ page }) => {
  const req = await rr.create(page);
  expect(await rr.cancel(page, req)).toBe(200);

  await forceEnglish(page);
  await page.goto(`/recruitment-requests/${req.id}/process-approval`);
  await expect(page.getByText(req.title).first()).toBeVisible();
  const approveButton = page.getByRole('button', { name: 'Approve request' });
  if (await approveButton.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
    // UI vẫn cho bấm → backend phải từ chối.
    expect(await rr.approve(page, req), 'backend phải chặn duyệt YCTD đã huỷ').toBeGreaterThanOrEqual(400);
  }
  expect(await rr.read(page, req)).toEqual({ statusCO: '4', approvalStatus: ['pending'] });
});

test('duyệt → đóng → Closed → mở lại → Open', async ({ page }) => {
  const req = await rr.create(page);
  expect(await rr.approve(page, req)).toBe(200);

  await test.step('đóng', async () => {
    expect(await rr.close(page, req)).toBe(200);
    expect(await rr.read(page, req)).toEqual({ statusCO: '1', approvalStatus: ['approved'] });
  });
  await test.step('mở lại', async () => {
    expect(await rr.reopen(page, req)).toBe(200);
    expect(await rr.read(page, req)).toEqual({ statusCO: '0', approvalStatus: ['approved'] });
  });
});
