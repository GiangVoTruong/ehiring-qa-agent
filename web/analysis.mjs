// Phân tích bản quay → flow nghiệp vụ. Hai tầng, tách bạch để KHÔNG bịa quy tắc:
//  1) observeFacts: dữ kiện QUAN SÁT được bằng máy (so sánh trạng thái form trước/sau mỗi thao tác, API, thông báo) → status "Observed".
//  2) AI: gom bước nghiệp vụ, suy luận, câu hỏi, test case → JSON theo schema, được validateAnalysis kiểm lại; AI chỉ được gắn
//     "Inferred" / "Needs verification", không bao giờ "Observed"/"Confirmed". "Confirmed" chỉ do người xác nhận hoặc lượt chạy kiểm chứng.

const READ_ONLY_API = /\/(dashboard|search|query|filter|count|export|statistics)(\/|$)/i;
/** API của đăng nhập / SSO / xác thực 2 bước: không thuộc nghiệp vụ nên không bao giờ coi là "kết quả mong đợi". */
export const AUTH_API = /\/(bff-sso|login-actions|openid-connect|realms|auth)(\/|$)/i;
export const isWriteApi = (method, path) => !['GET', 'HEAD', 'OPTIONS'].includes(method) && !READ_ONLY_API.test(path) && !AUTH_API.test(path);
/** Bỏ API đăng nhập khỏi kết quả mong đợi (cả flow đã lưu từ trước khi có quy tắc này). */
export const cleanExpected = (expected) => ({ ...expected, writes: (expected?.writes ?? []).filter((w) => isWriteApi(w.method, w.path)) });

/** Che dữ liệu nhạy cảm trước khi gửi cho AI / hiển thị. */
export function redact(text) {
  return String(text ?? '')
    .replace(/[\w.+-]+@([\w-]+\.[\w.-]+)/g, '***@$1')
    .replace(/\b[0-9a-f]{24}\b/gi, ':id')
    .replace(/\b\d{9,}\b/g, '***')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '***')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '***');
}

const key = (x) => String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/** Dữ kiện quan sát được. Mỗi dữ kiện: { kind, statement, status:'Observed', evidence:[chỉ số bước] }. */
export function observeFacts(steps) {
  const facts = [];
  const add = (kind, statement, evidence) => facts.push({ kind, statement, status: 'Observed', evidence, source: 'observed' });
  const touched = new Set();
  const requiredSeen = new Map();
  steps.forEach((s, i) => {
    const b = s.before, a = s.after;
    const label = s.text.replace(/ \(dữ liệu có thể khác\)$/, '');
    if (b && a) {
      const bf = new Map(b.fields.map((f) => [f.label, f])), af = new Map(a.fields.map((f) => [f.label, f]));
      const names = (arr) => (arr.length > 12 ? `${arr.slice(0, 12).map((x) => `«${x}»`).join(', ')} và ${arr.length - 12} trường khác` : arr.map((x) => `«${x}»`).join(', '));
      const appeared = [...af.keys()].filter((l) => !bf.has(l)), gone = [...bf.keys()].filter((l) => !af.has(l));
      if (b.url === a.url && appeared.length) add('field-appears', `Sau «${label}», ${appeared.length} trường xuất hiện trên form: ${names(appeared)}.`, [i]);
      if (b.url === a.url && gone.length) add('field-disappears', `Sau «${label}», ${gone.length} trường biến mất khỏi form: ${names(gone)}.`, [i]);
      for (const [l, f] of af) { const o = bf.get(l); if (o && o.disabled !== f.disabled) add('field-state', `Sau «${label}», trường «${l}» ${f.disabled ? 'bị khoá' : 'được mở (hết khoá)'}.`, [i]); }
      const bb = new Map(b.buttons.map((x) => [x.text, x]));
      for (const x of a.buttons) { const o = bb.get(x.text); if (o && o.disabled !== x.disabled) add('button-state', `Sau «${label}», nút «${x.text}» chuyển từ ${o.disabled ? 'bị khoá sang mở' : 'mở sang bị khoá'}.`, [i]); }
      for (const e of a.errors) if (!b.errors.includes(e)) add('validation-error', `Sau «${label}», form báo lỗi: «${e}».`, [i]);
    }
    for (const f of (a?.fields ?? [])) {
      if (f.required && !requiredSeen.has(f.label)) { requiredSeen.set(f.label, i); }
      const acted = touched.has(f.label);
      if (f.filled && !acted && !facts.some((x) => x.kind === 'default-value' && x.key === f.label)) {
        facts.push({ kind: 'default-value', key: f.label, statement: `Trường «${f.label}» đã có sẵn giá trị khi form mở (chưa ai thao tác trên trường này).`, status: 'Observed', evidence: [i], source: 'observed' });
      }
    }
    if (s.act?.field) touched.add(s.act.field);
    if (s.act?.dataField) touched.add(s.act.dataField);
    for (const e of s.effects ?? []) {
      const m = /^(\w+) (\S+) → (\d+)$/.exec(e);
      if (m && isWriteApi(m[1], m[2])) add('write-api', `Sau «${label}», hệ thống gọi ${m[1]} ${m[2]} → HTTP ${m[3]}.`, [i]);
    }
    for (const t of s.toasts ?? []) add('toast', `Sau «${label}», hiện thông báo ${t.kind}: «${redact(t.text)}».`, [i]);
  });
  for (const [l, i] of requiredSeen) add('required-marker', `Trường «${l}» có dấu hiệu bắt buộc trên giao diện (ký hiệu * / nhãn bắt buộc). Chưa kiểm tra bằng cách bỏ trống.`, [i]);
  return facts.map(({ key: _k, ...f }) => f);
}

