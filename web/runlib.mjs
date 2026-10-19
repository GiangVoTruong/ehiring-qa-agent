// Logic thuần (không cần trình duyệt) của lượt chạy lại: tổng hợp trạng thái, xác minh kết quả mong đợi, cập nhật mức tin cậy quy tắc.
import { cleanExpected } from './analysis.mjs';

/** Hành động khó đảo ngược / ra ngoài hệ thống: KHÔNG tự chạy, trừ khi người dùng bật allowRisky cho riêng lượt đó. */
export const RISKY = /create employee|convert candidates|post job|đăng tin|blacklist|send onboarding email|delete|xoá|xóa|remove/i;

export function overallStatus(steps) {
  const st = steps.map((s) => s.status);
  if (st.includes('Failed')) return 'Failed';
  if (st.includes('Blocked')) return 'Blocked';
  if (st.includes('Needs review')) return 'Needs review';
  return st.some((x) => x === 'Passed') ? 'Passed' : 'Skipped';
}

const same = (a, b) => a.method === b.method && a.path === b.path;

/**
 * So kết quả THỰC TẾ của lượt chạy với kỳ vọng rút từ bản quay. Trả về các "bước xác minh" nối vào báo cáo.
 * Chỉ xác minh qua phản hồi API + thông báo trên giao diện — KHÔNG đọc database backend (ghi rõ ở limits).
 */
export function verifyExpected({ expected: rawExpected, observedWrites, observedToasts, params = {} }) {
  const expected = cleanExpected(rawExpected);
  const out = [];
  const add = (title, status, classification, error, evidence) => out.push({ title, status, classification, error, evidence });
  if (params.expectNoWrite) {
    const ok = observedWrites.filter((w) => w.status >= 200 && w.status < 300);
    if (ok.length) add('Giả thuyết «bỏ trống thì không tạo được»', 'Failed', 'business', `Vẫn có API ghi thành công: ${ok.map((w) => `${w.method} ${w.path} → ${w.status}`).join(', ')}. Giả thuyết bị bác bỏ — cần xem lại quy tắc bắt buộc.`, { observedWrites });
    else add('Giả thuyết «bỏ trống thì không tạo được»', 'Passed', null, null, { observedWrites, note: 'Không có API ghi nào thành công (đã thử 1 lần).' });
    return out;
  }
  const seen = new Set();
  for (const w of expected.writes ?? []) {
    const k = `${w.method} ${w.path}`;
    if (seen.has(k)) continue; seen.add(k);
    const got = observedWrites.filter((o) => same(o, w));
    const ok = got.find((o) => o.status >= 200 && o.status < 300);
    if (ok) add(`Kết quả: ${k} trả ${ok.status}`, 'Passed', null, null, { expected: w.status, actual: ok.status });
    else if (got.length) add(`Kết quả: ${k}`, 'Failed', 'business', `Mong đợi 2xx (bản quay: ${w.status}) nhưng thực tế ${got.map((o) => o.status).join('/')}.`, { expected: w.status, actual: got.map((o) => o.status) });
    else add(`Kết quả: ${k}`, 'Failed', 'business', 'API này không được gọi trong lượt chạy (bản quay có gọi). Luồng không đạt tới bước lưu hoặc hệ thống từ chối trước đó.', { expected: w.status, actual: null });
  }
  for (const t of expected.toasts ?? []) {
    const k = `thông báo ${t.kind}`;
    if (out.some((o) => o.title.startsWith(`Kết quả: ${k}`))) continue;
    const sameKind = observedToasts.filter((o) => o.kind === t.kind);
    if (sameKind.some((o) => o.text === t.text)) add(`Kết quả: ${k} «${t.text}»`, 'Passed', null, null, { actual: t.text });
    else if (sameKind.length) add(`Kết quả: ${k}`, 'Needs review', null, `Có thông báo ${t.kind} nhưng nội dung khác: «${sameKind[0].text}» (bản quay: «${t.text}»).`, { actual: sameKind[0].text });
    else if (observedToasts.some((o) => o.kind === 'error') && t.kind === 'success') add(`Kết quả: ${k}`, 'Failed', 'business', `Mong đợi thông báo thành công nhưng hiện lỗi: «${observedToasts.find((o) => o.kind === 'error').text}».`, { actual: observedToasts });
    else add(`Kết quả: ${k}`, 'Needs review', null, `Không thấy thông báo «${t.text}» (có thể đã biến mất trước khi đọc).`, { actual: null });
  }
  if (!out.length) add('Kết quả cuối', 'Needs review', null, 'Bản quay không có API ghi hay thông báo để đối chiếu — chưa xác minh được kết quả, chỉ biết các thao tác chạy được.', {});
  return out;
}

/** verdict = kết quả bước xác minh giả thuyết (chỉ truyền khi KHÔNG có lỗi automation, để không đổ lỗi cho quy tắc). Nâng/hạ mức tin cậy quy tắc bắt buộc tương ứng. Trả về mô tả thay đổi. */
export function applyVerification(store, { flowId, testCase, verdict }) {
  if (!testCase || testCase.kind !== 'required-validation' || !["Passed", "Failed"].includes(verdict)) return null;
  const label = /«(.+?)»/.exec(testCase.title)?.[1];
  if (!label) return null;
  const rule = store.listRules(flowId).find((r) => r.kind === 'required-marker' && r.statement.includes(`«${label}»`));
  if (!rule) return null;
  const status = verdict === "Passed" ? 'Confirmed' : 'Needs verification';
  store.setRuleStatus(rule.id, status);
  return { ruleId: rule.id, from: rule.status, to: status };
}

