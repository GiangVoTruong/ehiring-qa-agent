// Quay thao tác: tester tự thao tác trên Chrome thật, web ghi lại từng bước (bấm, nhập, chọn, tải file, chuyển trang)
// kèm các lời gọi API ghi dữ liệu (POST/PUT/PATCH/DELETE), thông báo và ảnh trạng thái form. Lưu recordings/<id>.json. Chỉ QUAN SÁT, không tự bấm gì.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AUTH_API } from './analysis.mjs';
import { makeLib } from './qa-lib.mjs';

// Chạy trong trang (addInitScript) — dùng window.__qaLib (web/qa-lib.mjs). Gửi sự kiện qua __qaRec.
export function injected() {
  const L = () => window.__qaLib;
  const onLogin = () => !!document.querySelector('input[type=password]');
  const send = (el, d) => { try { window.__qaRec({ t: Date.now(), url: location.pathname + location.search, ctx: L().ctxOf(el), ...(onLogin() ? { login: true } : {}), ...d }); } catch { /* chưa gắn */ } };
  // Màn hình đăng nhập: tài khoản tester nhập được gửi RIÊNG (không nằm trong bản quay, không gửi cho AI) để nhớ cho các lần sau.
  const sendCred = () => {
    const pw = document.querySelector('input[type=password]'); if (!pw || !pw.value) return;
    const scope = pw.form || document;
    const user = (scope.querySelector('#username') || [...scope.querySelectorAll('input:not([type=password]):not([type=hidden]):not([type=checkbox])')].find((i) => i.value))?.value;
    if (user) { try { window.__qaRec({ type: 'cred', t: Date.now(), username: user, password: pw.value }); } catch { /* chưa gắn */ } }
  };
  document.addEventListener('change', (ev) => { if (ev.target instanceof Element && ev.target.matches('input[type=password]')) sendCred(); }, true);
  document.addEventListener('click', (ev) => { if (ev.target instanceof Element && ev.target.closest('#kc-login, button[type=submit], input[type=submit]')) sendCred(); }, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target instanceof Element && ev.target.matches('input')) sendCred(); }, true);
  // Ảnh chụp trạng thái form ~0,7s SAU thao tác (đợi giao diện cập nhật) → so sánh trước/sau để thấy trường hiện ra, nút được mở…
  let snapTimer = 0;
  const snapSoon = () => { clearTimeout(snapTimer); snapTimer = setTimeout(() => send(document.body, { type: 'snap', snap: L().snapshot() }), 700); };
  document.addEventListener('click', (ev) => {
    const raw = ev.target; if (!(raw instanceof Element) || raw.matches('input[type=password]')) return;
    const { _el, ...d } = L().describeClick(raw);
    send(_el, { type: 'click', ...d });
    snapSoon();
  }, true);
  setTimeout(() => { try { L().observeToasts((t) => send(document.body, { type: 'toast', ...t })); snapSoon(); } catch { /* chưa có thư viện */ } }, 0);
  document.addEventListener('change', (ev) => {
    const el = ev.target; if (!(el instanceof Element) || !el.matches('input,textarea,select')) return;
    const type = el.type || el.tagName.toLowerCase();
    if (type === 'checkbox' || type === 'radio') return; // đã thấy qua click
    const d = L().describeInput(el);
    const secret = type === 'password' || /pass|mật khẩu|token|secret|otp|cvv|mã bảo mật/i.test(`${d.field} ${el.name || ''} ${el.id || ''} ${el.autocomplete || ''}`);
    const value = secret ? '***' : type === 'file' ? [...el.files].map((f) => f.name).join(', ') : el.value;
    send(el, { type: type === 'file' ? 'file' : 'input', value: L().short(value, 200), input: type, secret, ...d });
    snapSoon();
  }, true);
  const timers = new WeakMap();
  document.addEventListener('scroll', (ev) => {
    const t = ev.target; const el = t === document ? document.scrollingElement : t;
    if (!(el instanceof Element)) return;
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(() => send(el, { type: 'scroll', ...L().describeScroll(el) }), 400)); // chỉ ghi vị trí cuối sau khi ngừng cuộn
  }, true);
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== 'Escape') return;
    const el = ev.target instanceof Element ? ev.target : document.body;
    send(el, { type: 'key', key: ev.key, field: el.matches('input,textarea') ? L().fieldLabel(el) : '' });
  }, true);
}

