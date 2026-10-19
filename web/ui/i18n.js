// Đa ngôn ngữ Việt / Anh theo kiểu "dịch tại chỗ": mã giao diện viết tiếng Việt (và một số nhãn tiếng Anh theo thiết kế); mỗi lần vẽ xong,
// các đoạn chữ và thuộc tính (placeholder, title, aria-label) được đối chiếu với từ điển ở i18n-en.js. Chữ nào chưa có trong từ điển giữ nguyên
// (không bao giờ làm hỏng giao diện). Nội dung do server sinh ra theo mẫu câu cố định (tên bước, dữ kiện) cũng được dịch bằng các mẫu regex.
import { EN_EXACT, EN_PATTERNS, VI_LABELS, VI_PATTERNS } from './i18n-en.js';

const KEY = 'lang';
let lang = 'vi';
try { lang = localStorage.getItem(KEY) === 'en' ? 'en' : 'vi'; } catch { /* chế độ riêng tư */ }
document.documentElement.lang = lang;

export const getLang = () => lang;
export const locale = () => (lang === 'en' ? 'en-GB' : 'vi-VN');
export function setLang(next) {
  lang = next === 'en' ? 'en' : 'vi';
  try { localStorage.setItem(KEY, lang); } catch { /* bỏ qua */ }
  document.documentElement.lang = lang;
}

// Câu do server sinh có thể chứa tên bước tiếng Việt lồng bên trong «…» → dịch nốt các cụm cố định đó.
const INNER = [[/Bấm «/g, 'Click «'], [/Chọn dữ liệu «/g, 'Select data «'], [/ \(dữ liệu có thể khác\)/g, ' (data may vary)'], [/Nhập «/g, 'Enter «'], [/ vào «/g, ' in «'], [/ ở «/g, ' in «'], [/Chuyển tới trang /g, 'Go to '], [/Mở ô chọn «/g, 'Open select «']];
const innerSteps = (s) => INNER.reduce((acc, [re, rep]) => acc.replace(re, rep), s);

function lookup(core) {
  if (lang === 'vi') {
    if (VI_LABELS[core] != null) return VI_LABELS[core];
    for (const [re, rep] of VI_PATTERNS) if (re.test(core)) return core.replace(re, rep);
    return null;
  }
  if (EN_EXACT[core] != null) return EN_EXACT[core];
  for (const [re, rep] of EN_PATTERNS) if (re.test(core)) return innerSteps(core.replace(re, rep));
  return null;
}
/** Dịch một chuỗi, giữ nguyên khoảng trắng đầu/cuối. Không có bản dịch thì trả lại nguyên chuỗi. */
export function tr(s) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  if (!m || !m[2]) return s;
  const out = lookup(m[2]);
  return out == null ? s : m[1] + out + m[3];
}

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA']);
/** Dịch mọi chữ + thuộc tính trong một nhánh DOM. */
export function translateTree(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) { const v = tr(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; return; }
  if (root.nodeType !== Node.ELEMENT_NODE || SKIP.has(root.tagName)) return;
  const attrs = (el) => { for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } } };
  attrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeType === 1 && SKIP.has(n.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } else attrs(n);
  }
}

/** Tự dịch mọi nội dung mới chèn vào trang (màn hình, hộp thoại, thông báo). */
export function watchTranslations(root = document.body) {
  translateTree(root);
  new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach((n) => translateTree(n)); }).observe(root, { childList: true, subtree: true });
}
