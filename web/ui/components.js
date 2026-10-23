// Các thành phần giao diện: mỗi hàm nhận dữ liệu và trả về chuỗi HTML (không giữ state). Tương tác dùng data-act + uỷ quyền sự kiện ở main.js.
import { getLang, locale } from './i18n.js';
import { icon } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clock = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600); const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0'); const s = String(sec % 60).padStart(2, '0'); return h ? `${h}:${m}:${s}` : `${m}:${s}`; };
export const dur = (ms) => (ms == null ? '—' : ms < 1000 ? `${Math.round(ms)}ms` : clock(ms / 1000));
export function ago(iso) {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'vừa xong'; if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60); if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24); return d < 30 ? `${d} ngày trước` : new Date(iso).toLocaleDateString(locale());
}
export const dt = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { hour12: false }) : '—');

// ---------- Badge ----------
const BADGE = { Passed: 'ok', Failed: 'bad', Blocked: 'warn', 'Needs review': 'warn', Skipped: '', Running: 'info', Observed: 'info', Inferred: 'accent', 'Needs verification': 'warn', Confirmed: 'ok', draft: '', confirmed: 'ok', Ready: 'ok', Unknown: '' };
const BADGE_ICON = { Passed: 'circleCheck', Failed: 'circleX', Blocked: 'alert', 'Needs review': 'circleAlert', Confirmed: 'circleCheck' };
const BADGE_TEXT = { draft: 'Draft', confirmed: 'Confirmed' };
const CERT = { Observed: ['observed', 'Observed'], Inferred: ['inferred', 'Inferred'], 'Needs verification': ['verify', 'Needs verification'], Confirmed: ['confirmed', 'Confirmed'] };
/** Độ chắc chắn của kiến thức: nét liền = đã thấy, nét đứt = suy luận, nét chấm = chưa chắc, dấu tích = đã xác nhận. */
export const cert = (status, text) => { const [k, label] = CERT[status] ?? ['verify', status]; return `<span class="cert ${k}" title="${esc(label)}"><i></i>${esc(text ?? label)}</span>`; };
export const certClass = (status) => CERT[status]?.[0] ?? 'verify';
export const meta = (...parts) => `<div class="meta">${parts.filter((x) => x != null && x !== '').map((x) => `<span>${x}</span>`).join('')}</div>`;
export const badge = (status, text) => CERT[status] ? cert(status, text) : `<span class="badge ${BADGE[status] ?? ''}">${BADGE_ICON[status] ? icon(BADGE_ICON[status], 12) : ''}${esc(text ?? BADGE_TEXT[status] ?? status)}</span>`;

// ---------- Khung: sidebar + topbar ----------
const NAV = [['overview', 'Overview', 'overview'], ['record', 'Record & Learn', 'record'], ['flows', 'Test Flows', 'flows']];
export function AppSidebar({ active, env, rec, badges = {} }) {
  const st = rec?.recording ? (rec.paused ? ['pause', 'Đang tạm dừng quay'] : ['rec', 'Đang quay']) : ['on', 'Browser sẵn sàng'];
  return `<aside class="sidebar"><div class="brand"><div class="logo"></div><span>AI Testing Agent</span></div>
    <nav class="nav">${NAV.map(([id, label, ic]) => `<a href="#/${id === 'overview' ? '' : id}" class="${active === id ? 'active' : ''}">${icon(ic, 17)}<span>${label}</span>${badges[id] ? `<em class="count">${badges[id]}</em>` : ''}</a>`).join('')}
      </nav>
    <div class="side-foot"><div class="env" title="${esc(env?.baseUrl ?? '')}"><b>Staging</b><span class="mono">${esc(env?.host ?? '…')}</span></div>
      <div class="row"><span class="dot ${st[0]}"></span><span class="lbl">${st[1]}</span></div></div></aside>`;
}
export function AppTopbar({ crumbs, env, rec, mock }) {
  const last = crumbs.length - 1;
  return `${mock ? '<div class="banner">Đang xem DỮ LIỆU MẪU (?mock=1) — không phải kết quả thật.</div>' : ''}
    <header class="topbar"><div class="crumbs">${crumbs.map((c, i) => (i === last ? `<b>${esc(c.label)}</b>` : `<a href="${c.href}">${esc(c.label)}</a>${icon('chevronRight', 12)}`)).join('')}</div>
      <label class="search">${icon('search', 15)}<input id="gsearch" placeholder="Tìm test flow…" autocomplete="off"/></label>
      <span class="seg" role="group" aria-label="Ngôn ngữ"><button data-lang="vi" class="${getLang() === 'vi' ? 'active' : ''}" title="Tiếng Việt">VI</button><button data-lang="en" class="${getLang() === 'en' ? 'active' : ''}" title="English">EN</button></span>
      <button class="btn icon theme-btn" data-theme-toggle title="Đổi giao diện sáng / tối" aria-label="Đổi giao diện sáng hoặc tối">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 16)}</button></header>`;
}

