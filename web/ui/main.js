// Khởi động ứng dụng: khung (sidebar + topbar), định tuyến theo hash, nạp màn hình.
import { api, MOCK } from './api.js';
import { AppSidebar, AppTopbar, esc } from './components.js';
import { navigate, parseHash, resetView, state } from './core.js';
import { getLang, setLang, tr, watchTranslations } from './i18n.js';
import { icon } from './icons.js';
import { analysisView, recordView } from './view-record.js';
import { flowDetailView, flowsView, runDetailView, runsView } from './view-library.js';
import { builtinView } from './view-builtin.js';
import { overviewView, settingsView } from './view-misc.js';

state.mock = MOCK;
document.getElementById('app').innerHTML = `<div class="app"><div id="side"></div><div class="main"><div id="top"></div><main class="content" id="view"></main></div></div><div class="toasts" id="toasts"></div>`;

const CRUMB = { overview: 'Overview', record: 'Record & Learn', analysis: 'Analysis', flows: 'Test Flows', builtin: 'Built-in Flows', runs: 'Test Runs', settings: 'Settings' };
// Menu trái chỉ 3 mục chính; các trang còn lại là tab con của nhóm tương ứng.
const GROUPS = { overview: ['overview', 'settings'], flows: ['flows', 'builtin', 'runs'] };
const ACTIVE = { analysis: 'record', settings: 'overview', builtin: 'flows', runs: 'flows' };
const subTabs = (name) => { const g = GROUPS[ACTIVE[name] ?? name]; return g ? `<div class="tabs">${g.map((k) => `<a class="${k === (name === 'analysis' ? 'record' : name) ? 'active' : ''}" href="#/${k === 'overview' ? '' : k}">${CRUMB[k]}</a>`).join('')}</div>` : ''; };

function crumbs(r) {
  const base = [{ label: 'AI Testing Agent', href: '#/' }];
  if (r.name === 'overview') return [...base, { label: 'Overview' }];
  if (r.name === 'analysis') return [...base, { label: 'Record & Learn', href: '#/record' }, { label: 'Analysis' }];
  if (r.id && (r.name === 'flows' || r.name === 'runs')) return [...base, { label: CRUMB[r.name], href: `#/${r.name}` }, { label: r.name === 'flows' ? `Flow #${r.id}` : `Run ${r.id}` }];
  return [...base, { label: CRUMB[r.name] ?? r.name }];
}
function chrome() {
  const r = parseHash();
  document.getElementById('side').innerHTML = AppSidebar({ active: ACTIVE[r.name] ?? r.name, env: state.env, rec: state.rec });
  document.getElementById('top').innerHTML = AppTopbar({ crumbs: crumbs(r), env: state.env, rec: state.rec, mock: MOCK });
  document.title = tr(`${CRUMB[r.name] ?? 'AI Testing Agent'}`) + ' · AI Testing Agent';
}

const VIEWS = {
  overview: overviewView, builtin: builtinView, record: recordView, analysis: analysisView, settings: settingsView,
  flows: (el) => (parseHash().id ? flowDetailView(el) : flowsView(el)), runs: (el) => (parseHash().id ? runDetailView(el) : runsView(el)),
};

async function render() {
  resetView(); chrome();
  const el = document.getElementById('view'); const r = parseHash();
  el.innerHTML = '<div class="card card-b"><div class="skeleton" style="width:30%"></div><div class="skeleton" style="margin-top:10px;width:60%"></div></div>';
  window.scrollTo(0, 0);
  try { await (VIEWS[r.name] ?? overviewView)(el); el.insertAdjacentHTML('afterbegin', subTabs(r.name)); }
  catch (e) { el.innerHTML = `<div class="callout bad">${icon('circleX', 18)}<div><b>Không tải được màn hình.</b> ${esc(e.message)}<div class="small" style="margin-top:4px">Kiểm tra web server (<span class="mono">npm run web</span>) còn chạy không.</div></div></div>`; }
}

// Trạng thái browser/recording cho sidebar + topbar: chỉ vẽ lại phần khung khi trạng thái đổi.
let railKey = '';
async function pollRail() {
  try {
    const st = await api.get('/api/rec/status'); state.rec = st;
    const key = `${st.recording}|${st.paused}`; if (key !== railKey) { railKey = key; chrome(); }
  } catch { /* mất kết nối tạm thời */ }
}
document.addEventListener('keydown', (e) => { if (e.target.id === 'gsearch' && e.key === 'Enter') navigate(`/flows?q=${encodeURIComponent(e.target.value)}`); });
window.addEventListener('hashchange', render);
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b || b.dataset.lang === getLang()) return;
  setLang(b.dataset.lang); render(); // vẽ lại màn hình hiện tại để áp dụng ngôn ngữ mới
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-theme-toggle]')) return;
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* chế độ riêng tư */ }
  chrome();
});

watchTranslations(document.body);
try { state.env = await api.get('/api/env'); } catch { /* hiển thị khung dù chưa có thông tin môi trường */ }
await pollRail(); setInterval(pollRail, 3000);
await render();
