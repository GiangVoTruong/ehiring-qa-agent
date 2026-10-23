import { expect, test } from '@playwright/test';
// @ts-ignore — module .mjs dùng chung với web
import { buildSteps, isLoginStep, loginFlags } from '../../web/recorder.mjs';
// @ts-ignore
import { groupSteps, cleanExpected, buildExpected, deriveTestCases, findSimilar, flowSignature, isWriteApi, observeFacts, redact } from '../../web/analysis.mjs';
// @ts-ignore
import { applyVerification, overallStatus, verifyExpected } from '../../web/runlib.mjs';
// @ts-ignore
import { openStore } from '../../web/store.mjs';
// @ts-ignore
import { runPortalFill } from '../../web/jobs.mjs';

const snap = (fields: any[], buttons: any[] = [], errors: string[] = []) => ({ url: '/x', fields, buttons, errors });
const f = (label: string, extra: any = {}) => ({ label, kind: 'text', required: false, disabled: false, filled: false, ...extra });

// ---------- Gom sự kiện thô thành bước ----------
test('buildSteps: gộp nhập liệu, Enter, API, thông báo, ghi chú vào đúng bước và che mật khẩu', () => {
  const t = 1_000_000;
  const events = [
    { t, type: 'nav', path: '/plans', url: '/plans' },
    { t: t + 100, type: 'click', tag: 'button', text: 'Create', input: '', role: '', sel: 'button', nth: 0 },
    { t: t + 300, type: 'key', key: 'Enter', field: 'Tên' },
    { t: t + 301, type: 'input', field: 'Tên', value: 'abc', input: 'text' },
    { t: t + 302, type: 'input', field: 'Mật khẩu', value: '***', input: 'password', secret: true },
    { t: t + 500, type: 'api', method: 'POST', path: '/plans', status: 201 },
    { t: t + 520, type: 'toast', kind: 'success', text: 'Saved' },
    { t: t + 530, type: 'note', text: 'đã lưu ổn' },
  ];
  const steps = buildSteps(events);
  expect(steps.map((s: any) => s.text)).toEqual(['Chuyển tới trang /plans', 'Bấm «Create»', 'Nhập «abc» vào «Tên», rồi nhấn Enter', 'Nhập «***» vào «Mật khẩu»']);
  const last = steps.at(-1);
  expect(last.effects).toEqual(['POST /plans → 201']);
  expect(last.toasts).toEqual([{ kind: 'success', text: 'Saved' }]);
  expect(last.notes).toEqual(['đã lưu ổn']);
});

test('buildSteps: cuộn đi rồi cuộn về chỗ cũ không tạo bước; chọn dữ liệu được đánh dấu là tham số', () => {
  const events = [
    { t: 1, type: 'click', tag: 'nz-select', text: 'Chọn mẫu', field: 'Mẫu', sel: 'nz-select' },
    { t: 2, type: 'scroll', sel: 'cdk-virtual-scroll-viewport', top: 200, cname: 'danh sách chọn' },
    { t: 3, type: 'scroll', sel: 'cdk-virtual-scroll-viewport', top: 0, cname: 'danh sách chọn' },
    { t: 4, type: 'click', tag: 'div', text: 'Mẫu A', dataChoice: true, dataField: 'Mẫu', sel: 'nz-option-item' },
  ];
  const steps = buildSteps(events).filter((s: any) => s.act);
  expect(steps.map((s: any) => s.act.type)).toEqual(['click', 'click']);
  expect(steps[1].act.dataChoice).toBe(true);
  expect(steps[1].text).toContain('dữ liệu có thể khác');
});

