// Overview, Knowledge, Settings.
import { api } from './api.js';
import { RuleCard, ago, badge, esc, kindLabel, meta } from './components.js';
import { fail, modal, navigate, onAct, state, toast } from './core.js';
import { getLang, setLang } from './i18n.js';
import { icon } from './icons.js';
import { FRONTMATTER, mdToHtml } from './markdown.js';
import { flowHtml } from './flow-view.js';


// ======================= Overview =======================
export async function overviewView(root) {
  const [flows, runs, dash] = await Promise.all([api.get('/api/flows/list'), api.get('/api/runs'), api.get('/api/dashboard')]);
  const attention = [
    ...flows.filter((f) => f.proposals).map((f) => ({ ic: 'alert', cls: 'warn', text: `«${f.name}» có ${f.proposals} phiên bản đề xuất đang chờ xác nhận`, to: `/flows/${f.id}?tab=versions` })),
    ...flows.filter((f) => f.last_status === 'Failed').map((f) => ({ ic: 'circleX', cls: 'bad', text: `«${f.name}» lần chạy gần nhất bị lỗi`, to: `/runs?flow=${f.id}` })),
    ...flows.filter((f) => f.unverified).map((f) => ({ ic: 'circleAlert', cls: 'warn', text: `«${f.name}» còn ${f.unverified} quy tắc chưa xác minh`, to: `/flows/${f.id}?tab=rules` })),
  ];
  if (dash.openQuestions) attention.push({ ic: 'info', cls: 'info', text: `${dash.openQuestions} câu hỏi xác minh đang chờ bạn`, to: '/flows' });
  const done = dash.runs; const pass = dash.byStatus.Passed ?? 0;
  const rate = done ? Math.round((pass / done) * 100) : null;
  const TONE = { Passed: 'ok', Failed: 'bad', Blocked: 'warn', 'Needs review': 'warn' };
  const tape = runs.slice(0, 30).reverse();
  const last = runs[0];
  root.innerHTML = `<header class="ov-top">
      <div><h1>${rate == null ? 'Chưa có lượt chạy nào' : `${rate}% lượt chạy đạt`}</h1>
        <p>${done} lượt chạy · ${dash.flows} test flow${dash.openQuestions ? ` · ${dash.openQuestions} câu hỏi mở` : ''}${last ? ` · gần nhất ${ago(last.started_at)}` : ''}</p></div>
      <button class="btn primary" data-act="rec">${icon('record', 16)}Quay mới</button>
      <div class="ov-tape" title="Các lượt chạy gần nhất, cũ → mới">${tape.length ? tape.map((r) => `<button class="tick ${TONE[r.status] ?? ''}" data-act="open-run" data-id="${esc(r.id)}" title="${esc(r.flow_name ?? '')} · ${esc(r.status)} · ${ago(r.started_at)}"></button>`).join('') : '<span class="mute small">Các lượt chạy sẽ hiện thành dải màu ở đây.</span>'}</div>
    </header>
    ${attention.length ? `<section class="ov-attn"><h2>Cần xử lý <span class="badge warn">${attention.length}</span></h2><div class="ov-attn-row">${attention.slice(0, 6).map((x) => `<button class="ov-note ${x.cls}" data-act="go" data-to="${esc(x.to)}"><span class="ico">${icon(x.ic, 16)}</span><span>${esc(x.text)}</span></button>`).join('')}</div></section>` : ''}
    ${pipelineHtml(flows)}
    <details class="ov-docs" id="kn-details"><summary><span>Tất cả tài liệu nghiệp vụ</span><span class="mute" id="kn-count"></span></summary>
      <div id="kn-all"><div class="small mute">Đang tải…</div></div><div id="kn-fresh"><div class="small mute">Đang kiểm tra…</div></div></details>
    <div class="ov-grid"><section><div class="ov-h"><h2>Test flow</h2><a class="small" href="#/flows">Xem tất cả</a></div>
      ${flows.length ? `<div class="ov-cards">${flows.slice(0, 6).map((f) => `<button class="ov-card" data-act="flow" data-id="${f.id}"><div class="top"><b>${esc(f.name)}</b>${f.last_status ? badge(f.last_status) : '<span class="mute small">chưa chạy</span>'}</div>${meta(f.module ? esc(f.module) : '', `${f.step_count ?? '—'} bước`)}<div class="foot small mute">${ago(f.last_run_at ?? f.updated_at)}</div></button>`).join('')}</div>`
        : `<div class="empty">${icon('flows', 30)}<h3>Chưa có Test Flow</h3><div class="small">Bấm “Quay mới”, thao tác như bình thường, rồi dừng quay.</div></div>`}</section>
      <section><div class="ov-h"><h2>Lượt chạy gần đây</h2><a class="small" href="#/runs">Xem tất cả</a></div>
      ${runs.length ? `<ol class="ov-feed">${runs.slice(0, 7).map((r) => { const c = r.summary?.counts; return `<li class="${TONE[r.status] ?? ''}" data-act="open-run" data-id="${esc(r.id)}"><i></i><div><b>${esc(r.flow_name ?? '')}</b><div class="small mute">v${r.version} · ${ago(r.started_at)}${c ? ` · ${c.Passed ?? 0} đạt, ${c.Failed ?? 0} lỗi, ${c.Blocked ?? 0} chặn` : ''}</div></div>${badge(r.status)}</li>`; }).join('')}</ol>` : '<div class="empty"><h3>Chưa có lượt chạy</h3></div>'}</section></div>`;
  knowledgeCard(root.querySelector('#kn-fresh'), root);
  allDocs(root.querySelector('#kn-all'));
  root.querySelectorAll('.ov-pipe li').forEach((li) => { const open = () => openDoc(li.dataset.kn, li.dataset.title, li.querySelector('.dot').classList.contains('stale') ? 'stale' : ''); li.addEventListener('click', open); li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }); });
  onAct({ rec: () => navigate('/record'), flow: (el) => navigate(`/flows/${el.dataset.id}`), 'open-run': (el) => navigate(`/runs/${el.dataset.id}`), go: (el) => navigate(el.dataset.to) });
}

