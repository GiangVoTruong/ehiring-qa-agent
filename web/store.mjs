// Bộ nhớ lâu dài: SQLite có sẵn trong Node (node:sqlite, không cần cài thêm). File: data/qa.db
// Lưu flow + phiên bản, quy tắc nghiệp vụ (kèm mức xác minh), test case, câu hỏi, lịch sử chạy. Bản quay thô nằm ở recordings/.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const RULE_STATUS = ['Observed', 'Inferred', 'Needs verification', 'Confirmed'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS flows (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, module TEXT, url TEXT, description TEXT,
  signature TEXT, status TEXT NOT NULL DEFAULT 'draft', current_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS flow_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, flow_id INTEGER NOT NULL REFERENCES flows(id), version INTEGER NOT NULL,
  state TEXT NOT NULL,               -- current | proposed | superseded | rejected
  steps_json TEXT NOT NULL, expected_json TEXT NOT NULL, params_json TEXT, analysis_json TEXT,
  source_recording TEXT, note TEXT, created_at TEXT NOT NULL, UNIQUE(flow_id, version));
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT, flow_id INTEGER NOT NULL REFERENCES flows(id), version INTEGER NOT NULL,
  kind TEXT, statement TEXT NOT NULL, status TEXT NOT NULL, evidence_json TEXT, source TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS test_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT, flow_id INTEGER NOT NULL REFERENCES flows(id), kind TEXT NOT NULL, title TEXT NOT NULL,
  variant_json TEXT, expected TEXT, requires_permission INTEGER NOT NULL DEFAULT 0, executable INTEGER NOT NULL DEFAULT 0,
  note TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, flow_id INTEGER NOT NULL REFERENCES flows(id), text TEXT NOT NULL, why TEXT,
  answer TEXT, state TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, flow_id INTEGER NOT NULL, version INTEGER NOT NULL, test_case_id INTEGER, started_at TEXT NOT NULL,
  finished_at TEXT, status TEXT NOT NULL, summary_json TEXT, params_json TEXT);
CREATE TABLE IF NOT EXISTS run_steps (
  run_id TEXT NOT NULL REFERENCES runs(id), idx INTEGER NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
  classification TEXT, error TEXT, evidence_json TEXT, duration_ms INTEGER, PRIMARY KEY (run_id, idx));
