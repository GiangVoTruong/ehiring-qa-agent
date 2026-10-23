// DỮ LIỆU MẪU — chỉ dùng khi mở giao diện với ?mock=1 (để xem/duyệt giao diện không cần backend). Không phải kết quả test thật.
const T0 = Date.now();
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();

const REC_STEPS = [
  { text: 'Chuyển tới trang /recruitment-plans', url: '/recruitment-plans', act: { type: 'nav' }, effects: [] },
  { text: 'Bấm «Create recruitment plan»', url: '/recruitment-plans', act: { type: 'click', text: 'Create recruitment plan', sel: 'app-plans > div > button.btn-create', nth: 0, tag: 'button' }, effects: [] },
  { text: 'Chuyển tới trang /recruitment-plans/create/initial', url: '/recruitment-plans/create/initial', act: { type: 'nav' }, effects: [] },
  { text: 'Bấm «Select recruitment plan template»', url: '/recruitment-plans/create/initial', act: { type: 'click', text: 'Select recruitment plan template', field: 'Select Recruitment Plan Template', sel: '#form-1 > nz-select', tag: 'nz-select' }, effects: [] },
  { text: 'Chọn dữ liệu «Nhân viên kiểm thử» ở «Select Recruitment Plan Template» (dữ liệu có thể khác)', url: '/recruitment-plans/create/initial', act: { type: 'click', dataChoice: true, text: 'Nhân viên kiểm thử', dataField: 'Select Recruitment Plan Template', sel: 'nz-option-item:nth-of-type(1)', tag: 'div' }, effects: [] },
  { text: 'Nhập «2» vào «Number of recruitment»', url: '/recruitment-plans/create/initial', act: { type: 'input', field: 'Number of recruitment', value: '2', sel: 'input#num', tag: 'input' }, effects: [] },
  { text: 'Bấm «Save»', url: '/recruitment-plans/create/initial', act: { type: 'click', text: 'Save', sel: 'footer > button.primary', tag: 'button' }, effects: ['POST /recruitment-plans → 201'], toasts: [{ kind: 'success', text: 'Created successfully' }] },
];
const INSIGHTS = [
  { observed: [], possible: [], verify: [] },
  { observed: [{ text: 'Trường «Person in charge» đã có sẵn giá trị khi form mở (chưa ai thao tác trên trường này).', evidence: [2] }], possible: [], verify: [{ text: 'Trường «Select Recruitment Plan Template» có dấu hiệu bắt buộc trên giao diện. Chưa kiểm tra bằng cách bỏ trống.', evidence: [3] }] },
  { observed: [{ text: 'Trường «Person in charge» đã có sẵn giá trị khi form mở (chưa ai thao tác trên trường này).', evidence: [2] }, { text: 'Sau «Chọn dữ liệu «Nhân viên kiểm thử»», 6 trường xuất hiện trên form: «Job title», «Number of recruitment», «Recruitment Method», «Request date», «Mô tả công việc», «Yêu cầu».', evidence: [4] }],
    possible: [{ text: 'Lựa chọn «Select Recruitment Plan Template» có thể quyết định các trường hiển thị tiếp theo — mới thấy 1 lần với «Nhân viên kiểm thử».', evidence: [4] }],
    verify: [{ text: 'Trường «Select Recruitment Plan Template» có dấu hiệu bắt buộc trên giao diện. Chưa kiểm tra bằng cách bỏ trống.', evidence: [3] }, { text: 'Mới chọn một giá trị «Nhân viên kiểm thử» ở «Select Recruitment Plan Template» — chưa biết các lựa chọn khác có dẫn tới luồng khác không.', evidence: [4] }] },
];
let rec = null; // { id, name, startedAt, paused, notes }
let stopped = null;