/** Kết quả mong đợi rút từ bản quay: chỉ những gì QUAN SÁT được (API ghi + thông báo). */
export function buildExpected(steps) {
  const writes = [], toasts = [];
  steps.forEach((s, i) => {
    for (const e of s.effects ?? []) { const m = /^(\w+) (\S+) → (\d+)$/.exec(e); if (m && isWriteApi(m[1], m[2])) writes.push({ method: m[1], path: m[2], status: Number(m[3]), step: i }); }
    for (const t of s.toasts ?? []) toasts.push({ kind: t.kind, text: t.text, step: i });
  });
  return { writes, toasts, finalUrl: steps.at(-1)?.url ?? '' };
}

export const flowSignature = (expected) => [...new Set(expected.writes.map((w) => `${w.method} ${w.path}`))].sort().join('|');

/** Tìm flow tương tự đã có (cùng chữ ký API ghi, cùng tên hoặc tên gần giống) để tái sử dụng thay vì tạo trùng. */
export function findSimilar(flows, { name, signature }) {
  const words = (t) => new Set(key(t).split(/[^a-z0-9]+/).filter((w) => w.length > 1));
  const wa = words(name);
  return flows.map((f) => {
    const wb = words(f.name);
    const inter = [...wa].filter((w) => wb.has(w)).length;
    const jac = wa.size + wb.size ? inter / (wa.size + wb.size - inter) : 0;
    const sameSig = !!signature && f.signature === signature;
    return { id: f.id, name: f.name, score: Math.max(jac, sameSig ? 0.9 : 0), reason: sameSig ? 'cùng API ghi dữ liệu' : jac >= 0.5 ? 'tên gần giống' : '' };
  }).filter((x) => x.score >= 0.5).sort((a, b) => b.score - a.score);
}

const AI_KINDS = ['happy', 'required-validation', 'alternative', 'negative', 'boundary', 'regression'];

/** Kiểm tra JSON AI trả về. Ép trạng thái quy tắc: AI không được tự nhận Observed/Confirmed; bằng chứng phải trỏ tới bước có thật. */
export function validateAnalysis(raw, stepCount) {
  const problems = [];
  const v = { summary: '', businessSteps: [], rules: [], questions: [], testCases: [], parameters: [] };
  if (!raw || typeof raw !== 'object') return { ok: false, value: v, problems: ['AI không trả về đối tượng JSON'] };
  v.summary = String(raw.summary ?? '').slice(0, 600);
  const idxOk = (a) => Array.isArray(a) && a.every((n) => Number.isInteger(n) && n >= 0 && n < stepCount);
  for (const b of Array.isArray(raw.business_steps) ? raw.business_steps : []) {
    if (!b?.title || !idxOk(b.step_indices)) { problems.push(`business_steps bỏ qua: ${JSON.stringify(b).slice(0, 80)}`); continue; }
    v.businessSteps.push({ title: String(b.title).slice(0, 160), description: String(b.description ?? '').slice(0, 400), stepIndices: b.step_indices });
  }
  for (const r of Array.isArray(raw.rules) ? raw.rules : []) {
    if (!r?.statement) continue;
    const evidence = idxOk(r.evidence) ? r.evidence : [];
    let status = r.status === 'Needs verification' ? 'Needs verification' : 'Inferred';
    if (!evidence.length) { status = 'Needs verification'; if (r.status === 'Inferred') problems.push(`quy tắc không có bằng chứng → hạ về Needs verification: ${String(r.statement).slice(0, 60)}`); }
    if (['Observed', 'Confirmed'].includes(r.status)) problems.push(`AI tự nhận ${r.status} → ép thành ${status}: ${String(r.statement).slice(0, 60)}`);
    v.rules.push({ kind: String(r.kind ?? 'business-rule').slice(0, 40), statement: String(r.statement).slice(0, 400), status, evidence, source: 'ai' });
  }
  for (const q of Array.isArray(raw.questions) ? raw.questions : []) if (q?.text) v.questions.push({ text: String(q.text).slice(0, 300), why: String(q.why ?? '').slice(0, 300) });
  for (const t of Array.isArray(raw.test_cases) ? raw.test_cases : []) {
    if (!t?.title || !AI_KINDS.includes(t.kind)) { problems.push(`test_case bỏ qua: ${JSON.stringify(t).slice(0, 80)}`); continue; }
    v.testCases.push({ kind: t.kind, title: String(t.title).slice(0, 200), expected: String(t.expected ?? '').slice(0, 300), requiresPermission: true, executable: false, note: String(t.what_to_explore ?? '').slice(0, 300) || 'AI đề xuất, chưa có cách chạy tự động — cần khám phá thêm.' });
  }
  for (const p of Array.isArray(raw.parameters) ? raw.parameters : []) if (p?.description) v.parameters.push({ step: Number.isInteger(p.step) ? p.step : null, description: String(p.description).slice(0, 200), howToVary: String(p.how_to_vary ?? '').slice(0, 200) });
  return { ok: true, value: v, problems };
}