/**
 * Bước đăng nhập (Keycloak) KHÔNG thuộc nghiệp vụ: đăng nhập là việc chuẩn bị trước khi chạy, nên không ghi vào luồng
 * và khi chạy lại luôn bỏ qua. Nhận diện theo cờ login lúc quay, hoặc theo dấu vết của trang đăng nhập (bản quay cũ chưa có cờ).
 */
export function isLoginStep(act = {}, url = '') {
  if (act.login) return true;
  if (LOGIN_URL.test(url)) return true;
  const field = (act.field ?? '').trim(), text = (act.text ?? '').trim();
  if (act.type === 'input' && /^(username or email|username|password|email or username)$/i.test(field)) return true;
  if (act.type === 'input' && (/^\d{4,8}$/.test(field) || /otp|mã xác (nhận|thực)|verification code|authenticator|2fa/i.test(field))) return true; // mã xác nhận (OTP)
  return act.type === 'click' && /^sign in( with .+)?$/i.test(text);
}
/** Đường dẫn của màn hình/bước chuyển hướng đăng nhập (Keycloak, SSO, callback). */
const LOGIN_URL = /\/realms\/|openid-connect|\/login-actions\/|\/bff-sso\/|\/auth\/(sso|callback)|^\/login(\/|$)/;
/**
 * Đánh dấu những mục thuộc CHUỖI đăng nhập: từ lúc vào trang đăng nhập (hoặc nhập tài khoản/mã xác nhận…) cho tới khi sang một trang
 * của ứng dụng. Mọi thao tác nằm giữa (kể cả bấm "Xác nhận" sau khi nhập mã) đều thuộc đăng nhập. Nhận mảng {type, url|path, field, text, login}.
 */
export function loginFlags(items) {
  let inLogin = false;
  return items.map((e) => {
    if (e.type === 'nav') { inLogin = LOGIN_URL.test(e.path ?? e.url ?? ''); return inLogin; }
    if (!['click', 'input', 'file', 'key', 'scroll'].includes(e.type)) return false;
    if (isLoginStep(e, e.url)) { inLogin = true; return true; }
    return inLogin;
  });
}
const ID24 = /[0-9a-f]{24}/g;
export const normPath = (p) => p.replace(ID24, ':id').replace(/\d{12,}/g, ':n');

/** Gom sự kiện thô thành các bước đọc được. */
const scrollText = (e, from) => `Cuộn ${e.cname || 'trang'} ${e.top >= from ? 'xuống' : 'lên'} tới ${e.top}px`;

