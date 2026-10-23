// Màn hình Record & Learn và Analysis.
import { api } from './api.js';
import { AILiveInsights, AnalysisProgress, BusinessFlowStepper, EvidenceViewer, RecordingControlPanel, RecordingTimeline, RuleCard, TestCaseTable, RecordedActionItem, badge, clock, dt, esc, meta, stripHtml } from './components.js';
import { fail, modal, navigate, onAct, onLeave, parseHash, state, toast } from './core.js';
import { icon } from './icons.js';
import { startReplay } from './view-library.js';

const $ = (id) => document.getElementById(id);

// ======================= Record & Learn =======================
export async function recordView(root) {
  let st = await api.get('/api/rec/status');
  let reviewId = sessionStorage.getItem('lastRec') || '';
  let review = null;
  const open = new Set();
  let shown = []; // khoá các bước đã vẽ → chỉ thêm bước mới (giữ animation, không nhấp nháy)
  let insKey = '';
  let timer = null;
  let stripCount = 0;
  let credToast = false;

  const mode = () => (st.recording ? (st.paused ? 'paused' : 'recording') : review ? 'review' : 'ready');
  const STATUS = { ready: ['Ready to record', ''], recording: ['Recording', 'rec'], paused: ['Paused', 'warn'], review: ['Recording saved — chờ phân tích', 'accent'] };

  async function loadReview() {
    if (!reviewId) { review = null; return; }
    try { review = await api.get('/api/rec?id=' + encodeURIComponent(reviewId)); } catch { review = null; sessionStorage.removeItem('lastRec'); reviewId = ''; }
  }

  function reviewPanel() {
    const r = review;
    return `<div class="card" style="margin-top:16px"><div class="card-h"><h2>Review recording</h2>${badge('Confirmed', 'Đã lưu')}<span class="sp mute small">${dt(r.startedAt)}</span></div>
      <div class="review-sum"><div class="stat"><b>${esc(r.name)}</b><span>Tên luồng</span></div><div class="stat"><b>${clock(r.durationSec)}</b><span>Tổng thời gian</span></div><div class="stat"><b>${r.steps.length}</b><span>Thao tác</span></div><div class="stat"><b>${r.pages}</b><span>Trang đã đi qua</span></div></div>
      ${r.notes?.length ? `<div class="card-b small" style="border-bottom:1px solid var(--line-soft)"><b>Ghi chú của bạn:</b> ${r.notes.map(esc).join(' · ')}</div>` : ''}
      <ol class="tl" id="rtl">${r.steps.map((s, i) => RecordedActionItem(s, i, r.startedAt, open.has(i))).join('')}</ol>
      <div class="card-b row wrap" style="border-top:1px solid var(--line-soft)"><button class="btn primary lg" data-act="analyze">${icon('sparkles', 16)}Xem phân tích</button><button class="btn lg" data-act="save-rec">${icon('check', 16)}Lưu recording</button>
        <span class="small mute">“Lưu recording” lưu thành Test Flow dùng dữ kiện máy quan sát được. Muốn quay lại từ đầu: bắt đầu một lần quay mới ở trên.</span></div></div>`;
  }

  function paint() {
    const m = mode();
    root.innerHTML = `<div class="page-head"><div><h1>Record &amp; Learn</h1><p>Record your testing workflow. The recorder captures each step and the API calls behind it.</p></div><span class="sp" id="rstatus"></span></div>
      <div id="rpanel"></div>
      ${m === 'review' && review ? reviewPanel() : `<div class="split"><div class="card"><div class="card-h"><h2>Recorded Actions</h2><span class="sp mute small" id="rhint"></span></div><div id="rtl-box"></div></div><div id="rins"></div></div>`}`;
    paintDynamic();
  }
  function paintDynamic() {
    const m = mode(); const [label, cls] = STATUS[m];
    $('rstatus').innerHTML = `<span class="badge ${cls}">${m === 'recording' ? '<span class="dot rec"></span>' : ''}${label}</span>`;
    if ($('rpanel').dataset.mode !== m) { $('rpanel').innerHTML = RecordingControlPanel({ mode: m, st, env: state.env }); $('rpanel').dataset.mode = m; stripCount = 0; }
    if ($('rstrip')) { $('rstrip').innerHTML = stripHtml(st.steps, st.startedAt, Math.max(0, st.steps.length - stripCount)); stripCount = st.steps.length; }
    if ($('rtimer')) { $('rtimer').textContent = clock(st.sec); $('rcount').textContent = st.count; $('rapis').textContent = st.apis?.length ?? 0; }
    document.querySelector('.split')?.classList.toggle('idle', m === 'ready'); // chưa quay: ẩn hai khung trống, hướng dẫn nằm ngay trong bảng điều khiển
    if (m === 'review') return;
    const steps = st.recording ? st.steps : [];
    const keys = steps.map((s) => s.text + '|' + (s.act?.value ?? ''));
    const box = $('rtl-box');
    const prefix = shown.length <= keys.length && shown.every((k, i) => k === keys[i]);
    if (!steps.length) { if (shown.length || !box.innerHTML) box.innerHTML = RecordingTimeline([]); }
    else if (prefix && shown.length && $('tl')) { // chỉ thêm bước mới ở cuối (giữ animation, không nhấp nháy)
      if (keys.length > shown.length) { $('tl').insertAdjacentHTML('beforeend', steps.slice(shown.length).map((s, k) => RecordedActionItem(s, shown.length + k, st.startedAt, open.has(shown.length + k), true)).join('')); $('tl').scrollTop = $('tl').scrollHeight; }
    } else box.innerHTML = RecordingTimeline(steps, { startedAt: st.startedAt, open });
    shown = keys;
    $('rhint').textContent = st.recording ? `${steps.length} thao tác` : '';
    const key = JSON.stringify(st.insights ?? null) + st.recording;
    if (key !== insKey) { insKey = key; $('rins').innerHTML = AILiveInsights(st.insights, { live: st.recording }); }
  }

  await loadReview(); paint();
  const tick = async () => {
    try {
      const was = st; const prev = mode();
      st = await api.get('/api/rec/status'); state.rec = st;
      if (st.credSaved && !credToast) { credToast = true; toast(`Đã nhớ tài khoản ${st.credUser} cho các lần quay và chạy lại sau.`); api.get('/api/env').then((e) => { state.env = e; }).catch(() => undefined); }
      if (was.recording && !st.recording && st.lastId) { reviewId = st.lastId; sessionStorage.setItem('lastRec', reviewId); await loadReview(); toast('Bản quay đã dừng (cửa sổ Chrome đã đóng) và được lưu.'); }
      if (prev !== mode()) paint(); else if (document.activeElement?.id !== 'rnote') paintDynamic(); else { $('rtimer').textContent = clock(st.sec); $('rcount').textContent = st.count; }
    } catch { /* mất kết nối tạm thời */ }
  };
  timer = setInterval(tick, 1000); onLeave(() => clearInterval(timer));

  onAct({
    'toggle-ev': (el) => { const i = Number(el.dataset.i); if (open.has(i)) open.delete(i); else open.add(i); if (mode() === 'review') paint(); else { shown = []; paintDynamic(); } },
    start: async () => {
      const name = $('rname').value.trim() || 'Luồng ghi lại'; const url = $('rurl').value.trim();
      try { sessionStorage.removeItem('lastRec'); reviewId = ''; review = null; credToast = false; const started = await api.post('/api/rec/start', { name, ...(url ? { url } : {}), relogin: !!$('rrelogin')?.checked }); st = await api.get('/api/rec/status'); state.rec = st; shown = []; insKey = ''; paint(); if (started.loginError) toast('Chưa tự đăng nhập được: ' + started.loginError + '. Hãy đăng nhập tay trong Chrome rồi thao tác tiếp.', true); }
      catch (e) { fail(e); }
    },
    pause: async () => { await api.post('/api/rec/pause', {}); await tick(); paint(); },
    resume: async () => { await api.post('/api/rec/resume', {}); await tick(); paint(); },
    stop: async () => {
      try { const r = await api.post('/api/rec/stop', {}); reviewId = r.id; sessionStorage.setItem('lastRec', r.id); st = { recording: false }; state.rec = st; await loadReview(); paint(); toast('Đã lưu recording — xem lại trước khi phân tích.'); }
      catch (e) { fail(e); }
    },
    analyze: () => navigate(`/analysis/${encodeURIComponent(reviewId)}`),
    'save-rec': async () => {
      try {
        const a = await api.post('/api/rec/analyze', { id: reviewId });
        const r = await api.post('/api/flows/save', { recId: reviewId, mode: 'new', name: a.name, cases: a.derived.map((c, i) => (c.executable ? i : -1)).filter((i) => i >= 0) });
        toast('Đã lưu thành Test Flow.'); navigate(`/flows/${r.flowId}`);
      } catch (e) { fail(e); }
    },
  });
  root.addEventListener('keydown', async (e) => {
    if (e.target.id === 'rnote' && e.key === 'Enter' && e.target.value.trim()) { try { await api.post('/api/rec/note', { text: e.target.value }); e.target.value = ''; toast('Đã thêm ghi chú'); } catch (x) { fail(x); } }
  });
}