const ANALYSIS = () => ({
  recId: 'mock-rec', name: 'Tạo PATD', module: 'recruitment-plans', url: '/recruitment-plans', signature: 'POST /recruitment-plans', similar: [{ id: 2, name: 'Cập nhật PATD', score: 0.6, reason: 'tên gần giống' }],
  steps: REC_STEPS.map((s, i) => ({ i, text: s.text, effects: s.effects, toasts: s.toasts ?? [], notes: [], shot: null, dataChoice: !!s.act.dataChoice })),
  notes: ['Chọn mẫu đầu tiên trong danh sách'],
  groups: [{ title: 'Vào trang /recruitment-plans', description: '', stepIndices: [0, 1], source: 'machine' }, { title: 'Lưu dữ liệu (POST /recruitment-plans)', description: 'Bắt đầu bằng vào trang /recruitment-plans/create/initial', stepIndices: [2, 3, 4, 5, 6], source: 'machine' }],
  facts: [
    { kind: 'default-value', statement: 'Trường «Person in charge» đã có sẵn giá trị khi form mở (chưa ai thao tác trên trường này).', status: 'Observed', evidence: [2], source: 'observed' },
    { kind: 'field-appears', statement: 'Sau «Chọn dữ liệu «Nhân viên kiểm thử»», 6 trường xuất hiện trên form: «Job title», «Number of recruitment», «Recruitment Method», «Request date», «Mô tả công việc», «Yêu cầu».', status: 'Observed', evidence: [4], source: 'observed' },
    { kind: 'required-marker', statement: 'Trường «Select Recruitment Plan Template» có dấu hiệu bắt buộc trên giao diện (ký hiệu * / nhãn bắt buộc). Chưa kiểm tra bằng cách bỏ trống.', status: 'Observed', evidence: [3], source: 'observed' },
    { kind: 'write-api', statement: 'Sau «Bấm «Save»», hệ thống gọi POST /recruitment-plans → HTTP 201.', status: 'Observed', evidence: [6], source: 'observed' },
    { kind: 'toast', statement: 'Sau «Bấm «Save»», hiện thông báo success: «Created successfully».', status: 'Observed', evidence: [6], source: 'observed' },
  ],
  expected: { writes: [{ method: 'POST', path: '/recruitment-plans', status: 201, step: 6 }], toasts: [{ kind: 'success', text: 'Created successfully', step: 6 }] },
  derived: [
    { kind: 'happy', title: 'Luồng thành công: làm lại đúng như đã quay', expected: 'Mọi bước chạy được và API ghi / thông báo xảy ra giống bản quay.', executable: true, requiresPermission: true, note: '' },
    { kind: 'regression', title: 'Hồi quy: chạy lại luồng đã lưu để phát hiện lỗi mới', expected: 'Giống luồng thành công; khác đi là dấu hiệu hồi quy hoặc giao diện đổi.', executable: true, requiresPermission: true, note: 'Chạy định kỳ.' },
    { kind: 'required-validation', title: 'Bỏ trống «Select Recruitment Plan Template» rồi lưu', expected: 'Giả thuyết (chưa xác minh): hệ thống từ chối hoặc báo lỗi, không tạo bản ghi.', executable: true, requiresPermission: true, note: 'Chỉ chạy khi bạn cho phép trên môi trường test.' },
    { kind: 'alternative', title: 'Dữ liệu khác ở bước 5: Select Recruitment Plan Template (lấy mục đầu tiên)', expected: 'Luồng vẫn hoàn thành; nếu khác bản quay thì ghi nhận là nhánh khác.', executable: true, requiresPermission: true, note: '' },
  ],
  ai: null, at: new Date().toISOString(),
});
const AI = {
  ok: true, model: 'mock', cost: 0, problems: [],
  value: {
    summary: 'Tester mở form tạo kế hoạch tuyển dụng, chọn mẫu kế hoạch, nhập số lượng tuyển rồi lưu; hệ thống tạo kế hoạch mới.',
    businessSteps: [
      { title: 'Mở chức năng tạo kế hoạch', description: 'Từ danh sách kế hoạch, bấm tạo mới.', stepIndices: [0, 1, 2] },
      { title: 'Chọn mẫu kế hoạch', description: 'Chọn mẫu làm hiện các trường thông tin tuyển dụng.', stepIndices: [3, 4] },
      { title: 'Nhập số lượng cần tuyển', description: '', stepIndices: [5] },
      { title: 'Lưu kế hoạch và kiểm tra kết quả', description: 'Hệ thống gọi API tạo và báo thành công.', stepIndices: [6] },
    ],
    rules: [
      { kind: 'dependency', statement: 'Việc chọn mẫu kế hoạch làm hiển thị các trường Job title, Number of recruitment, Recruitment Method…', status: 'Inferred', evidence: [4], source: 'ai' },
      { kind: 'required', statement: 'Mẫu kế hoạch là trường bắt buộc trước khi lưu.', status: 'Needs verification', evidence: [3, 6], source: 'ai' },
    ],
    questions: [{ text: 'Sau khi tạo, kế hoạch có ở trạng thái «Chưa bắt đầu» không?', why: 'Bản quay dừng ngay sau khi lưu.' }],
    testCases: [{ kind: 'negative', title: 'Số lượng tuyển âm hoặc bằng 0', expected: '', requiresPermission: true, executable: false, note: 'Chưa biết giới hạn của trường số lượng.' }],
    parameters: [{ step: 4, description: 'Mẫu kế hoạch được chọn', howToVary: 'Thử mẫu khác trong danh sách' }],
  },
};
const FLOWS = [
  { id: 1, name: 'Tạo PATD', module: 'recruitment-plans', url: '/recruitment-plans', description: '', status: 'confirmed', current_version: 2, updated_at: iso(35), runs: 8, step_count: 7, passed: 7, finished: 8, last_status: 'Passed', last_run_at: iso(35), unverified: 2, proposals: 0 },
  { id: 2, name: 'Cập nhật PATD', module: 'recruitment-plans', url: '/recruitment-plans', description: '', status: 'draft', current_version: 1, updated_at: iso(1500), runs: 3, step_count: 9, passed: 2, finished: 3, last_status: 'Needs review', last_run_at: iso(1500), unverified: 3, proposals: 1 },
  { id: 3, name: 'Gửi PATD phê duyệt', module: 'recruitment-requests', url: '/recruitment-requests', description: '', status: 'draft', current_version: 1, updated_at: iso(4300), runs: 2, step_count: 6, passed: 0, finished: 2, last_status: 'Failed', last_run_at: iso(4300), unverified: 1, proposals: 0 },
  { id: 4, name: 'Từ chối yêu cầu tuyển dụng', module: 'recruitment-requests', url: '/recruitment-requests', description: '', status: 'draft', current_version: 1, updated_at: iso(9000), runs: 0, step_count: 5, passed: 0, finished: 0, last_status: null, last_run_at: null, unverified: 0, proposals: 0 },
];
const RUN_STEPS = (fail) => [
  ...REC_STEPS.map((s, i) => ({ idx: i, title: `${i + 1}. ${s.text}`, status: fail && i === 5 ? 'Failed' : fail && i > 5 ? 'Blocked' : i === 2 ? 'Skipped' : 'Passed', classification: fail && i === 5 ? 'automation' : null, error: fail && i === 5 ? 'Không tìm thấy phần tử: Nhập «2» vào «Number of recruitment»' : fail && i > 5 ? 'Không chạy vì một bước trước đã lỗi / bị chặn.' : null, evidence: { how: 'text' }, duration_ms: 900 + i * 120 })),
  fail ? { idx: 7, title: 'Xác minh kết quả', status: 'Blocked', classification: null, error: 'Không xác minh được vì luồng dừng giữa chừng.', evidence: {}, duration_ms: 0 }
    : { idx: 7, title: 'Kết quả: POST /recruitment-plans trả 201', status: 'Passed', classification: null, error: null, evidence: { expected: 201, actual: 201 }, duration_ms: 0 },
];
const RUNS = [
  { id: 'r-mock-1', flow_id: 1, flow_name: 'Tạo PATD', version: 2, started_at: iso(35), finished_at: iso(34), status: 'Passed', summary: { counts: { Passed: 7, Skipped: 1 } } },
  { id: 'r-mock-2', flow_id: 3, flow_name: 'Gửi PATD phê duyệt', version: 1, started_at: iso(4300), finished_at: iso(4299), status: 'Failed', summary: { counts: { Passed: 5, Failed: 1, Blocked: 2 }, failures: [{ title: 'Nhập «2» vào «Number of recruitment»', classification: 'automation', error: 'Không tìm thấy phần tử' }] } },
  { id: 'r-mock-3', flow_id: 2, flow_name: 'Cập nhật PATD', version: 1, started_at: iso(1500), finished_at: iso(1499), status: 'Needs review', summary: { counts: { Passed: 7, 'Needs review': 1 } } },
];
const KNOW = [
  { name: 'recruitment-plans', flows: [{ id: 1, name: 'Tạo PATD' }, { id: 2, name: 'Cập nhật PATD' }],
    fields: [{ label: 'Select Recruitment Plan Template', kind: 'select', required: true, flows: ['Tạo PATD'] }, { label: 'Job title', kind: 'text', required: false, flows: ['Tạo PATD'] }, { label: 'Number of recruitment', kind: 'text', required: true, flows: ['Tạo PATD', 'Cập nhật PATD'] }, { label: 'Person in charge', kind: 'select', required: false, flows: ['Tạo PATD'] }],
    rules: [{ id: 1, flowId: 1, flow: 'Tạo PATD', kind: 'field-appears', statement: 'Sau khi chọn mẫu kế hoạch, 6 trường xuất hiện trên form.', status: 'Observed', evidence: [4], source: 'observed', createdAt: iso(60) },
      { id: 2, flowId: 1, flow: 'Tạo PATD', kind: 'required', statement: 'Mẫu kế hoạch là trường bắt buộc trước khi lưu.', status: 'Confirmed', evidence: [3, 6], source: 'observed', createdAt: iso(40) },
      { id: 3, flowId: 1, flow: 'Tạo PATD', kind: 'dependency', statement: 'Lựa chọn mẫu quyết định các trường hiển thị.', status: 'Inferred', evidence: [4], source: 'ai', createdAt: iso(30) }] },
  { name: 'recruitment-requests', flows: [{ id: 3, name: 'Gửi PATD phê duyệt' }, { id: 4, name: 'Từ chối yêu cầu tuyển dụng' }], fields: [{ label: 'Reason', kind: 'textarea', required: true, flows: ['Từ chối yêu cầu tuyển dụng'] }],
    rules: [{ id: 4, flowId: 3, flow: 'Gửi PATD phê duyệt', kind: 'state', statement: 'Sau khi gửi, trạng thái chuyển sang chờ duyệt.', status: 'Needs verification', evidence: [], source: 'ai', createdAt: iso(5000) }] },
];

