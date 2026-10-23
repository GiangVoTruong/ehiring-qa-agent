// Kiểm tra knowledge/*.md đã cũ chưa: so `learnedCommit` với origin/develop của repo ehiring, chỉ tính các file nguồn mà từng file knowledge khai báo.
// Chỉ ĐỌC repo bằng git (không fetch, không checkout). Dùng: npm run knowledge:status [-- --json] [-- --repo <đường dẫn>] [-- --ref <nhánh>]
// Mã thoát: 0 = không có file nào cũ · 1 = có file cũ · 2 = không đọc được repo/nhánh (để CI phân biệt).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** `a.{vm,schema}.ts` → ['a.vm.ts', 'a.schema.ts'] */
export const expandBraces = (p) => { const m = p.match(/\{([^{}]+)\}/); return m ? m[1].split(',').flatMap((x) => expandBraces(p.replace(m[0], x))) : [p]; };

/** Đọc frontmatter của file knowledge: learnedCommit, learnedAt, danh sách file nguồn (đã bung ngoặc nhọn). */
export function parseKnowledge(text) {
  const fm = text.replace(/\r/g, '').match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (!fm) return null;
  const sources = [...(fm.match(/^sources:\n((?:\s+-.*\n?)+)/m)?.[1] ?? '').matchAll(/^\s+-\s+(\S+)/gm)].flatMap((m) => expandBraces(m[1]));
  return { learnedCommit: fm.match(/^learnedCommit:\s*(\S+)/m)?.[1] ?? '', learnedAt: fm.match(/^learnedAt:\s*(\S+)/m)?.[1] ?? '', sources };
}

const defaultGit = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * Trạng thái từng file knowledge: 'fresh' (không có commit nào chạm file nguồn kể từ lúc học), 'stale' (có; kèm danh sách file đã đổi),
 * 'unknown' (thiếu learnedCommit/sources hoặc commit không còn trong repo) — không đoán.
 */
export function knowledgeStatus({ knowledgeDir = join(ROOT, 'knowledge'), repo, ref = 'origin/develop', git = defaultGit }) {
  let head = ''; let error = '';
  try { head = git(repo, 'rev-parse', '--short', ref); } catch (e) { error = String(e.stderr || e.message).trim().split('\n')[0]; }
  const files = [];
  for (const f of readdirSync(knowledgeDir).filter((x) => x.endsWith('.md')).sort()) {
    const k = parseKnowledge(readFileSync(join(knowledgeDir, f), 'utf8'));
    if (!k) continue;
    const row = { file: f, learnedCommit: k.learnedCommit, learnedAt: k.learnedAt, status: 'unknown', changed: [] };
    if (head && k.learnedCommit && k.sources.length) {
      try {
        row.changed = git(repo, 'diff', '--name-only', k.learnedCommit, ref, '--', ...k.sources).split('\n').filter(Boolean);
        row.status = row.changed.length ? 'stale' : 'fresh';
      } catch { /* learnedCommit không còn trong repo → unknown */ }
    }
    files.push(row);
  }
  return { ref, head, error, files };
}

export const defaultRepo = () => process.env.EHIRING_REPO || join(ROOT, '..', 'ehiring');

function main() {
  const arg = (name, d) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : d; };
  const repo = arg('--repo', defaultRepo());
  const ref = arg('--ref', 'origin/develop');
  if (!existsSync(repo)) { console.error(`Không thấy repo ehiring tại ${repo} (đặt --repo hoặc biến EHIRING_REPO).`); process.exit(2); }
  const r = knowledgeStatus({ repo, ref });
  if (!r.head) { console.error(`Không đọc được ${ref} của ${repo}: ${r.error}`); process.exit(2); }
  const stale = r.files.filter((f) => f.status === 'stale');
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`Knowledge so với ${ref} (${r.head}):\n`);
    for (const f of r.files) {
      const tag = { fresh: 'MỚI ', stale: 'CŨ  ', unknown: '?   ' }[f.status];
      console.log(`${tag} ${f.file}  (học ở ${f.learnedCommit || '—'}${f.learnedAt ? ', ' + f.learnedAt : ''})${f.changed.length ? ` — ${f.changed.length} file nguồn đã đổi: ${f.changed.slice(0, 3).join(', ')}${f.changed.length > 3 ? '…' : ''}` : ''}`);
    }
    console.log(`\n${stale.length} cũ · ${r.files.filter((f) => f.status === 'fresh').length} mới · ${r.files.filter((f) => f.status === 'unknown').length} chưa xác định (thiếu learnedCommit hoặc sources).`);
    if (stale.length) console.log('Học lại phần đổi bằng agent ehiring-learner, rồi cập nhật learnedCommit.');
  }
  process.exit(stale.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