// ---------- Dữ kiện quan sát vs suy luận ----------
test('observeFacts: chỉ kết luận từ so sánh trước/sau; thứ tự thao tác KHÔNG tạo ra quy tắc phụ thuộc', () => {
  const steps = [
    { text: 'Chọn phòng ban A', act: { type: 'click' }, effects: [], before: snap([f('Phòng ban')]), after: snap([f('Phòng ban', { filled: true }), f('Vị trí')], [{ text: 'Save', disabled: true }]) },
    { text: 'Chọn vị trí B', act: { type: 'click' }, effects: [], before: snap([f('Phòng ban', { filled: true }), f('Vị trí')], [{ text: 'Save', disabled: true }]), after: snap([f('Phòng ban', { filled: true }), f('Vị trí', { filled: true })], [{ text: 'Save', disabled: false }]) },
    { text: 'Bấm «Save»', act: { type: 'click' }, effects: ['POST /requests → 201'], toasts: [{ kind: 'success', text: 'Created' }] },
  ];
  const facts = observeFacts(steps);
  const kinds = facts.map((x: any) => x.kind);
  expect(kinds).toContain('field-appears');
  expect(facts.find((x: any) => x.kind === 'field-appears').statement).toContain('Vị trí');
  expect(kinds).toContain('button-state');
  expect(kinds).toContain('write-api');
  expect(kinds).toContain('toast');
  expect(facts.every((x: any) => x.status === 'Observed')).toBe(true);
  // Không có dữ kiện nào nói "Vị trí bắt buộc phụ thuộc Phòng ban" — chỉ quan sát trường xuất hiện.
  expect(facts.some((x: any) => /phụ thuộc|bắt buộc/.test(x.statement) && x.kind !== 'required-marker')).toBe(false);
});

test('observeFacts: dấu hiệu bắt buộc chỉ là Observed ở mức "có ký hiệu", chưa Confirmed', () => {
  const steps = [{ text: 'mở form', act: { type: 'nav' }, effects: [], after: snap([f('Tên *', { required: true })]) }];
  const rf = observeFacts(steps).find((x: any) => x.kind === 'required-marker');
  expect(rf.status).toBe('Observed');
  expect(rf.statement).toContain('Chưa kiểm tra bằng cách bỏ trống');
});

test('isWriteApi: truy vấn dashboard/search không tính là ghi dữ liệu', () => {
  expect(isWriteApi('POST', '/dashboard/schedules')).toBe(false);
  expect(isWriteApi('GET', '/plans')).toBe(false);
  expect(isWriteApi('POST', '/recruitment-plans')).toBe(true);
  expect(isWriteApi('PATCH', '/recruitment-plans/:id')).toBe(true);
});

// ---------- Che dữ liệu nhạy cảm ----------
test('redact: che email, số dài, token, id khỏi nội dung dữ kiện', () => {
  const out = redact('mail a.b@x.com sdt 0912345678 id 6acdca98c2bf768b7c09c87d tok eyJhbGciOi.abc.def');
  expect(out).not.toMatch(/a\.b@/);
  expect(out).not.toMatch(/0912345678/);
  expect(out).toContain(':id');
  expect(out).not.toContain('eyJhbGciOi');
});

// ---------- Test case dẫn xuất + flow tương tự ----------
test('deriveTestCases: happy+regression luôn có; bỏ trống chỉ tạo cho trường có dấu hiệu bắt buộc VÀ đã được nhập', () => {
  const steps = [
    { text: 'Nhập tên', act: { type: 'input', field: 'Tên' } },
    { text: 'Chọn mẫu', act: { type: 'click', dataChoice: true, dataField: 'Mẫu' } },
  ];
  const facts = [{ kind: 'required-marker', statement: 'Trường «Tên» có dấu hiệu bắt buộc', evidence: [0] }, { kind: 'required-marker', statement: 'Trường «Ma» có dấu hiệu bắt buộc', evidence: [0] }];
  const noSave = deriveTestCases(steps, facts); // bản quay chưa có bước lưu → test bỏ trống không được phép chạy (sẽ xác nhận sai)
  expect(noSave.filter((c: any) => c.kind === 'required-validation').every((c: any) => c.executable === false)).toBe(true);
  const cases = deriveTestCases(steps, facts, { writes: [{ method: 'POST', path: '/p', status: 201 }] });
  expect(cases.map((c: any) => c.kind)).toEqual(['happy', 'regression', 'required-validation', 'alternative']);
  const req = cases.find((c: any) => c.kind === 'required-validation');
  expect(req.variant).toEqual({ omit: [0], expectNoWrite: true });
  expect(req.requiresPermission).toBe(true);
  expect(req.expected).toContain('Giả thuyết');
});