/** Test case tự dựng từ dữ kiện quan sát — chạy lại được bằng bộ replay (biến thể của chính bản quay). */
export function deriveTestCases(steps, facts, expected = { writes: [] }) {
  const cases = [{ kind: 'happy', title: 'Luồng thành công: làm lại đúng như đã quay', variant: {}, expected: 'Mọi bước chạy được và các API ghi / thông báo xảy ra giống bản quay.', requiresPermission: true, executable: true, note: '' },
    { kind: 'regression', title: 'Hồi quy: chạy lại luồng đã lưu để phát hiện lỗi mới', variant: {}, expected: 'Giống luồng thành công; khác đi là dấu hiệu hồi quy hoặc giao diện đổi.', requiresPermission: true, executable: true, note: 'Chạy định kỳ.' }];
  for (const f of facts.filter((x) => x.kind === 'required-marker')) {
    const label = /«(.+?)»/.exec(f.statement)?.[1];
    const idx = steps.findIndex((s) => s.act && (s.act.field === label || s.act.dataField === label) && (s.act.type === 'input' || s.act.dataChoice));
    if (idx < 0) continue;
    if (!expected.writes?.length) { // Bản quay không có bước lưu: bỏ trống rồi "không có API ghi" là hiển nhiên → sẽ xác nhận sai quy tắc. Không cho chạy.
      cases.push({ kind: 'required-validation', title: `Bỏ trống «${label}» rồi lưu`, variant: null, expected: 'Chưa kiểm tra được.', requiresPermission: true, executable: false, note: 'Bản quay chưa có bước lưu/gửi — quay tiếp tới bước lưu rồi phân tích lại để kiểm chứng trường bắt buộc.' });
      continue;
    }
    cases.push({ kind: 'required-validation', title: `Bỏ trống «${label}» rồi lưu`, variant: { omit: [idx], expectNoWrite: true }, expected: 'Giả thuyết (chưa xác minh): hệ thống từ chối hoặc báo lỗi, không tạo bản ghi. Kết quả chạy sẽ xác nhận hoặc bác bỏ.', requiresPermission: true, executable: true, note: 'Chỉ chạy khi bạn cho phép trên môi trường test.' });
  }
  const dataIdx = steps.map((s, i) => (s.act?.dataChoice ? i : -1)).filter((i) => i >= 0);
  for (const i of dataIdx) cases.push({ kind: 'alternative', title: `Dữ liệu khác ở bước ${i + 1}: ${steps[i].act.dataField || 'danh sách chọn'} (lấy mục đầu tiên)`, variant: { values: { [i]: '' }, fallbackFirst: true }, expected: 'Luồng vẫn hoàn thành; nếu khác bản quay thì ghi nhận là nhánh khác.', requiresPermission: true, executable: true, note: '' });
  return cases;
}

const SCHEMA_HINT = `{"summary":"1-2 câu","business_steps":[{"title":"bước nghiệp vụ","description":"...","step_indices":[0,1]}],"rules":[{"kind":"dependency|required|default|validation|state|other","statement":"...","status":"Inferred|Needs verification","evidence":[chỉ số bước],"confidence":0.0}],"questions":[{"text":"câu hỏi xác minh ngắn","why":"vì sao cần"}],"test_cases":[{"kind":"happy|required-validation|alternative|negative|boundary|regression","title":"...","expected":"...","what_to_explore":"cần khám phá gì thêm nếu chưa đủ bằng chứng"}],"parameters":[{"step":0,"description":"dữ liệu có thể khác","how_to_vary":"..."}]}`;

