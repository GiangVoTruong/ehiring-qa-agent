import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore — module .mjs dùng chung với web
import { expandBraces, knowledgeStatus, parseKnowledge } from '../../web/knowledge-status.mjs';

const sh = (repo: string, ...a: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' }).trim();

test('đọc frontmatter: learnedCommit, learnedAt, sources (bung ngoặc nhọn, bỏ chú thích sau dấu cách)', () => {
  const k = parseKnowledge('---\nflow: x\nlearnedCommit: abc123\nlearnedAt: 2026-10-10\nsources:\n  - a/b.{vm,schema}.ts\n  - c/d.ts (ghi chú)\n---\n# Thân\n');
  expect(k).toEqual({ learnedCommit: 'abc123', learnedAt: '2026-10-10', sources: ['a/b.vm.ts', 'a/b.schema.ts', 'c/d.ts'] });
  expect(parseKnowledge('không có frontmatter')).toBeNull();
  expect(expandBraces('x.{a,b}.{c,d}')).toEqual(['x.a.c', 'x.a.d', 'x.b.c', 'x.b.d']);
});

test('so với nhánh: chỉ file nguồn đã khai báo mới làm knowledge cũ', () => {
  const repo = mkdtempSync(join(tmpdir(), 'ks-repo-')); const kd = mkdtempSync(join(tmpdir(), 'ks-know-'));
  sh(repo, 'init', '-q'); mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'a.ts'), '1'); writeFileSync(join(repo, 'src', 'b.ts'), '1'); writeFileSync(join(repo, 'other.txt'), '1');
  sh(repo, 'add', '-A'); sh(repo, 'commit', '-q', '-m', 'c1');
  const c1 = sh(repo, 'rev-parse', '--short', 'HEAD');
  writeFileSync(join(repo, 'src', 'a.ts'), '2'); writeFileSync(join(repo, 'other.txt'), '2'); // chỉ a.ts thuộc nguồn của knowledge
  sh(repo, 'add', '-A'); sh(repo, 'commit', '-q', '-m', 'c2');
  const c2 = sh(repo, 'rev-parse', '--short', 'HEAD');
  const md = (name: string, commit: string, sources: string) => writeFileSync(join(kd, name), `---\nflow: ${name}\nlearnedCommit: ${commit}\nlearnedAt: 2026-10-01\n${sources}---\n# ${name}\n`);
  md('cu.md', c1, 'sources:\n  - src/a.ts\n');
  md('moi.md', c1, 'sources:\n  - src/b.ts\n  - src/{c,d}.ts\n'); // b.ts không đổi, c/d không tồn tại
  md('vua-hoc.md', c2, 'sources:\n  - src/a.ts\n');
  md('thieu-nguon.md', c1, '');
  md('commit-la.md', 'deadbee', 'sources:\n  - src/a.ts\n');
  const r = knowledgeStatus({ knowledgeDir: kd, repo, ref: 'HEAD' });
  const by = Object.fromEntries(r.files.map((f: any) => [f.file, f]));
  expect(r.head).toBe(c2);
  expect(by['cu.md']).toMatchObject({ status: 'stale', changed: ['src/a.ts'] });
  expect(by['moi.md'].status).toBe('fresh');
  expect(by['vua-hoc.md'].status).toBe('fresh');
  expect(by['thieu-nguon.md'].status).toBe('unknown'); // không khai báo nguồn → không đoán
  expect(by['commit-la.md'].status).toBe('unknown'); // commit không còn trong repo → không đoán
});

test('không đọc được nhánh thì trả lỗi rõ ràng, không ném', () => {
  const kd = mkdtempSync(join(tmpdir(), 'ks-know2-'));
  const r = knowledgeStatus({ knowledgeDir: kd, repo: tmpdir(), ref: 'origin/khong-co' });
  expect(r.head).toBe('');
  expect(r.error.length).toBeGreaterThan(0);
});
