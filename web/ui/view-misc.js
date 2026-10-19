// Overview, AI Knowledge, Settings.
import { api } from './api.js';
import { RuleCard, ago, badge, esc, kindLabel, meta } from './components.js';
import { fail, modal, navigate, onAct, state, toast } from './core.js';
import { getLang, setLang } from './i18n.js';
import { icon } from './icons.js';


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
  root.innerHTML = `<div class="page-head"><div><h1>Overview</h1><p>Quay một lần, AI học nghiệp vụ, chạy lại để kiểm thử hồi quy.</p></div><span class="sp"><button class="btn rec lg" data-act="rec">${icon('record', 17)}New Recording</button></span></div>
    <div class="split" style="margin-top:0"><div class="col">
      <div class="card"><div class="card-h"><h2>Test flows gần đây</h2><a class="sp small" href="#/flows">Xem tất cả</a></div>
        ${flows.length ? `<table class="tbl"><tbody>${flows.slice(0, 5).map((f) => `<tr class="click" data-act="flow" data-id="${f.id}"><td><b style="color:var(--ink)">${esc(f.name)}</b>${meta(f.module ? esc(f.module) : '', `${f.step_count ?? '—'} bước`)}</td><td>${f.last_status ? badge(f.last_status) : '<span class="mute small">chưa chạy</span>'}</td><td class="small mute">${ago(f.last_run_at ?? f.updated_at)}</td></tr>`).join('')}</tbody></table>`
          : `<div class="empty">${icon('flows', 30)}<h3>Chưa có Test Flow</h3><div class="small">Bấm “New Recording”, thao tác như bình thường, rồi dừng quay.</div></div>`}</div>
      <div class="card"><div class="card-h"><h2>Lượt chạy gần đây</h2><a class="sp small" href="#/runs">Xem tất cả</a></div>${runs.length ? runs.slice(0, 6).map((r) => `<div class="mini-run" data-act="open-run" data-id="${esc(r.id)}"><div><b style="color:var(--ink)">${esc(r.flow_name ?? '')}</b>${meta(`v${r.version}`, ago(r.started_at))}</div><span class="small mute">${r.summary?.counts ? `${r.summary.counts.Passed ?? 0} đạt, ${r.summary.counts.Failed ?? 0} lỗi, ${r.summary.counts.Blocked ?? 0} bị chặn` : ''}</span>${badge(r.status)}</div>`).join('') : '<div class="empty"><h3>Chưa có lượt chạy</h3></div>'}</div></div>
    <div class="col"><div class="card"><div class="card-h"><h2>Cần chú ý</h2>${attention.length ? `<span class="badge warn sp">${attention.length}</span>` : ''}</div>
      ${attention.length ? attention.slice(0, 8).map((x) => `<button class="pick" data-act="go" data-to="${esc(x.to)}"><span class="ico ${x.cls === 'info' ? '' : x.cls}">${icon(x.ic, 15)}</span><span class="grow">${esc(x.text)}</span>${icon('chevronRight', 14)}</button>`).join('') : `<div class="empty">${icon('circleCheck', 28)}<h3>Không có gì cần xử lý</h3></div>`}</div>
      <div class="card"><div class="card-h"><h2>Tổng hợp</h2></div><div class="card-b"><dl class="kv"><dt>Test flows</dt><dd>${dash.flows}</dd><dt>Lần chạy</dt><dd>${done}</dd><dt>Tỷ lệ đạt</dt><dd>${done ? `${Math.round((pass / done) * 100)}%` : '—'}</dd><dt>Câu hỏi mở</dt><dd>${dash.openQuestions}</dd></dl></div></div></div></div>`;
  onAct({ rec: () => navigate('/record'), flow: (el) => navigate(`/flows/${el.dataset.id}`), 'open-run': (el) => navigate(`/runs/${el.dataset.id}`), go: (el) => navigate(el.dataset.to) });
}

