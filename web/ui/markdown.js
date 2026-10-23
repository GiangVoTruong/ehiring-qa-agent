// Markdown tối giản cho tài liệu knowledge: tiêu đề, danh sách, bảng, khối code, **đậm**, `code`. Escape trước nên không chèn được HTML.
import { esc } from './components.js';

export const FRONTMATTER = /^---\n[\s\S]*?\n---\n?/;

const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

/** stateDiagram-v2 của mermaid → bảng «Từ trạng thái / Sang / Khi nào» (không cần tải thư viện vẽ sơ đồ). Dòng lạ thì giữ nguyên chữ. */
function stateTable(lines) {
  const rows = [];
  for (const l of lines) {
    const t = l.match(/^\s*(\S+)\s*-->\s*(\S+)\s*(?::\s*(.*))?$/);
    if (t) rows.push(`<tr><td>${esc(t[1] === '[*]' ? 'Bắt đầu' : t[1])}</td><td>→</td><td><b>${esc(t[2] === '[*]' ? 'Kết thúc' : t[2])}</b></td><td>${inline(t[3] ?? '')}</td></tr>`);
    else if (l.trim() && !/^\s*stateDiagram/.test(l)) rows.push(`<tr><td colspan="4">${esc(l.trim())}</td></tr>`);
  }
  return `<p><b>Sơ đồ trạng thái</b> (đọc: từ trạng thái nào, chuyển sang đâu, khi nào)</p><table><tr><td><b>Từ</b></td><td></td><td><b>Sang</b></td><td><b>Khi</b></td></tr>${rows.join('')}</table>`;
}

export function mdToHtml(src) {
  const out = []; let list = null; let code = null; let table = null;
  const flush = () => {
    if (list) { out.push(`<${list.t}>${list.i.join('')}</${list.t}>`); list = null; }
    if (table) { out.push(`<table>${table.join('')}</table>`); table = null; }
  };
  for (const line of src.split('\n')) {
    if (line.startsWith('```')) { if (code) { out.push(/^\s*stateDiagram/.test(code[0] ?? '') ? stateTable(code) : `<pre>${esc(code.join('\n'))}</pre>`); code = null; } else { flush(); code = []; } continue; }
    if (code) { code.push(line); continue; }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) { flush(); const n = m[1].length + 1; out.push(`<h${n}>${inline(m[2])}</h${n}>`); }
    else if ((m = line.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)/))) { const t = m[1] ? 'ol' : 'ul'; if (!list || list.t !== t) { flush(); list = { t, i: [] }; } list.i.push(`<li>${inline(m[2])}</li>`); }
    else if (line.startsWith('|')) {
      if (/^\|[\s:|-]+\|?$/.test(line)) continue;
      if (!table) { flush(); table = []; }
      table.push(`<tr>${line.replace(/^\||\|$/g, '').split('|').map((c) => `<td>${inline(c.trim())}</td>`).join('')}</tr>`);
    } else if (!line.trim()) flush();
    else { flush(); out.push(`<p>${inline(line)}</p>`); }
  }
  flush();
  return out.join('');
}
