// Luồng có sẵn: các kịch bản đã viết sẵn (YCTD, kế hoạch/PATD, luồng đầy đủ), điền form từ link và dọn dữ liệu test.
import { api } from './api.js';
import { badge, dt, esc } from './components.js';
import { fail, modal, onAct, onLeave, toast } from './core.js';
import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);
const JOB_BADGE = { running: ['Running', 'Đang chạy'], passed: ['Passed', 'Đạt'], failed: ['Failed', 'Lỗi'], stopped: ['Blocked', 'Đã dừng'] };

/** Danh sách bước: bước mong đợi (từ spec) ghép với tiến độ thực tế đang chạy. */
function stepList(steps, expected) {
  const byTitle = new Map((steps ?? []).map((s) => [s.title, s]));
  const rows = (expected?.length ? expected : (steps ?? []).map((s) => s.title)).map((t) => ({ t, s: byTitle.get(t) }));
  if (!rows.length) return '';
  const ic = { ok: icon('circleCheck', 17), fail: icon('circleX', 17), running: '<span class="spin"></span>', skipped: icon('info', 17), pending: '<span class="dot"></span>' };
  return `<ul class="run-steps">${rows.map(({ t, s }) => { const st = s?.status ?? 'pending'; return `<li class="${st === 'ok' ? 'Passed' : st === 'fail' ? 'Failed' : st === 'skipped' ? 'Skipped' : ''}"><span class="mk">${ic[st] ?? ic.pending}</span><div style="${st === 'pending' ? 'color:var(--mute)' : 'color:var(--ink)'}">${esc(t)}</div><span class="mute small">${s?.ms != null ? (s.ms / 1000).toFixed(1) + 's' : ''}</span></li>`; }).join('')}</ul>`;
}