export async function handle(method, path, body) {
  await new Promise((r) => setTimeout(r, 120));
  const u = new URL(path, 'http://x');
  const key = `${method} ${u.pathname}`;
  const id = u.searchParams.get('id');
  switch (key) {
    case 'GET /api/env': return { baseUrl: 'https://shinhanbank.stg.talentx.vn', host: 'shinhanbank.stg.talentx.vn', allowedHosts: '(^|\\.)stg\\.(ehiring\\.com\\.vn|talentx\\.vn)$', user: 'qa@example.com', db: 'data/qa.db', navMap: true, recording: !!rec, mock: true, credentials: { saved: true, username: 'tester01', savedAt: iso(120) } };
    case 'GET /api/rec/status': {
      if (!rec) return { recording: false };
      const sec = rec.paused ? rec.frozen : Math.round((Date.now() - rec.startedAt) / 1000);
      const n = Math.min(REC_STEPS.length, Math.floor(sec / 2));
      const steps = REC_STEPS.slice(0, n).map((s, i) => ({ ...s, kind: s.act.type, t: rec.startedAt + (i + 1) * 2000 }));
      const ins = INSIGHTS[n < 4 ? Math.min(n, 1) : 2];
      return { recording: true, paused: rec.paused, id: rec.id, name: rec.name, sec, startedAt: rec.startedAt, count: n, steps, notes: rec.notes, apis: n >= 7 ? ['POST /recruitment-plans'] : [], insights: n >= 2 ? ins : INSIGHTS[0] };
    }
    case 'POST /api/rec/start': rec = { id: 'mock-rec', name: body.name || 'Luồng ghi lại', startedAt: Date.now(), paused: false, notes: [] }; return { id: rec.id, name: rec.name };
    case 'POST /api/rec/pause': rec.frozen = Math.round((Date.now() - rec.startedAt) / 1000); rec.paused = true; return {};
    case 'POST /api/rec/resume': rec.startedAt = Date.now() - rec.frozen * 1000; rec.paused = false; return {};
    case 'POST /api/rec/note': rec.notes.push(body.text); return {};
    case 'POST /api/rec/stop': { const r = rec; stopped = { id: r.id, name: r.name }; rec = null; return { id: r.id, name: r.name, durationSec: 14 }; }
    case 'GET /api/rec': return { id: 'mock-rec', name: stopped?.name || 'Tạo PATD', startedAt: new Date(T0).toISOString(), durationSec: 14, pages: 2, apis: ['POST /recruitment-plans'], notes: ['Chọn mẫu đầu tiên trong danh sách'], steps: REC_STEPS.map((s, i) => ({ ...s, kind: s.act.type, t: T0 + i * 2000 })) };
    case 'GET /api/rec/analysis': return ANALYSIS();
    case 'POST /api/rec/analyze': await new Promise((r) => setTimeout(r, 300)); return { ...ANALYSIS(), ai: null };
    case 'POST /api/flows/save': return { flowId: 1, version: 1, proposed: body.mode === 'version' };
    case 'GET /api/flows/list': return FLOWS;
    case 'GET /api/dashboard': return { flows: FLOWS.length, runs: 13, byStatus: { Passed: 9, Failed: 3, 'Needs review': 1 }, needVerification: [], recentFailures: [], openQuestions: 2, proposals: 1 };
    case 'GET /api/flow': {
      const f = FLOWS.find((x) => x.id === Number(id)) ?? FLOWS[0];
      return { flow: { ...f, versions: [{ version: f.current_version, state: 'current', note: 'Tạo từ bản quay', created_at: iso(300), stepCount: f.step_count }, ...(f.proposals ? [{ version: f.current_version + 1, state: 'proposed', note: 'Giao diện đổi: 1 phần tử chỉ tìm được bằng đường dẫn CSS.', created_at: iso(100), stepCount: f.step_count }] : [])] },
        current: { version: f.current_version, steps: REC_STEPS, expected: ANALYSIS().expected, analysis: { recId: 'mock-rec' } }, rules: KNOW[0].rules.map((r, i) => ({ ...r, id: i + 1, evidence: r.evidence })), testCases: ANALYSIS().derived.map((c, i) => ({ ...c, id: i + 1, executable: c.executable ? 1 : 0 })),
        questions: [{ id: 1, text: AI.value.questions[0].text, why: AI.value.questions[0].why, state: 'open', answer: '' }], runs: RUNS.filter((r) => r.flow_id === f.id) };
    }
    case 'GET /api/runs': return RUNS;
    case 'GET /api/run': { const r = RUNS.find((x) => x.id === id) ?? { ...RUNS[0], id }; return { ...r, params: {}, steps: RUN_STEPS(r.status === 'Failed') }; }
    case 'POST /api/flow/run': return { runId: 'r-mock-1', id: 'job' };
    case 'GET /api/knowledge': return KNOW;
    case 'DELETE /api/credentials': return { ok: true };
    case 'GET /api/flows': return { full: { ten: 'Luồng tuyển dụng đầy đủ: YCTD → kế hoạch', mo_ta: 'Một lần chạy đi hết luồng: tạo YCTD, duyệt, tạo kế hoạch, bắt đầu / tạm dừng / tiếp tục / đóng / gia hạn, rồi đóng YCTD.', tao: 'Tạo 1 YCTD + 1 kế hoạch; người duyệt = tài khoản QA; mọi mail chỉ về hộp thư QA', uoc: '~1,5–2 phút', steps: ['Tạo YCTD', 'Duyệt YCTD', 'Tạo kế hoạch', 'Bắt đầu kế hoạch'], branches: ['duyệt → Open', 'từ chối → bị từ chối'] },
      flows: [{ id: 'y1', title: 'tạo → chờ duyệt, mã N#YY#NNN', nhom: 'Yêu cầu tuyển dụng (YCTD)', tao: 'Tạo 1 YCTD (người duyệt = tài khoản QA); mail chỉ về hộp thư QA', uoc: '~12–25 giây' }, { id: 'y2', title: 'duyệt cấp cuối → Open', nhom: 'Yêu cầu tuyển dụng (YCTD)', tao: 'Tạo 1 YCTD', uoc: '~12–25 giây' }], registry: 12, running: null };
    case 'GET /api/procs': return [{ name: 'YCTD → kế hoạch', text: 'tạo YCTD\nduyệt\ntạo kế hoạch' }];
    case 'POST /api/proc/parse': return { valid: true, steps: String(body.text || '').split(/\n|→/).map((x) => x.trim()).filter(Boolean).map((x) => ({ ok: !/xyz/.test(x), input: x, nhan: x, loi: 'chưa có thao tác này' })), actions: [{ id: 'yctd.tao', nhom: 'YCTD', nhan: 'Tạo YCTD (chờ duyệt)' }, { id: 'yctd.duyet', nhom: 'YCTD', nhan: 'Duyệt YCTD → Open' }, { id: 'kh.tao', nhom: 'Kế hoạch', nhan: 'Tạo kế hoạch tuyển dụng' }] };
    case 'POST /api/run/stop': return { ok: true };
    case 'POST /api/run': case 'POST /api/proc/run': case 'POST /api/portal/fill': return { id: 'job1' };
    case 'GET /api/job': return { id: 'job1', ten: 'Yêu cầu tuyển dụng (YCTD) › tạo → chờ duyệt', status: 'running', started: Date.now() - 12000, durationSec: 12, log: 'Running 1 test', steps: [{ title: 'Tạo YCTD', status: 'ok', ms: 8200 }, { title: 'Duyệt YCTD', status: 'running' }], expected: ['Tạo YCTD', 'Duyệt YCTD', 'Tạo kế hoạch'], created: [], tests: [] };
    case 'POST /api/flow/ai': return { rules: 2, questions: 1, testCases: 1 };
    default: return {};
  }
}
