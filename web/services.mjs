// Nghiệp vụ "quay → phân tích → lưu flow → chạy lại". server.mjs chỉ định tuyến HTTP tới các hàm ở đây.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ask } from './ai.mjs';
import { analyzeRecording, buildExpected, cleanExpected, deriveTestCases, findSimilar, flowSignature, liveInsights, observeFacts } from './analysis.mjs';
import { ALLOWED_HOST, BASE_URL, CRED_FILE, KNOWLEDGE, ROOT, USER_SESSION, USER_STATE } from './config.mjs';
import { existsSync, statSync } from 'node:fs';
import { REPORTERS, currentJob, startJob } from './jobs.mjs';
import { createRecorder } from './recorder.mjs';
import { openStore } from './store.mjs';

export const recorder = createRecorder({ ROOT, BASE_URL, ALLOWED_HOST, CRED_FILE, USER_STATE, USER_SESSION });
export const store = openStore(join(ROOT, 'data', 'qa.db'));

const analyses = new Map(); // phân tích gần nhất của từng bản quay, đợi người dùng lưu thành flow

const isNav = (s) => s.act?.type === 'nav' && !/dashboard/.test(s.url || '') && (s.url || '') !== '/';

/** Bước 1 (máy, miễn phí): dữ kiện quan sát + kết quả mong đợi + flow tương tự + test case dẫn xuất. Bước 2 (AI, tuỳ chọn): gom bước, suy luận, câu hỏi. */
export async function analyzeRecordingById({ id, provider = 'none' }) {
  const rec = recorder.get(id);
  const facts = observeFacts(rec.steps);
  const expected = buildExpected(rec.steps);
  const signature = flowSignature(expected);
  const similar = findSimilar(store.listFlows(), { name: rec.name, signature });
  let ai = null;
  if (provider !== 'none') {
    const cap = provider === 'ollama' ? [1200, 5000] : [4000, 40000];
    const docs = readdirSync(KNOWLEDGE).filter((f) => f.endsWith('.md'))
      .map((f) => `== ${f} ==\n${readFileSync(join(KNOWLEDGE, f), 'utf8').slice(0, cap[0])}`).join('\n\n').slice(0, cap[1]);
    ai = await analyzeRecording({ rec, facts, similar, docs, ask, provider });
  }
  const nav = rec.steps.find(isNav);
  const out = {
    recId: id, name: rec.name, module: (nav?.url ?? '').split('/').filter(Boolean)[0] ?? '', url: nav?.url ?? '', signature, similar,
    steps: rec.steps.map((s, i) => ({ i, text: s.text, effects: s.effects, toasts: s.toasts ?? [], notes: s.notes ?? [], shot: s.shot ?? null, dataChoice: !!s.act?.dataChoice })),
    notes: rec.notes, facts, expected, derived: deriveTestCases(rec.steps, facts, expected), ai, at: new Date().toISOString(),
  };
  analyses.set(id, out);
  return out;
}

/** Lưu phân tích thành flow mới, hoặc thêm PHIÊN BẢN ĐỀ XUẤT vào flow đã có (không ghi đè). */
export function saveFlow({ recId, mode = 'new', flowId, name, cases }) {
  const a = analyses.get(recId);
  if (!a) throw new Error('Chưa phân tích bản quay này — hãy phân tích trước khi lưu.');
  // Bỏ ảnh trạng thái "trước" (đã dùng để tìm dữ kiện) cho nhẹ; ảnh bằng chứng tham chiếu theo bản quay.
  const steps = recorder.get(recId).steps.map(({ before, ...s }) => ({ ...s, shot: s.shot ? `${recId}/${s.shot.replace('.jpg', '')}` : null }));
  const v = a.ai?.value;
  const analysis = { summary: v?.summary ?? '', businessSteps: v?.businessSteps ?? [], parameters: v?.parameters ?? [], problems: a.ai?.problems ?? [], notes: a.notes, recId };
  const rules = [...a.facts, ...(v?.rules ?? [])];
  if (mode === 'version') {
    const id = Number(flowId);
    if (!store.getFlow(id)) throw new Error('Không có flow này');
    const version = store.addVersion(id, { steps, expected: a.expected, params: {}, analysis, sourceRecording: recId, note: `Quay lại ${a.at.slice(0, 16)} — chờ xác nhận` });
    store.addRules(id, version, rules);
    return { flowId: id, version, proposed: true };
  }
  const id = store.createFlow({ name: name?.trim() || a.name, module: a.module, url: a.url, description: analysis.summary, signature: a.signature, steps, expected: a.expected, params: {}, analysis, sourceRecording: recId });
  store.addRules(id, 1, rules);
  const allCases = [...a.derived, ...(v?.testCases ?? [])];
  store.addTestCases(id, Array.isArray(cases) ? allCases.filter((_, i) => cases.includes(i)) : allCases); // chỉ lưu test case người dùng đã chọn
  store.addQuestions(id, v?.questions ?? []);
  return { flowId: id, version: 1, proposed: false };
}

