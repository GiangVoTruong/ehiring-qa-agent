// Test Flows (thư viện), chi tiết flow, Test Runs và báo cáo lượt chạy.
import { api } from './api.js';
import { RuleCard, TestCaseTable, TestFlowCards, TestFlowTable, TestRunReport, ago, badge, classBadge, describeStep, dt, dur, esc, meta } from './components.js';
import { fail, modal, navigate, onAct, onLeave, openMenu, parseHash, state, toast } from './core.js';
import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);

/** Replay một flow (hoặc test case): hộp thoại xin phép chạy trên môi trường test + chọn dữ liệu, rồi sang trang báo cáo đang chạy. */
export async function startReplay(flowId, testCaseId) {
  let D;
  try { D = await api.get('/api/flow?id=' + flowId); } catch (e) { return fail(e); }
  const tc = testCaseId ? D.testCases.find((c) => c.id === Number(testCaseId)) : null;
  const writes = [...new Set((D.current.expected.writes ?? []).map((w) => `${w.method} ${w.path}`))];
  const data = D.current.steps.map((s, i) => ({ s, i })).filter((x) => x.s.act?.dataChoice);
  const needAllow = writes.length > 0 || !!tc;
  const body = `<div class=\"col\" style=\"gap:2px\"><div>Flow <b>${esc(D.flow.name)}</b></div>${tc ? `<div>Test case <b>${esc(tc.title)}</b></div>` : ''}<div class=\"small mute\">${D.current.steps.length} bước trên <b>${esc(state.env?.host ?? 'staging')}</b></div></div>
    ${writes.length ? `<div class="callout warn">${icon('alert', 18)}<div><b>Replay sẽ GHI dữ liệu thật trên môi trường test:</b><div class="mono">${writes.map(esc).join('<br>')}</div></div></div>` : tc ? `<div class="callout warn">${icon('alert', 18)}<div>Test case này có thể thay đổi dữ liệu trên môi trường test.</div></div>` : ''}
    ${data.length ? `<div class="col"><div class="small mute">Dữ liệu chọn (để trống = lấy mục đầu tiên của danh sách):</div>${data.map((x) => `<label class="field">${esc(x.s.act.dataField || 'Danh sách chọn')}<input data-val="${x.i}" value="${esc(x.s.act.text)}"/></label>`).join('')}</div>` : ''}`;
  let job = null;
  const ok = await modal({ title: 'Replay test flow', body, ok: 'Bắt đầu chạy', check: needAllow ? 'Tôi cho phép chạy trên môi trường test' : '',
    onOk: async (ov) => {
      const values = {}; ov.querySelectorAll('[data-val]').forEach((i) => { values[i.dataset.val] = i.value.trim(); });
      job = await api.post('/api/flow/run', { flowId, testCaseId: tc?.id, params: { values, fallbackFirst: true }, allowWrites: needAllow });
    } });
  if (ok && job) navigate(`/runs/${job.runId}`);
}

function confirmDelete(f) {
  return modal({ title: `Xoá Test Flow «${f.name}»?`, danger: true, ok: 'Xoá luồng', body: '<div class="small">Mất cả phiên bản, quy tắc đã học, test case và lịch sử chạy; không khôi phục được. Bản quay thô vẫn còn trong thư mục <span class="mono">recordings/</span>.</div>',
    onOk: async () => { await api.del('/api/flow', { id: f.id }); toast('Đã xoá Test Flow.'); } });
}
function renameDialog(f) {
  return modal({ title: 'Đổi tên Test Flow', ok: 'Lưu', body: `<label class="field">Tên<input id="rn-name" value="${esc(f.name)}"/></label>`, onOk: async (ov) => { await api.post('/api/flow/rename', { id: f.id, name: ov.querySelector('#rn-name').value }); toast('Đã đổi tên.'); } });
}
function flowMenu(el, f, refresh) {
  openMenu(el, [
    { icon: 'external', label: 'View details', run: () => navigate(`/flows/${f.id}`) },
    { icon: 'pencil', label: 'Edit name', run: async () => { if (await renameDialog(f)) refresh(); } },
    { icon: 'play', label: 'Replay', run: () => startReplay(f.id) },
    { icon: 'runs', label: 'View history', run: () => navigate(`/runs?flow=${f.id}`) },
    { icon: 'trash', label: 'Delete', danger: true, run: async () => { if (await confirmDelete(f)) { refresh(); } } },
  ]);
}

