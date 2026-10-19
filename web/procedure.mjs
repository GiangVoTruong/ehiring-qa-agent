import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ask } from './ai.mjs';
import { BASE_URL, ROOT } from './config.mjs';
import { REPORTERS, jobs, resumeInfo, startJob } from './jobs.mjs';

// ---------- Quy trình tự soạn: hiểu câu tiếng Việt bằng từ khoá (KHÔNG AI), kiểm tra thứ tự, rồi chạy ----------
const PROC_SPEC = 'tests/custom/procedure.spec.ts';
const PROCS_FILE = join(ROOT, 'web', '.procedures.json');

// state: y = YCTD (none|pending|open|rejected|cancelled|closed), k = kế hoạch (none|not-start|in-progress|pending|finish)
export const ACTIONS = [
  { id: 'kh.vao', nhom: 'Kế hoạch', nhan: 'Vào kế hoạch có sẵn (dán link /recruitment-plans/<id>)', can: (s) => s.y === 'none' && s.k === 'none', ket: (s) => ({ ...s, y: 'open', k: 'existing' }), loi: 'chỉ dùng ở đầu quy trình (thay cho bước tạo YCTD/kế hoạch)' },
  { id: 'ungvien.offer', nhom: 'Ứng viên', nhan: 'Đưa ứng viên tới vòng Offer (xác nhận CV → phỏng vấn đạt → Special to offer)', can: (s) => s.u === 'added', ket: (s) => ({ ...s, u: 'offer' }), loi: 'cần đã thêm ứng viên vào kế hoạch (chỉ chạy với talent QA)' },
  { id: 'ungvien.totrinh', nhom: 'Ứng viên', nhan: 'Tờ trình offer (tạo nháp → gửi duyệt → duyệt)', can: (s) => s.u === 'offer', ket: (s) => ({ ...s, u: 'proposal' }), loi: 'cần ứng viên đã ở vòng Offer' },
  { id: 'ungvien.bstt', nhom: 'Ứng viên', nhan: 'Bổ sung thông tin (ứng viên điền form trên cổng)', can: (s) => s.u === 'proposal', ket: (s) => ({ ...s, u: 'bstt' }), loi: 'cần tờ trình offer đã duyệt' },
  { id: 'ungvien.hris', nhom: 'Ứng viên', nhan: 'Kiểm tra thông tin → vòng HRIS (dừng trước Create employee)', can: (s) => s.u === 'bstt', ket: (s) => ({ ...s, u: 'hris' }), loi: 'cần đã bổ sung thông tin' },
  { id: 'ungvien.them', nhom: 'Ứng viên', nhan: 'Thêm ứng viên QA vào kế hoạch', can: (s) => s.k === 'in-progress' || s.k === 'existing', ket: (s) => ({ ...s, u: 'added' }), loi: 'cần kế hoạch đang chạy (đã bắt đầu)' },
  { id: 'yctd.tao', nhom: 'YCTD', nhan: 'Tạo YCTD (chờ duyệt)', can: (s) => s.y === 'none', ket: (s) => ({ ...s, y: 'pending' }), loi: 'đã có YCTD trong quy trình (mỗi quy trình dùng 1 YCTD)' },
  { id: 'yctd.duyet', nhom: 'YCTD', nhan: 'Duyệt YCTD → Open', can: (s) => s.y === 'pending', ket: (s) => ({ ...s, y: 'open' }), loi: 'cần YCTD đang chờ duyệt' },
  { id: 'yctd.tuchoi', nhom: 'YCTD', nhan: 'Từ chối YCTD → bị từ chối', can: (s) => s.y === 'pending', ket: (s) => ({ ...s, y: 'rejected' }), loi: 'cần YCTD đang chờ duyệt' },
  { id: 'yctd.huy', nhom: 'YCTD', nhan: 'Huỷ YCTD → Cancelled', can: (s) => s.y === 'pending', ket: (s) => ({ ...s, y: 'cancelled' }), loi: 'chỉ huỷ được YCTD đang chờ duyệt' },
  { id: 'yctd.dong', nhom: 'YCTD', nhan: 'Đóng YCTD → Closed (kế hoạch đang chạy bị đóng theo)', can: (s) => s.y === 'open', ket: (s) => ({ ...s, y: 'closed', k: s.k === 'in-progress' || s.k === 'pending' ? 'finish' : s.k }), loi: 'chỉ đóng được YCTD đang Open (đã duyệt)' },
  { id: 'yctd.mo_lai', nhom: 'YCTD', nhan: 'Mở lại YCTD → Open', can: (s) => s.y === 'closed', ket: (s) => ({ ...s, y: 'open' }), loi: 'chỉ mở lại được YCTD đã đóng' },
  { id: 'kh.tao', nhom: 'Kế hoạch', nhan: 'Tạo kế hoạch tuyển dụng', can: (s) => s.y === 'open' && s.k === 'none', ket: (s) => ({ ...s, k: 'not-start' }), loi: 'cần YCTD đang Open và chưa có kế hoạch (mỗi quy trình dùng 1 kế hoạch)' },
  { id: 'kh.batdau', nhom: 'Kế hoạch', nhan: 'Bắt đầu kế hoạch → in-progress', can: (s) => s.k === 'not-start' || s.k === 'existing', ket: (s) => ({ ...s, k: 'in-progress' }), loi: 'cần kế hoạch chưa bắt đầu' },
  { id: 'kh.tamdung', nhom: 'Kế hoạch', nhan: 'Tạm dừng kế hoạch → pending', can: (s) => s.k === 'in-progress' || s.k === 'existing', ket: (s) => ({ ...s, k: 'pending' }), loi: 'cần kế hoạch đang chạy' },
  { id: 'kh.tieptuc', nhom: 'Kế hoạch', nhan: 'Tiếp tục kế hoạch → in-progress', can: (s) => s.k === 'pending' || s.k === 'existing', ket: (s) => ({ ...s, k: 'in-progress' }), loi: 'cần kế hoạch đang tạm dừng' },
  { id: 'kh.dong', nhom: 'Kế hoạch', nhan: 'Đóng kế hoạch (bắt buộc lý do) → finish', can: (s) => s.k === 'in-progress' || s.k === 'pending' || s.k === 'existing', ket: (s) => ({ ...s, k: 'finish' }), loi: 'cần kế hoạch đang chạy hoặc tạm dừng' },
  { id: 'kh.giahan', nhom: 'Kế hoạch', nhan: 'Gia hạn kế hoạch 1 tuần → in-progress', can: (s) => (s.k === 'finish' || s.k === 'existing') && s.y === 'open', ket: (s) => ({ ...s, k: 'in-progress' }), loi: 'cần kế hoạch đã kết thúc và YCTD vẫn Open (YCTD đã đóng thì không gia hạn)' },
];

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
// Thứ tự quan trọng: mẫu đặc thù (kế hoạch) đứng trước mẫu YCTD.
const PATTERNS = [
  ['ungvien.them', /(them|add)\b.*(ung vien|ung cu vien|talent|candidate)/],
  ['ungvien.totrinh', /to trinh|proposal/],
  ['ungvien.bstt', /bo sung thong tin|bstt/],
  ['ungvien.hris', /hris|kiem tra thong tin/],
  ['ungvien.offer', /offer/],
  ['kh.vao', /\b(vao|mo)\b.*(patd|ke hoach|recruitment-plans)/],
  ['kh.tao', /(tao|them|lap)\b.*(ke hoach|patd)|^(ke hoach|patd)$/],
  ['kh.dong', /(dong|ket thuc)\b.*(ke hoach|patd)/],
  ['kh.giahan', /gia han|extend/],
  ['kh.tamdung', /tam dung|on hold|pause/],
  ['kh.tieptuc', /tiep tuc|resume/],
  ['kh.batdau', /bat dau|khoi dong|\bstart\b/],
  ['yctd.tuchoi', /tu choi|reject|decline/],
  ['yctd.mo_lai', /mo lai|reopen/],
  ['yctd.dong', /(dong|ket thuc)\b.*(yctd|yeu cau)/],
  ['yctd.huy', /\bhuy\b|cancel/],
  ['yctd.duyet', /duyet|approve/],
  ['yctd.tao', /(tao|them|lap)\b.*(yctd|yeu cau)|^(yctd|yeu cau tuyen dung)$/],
];

