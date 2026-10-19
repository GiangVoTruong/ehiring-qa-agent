import { expect, test } from '@playwright/test';
import { forceEnglish } from '../../flows/common';

// Dọn mail test trong `emails/v2` (collection emails). Route này KHÔNG có DELETE (chỉ get/getMany/update/create) nên
// xoá mềm bằng PATCH `__isDeleted: true` — cùng cờ mà DELETE của các resource khác đặt. Chỉ động tới mail:
//   - có "[AUTOTEST]" trong tiêu đề/nội dung, VÀ
//   - người nhận là chính tài khoản QA, VÀ không có cc/bcc nào khác tài khoản QA.
// Mail không đạt điều kiện (đặc biệt: gửi tới người thật) chỉ được in ra, KHÔNG xoá. Không thu hồi được mail đã gửi.
test('dọn mail [AUTOTEST] trong emails/v2', async ({ page }) => {
  test.skip(process.env.QA_CLEANUP?.trim() !== '1', 'chỉ chạy qua `npm run cleanup`');
  test.setTimeout(600_000);
  const qa = process.env.QA_USERNAME!;

  await forceEnglish(page);
  const appCall = page.waitForRequest((r) => r.url().includes('/api/recruitment-requests') && !!r.headers().authorization);
  await page.goto('/recruitment-requests');
  const authorization = (await appCall).headers().authorization;

  const call = (method: string, path: string, body?: unknown) =>
    page.evaluate(
      async ({ method, path, body, authorization }) => {
        const res = await fetch(path, {
          method,
          headers: { authorization, ...(body ? { 'content-type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, body: res.ok ? await res.json().catch(() => null) : (await res.text()).slice(0, 200) };
      },
      { method, path, body, authorization },
    );

  const listAll = async () => {
    const all: any[] = [];
    for (let p = 1; p <= 60; p++) {
      const r = await call('GET', `/api/emails/v2?limit=100&page=${p}&sort=createdAt,DESC`);
      const rows = r.body?.data ?? [];
      all.push(...rows);
      if (rows.length < 100) break;
    }
    return all.filter((e) => JSON.stringify([e.subject, e.body]).match(/\[(AUTOTEST|QA-AUTO)\]/));
  };
  const addr = (v: unknown) => JSON.stringify(v ?? '');
  const isQaOnly = (e: any) =>
    addr(e.recipient).includes(qa) && [e.cc, e.bcc].every((x) => !x || !(Array.isArray(x) ? x.length : addr(x).length > 2) || addr(x).includes(qa));

  const found = await listAll();
  const safe = found.filter(isQaOnly);
  const unsafe = found.filter((e) => !isQaOnly(e));
  console.log(`mail [AUTOTEST]: ${found.length} — an toàn để xoá: ${safe.length}, KHÔNG xoá (có người ngoài tài khoản QA): ${unsafe.length}`);
  for (const e of unsafe) console.log(`  GỬI NGƯỜI KHÁC: ${e._id} to=${addr(e.recipient).slice(0, 80)} cc=${addr(e.cc).slice(0, 60)} | ${e.subject}`);
  test.skip(!safe.length, 'không có mail nào để xoá');

  // Thử một bản trước: phải biến mất khỏi danh sách thì mới xoá tiếp.
  const [probe, ...rest] = safe;
  const r = await call('PATCH', `/api/emails/v2/${probe._id}`, { __isDeleted: true });
  console.log(`thử ${probe._id}: PATCH ${r.status}`);
  expect(r.status).toBe(200);
  const after = await listAll();
  expect(after.some((e) => e._id === probe._id), 'mail đã PATCH vẫn còn trong danh sách → dừng, không xoá hàng loạt').toBe(false);

  let ok = 1;
  for (const e of rest) {
    const x = await call('PATCH', `/api/emails/v2/${e._id}`, { __isDeleted: true });
    if (x.status === 200) ok++;
    else console.log(`lỗi ${e._id}: ${x.status} ${x.body}`);
  }
  const left = await listAll();
  console.log(`đã xoá mềm ${ok}/${safe.length}; còn lại mail [AUTOTEST] trong danh sách: ${left.length}`);
  expect(left.filter(isQaOnly)).toHaveLength(0);
});