// ---------- Recording ----------
const EV = { nav: ['Navigate', 'globe', 'nav'], click: ['Click', 'click', ''], select: ['Select', 'select', 'sel'], input: ['Fill', 'keyboard', 'inp'], file: ['Upload', 'upload', 'inp'], key: ['Press', 'enter', ''], scroll: ['Scroll', 'scroll', ''] };
export function describeStep(s) {
  const a = s.act ?? {};
  const kind = a.type === 'click' && a.dataChoice ? 'select' : a.type;
  const [label, ic, cls] = EV[kind] ?? ['Action', 'click', ''];
  let what = '', value = '';
  if (kind === 'nav') what = s.url ?? a.path ?? '';
  else if (kind === 'select') { what = a.dataField || 'Danh sách chọn'; value = a.text; }
  else if (kind === 'click') what = a.text || a.field || a.tag || '';
  else if (kind === 'input' || kind === 'file') { what = a.field || 'Ô không nhãn'; value = a.secret ? '••••••' : a.value; }
  else if (kind === 'key') what = a.key;
  else what = s.text;
  return { label, ic, cls, what, value };
}
export function RecordedActionItem(s, i, startedAt, open, fresh = false) {
  const d = describeStep(s); const a = s.act ?? {}; const t0 = typeof startedAt === 'number' ? startedAt : new Date(startedAt ?? NaN).getTime(); const rel = s.t && Number.isFinite(t0) ? (s.t - t0) / 1000 : null;
  const loc = [a.testid && `data-testid="${a.testid}"`, a.aria && `aria-label="${a.aria}"`, a.text && `text="${a.text}"${a.nth ? ` #${a.nth + 1}` : ''}`, a.field && `field="${a.field}"`, a.sel && `css: ${a.sel}`].filter(Boolean);
  const api = (s.effects ?? []).filter((e) => !/dashboard/.test(e));
  return `<li class="ev ${fresh ? 'new' : ''}"><button class="ev-h" data-act="toggle-ev" data-i="${i}" aria-expanded="${open}"><span class="no">${i + 1}</span><span class="ico ${d.cls}">${icon(d.ic, 14)}</span>
      <span class="t">${d.label}</span><span class="what"><span>${esc(d.what)}</span>${d.value ? `<span class="badge" title="Giá trị đã chọn/nhập">${esc(d.value)}</span>` : ''}</span>
      <span class="end">${api.length ? '<span class="badge info">API</span>' : ''}${s.toasts?.length ? '<span class="badge ok">toast</span>' : ''}${rel != null ? `<span>${clock(rel)}</span>` : ''}${icon(open ? 'chevronDown' : 'chevronRight', 14)}</span></button>
    ${open ? `<div class="ev-d"><div><span class="lbl">URL</span><span class="mono">${esc(s.url ?? '')}</span></div>${loc.length ? `<div><span class="lbl">Locator</span><span class="mono">${loc.map(esc).join('   ')}</span></div>` : ''}
      ${(s.effects ?? []).map((e) => `<div><span class="lbl">Hệ thống</span><span class="mono">${esc(e)}</span></div>`).join('')}${(s.toasts ?? []).map((t) => `<div><span class="lbl">Thông báo</span>${badge(t.kind === 'error' ? 'Failed' : 'Passed', t.kind)} ${esc(t.text)}</div>`).join('')}
      ${(s.notes ?? []).map((n) => `<div><span class="lbl">Ghi chú</span>${esc(n)}</div>`).join('')}</div>` : ''}</li>`;
}
export function RecordingTimeline(steps, { startedAt, open = new Set(), empty = 'Hãy thao tác trên cửa sổ Chrome vừa mở. Mỗi thao tác sẽ hiện ở đây ngay khi bạn làm.' } = {}) {
  return steps.length ? `<ol class="tl" id="tl">${steps.map((s, i) => RecordedActionItem(s, i, startedAt, open.has(i))).join('')}</ol>`
    : `<div class="empty">${icon('record', 28)}<h3>Chưa có thao tác</h3><div class="small">${esc(empty)}</div></div>`;
}
export function AILiveInsights(ins, { live = true } = {}) {
  const grp = (status, title, sub, items) => `<section class="ins"><h3>${cert(status, title)}<span class="sub">${sub}</span></h3>
    ${items.length ? `<ul>${items.map((x) => `<li class="edge ${certClass(status)}">${esc(x.text)}${x.evidence?.length ? `<span class="ref">bước ${x.evidence.map((e) => e + 1).join(', ')}</span>` : ''}</li>`).join('')}</ul>` : `<div class="mute small" style="margin-bottom:8px">${live ? 'Chưa có, sẽ cập nhật khi bạn thao tác.' : 'Không có.'}</div>`}</section>`;
  return `<div class="rail"><h2>Live Insights</h2><div class="small mute" style="margin-bottom:6px">Máy quan sát trong lúc quay nên không làm chậm thao tác của bạn.</div>
    ${grp('Observed', 'Observed', 'dữ kiện đã quan sát', ins?.observed ?? [])}${grp('Inferred', 'Possible Rules', 'gợi ý suy ra từ dữ kiện, chưa phải quy tắc', ins?.possible ?? [])}${grp('Needs verification', 'Needs Verification', 'điểm chưa rõ', ins?.verify ?? [])}
    <div class="small mute" style="padding-top:8px">Sau khi dừng quay, bấm “Xem phân tích” để xem các bước, quy tắc và test case.</div></div>`;
}
/** stages: [{label, state:'pending'|'running'|'done'|'error'}] — trạng thái phản ánh việc backend thực sự đã xong, không giả lập. */
export function AnalysisProgress(stages) {
  return `<div class="steps-prog">${stages.map((s) => `<div class="sp-i ${s.state === 'running' ? 'run' : s.state === 'done' ? 'done' : ''}"><span class="mk">${s.state === 'done' ? icon('check', 12) : s.state === 'running' ? '<span class="spin"></span>' : s.state === 'error' ? icon('x', 12) : ''}</span><span>${esc(s.label)}</span></div>`).join('')}</div>`;
}

// ---------- Phân tích ----------
export function BusinessFlowStepper(biz, steps, { machine = false } = {}) {
  if (!biz?.length) return `<div class="empty">${icon('sparkles', 28)}<h3>Chưa có bước nghiệp vụ</h3><div class="small">Chưa gom được thao tác nào thành bước.</div></div>`;
  return `${machine ? '<div class="card-b small mute" style="padding-bottom:0">Gom theo trang và theo lần lưu dữ liệu bằng quy tắc của máy.</div>' : ''}<ol class="stepper">${biz.map((b) => `<li><details><summary>${esc(b.title)}<span class="badge">${b.stepIndices.length} thao tác</span></summary><div class="sub">${b.description ? `<div class="mute">${esc(b.description)}</div>` : ''}${b.stepIndices.map((i) => `<div class="small">${i + 1}. ${esc(steps[i]?.text ?? '')}</div>`).join('')}</div></details></li>`).join('')}</ol>`;
}
const KIND = { dependency: 'Field dependency', 'field-appears': 'Conditional UI', 'field-disappears': 'Conditional UI', 'button-state': 'Conditional UI', 'field-state': 'Conditional UI', required: 'Required field', 'required-marker': 'Required field', 'default-value': 'Default value', 'validation-error': 'Validation', 'write-api': 'Workflow', toast: 'Workflow', state: 'Workflow', 'business-rule': 'Workflow' };
export const kindLabel = (k) => KIND[k] ?? 'Rule';
export function RuleCard(r, { editable = false } = {}) {
  return `<div class="rule"><div class="edge ${certClass(r.status)}"><div class="row wrap">${cert(r.status)}<span class="badge">${kindLabel(r.kind)}</span><span class="mute small">${r.source === 'ai' ? 'AI suy luận' : 'Máy quan sát'}</span>${r.flow ? `<span class="mute small">${esc(r.flow)}</span>` : ''}</div>
    <p style="margin:6px 0 0">${esc(r.statement)}</p></div><div class="row wrap small mute"><span>Bằng chứng: ${r.evidence?.length ? r.evidence.map((e) => `<a href="#evidence" data-act="goto-evidence" data-i="${e}">bước ${e + 1}</a>`).join(', ') : 'chưa có'}</span>
    ${editable && r.id ? `<span class="sp row"><button class="btn sm" data-act="rule" data-id="${r.id}" data-st="Confirmed">${icon('check', 13)}Xác nhận</button><button class="btn sm" data-act="rule" data-id="${r.id}" data-st="Needs verification">Cần kiểm tra</button></span>` : ''}</div></div>`;
}
function variantText(c, stepCount) {
  const v = c.variant ?? {};
  const data = v.omit ? `Bỏ trống bước ${v.omit.map((i) => i + 1).join(', ')}` : v.values ? 'Chọn dữ liệu khác (mục đầu tiên)' : 'Dữ liệu như bản quay';
  return { data, steps: v.omit ? `Phát lại ${stepCount} bước, bỏ ${v.omit.length} bước` : `Phát lại ${stepCount} bước đã quay` };
}
export function TestCaseTable(cases, { selectable = false, selected = new Set(), stepCount = 0 } = {}) {
  if (!cases.length) return `<div class="empty">${icon('flask', 28)}<h3>Chưa có test case</h3></div>`;
  return `<table class="tbl"><thead><tr>${selectable ? '<th></th>' : ''}<th>Test case</th><th>Điều kiện</th><th>Dữ liệu test</th><th>Các bước</th><th>Expected result</th><th>Mức sẵn sàng</th>${selectable ? '' : '<th></th>'}</tr></thead><tbody>
    ${cases.map((c, i) => { const t = variantText(c, stepCount); const ready = c.executable; return `<tr>${selectable ? `<td><input type="checkbox" data-act="pick-case" data-i="${i}" ${selected.has(i) ? 'checked' : ''}/></td>` : ''}
      <td><b style="color:var(--ink)">${esc(c.title)}</b><div class="small mute">${esc(c.kind)}</div></td><td class="small">${c.requiresPermission || c.requires_permission ? 'Cho phép chạy trên môi trường test' : '—'}</td><td class="small">${esc(t.data)}</td><td class="small">${esc(t.steps)}</td>
      <td class="small">${esc(c.expected || '—')}${c.note ? `<div class="mute">${esc(c.note)}</div>` : ''}</td><td>${ready ? badge('Ready') : badge('Needs review')}</td>${selectable ? '' : `<td>${ready && c.id ? `<button class="btn sm" data-act="run-case" data-id="${c.id}">${icon('play', 12)}Chạy</button>` : ''}</td>`}</tr>`; }).join('')}</tbody></table>`;
}
export function EvidenceViewer(items, recId) {
  const withShot = items.filter((x) => x.shot);
  if (!items.length) return `<div class="empty">${icon('image', 28)}<h3>Chưa có bằng chứng</h3></div>`;
  return `<div class="ev-gal">${items.map((x, i) => `<figure id="evi-${i}">${x.shot ? `<a href="/shots/${esc(recId)}/${esc(String(x.shot).replace('.jpg', ''))}.jpg" target="_blank"><img loading="lazy" src="/shots/${esc(recId)}/${esc(String(x.shot).replace('.jpg', ''))}.jpg" alt="Ảnh bước ${i + 1}"/></a>` : `<div class="noimg">${icon('image', 24)}</div>`}
    <figcaption><b style="color:var(--ink)">Bước ${i + 1}</b><span>${esc(x.text)}</span><span class="mono mute">${esc(x.url ?? '')}</span>${(x.effects ?? []).map((e) => `<span class="mono">${esc(e)}</span>`).join('')}</figcaption></figure>`).join('')}</div>${withShot.length ? '' : '<div class="card-b small mute">Bản quay này không có ảnh chụp (ảnh chỉ được lưu từ phiên bản mới).</div>'}`;
}

// ---------- Thư viện flow ----------
export const passRate = (f) => (f.finished ? Math.round((f.passed / f.finished) * 100) : null);
const PassBar = (f) => { const r = passRate(f); return r == null ? '<span class="mute">—</span>' : `<span class="bar-pass"><i style="width:${r}%"></i></span> <span class="small">${r}%</span>`; };
export function FlowMenu(id) {
  return `<span class="menu"><button class="btn icon" data-act="menu" data-id="${id}" aria-label="Thao tác">${icon('more', 16)}</button></span>`;
}
export function TestFlowTable(rows) {
  if (!rows.length) return `<div class="card"><div class="empty">${icon('flows', 30)}<h3>Chưa có test flow</h3><div class="small">Quay một luồng ở “Record & Learn” rồi lưu thành Test Flow.</div></div></div>`;
  return `<div class="card"><table class="tbl"><thead><tr><th>Flow name</th><th>Module</th><th>Steps</th><th>Last run</th><th>Pass rate</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map((f) => `<tr class="click" data-act="open-flow" data-id="${f.id}"><td><b style="color:var(--ink)">${esc(f.name)}</b>${f.proposals ? ' <span class="badge warn">đề xuất cập nhật</span>' : ''}${meta(`v${f.current_version}`, f.unverified ? `${f.unverified} quy tắc chưa xác minh` : '')}</td><td>${esc(f.module || '—')}</td><td>${f.step_count ?? '—'}</td>
      <td>${f.last_status ? `${badge(f.last_status)} <span class="small mute">${ago(f.last_run_at)}</span>` : '<span class="mute">chưa chạy</span>'}</td><td>${PassBar(f)}</td><td>${badge(f.status)}</td>
      <td class="nowrap" data-stop><button class="btn sm" data-act="replay" data-id="${f.id}">${icon('play', 12)}Replay</button> ${FlowMenu(f.id)}</td></tr>`).join('')}</tbody></table></div>`;
}
export function TestFlowCards(rows) {
  if (!rows.length) return TestFlowTable(rows);
  return `<div class="cards">${rows.map((f) => `<div class="card fcard" data-act="open-flow" data-id="${f.id}"><div class="row"><b style="color:var(--ink)" class="grow">${esc(f.name)}</b>${badge(f.status)}</div>
    ${meta(esc(f.module || '—'), `${f.step_count ?? '—'} steps`, `v${f.current_version}`)}<div class="row">${f.last_status ? badge(f.last_status) : '<span class="mute small">chưa chạy</span>'}<span class="sp">${PassBar(f)}</span></div>
    <div class="row" data-stop><button class="btn sm" data-act="replay" data-id="${f.id}">${icon('play', 12)}Replay</button><span class="sp">${FlowMenu(f.id)}</span></div></div>`).join('')}</div>`;
}

// ---------- Báo cáo lượt chạy ----------
const CLASS = { automation: ['Automation error', 'bad'], business: ['Business error — kết quả khác kỳ vọng', 'bad'], policy: ['Bị chặn bởi chính sách an toàn', 'warn'], environment: ['Environment error', 'warn'] };
export const classBadge = (c) => (c ? `<span class="badge ${CLASS[c]?.[1] ?? ''}">${esc(CLASS[c]?.[0] ?? c)}</span>` : '');
export function TestRunReport(run) {
  const s = run.summary ?? {}; const running = run.status === 'Running';
  const total = run.steps.length; const done = run.steps.filter((x) => x.status !== 'Running').length;
  const failed = run.steps.filter((x) => x.status === 'Failed');
  const ic = { Passed: 'circleCheck', Failed: 'circleX', Blocked: 'alert', 'Needs review': 'circleAlert', Skipped: 'info', Running: 'info' };
  return `<div class="card"><div class="card-b"><div class="row wrap"><h2>${esc(run.flow_name ?? 'Test run')}</h2>${badge(run.status)}<span class="meta"><span>v${run.version}</span><span>${dt(run.started_at)}</span>${run.finished_at ? `<span>${dur(new Date(run.finished_at) - new Date(run.started_at))}</span>` : ''}</span>
      ${running ? `<span class="row small mute"><span class="spin"></span>đang chạy — ${done}/${total || '…'} bước</span><button class="btn sm danger sp" data-act="stop-run" data-id="${esc(run.id)}">${icon('stop', 12)}Dừng chạy</button>` : ''}</div>
    ${s.counts ? `<div class="row wrap" style="margin-top:10px">${Object.entries(s.counts).map(([k, v]) => `${badge(k)}<b>${v}</b>`).join('<span style="width:8px"></span>')}</div>` : ''}</div></div>
    ${failed.map((x) => `<div class="callout bad" style="margin-top:12px">${icon('circleX', 18)}<div><b>${esc(x.title)}</b><div>${x.classification ? classBadge(x.classification) : '<span class="badge">Unknown — Needs investigation</span>'} ${esc(x.error ?? '')}</div></div></div>`).join('')}
    ${s.proposedVersion ? `<div class="callout info" style="margin-top:12px">${icon('info', 18)}<div>Giao diện đã đổi nhưng flow vẫn chạy được: hệ thống đề xuất <b>phiên bản v${s.proposedVersion}</b> (chưa ghi đè). Xem ở trang chi tiết flow.</div></div>` : ''}
    ${s.ruleChange ? `<div class="callout ok" style="margin-top:12px">${icon('circleCheck', 18)}<div>Quy tắc bắt buộc được cập nhật: ${badge(s.ruleChange.from)} → ${badge(s.ruleChange.to)}</div></div>` : ''}
    <div class="card" style="margin-top:12px"><div class="card-h"><h3>Các bước</h3></div>${run.steps.length ? `<ul class="run-steps">${run.steps.map((x) => `<li class="${x.status.replace(' ', '-')}"><span class="mk">${icon(ic[x.status] ?? 'info', 18)}</span><div><div style="color:var(--ink)">${esc(x.title)}</div>
      ${x.error ? `<div class="${x.status === 'Failed' ? 'err' : 'small mute'}">${x.classification ? classBadge(x.classification) + ' ' : ''}${esc(x.error)}</div>` : ''}${x.evidence?.chosen ? `<div class="small mute">Đã chọn: ${esc(x.evidence.chosen)}</div>` : ''}${x.evidence?.filled ? `<div class="small mute">Tự điền: «${esc(x.evidence.filled.to)}» (đã quay: «${esc(x.evidence.filled.from)}»)</div>` : ''}${x.evidence?.how ? `<div class="small mute">Tìm phần tử bằng: ${esc(x.evidence.how)}</div>` : ''}${x.evidence?.note ? `<div class="small mute">${esc(x.evidence.note)}</div>` : ''}${x.evidence?.candidates?.length ? `<div class="small">Gần giống đang có trên trang: ${x.evidence.candidates.map((c) => `<span class="badge">${esc(c)}</span>`).join(' ')}</div>` : ''}</div>
      <div class="row">${x.evidence?.shot ? `<a href="/runshots/${esc(run.id)}/${x.idx}.jpg" target="_blank"><img loading="lazy" src="/runshots/${esc(run.id)}/${x.idx}.jpg" alt="Ảnh bước"/></a>` : ''}<span class="mute small mono">${dur(x.duration_ms)}</span></div></li>`).join('')}</ul>`
      : `<div class="empty"><span class="spin"></span><div class="small" style="margin-top:8px">Đang mở trình duyệt…</div></div>`}</div>
    ${(s.limits ?? []).map((l) => `<div class="callout warn" style="margin-top:12px">${icon('alert', 18)}<div>${esc(l)}</div></div>`).join('')}`;
}

/** Dải vạch: mỗi thao tác là một vạch trên trục thời gian; vạch cao màu cam = API ghi dữ liệu, vạch trắng = ghi chú. */
export function stripHtml(steps, startedAt, fresh = 0) {
  const span = Math.max(180000, (Date.now() - startedAt) * 1.05);
  return steps.map((s, i) => {
    const a = s.act ?? {}; const left = Math.min(99.5, Math.max(0, ((s.t - startedAt) / span) * 100));
    const cls = (s.effects ?? []).some((e) => !/dashboard/.test(e)) ? 'api' : s.notes?.length ? 'note' : a.type === 'nav' ? 'nav' : a.dataChoice ? 'sel' : a.type === 'input' || a.type === 'file' ? 'inp' : '';
    return `<i class="${cls} ${i >= steps.length - fresh ? 'fresh' : ''}" style="left:${left}%" title="${esc(s.text)}"></i>`;
  }).join('');
}
/** Bảng điều khiển quay: cùng một máy ghi tối cho cả lúc chờ và lúc đang quay (điểm nhấn duy nhất của trang). */
export function RecordingControlPanel({ mode, st, env }) {
  if (mode === 'ready' || mode === 'review') {
    const how = [['Đặt tên và mở Chrome', 'Nhập tên luồng, bấm Bắt đầu quay. Chrome mở ở trang đăng nhập.'], ['Làm đúng như khi test tay', 'Máy ghi từng thao tác và các API đi kèm, không làm chậm bạn.'], ['Dừng & lưu', 'Hệ thống phân tích thành bước, quy tắc, test case để chạy lại.']];
    return `<div class="rec-ready"><div class="rr-main">
      <div class="rr-head"><span class="rr-dot">${icon('record', 18)}</span><div><h2>Bắt đầu một lần quay</h2><div class="small mute">Máy ghi đã sẵn sàng, chưa ghi gì cho tới khi bạn bấm bắt đầu.</div></div></div>
      <div class="rr-form"><label class="field">Tên luồng<input id="rname" placeholder="Ví dụ: Tạo phiếu yêu cầu tuyển dụng PATD"/></label>
        <label class="field">URL website cần test<input id="rurl" placeholder="${esc(env?.baseUrl ?? '')}"/></label>
        <button class="btn rec lg" data-act="start">${icon('record', 16)}Bắt đầu quay</button></div>
      <div class="rr-note">${env?.credentials?.saved
        ? `Dùng tài khoản đã nhớ: <b>${esc(env.credentials.username)}</b>, tự đăng nhập khi mở Chrome. <label class="row" style="display:inline-flex;gap:6px;margin-left:8px"><input type="checkbox" id="rrelogin"/> Đăng nhập bằng tài khoản khác</label>`
        : (env?.user ? `Chưa nhớ tài khoản riêng: Chrome tự đăng nhập bằng tài khoản QA <b>${esc(env.user)}</b> trong .env. Muốn dùng tài khoản của bạn thì lưu ở Cài đặt.` : 'Chưa nhớ tài khoản nào: Chrome sẽ mở ở màn hình đăng nhập. Nhập tài khoản của bạn, hệ thống nhớ để dùng cho các lần quay và chạy lại sau.')} Chỉ ghi nhận trên môi trường staging được cấu hình.</div></div>
      <ol class="rr-how">${how.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ol></div>`;
  }
  const paused = mode === 'paused';
  return `<div class="transport"><div class="top">
      <div><div class="name">${esc(st.name)}</div><div class="timer" id="rtimer">${clock(st.sec)}</div></div>
      <span class="tag-rec"><span class="dot ${paused ? 'pause' : 'rec'}"></span>${paused ? 'Tạm dừng, thao tác không được ghi' : 'Đang ghi nhận'}</span>
      <div class="stat"><b id="rcount">${st.count}</b><span>thao tác</span></div><div class="stat"><b id="rapis">${st.apis?.length ?? 0}</b><span>API ghi dữ liệu</span></div>
      <div class="row sp">${paused ? `<button class="btn primary lg" data-act="resume">${icon('play', 15)}Tiếp tục</button>` : `<button class="btn lg" data-act="pause">${icon('pause', 15)}Tạm dừng</button>`}<button class="btn lg" data-act="stop">${icon('stop', 15)}Dừng &amp; lưu</button></div></div>
    <div class="strip" id="rstrip" aria-label="Dòng thời gian các thao tác"></div>
    <div class="strip-key"><span><b style="background:#cfdce6"></b>bấm</span><span><b style="background:#86b6ff"></b>chuyển trang</span><span><b style="background:#c79bff"></b>chọn dữ liệu</span><span><b style="background:#6fdc9a"></b>nhập</span><span><b style="background:#ff8a5c"></b>ghi dữ liệu (API)</span>
      <input id="rnote" class="grow" style="height:26px;min-width:200px;margin-left:auto" placeholder="Ghi chú (không bắt buộc) rồi Enter"/></div></div>`;
}