test('findSimilar: nhận ra flow cùng chữ ký API hoặc tên gần giống, bỏ qua flow không liên quan', () => {
  const flows = [{ id: 1, name: 'Tạo phiếu yêu cầu tuyển dụng PATD', signature: 'POST /a' }, { id: 2, name: 'Xuất báo cáo', signature: 'POST /z' }];
  expect(findSimilar(flows, { name: 'Tạo phiếu yêu cầu tuyển dụng', signature: '' }).map((x: any) => x.id)).toEqual([1]);
  expect(findSimilar(flows, { name: 'Tên khác hẳn', signature: 'POST /z' }).map((x: any) => x.id)).toEqual([2]);
  expect(findSimilar(flows, { name: 'Việc khác', signature: 'POST /q' })).toEqual([]);
  expect(flowSignature({ writes: [{ method: 'POST', path: '/b' }, { method: 'POST', path: '/a' }, { method: 'POST', path: '/a' }] })).toBe('POST /a|POST /b');
});

// ---------- Xác minh kết quả thực tế khi chạy lại ----------
test('verifyExpected: thành công khi API ghi trả 2xx; lỗi nghiệp vụ khi API 4xx hoặc không được gọi', () => {
  const expected = { writes: [{ method: 'POST', path: '/plans', status: 201 }], toasts: [] };
  const ok = verifyExpected({ expected, observedWrites: [{ method: 'POST', path: '/plans', status: 201 }], observedToasts: [] });
  expect(ok.map((v: any) => v.status)).toEqual(['Passed']);
  const bad = verifyExpected({ expected, observedWrites: [{ method: 'POST', path: '/plans', status: 400 }], observedToasts: [] });
  expect(bad[0]).toMatchObject({ status: 'Failed', classification: 'business' });
  const none = verifyExpected({ expected, observedWrites: [], observedToasts: [] });
  expect(none[0]).toMatchObject({ status: 'Failed', classification: 'business' });
});

test('verifyExpected: không có gì để đối chiếu thì Needs review, không tự coi là Passed; toast khác nội dung → Needs review', () => {
  expect(verifyExpected({ expected: { writes: [], toasts: [] }, observedWrites: [], observedToasts: [] })[0].status).toBe('Needs review');
  const t = verifyExpected({ expected: { writes: [], toasts: [{ kind: 'success', text: 'Đã tạo' }] }, observedWrites: [], observedToasts: [{ kind: 'success', text: 'Created' }] });
  expect(t[0].status).toBe('Needs review');
  const e = verifyExpected({ expected: { writes: [], toasts: [{ kind: 'success', text: 'Đã tạo' }] }, observedWrites: [], observedToasts: [{ kind: 'error', text: 'Lỗi' }] });
  expect(e[0]).toMatchObject({ status: 'Failed', classification: 'business' });
});

test('verifyExpected: giả thuyết bỏ trống — Passed khi không có API ghi 2xx, Failed (bác bỏ) khi vẫn tạo được', () => {
  const p = { expectNoWrite: true };
  expect(verifyExpected({ expected: { writes: [], toasts: [] }, observedWrites: [{ method: 'POST', path: '/p', status: 422 }], observedToasts: [], params: p })[0].status).toBe('Passed');
  expect(verifyExpected({ expected: { writes: [], toasts: [] }, observedWrites: [{ method: 'POST', path: '/p', status: 201 }], observedToasts: [], params: p })[0].status).toBe('Failed');
});

test('overallStatus: Failed > Blocked > Needs review > Passed', () => {
  expect(overallStatus([{ status: 'Passed' }, { status: 'Failed' }, { status: 'Blocked' }])).toBe('Failed');
  expect(overallStatus([{ status: 'Passed' }, { status: 'Blocked' }])).toBe('Blocked');
  expect(overallStatus([{ status: 'Passed' }, { status: 'Needs review' }])).toBe('Needs review');
  expect(overallStatus([{ status: 'Passed' }, { status: 'Skipped' }])).toBe('Passed');
  expect(overallStatus([{ status: 'Skipped' }])).toBe('Skipped');
});