/** Tuyến nghiệp vụ chính (theo knowledge/_overview.md): mỗi chặng kèm knowledge phụ trách và số flow đã quay khớp tên. */
const STAGES = [
  ['YCTD', 'Yêu cầu tuyển dụng', 'recruitment-requests.md', /yctd|yêu cầu tuyển/i, true],
  ['PATD', 'Kế hoạch tuyển dụng', 'recruitment-plans.md', /patd|kế hoạch/i, true],
  ['Hồ sơ', 'Ứng viên vào kế hoạch', 'applications.md', /ứng viên|hồ sơ/i],
  ['Phỏng vấn', 'Lịch, phiếu đánh giá', 'interviews.md', /phỏng vấn/i],
  ['Offer', 'Tờ trình, duyệt offer', 'offers-and-onboarding.md', /offer/i],
  ['BSTT', 'Bổ sung thông tin', 'offers-and-onboarding.md', /bstt|bổ sung/i],
  ['HRIS', 'Kiểm tra, chuyển eHR', 'kiem-tra-thong-tin.md', /hris|ehr|kiểm tra thông tin/i],
];
const pipelineHtml = (flows) => `<section class="ov-attn"><h2>Luồng nghiệp vụ</h2><ol class="ov-pipe">${STAGES.map(([t, d, file, re, builtin]) => { const n = flows.filter((f) => re.test(f.name ?? '')).length; return `<li data-kn="${esc(file)}" data-title="${esc(t)}" tabindex="0" role="button"><i class="dot" title="Đang kiểm tra knowledge"></i><b>${esc(t)}</b><span class="small mute">${esc(d)}</span><span class="small">${n ? `${n} flow đã quay` : builtin ? 'có luồng dựng sẵn' : 'chưa quay'}</span></li>`; }).join('')}</ol></section>`;