function splitSteps(text) {
  // Mã/link kế hoạch (24 ký tự hex) kết thúc một bước: "vào PATD <id> thêm ứng viên" → 2 bước.
  return text
    .replace(/([0-9a-f]{24}(?:\/\S*)?)[ \t]+(?=\S)/gi, (_, id) => id + '\n')
    .split(/\n|→|->|;|,|\s+(?:để thao tác|để|rồi|sau đó|tiếp theo|và)\s+/i)
    .map((t) => t.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean);
}

function matchAction(raw) {
  const n = norm(raw.replace(/\(.*?\)/g, ' ')).replace(/\s+/g, ' ').trim();
  if (/^dong$/.test(n)) return { loi: 'Mơ hồ: ghi rõ "đóng YCTD" hay "đóng kế hoạch"' };
  if (/\bhuy\b/.test(n) && /(ke hoach|patd)/.test(n)) return { loi: 'Kế hoạch không có thao tác huỷ — dùng "đóng kế hoạch"' };
  // Thêm ứng viên kèm vòng/trực tiếp (vd "thêm trực tiếp vào vòng offer") khác hẳn thao tác có sẵn (chỉ thêm vào vòng đầu) → không ép khớp.
  if (/(them|add)\b.*(ung vien|talent|candidate)/.test(n) && /vong|offer|phong van|truc tiep|stage|round|interview/.test(n)) return { loi: 'Thêm ứng viên trực tiếp vào một vòng cụ thể chưa có flow (flow hiện có chỉ thêm vào vòng đầu "Application")' };
  if (/^\S*recruitment-plans\/[0-9a-f]{24}\S*$/.test(n)) return { id: 'kh.vao' };
  for (const [id, re] of PATTERNS) if (re.test(n)) return { id };
  return { loi: 'Chưa hỗ trợ bước này (chưa có flow tương ứng — cần viết thêm flow)' };
}