// ---------- Bộ nhớ lâu dài ----------
test('store: phiên bản đề xuất không ghi đè bản đang dùng; chỉ chấp nhận khi người dùng bấm; lịch sử được giữ', () => {
  const s = openStore(':memory:');
  const id = s.createFlow({ name: 'Tạo PATD', module: 'recruitment-requests', signature: 'POST /a', steps: [{ text: 'a' }], expected: { writes: [], toasts: [] } });
  const v2 = s.addVersion(id, { steps: [{ text: 'a2' }], expected: { writes: [], toasts: [] }, note: 'quay lại' });
  expect(v2).toBe(2);
  expect(s.getFlow(id).current_version).toBe(1);
  expect(s.getVersion(id, 1).state).toBe('current');
  expect(s.getVersion(id, 2).state).toBe('proposed');
  s.acceptVersion(id, 2);
  expect(s.getFlow(id).current_version).toBe(2);
  expect(s.getVersion(id, 1).state).toBe('superseded');
  expect(() => s.acceptVersion(id, 1)).toThrow();
  s.close();
});

test('store + applyVerification: Confirmed chỉ có sau lượt kiểm chứng rõ kết quả; lỗi automation không đổi mức tin cậy', () => {
  const s = openStore(':memory:');
  const id = s.createFlow({ name: 'F', steps: [], expected: { writes: [], toasts: [] } });
  s.addRules(id, 1, [{ kind: 'required-marker', statement: 'Trường «Tên» có dấu hiệu bắt buộc', status: 'Observed', evidence: [0] }]);
  s.addTestCases(id, [{ kind: 'required-validation', title: 'Bỏ trống «Tên» rồi lưu', variant: { omit: [0], expectNoWrite: true }, requiresPermission: true, executable: true }]);
  const tc = s.listTestCases(id)[0];
  expect(applyVerification(s, { flowId: id, testCase: tc, verdict: null })).toBeNull();
  expect(s.listRules(id)[0].status).toBe('Observed');
  expect(applyVerification(s, { flowId: id, testCase: tc, verdict: 'Passed' })).toMatchObject({ from: 'Observed', to: 'Confirmed' });
  expect(s.listRules(id)[0].status).toBe('Confirmed');
  expect(() => s.addRules(id, 1, [{ statement: 'x', status: 'Bậy' }])).toThrow();
  s.close();
});

test('store: lịch sử chạy + dashboard tổng hợp pass/fail', () => {
  const s = openStore(':memory:');
  const id = s.createFlow({ name: 'F', steps: [], expected: { writes: [], toasts: [] } });
  for (const [rid, st] of [['r1', 'Passed'], ['r2', 'Failed']]) { s.startRun({ id: rid, flowId: id, version: 1, params: {} }); s.addRunStep(rid, { idx: 0, title: 'b', status: st }); s.finishRun(rid, st, { failures: [] }); }
  const d = s.dashboard();
  expect(d.flows).toBe(1);
  expect(d.runs).toBe(2);
  expect(d.byStatus).toEqual({ Passed: 1, Failed: 1 });
  expect(s.getRun('r2').steps[0].status).toBe('Failed');
  s.close();
});

test('buildExpected: lấy API ghi và thông báo từ bản quay', () => {
  const e = buildExpected([{ text: 'x', effects: ['POST /dashboard/q → 201', 'POST /plans → 201'], toasts: [{ kind: 'success', text: 'ok' }] }]);
  expect(e.writes).toEqual([{ method: 'POST', path: '/plans', status: 201, step: 0 }]);
  expect(e.toasts).toHaveLength(1);
});