// ======================= Analysis =======================
export async function analysisView(root) {
  const { id } = parseHash(); const recId = decodeURIComponent(id ?? '');
  if (!recId) { navigate('/record'); return; }
  let rec = null, a = null, tab = 'flow';
  const picked = new Set();
  let stages = [{ label: 'Đang tái dựng quy trình', state: 'running' }, { label: 'Đang xác định các trường dữ liệu', state: 'pending' }, { label: 'Đang phân tích quy tắc nghiệp vụ', state: 'pending' }, { label: 'Đang đề xuất test case', state: 'pending' }, { label: 'Hoàn tất phân tích', state: 'pending' }];
  const set = (i, s) => { stages[i].state = s; paint(); };
  let phase = 'loading'; // loading | analyzing | done

  const rules = () => a?.facts ?? [];
  const cases = () => a?.derived ?? [];

  function paint() {
    if (!rec) { root.innerHTML = `<div class="card card-b"><div class="skeleton" style="width:40%"></div><div class="skeleton" style="margin-top:10px;width:70%"></div></div>`; return; }
    const done = phase === 'done';
    const body = tab === 'flow' ? BusinessFlowStepper(a?.groups, a?.steps ?? [], { machine: true })
      : tab === 'rules' ? (rules().length ? rules().map((r) => RuleCard(r)).join('') : '<div class="empty"><h3>Chưa có quy tắc</h3></div>')
        : tab === 'cases' ? TestCaseTable(cases(), { selectable: true, selected: picked, stepCount: rec.steps.length })
          : EvidenceViewer(rec.steps, recId);
    root.innerHTML = `<div class="page-head"><div><h1>${esc(rec.name)}</h1>${meta(done ? 'Phân tích hoàn tất' : 'Đang phân tích', `${rec.steps.length} thao tác`, dt(rec.startedAt))}</div>
      <span class="sp row"><button class="btn" data-act="try" ${done ? '' : 'disabled'}>${icon('play', 14)}Chạy thử</button><button class="btn primary" data-act="save" ${done ? '' : 'disabled'}>${icon('check', 14)}Lưu thành Test Flow</button></span></div>
      ${phase !== 'done' ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><h2>Đang phân tích</h2><span class="sp small mute">trạng thái phản ánh việc backend đã xử lý xong từng phần</span></div><div class="card-b">${AnalysisProgress(stages)}</div></div>` : ''}
      <div class="tabs">${[['flow', 'Business Flow', a?.groups?.length ?? 0], ['rules', 'Discovered Rules', rules().length], ['cases', 'Suggested Test Cases', cases().length], ['evidence', 'Evidence', rec.steps.filter((s) => s.shot).length]].map(([k, l, n]) => `<button class="${tab === k ? 'active' : ''}" data-act="tab" data-k="${k}">${l}<span class="n">${n}</span></button>`).join('')}</div>
      <div class="card">${tab === 'rules' ? '<div class="card-b small mute" style="border-bottom:1px solid var(--line-soft)">Mức tin cậy là trạng thái xác minh, không phải xác suất: <b>Observed</b> là máy thấy trực tiếp; <b>Inferred</b> là AI suy luận; <b>Needs verification</b> là chưa đủ bằng chứng. Xác nhận quy tắc sau khi lưu Test Flow.</div>' : ''}${body}${tab === 'cases' ? `<div class="card-b small mute">Đã chọn ${picked.size}/${cases().length} test case để lưu vào thư viện. Test case “Needs review” chưa tự chạy được.</div>` : ''}</div>`;
  }

  paint();
  try {
    rec = await api.get('/api/rec?id=' + encodeURIComponent(recId)); stages[0].state = 'done'; stages[1].state = 'running'; paint();
    a = await api.get('/api/rec/analysis?id=' + encodeURIComponent(recId)); stages[1].state = 'done';
    cases().forEach((c, i) => { if (c.executable) picked.add(i); });
    phase = 'done';
    stages.forEach((s) => (s.state = 'done')); paint();
  } catch (e) { root.innerHTML = `<div class="callout bad">${icon('circleX', 18)}<div>${esc(e.message)}</div></div>`; return; }

  async function save(thenRun) {
    const similar = a.similar ?? [];
    const body = `<label class="field">Tên Test Flow<input id="sv-name" value="${esc(a.name)}"/></label>
      ${similar.length ? `<div class="col"><div class="small mute">Đã có flow tương tự — dùng lại để không tạo trùng:</div>${similar.map((s, i) => `<label class="row small"><input type="radio" name="sv-mode" value="version:${s.id}" ${i === 0 ? 'checked' : ''}/> Thêm phiên bản đề xuất vào «${esc(s.name)}» <span class="mute">(${esc(s.reason)})</span></label>`).join('')}<label class="row small"><input type="radio" name="sv-mode" value="new"/> Tạo Test Flow mới</label></div>` : '<input type="hidden" name="sv-mode" value="new" checked/>'}
      <div class="small mute">Sẽ lưu ${picked.size} test case đã chọn.${thenRun ? ' Sau đó chạy thử ngay.' : ''}</div>`;
    let result = null;
    const ok = await modal({ title: thenRun ? 'Lưu & chạy thử' : 'Lưu thành Test Flow', body, ok: thenRun ? 'Lưu & chạy' : 'Lưu',
      onOk: async (ov) => {
        const v = ov.querySelector('input[name=sv-mode]:checked, input[type=hidden][name=sv-mode]')?.value ?? 'new';
        const payload = v === 'new' ? { mode: 'new', name: ov.querySelector('#sv-name').value } : { mode: 'version', flowId: Number(v.split(':')[1]) };
        result = await api.post('/api/flows/save', { recId, ...payload, cases: [...picked] });
      } });
    if (!ok || !result) return;
    toast(result.proposed ? `Đã thêm phiên bản v${result.version} (đề xuất) — chờ bạn chấp nhận.` : 'Đã lưu Test Flow.');
    if (thenRun && !result.proposed) startReplay(result.flowId); else navigate(`/flows/${result.flowId}`);
  }
  onAct({
    tab: (el) => { tab = el.dataset.k; paint(); }, save: () => save(false), try: () => save(true),
    'pick-case': (el) => { const i = Number(el.dataset.i); if (el.checked) picked.add(i); else picked.delete(i); paint(); },
    'goto-evidence': (el) => { tab = 'evidence'; paint(); document.getElementById('evi-' + el.dataset.i)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
  });
}
