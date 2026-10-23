// Nghiệp vụ "quay → phân tích → lưu flow → chạy lại". server.mjs chỉ định tuyến HTTP tới các hàm ở đây.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from 'node:path';
import {
  buildExpected,
  cleanExpected,
  deriveTestCases,
  findSimilar,
  flowSignature,
  groupSteps,
  liveInsights,
  observeFacts,
} from "./analysis.mjs";
import {
  ALLOWED_HOST,
  BASE_URL,
  CRED_FILE,
  ROOT,
  USER_SESSION,
  USER_STATE,
} from "./config.mjs";
import { existsSync, statSync } from 'node:fs';
import { REPORTERS, currentJob, jobs, startJob, stopJob } from "./jobs.mjs";
import { createRecorder } from './recorder.mjs';
import { openStore } from './store.mjs';

export const recorder = createRecorder({ ROOT, BASE_URL, ALLOWED_HOST, CRED_FILE, USER_STATE, USER_SESSION });
export const store = openStore(join(ROOT, 'data', 'qa.db'));

const analyses = new Map(); // phân tích gần nhất của từng bản quay, đợi người dùng lưu thành flow

const isNav = (s) => s.act?.type === 'nav' && !/dashboard/.test(s.url || '') && (s.url || '') !== '/';

/** Máy phân tích (miễn phí): dữ kiện quan sát + kết quả mong đợi + flow tương tự + test case dẫn xuất. */
export async function analyzeRecordingById({ id }) {
  const rec = recorder.get(id);
  const facts = observeFacts(rec.steps);
  const expected = buildExpected(rec.steps);
  const signature = flowSignature(expected);
  const similar = findSimilar(store.listFlows(), { name: rec.name, signature });
  const nav = rec.steps.find(isNav);
  const out = {
    recId: id,
    name: rec.name,
    module: (nav?.url ?? "").split("/").filter(Boolean)[0] ?? "",
    url: nav?.url ?? "",
    signature,
    similar,
    steps: rec.steps.map((s, i) => ({
      i,
      text: s.text,
      effects: s.effects,
      toasts: s.toasts ?? [],
      notes: s.notes ?? [],
      shot: s.shot ?? null,
      dataChoice: !!s.act?.dataChoice,
    })),
    notes: rec.notes,
    groups: groupSteps(rec.steps),
    facts,
    expected,
    derived: deriveTestCases(rec.steps, facts, expected),
    at: new Date().toISOString(),
  };
  analyses.set(id, out);
  return out;
}

/** Lưu phân tích thành flow mới, hoặc thêm PHIÊN BẢN ĐỀ XUẤT vào flow đã có (không ghi đè). */
export function saveFlow({ recId, mode = 'new', flowId, name, cases }) {
  const a = analyses.get(recId);
  if (!a)
    throw new Error(
      "Chưa phân tích bản quay này — hãy phân tích trước khi lưu.",
    );
  // Bỏ ảnh trạng thái "trước" (đã dùng để tìm dữ kiện) cho nhẹ; ảnh bằng chứng tham chiếu theo bản quay.
  const steps = recorder.get(recId).steps.map(({ before, ...s }) => ({
    ...s,
    shot: s.shot ? `${recId}/${s.shot.replace(".jpg", "")}` : null,
  }));
  const analysis = {
    summary: "",
    businessSteps: [],
    parameters: [],
    problems: [],
    notes: a.notes,
    recId,
  };
  const rules = a.facts;
  if (mode === "version") {
    const id = Number(flowId);
    if (!store.getFlow(id)) throw new Error("Không có flow này");
    const version = store.addVersion(id, {
      steps,
      expected: a.expected,
      params: {},
      analysis,
      sourceRecording: recId,
      note: `Quay lại ${a.at.slice(0, 16)} — chờ xác nhận`,
    });
    store.addRules(id, version, rules);
    return { flowId: id, version, proposed: true };
  }
  const id = store.createFlow({
    name: name?.trim() || a.name,
    module: a.module,
    url: a.url,
    description: analysis.summary,
    signature: a.signature,
    steps,
    expected: a.expected,
    params: {},
    analysis,
    sourceRecording: recId,
  });
  store.addRules(id, 1, rules);
  const allCases = a.derived;
  store.addTestCases(
    id,
    Array.isArray(cases)
      ? allCases.filter((_, i) => cases.includes(i))
      : allCases,
  ); // chỉ lưu test case người dùng đã chọn
  return { flowId: id, version: 1, proposed: false };
}

/** Xoá một flow (cùng lịch sử chạy + ảnh bằng chứng của các lượt chạy). Bản quay thô trong recordings/ được giữ lại. */
export function deleteFlow({ id }) {
  const flowId = Number(id);
  if (!store.getFlow(flowId)) throw new Error('Không có flow này');
  const cur = currentJob();
  if (cur?.status === 'running' && store.listRuns(flowId, 50).some((r) => r.id === cur.runId)) throw new Error('Flow đang được chạy — dừng lượt chạy trước rồi hãy xoá.');
  for (const runId of store.deleteFlow(flowId)) {
    rmSync(join(ROOT, 'data', 'runs', runId), { recursive: true, force: true });
    rmSync(join(ROOT, 'data', 'run-input', `${runId}.json`), { force: true });
  }
  return { ok: true };
}

