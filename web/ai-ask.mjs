// Gọi mô hình Claude: dùng chung cho flows/ai.ts (lúc chạy lại) và web/knowledge-update.mjs (cập nhật tài liệu luồng).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

// Chế độ demo (máy cá nhân): QA_AI_CLI=1 dùng Claude Code đã đăng nhập sẵn trên máy bạn, KHÔNG cần API key. Chạy không công cụ (--tools ""), chỉ nhận chữ — nên không gửi ảnh chụp.
export const aiOn = () => (!!process.env.ANTHROPIC_API_KEY || process.env.QA_AI_CLI === '1') && process.env.QA_AI !== '0';

function claudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const ext = join(homedir(), '.vscode', 'extensions');
  if (existsSync(ext)) {
    const dir = readdirSync(ext).filter((d) => d.startsWith('anthropic.claude-code')).sort().pop();
    const exe = dir && join(ext, dir, 'resources', 'native-binary', process.platform === 'win32' ? 'claude.exe' : 'claude');
    if (exe && existsSync(exe)) return exe;
  }
  return 'claude';
}

/** Gọi Claude Code ở chế độ chỉ-hỏi-đáp: không công cụ, không phiên lưu, không MCP/cài đặt người dùng, chạy trong thư mục rỗng. */
function askCli(system, content, timeoutMs = 90_000) {
  const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const cwd = join(tmpdir(), 'ehiring-autotest-ai');
  mkdirSync(cwd, { recursive: true });
  const args = ['-p', '--tools', '', '--no-session-persistence', '--strict-mcp-config', '--setting-sources', '', '--disable-slash-commands', '--system-prompt', system, '--model', process.env.QA_AI_CLI_MODEL || 'haiku'];
  return new Promise((done) => {
    const bin = claudeBin();
    const child = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: bin === 'claude' && process.platform === 'win32' });
    let out = ''; let err = '';
    const timer = setTimeout(() => { child.kill(); }, timeoutMs);
    child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { clearTimeout(timer); console.log(`AI: không chạy được Claude Code (${e.message}), bỏ qua.`); done(null); });
    child.on('close', (c) => { clearTimeout(timer); if (c !== 0) console.log(`AI: Claude Code thoát mã ${c} (${err.trim().split('\n')[0] ?? ''}), bỏ qua.`); done(c === 0 && out.trim() ? out.trim() : null); });
    child.stdin.end(text);
  });
}

export async function ask(system, content, maxTokens = 700, timeoutMs = 30_000) {
  if (!aiOn()) return null;
  if (!process.env.ANTHROPIC_API_KEY) return askCli(system, content, Math.max(timeoutMs, 90_000));
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) { console.log(`AI: API trả ${r.status}, bỏ qua.`); return null; }
    const j = await r.json();
    return (j.content ?? []).map((c) => c.text ?? '').join('').trim() || null;
  } catch (e) { console.log(`AI: lỗi gọi API (${e.message}), bỏ qua.`); return null; }
}