/** Danh sách toàn bộ tài liệu nghiệp vụ; bấm một mục để đọc. */
async function allDocs(el) {
  try {
    const r = await api.get('/api/knowledge/list');
    document.getElementById('kn-count').textContent = `${r.files.length}`;
    el.innerHTML = `<div class="kn-all">${r.files.map((f) => `<button class="kn-doc-btn" title="${esc(f.file)}" data-file="${esc(f.file)}" data-title="${esc(f.title)}" data-status="${esc(f.status)}"><i class="dot ${esc(f.status)}" title="${f.status === 'stale' ? 'Đã cũ so với develop' : ''}"></i><b>${esc(f.title)}</b><span class="small mute">${esc(f.file)}</span></button>`).join('')}</div>`;
    el.querySelectorAll('.kn-doc-btn').forEach((b) => b.addEventListener('click', () => openDoc(b.dataset.file, b.dataset.title, b.dataset.status)));
  } catch (e) { el.querySelector('div').textContent = `Không tải được: ${e.message}`; }
}

/** Mở nội dung tài liệu của một chặng nghiệp vụ. */
async function openDoc(file, title, status) {
  let doc; try { doc = await api.get(`/api/knowledge/doc?file=${encodeURIComponent(file)}`); } catch (e) { return toast(e.message, true); }
  const detail = mdToHtml(doc.text.split(String.fromCharCode(13)).join('').replace(FRONTMATTER, ''));
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="modal kn-doc" role="dialog" aria-modal="true"><div class="modal-h"><h2>${esc(title)} <span class="mute small">${esc(file)}</span></h2>${status === 'stale' ? '<div class="small" style="color:#b54708">Tài liệu đã cũ so với develop. Bấm “Cập nhật” ở thẻ Knowledge bên dưới để học lại.</div>' : ''}
    <div class="tabs kn-tabs"><a data-tab="easy" class="active">Dễ hiểu</a><a data-tab="detail">Chi tiết kỹ thuật</a><button class="btn sm" data-regen title="Tóm tắt lại bằng AI">Tạo lại</button></div></div>
    <div class="modal-b kn-md" data-pane="easy">Đang tóm tắt thành luồng dễ hiểu…</div><div class="modal-b kn-md" data-pane="detail" hidden>${detail}</div>
    <div class="modal-f"><button class="btn" data-m="no">Đóng</button></div></div>`;
  const easy = ov.querySelector('[data-pane=easy]');
  const load = async (force) => {
    easy.textContent = 'Đang tóm tắt thành luồng dễ hiểu… (lần đầu mất khoảng 30–60 giây, các lần sau mở ngay)';
    try { const r = await api.post('/api/knowledge/summary', { file, force: !!force }); easy.innerHTML = flowHtml(r.summary); }
    catch (e) { easy.innerHTML = `<p>${esc(e.message)}</p><p class="small mute">Xem tab «Chi tiết kỹ thuật» để đọc bản gốc.</p>`; }
  };
  load(false);
  const done = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') done(); };
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-m=no]')) return done();
    const t = e.target.closest('[data-tab]'); if (t) { ov.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === t)); ov.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.tab; }); }
    if (e.target.closest('[data-regen]')) load(true);
  });
  document.addEventListener('keydown', onKey); document.body.append(ov);
}

/** Knowledge nào đã cũ so với nhánh develop: so learnedCommit với commit mới nhất đã chạm file nguồn của nó. */
async function knowledgeCard(el, root) {
  if (!el) return;
  try {
    const r = await api.get('/api/knowledge/status');
    if (!r.head) { el.querySelector('div').textContent = `Không đọc được ${r.ref}: ${r.error}`; return; }
    const by = Object.fromEntries(r.files.map((f) => [f.file, f.status]));
    root.querySelectorAll('.ov-pipe li').forEach((li) => { const s = by[li.dataset.kn] ?? 'unknown'; const d = li.querySelector('.dot'); d.className = `dot ${s}`; d.title = { fresh: 'Knowledge còn mới', stale: 'Knowledge đã cũ so với develop', unknown: 'Chưa xác định knowledge' }[s]; });
    const stale = r.files.filter((f) => f.status === 'stale'); const fresh = r.files.filter((f) => f.status === 'fresh').length; const unk = r.files.filter((f) => f.status === 'unknown').length;
    if (!stale.length) { el.className = 'kn-ok'; el.textContent = `Tài liệu khớp với ${r.ref} (${r.head}): ${fresh} mới, ${unk} chưa xác định.`; return; }
    document.getElementById('kn-details').open = true;
    el.className = 'ov-attn'; el.innerHTML = `<h2>Knowledge so với ${esc(r.ref)} <span class="badge ${stale.length ? 'warn' : 'ok'}">${stale.length} cũ</span>${stale.length ? '<button class="btn sm" data-kn-all>Cập nhật tất cả</button>' : ''}</h2>
      <div class="small mute">${esc(r.ref)} ở <b>${esc(r.head)}</b> · ${fresh} mới · ${unk} chưa xác định</div>
      ${stale.length ? `<div class="ov-attn-row">${stale.map((f) => `<div class="ov-note warn" data-kn-row="${esc(f.file)}"><span class="ico">${icon('alert', 16)}</span><button class="btn sm" data-kn-one="${esc(f.file)}">Cập nhật</button><span><b>${esc(f.file)}</b> học ở ${esc(f.learnedCommit)} · ${f.changed.length} file nguồn đã đổi: ${esc(f.changed.slice(0, 2).join(', '))}${f.changed.length > 2 ? '…' : ''}</span></div>`).join('')}</div>` : ''}`;
  } catch (e) { el.querySelector('div').textContent = `Không kiểm tra được: ${e.message}`; return; }
  const one = async (file) => {
    const row = el.querySelector(`[data-kn-row="${CSS.escape(file)}"]`); const btn = row?.querySelector('button');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang cập nhật…'; }
    try { const u = await api.post('/api/knowledge/update', { file }); if (!u.updated) throw new Error(u.reason); toast(`${file}: đã cập nhật ${u.from} → ${u.to}${u.skipped ? ` (còn ${u.skipped} file nguồn chưa học)` : ''}. Bản cũ ở ${u.backup}`); return true; }
    catch (e) { toast(`${file}: ${e.message}`, true); if (btn) { btn.disabled = false; btn.textContent = 'Cập nhật'; } return false; }
  };
  el.querySelectorAll('[data-kn-one]').forEach((b) => b.addEventListener('click', async () => { if (await one(b.dataset.knOne)) knowledgeCard(el, root); }));
  el.querySelector('[data-kn-all]')?.addEventListener('click', async (e) => { e.target.disabled = true; for (const f of [...el.querySelectorAll('[data-kn-one]')].map((b) => b.dataset.knOne)) if (!(await one(f))) break; knowledgeCard(el, root); });
}

// ======================= Settings =======================
export async function settingsView(root) {
  const env = state.env ?? (await api.get('/api/env'));
  root.innerHTML = `<div class="page-head"><div><h1>Settings</h1><p>Cấu hình môi trường test.</p></div></div>
    <div class="split" style="margin-top:0"><div class="col"><div class="card"><div class="card-h"><h2>Môi trường test</h2></div><div class="card-b"><dl class="kv"><dt>Base URL</dt><dd class="row" style="gap:8px"><input id="baseUrl" class="mono grow" value="${esc(env.baseUrl)}"/><button class="btn sm" data-act="save-url">Lưu</button></dd><dt>Host cho phép</dt><dd class="mono small">${esc(env.allowedHosts)}</dd><dt>Tài khoản .env</dt><dd>${esc(env.user || '—')}</dd><dt>Menu đã học</dt><dd>${env.navMap ? badge('Confirmed', 'Đã học') : badge('Needs review', 'Chưa học (sẽ học khi khởi động lại)')}</dd></dl>
        <p class="small mute" style="margin:12px 0 0">Đổi Base URL sẽ ghi vào <span class="mono">.env</span> và có hiệu lực sau khi khởi động lại <span class="mono">npm run web</span>. Ghi nhận và chạy lại bị khoá ở các tên miền staging được liệt kê ở trên.</p></div></div>
      <div class="card"><div class="card-h"><h2>Tài khoản đăng nhập</h2></div><div class="card-b col">
        <div class="col" style="gap:10px"><label class="field">Tên đăng nhập<input id="accUser" autocomplete="off" value="${esc(env.credentials?.username ?? '')}"/></label>
          <label class="field">Mật khẩu<input id="accPass" type="password" autocomplete="new-password" placeholder="${env.credentials?.saved ? '•••••••• (nhập để đổi)' : ''}"/></label>
          <label class="field">Secret OTP (tuỳ chọn, để tự điền mã 2 bước)<input id="accTotp" autocomplete="off" placeholder="${env.credentials?.hasTotp ? '•••••••• (nhập để đổi)' : 'Ví dụ: J5PH…'}"/></label>
          <label class="row small" style="gap:8px"><input type="checkbox" id="accLocal" ${env.credentials?.local ? 'checked' : ''}/> Tài khoản đăng nhập local (form của app, không qua “Sign in with SSO”)</label>
          <div><button class="btn primary" data-act="save-acc">Lưu tài khoản</button></div></div>
        ${env.credentials?.saved ? `<dl class="kv"><dt>Tài khoản</dt><dd><b>${esc(env.credentials.username)}</b></dd><dt>Đã nhớ lúc</dt><dd>${esc(new Date(env.credentials.savedAt).toLocaleString(getLang() === 'en' ? 'en-GB' : 'vi-VN', { hour12: false }))}</dd></dl><div><button class="btn danger" data-act="forget">Quên tài khoản này</button></div>` : '<div class="small">Chưa nhớ tài khoản nào. Lần quay đầu tiên, nhập tài khoản ở màn hình đăng nhập của Chrome là hệ thống nhớ.</div>'}
        <p class="small mute" style="margin:0">Mật khẩu chỉ lưu trong file <span class="mono">.auth/credentials.json</span> trên máy này (git bỏ qua). Không nằm trong bản quay. Khi chạy lại, hệ thống dùng đúng tài khoản này thay cho tài khoản trong <span class="mono">.env</span>.</p></div></div>
      <div class="card"><div class="card-h"><h2>Dữ liệu</h2></div><div class="card-b"><dl class="kv"><dt>Cơ sở dữ liệu</dt><dd class="mono">${esc(env.db)}</dd><dt>Bản quay thô</dt><dd class="mono">recordings/</dd><dt>Ảnh bằng chứng</dt><dd class="mono">data/shots, data/runs</dd></dl></div></div></div>
    <div class="col"><div class="card"><div class="card-h"><h2>Ngôn ngữ</h2></div><div class="card-b col"><label class="field">Ngôn ngữ giao diện<select id="lang"><option value="vi" ${getLang() === 'vi' ? 'selected' : ''}>Tiếng Việt</option><option value="en" ${getLang() === 'en' ? 'selected' : ''}>English</option></select></label></div></div></div></div>`;
  onAct({
    'save-url': async () => { try { const r = await api.post('/api/settings/base-url', { url: document.getElementById('baseUrl').value }); toast(r.restart ? 'Đã lưu. Khởi động lại npm run web để áp dụng.' : 'Đã lưu.'); } catch (e) { fail(e); } },
    'save-acc': async () => {
      const g = (id) => document.getElementById(id).value;
      if (!g('accPass') && !(env.credentials?.saved && g('accUser').trim() === env.credentials.username)) { toast('Nhập mật khẩu.', true); return; }
      try { await api.post('/api/credentials', { username: g('accUser'), password: g('accPass'), totpSecret: g('accTotp'), local: document.getElementById('accLocal').checked }); state.env = await api.get('/api/env'); toast('Đã lưu tài khoản.'); settingsView(root); } catch (e) { fail(e); }
    },
    forget: async () => { if (!(await modal({ title: 'Quên tài khoản đã nhớ?', danger: true, ok: 'Quên tài khoản', body: '<div class="small">Lần quay sau Chrome sẽ hỏi đăng nhập lại. Các flow đã lưu không bị ảnh hưởng.</div>' }))) return; try { await api.del('/api/credentials', {}); state.env = await api.get('/api/env'); toast('Đã quên tài khoản.'); settingsView(root); } catch (e) { fail(e); } } });
  document.getElementById('lang').onchange = (e) => { setLang(e.target.value); window.dispatchEvent(new HashChangeEvent('hashchange')); };
}