export function flowDetail(id) {
  const flow = store.getFlow(id);
  if (!flow) throw new Error('Không có flow này');
  const versions = flow.versions.map((v) => ({ ...v, stepCount: store.getVersion(id, v.version).steps.length }));
  const current = store.getVersion(id, flow.current_version);
  return { flow: { ...flow, versions }, current: { ...current, expected: cleanExpected(current.expected) }, rules: store.listRules(id), testCases: store.listTestCases(id), questions: store.listQuestions(id), runs: store.listRuns(id, 15) };
}

/** Chạy lại một flow (hoặc một test case dẫn xuất) trên staging. Có hành động ghi → người dùng phải cho phép rõ ràng. */
export function runSavedFlow({
  flowId,
  testCaseId,
  params = {},
  allowWrites,
  allowRisky,
}) {
  const flow = store.getFlow(Number(flowId));
  if (!flow) throw new Error("Không có flow này");
  const ver = store.getVersion(flow.id, flow.current_version);
  const tc = testCaseId ? store.getTestCase(Number(testCaseId)) : null;
  ver.expected = cleanExpected(ver.expected); // API đăng nhập không phải kết quả cần kiểm
  const writes = ver.expected.writes ?? [];
  if ((writes.length || tc?.requires_permission) && !allowWrites) {
    throw new Error(
      `Flow này ghi dữ liệu (${[...new Set(writes.map((w) => `${w.method} ${w.path}`))].join(", ") || "test case có thể thay đổi dữ liệu"}). Cần xác nhận cho phép chạy trên môi trường test.`,
    );
  }
  // Ngày trong bản quay được dời theo số ngày đã trôi qua kể từ lúc quay (giữ nguyên thứ tự trước/sau giữa các ngày) khi tự điền dữ liệu.
  let recordedAt = Date.now();
  try {
    recordedAt =
      new Date(recorder.get(ver.analysis?.recId).startedAt).getTime() ||
      recordedAt;
  } catch {
    /* bản quay gốc không còn */
  }
  const merged = {
    ...params,
    ...(tc?.variant ?? {}),
    allowRisky: !!allowRisky,
    shiftDays: Math.max(0, Math.floor((Date.now() - recordedAt) / 86400000)),
  };
  const runId = `r${Date.now()}`;
  store.startRun({
    id: runId,
    flowId: flow.id,
    version: ver.version,
    testCaseId: tc?.id,
    params: merged,
  });
  mkdirSync(join(ROOT, "data", "run-input"), { recursive: true });
  const file = join(ROOT, "data", "run-input", `${runId}.json`);
  writeFileSync(
    file,
    JSON.stringify({
      runId,
      flowId: flow.id,
      version: ver.version,
      testCaseId: tc?.id ?? null,
      steps: ver.steps,
      expected: ver.expected,
      params: merged,
      memory: store.listMemory(flow.id),
    }),
  );
  let job;
  try {
    job = startJob({
      id: "flowrun",
      ten: `Chạy flow: ${flow.name}${tc ? ` · ${tc.title}` : ""}`,
      args: [
        "test",
        "--project=procedure",
        "tests/custom/replay.spec.ts",
        REPORTERS,
        "--headed",
      ],
      env: {
        QA_RUN_INPUT: file,
        SLOWMO: process.env.QA_REPLAY_SLOWMO ?? "100",
        HOLD_MS: "10000",
        QA_FULLSCREEN: "1",
      },
    });
  } catch (e) {
    store.finishRun(runId, "Blocked", {
      failures: [{ title: "Không khởi động được", error: String(e.message) }],
    });
    throw e;
  }
  job.runId = runId;
  job.expected = ver.steps.map((s, i) => `${i + 1}. ${s.text}`);
  return job;
}

/** Dừng lượt chạy đang chạy: tắt tiến trình test rồi đóng báo cáo là Blocked (tiến trình bị kill nên không tự ghi kết quả). */
export function stopRun(id) {
  const job = [...jobs.values()].find((j) => j.runId === id && j.status === 'running');
  if (!job) throw new Error('Lượt chạy này không còn đang chạy');
  stopJob(job.id);
  const run = store.getRun(id);
  if (run?.status === 'Running') store.finishRun(id, 'Blocked', { failures: [{ title: 'Đã dừng', error: 'Người dùng dừng lượt chạy' }], counts: run.summary?.counts });
  return runDetail(id);
}

export function runDetail(id) {
  const run = store.getRun(id);
  if (!run) throw new Error('Không có lượt chạy này');
  run.flow_name = store.getFlow(run.flow_id)?.name ?? '';
  // Tiến trình chết giữa chừng (tắt máy, dừng tay) → không để kẹt "Running".
  const cur = currentJob();
  if (run.status === 'Running' && !(cur && cur.runId === id && cur.status === 'running')) {
    store.finishRun(id, 'Blocked', { failures: [{ title: 'Lượt chạy bị dừng giữa chừng', error: 'Không có tiến trình đang chạy.' }] });
    return store.getRun(id);
  }
  return run;
}