export function parseProcedure(text) {
  const out = [];
  let state = { y: 'none', k: 'none' };
  let valid = true;
  for (const raw of splitSteps(text || '')) {
    const m = matchAction(raw);
    const action = m.id && ACTIONS.find((a) => a.id === m.id);
    if (!action) {
      valid = false;
      out.push({ input: raw, ok: false, loi: m.loi });
      continue;
    }
    if (!action.can(state)) {
      valid = false;
      const goi_y = ACTIONS.filter((a) => a.can(state)).map((a) => a.nhan);
      out.push({ input: raw, id: action.id, nhan: action.nhan, ok: false, loi: `Sai thứ tự: ${action.loi}. Có thể làm lúc này: ${goi_y.join(' | ') || '(không còn thao tác)'}` });
      continue;
    }
    let arg;
    if (action.id === 'yctd.tao' || action.id === 'kh.tao') arg = /(^| )moi( |$)/.test(norm(raw)) ? 'new' : undefined; // "tạo mới" → bắt buộc tạo mới
    if (action.id === 'kh.vao') {
      arg = raw.match(/recruitment-plans\/([0-9a-f]{24}(?:\/applications\/[0-9a-f]{24})?)/i)?.[1] ?? raw.match(/\b[0-9a-f]{24}\b/i)?.[0]; // "planId" hoặc "planId/applications/appId"
      if (!arg) { valid = false; out.push({ input: raw, id: action.id, nhan: action.nhan, ok: false, loi: 'Thiếu link kế hoạch — dán dạng .../recruitment-plans/<24 ký tự>/...' }); continue; }
    }
    state = action.ket(state);
    if (action.id === 'kh.vao' && arg.includes('/applications/')) state = { ...state, u: 'added' }; // link hồ sơ → đã có ứng viên
    out.push({ input: raw, id: action.id, nhan: action.nhan, ok: true, arg });
  }
  if (!out.length) valid = false;
  const steps = out.map((s, i) => ({ ...s, label: s.nhan ? `${i + 1}. ${s.nhan}` : undefined }));
  return { steps, valid, cuoi: state };
}

export function runProcedure({ text, headed }) {
  const p = parseProcedure(text);
  if (!p.valid) throw new Error('Quy trình chưa hợp lệ — sửa các bước báo đỏ rồi chạy lại.');
  const job = startJob({
    id: 'procedure',
    ten: `Quy trình tự soạn (${p.steps.length} bước)`,
    args: ['test', '--project=procedure', PROC_SPEC, REPORTERS, '--headed'], // luôn hiện Chrome để tester xem thao tác
    env: { QA_PROCEDURE: JSON.stringify(p.steps.map((s) => ({ id: s.id, label: s.label, arg: s.arg }))), SLOWMO: '300', HOLD_MS: '10000', QA_FULLSCREEN: '1' },
  });
  job.expected = p.steps.map((s) => s.label);
  job.procSteps = p.steps.map((s) => ({ input: s.input, id: s.id }));
  return job;
}

