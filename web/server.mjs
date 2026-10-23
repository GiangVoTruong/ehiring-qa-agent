// Web nội bộ: quay thao tác → học → chạy lại flow, và chạy các luồng có sẵn. `npm run web` rồi mở http://127.0.0.1:4310
// File này chỉ định tuyến HTTP (chỉ lắng nghe 127.0.0.1); nghiệp vụ nằm ở services.mjs, jobs.mjs, procedure.mjs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { AUTH_SESSION, AUTH_STATE, BASE_URL, KNOWLEDGE, PORT, ROOT } from './config.mjs';
import { currentJob, flowCatalog, fullFlow, jobs, publicJob, readRegistry, runCleanup, runFlow, runPortalFill, stopJob } from './jobs.mjs';
import { ACTIONS, deleteProc, parseProcedure, readProcs, resumeProcedure, runProcedure, saveProc } from './procedure.mjs';
import { learnMenu } from './navmap.mjs';
import { defaultRepo, knowledgeStatus } from './knowledge-status.mjs';
import { readFileSync as readFs, existsSync as existsFs } from 'node:fs';
import { summarizeKnowledge } from './knowledge-summary.mjs';
import { updateKnowledge } from './knowledge-update.mjs';
import { analysisFor, analyzeRecordingById, deleteFlow, environment, credentialsInfo, forgetCredentials, saveCredentials, saveBaseUrl, flowDetail, recStatus, recorder, recordingReview, renameFlow, runDetail, runSavedFlow, saveFlow, stopRun, store } from './services.mjs';

const KNOWLEDGE_FILE = /^[\w.-]+\.md$/;
const ok = { ok: true };
// Bảng định tuyến: "METHOD /đường-dẫn" → (body, query) => kết quả JSON. Lỗi ném ra được trả về HTTP 500 kèm thông báo.
/** Mọi tài liệu nghiệp vụ trong knowledge/: tên (tiêu đề đầu tiên), mốc học và trạng thái so với develop (nếu so được). */
function knowledgeList() {
  const st = knowledgeStatus({ repo: defaultRepo() });
  const by = Object.fromEntries(st.files.map((f) => [f.file, f]));
  const files = readdirSync(KNOWLEDGE).filter((f) => f.endsWith('.md')).sort().map((file) => {
    const text = readFileSync(join(KNOWLEDGE, file), 'utf8');
    const title = text.split(String.fromCharCode(10)).find((l) => l.startsWith('# '))?.slice(2).trim() || file;
    const first = text.split(String.fromCharCode(10)).find((l) => l.startsWith('flow:'));
    return { file, title, status: by[file]?.status ?? 'unknown', learnedCommit: by[file]?.learnedCommit ?? '', flow: first ? first.slice(5).trim() : '' };
  });
  return { head: st.head, files };
}