`;

const now = () => new Date().toISOString();
const j = (v) => JSON.stringify(v ?? null);
const p = (s) => (s == null ? null : JSON.parse(s));

export function openStore(file = 'data/qa.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  const q = (sql) => db.prepare(sql);

  const flowRow = (r) => r && { ...r };
  const api = {
    db,
    close: () => db.close(),

    // ---- Flow + phiên bản ----
    createFlow({ name, module, url, description, signature, steps, expected, params, analysis, sourceRecording }) {
      const t = now();
      const id = Number(q('INSERT INTO flows (name,module,url,description,signature,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(name, module ?? '', url ?? '', description ?? '', signature ?? '', t, t).lastInsertRowid);
      q('INSERT INTO flow_versions (flow_id,version,state,steps_json,expected_json,params_json,analysis_json,source_recording,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(id, 1, 'current', j(steps), j(expected), j(params), j(analysis), sourceRecording ?? null, 'Tạo từ bản quay', t);
      return id;
    },
    getFlow(id) {
      const f = flowRow(q('SELECT * FROM flows WHERE id=?').get(id));
      if (!f) return null;
      const versions = q('SELECT id,version,state,source_recording,note,created_at FROM flow_versions WHERE flow_id=? ORDER BY version DESC').all(id);
      return { ...f, versions };
    },
    getVersion(flowId, version) {
      const r = q('SELECT * FROM flow_versions WHERE flow_id=? AND version=?').get(flowId, version);
      return r && { ...r, steps: p(r.steps_json), expected: p(r.expected_json), params: p(r.params_json), analysis: p(r.analysis_json) };
    },
    listFlows() {
      return q(`SELECT f.*, (SELECT COUNT(*) FROM runs r WHERE r.flow_id=f.id) AS runs,
        (SELECT json_array_length(v.steps_json) FROM flow_versions v WHERE v.flow_id=f.id AND v.version=f.current_version) AS step_count,
        (SELECT COUNT(*) FROM runs r WHERE r.flow_id=f.id AND r.status='Passed') AS passed,
        (SELECT COUNT(*) FROM runs r WHERE r.flow_id=f.id AND r.status!='Running') AS finished,
        (SELECT started_at FROM runs r WHERE r.flow_id=f.id ORDER BY started_at DESC LIMIT 1) AS last_run_at,
        (SELECT status FROM runs r WHERE r.flow_id=f.id ORDER BY started_at DESC LIMIT 1) AS last_status,
        (SELECT COUNT(*) FROM rules x WHERE x.flow_id=f.id AND x.status IN ('Inferred','Needs verification')) AS unverified,
        (SELECT COUNT(*) FROM flow_versions v WHERE v.flow_id=f.id AND v.state='proposed') AS proposals
        FROM flows f ORDER BY f.updated_at DESC`).all();
    },
    /** Thêm phiên bản mới. state 'proposed' = chờ người xác nhận, không ghi đè bản đang dùng. */
    addVersion(flowId, { steps, expected, params, analysis, sourceRecording, note, state = 'proposed' }) {
      const next = (q('SELECT MAX(version) AS v FROM flow_versions WHERE flow_id=?').get(flowId).v ?? 0) + 1;
      q('INSERT INTO flow_versions (flow_id,version,state,steps_json,expected_json,params_json,analysis_json,source_recording,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(flowId, next, state, j(steps), j(expected), j(params), j(analysis), sourceRecording ?? null, note ?? '', now());
      q('UPDATE flows SET updated_at=? WHERE id=?').run(now(), flowId);
      return next;
    },
    /** Chấp nhận một phiên bản đề xuất → thành bản đang dùng, bản cũ chuyển superseded (vẫn giữ lại). */
    acceptVersion(flowId, version) {
      const v = q('SELECT state FROM flow_versions WHERE flow_id=? AND version=?').get(flowId, version);
      if (!v || v.state !== 'proposed') throw new Error('Chỉ chấp nhận được phiên bản đang ở trạng thái đề xuất');
      q("UPDATE flow_versions SET state='superseded' WHERE flow_id=? AND state='current'").run(flowId);
      q("UPDATE flow_versions SET state='current' WHERE flow_id=? AND version=?").run(flowId, version);
      q('UPDATE flows SET current_version=?, updated_at=? WHERE id=?').run(version, now(), flowId);
    },
    /** Cập nhật phân tích (và mô tả flow) của một phiên bản, vd sau khi AI phân tích sâu. */
    setAnalysis(flowId, version, analysis, description) {
      q('UPDATE flow_versions SET analysis_json=? WHERE flow_id=? AND version=?').run(j(analysis), flowId, version);
      if (description != null) q('UPDATE flows SET description=? WHERE id=?').run(description, flowId);
    },
    rejectVersion(flowId, version) { q("UPDATE flow_versions SET state='rejected' WHERE flow_id=? AND version=? AND state='proposed'").run(flowId, version); },
    renameFlow(id, name) { q('UPDATE flows SET name=?, updated_at=? WHERE id=?').run(String(name).trim().slice(0, 120), now(), id); },
    setFlowStatus(id, status) { q('UPDATE flows SET status=?, updated_at=? WHERE id=?').run(status, now(), id); },

    /** Xoá hẳn một flow cùng phiên bản, quy tắc, test case, câu hỏi và lịch sử chạy. Trả về id các lượt chạy đã xoá (để xoá ảnh). */
    deleteFlow(id) {
      const runIds = q('SELECT id FROM runs WHERE flow_id=?').all(id).map((r) => r.id);
      for (const r of runIds) q('DELETE FROM run_steps WHERE run_id=?').run(r);
      for (const t of ['runs', 'rules', 'test_cases', 'questions', 'flow_versions']) db.prepare(`DELETE FROM ${t} WHERE flow_id=?`).run(id);
      q('DELETE FROM flows WHERE id=?').run(id);
      return runIds;
    },

    // ---- Quy tắc nghiệp vụ ----
    addRules(flowId, version, rules) {
      const ins = q('INSERT INTO rules (flow_id,version,kind,statement,status,evidence_json,source,created_at) VALUES (?,?,?,?,?,?,?,?)');
      for (const r of rules) {
        if (!RULE_STATUS.includes(r.status)) throw new Error('Trạng thái quy tắc không hợp lệ: ' + r.status);
        ins.run(flowId, version, r.kind ?? '', r.statement, r.status, j(r.evidence), r.source ?? 'ai', now());
      }
    },
    listRules(flowId) { return q('SELECT * FROM rules WHERE flow_id=? ORDER BY id').all(flowId).map((r) => ({ ...r, evidence: p(r.evidence_json) })); },
    /** Chỉ người dùng (hoặc lượt chạy kiểm chứng) mới nâng lên Confirmed. */
    setRuleStatus(id, status) {
      if (!RULE_STATUS.includes(status)) throw new Error('Trạng thái không hợp lệ');
      q('UPDATE rules SET status=? WHERE id=?').run(status, id);
    },

    // ---- Test case + câu hỏi ----
    addTestCases(flowId, cases) {
      const ins = q('INSERT INTO test_cases (flow_id,kind,title,variant_json,expected,requires_permission,executable,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
      for (const c of cases) ins.run(flowId, c.kind, c.title, j(c.variant), c.expected ?? '', c.requiresPermission ? 1 : 0, c.executable ? 1 : 0, c.note ?? '', now());
    },
    listTestCases(flowId) { return q('SELECT * FROM test_cases WHERE flow_id=? ORDER BY id').all(flowId).map((c) => ({ ...c, variant: p(c.variant_json) })); },
    getTestCase(id) { const c = q('SELECT * FROM test_cases WHERE id=?').get(id); return c && { ...c, variant: p(c.variant_json) }; },
    addQuestions(flowId, qs) {
      const ins = q('INSERT INTO questions (flow_id,text,why,created_at) VALUES (?,?,?,?)');
      for (const x of qs) ins.run(flowId, x.text, x.why ?? '', now());
    },
    listQuestions(flowId) { return q('SELECT * FROM questions WHERE flow_id=? ORDER BY id').all(flowId); },
    answerQuestion(id, answer, state = 'answered') { q('UPDATE questions SET answer=?, state=? WHERE id=?').run(answer ?? '', state, id); },

    // ---- Lịch sử chạy ----
    startRun({ id, flowId, version, testCaseId, params }) {
      q('INSERT INTO runs (id,flow_id,version,test_case_id,started_at,status,params_json) VALUES (?,?,?,?,?,?,?)').run(id, flowId, version, testCaseId ?? null, now(), 'Running', j(params));
    },
    finishRun(id, status, summary) {
      q('UPDATE runs SET finished_at=?, status=?, summary_json=? WHERE id=?').run(now(), status, j(summary), id);
    },
    addRunStep(runId, s) {
      q('INSERT OR REPLACE INTO run_steps (run_id,idx,title,status,classification,error,evidence_json,duration_ms) VALUES (?,?,?,?,?,?,?,?)')
        .run(runId, s.idx, s.title, s.status, s.classification ?? null, s.error ?? null, j(s.evidence), s.durationMs ?? 0);
    },
    getRun(id) {
      const r = q('SELECT * FROM runs WHERE id=?').get(id);
      if (!r) return null;
      return { ...r, summary: p(r.summary_json), params: p(r.params_json), steps: q('SELECT * FROM run_steps WHERE run_id=? ORDER BY idx').all(id).map((s) => ({ ...s, evidence: p(s.evidence_json) })) };
    },
    listRuns(flowId, limit = 30) {
      const rows = flowId
        ? q('SELECT r.*, f.name AS flow_name FROM runs r JOIN flows f ON f.id=r.flow_id WHERE r.flow_id=? ORDER BY r.started_at DESC LIMIT ?').all(flowId, limit)
        : q('SELECT r.*, f.name AS flow_name FROM runs r JOIN flows f ON f.id=r.flow_id ORDER BY r.started_at DESC LIMIT ?').all(limit);
      return rows.map((r) => ({ ...r, summary: p(r.summary_json) }));
    },
    dashboard() {
      const n = (sql) => q(sql).get().n;
      const byStatus = q("SELECT status, COUNT(*) AS n FROM runs WHERE status != 'Running' GROUP BY status").all();
      return {
        flows: n('SELECT COUNT(*) AS n FROM flows'), runs: n("SELECT COUNT(*) AS n FROM runs WHERE status != 'Running'"),
        byStatus: Object.fromEntries(byStatus.map((x) => [x.status, x.n])),
        needVerification: q(`SELECT f.id, f.name, COUNT(*) AS n FROM rules r JOIN flows f ON f.id=r.flow_id WHERE r.status IN ('Inferred','Needs verification') GROUP BY f.id ORDER BY n DESC LIMIT 10`).all(),
        recentFailures: q(`SELECT r.id, f.name AS flow_name, r.started_at, r.summary_json FROM runs r JOIN flows f ON f.id=r.flow_id WHERE r.status IN ('Failed') ORDER BY r.started_at DESC LIMIT 8`).all().map((r) => ({ ...r, summary: p(r.summary_json) })),
        openQuestions: n("SELECT COUNT(*) AS n FROM questions WHERE state='open'"),
        proposals: n("SELECT COUNT(*) AS n FROM flow_versions WHERE state='proposed'"),
      };
    },
  };
  return api;
}