test('store.deleteFlow: xoá sạch flow cùng dữ liệu liên quan, không đụng flow khác, trả về id lượt chạy để xoá ảnh', () => {
  const s = openStore(':memory:');
  const a = s.createFlow({ name: 'A', steps: [], expected: { writes: [], toasts: [] } });
  const b = s.createFlow({ name: 'B', steps: [], expected: { writes: [], toasts: [] } });
  for (const id of [a, b]) {
    s.addRules(id, 1, [{ statement: 'r', status: 'Observed' }]);
    s.addTestCases(id, [{ kind: 'happy', title: 't', variant: {}, executable: true }]);
    s.addQuestions(id, [{ text: 'q' }]);
  }
  s.startRun({ id: 'ra', flowId: a, version: 1, params: {} });
  s.addRunStep('ra', { idx: 0, title: 'x', status: 'Passed' });
  s.finishRun('ra', 'Passed', {});
  s.startRun({ id: 'rb', flowId: b, version: 1, params: {} });
  expect(s.deleteFlow(a)).toEqual(['ra']);
  expect(s.getFlow(a)).toBeNull();
  expect(s.getRun('ra')).toBeNull();
  expect(s.listRules(a)).toEqual([]);
  expect(s.listTestCases(a)).toEqual([]);
  expect(s.listQuestions(a)).toEqual([]);
  expect(s.getFlow(b).name).toBe('B');
  expect(s.listRules(b)).toHaveLength(1);
  expect(s.getRun('rb')).not.toBeNull();
  s.close();
});

// ---------- Tài khoản tester nhập lúc quay ----------
import { mkdtempSync, writeFileSync as wf } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pj } from 'node:path';
// @ts-ignore
import { loadCredentials } from '../../flows/common';

test('loadCredentials: ưu tiên tài khoản đã nhớ lúc quay, không có thì dùng .env, thiếu cả hai thì báo rõ', () => {
  const dir = mkdtempSync(pj(tmpdir(), 'cred-'));
  const file = pj(dir, 'credentials.json');
  const saved = process.env.QA_USERNAME, savedPw = process.env.QA_PASSWORD;
  try {
    process.env.QA_USERNAME = 'env-user'; process.env.QA_PASSWORD = 'env-pw';
    expect(loadCredentials(file)).toMatchObject({ username: 'env-user', source: 'env' });
    wf(file, JSON.stringify({ username: 'tester01', password: 'pw1' }));
    expect(loadCredentials(file)).toMatchObject({ username: 'tester01', password: 'pw1', source: 'saved' });
    delete process.env.QA_USERNAME; delete process.env.QA_PASSWORD;
    wf(file, '{}');
    expect(() => loadCredentials(file)).toThrow(/Chưa có tài khoản/);
  } finally { process.env.QA_USERNAME = saved; process.env.QA_PASSWORD = savedPw; }
});

test('buildSteps: bước đăng nhập không được ghi vào luồng (kể cả bản quay cũ chưa có cờ login); chỉ giữ thao tác nghiệp vụ', () => {
  const steps = buildSteps([
    { t: 1, type: 'input', field: 'Username or email', value: 'tester01', input: 'text', login: true, url: '/realms/x/protocol/openid-connect/auth' },
    { t: 2, type: 'input', field: 'Password', value: '***', input: 'password', secret: true, login: true, url: '/realms/x/protocol/openid-connect/auth' },
    { t: 3, type: 'click', text: 'Sign In', tag: 'button', url: '/realms/x/login-actions/authenticate' },
    { t: 4, type: 'input', field: 'Username or email', value: 'cu', input: 'text', url: '/dang-nhap' }, // bản quay cũ: không có cờ, nhận qua nhãn trường
    { t: 5, type: 'nav', path: '/recruitment-plans', url: '/recruitment-plans' }, // sang trang ứng dụng = kết thúc chuỗi đăng nhập
    { t: 6, type: 'click', text: 'Create', tag: 'button', url: '/recruitment-plans' },
  ]).filter((s: any) => s.act);
  expect(steps.map((s: any) => s.text)).toEqual(['Chuyển tới trang /recruitment-plans', 'Bấm «Create»']);
  expect(isLoginStep({ type: 'input', field: 'Mô tả' }, '/recruitment-plans')).toBe(false);
  expect(isLoginStep({}, '/realms/shb/login-actions/authenticate')).toBe(true);
});

