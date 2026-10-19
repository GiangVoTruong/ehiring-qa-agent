// "Dọn dữ liệu test" = (1) dọn kế hoạch/YCTD/mail bằng Playwright cleanup, (2) dọn thông báo rác trong Mongo.
// Chạy bởi web/server.mjs; in log ra stdout để hiện trên web.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pw = join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
const run = (args) => spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, QA_CLEANUP: '1' } });

const a = process.argv.includes('--skip-data') ? { status: 0 } : run([pw, 'test', '--project=cleanup', '--reporter=list']);
console.log('\n--- Dọn thông báo ---');
const b = run([join(ROOT, 'scripts', 'purge-notifications.mjs'), '--apply']);
process.exit(a.status || b.status || 0);