export async function analyzeRecording({ rec, facts, similar, docs, ask, provider = 'claude' }) {
  const steps = rec.steps.map((s, i) => `${i}. ${redact(s.text)}${(s.effects ?? []).map((e) => ` [API ${e}]`).join('')}${(s.toasts ?? []).map((t) => ` [toast ${t.kind}: ${redact(t.text)}]`).join('')}${(s.notes ?? []).map((n) => ` [ghi chú tester: ${redact(n)}]`).join('')}`).join('\n');
  const prompt = `Bạn là QA analyst. Tester vừa thao tác tay một luồng trên eHiring (họ KHÔNG nhất thiết hiểu nghiệp vụ, có thể thao tác sai hoặc đang khám phá). Hãy tái dựng luồng nghiệp vụ và nêu các quy tắc CÓ THỂ có.

QUY TẮC BẮT BUỘC:
- Chỉ dùng dữ liệu bên dưới. Không bịa quy tắc. Thứ tự thao tác KHÔNG chứng minh phụ thuộc (đã chọn A trước B ≠ B phụ thuộc A).
- Mỗi quy tắc phải có "evidence" là chỉ số các bước ở danh sách bên dưới; không có bằng chứng thì status = "Needs verification".
- status chỉ được là "Inferred" (suy luận từ bằng chứng) hoặc "Needs verification". KHÔNG dùng "Observed"/"Confirmed".
- Gom nhiều thao tác nhỏ thành MỘT bước nghiệp vụ. Chỉ hỏi câu thật sự cần thiết (tối đa 4).
- Test case negative/boundary: chỉ đề xuất khi có căn cứ; nếu chưa đủ, ghi what_to_explore thay vì tự đặt ra quy tắc.

# Các bước đã quay (đánh số từ 0)
${steps}

# Dữ kiện máy QUAN SÁT được (đã chắc, không cần suy luận lại)
${facts.map((f) => `- [${f.kind}] ${redact(f.statement)}`).join('\n') || '(không có)'}

# Flow tương tự đã có
${similar.map((s) => `- ${s.name} (${s.reason})`).join('\n') || '(không có)'}

# Tài liệu nghiệp vụ đã học (trích)
${docs}

Chỉ trả về MỘT đối tượng JSON, không văn bản ngoài, đúng dạng:
${SCHEMA_HINT}`;
  const { result, cost, model } = await ask(prompt, provider);
  let raw = null;
  try { raw = JSON.parse(result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1)); } catch { /* validateAnalysis báo */ }
  const checked = validateAnalysis(raw, rec.steps.length);
  return { ...checked, cost, model };
}

/**
 * Hiển thị TRONG LÚC quay (không gọi AI): gom dữ kiện máy thấy thành 3 nhóm.
 * observed = dữ kiện đã thấy · possible = gợi ý suy ra từ đúng dữ kiện đó (mới thấy 1 lần, KHÔNG phải quy tắc) · verify = điều còn chưa kiểm tra.
 */
export function liveInsights(steps, facts) {
  const observed = [], possible = [], verify = [];
  const labelOf = (f) => steps[f.evidence?.[0]]?.act;
  for (const f of facts) {
    if (f.kind === 'required-marker') { verify.push({ text: f.statement, evidence: f.evidence }); continue; }
    if (f.kind === 'default-value') { observed.push({ text: f.statement, evidence: f.evidence }); continue; }
    observed.push({ text: f.statement, evidence: f.evidence });
    const a = labelOf(f);
    if (f.kind === 'field-appears' && a?.dataChoice) possible.push({ text: `Lựa chọn «${a.dataField || a.text}» có thể quyết định các trường hiển thị tiếp theo — mới thấy 1 lần với «${a.text}».`, evidence: f.evidence });
    else if (f.kind === 'field-appears') possible.push({ text: `Thao tác «${steps[f.evidence[0]].text}» có thể làm hiện thêm trường — chưa thử cách khác.`, evidence: f.evidence });
    if (f.kind === 'button-state') possible.push({ text: 'Trạng thái nút có thể phụ thuộc điều kiện nhập liệu — cần thử bỏ trống để biết.', evidence: f.evidence });
    if (f.kind === 'validation-error') verify.push({ text: f.statement + ' Cần xác nhận đây là quy tắc hay chỉ là dữ liệu nhập sai.', evidence: f.evidence });
  }
  steps.forEach((s, i) => { if (s.act?.dataChoice) verify.push({ text: `Mới chọn một giá trị «${s.act.text}» ở «${s.act.dataField || 'danh sách'}» — chưa biết các lựa chọn khác có dẫn tới luồng khác không.`, evidence: [i] }); });
  const dedupe = (a) => [...new Map(a.map((x) => [x.text, x])).values()];
  return { observed: dedupe(observed), possible: dedupe(possible), verify: dedupe(verify) };
}