test('loginFlags: cả chuỗi đăng nhập (SSO, tài khoản, mật khẩu, mã xác nhận OTP, bấm Xác nhận) bị bỏ, dừng khi sang trang ứng dụng', () => {
  const seq = [
    { type: 'nav', path: '/', url: '/' },
    { type: 'nav', path: '/api/bff-sso/auth/sso/login', url: '/api/bff-sso/auth/sso/login' },
    { type: 'click', text: 'Sign in with SSO', url: '/api/bff-sso/auth/sso/login' },
    { type: 'input', field: 'Username or email', value: 'u', url: '/realms/x/protocol' },
    { type: 'input', field: 'Password', value: '***', url: '/realms/x/protocol' },
    { type: 'click', text: 'Sign In', url: '/realms/x/login-actions/authenticate' },
    { type: 'input', field: '123456', value: '169371', url: '/verify' },   // mã xác nhận
    { type: 'click', text: 'Xác nhận', url: '/verify' },                   // nút sau mã xác nhận
    { type: 'nav', path: '/dashboard', url: '/dashboard' },
    { type: 'click', text: 'Xác nhận', url: '/dashboard' },                // cùng chữ nhưng đã vào ứng dụng → là nghiệp vụ
  ];
  expect(loginFlags(seq)).toEqual([false, true, true, true, true, true, true, true, false, false]);
  expect(buildSteps(seq.map((e, i) => ({ ...e, t: i }))).filter((s: any) => s.act).map((s: any) => s.text)).toEqual(['Chuyển tới trang /', 'Chuyển tới trang /dashboard', 'Bấm «Xác nhận»']);
});

test('API đăng nhập/SSO/MFA không bao giờ là kết quả mong đợi (cả flow cũ đã lưu có sẵn)', () => {
  expect(isWriteApi('POST', '/bff-sso/auth/sso/handoff')).toBe(false);
  expect(isWriteApi('POST', '/bff-sso/auth/sso/mfa/verify')).toBe(false);
  const exp = cleanExpected({ writes: [{ method: 'POST', path: '/bff-sso/auth/sso/handoff', status: 200 }, { method: 'POST', path: '/recruitment-plans', status: 201 }], toasts: [] });
  expect(exp.writes.map((w: any) => w.path)).toEqual(['/recruitment-plans']);
  const v = verifyExpected({ expected: { writes: [{ method: 'POST', path: '/bff-sso/auth/sso/mfa/verify', status: 200 }], toasts: [] }, observedWrites: [], observedToasts: [] });
  expect(v[0].status).toBe('Needs review'); // không còn đòi API đăng nhập → không có gì để đối chiếu
});

// ---------- Hồ sơ giả lập giống thật để điền form bổ sung thông tin ----------
import { autoValue, fmtDate, makeProfile, portalValue, preferOption, shiftDate } from '../../flows/fake-person';

test('makeProfile: dữ liệu giống thật và nhất quán (CCCD ↔ ngày sinh/giới tính, ngày học/làm hợp lý), email luôn là hộp thư QA', () => {
  const now = new Date('2026-10-19T00:00:00Z');
  for (let seed = 1; seed <= 200; seed++) {
    const p = makeProfile(seed, 'qa@shinhanbank.com', now);
    expect(p.email).toBe('qa@shinhanbank.com');
    expect(p.phone).toMatch(/^0\d{9}$/);
    expect(p.cccd).toMatch(/^\d{12}$/);
    const by = p.birth.getFullYear();
    const g = Number(p.cccd[3]);
    expect(g).toBe(by >= 2000 ? (p.gender === 'Nam' ? 2 : 3) : p.gender === 'Nam' ? 0 : 1);
    expect(p.cccd.slice(4, 6)).toBe(String(by % 100).padStart(2, '0'));
    expect(p.age).toBeGreaterThanOrEqual(25); expect(p.age).toBeLessThanOrEqual(36);
    const d = (s: string) => { const [dd, mm, yy] = s.split('/').map(Number); return new Date(yy, mm - 1, dd).getTime(); };
    expect(d(p.cccdOldIssued)).toBeLessThan(d(p.cccdIssued));        // CCCD cũ cấp trước CCCD mới
    expect(d(p.eduStart)).toBeLessThan(d(p.eduEnd));
    expect(d(p.eduEnd)).toBeLessThan(d(p.jobStart));
    expect(d(p.jobStart)).toBeLessThan(d(p.jobEnd));
    expect(d(p.jobEnd)).toBeLessThan(now.getTime());                 // đã làm xong, không ở tương lai
    expect(d(p.startWork)).toBeGreaterThan(now.getTime());           // ngày có thể bắt đầu làm việc ở tương lai
    expect(p.salary).toBeGreaterThanOrEqual(15_000_000);
    expect(p.children).toBeLessThanOrEqual(20);
    expect(p.fullName.split(' ').length).toBeGreaterThanOrEqual(3);
  }
  expect(makeProfile(7, 'a@b.c', now)).toEqual(makeProfile(7, 'a@b.c', now));           // cùng seed → cùng hồ sơ (gỡ lỗi được)
  expect(makeProfile(7, 'a@b.c', now).fullName).not.toBe(makeProfile(8, 'a@b.c', now).fullName);
});

