import { expect, test } from '../../flows/test';
import * as rp from '../../flows/recruitment-plans';

// LUỒNG PATD: chỉ tạo kế hoạch tuyển dụng, chọn luôn YCTD đầu tiên trong danh sách (không tạo/duyệt/đóng YCTD).
// Tên bước hiện trên web (tab PATD) — đổi tên ở đây là đổi trên web.
test.describe.configure({ timeout: 300_000 });

test('PATD: tạo kế hoạch từ YCTD có sẵn', async ({ page }) => {
  let plan!: rp.CreatedPlan;

  await test.step('Tạo kế hoạch tuyển dụng từ YCTD đầu tiên trong danh sách', async () => {
    plan = await rp.create(page, null);
    expect(await rp.read(page, plan)).toMatchObject({ status: 'not-start', websites: 0 });
  });

  await test.step('Bắt đầu kế hoạch → in-progress', async () => {
    expect(await rp.start(page, plan)).toBe(200);
    expect((await rp.read(page, plan)).status).toBe('in-progress');
  });

  await test.step('Tạm dừng kế hoạch → pending', async () => {
    expect(await rp.pause(page, plan)).toBe(200);
    expect((await rp.read(page, plan)).status).toBe('pending');
  });

  await test.step('Tiếp tục kế hoạch → in-progress', async () => {
    expect(await rp.resume(page, plan)).toBe(200);
    expect((await rp.read(page, plan)).status).toBe('in-progress');
  });

  await test.step('Đóng kế hoạch (bắt buộc lý do) → finish', async () => {
    expect(await rp.close(page, plan)).toBe(200);
    expect((await rp.read(page, plan)).status).toBe('finish');
  });

  await test.step('Gia hạn kế hoạch 1 tuần → in-progress', async () => {
    expect(await rp.extend(page, plan)).toBe(200);
    const after = await rp.read(page, plan);
    expect(after.status).toBe('in-progress');
    expect(new Date(after.endDate!).getTime()).toBeGreaterThan(Date.now());
  });
});