// ======================= AI Knowledge =======================
export async function knowledgeView(root) {
  let mods = await api.get('/api/knowledge'); let sel = 0; let tab = 'fields';
  const byRules = (m) => m.sort((a, b) => b.rules.length - a.rules.length || b.fields.length - a.fields.length); // module có nhiều kiến thức nhất lên đầu
  mods = byRules(mods);
  const paint = () => {
    if (!mods.length) { root.innerHTML = `<div class="page-head"><div><h1>AI Knowledge</h1></div></div><div class="card"><div class="empty">${icon('knowledge', 30)}<h3>AI chưa học được gì</h3><div class="small">Kiến thức được tích luỹ từ các bản quay đã lưu thành Test Flow.</div></div></div>`; return; }
    const m = mods[Math.min(sel, mods.length - 1)];
    const rel = m.rules.filter((r) => ['field-appears', 'field-disappears', 'dependency', 'field-state', 'button-state'].includes(r.kind));
    const body = tab === 'fields' ? `<table class="tbl"><thead><tr><th>Trường</th><th>Loại</th><th>Bắt buộc</th><th>Xuất hiện ở flow</th></tr></thead><tbody>${m.fields.map((f) => `<tr><td><b style="color:var(--ink)">${esc(f.label)}</b></td><td class="small">${esc(f.kind)}</td><td>${f.required ? badge('Observed', 'Có dấu hiệu') : '<span class="mute small">—</span>'}</td><td class="small">${f.flows.map(esc).join(', ')}</td></tr>`).join('') || '<tr><td colspan="4" class="mute">Chưa thấy trường nào (bản quay cũ không có ảnh trạng thái form).</td></tr>'}</tbody></table>`
      : tab === 'relations' ? (rel.length ? rel.map((r) => RuleCard(r, { editable: true })).join('') : '<div class="empty"><h3>Chưa thấy quan hệ giữa các trường</h3><div class="small">Quan hệ chỉ được ghi nhận khi quan sát thấy trường xuất hiện/biến mất/bị khoá sau một thao tác.</div></div>')
        : tab === 'rules' ? (m.rules.length ? m.rules.map((r) => RuleCard(r, { editable: true })).join('') : '<div class="empty"><h3>Chưa có quy tắc</h3></div>')
          : `<ul class="run-steps">${m.rules.map((r) => `<li class="Passed"><span class="mk">${icon('note', 18)}</span><div><div style="color:var(--ink)">${esc(r.statement)}</div>${meta(esc(r.flow), kindLabel(r.kind))}</div><div class="small mute">${ago(r.createdAt)}</div></li>`).join('')}</ul>`;
    root.innerHTML = `<div class="page-head"><div><h1>AI Knowledge</h1><p>Kiến thức nghiệp vụ AI tích luỹ từ các lần quay và chạy lại. Quy tắc đã xác nhận không bao giờ bị suy luận mới ghi đè.</p></div></div>
      <div class="split" style="grid-template-columns:260px minmax(0,1fr);margin-top:0"><div class="card"><div class="card-h"><h3>Modules</h3></div>${mods.map((x, i) => `<button class="pick ${i === sel ? 'on' : ''}" data-act="mod" data-i="${i}"><span class="ico">${icon('knowledge', 15)}</span><span class="grow"><b style="color:var(--ink)">${esc(x.name)}</b>${meta(`${x.flows.length} flow`, `${x.fields.length} trường`, `${x.rules.length} quy tắc`)}</span></button>`).join('')}</div>
      <div><div class="tabs">${[['fields', 'Fields', m.fields.length], ['relations', 'Relationships', rel.length], ['rules', 'Rules', m.rules.length], ['history', 'Update history', m.rules.length]].map(([k, l, n]) => `<button class="${tab === k ? 'active' : ''}" data-act="ktab" data-k="${k}">${l}<span class="n">${n}</span></button>`).join('')}</div><div class="card">${body}</div></div></div>`;
  };
  paint();
  onAct({
    mod: (el) => { sel = Number(el.dataset.i); paint(); }, ktab: (el) => { tab = el.dataset.k; paint(); },
    rule: async (el) => { try { await api.post('/api/flow/rule', { id: Number(el.dataset.id), status: el.dataset.st }); mods = byRules(await api.get('/api/knowledge')); paint(); toast('Đã cập nhật mức tin cậy.'); } catch (e) { fail(e); } },
  });
}