export function buildSteps(events) {
  const out = [];
  const scrollPos = new Map();
  let lastSelect = '';
  const loginSeq = loginFlags(events); // đăng nhập không phải một phần của luồng: bỏ cả chuỗi (nhập tài khoản, mã xác nhận, bấm xác nhận…)
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const prev = out[out.length - 1];
    if (loginSeq[i]) continue;
    if (e.type === 'nav' && (e.path.startsWith('/auth/') || e.path === prev?.url || (e.path === '/' && out.length))) continue; // chuyển hướng đăng nhập/lặp
    if (e.type === 'click' && e.isTextInput && !/select|picker/.test(e.tag)) continue; // bấm vào ô nhập: ghi nhận khi nhập xong
    if (e.type === 'click' && !e.text && !e.field && !e.input && !e.role && /^(body|html)$/.test(e.tag)) continue; // bấm vào khoảng trống
    if (e.type === 'input' && prev?.kind === 'input' && prev.field === e.field) { prev.value = e.value; prev.t = e.t; continue; }
    if (e.type === 'scroll') {
      if (e.top === 0 && !prev) continue;
      if (prev?.kind === 'scroll' && prev.act.sel === e.sel) {
        if (e.top === prev.from) { out.pop(); scrollPos.set(e.sel, e.top); continue; } // cuộn đi rồi cuộn về chỗ cũ = không đổi gì
        prev.act.top = e.top; prev.text = scrollText(e, prev.from); prev.t = e.t; continue;
      }
      const from = scrollPos.get(e.sel) ?? 0;
      scrollPos.set(e.sel, e.top);
      out.push({ kind: 'scroll', t: e.t, url: e.url, from, text: scrollText(e, from), effects: [], act: { type: 'scroll', sel: e.sel, top: e.top, ctx: e.ctx } });
      continue;
    }
    if (e.type === 'snap' || e.type === 'toast' || e.type === 'note') {
      const host = prev ?? out[out.push({ kind: 'start', text: '(trước thao tác đầu)', effects: [] }) - 1];
      if (e.type === 'snap') host.after = e.snap;
      else if (e.type === 'toast') { host.toasts = host.toasts || []; if (!host.toasts.some((x) => x.text === e.text)) host.toasts.push({ kind: e.kind, text: e.text }); }
      else { host.notes = host.notes || []; host.notes.push(e.text); }
      continue;
    }
    if (e.type === 'api') {
      const fx = (prev ?? out[out.push({ kind: 'start', text: '(trước thao tác đầu)', effects: [] }) - 1]).effects;
      const line = `${e.method} ${e.path} → ${e.status}`;
      if (!fx.includes(line)) fx.push(line);
      continue;
    }
    // Enter ở ô nhập được bắn TRƯỚC sự kiện change → gộp vào bước nhập ngay sau nó.
    const nx = events[i + 1];
    if (e.type === 'key' && e.key === 'Enter' && nx?.type === 'input' && nx.field === e.field && nx.t - e.t < 800) { nx.enter = true; continue; }
    if (e.type === 'click') {
      // Bản quay cũ chưa có cờ dataChoice: suy từ đường dẫn phần tử (mục trong danh sách chọn).
      e.dataChoice ??= /nz-option|cdk-virtual-scroll|ant-select-item|rc-virtual-list/.test(e.sel || '');
      if (!e.dataChoice && (/nz-select|ant-select/.test(e.sel || '') || e.tag === 'nz-select')) lastSelect = e.field || e.text;
      else if (e.dataChoice) e.dataField ||= lastSelect;
    }
    const where = e.ctx ? ` (hộp «${e.ctx}»)` : '';
    let text;
    if (e.type === 'nav') text = `Chuyển tới trang ${e.path}`;
    else if (e.type === 'input') text = `Nhập «${e.value}» vào «${e.field || 'ô không nhãn'}»${where}${e.enter ? ', rồi nhấn Enter' : ''}`;
    else if (e.type === 'file') text = `Tải file «${e.value}» vào «${e.field || 'ô tải file'}»${where}`;
    else if (e.type === 'key') text = `Nhấn phím ${e.key}${e.field ? ` ở «${e.field}»` : ''}`;
    else if (e.input === 'checkbox' || e.input === 'radio') text = `Chọn/đổi «${e.text}»${where}`;
    else if (e.role === 'option' || e.tag === 'li') text = `Chọn «${e.text}»${where}`;
    else if (e.dataChoice) text = `Chọn dữ liệu «${e.text}»${e.dataField ? ` ở «${e.dataField}»` : ''}${where} (dữ liệu có thể khác)`;
    else if (e.menuToggle) text = `${e.siderCollapsed ? 'Mở rộng' : 'Thu gọn'} menu bên trái`;
    else if (e.menu && e.text) text = `Bấm menu «${e.text}»${e.menuGroup ? ` (trong nhóm «${e.menuGroup}»${e.siderCollapsed ? ', menu thu gọn: di chuột vào nhóm để hiện' : ''})` : ''}`;
    else if (e.role === 'tab') text = `Mở tab «${e.text}»`;
    else if (!e.text && e.field) text = `Mở ô chọn «${e.field}»${where}`;
    else text = `Bấm «${e.text || e.role || e.tag}»${where}`;
    if (prev && prev.text === text && e.t - prev.t < 800) continue; // sự kiện lặp
    const { type, tag, role, input, text: label, ctx, sel, nth, key, enter, path, dataChoice, dataField, menu, menuGroup, menuToggle, siderCollapsed, login } = e;
    out.push({ kind: e.type, t: e.t, url: e.url, field: e.field, value: e.value, text, effects: [], shot: e.shot, before: [...out].reverse().find((x) => x.after)?.after, act: { login, testid: e.testid, aria: e.aria, secret: e.secret, dataChoice, dataField, menu, menuGroup, menuToggle, siderCollapsed, type, tag, role, input, text: label, field: e.field, value: e.value, ctx, sel, nth, key, enter, path } });
  }
  return out;
}

/** Ghi chú cách vào trang bằng menu (từ .nav-map.json do web học) vào bước "Chuyển tới trang". */
function annotateNav(steps, root) {
  const f = join(root, '.nav-map.json');
  if (!existsSync(f)) return steps;
  const map = JSON.parse(readFileSync(f, 'utf8'));
  for (const s of steps) {
    if (s.kind !== 'nav' || / — vào bằng menu/.test(s.text)) continue;
    const path = (s.url || '').split('?')[0];
    const e = map.filter((x) => path === x.href || path.startsWith(x.href + '/')).sort((a, b) => b.href.length - a.href.length)[0];
    if (e) s.text += ` — vào bằng menu${e.group ? ` «${e.group}»` : ''} → «${e.text}»${path === e.href ? '' : ' rồi mở dòng cần xem'}`;
  }
  return steps;
}