// ======================= Test Flows =======================
export async function flowsView(root) {
  const { query } = parseHash();
  let rows = await api.get('/api/flows/list');
  let view = localStorage.getItem('flows-view') || 'table';
  const f = { q: query.get('q') ?? '', module: '', status: '' };
  const modules = [...new Set(rows.map((r) => r.module).filter(Boolean))];
  const filtered = () => rows.filter((r) => (!f.q || `${r.name} ${r.module} ${r.url}`.toLowerCase().includes(f.q.toLowerCase())) && (!f.module || r.module === f.module) && (!f.status || r.status === f.status));
  const refresh = async () => { rows = await api.get('/api/flows/list'); paintList(); };
  function paintList() { const list = filtered(); $('flist').innerHTML = view === 'table' ? TestFlowTable(list) : TestFlowCards(list); $('fcount').textContent = `${list.length}/${rows.length} flow`; }
  root.innerHTML = `<div class="page-head"><div><h1>Test Flows</h1><p>Thư viện luồng đã học — chạy lại để kiểm thử hồi quy.</p></div><span class="sp"><button class="btn primary" data-act="new">${icon('plus', 15)}New Recording</button></span></div>
    <div class="toolbar"><label class="search" style="margin:0;width:260px">${icon('search', 15)}<input id="fq" placeholder="Tìm theo tên, module hoặc URL" value="${esc(f.q)}"/></label>
      <select id="fmod"><option value="">Tất cả module</option>${modules.map((m) => `<option>${esc(m)}</option>`).join('')}</select>
      <select id="fst"><option value="">Mọi trạng thái</option><option value="draft">Draft</option><option value="confirmed">Confirmed</option></select>
      <span class="pill" title="Chỉ một môi trường được cấu hình trong .env">${icon('flask', 13)}Staging</span><span class="mute small" id="fcount"></span>
      <span class="seg sp"><button data-act="view" data-v="table" class="${view === 'table' ? 'active' : ''}" aria-label="Dạng bảng">${icon('table', 15)}</button><button data-act="view" data-v="cards" class="${view === 'cards' ? 'active' : ''}" aria-label="Dạng thẻ">${icon('grid', 15)}</button></span></div><div id="flist"></div>`;
  paintList();
  $('fq').oninput = (e) => { f.q = e.target.value; paintList(); }; $('fmod').onchange = (e) => { f.module = e.target.value; paintList(); }; $('fst').onchange = (e) => { f.status = e.target.value; paintList(); };
  onAct({
    new: () => navigate('/record'),
    view: (el) => { view = el.dataset.v; localStorage.setItem('flows-view', view); root.querySelectorAll('[data-act=view]').forEach((b) => b.classList.toggle('active', b === el)); paintList(); },
    'open-flow': (el) => navigate(`/flows/${el.dataset.id}`),
    replay: (el) => startReplay(Number(el.dataset.id)),
    menu: (el) => flowMenu(el, rows.find((r) => r.id === Number(el.dataset.id)), refresh),
  });
}

