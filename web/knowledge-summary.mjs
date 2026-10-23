// Biến một tài liệu knowledge thành LUỒNG NGHIỆP VỤ có cấu trúc cho người không rành kỹ thuật (BA, HR, QA nghiệp vụ).
// Mô hình trả về JSON (hành trình trạng thái + các bước + nhánh + điều kiện chặn); giao diện vẽ thành sơ đồ, không phải đoạn văn.
// Chỉ dùng thông tin có trong tài liệu; kết quả lưu theo nội dung tài liệu nên chỉ gọi mô hình lại khi tài liệu đổi (hoặc bấm «Tạo lại»).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiOn, ask } from './ai-ask.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KNOWLEDGE = join(ROOT, 'knowledge');
const CACHE = join(ROOT, 'data', 'knowledge-summary');

const SYSTEM = `Bạn giải thích một quy trình nghiệp vụ của phần mềm tuyển dụng eHiring cho người HOÀN TOÀN không biết kỹ thuật (nhân viên nhân sự, quản lý). Tiếng Việt đời thường, câu ngắn, mỗi ý một việc.
Chỉ dùng thông tin trong tài liệu, không bịa; điều tài liệu ghi là chưa chắc thì nói rõ "chưa chắc".
CẤM: tên trường dữ liệu, enum, đường dẫn API, tên file code, mã lỗi, từ viết tắt khó hiểu. Dịch tên nút/trạng thái tiếng Anh sang tiếng Việt dễ hiểu (nếu cần giữ chữ trên màn hình thì ghi trong ngoặc kép sau khi đã giải thích bằng tiếng Việt). Giải thích thuật ngữ ngay lần đầu (ví dụ "định biên" = số nhân sự được phép tuyển; "TA Admin" = người quản trị tuyển dụng).
ĐỘ DÀI: mỗi "action" tối đa 15 từ, mỗi "result" và "when" tối đa 12 từ, mỗi ý trong "blocked"/"notes" tối đa 18 từ. Mỗi bước chỉ một hành động. Bỏ chi tiết phụ (email, thông báo, tệp đính kèm) trừ khi quyết định kết quả.
Trả về DUY NHẤT một JSON (không code fence, không lời dẫn) đúng dạng:
{
 "purpose": "1–2 câu: quy trình này dùng để làm gì",
 "path": ["tên trạng thái 1", "tên trạng thái 2", ...],   // hành trình chính, 3–7 trạng thái, tên tiếng Việt ngắn
 "steps": [ {"who": "ai làm (vai trò)", "action": "làm gì, 1 câu", "result": "kết quả / trạng thái sau đó, ngắn"} ],  // 4–9 bước chính theo thứ tự
 "branches": [ {"when": "khi nào xảy ra nhánh này", "result": "chuyện gì xảy ra"} ],  // rẽ nhánh: từ chối, huỷ, mở lại, tự động...
 "blocked": ["tình huống người dùng bị chặn hoặc báo lỗi, 1 câu mỗi ý"],
 "notes": ["điều cần lưu ý cho người dùng hoặc người kiểm thử, tối đa 4 ý"]
}`;

const hashOf = (t) => createHash('sha1').update(t).digest('hex').slice(0, 10);
const strs = (a) => (Array.isArray(a) ? a.map((x) => String(x)).filter(Boolean) : []);
const objs = (a, keys) => (Array.isArray(a) ? a.filter((x) => x && typeof x === 'object').map((x) => Object.fromEntries(keys.map((k) => [k, String(x[k] ?? '')]))) : []);

/** Lấy JSON đầu tiên trong câu trả lời và ép về đúng dạng; thiếu phần cốt lõi thì coi như hỏng. */
export function parseSummary(text) {
  const m = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  const s = { purpose: String(j.purpose ?? ''), path: strs(j.path), steps: objs(j.steps, ['who', 'action', 'result']), branches: objs(j.branches, ['when', 'result']), blocked: strs(j.blocked), notes: strs(j.notes) };
  return s.purpose && s.steps.length ? s : null;
}

export async function summarizeKnowledge(file, { force = false } = {}) {
  if (!/^[\w.-]+\.md$/.test(file) || !existsSync(join(KNOWLEDGE, file))) throw new Error(`Không có tài liệu «${file}»`);
  const text = readFileSync(join(KNOWLEDGE, file), 'utf8');
  const stem = file.replace(/\.md$/, '');
  const path = join(CACHE, `${stem}.${hashOf(text)}.v2.json`);
  if (!force && existsSync(path)) return { file, summary: JSON.parse(readFileSync(path, 'utf8')), cached: true };
  if (!aiOn()) throw new Error('Chưa bật AI để tóm tắt (đặt ANTHROPIC_API_KEY hoặc QA_AI_CLI=1).');
  const out = await ask(SYSTEM, [{ type: 'text', text: text.replace(/^---[\s\S]*?\n---\n?/, '') }], 3500, 180_000);
  const summary = parseSummary(out);
  if (!summary) throw new Error('Mô hình không trả về luồng hợp lệ. Thử lại sau.');
  mkdirSync(CACHE, { recursive: true });
  for (const old of readdirSync(CACHE).filter((f) => f.startsWith(`${stem}.`))) unlinkSync(join(CACHE, old)); // bỏ bản của nội dung cũ
  writeFileSync(path, JSON.stringify(summary, null, 1));
  return { file, summary, cached: false };
}
