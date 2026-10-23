import { expect, test } from '../../flows/test';
import * as rr from '../../flows/recruitment-requests';
import * as rp from '../../flows/recruitment-plans';
import type { CreatedRequest } from '../../flows/recruitment-requests';

// LUỒNG TUYỂN DỤNG ĐẦY ĐỦ: YCTD → duyệt → kế hoạch → vòng đời kế hoạch → đóng YCTD.
// Assertion lấy từ knowledge/recruitment-requests.md và recruitment-plans.md. Tạo kế hoạch tốn ~35s nên cả luồng gói
// trong MỘT test; từng bước là test.step (tên bước hiện trên web "Chạy luồng" — đổi tên ở đây là đổi trên web).
test.describe.configure({ timeout: 360_000 });

test('Luồng tuyển dụng đầy đủ: YCTD → kế hoạch', async ({ page }) => {
  let request!: CreatedRequest;
  let plan!: rp.CreatedPlan;

  await test.step('Tạo YCTD (chờ duyệt)', async () => {
    request = await rr.create(page, 'YCTD cho PATD');
    expect(await rr.read(page, request)).toEqual({ statusCO: '3', approvalStatus: ['pending'] });
  });

  await test.step('Kiểm tra: YCTD chờ duyệt chưa chọn được ở form kế hoạch', async () => {
    expect(await rp.requestSelectable(page, request)).toBe(false);
  });

  await test.step('Duyệt YCTD → Open', async () => {
    expect(await rr.approve(page, request)).toBe(200);
    expect(await rr.read(page, request)).toEqual({ statusCO: '0', approvalStatus: ['approved'] });
  });

  await test.step('Kiểm tra: YCTD Open chọn được ở form kế hoạch', async () => {
    expect(await rp.requestSelectable(page, request)).toBe(true);
  });

  await test.step('Tạo kế hoạch tuyển dụng (mã = mã YCTD + 001)', async () => {
    plan = await rp.create(page, request);
    expect(plan.code).toBe(`${request.code}001`);
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

  await test.step('Đóng YCTD → kế hoạch đang chạy bị đóng theo', async () => {
    expect(await rr.close(page, request)).toBe(200);
    // Backend đóng kế hoạch nền (wait:false) nên chờ trạng thái cập nhật.
    await expect.poll(async () => (await rp.read(page, plan)).status, { timeout: 30_000, intervals: [2000] }).toBe('finish');
  });
});