// ======================= Settings =======================
export async function settingsView(root) {
  const env = state.env ?? (await api.get('/api/env'));
  const ai = localStorage.getItem('ai-provider') || 'claude';
  root.innerHTML = `<div class="page-head"><div><h1>Settings</h1><p>Cấu hình môi trường test và nhà cung cấp AI.</p></div></div>
    <div class="split" style="margin-top:0"><div class="col"><div class="card"><div class="card-h"><h2>Môi trường test</h2></div><div class="card-b"><dl class="kv"><dt>Base URL</dt><dd class="mono">${esc(env.baseUrl)}</dd><dt>Host cho phép</dt><dd class="mono small">${esc(env.allowedHosts)}</dd><dt>Tài khoản .env</dt><dd>${esc(env.user || '—')}</dd><dt>Menu đã học</dt><dd>${env.navMap ? badge('Confirmed', 'Đã học') : badge('Needs review', 'Chưa học (sẽ học khi khởi động lại)')}</dd></dl>
        <p class="small mute" style="margin:12px 0 0">Môi trường chỉ đổi được trong file <span class="mono">.env</span> (BASE_URL). Ghi nhận và chạy lại bị khoá ở các tên miền staging được liệt kê ở trên.</p></div></div>
      <div class="card"><div class="card-h"><h2>Tài khoản đăng nhập</h2></div><div class="card-b col">
        ${env.credentials?.saved ? `<dl class="kv"><dt>Tài khoản</dt><dd><b>${esc(env.credentials.username)}</b></dd><dt>Đã nhớ lúc</dt><dd>${esc(new Date(env.credentials.savedAt).toLocaleString(getLang() === 'en' ? 'en-GB' : 'vi-VN', { hour12: false }))}</dd></dl><div><button class="btn danger" data-act="forget">Quên tài khoản này</button></div>` : '<div class="small">Chưa nhớ tài khoản nào. Lần quay đầu tiên, nhập tài khoản ở màn hình đăng nhập của Chrome là hệ thống nhớ.</div>'}
        <p class="small mute" style="margin:0">Mật khẩu chỉ lưu trong file <span class="mono">.auth/credentials.json</span> trên máy này (git bỏ qua). Không nằm trong bản quay và không gửi cho AI. Khi chạy lại, hệ thống dùng đúng tài khoản này thay cho tài khoản trong <span class="mono">.env</span>.</p></div></div>
      <div class="card"><div class="card-h"><h2>Dữ liệu</h2></div><div class="card-b"><dl class="kv"><dt>Cơ sở dữ liệu</dt><dd class="mono">${esc(env.db)}</dd><dt>Bản quay thô</dt><dd class="mono">recordings/</dd><dt>Ảnh bằng chứng</dt><dd class="mono">data/shots, data/runs</dd></dl></div></div></div>
    <div class="col"><div class="card"><div class="card-h"><h2>Ngôn ngữ</h2></div><div class="card-b col"><label class="field">Ngôn ngữ giao diện<select id="lang"><option value="vi" ${getLang() === 'vi' ? 'selected' : ''}>Tiếng Việt</option><option value="en" ${getLang() === 'en' ? 'selected' : ''}>English</option></select></label></div></div>
      <div class="card"><div class="card-h"><h2>AI provider</h2></div><div class="card-b col"><label class="field">Dùng khi bấm “Phân tích bằng AI”<select id="ai"><option value="claude" ${ai === 'claude' ? 'selected' : ''}>Claude (CLI)</option><option value="ollama" ${ai === 'ollama' ? 'selected' : ''}>Ollama (chạy local, miễn phí, chậm)</option></select></label>
        <p class="small mute" style="margin:0">Dữ liệu gửi cho AI đã được che email, số điện thoại, token và id. Không gửi mật khẩu.</p></div></div>
      <div class="card"><div class="card-h"><h2>Công cụ khác</h2></div><div class="card-b col"><a class="btn" href="/classic">${icon('external', 14)}Classic runner</a><p class="small mute" style="margin:0">Chạy các luồng có sẵn, quy trình tự soạn, dọn dữ liệu test (giao diện cũ).</p></div></div></div></div>`;
  onAct({ forget: async () => { if (!(await modal({ title: 'Quên tài khoản đã nhớ?', danger: true, ok: 'Quên tài khoản', body: '<div class="small">Lần quay sau Chrome sẽ hỏi đăng nhập lại. Các flow đã lưu không bị ảnh hưởng.</div>' }))) return; try { await api.del('/api/credentials', {}); state.env = await api.get('/api/env'); toast('Đã quên tài khoản.'); settingsView(root); } catch (e) { fail(e); } } });
  document.getElementById('lang').onchange = (e) => { setLang(e.target.value); window.dispatchEvent(new HashChangeEvent('hashchange')); };
  document.getElementById('ai').onchange = (e) => { localStorage.setItem('ai-provider', e.target.value); toast('Đã lưu lựa chọn AI.'); };
}
