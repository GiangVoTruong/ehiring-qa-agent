// Cập nhật một file knowledge/*.md đã cũ: đưa bản hiện tại + phần code nguồn đã đổi (git diff, chỉ đọc) cho mô hình, ghi lại bản mới.
// Mô hình chỉ nhận chữ (không công cụ, không đọc được file/mạng): mọi thứ nó biết đều nằm trong yêu cầu gửi đi.
// Phần đầu file (flow, sources…) do code giữ nguyên, chỉ đổi learnedCommit/learnedAt — mô hình không được tự chỉnh mốc học.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiOn, ask } from './ai-ask.mjs';
import { defaultRepo, knowledgeStatus, parseKnowledge } from './knowledge-status.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KNOWLEDGE = join(ROOT, 'knowledge');
const BACKUP = join(ROOT, 'data', 'knowledge-backup');
const MAX_DIFF = 90_000; // ký tự diff gửi đi tối đa; quá thì cắt bớt và báo rõ cho mô hình

const SYSTEM = `Bạn cập nhật tài liệu nghiệp vụ eHiring (Markdown, tiếng Việt) cho bộ kiểm thử. Bạn nhận: (1) tài liệu hiện tại, (2) git diff của các file nguồn đã đổi kể từ lúc tài liệu được học.
Quy tắc:
- Chỉ sửa những quy tắc/mục bị diff ảnh hưởng; giữ nguyên mọi phần khác, cấu trúc tiêu đề và cách ghi nguồn.
- Mỗi quy tắc mới hoặc đổi phải ghi nguồn là file code trong diff. KHÔNG suy đoán điều diff không cho thấy; điều chưa chắc ghi vào mục «Điểm chưa chắc» dạng "- [ ] câu hỏi — nguồn đã xem".
- Quy tắc cũ mà diff cho thấy không còn đúng thì sửa hoặc xoá, và thêm một dòng vào mục «Đã đổi theo commit mới» nói đổi gì.
- Không thêm lời dẫn, không bọc trong code fence. Trả về TOÀN BỘ tài liệu Markdown mới, bắt đầu bằng dòng "---" của phần đầu file.`;

const git = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', timeout: 60_000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

/** Tách phần đầu file (--- … ---) và thân. */
const split = (text) => { const m = text.replace(/\r/g, '').match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/); return m ? { fm: m[1], body: m[2] } : null; };

export async function updateKnowledge(file, { repo = defaultRepo(), ref = 'origin/develop' } = {}) {
  if (!/^[\w.-]+\.md$/.test(file) || !existsSync(join(KNOWLEDGE, file))) throw new Error(`Không có file knowledge «${file}»`);
  if (!aiOn()) throw new Error('Chưa bật AI: đặt ANTHROPIC_API_KEY (hoặc QA_AI_CLI=1 trên máy cá nhân) rồi chạy lại web.');
  const st = knowledgeStatus({ repo, ref });
  if (!st.head) throw new Error(`Không đọc được ${ref}: ${st.error}`);
  const row = st.files.find((f) => f.file === file);
  if (!row || row.status !== 'stale') return { file, updated: false, reason: row?.status === 'fresh' ? 'Đã mới, không cần cập nhật.' : 'Thiếu learnedCommit/sources nên không so được.' };

  const path = join(KNOWLEDGE, file);
  const old = readFileSync(path, 'utf8');
  const parts = split(old); const k = parseKnowledge(old);
  if (!parts || !k) throw new Error('File thiếu phần đầu (frontmatter).');

  let diff = ''; let cut = 0;
  for (const f of row.changed) {
    let d = ''; try { d = git(repo, 'diff', '--unified=3', k.learnedCommit, ref, '--', f); } catch { continue; }
    if (diff.length + d.length > MAX_DIFF) { cut++; continue; }
    diff += d + '\n';
  }
  const prompt = `## Tài liệu hiện tại (${file}, học ở ${k.learnedCommit})\n\n${old}\n\n## Diff các file nguồn đã đổi (${k.learnedCommit} → ${st.head})\n\n${diff || '(không đọc được diff)'}${cut ? `\n\n(Còn ${cut} file đổi nữa không gửi kèm vì quá dài: ghi vào «Điểm chưa chắc» rằng chúng chưa được học.)` : ''}`;
  const out = await ask(SYSTEM, [{ type: 'text', text: prompt }], 16_000, 240_000);
  if (!out) throw new Error('Mô hình không trả lời (hết thời gian hoặc lỗi). Tài liệu giữ nguyên.');

  const next = split(out.replace(/^```(?:markdown|md)?\n/, '').replace(/\n```\s*$/, ''));
  if (!next || next.body.trim().length < parts.body.trim().length * 0.5) throw new Error('Câu trả lời không đúng dạng hoặc ngắn bất thường (có thể bị cắt). Tài liệu giữ nguyên.');

  const today = new Date().toISOString().slice(0, 10);
  const fm = parts.fm.replace(/^learnedCommit:.*$/m, `learnedCommit: ${st.head}`).replace(/^learnedAt:.*$/m, `learnedAt: ${today}`);
  mkdirSync(BACKUP, { recursive: true });
  const backup = join(BACKUP, `${file.replace(/\.md$/, '')}.${k.learnedCommit}.md`);
  copyFileSync(path, backup);
  writeFileSync(path, fm + next.body.replace(/^\n?/, '\n'));
  return { file, updated: true, from: k.learnedCommit, to: st.head, changed: row.changed.length, skipped: cut, backup: backup.slice(ROOT.length + 1).replace(/\\/g, '/') };
}