const routes = {
  // --- Chạy luồng có sẵn / quy trình tự soạn ---
  'GET /api/flows': () => ({ full: fullFlow(), flows: flowCatalog(), registry: readRegistry().length, running: currentJob()?.status === 'running' ? publicJob(currentJob()) : null }),
  'POST /api/run': (b) => publicJob(runFlow(b)),
  'POST /api/proc/parse': (b) => ({ ...parseProcedure(b.text), actions: ACTIONS.map(({ id, nhom, nhan }) => ({ id, nhom, nhan })) }),
  'POST /api/proc/resume': (b) => publicJob(resumeProcedure(b)),
  'POST /api/proc/run': (b) => publicJob(runProcedure(b)),
  'GET /api/procs': () => readProcs(),
  'POST /api/procs': (b) => saveProc(b),
  'DELETE /api/procs': (b) => deleteProc(b),
  'POST /api/portal/fill': (b) => publicJob(runPortalFill(b)),
  'POST /api/cleanup': () => publicJob(runCleanup()),
  'POST /api/stop': (b) => stopJob(b.id),
  'GET /api/job': (_, q) => { const j = jobs.get(q.get('id')); if (!j) throw new Error('không có lượt chạy'); return publicJob(j); },
  'GET /api/jobs': () => [...jobs.values()].slice(-15).reverse().map((j) => ({ ...publicJob(j), log: undefined })),

  // --- Quay thao tác ---
  'POST /api/rec/start': (b) => recorder.start(b),
  'POST /api/rec/stop': async () => (await recorder.stop()) ?? { error: 'không có bản ghi đang quay' },
  'POST /api/rec/pause': () => recorder.pause(),
  'POST /api/rec/resume': () => recorder.resume(),
  'POST /api/rec/note': (b) => recorder.addNote(b.text),
  'GET /api/rec/status': () => recStatus(),
  'GET /api/rec': (_, q) => recordingReview(q.get('id')),
  'GET /api/rec/analysis': (_, q) => analysisFor(q.get('id')),
  'POST /api/rec/analyze': (b) => analyzeRecordingById(b),

  // --- Thư viện flow ---
  'POST /api/flows/save': (b) => saveFlow(b),
  'GET /api/flows/list': () => store.listFlows(),
  'GET /api/dashboard': () => store.dashboard(),
  'GET /api/flow': (_, q) => flowDetail(Number(q.get('id'))),
  'DELETE /api/flow': (b) => deleteFlow(b),
  'POST /api/flow/rename': (b) => renameFlow(b),
  'GET /api/knowledge/status': () => { const repo = defaultRepo(); return knowledgeStatus({ repo }); },
  'GET /api/knowledge/doc': (_, q) => { const f = String(q.get('file') ?? ''); const p = join(KNOWLEDGE, f); if (!KNOWLEDGE_FILE.test(f) || !existsFs(p)) throw new Error('Không có tài liệu này'); return { file: f, text: readFs(p, 'utf8') }; },
  'GET /api/knowledge/list': () => knowledgeList(),
  'POST /api/knowledge/summary': (b) => summarizeKnowledge(String(b.file ?? ''), { force: !!b.force }),
  'POST /api/knowledge/update': (b) => updateKnowledge(String(b.file ?? '')),
  'GET /api/env': () => environment(),
  'GET /api/credentials': () => credentialsInfo(),
  'POST /api/credentials': (b) => saveCredentials(b),
  'POST /api/settings/base-url': (b) => saveBaseUrl(b),
  'DELETE /api/credentials': () => forgetCredentials(),
  'GET /api/runs': (_, q) => store.listRuns(q.get('flowId') ? Number(q.get('flowId')) : null, 100),
  'POST /api/flow/rule': (b) => { store.setRuleStatus(Number(b.id), b.status); return ok; },
  'POST /api/flow/question': (b) => { store.answerQuestion(Number(b.id), b.answer, b.state || 'answered'); return ok; },
  'POST /api/flow/status': (b) => { store.setFlowStatus(Number(b.id), b.status === 'confirmed' ? 'confirmed' : 'draft'); return ok; },
  'POST /api/flow/version': (b) => { (b.action === 'accept' ? store.acceptVersion : store.rejectVersion)(Number(b.flowId), Number(b.version)); return ok; },
  'POST /api/flow/run': (b) => publicJob(runSavedFlow(b)),
  'POST /api/run/stop': (b) => stopRun(b.id),
  'GET /api/run': (_, q) => runDetail(q.get('id')),
};

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': `${type}; charset=utf-8` });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((done) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => done(b ? JSON.parse(b) : {})); });

/** Ảnh bằng chứng: chỉ phục vụ .jpg trong data/shots và data/runs, tên đã kiểm tra. */
function serveShot(url, res) {
  const m = /^\/(shots|runshots)\/([\w-]+)\/(\d+)\.jpg$/.exec(url);
  if (!m) return false;
  const f = join(ROOT, 'data', m[1] === 'shots' ? 'shots' : 'runs', m[2], `${m[3]}.jpg`);
  if (!existsSync(f)) { send(res, 404, { error: 'không có ảnh' }); return true; }
  res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'max-age=300' });
  res.end(readFileSync(f));
  return true;
}

const TYPES = { js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml' };
/** Tệp giao diện (web/ui/*.js|css|svg): chỉ tên đơn giản, không cho đi ra ngoài thư mục. */
function serveStatic(pathname, res) {
  const m = /^\/ui\/([\w.-]+)\.(js|css|svg)$/.exec(pathname);
  if (!m) return false;
  const f = join(ROOT, 'web', 'ui', `${m[1]}.${m[2]}`);
  if (!existsSync(f)) { send(res, 404, { error: 'không có tệp' }); return true; }
  res.writeHead(200, { 'content-type': `${TYPES[m[2]]}; charset=utf-8`, 'cache-control': 'no-cache' });
  res.end(readFileSync(f));
  return true;
}

createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) return send(res, 200, readFileSync(join(ROOT, 'web', 'ui', 'index.html'), 'utf8'), 'text/html');
    if (req.method === 'GET' && serveStatic(u.pathname, res)) return;
    if (req.method === 'GET' && serveShot(u.pathname, res)) return;
    const handler = routes[`${req.method} ${u.pathname}`];
    if (!handler) return send(res, 404, { error: 'not found' });
    send(res, 200, await handler(req.method === 'GET' ? {} : await readBody(req), u.searchParams));
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
}).on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`Cổng ${PORT} đang được dùng — web có thể đã chạy sẵn: mở http://127.0.0.1:${PORT}. Muốn chạy lại thì tắt tiến trình cũ (Windows: Get-NetTCPConnection -LocalPort ${PORT} | % { Stop-Process -Id $_.OwningProcess }) hoặc đặt WEB_PORT khác.`);
  process.exit(1);
}).listen(PORT, '127.0.0.1', () => console.log(`ehiring-autotest web: http://127.0.0.1:${PORT}`));

// Học đường vào trang bằng menu một lần (đọc-chỉ) để chạy lại bước "chuyển tới trang" như người dùng; chạy nền, lỗi thì bỏ qua.
if (!existsSync(join(ROOT, '.nav-map.json'))) learnMenu({ ROOT, BASE_URL, AUTH_STATE, AUTH_SESSION, KNOWLEDGE }).catch(() => undefined);