test('portalValue: ô nào điền loại giá trị đó; không còn chuỗi giữ chỗ [QA-AUTO]; ràng buộc đã biết của form được giữ', () => {
  const now = new Date('2026-10-19T00:00:00Z');
  const p = makeProfile(11, 'qa@shinhanbank.com', now);
  const v = (label: string, ph = '', tag = 'INPUT', n = 1) => portalValue(p, label, ph, tag, n);
  expect(v('Số điện thoại*', 'Nhập số điện thoại')).toBe(p.phone);
  expect(v('Số điện thoại*', 'Nhập số điện thoại', 'INPUT', 2)).toBe(p.relatives[1].phone);   // SĐT người thân khác SĐT ứng viên
  expect(v('Email*')).toBe('qa@shinhanbank.com');
  expect(v('Số CCCD*')).toBe(p.cccd);
  expect(v('Ngày cấp CCCD cũ*')).toBe(p.cccdOldIssued);
  expect(v('Ngày cấp CCCD*')).toBe(p.cccdIssued);
  expect(v('Ngày bắt đầu*', 'DD/MM/YYYY', 'INPUT', 1)).toBe(p.jobStart);                       // lần 1 = kinh nghiệm
  expect(v('Ngày bắt đầu*', 'DD/MM/YYYY', 'INPUT', 2)).toBe(p.eduStart);                       // lần 2 = học vấn
  expect(v('Khi nào có thể bắt đầu làm việc*', 'DD/MM/YYYY')).toBe(p.startWork);
  expect(Number(v('Mức lương mong muốn*'))).toBe(p.salary);
  expect(Number(v('Số người con'))).toBeLessThanOrEqual(20);
  expect(v('Tên trường')).toBe(p.school);
  expect(v('3 Điểm mạnh', 'Nhập 3 điểm mạnh')).toMatch(/trách nhiệm/);
  expect(v('Ghi chú', '', 'TEXTAREA')).not.toMatch(/QA-AUTO/);
  for (const label of ['Người tham chiếu*', 'Lý do*', 'Sở thích', 'Kỹ năng', 'Chức vụ', 'Tên công ty', 'Địa chỉ thường trú']) expect(v(label)).not.toMatch(/QA-AUTO/);
  expect(preferOption(p, 'Tỉnh/Thành phố*')).toEqual(/Hà Nội/);
  expect(preferOption(p, 'Giới tính')?.test(p.gender)).toBe(true);
  expect(preferOption(p, 'Ô lạ')).toBeUndefined();
  expect(fmtDate(new Date(2020, 0, 5))).toBe('05/01/2020');
});

