import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOWED_HOST, ROOT } from './config.mjs';

// ---------- Chạy luồng (danh mục cố định, không nhận lệnh tuỳ ý) ----------
const PW_CLI = join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
const REGISTRY_FILE = join(ROOT, '.qa-registry.json');
const RUNS_FILE = join(ROOT, 'web', '.runs.json');

const GROUPS = {
  'tests/recruitment-requests/lifecycle.spec.ts': {
    nhom: 'Yêu cầu tuyển dụng (YCTD)',
    tao: 'Tạo 1 YCTD [AUTOTEST] (người duyệt/TA Admin = tài khoản QA); mail chỉ về hộp thư QA',
    uoc: '~12–25 giây',
  },
  'tests/recruitment-plans/lifecycle.spec.ts': {
    nhom: 'Luồng đầy đủ (như nút chạy full)',
    tao: 'Tạo 1 YCTD + 1 kế hoạch [AUTOTEST], chạy cả vòng đời; mail chỉ về hộp thư QA',
    uoc: '~1 phút',
  },
  'tests/seed.spec.ts': { nhom: 'Đăng nhập & môi trường', tao: 'Không tạo dữ liệu (chỉ mở danh sách YCTD)', uoc: '~5 giây' },
};

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, '/');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function flowCatalog() {
  const items = [];
  for (const [file, meta] of Object.entries(GROUPS)) {
    const abs = join(ROOT, file);
    if (!existsSync(abs)) continue;
    const src = readFileSync(abs, 'utf8');
    for (const m of src.matchAll(/^test\(\s*['"`]([^'"`]+)['"`]/gm)) {
      items.push({ id: `${file}::${m[1]}`, file, title: m[1], nhom: meta.nhom, tao: meta.tao, uoc: meta.uoc });
    }
  }
  return items;
}

export const readRegistry = () =>
  existsSync(REGISTRY_FILE)
    ? readFileSync(REGISTRY_FILE, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];

export const jobs = new Map();
let current = null;
export const currentJob = () => current;
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

function saveRuns() {
  const list = [...jobs.values()].slice(-30).map(({ child, ...j }) => ({ ...j, log: j.log.slice(-6000) }));
  try { writeFileSync(RUNS_FILE, JSON.stringify(list)); } catch { /* không quan trọng */ }
}
try {
  if (existsSync(RUNS_FILE)) for (const j of JSON.parse(readFileSync(RUNS_FILE, 'utf8'))) jobs.set(j.id, { ...j, status: j.status === 'running' ? 'stopped' : j.status });
} catch { /* bỏ qua */ }

// Lượt chạy đã ra kết quả (##RUN) nhưng tiến trình còn giữ cửa sổ Chrome để tester xem màn hình lỗi: coi như đã xong, không bắt chờ đóng cửa sổ.
const RUN_DONE = /##RUN\|[^|\n]*\|([A-Za-z ]+)/;
const finishedHolding = (j) => RUN_DONE.test(j.log);
export function startJob({ id, ten, args, env = {} }) {
  if (current && current.status === 'running' && finishedHolding(current)) { try { current.child?.kill(); } catch { /* đã thoát */ } }
  else if (current && current.status === 'running') throw new Error(`Đang chạy "${current.ten}" — chờ xong hoặc bấm Dừng.`);
  const job = { id: String(Date.now()), flowId: id, ten, status: 'running', log: '', started: Date.now(), ended: null, exit: null, created: [], summary: '' };
  const before = new Set(readRegistry().map((e) => e.id));
  const child = spawn(process.execPath, args[0]?.endsWith('.mjs') ? args : [PW_CLI, ...args], { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0', PW_OUTPUT_DIR: 'test-results-web', ...env }, windowsHide: true });
  job.child = child;
  const feed = (d) => { job.log = (job.log + String(d).replace(ANSI, '')).slice(-120_000); };
  child.stdout.on('data', feed);
  child.stderr.on('data', feed);
  child.on('close', (code) => {
    job.exit = code;
    job.ended = Date.now();
    if (job.status === 'running') job.status = code === 0 ? 'passed' : 'failed';
    job.created = readRegistry().filter((e) => !before.has(e.id)).map((e) => ({ flow: e.flow, code: e.code ?? '', title: e.title }));
    job.summary = (job.log.match(/\n\s*(\d+ (?:passed|failed|skipped|flaky)[^\n]*)/g) ?? []).map((s) => s.trim()).join(' · ');
    delete job.child;
    saveRuns();
  });
  jobs.set(job.id, job);
  current = job;
  return job;
}

// Tiến độ từng bước/test được đọc từ các dòng `##STEP|...` / `##TEST|...` do web/step-reporter.mjs in ra.
function parseProgress(log) {
  const steps = [];
  const tests = [];
  for (const line of log.split('\n')) {
    const p = line.trim().split('|');
    if (p[0] === '##STEP' && p[1] === 'begin') steps.push({ title: p[2], status: 'running' });
    else if (p[0] === '##STEP' && p[1] === 'end') {
      const s = [...steps].reverse().find((x) => x.title === p[2] && x.status === 'running');
      if (s) Object.assign(s, { status: p[3], ms: Number(p[4]) });
    } else if (p[0] === '##TEST' && p[1] === 'begin') tests.push({ title: p[2], status: 'running' });
    else if (p[0] === '##TEST' && p[1] === 'end') {
      const t = [...tests].reverse().find((x) => x.title === p[2] && x.status === 'running');
      if (t) Object.assign(t, { status: p[3] === 'passed' ? 'ok' : p[3] === 'skipped' ? 'skipped' : 'fail', ms: Number(p[4]) });
    }
  }
  return { steps, tests };
}

// Lượt chạy tự soạn lỗi/bị dừng: bước đầu tiên chưa "ok" là chỗ chạy tiếp được.
export function resumeInfo(j) {
  if (!j.procSteps || !j.expected || j.status === 'running' || j.status === 'passed') return null;
  const done = new Map(parseProgress(j.log).steps.map((s) => [s.title, s.status]));
  const from = j.expected.findIndex((label) => done.get(label) !== 'ok');
  return from < 0 ? null : { from, label: j.expected[from] };
}

export function publicJob(j) {
  const { child, procSteps, ...rest } = j;
  const run = j.status === 'running' && j.log.match(RUN_DONE); // đã có kết quả, chỉ còn giữ cửa sổ
  return {
    ...rest,
    ...(run ? { status: run[1].trim() === 'Failed' ? 'failed' : 'passed', holdingWindow: true } : {}),
    resume: resumeInfo(j),
    log: j.log.split('\n').filter((l) => !l.startsWith('##')).join('\n'),
    ...parseProgress(j.log),
    durationSec: Math.round(((j.ended ?? Date.now()) - j.started) / 1000),
  };
}

const FULL_SPEC = 'tests/recruitment-plans/plan-only.spec.ts';
const BRANCH_SPEC = 'tests/recruitment-requests/lifecycle.spec.ts';
export const REPORTERS = '--reporter=list,./web/step-reporter.mjs';

/** Luồng tuyển dụng đầy đủ: các bước lấy thẳng từ test.step trong spec (đổi tên ở spec là đổi trên web). */
export function fullFlow() {
  const src = existsSync(join(ROOT, FULL_SPEC)) ? readFileSync(join(ROOT, FULL_SPEC), 'utf8') : '';
  const steps = [...src.matchAll(/test\.step\(\s*'([^']+)'/g)].map((m) => m[1]);
  const branchSrc = existsSync(join(ROOT, BRANCH_SPEC)) ? readFileSync(join(ROOT, BRANCH_SPEC), 'utf8') : '';
  const branches = [...branchSrc.matchAll(/^test\(\s*['"`]([^'"`]+)['"`]/gm)].map((m) => m[1]);
  return {
    ten: 'Luồng PATD: tạo kế hoạch tuyển dụng',
    mo_ta: 'Dùng lại một YCTD [AUTOTEST] đang Open có sẵn (không tạo YCTD mới), tạo kế hoạch rồi bắt đầu / tạm dừng / tiếp tục / đóng / gia hạn.',
    tao: 'Chỉ tạo 1 kế hoạch [AUTOTEST]; người phụ trách/phỏng vấn/duyệt cuối = tài khoản QA. Cần có sẵn YCTD Open (chạy tab YCTD trước nếu chưa có).',
    uoc: '~1 phút',
    steps,
    branches: [],
  };
}

function runFull({ headed, branches }) {
  const full = fullFlow();
  const files = branches ? [FULL_SPEC, BRANCH_SPEC] : [FULL_SPEC];
  const job = startJob({
    id: 'full',
    ten: full.ten + (branches ? ' (kèm các nhánh)' : ''),
    args: ['test', '--project=e2e', ...files, REPORTERS, ...(headed ? ['--headed'] : [])],
    env: headed ? { SLOWMO: '300', HOLD_MS: '10000', QA_FULLSCREEN: '1' } : {},
  });
  job.expected = full.steps;
  job.expectedBranches = branches ? full.branches : [];
  return job;
}

export function runFlow({ id, headed, branches }) {
  if (id === 'full') return runFull({ headed, branches });
  const item = flowCatalog().find((f) => f.id === id);
  if (!item) throw new Error('Luồng không có trong danh mục');
  const args = ['test', '--project=e2e', item.file, '-g', escapeRegex(item.title), REPORTERS, ...(headed ? ['--headed'] : [])];
  return startJob({ id, ten: `${item.nhom} › ${item.title}`, args, env: headed ? { SLOWMO: '300' } : {} });
}

/** Mở một link form "Bổ sung thông tin" của cổng ứng viên và điền dữ liệu giả lập giống thật. Chỉ nhận link https của staging, đường dẫn /extra-info/<mã>. */
export function runPortalFill({ url, submit }) {
  let u;
  try { u = new URL(String(url ?? '').trim()); } catch { throw new Error('Link không hợp lệ — dán cả địa chỉ, bắt đầu bằng https://'); }
  if (u.protocol !== 'https:' || !ALLOWED_HOST.test(u.hostname)) throw new Error('Chỉ nhận link của môi trường staging (…stg.ehiring.com.vn hoặc …stg.talentx.vn).');
  if (!/\/extra-info\/[\w-]+/.test(u.pathname)) throw new Error('Đây không phải link form Bổ sung thông tin (đường dẫn phải có /extra-info/<mã>).');
  const job = startJob({
    id: 'portal-fill', ten: `Điền form Bổ sung thông tin${submit ? ' và gửi' : ''}`,
    args: ['test', '--project=procedure', 'tests/custom/portal-fill.spec.ts', REPORTERS, '--headed'],
    env: { QA_PORTAL_URL: u.href, QA_PORTAL_SUBMIT: submit ? '1' : '0', SLOWMO: '0', QA_FULLSCREEN: '1' },
  });
  return job;
}

export function runCleanup() {
  const n = readRegistry().length;
  // Luôn dọn thông báo rác; phần kế hoạch/YCTD/mail chỉ chạy khi registry còn bản ghi.
  return startJob({
    id: 'cleanup',
    ten: `Dọn dữ liệu test (${n} bản ghi trong registry + thông báo rác)`,
    args: [join(ROOT, 'web', 'cleanup-all.mjs'), ...(n ? [] : ['--skip-data'])],
  });
}

export function stopJob(id) {
  const j = jobs.get(id);
  if (!j?.child) throw new Error('Không có lượt chạy đang hoạt động');
  j.status = 'stopped';
  spawn('taskkill', ['/pid', String(j.child.pid), '/t', '/f'], { windowsHide: true });
  return publicJob(j);
}