/** Nhờ AI phân tích sâu một flow đã lưu: thêm quy tắc suy luận / câu hỏi / test case (dữ kiện máy đã có sẵn, không lặp). */
export async function enrichFlow({ flowId, provider = 'claude' }) {
  const flow = store.getFlow(Number(flowId));
  if (!flow) throw new Error('Không có flow này');
  const ver = store.getVersion(flow.id, flow.current_version);
  if (!ver.analysis?.recId) throw new Error('Flow này không còn bản quay gốc để phân tích.');
  if (store.listRules(flow.id).some((r) => r.source === 'ai')) throw new Error('Luồng này đã được AI phân tích rồi.');
  const a = await analyzeRecordingById({ id: ver.analysis.recId, provider });
  if (!a.ai?.ok) throw new Error('AI trả kết quả không đọc được, thử lại sau.');
  const v = a.ai.value;
  store.addRules(flow.id, ver.version, v.rules);
  store.addQuestions(flow.id, v.questions);
  store.addTestCases(flow.id, v.testCases);
  store.setAnalysis(flow.id, ver.version, { ...ver.analysis, summary: v.summary, businessSteps: v.businessSteps, parameters: v.parameters, problems: a.ai.problems }, v.summary);
  return { rules: v.rules.length, questions: v.questions.length, testCases: v.testCases.length };
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
export function runSavedFlow({ flowId, testCaseId, params = {}, allowWrites, allowRisky }) {
  const flow = store.getFlow(Number(flowId));
  if (!flow) throw new Error('Không có flow này');
  const ver = store.getVersion(flow.id, flow.current_version);
  const tc = testCaseId ? store.getTestCase(Number(testCaseId)) : null;
  ver.expected = cleanExpected(ver.expected); // API đăng nhập không phải kết quả cần kiểm
  const writes = ver.expected.writes ?? [];
  if ((writes.length || tc?.requires_permission) && !allowWrites) {
    throw new Error(`Flow này ghi dữ liệu (${[...new Set(writes.map((w) => `${w.method} ${w.path}`))].join(', ') || 'test case có thể thay đổi dữ liệu'}). Cần xác nhận cho phép chạy trên môi trường test.`);
  }
  const merged = { ...params, ...(tc?.variant ?? {}), allowRisky: !!allowRisky };
  const runId = `r${Date.now()}`;
  store.startRun({ id: runId, flowId: flow.id, version: ver.version, testCaseId: tc?.id, params: merged });
  mkdirSync(join(ROOT, 'data', 'run-input'), { recursive: true });
  const file = join(ROOT, 'data', 'run-input', `${runId}.json`);
  writeFileSync(file, JSON.stringify({ runId, flowId: flow.id, version: ver.version, testCaseId: tc?.id ?? null, steps: ver.steps, expected: ver.expected, params: merged }));
  let job;
  try {
    job = startJob({
      id: 'flowrun', ten: `Chạy flow: ${flow.name}${tc ? ` · ${tc.title}` : ''}`,
      args: ['test', '--project=procedure', 'tests/custom/replay.spec.ts', REPORTERS, '--headed'],
      env: { QA_RUN_INPUT: file, SLOWMO: '300', HOLD_MS: '10000', QA_FULLSCREEN: '1' },
    });
  } catch (e) { store.finishRun(runId, 'Blocked', { failures: [{ title: 'Không khởi động được', error: String(e.message) }] }); throw e; }
  job.runId = runId;
  job.expected = ver.steps.map((s, i) => `${i + 1}. ${s.text}`);
  return job;
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
export async function analysisFor(id) { return analyses.get(id) ?? analyzeRecordingById({ id, provider: 'none' }); }

export function renameFlow({ id, name }) {
  if (!String(name ?? '').trim()) throw new Error('Tên không được trống');
  store.renameFlow(Number(id), name);
  return { ok: true };
}

/** Kiến thức AI đã tích luỹ, gom theo module: các trường đã thấy trên form + quy tắc (kèm mức tin cậy, nguồn, bằng chứng). */
export function knowledge() {
  const modules = new Map();
  for (const f of store.listFlows()) {
    const key = f.module || '(chưa rõ module)';
    const m = modules.get(key) ?? { name: key, flows: [], fields: new Map(), rules: [] };
    modules.set(key, m);
    m.flows.push({ id: f.id, name: f.name });
    const ver = store.getVersion(f.id, f.current_version);
    for (const s of ver.steps) for (const fl of s.after?.fields ?? []) {
      const x = m.fields.get(fl.label) ?? { label: fl.label, kind: fl.kind, required: false, flows: new Set() };
      x.required ||= fl.required; x.flows.add(f.name); m.fields.set(fl.label, x);
    }
    for (const r of store.listRules(f.id)) m.rules.push({ id: r.id, flowId: f.id, flow: f.name, kind: r.kind, statement: r.statement, status: r.status, evidence: r.evidence, source: r.source, createdAt: r.created_at });
  }
  return [...modules.values()].map((m) => ({ ...m, fields: [...m.fields.values()].map((x) => ({ ...x, flows: [...x.flows] })), rules: m.rules.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
}

/** Tài khoản đã nhớ (không bao giờ trả mật khẩu ra ngoài). */
export function credentialsInfo() {
  if (!existsSync(CRED_FILE)) return { saved: false };
  try { const j = JSON.parse(readFileSync(CRED_FILE, 'utf8')); return { saved: !!j.username, username: j.username, savedAt: j.savedAt ?? statSync(CRED_FILE).mtime.toISOString() }; } catch { return { saved: false }; }
}
export function forgetCredentials() {
  for (const f of [CRED_FILE, USER_STATE, USER_SESSION]) rmSync(f, { force: true });
  return { ok: true };
}

export function environment() {
  const u = new URL(BASE_URL);
  return { baseUrl: BASE_URL, host: u.host, allowedHosts: ALLOWED_HOST.source, user: process.env.QA_USERNAME ?? '', db: 'data/qa.db', credentials: credentialsInfo(), navMap: existsSync(join(ROOT, '.nav-map.json')), recording: recorder.status().recording === true };
}