// Chạy tiếp từ bước lỗi: đã có kế hoạch (spec in ##PLAN|<id>) → vào thẳng kế hoạch đó rồi làm các bước còn lại;
// chưa có kế hoạch hoặc còn bước YCTD → chạy lại cả quy trình (spec tự dùng lại YCTD/kế hoạch/ứng viên đã có, bước nào xong thì bỏ qua).
export function resumeProcedure({ id, headed }) {
  const j = jobs.get(String(id));
  const info = j && resumeInfo(j);
  if (!info) throw new Error('Lượt chạy này không có chỗ để chạy tiếp');
  const planId = [...j.log.matchAll(/##PLAN\|([0-9a-f]{24})/g)].pop()?.[1];
  const rest = j.procSteps.slice(info.from).filter((s) => s.id !== 'kh.vao');
  const text = planId && rest.length && rest.every((s) => !s.id.startsWith('yctd.'))
    ? [`${BASE_URL}/recruitment-plans/${planId}`, ...rest.map((s) => s.input)].join('\n')
    : j.procSteps.map((s) => s.input).join('\n');
  return runProcedure({ text, headed });
}


// AI hiểu mô tả tự do → ghép vào danh mục thao tác có sẵn. AI chỉ được CHỌN id trong ACTIONS; bước không khớp → id null (chưa có flow).
export async function interpretProcedure({ text, provider = 'claude' }) {
  if (!text?.trim()) throw new Error('Chưa nhập quy trình');
  const catalog = ACTIONS.map((a) => `- ${a.id}: ${a.nhan}`).join('\n');
  const prompt = `Tester mô tả một quy trình test trên eHiring bằng lời tự do. Hãy tách thành các bước theo đúng thứ tự và gán mỗi bước vào MỘT thao tác trong danh mục tự động hoá bên dưới. Bước nào KHÔNG có thao tác tương ứng (ví dụ thêm ứng viên, chuyển vòng hồ sơ, lấy link đánh giá…) thì id = null — tuyệt đối không ép vào thao tác gần giống.

# Danh mục thao tác đã có
${catalog}

# Mô tả của tester
${text}

Chỉ trả về MỘT đối tượng JSON, không văn bản ngoài:
{"giai_thich":"1-2 câu bạn hiểu quy trình là gì","buoc":[{"input":"đoạn gốc của tester","id":"id thao tác hoặc null","ghi_chu":"vì sao / thiếu gì"}]}`;
  const { result, cost, model } = await ask(prompt, provider);
  let parsed;
  try { parsed = JSON.parse(result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1)); }
  catch { throw new Error('AI trả về không đọc được, thử lại hoặc gõ lại rõ hơn.'); }
  const steps = (parsed.buoc ?? []).map((b) => {
    const a = ACTIONS.find((x) => x.id === b.id);
    return { input: String(b.input ?? ''), id: a?.id ?? null, nhan: a?.nhan, ghi_chu: b.ghi_chu ?? '' };
  });
  const supported = steps.filter((s) => s.id);
  // Dùng lại câu gốc của tester (giữ mã/link kế hoạch), kiểm tra lại thứ tự; id phải trùng với AI chọn.
  const text2 = supported.map((s) => s.input).join('\n');
  const proposal = parseProcedure(text2);
  const same = proposal.steps.length === supported.length && proposal.steps.every((s, i) => s.id === supported[i].id);
  return { provider, model, cost, giai_thich: parsed.giai_thich ?? '', steps, unsupported: steps.filter((s) => !s.id), text: text2, valid: proposal.valid && same && supported.length > 0, order: proposal.steps };
}

export const readProcs = () => (existsSync(PROCS_FILE) ? JSON.parse(readFileSync(PROCS_FILE, 'utf8')) : []);
export function saveProc({ name, text }) {
  if (!name?.trim() || !text?.trim()) throw new Error('Cần tên và nội dung quy trình');
  const list = readProcs().filter((p) => p.name !== name.trim());
  list.push({ name: name.trim().slice(0, 80), text: text.trim() });
  writeFileSync(PROCS_FILE, JSON.stringify(list, null, 1));
  return list;
}
export function deleteProc({ name }) {
  const list = readProcs().filter((p) => p.name !== name);
  writeFileSync(PROCS_FILE, JSON.stringify(list, null, 1));
  return list;
}


