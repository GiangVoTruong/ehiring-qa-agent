// Hạ tầng dùng chung: trạng thái ứng dụng, điều hướng, thông báo, hộp thoại, menu thao tác, uỷ quyền sự kiện.
import { esc } from './components.js';
import { icon } from './icons.js';

export const state = { env: null, rec: { recording: false }, mock: false };
const handlers = new Map(); // data-act → fn(el, ev) của màn hình hiện tại
let cleanups = [];

/** Đăng ký xử lý cho các nút data-act của màn hình hiện tại (tự gỡ khi đổi màn hình). */
export const onAct = (map) => { for (const [k, fn] of Object.entries(map)) handlers.set(k, fn); };
/** Đăng ký hàm dọn (clearInterval…) chạy khi rời màn hình. */
export const onLeave = (fn) => cleanups.push(fn);
export function resetView() { cleanups.forEach((f) => { try { f(); } catch { /* bỏ qua */ } }); cleanups = []; handlers.clear(); closeMenu(); }

export const navigate = (hash) => { if (location.hash === '#' + hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };
export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, ''); const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] ?? 'overview', id: parts[1], query: new URLSearchParams(query) };
}

export function toast(msg, bad = false) {
  const box = document.getElementById('toasts'); if (!box) return;
  const el = document.createElement('div'); el.className = `toast ${bad ? 'bad' : ''}`; el.textContent = msg; box.append(el);
  setTimeout(() => el.remove(), bad ? 6000 : 3500);
}
export const fail = (e) => toast(String(e?.message ?? e), true);

/** Hộp thoại xác nhận/biểu mẫu. body = HTML; check = chữ của ô tích bắt buộc; trả về Promise<boolean> (và đọc giá trị ô nhập qua onOk). */
export function modal({ title, body = '', ok = 'Xác nhận', danger = false, check = '', onOk }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-h"><h2>${esc(title)}</h2></div><div class="modal-b">${body}${check ? `<label class="row small" style="gap:8px"><input type="checkbox" id="m-check"/> ${esc(check)}</label>` : ''}</div>
      <div class="modal-f"><button class="btn" data-m="no">Huỷ</button><button class="btn ${danger ? 'danger' : 'primary'}" data-m="ok" ${check ? 'disabled' : ''}>${esc(ok)}</button></div></div>`;
    const done = (v) => { ov.remove(); document.removeEventListener('keydown', esc_); resolve(v); };
    const esc_ = (e) => { if (e.key === 'Escape') done(false); };
    ov.addEventListener('click', async (e) => {
      if (e.target === ov || e.target.closest('[data-m=no]')) return done(false);
      if (e.target.closest('[data-m=ok]')) { try { if (onOk) await onOk(ov); done(true); } catch (err) { fail(err); } }
    });
    ov.querySelector('#m-check')?.addEventListener('change', (e) => { ov.querySelector('[data-m=ok]').disabled = !e.target.checked; });
    document.addEventListener('keydown', esc_); document.body.append(ov);
    ov.querySelector('input:not(#m-check),[data-m=ok]:not([disabled])')?.focus();
  });
}

// ---------- Menu thao tác (popover cố định, đóng khi bấm ra ngoài) ----------
let pop = null;
export function closeMenu() { pop?.remove(); pop = null; }
export function openMenu(anchor, items) {
  closeMenu();
  pop = document.createElement('div'); pop.className = 'menu-pop'; pop.style.position = 'fixed';
  pop.innerHTML = items.map((it, i) => `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${icon(it.icon, 14)}${esc(it.label)}</button>`).join('');
  document.body.append(pop);
  const r = anchor.getBoundingClientRect(); pop.style.top = `${Math.min(r.bottom + 4, innerHeight - pop.offsetHeight - 8)}px`; pop.style.left = `${Math.max(8, r.right - pop.offsetWidth)}px`;
  pop.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { const it = items[Number(b.dataset.i)]; closeMenu(); it.run(); } });
}

document.addEventListener('click', (e) => {
  if (pop && !pop.contains(e.target) && !e.target.closest('[data-act=menu]')) closeMenu();
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.dataset.act === 'open-flow' && e.target.closest('[data-stop]')) return; // bấm vào ô thao tác (ngoài các nút) không mở dòng
  const fn = handlers.get(el.dataset.act);
  if (fn) { if (!el.matches('input')) e.preventDefault(); fn(el, e); }
});