// ======================= Chi tiết flow =======================
export async function flowDetailView(root) {
  const { id: rawId, query } = parseHash(); const id = Number(rawId);
  let D = await api.get('/api/flow?id=' + id); let tab = query.get('tab') || 'overview';
  const load = async () => { D = await api.get('/api/flow?id=' + id); paint(); };
  function paint() {
    const { flow, current, rules, testCases, questions, runs } = D; const exp = current.expected;
    const openQ = questions.filter((q) => q.state === 'open'); const proposed = flow.versions.filter((v) => v.state === 'proposed');
    const T = (k, l, n) => `<button class="${tab === k ? 'active' : ''}" data-act="tab" data-k="${k}">${l}${n != null ? `<span class="n">${n}</span>` : ''}</button>`;
    const overview = `<div class="split" style="margin-top:0"><div class="card"><div class="card-h"><h2>Các bước (${current.steps.length})</h2></div><ol class="tl">${current.steps.map((s, i) => { const d = describeStep(s); return `<li class="ev"><div class="ev-h" style="cursor:default"><span class="no">${i + 1}</span><span class="ico ${d.cls}">${icon(d.ic, 14)}</span><span class="t">${d.label}</span><span class="what"><span>${esc(d.what)}</span>${d.value ? `<span class="badge">${esc(d.value)}</span>` : ''}</span><span class="end">${(s.effects ?? []).filter((e) => !/dashboard/.test(e)).length ? '<span class="badge info">API</span>' : ''}</span></div></li>`; }).join('')}</ol></div>
      <div class="col"><div class="card"><div class="card-h"><h2>Thông tin</h2></div><div class="card-b"><dl class="kv"><dt>Module</dt><dd>${esc(flow.module || '—')}</dd><dt>URL</dt><dd class="mono">${esc(flow.url || '—')}</dd><dt>Phiên bản</dt><dd>v${flow.current_version}</dd><dt>Trạng thái</dt><dd>${badge(flow.status)}</dd><dt>Cập nhật</dt><dd>${dt(flow.updated_at)}</dd>${flow.description ? `<dt>Mô tả</dt><dd>${esc(flow.description)}</dd>` : ''}</dl></div></div>
      <div class="card"><div class="card-h"><h2>Kết quả mong đợi</h2></div><div class="card-b small">${exp.writes.length || exp.toasts.length ? [...exp.writes.map((w) => `<div class="mono">${esc(w.method)} ${esc(w.path)} → ${w.status}</div>`), ...exp.toasts.map((t) => `<div>Thông báo ${esc(t.kind)}: ${esc(t.text)}</div>`)].join('') : '<span class="mute">Bản quay không có API ghi hay thông báo để đối chiếu — chạy lại chỉ biết các thao tác chạy được.</span>'}</div></div>
      ${openQ.length ? `<div class="card"><div class="card-h"><h2>Câu hỏi xác minh</h2><span class="sp mute small">có thể bỏ qua</span></div>${openQ.map((q) => `<div class="rule"><p>${esc(q.text)}</p>${q.why ? `<div class="small mute">${esc(q.why)}</div>` : ''}<div class="row"><input class="grow" data-qa="${q.id}" placeholder="Trả lời"/><button class="btn sm" data-act="answer" data-id="${q.id}" data-st="answered">Gửi</button><button class="btn sm" data-act="answer" data-id="${q.id}" data-st="skipped">Bỏ qua</button></div></div>`).join('')}</div>` : ''}</div></div>`;
    const body = tab === 'rules' ? `<div class="card">${rules.length ? rules.map((r) => RuleCard({ ...r, evidence: r.evidence }, { editable: true })).join('') : '<div class="empty"><h3>Chưa có quy tắc</h3></div>'}</div>`
      : tab === 'cases' ? `<div class="card">${TestCaseTable(testCases, { stepCount: current.steps.length })}</div>`
        : tab === 'versions' ? `<div class="card"><table class="tbl"><thead><tr><th>Phiên bản</th><th>Trạng thái</th><th>Ghi chú</th><th>Số bước</th><th>Tạo lúc</th><th></th></tr></thead><tbody>${flow.versions.map((v) => `<tr><td><b>v${v.version}</b></td><td>${badge(v.state === 'current' ? 'Confirmed' : v.state === 'proposed' ? 'Needs review' : 'Skipped', v.state === 'current' ? 'Đang dùng' : v.state === 'proposed' ? 'Đề xuất' : v.state === 'superseded' ? 'Đã thay thế' : 'Từ chối')}</td><td class="small">${esc(v.note || '')}</td><td>${v.stepCount}</td><td class="small mute">${dt(v.created_at)}</td><td>${v.state === 'proposed' ? `<button class="btn sm primary" data-act="ver" data-v="${v.version}" data-a="accept">Chấp nhận</button> <button class="btn sm" data-act="ver" data-v="${v.version}" data-a="reject">Từ chối</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
          : tab === 'history' ? RunsTable(runs.map((r) => ({ ...r, flow_name: flow.name })))
            : overview;
    root.innerHTML = `<div class="page-head"><div><div class="row wrap"><h1>${esc(flow.name)}</h1>${badge(flow.status)}<span class="badge">v${flow.current_version}</span></div>${meta(esc(flow.module || ''), `${current.steps.length} bước`, `${flow.runs ?? runs.length} lần chạy`)}</div>
      <span class="sp row"><button class="btn primary" data-act="replay">${icon('play', 14)}Replay</button><button class="btn" data-act="confirm">${flow.status === 'confirmed' ? 'Bỏ xác nhận' : `${icon('check', 14)}Xác nhận đúng nghiệp vụ`}</button>${rules.some((r) => r.source === 'ai') ? '' : `<button class="btn" data-act="ai">${icon('sparkles', 14)}AI phân tích sâu</button>`}<button class="btn icon" data-act="menu" aria-label="Thêm">${icon('more', 16)}</button></span></div>
      ${proposed.length ? `<div class="callout warn" style="margin-bottom:14px">${icon('alert', 18)}<div>Có <b>${proposed.length}</b> phiên bản đề xuất đang chờ bạn xem. <a href="#" data-act="tab" data-k="versions">Xem phiên bản</a></div></div>` : ''}
      <div class="tabs">${T('overview', 'Overview')}${T('rules', 'Rules', rules.length)}${T('cases', 'Test Cases', testCases.length)}${T('versions', 'Versions', flow.versions.length)}${T('history', 'History', runs.length)}</div>${body}`;
  }
  paint();
  onAct({
    tab: (el) => { tab = el.dataset.k; paint(); }, replay: () => startReplay(id), 'run-case': (el) => startReplay(id, Number(el.dataset.id)),
    confirm: async () => { try { await api.post('/api/flow/status', { id, status: D.flow.status === 'confirmed' ? 'draft' : 'confirmed' }); await load(); } catch (e) { fail(e); } },
    ai: async (el) => { el.disabled = true; el.textContent = 'AI đang phân tích (~30s)…'; try { const r = await api.post('/api/flow/ai', { flowId: id, provider: localStorage.getItem('ai-provider') || 'claude' }); toast(`AI thêm ${r.rules} quy tắc, ${r.questions} câu hỏi.`); await load(); } catch (e) { fail(e); await load(); } },
    rule: async (el) => { try { await api.post('/api/flow/rule', { id: Number(el.dataset.id), status: el.dataset.st }); await load(); } catch (e) { fail(e); } },
    answer: async (el) => { try { await api.post('/api/flow/question', { id: Number(el.dataset.id), answer: root.querySelector(`[data-qa="${el.dataset.id}"]`).value, state: el.dataset.st }); await load(); } catch (e) { fail(e); } },
    ver: async (el) => { if (el.dataset.a === 'accept' && !(await modal({ title: 'Chấp nhận phiên bản này?', body: '<div class="small">Phiên bản hiện tại vẫn được giữ trong lịch sử.</div>', ok: 'Chấp nhận' }))) return; try { await api.post('/api/flow/version', { flowId: id, version: Number(el.dataset.v), action: el.dataset.a }); await load(); } catch (e) { fail(e); } },
    menu: (el) => flowMenu(el, D.flow, () => navigate('/flows')),
    'open-run': (el) => navigate(`/runs/${el.dataset.id}`),
  });
}

// ======================= Test Runs =======================
function RunsTable(runs) {
  if (!runs.length) return `<div class="card"><div class="empty">${icon('runs', 30)}<h3>Chưa có lượt chạy</h3><div class="small">Chạy lại một Test Flow để thấy báo cáo ở đây.</div></div></div>`;
  return `<div class="card"><table class="tbl"><thead><tr><th>Run ID</th><th>Test flow</th><th>Environment</th><th>Start time</th><th>Duration</th><th>Passed / Failed / Blocked</th><th>Trigger</th><th>Result</th></tr></thead><tbody>
    ${runs.map((r) => { const c = r.summary?.counts ?? {}; return `<tr class="click" data-act="open-run" data-id="${esc(r.id)}"><td class="mono">${esc(r.id)}</td><td><b style="color:var(--ink)">${esc(r.flow_name ?? '')}</b><div class="small mute">v${r.version}</div></td><td class="small">${esc(state.env?.host ?? 'staging')}</td><td class="small">${dt(r.started_at)}</td>
      <td class="small">${r.finished_at ? dur(new Date(r.finished_at) - new Date(r.started_at)) : '…'}</td><td><span class="ok-n">${c.Passed ?? 0}</span> / <span style="color:var(--bad)">${c.Failed ?? 0}</span> / <span style="color:var(--warn)">${c.Blocked ?? 0}</span></td><td class="small">Manual</td><td>${badge(r.status)}</td></tr>`; }).join('')}</tbody></table></div>`;
}
export async function runsView(root) {
  const { query } = parseHash(); const flow = query.get('flow');
  const runs = await api.get('/api/runs' + (flow ? `?flowId=${flow}` : ''));
  root.innerHTML = `<div class="page-head"><div><h1>Test Runs</h1><p>${flow ? 'Lịch sử chạy của một Test Flow.' : 'Lịch sử chạy lại các Test Flow.'}</p></div>${flow ? `<span class="sp"><a class="btn" href="#/runs">Xem tất cả</a></span>` : ''}</div>${RunsTable(runs)}`;
  onAct({ 'open-run': (el) => navigate(`/runs/${el.dataset.id}`) });
}
export async function runDetailView(root) {
  const { id } = parseHash(); let timer = null;
  const paint = async () => {
    try {
      const run = await api.get('/api/run?id=' + encodeURIComponent(id));
      root.innerHTML = `<div class="page-head"><div><h1>Báo cáo lượt chạy</h1><p class="mono">${esc(run.id)}</p></div><span class="sp row"><a class="btn" href="#/runs">${icon('runs', 14)}Tất cả lượt chạy</a><a class="btn" href="#/flows/${run.flow_id}">${icon('flows', 14)}Mở Test Flow</a></span></div>${TestRunReport(run)}`;
      if (run.status !== 'Running') { clearInterval(timer); timer = null; }
    } catch (e) { clearInterval(timer); root.innerHTML = `<div class="callout bad">${icon('circleX', 18)}<div>${esc(e.message)}</div></div>`; }
  };
  await paint();
  if (!timer && root.querySelector('.spin')) { timer = setInterval(paint, 1500); onLeave(() => clearInterval(timer)); }
}
export { RunsTable };
