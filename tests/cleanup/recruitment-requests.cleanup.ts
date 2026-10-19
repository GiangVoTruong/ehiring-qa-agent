import { expect, test, type Page } from '@playwright/test';
import { cleanupCandidates, forceEnglish, readRegistry, removeFromRegistry } from '../../flows/common';

// Chỉ chạy khi user yêu cầu dọn: `npm run cleanup`. UI không có nút xoá YCTD/kế hoạch → xoá mềm qua API
// (backend `softDelete: true`), mượn header Authorization của chính app. Chỉ xoá bản ghi vừa có trong
// registry vừa còn tiền tố [AUTOTEST]. Thứ tự: kế hoạch trước, YCTD sau (YCTD còn kế hoạch thì bị bỏ qua).
type Api = (method: string, resource: string, id: string) => Promise<{ status: number; body: any }>;

function makeApi(page: Page, authorization: string): Api {
  return (method, resource, id) =>
    page.evaluate(
      async ({ method, resource, id, authorization }) => {
        const res = await fetch(`/api/${resource}/${id}`, { method, headers: { authorization } });
        return { status: res.status, body: res.status === 200 && method === 'GET' ? await res.json() : null };
      },
      { method, resource, id, authorization },
    );
}

/** Xoá mềm các bản ghi `flow` trong registry; trả về số bản đã xoá. `blocked(body)` → lý do bỏ qua. */
async function sweep(
  api: Api,
  flow: string,
  resource: string,
  blocked: (body: any) => Promise<string | null>,
): Promise<number> {
  const registry = readRegistry().filter((e) => e.flow === flow);
  const records: { id: string; title: string; code: string; body: any }[] = [];
  for (const e of registry) {
    const { status, body } = await api('GET', resource, e.id);
    if (status !== 200) {
      console.log(`bỏ qua ${e.code}: GET ${status} (đã xoá hoặc không thấy)`);
      continue;
    }
    records.push({ id: e.id, title: body.name, code: body.code, body });
  }

  const deleted: string[] = [];
  for (const r of cleanupCandidates(records, registry)) {
    const why = await blocked(r.body);
    if (why) {
      console.log(`bỏ qua ${r.code}: ${why}`);
      continue;
    }
    const { status } = await api('DELETE', resource, r.id);
    console.log(`xoá ${resource} ${r.code} "${r.title}": ${status}`);
    if (status === 200) deleted.push(r.id);
  }
  removeFromRegistry([...deleted, ...registry.filter((e) => !records.some((r) => r.id === e.id)).map((e) => e.id)]);
  return deleted.length;
}

test('dọn kế hoạch và YCTD [AUTOTEST] trong registry', async ({ page }) => {
  // Chặn chạy nhầm: `npx playwright test` / healer `test_run` chạy mọi project, kể cả project này.
  test.skip(process.env.QA_CLEANUP?.trim() !== '1', 'chỉ chạy qua `npm run cleanup`');
  test.setTimeout(300_000);
  test.skip(!readRegistry().length, 'registry trống');

  await forceEnglish(page);
  const appCall = page.waitForRequest((r) => r.url().includes('/api/recruitment-requests') && !!r.headers().authorization);
  await page.goto('/recruitment-requests');
  const api = makeApi(page, (await appCall).headers().authorization);

  // API YCTD vẫn liệt kê cả kế hoạch đã xoá mềm → hỏi lại từng kế hoạch, chỉ kế hoạch còn sống (GET 200) mới chặn.
  const plans = await sweep(api, 'recruitment-plans', 'recruitment-plans', async () => null);
  const requests = await sweep(api, 'recruitment-requests', 'recruitment-requests', async (b) => {
    let alive = 0;
    for (const p of b.plan ?? []) if ((await api('GET', 'recruitment-plans', String(p._id))).status === 200) alive++;
    return alive ? `đang có ${alive} kế hoạch tuyển dụng còn sống` : null;
  });
  console.log(`đã xoá ${plans} kế hoạch, ${requests} YCTD`);
  if (plans + requests === 0) console.log('Không có kế hoạch/YCTD nào cần dọn (registry chỉ còn talent/pool — không xoá được qua API).');
});
