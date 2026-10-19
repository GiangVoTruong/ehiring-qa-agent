import { expect, test } from '@playwright/test';
import * as rr from '../../flows/recruitment-requests';
import * as rp from '../../flows/recruitment-plans';
import * as ap from '../../flows/applications';
import * as of from '../../flows/offer';
import { ensureLoggedIn, hold, readRegistry } from '../../flows/common';

import type { CreatedRequest } from '../../flows/recruitment-requests';

// Bộ chạy QUY TRÌNH TỰ SOẠN. Chỉ chạy từ web "Chạy luồng": web truyền danh sách bước qua biến môi trường QA_PROCEDURE
// (JSON: [{id,label}]). Mỗi bước tự kiểm tra trạng thái kết quả đúng như knowledge/recruitment-requests.md và
// recruitment-plans.md. Danh sách thao tác hợp lệ + thứ tự cho phép nằm ở web/procedure.mjs (ACTIONS).
const raw = process.env.QA_PROCEDURE;
test.describe.configure({ timeout: 900_000 });

test('Quy trình tự soạn', async ({ page }) => {
  test.skip(!raw, 'chỉ chạy từ web "Chạy luồng" (cần QA_PROCEDURE)');
  const steps: { id: string; label: string; arg?: string }[] = JSON.parse(raw!);
  let request: CreatedRequest | undefined;
  let plan: rp.CreatedPlan | undefined;
  let planStatus: string | undefined;
  let appInPlan: string | undefined; // hồ sơ cụ thể tester dán link (nếu có)


  /** YCTD [AUTOTEST] gần nhất còn dùng được (chờ duyệt hoặc đang Open). */
  const findReusableRequest = async (): Promise<CreatedRequest | undefined> => {
    for (const e of readRegistry().filter((x) => x.flow === 'recruitment-requests').reverse().slice(0, 8)) {
      const candidate = { id: e.id, code: e.code ?? '', title: e.title };
      try {
        const st = await rr.read(page, candidate);
        if (st.statusCO === '0' || st.statusCO === '3') return candidate;
      } catch { /* đã xoá/không đọc được → thử cái khác */ }
    }
  };
  /** Kế hoạch [AUTOTEST] của YCTD này chưa kết thúc. */
  const findReusablePlan = async (req: CreatedRequest): Promise<rp.CreatedPlan | undefined> => {
    for (const e of readRegistry().filter((x) => x.flow === 'recruitment-plans' && x.code?.startsWith(req.code)).reverse()) {
      const candidate = { id: e.id, code: e.code ?? '', name: e.title, requestId: req.id };
      try {
        if (['not-start', 'in-progress', 'pending'].includes((await rp.read(page, candidate)).status)) return candidate; // đã xoá/kết thúc → không dùng lại
      } catch { /* bỏ qua */ }
    }
  };

  const needRequest = () => {
    if (!request) throw new Error('Chưa có YCTD — quy trình sai thứ tự');
    return request;
  };
  const needPlan = () => {
    if (!plan) throw new Error('Chưa có kế hoạch — quy trình sai thứ tự');
    return plan;
  };
  const requestIs = async (statusCO: string, approvalStatus: string[]) =>
    expect(await rr.read(page, needRequest())).toEqual({ statusCO, approvalStatus });
  const planIs = async (status: string) => {
    planStatus = (await rp.read(page, needPlan())).status;
    expect(planStatus).toBe(status);
  };

  try {
  await ensureLoggedIn(page, '/recruitment-requests');
  for (const s of steps) {
    await test.step(s.label, async () => {
      switch (s.id) {
        case 'yctd.tao': {
          // Mặc định DÙNG LẠI YCTD [AUTOTEST] đã có (còn chờ duyệt / đang Open); chỉ tạo mới khi tester ghi "tạo mới".
          const reuse = s.arg === 'new' ? undefined : await findReusableRequest();
          if (reuse) {
            request = reuse;
            console.log('Dùng lại YCTD', reuse.code);
          } else {
            request = await rr.create(page, 'YCTD tự soạn');
            await requestIs('3', ['pending']);
          }
          break;
        }
        case 'yctd.duyet':
          if ((await rr.read(page, needRequest())).statusCO === '0') {
            console.log('YCTD đã Open sẵn → bỏ qua bước duyệt');
            break;
          }
          expect(await rr.approve(page, needRequest())).toBe(200);
          await requestIs('0', ['approved']);
          break;
        case 'yctd.tuchoi':
          expect(await rr.reject(page, needRequest())).toBe(200);
          await requestIs('2', ['rejected']);
          break;
        case 'yctd.huy':
          expect(await rr.cancel(page, needRequest())).toBe(200);
          await requestIs('4', ['pending']);
          break;
        case 'yctd.dong':
          expect(await rr.close(page, needRequest())).toBe(200);
          await requestIs('1', ['approved']);
          // Đóng YCTD đóng luôn kế hoạch còn chạy (backend làm nền) → chờ.
          if (plan && planStatus !== 'finish') {
            await expect.poll(async () => (planStatus = (await rp.read(page, needPlan())).status), { timeout: 30_000, intervals: [2000] }).toBe('finish');
          }
          break;
        case 'yctd.mo_lai':
          expect(await rr.reopen(page, needRequest())).toBe(200);
          await requestIs('0', ['approved']);
          break;
        case 'kh.vao':
          const [planId, , appId] = s.arg!.split('/');
          plan = { id: planId, code: '', name: '', requestId: '' };
          appInPlan = appId;
          console.log('##PLAN|' + planId);
          planStatus = (await rp.read(page, plan)).status;
          break;
        case 'ungvien.them':
          if (await ap.hasQaCandidate(page, needPlan().id)) {
            console.log('Kế hoạch đã có ứng viên QA → bỏ qua bước thêm, làm tiếp từ vòng hiện tại của hồ sơ');
            break;
          }
          expect(await ap.addCandidate(page, needPlan().id)).toBeLessThan(300);
          break;
        case 'ungvien.offer':
          await ap.toOffer(page, needPlan().id, appInPlan);
          break;
        case 'ungvien.totrinh':
          await of.proposal(page, needPlan().id);
          break;
        case 'ungvien.bstt':
          await of.additionalInfo(page, needPlan().id);
          break;
        case 'ungvien.hris':
          await of.verifyInfoToHris(page, needPlan().id);
          break;
        case 'kh.tao': {
          // Mặc định DÙNG LẠI kế hoạch [AUTOTEST] của YCTD này nếu còn dùng được; chỉ tạo mới khi tester ghi "tạo mới".
          const reuse = s.arg === 'new' ? undefined : await findReusablePlan(needRequest());
          if (reuse) {
            plan = reuse;
            console.log('##PLAN|' + plan.id);
            planStatus = (await rp.read(page, plan)).status;
            console.log('Dùng lại kế hoạch', reuse.code, '(', planStatus, ')');
          } else {
            plan = await rp.create(page, needRequest());
            console.log('##PLAN|' + plan.id);
            expect(plan.code.startsWith(needRequest().code)).toBe(true); // 001, 002… tuỳ YCTD đã có kế hoạch trước
            await planIs('not-start');
          }
          break;
        }
        case 'kh.batdau':
          {
            const st = (await rp.read(page, needPlan())).status;
            if (st === 'in-progress') {
              console.log('Kế hoạch đã chạy sẵn → bỏ qua bước bắt đầu');
              break;
            }
            // Kế hoạch dùng lại đang tạm dừng → "tiếp tục" mới là thao tác có trong menu.
            expect(await (st === 'pending' ? rp.resume(page, needPlan()) : rp.start(page, needPlan()))).toBe(200);
          }
          await planIs('in-progress');
          break;
        case 'kh.tamdung':
          expect(await rp.pause(page, needPlan())).toBe(200);
          await planIs('pending');
          break;
        case 'kh.tieptuc':
          expect(await rp.resume(page, needPlan())).toBe(200);
          await planIs('in-progress');
          break;
        case 'kh.dong':
          expect(await rp.close(page, needPlan())).toBe(200);
          await planIs('finish');
          break;
        case 'kh.giahan': {
          expect(await rp.extend(page, needPlan())).toBe(200);
          const after = await rp.read(page, needPlan());
          planStatus = after.status;
          expect(after.status).toBe('in-progress');
          expect(new Date(after.endDate!).getTime()).toBeGreaterThan(Date.now());
          break;
        }
        default:
          throw new Error(`Thao tác chưa hỗ trợ: ${s.id}`);
      }
    });
  }
  } catch (e) {
    // Lỗi: KHÔNG đóng trình duyệt — dừng đúng màn đang kẹt để đọc luồng và thao tác tiếp bằng tay.
    // Cửa sổ giữ mở tới khi tester đóng (hoặc bấm Dừng trên web).
    console.log('GIỮ CỬA SỔ: đang dừng đúng màn hình lỗi — thao tác tiếp trên cửa sổ Chrome, đóng cửa sổ khi xong. Lỗi: ' + String((e as Error).message).split(String.fromCharCode(10))[0]);
    if (process.env.QA_HOLD_ON_FAIL !== '0') {
      test.setTimeout(0);
      await page.waitForEvent('close', { timeout: 0 }).catch(() => undefined);
    }
    throw e;
  }
  await hold(page); // giữ cửa sổ vài giây cho tester xem kết quả
});
