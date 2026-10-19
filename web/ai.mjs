// Gọi AI: Claude Code (CLI, chạy từ thư mục rỗng cho nhẹ & rẻ) hoặc Ollama chạy local. Trả { result, cost, model }.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

function findClaude() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const ext = join(os.homedir(), '.vscode', 'extensions');
  if (existsSync(ext)) {
    const dir = readdirSync(ext).filter((d) => d.startsWith('anthropic.claude-code')).sort().pop();
    const exe = dir && join(ext, dir, 'resources', 'native-binary', process.platform === 'win32' ? 'claude.exe' : 'claude');
    if (exe && existsSync(exe)) return exe;
  }
  return 'claude';
}

function runClaude(prompt) {
  return new Promise((resolveP, reject) => {
    const cwd = join(os.tmpdir(), 'ehiring-autotest-web-run');
    mkdirSync(cwd, { recursive: true });
    const child = spawn(
      findClaude(),
      ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--strict-mcp-config', '--setting-sources', '', '--system-prompt', 'Bạn là chuyên gia QA của hệ thống eHiring. Chỉ dựa vào tài liệu được cung cấp; không bịa. Luôn trả lời bằng JSON hợp lệ duy nhất, tiếng Việt.'],
      { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(new Error(`Không chạy được Claude Code: ${e.message}`)));
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Claude Code lỗi (${code}): ${err.slice(0, 300)}`));
      try {
        const j = JSON.parse(out);
        resolveP({ result: j.result ?? '', cost: j.total_cost_usd });
      } catch {
        reject(new Error('Không đọc được kết quả Claude: ' + out.slice(0, 200)));
      }
    });
    child.stdin.end(prompt);
    setTimeout(() => child.kill(), 240_000);
  });
}


async function runOllama(prompt) {
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
  const res = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({ model, prompt, stream: false, format: 'json', options: { num_ctx: 8192, temperature: 0 } }),
    signal: AbortSignal.timeout(20 * 60_000),
  });
  const j = await res.json();
  if (j.error) throw new Error('Ollama: ' + j.error);
  return { result: j.response ?? '', cost: 0, model };
}

/** Chọn nhà cung cấp theo tên ('ollama' hoặc mặc định Claude). */
export const ask = (prompt, provider = 'claude') => (provider === 'ollama' ? runOllama(prompt) : runClaude(prompt));