export function createRecorder({ ROOT, BASE_URL, ALLOWED_HOST, CRED_FILE, USER_STATE, USER_SESSION }) {
  const DIR = join(ROOT, 'recordings');
  const SHOTS = join(ROOT, 'data', 'shots');
  let lastId = ''; // id bản quay vừa kết thúc (để giao diện mở lại khi tester tự đóng cửa sổ Chrome)
  let live = null; // { id, name, browser, events, startedAt, paused, activeMs, resumedAt, shotN, pending }

  const activeSec = (r) => Math.round((r.activeMs + (r.paused ? 0 : Date.now() - r.resumedAt)) / 1000);

  async function finish() {
    const r = live; if (!r) return null;
    live = null; lastId = r.id;
    const durationSec = activeSec(r);
    await Promise.allSettled(r.pending);
    await r.browser.close().catch(() => undefined);
    const steps = annotateNav(buildSteps(r.events), ROOT);
    const apis = [...new Set(r.events.filter((e) => e.type === 'api').map((e) => `${e.method} ${e.path}`))];
    const rec = { id: r.id, name: r.name, startedAt: new Date(r.startedAt).toISOString(), durationSec, steps, apis };
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, `${r.id}.json`), JSON.stringify({ ...rec, events: r.events }, null, 1));
    return rec;
  }

  /** Chụp màn hình làm bằng chứng (ảnh JPEG nhỏ). Không chặn thao tác của tester; tối đa 1 ảnh / 0,6s. */
  function shoot(r, page, e) {
    if (!['click', 'input', 'file', 'nav'].includes(e.type) || Date.now() - (r.lastShot ?? 0) < 600) return;
    r.lastShot = Date.now();
    const name = `${++r.shotN}.jpg`;
    e.shot = name;
    r.pending.push(page.screenshot({ type: 'jpeg', quality: 45 }).then((buf) => { mkdirSync(join(SHOTS, r.id), { recursive: true }); writeFileSync(join(SHOTS, r.id, name), buf); }).catch(() => undefined));
  }

  /** Sau khi tester đăng nhập thành công: nhớ tài khoản + phiên (để quay/chạy lại không phải nhập lại và không dùng tài khoản có sẵn). */
  async function rememberLogin(r, context, page) {
    r.credSaving = true;
    try {
      for (let i = 0; ; i++) {
        if (await page.evaluate(() => !!sessionStorage.getItem('0-ehiring')).catch(() => false)) break;
        if (i >= 40) throw new Error('chưa đăng nhập xong');
        await new Promise((res) => setTimeout(res, 500));
      }
      mkdirSync(dirname(CRED_FILE), { recursive: true });
      writeFileSync(CRED_FILE, JSON.stringify({ username: r.cred.username, password: r.cred.password, savedAt: new Date().toISOString(), host: new URL(BASE_URL).host }, null, 1));
      await context.storageState({ path: USER_STATE });
      writeFileSync(USER_SESSION, await page.evaluate(() => JSON.stringify(sessionStorage)));
      r.credSaved = true; r.credUser = r.cred.username;
    } catch { r.credSaving = false; }
  }

  async function start({ name, url, relogin }) {
    if (live) throw new Error('Đang quay một luồng — bấm Dừng trước.');
    const target = new URL(url || BASE_URL);
    if (target.protocol !== 'https:' || !ALLOWED_HOST.test(target.hostname)) throw new Error('Chỉ quay trên https://*.stg.talentx.vn (hoặc *.stg.ehiring.com.vn)');
    const id = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${(name || 'luong').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'luong'}`;
    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--start-maximized', ...(process.env.QA_REC_CDP ? [`--remote-debugging-port=${process.env.QA_REC_CDP}`] : [])] });
    // Chưa nhớ tài khoản nào (hoặc tester chọn đăng nhập lại) → mở trình duyệt SẠCH để hiện màn hình đăng nhập; không dùng phiên của tài khoản có sẵn.
    const useSaved = existsSync(CRED_FILE) && !relogin;
    const context = await browser.newContext({ viewport: null, ignoreHTTPSErrors: true, ...(useSaved && existsSync(USER_STATE) ? { storageState: USER_STATE } : {}) });
    const session = useSaved && existsSync(USER_SESSION) ? readFileSync(USER_SESSION, 'utf8') : '{}';
    await context.addInitScript(({ session, host }) => {
      if (location.host !== host) return;
      localStorage.setItem('locale', 'en');
      if (!sessionStorage.length) for (const [k, v] of Object.entries(JSON.parse(session))) sessionStorage.setItem(k, v);
    }, { session, host: new URL(BASE_URL).host });
    const r = { id, name: name?.trim() || 'Luồng ghi lại', browser, events: [], startedAt: Date.now(), paused: false, activeMs: 0, resumedAt: Date.now(), shotN: 0, pending: [] };
    live = r;
    browser.on('disconnected', () => { if (live === r) finish().catch(() => undefined); }); // tester tự đóng cửa sổ = dừng quay
    await context.exposeBinding('__qaRec', (source, e) => {
      if (e.type === 'cred') { r.cred = { username: String(e.username), password: String(e.password) }; return; } // không bao giờ vào bản quay
      if (r.paused) return;
      shoot(r, source.page, e);
      if (!r.events.length || r.events[r.events.length - 1].t <= e.t) r.events.push(e);
    });
    await context.addInitScript({ content: `window.__qaLib = (${makeLib})();` });
    await context.addInitScript(injected);
    const hook = (page) => {
      page.on('framenavigated', (f) => {
        if (r.paused || f !== page.mainFrame()) return;
        const u = new URL(f.url());
        if (!ALLOWED_HOST.test(u.hostname)) return;
        if (r.cred && !r.credSaving && !r.credSaved) rememberLogin(r, context, page);
        const e = { t: Date.now(), type: 'nav', path: normPath(u.pathname), url: u.pathname };
        setTimeout(() => shoot(r, page, e), 1200); // chờ trang vẽ xong rồi mới chụp
        r.events.push(e);
      });
      page.on('response', (res) => {
        const q = res.request();
        if (r.paused || !res.url().includes('/api/') || ['GET', 'OPTIONS', 'HEAD'].includes(q.method()) || /monitoring\/traces/.test(res.url())) return;
        const apiPath = normPath(new URL(res.url()).pathname.replace(/^\/api/, ''));
        if (AUTH_API.test(apiPath)) return; // API đăng nhập không thuộc luồng
        r.events.push({ t: Date.now(), type: 'api', method: q.method(), path: apiPath, status: res.status() });
      });
    };
    context.on('page', hook);
    const page = await context.newPage();
    hook(page);
    await page.goto(target.href, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    return { id, name: r.name };
  }

  const pause = () => { if (live && !live.paused) { live.activeMs += Date.now() - live.resumedAt; live.paused = true; } return status(); };
  const resume = () => { if (live && live.paused) { live.paused = false; live.resumedAt = Date.now(); } return status(); };
  const addNote = (text) => {
    if (!live || !String(text ?? '').trim()) throw new Error('Không có bản ghi đang quay hoặc ghi chú trống');
    live.events.push({ t: Date.now(), type: 'note', text: String(text).trim().slice(0, 500) });
    return status();
  };
  function status() {
    if (!live) return { recording: false, lastId };
    const all = buildSteps(live.events).filter((x) => x.act);
    return {
      recording: true, paused: live.paused, id: live.id, name: live.name, credSaved: !!live.credSaved, credUser: live.credUser ?? '', sec: activeSec(live), startedAt: live.startedAt, count: all.length, steps: all.slice(-300),
      allSteps: all,
      notes: live.events.filter((e) => e.type === 'note').map((e) => e.text), apis: [...new Set(live.events.filter((e) => e.type === 'api').map((e) => `${e.method} ${e.path}`))],
    };
  }
  const stop = async () => (live ? finish() : null);
  const get = (id) => {
    if (!/^[\w-]+$/.test(id ?? '') || !existsSync(join(DIR, `${id}.json`))) throw new Error('Không có bản ghi');
    const { events, ...rec } = JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8'));
    // Dựng lại bước bằng bộ gom mới nhất (bản quay cũ vẫn được hưởng cải tiến); cùng thứ tự với bộ chạy lại.
    return { ...rec, steps: annotateNav(buildSteps(events).filter((s) => s.act), ROOT), notes: events.filter((e) => e.type === 'note').map((e) => e.text) };
  };

  return { start, stop, pause, resume, addNote, status, get };
}