// ---------- Tự điền khi chạy lại ----------
test('autoValue: giá trị mới giống thật theo hình dạng/nhãn; ngày dời đều nên thứ tự bản quay vẫn đúng; văn bản tự do thêm mã duy nhất', () => {
  const now = new Date('2026-10-19T00:00:00Z');
  const p = makeProfile(21, 'qa@shinhanbank.com', now);
  expect(autoValue(p, 'Email', 'someone@real.com')).toBe('qa@shinhanbank.com');       // không bao giờ dùng email thật
  expect(autoValue(p, 'Phone', '0987654321')).toBe(p.phone);
  expect(autoValue(p, 'Citizen ID', '012345678901')).toBe(p.cccd);
  expect(autoValue(p, 'Number of recruitment', '2')).toBe(String(p.headcount));
  expect(autoValue(p, 'Page size', '10')).toBe('10');                                  // số ngắn không rõ nhãn: giữ nguyên
  const start = autoValue(p, 'Start date', '10/10/2026', { shiftDays: 9 });
  const end = autoValue(p, 'End date', '20/10/2026', { shiftDays: 9 });
  expect([start, end]).toEqual(['19/10/2026', '29/10/2026']);                          // cùng dời 9 ngày → cách nhau vẫn 10 ngày
  expect(shiftDate('2026-12-30', 3)).toBe('2027-01-02');
  expect(shiftDate('abc', 3)).toBeNull();
  const t1 = autoValue(p, 'Plan title', 'Tạo kế hoạch Q4'); const t2 = autoValue(makeProfile(22, 'x@y.z', now), 'Plan title', 'Tạo kế hoạch Q4');
  expect(t1).toMatch(/^Tạo kế hoạch Q4 [0-9A-Z]{4}$/);
  expect(t1).not.toBe(t2);                                                            // mỗi lần chạy một mã khác → không trùng bản ghi
  expect(autoValue(p, 'Plan title', 'Mã 20261011041918399')).toMatch(/^Mã [0-9A-Z]{4}$/);
});

test('portalValue/autoValue nhận nhãn tiếng Anh của giao diện (Full name, Address, Salary, Company…)', () => {
  const p = makeProfile(5, 'qa@shinhanbank.com', new Date('2026-10-19T00:00:00Z'));
  expect(portalValue(p, 'Full name', '', 'INPUT', 1)).toBeTruthy();
  expect(portalValue(p, 'Address', '', 'INPUT', 1)).toBe(p.address);
  expect(portalValue(p, 'Expected salary', '', 'INPUT', 1)).toBe(String(p.salary));
  expect(portalValue(p, 'Company', '', 'INPUT', 1)).toBe(p.company);
});

// ---------- Gom bước nghiệp vụ bằng quy tắc ----------
test('groupSteps: mỗi trang một bước, thao tác ghi dữ liệu kết thúc bước, tên nói đúng điều đã quan sát', () => {
  const steps = [
    { text: 'a', url: '/plans', act: { type: 'nav' }, effects: [] },
    { text: 'b', url: '/plans', act: { type: 'click', text: 'Create' }, effects: [] },
    { text: 'c', url: '/plans/create', act: { type: 'nav' }, effects: [] },
    { text: 'd', url: '/plans/create', act: { type: 'click', dataChoice: true, dataField: 'Mẫu', text: 'X' }, effects: [] },
    { text: 'e', url: '/plans/create', act: { type: 'input', field: 'Số lượng' }, effects: [] },
    { text: 'f', url: '/plans/create', act: { type: 'click', text: 'Save' }, effects: ['POST /plans → 201'] },
    { text: 'g', url: '/plans/1', act: { type: 'nav' }, effects: [] },
  ];
  const g = groupSteps(steps);
  expect(g.map((x: any) => x.stepIndices)).toEqual([[0, 1], [2, 3, 4, 5], [6]]);
  expect(g[1].title).toBe('Lưu dữ liệu (POST /plans)');
  expect(g[2].title).toBe('Vào trang /plans/1');
  expect(g.every((x: any) => x.source === 'machine')).toBe(true);
});

// ---------- Điền form BSTT từ link ----------
test('runPortalFill: chỉ nhận link https của staging có /extra-info/<mã>', () => {
  for (const bad of ['', 'không phải link', 'http://tuyendung-shb.stg.ehiring.com.vn/extra-info/abc', 'https://example.com/extra-info/abc', 'https://tuyendung-shb.stg.ehiring.com.vn/login'])
    expect(() => runPortalFill({ url: bad, submit: false }), bad).toThrow();
});

test('makeProfile: email mặc định là địa chỉ giả @example.com, không phải email công ty', () => {
  const p = makeProfile(5, undefined, new Date('2026-10-19T00:00:00Z'));
  expect(p.email).toMatch(/^[a-z]+\d{1,3}@example\.com$/);
  expect(p.email).not.toMatch(/shinhan/i);
});