/** Trạng thái quay cho giao diện: bước (bỏ ảnh trạng thái nặng) + nhận định tức thời của máy (không gọi AI). */
export function recStatus() {
  const st = recorder.status();
  if (!st.recording) return st;
  const { allSteps, ...rest } = st;
  const light = (list) => list.map(({ before, after, ...x }) => x);
  return { ...rest, steps: light(rest.steps), insights: liveInsights(allSteps, observeFacts(allSteps)) };
}

/** Xem lại một bản quay (sau khi dừng): bước nhẹ + số trang đã đi qua. */
export function recordingReview(id) {
  const rec = recorder.get(id);
  const steps = rec.steps.map(({ before, after, ...x }) => x);
  return { ...rec, steps, pages: [...new Set(rec.steps.filter((x) => x.act?.type === 'nav').map((x) => x.url))].length };
}

/** Phân tích đã có (cache) hoặc chạy phân tích máy cho bản quay này. */
export async function analysisFor(id) {
  return analyses.get(id) ?? analyzeRecordingById({ id });
}

export function renameFlow({ id, name }) {
  if (!String(name ?? '').trim()) throw new Error('Tên không được trống');
  store.renameFlow(Number(id), name);
  return { ok: true };
}

/** Tài khoản đã nhớ (không bao giờ trả mật khẩu ra ngoài). */
export function credentialsInfo() {
  if (!existsSync(CRED_FILE)) return { saved: false };
  try { const j = JSON.parse(readFileSync(CRED_FILE, 'utf8')); return { saved: !!j.username, username: j.username, hasTotp: !!j.totpSecret, local: j.local === true, savedAt: j.savedAt ?? statSync(CRED_FILE).mtime.toISOString() }; } catch { return { saved: false }; }
}
/** Lưu tài khoản tester (và secret OTP nếu có) vào .auth/credentials.json; phiên cũ của tài khoản trước bị bỏ. Không trả mật khẩu ra ngoài. */
export function saveCredentials({ username, password, totpSecret, local }) {
  username = String(username ?? '').trim(); password = String(password ?? '');
  totpSecret = String(totpSecret ?? '').replace(/\s+/g, '').toUpperCase();
  let old = {}; try { old = JSON.parse(readFileSync(CRED_FILE, 'utf8')); } catch { /* chưa lưu */ }
  if (!password && old.username === username) password = old.password ?? ''; // để trống = giữ mật khẩu cũ
  if (!totpSecret && old.username === username) totpSecret = old.totpSecret ?? '';
  if (!username || !password) throw new Error('Nhập đủ tên đăng nhập và mật khẩu.');
  if (totpSecret && !/^[A-Z2-7]+=*$/.test(totpSecret)) throw new Error('Secret OTP phải là chuỗi base32 (chữ A–Z và số 2–7).');
  mkdirSync(join(ROOT, '.auth'), { recursive: true });
  writeFileSync(CRED_FILE, JSON.stringify({ username, password, ...(totpSecret ? { totpSecret } : {}), ...(local === true ? { local: true } : {}), savedAt: new Date().toISOString() }, null, 2));
  for (const f of [USER_STATE, USER_SESSION]) rmSync(f, { force: true });
  return credentialsInfo();
}

/** Đổi BASE_URL trong .env (chỉ staging được phép). Có hiệu lực sau khi khởi động lại web. */
export function saveBaseUrl({ url }) {
  let u; try { u = new URL(String(url ?? '').trim()); } catch { throw new Error('Địa chỉ không hợp lệ — dán cả địa chỉ, bắt đầu bằng https://'); }
  if (u.protocol !== 'https:' || !ALLOWED_HOST.test(u.hostname)) throw new Error('Chỉ nhận môi trường staging (…stg.ehiring.com.vn hoặc …stg.talentx.vn).');
  const file = join(ROOT, '.env'); const line = `BASE_URL=${u.origin}`;
  const cur = existsSync(file) ? readFileSync(file, 'utf8') : '';
  writeFileSync(file, /^BASE_URL=.*$/m.test(cur) ? cur.replace(/^BASE_URL=.*$/m, line) : cur + (cur && !cur.endsWith('\n') ? '\n' : '') + line + '\n');
  return { ok: true, baseUrl: u.origin, restart: u.origin !== BASE_URL };
}
export function forgetCredentials() {
  for (const f of [CRED_FILE, USER_STATE, USER_SESSION]) rmSync(f, { force: true });
  return { ok: true };
}

export function environment() {
  const u = new URL(BASE_URL);
  return { baseUrl: BASE_URL, host: u.host, allowedHosts: ALLOWED_HOST.source, user: process.env.QA_USERNAME ?? '', db: 'data/qa.db', credentials: credentialsInfo(), navMap: existsSync(join(ROOT, '.nav-map.json')), recording: recorder.status().recording === true };
}