function jobPanel(j) {
  if (!j) return `<div class="card"><div class="empty">${icon('play', 28)}<h3>Chưa chạy gì</h3><div class="small">Bấm Chạy ở một luồng bên trái. Tiến trình từng bước hiện ở đây.</div></div></div>`;
  const [bs, bt] = JOB_BADGE[j.status] ?? ['Skipped', j.status];
  const branchTests = (j.tests ?? []).filter((t) => !(j.expected ?? []).length || /^(tạo →|duyệt|từ chối|huỷ|đã huỷ)/.test(t.title)).filter((t) => !t.title.startsWith('Luồng tuyển dụng'));
  const err = j.status === 'failed' ? (j.log.match(/(?:Error|expect\(|Expected|Received|Timeout)[^\n]*(?:\n[^\n]*){0,6}/) || [''])[0] : '';
  return `<div class="card"><div class="card-b"><div class="row wrap"><h2>${esc(j.ten)}</h2>${badge(bs, bt)}${j.status === 'running' ? `<button class="btn sm danger sp" data-act="stop">${icon('stop', 12)}Dừng</button>` : ''}</div>
      <div class="meta" style="margin-top:6px"><span>${dt(new Date(j.started).toISOString())}</span><span>${j.durationSec} giây</span>${j.exit != null ? `<span>mã thoát ${j.exit}</span>` : ''}</div>
      ${j.resume ? `<div class="callout warn" style="margin-top:12px">${icon('alert', 18)}<div class="grow">${esc(j.resume.label)}. Các bước đã xong được bỏ qua.</div><button class="btn sm primary" data-act="resume">Chạy tiếp từ bước lỗi</button></div>` : ''}</div>
    ${stepList(j.steps, j.expected)}${branchTests.length || j.expectedBranches?.length ? `<div class="card-b" style="border-top:1px solid var(--line-soft)"><b>Các nhánh</b>${stepList(branchTests, j.expectedBranches)}</div>` : ''}
    <div class="card-b">${j.summary ? `<p style="margin:0 0 8px"><b>${esc(j.summary)}</b></p>` : ''}
      ${j.created?.length ? `<div class="small"><b>Dữ liệu vừa tạo (${j.created.length}):</b><ul style="margin:4px 0 0;padding-left:18px">${j.created.map((c) => `<li>${esc(c.flow)}: ${esc(c.code || '')} ${esc(c.title)}</li>`).join('')}</ul><div class="mute" style="margin-top:6px">Đã ghi vào registry; bấm “Dọn dữ liệu test” khi không cần nữa.</div></div>` : ''}
      ${err ? `<div class="callout bad" style="margin-top:8px"><pre style="margin:0;white-space:pre-wrap;font:12px/1.5 var(--mono)">${esc(err)}</pre></div>` : ''}
      <details style="margin-top:10px"><summary class="small mute" style="cursor:pointer">Log chi tiết</summary><pre id="logbox" style="max-height:320px;overflow:auto;background:var(--night);color:#cfd6e4;padding:12px;border-radius:6px;font:12px/1.5 var(--mono);white-space:pre-wrap">${esc(j.log)}</pre></details></div></div>`;
}

export async function builtinView(root) {
  const fl = await api.get('/api/flows');
  let jobId = fl.running?.id ?? null; let poll = null; let running = !!fl.running; let registry = fl.registry;
  const groups = {};
  fl.flows.forEach((f) => (groups[f.nhom] ??= []).push(f));

  root.innerHTML = `<div class="page-head"><div><h1>Built-in Flows</h1><p>Các kịch bản đã viết sẵn cho YCTD, kế hoạch tuyển dụng (PATD) và bổ sung thông tin (BSTT). Dữ liệu tạo ra đều mang tiền tố test và chỉ gửi mail về hộp thư QA.</p></div></div>
    <div class="tabs"><button data-act="tab" data-t="yctd">YCTD</button><button data-act="tab" data-t="patd">PATD</button><button data-act="tab" data-t="bstt">BSTT</button></div>
    <div class="split" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div class="col" style="gap:16px">
      <div class="col" style="gap:16px" id="tabBody"></div>
      <div class="card"><div class="card-h"><h2>Dữ liệu test</h2></div><div class="card-b row wrap"><span class="small mute grow" id="regInfo"></span><button class="btn danger" data-act="cleanup" data-run>Dọn dữ liệu test</button></div></div>
    </div><div style="position:sticky;top:76px;align-self:start" id="jobBox"></div></div>`;

  const setRunning = (r) => { running = r; root.querySelectorAll('[data-run]').forEach((b) => { b.disabled = r; }); };
  const TABS = {
    yctd: () => `
      ${Object.entries(groups).filter(([g]) => !/Luồng đầy đủ/.test(g)).map(([g, fs]) => `<div class="card"><div class="card-h"><h2>${esc(g)}</h2></div><div class="card-b small mute" style="padding-bottom:0">${esc(fs[0].tao)}</div>
        <div>${fs.map((f) => `<div class="pick" style="cursor:default"><span class="grow" style="color:var(--ink)">${esc(f.title)}</span><span class="mute small">${esc(f.uoc)}</span><button class="btn sm" data-act="run" data-id="${esc(f.id)}" data-run>${icon('play', 12)}Chạy</button></div>`).join('')}</div></div>`).join('')}
    `,
    patd: () => `
      <div class="card"><div class="card-h"><h2>${esc(fl.full.ten)}</h2><span class="sp mute small">${esc(fl.full.uoc)}</span></div><div class="card-b col">
        <div class="small">${esc(fl.full.mo_ta)}</div><div class="small mute">${esc(fl.full.tao)}</div>
        ${fl.full.steps.length ? `<details><summary class="small mute" style="cursor:pointer">${fl.full.steps.length} bước</summary>${stepList([], fl.full.steps)}</details>` : ''}
        <div class="row wrap"><button class="btn primary lg" data-act="run" data-id="full" data-run>${icon('play', 15)}Chạy luồng đầy đủ</button>${fl.full.branches.length ? `<label class="row small" style="gap:6px"><input type="checkbox" id="branches"/> Kèm các nhánh (${fl.full.branches.length})</label>` : ''}</div></div></div>
    `,
    bstt: () => `
      <div class="card"><div class="card-h"><h2>Điền form Bổ sung thông tin từ link</h2></div><div class="card-b col">
        <div class="small mute">Dán link form ứng viên nhận được (dạng …/extra-info/&lt;mã&gt;). Hệ thống mở link rồi điền đủ các mục và chứng từ bằng dữ liệu giả lập giống thật.</div>
        <input id="portalUrl" placeholder="https://tuyendung-….stg.….vn/extra-info/…"/>
        <label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" id="portalSubmit" style="margin-top:3px"/><span>Tự bấm “Xác nhận gửi” sau khi điền. Không tích thì dừng lại để bạn kiểm tra và tự gửi.</span></label>
        <div class="callout warn">${icon('alert', 18)}<div class="small">Chỉ dùng link của ứng viên test. Form sẽ được điền bằng dữ liệu giả lập; đừng dán link của ứng viên thật.</div></div>
        <div><button class="btn primary lg" data-act="portal-fill" data-run>${icon('play', 15)}Mở link và điền</button></div></div></div>
    `,
  };
  let tab = 'yctd'; try { tab = localStorage.getItem('builtinTab') || 'yctd'; } catch { /* bỏ qua */ }
  const showTab = (t) => {
    if (!TABS[t]) t = 'yctd';
    tab = t; try { localStorage.setItem('builtinTab', t); } catch { /* bỏ qua */ }
    $('tabBody').innerHTML = TABS[t]();
    root.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.t === t));
    setRunning(running);
  };
  const regInfo = () => { $('regInfo').textContent = registry ? `Đang có ${registry} bản ghi test chưa dọn.` : 'Chưa có dữ liệu test cần dọn (nút vẫn dọn thông báo rác).'; };
  async function watch(id) {
    jobId = id; clearInterval(poll);
    const tick = async () => {
      try {
        const j = await api.get('/api/job?id=' + id);
        const open = document.querySelector('#jobBox details')?.open;
        $('jobBox').innerHTML = jobPanel(j);
        if (open) { const d = document.querySelector('#jobBox details'); d.open = true; const b = $('logbox'); if (b) b.scrollTop = b.scrollHeight; }
        setRunning(j.status === 'running');
        if (j.status !== 'running') { clearInterval(poll); api.get('/api/flows').then((r) => { registry = r.registry; regInfo(); }); }
      } catch (e) { clearInterval(poll); }
    };
    await tick(); poll = setInterval(tick, 1500);
  }
  onLeave(() => clearInterval(poll));
  const start = async (fn) => { try { const j = await fn(); watch(j.id); } catch (e) { fail(e); } };

  regInfo(); $('jobBox').innerHTML = jobPanel(null); showTab(tab);
  if (jobId) watch(jobId);

  onAct({
    tab: (el) => showTab(el.dataset.t),
    run: (el) => start(() => api.post('/api/run', { id: el.dataset.id, headed: true, branches: !!$('branches')?.checked })),
    'portal-fill': () => {
      const url = $('portalUrl').value.trim();
      if (!/extra-info\//.test(url)) { toast('Dán đúng link form Bổ sung thông tin (có /extra-info/<mã>).', true); return; }
      start(() => api.post('/api/portal/fill', { url, submit: $('portalSubmit').checked }));
    },
    cleanup: async () => {
      if (!(await modal({ title: 'Dọn dữ liệu test?', danger: true, ok: 'Dọn dữ liệu', body: '<div class="small">Xoá mềm kế hoạch, YCTD, mail test trong registry và xoá thông báo (chuông) rác của tài khoản QA trong DB. Talent / hồ sơ không xoá được.</div>' }))) return;
      start(() => api.post('/api/cleanup', {}));
    },
    stop: async () => { try { await api.post('/api/stop', { id: jobId }); } catch (e) { fail(e); } },
    resume: () => start(() => api.post('/api/proc/resume', { id: jobId, headed: true })),
  });
}
