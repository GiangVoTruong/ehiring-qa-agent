// Mã chạy TRONG TRANG (chuyển thành chuỗi rồi chèn bằng addInitScript) — dùng chung cho quay và chạy lại.
// Phải tự đủ: không dùng import/biến ngoài hàm. Gắn vào window.__qaLib.
export function makeLib() {
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const short = (t, n = 70) => clean(t).slice(0, n);
  const CLICKABLE = 'button,a,[role=button],[role=menuitem],[role=tab],[role=option],[role=checkbox],[role=radio],[role=switch],li,label,.ant-select,.ant-picker,.btn_approval,.btn-action,summary,.ant-menu-submenu-title,nz-option-item,.ant-select-item,.ant-dropdown-menu-item,.ant-menu-item,.ant-tabs-tab,.ant-radio-wrapper,.ant-checkbox-wrapper';
  const INPUTS = 'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=password]):not([type=hidden]),textarea,select';
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const fieldLabel = (el) => {
    const blk = el.closest('div[ehiringnoderefvar]');
    const fromForm = blk && short(blk.querySelector('ehiring-section span span')?.textContent);
    if (fromForm) return fromForm;
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return short(l.textContent); }
    const wrap = el.closest('label'); if (wrap) return short(wrap.textContent);
    const by = el.getAttribute('aria-labelledby'); if (by) { const l = document.getElementById(by.split(' ')[0]); if (l) return short(l.textContent); }
    return short(el.getAttribute('aria-label') || el.placeholder || el.name || '');
  };
  const blockLabel = (el) => short(el.closest('div[ehiringnoderefvar]')?.querySelector('ehiring-section span span')?.textContent);
  const ctxOf = (el) => short(el.closest('.ant-modal')?.querySelector('.ant-modal-title')?.textContent || el.closest('[role=dialog]')?.querySelector('h1,h2,h3,[class*=title]')?.textContent || '', 50);
  const cssPath = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 8; n = n.parentElement) {
      if (n.id && !/\d{3,}|^(ng|cdk|ant)-|:r/.test(n.id)) { parts.unshift('#' + CSS.escape(n.id)); break; }
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      parts.unshift(n.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(n) + 1})` : ''));
    }
    return parts.join(' > ');
  };
  const checkable = (el) => (el.matches('input,textarea') ? el : el.querySelector?.('input[type=checkbox],input[type=radio]'));
  const clickText = (el) => { const inp = checkable(el); return (inp && /checkbox|radio/.test(inp.type) && fieldLabel(inp)) || short(el.innerText || el.value || el.getAttribute('aria-label') || el.title || ''); };
  const scopeOf = (ctx) => {
    if (!ctx) return document;
    const boxes = [...document.querySelectorAll('.ant-modal, [role=dialog]')].filter(visible);
    return boxes.reverse().find((b) => short(b.textContent).includes(ctx)) || document;
  };
  const sameText = (list, text) => list.filter((e) => clickText(e) === text);

  // Menu trái thu gọn: mục con chỉ hiện (ở lớp phủ) khi di chuột vào biểu tượng nhóm → nhớ nhóm vừa hover để biết mục con thuộc nhóm nào.
  let grp = { name: '', t: 0 };
  document.addEventListener('mouseover', (ev) => {
    const t = ev.target instanceof Element && ev.target.closest('nz-sider .ant-menu-submenu-title');
    if (t) grp = { name: short(t.textContent, 40), t: Date.now() };
  }, true);
  const groupOf = (el) => {
    const inline = el.closest('li.ant-menu-submenu')?.querySelector(':scope > .ant-menu-submenu-title');
    if (inline && !el.matches('.ant-menu-submenu-title')) return short(inline.textContent, 40);
    return el.closest('.ant-menu-submenu-popup') && Date.now() - grp.t < 30000 ? grp.name : '';
  };

  // Chọn DỮ LIỆU (mục trong danh sách thả xuống / danh sách chọn ứng viên…): khác với bấm nút cố định. Nhớ ô chọn vừa mở để biết dữ liệu thuộc trường nào.
  const LIST_BOX = 'cdk-virtual-scroll-viewport, .ant-select-dropdown, nz-option-container, [role=listbox]';
  let lastSel = '';
  const isDataChoice = (el) => !!el.closest(LIST_BOX) || el.matches('nz-option-item, .ant-select-item, .ant-select-item-option, [role=option]');

  /** Mô tả phần tử vừa bấm (lúc quay). */
  const describeClick = (raw) => {
    const el = raw.closest(CLICKABLE) || raw;
    const inp = checkable(el);
    const text = clickText(el);
    if (el.closest('.ant-select') && !isDataChoice(el)) lastSel = blockLabel(el) || text;
    const peers = sameText([...(scopeOf(ctxOf(el))).querySelectorAll(CLICKABLE)].filter(visible), text);
    return {
      menu: !!el.closest('nz-sider, .ant-menu, .ant-menu-submenu-popup'), menuGroup: groupOf(el), menuToggle: !!el.closest('.trigger-button'), siderCollapsed: !!document.querySelector('nz-sider.ant-layout-sider-collapsed'),
      dataChoice: isDataChoice(el), dataField: isDataChoice(el) ? lastSel : '',
      testid: el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy') || '', aria: short(el.getAttribute('aria-label') || el.title || ''),
      tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', text, input: inp ? (inp.type || '') : '',
      isTextInput: raw.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea') && !raw.closest('.ant-select, .ant-picker'),
      field: raw.matches('input,textarea') && !raw.closest('.ant-select, .ant-picker') ? fieldLabel(raw) : blockLabel(el), sel: cssPath(el), nth: Math.max(0, peers.indexOf(el)), _el: el,
    };
  };
  const describeInput = (el) => {
    const f = fieldLabel(el);
    const peers = [...document.querySelectorAll(el.type === 'file' ? 'input[type=file]' : INPUTS)].filter((e) => e.type === 'file' || visible(e)).filter((e) => fieldLabel(e) === f);
    return { field: f, sel: cssPath(el), nth: Math.max(0, peers.indexOf(el)) };
  };

  /** Tìm lại phần tử khi chạy lại: data-testid → chữ (trong hộp thoại rồi cả trang) → aria-label → nhãn trường → đường dẫn CSS (cuối cùng). */
  let lastHow = '';
  const found = (el, how) => { lastHow = how; return el; };
  const resolve = (s) => {
    lastHow = '';
    if (s.type === 'click') {
      try { if (s.testid) { const e = [...document.querySelectorAll(`[data-testid="${CSS.escape(s.testid)}"],[data-test="${CSS.escape(s.testid)}"],[data-cy="${CSS.escape(s.testid)}"]`)].filter(visible)[0]; if (e) return found(e, 'testid'); } } catch { /* testid lạ */ }
      if (s.text) {
        const all = (root) => sameText([...root.querySelectorAll(CLICKABLE)].filter(visible), s.text);
        const m = all(scopeOf(s.ctx));
        const hit = m[s.nth || 0] || m[0] || all(document)[s.nth || 0] || all(document)[0];
        if (hit) return found(hit, 'text');
      }
      if (s.aria) { const e = [...document.querySelectorAll('[aria-label],[title]')].filter((x) => visible(x) && short(x.getAttribute('aria-label') || x.title) === s.aria)[s.nth || 0]; if (e) return found(e, 'aria'); }
      if (s.field) {
        // Ô chọn không còn chữ cũ (đã có giá trị khác): tìm theo nhãn trường trong form động.
        const blocks = [...document.querySelectorAll('div[ehiringnoderefvar]')].filter((b) => visible(b) && short(b.querySelector('ehiring-section span span')?.textContent) === s.field);
        const t = (blocks[s.nth || 0] || blocks[0])?.querySelector('.ant-select, [role=combobox], .ant-picker, input, textarea');
        if (t) return found(t, 'field');
      }
    } else {
      const all = [...document.querySelectorAll(s.input === 'file' ? 'input[type=file]' : INPUTS)].filter((e) => e.type === 'file' || visible(e));
      const m = s.field ? all.filter((e) => fieldLabel(e) === s.field) : all;
      const hit = m[s.nth || 0] || m[0];
      if (hit) return found(hit, 'field');
    }
    try { const e = s.sel && document.querySelector(s.sel); if (e && (e.type === 'file' || visible(e))) return found(e, 'sel'); } catch { /* sel hỏng */ }
    return null;
  };

  // ---- Ảnh chụp trạng thái form: trường (nhãn, bắt buộc, khoá, đã có giá trị) + nút (khoá/mở). So sánh trước/sau mỗi thao tác = dữ kiện QUAN SÁT được. ----
  const REQ = /(^|\s)\*|\*\s*$|\(required\)|bắt buộc/i;
  const snapshot = () => {
    const boxes = [...document.querySelectorAll('.ant-modal, [role=dialog]')].filter(visible);
    const root = boxes[boxes.length - 1] || document.querySelector('main, router-outlet + *, .ant-layout-content') || document.body;
    const fields = [];
    const seen = new Set();
    for (const blk of [...root.querySelectorAll('div[ehiringnoderefvar]:not(:has(div[ehiringnoderefvar]))')].filter(visible).slice(0, 80)) {
      const label = short(blk.querySelector('ehiring-section span span')?.textContent);
      if (!label || seen.has(label)) continue; seen.add(label);
      const ctl = blk.querySelector('input,textarea,select,.ant-select,.ant-picker');
      const filled = !!(blk.querySelector('.ant-select-selection-item, .ant-picker-input input[value]:not([value=""])') || (ctl && ctl.value));
      fields.push({ label, kind: blk.querySelector('nz-select,.ant-select') ? 'select' : blk.querySelector('.ant-picker') ? 'date' : blk.querySelector('textarea') ? 'textarea' : 'text', required: REQ.test(label) || !!blk.querySelector('[class*=required]') || /bắt buộc|required/i.test(blk.textContent || ''), disabled: !!(ctl && (ctl.disabled || ctl.classList.contains('ant-select-disabled'))), filled });
    }
    const buttons = [...root.querySelectorAll('button')].filter(visible).slice(0, 25).map((b) => ({ text: short(b.innerText || b.getAttribute('aria-label') || '', 40), disabled: b.disabled || b.classList.contains('ant-btn-disabled') })).filter((b) => b.text);
    return { url: location.pathname, fields, buttons, errors: [...root.querySelectorAll('.ant-form-item-explain-error, [class*=error-msg], .text-danger')].filter(visible).map((e) => short(e.textContent, 80)).slice(0, 10) };
  };

  // ---- Thông báo (toast) thành công/lỗi ----
  const observeToasts = (cb) => {
    const handle = (n) => {
      if (!(n instanceof Element)) return;
      const box = n.matches('.ant-message-notice, .ant-notification-notice') ? n : n.querySelector?.('.ant-message-notice, .ant-notification-notice');
      if (!box) return;
      const cls = box.outerHTML.slice(0, 600);
      const kind = /error|close-circle/i.test(cls) ? 'error' : /success|check-circle/i.test(cls) ? 'success' : /warning|exclamation/i.test(cls) ? 'warning' : 'info';
      setTimeout(() => cb({ text: short(box.textContent, 160), kind }), 50);
    };
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(handle))).observe(document.documentElement, { childList: true, subtree: true });
  };

  const scrollName = (el) => (el === document.scrollingElement ? 'trang' : el.matches('cdk-virtual-scroll-viewport, .rc-virtual-list-holder') ? 'danh sách chọn' : el.closest('.ant-modal') ? 'hộp thoại' : short(el.getAttribute('class') || el.tagName.toLowerCase(), 30));
  const describeScroll = (el) => ({ sel: el === document.scrollingElement ? 'html' : cssPath(el), top: Math.round(el.scrollTop), cname: scrollName(el) });
  const scrollTo = (s) => {
    let el = null;
    try { el = s.sel === 'html' ? document.scrollingElement : document.querySelector(s.sel); } catch { /* sel hỏng */ }
    if (!el || (el !== document.scrollingElement && !visible(el))) el = [...document.querySelectorAll('cdk-virtual-scroll-viewport, .ant-modal-body')].filter(visible).pop() || null;
    if (!el) return false;
    el.scrollTo({ top: s.top, behavior: 'instant' }); return true;
  };
  // Danh sách chọn đang mở (lớp phủ hoặc trong hộp thoại)
  const openList = () => [...document.querySelectorAll('cdk-virtual-scroll-viewport, .ant-select-dropdown .rc-virtual-list-holder, .ant-select-dropdown')].filter(visible).pop() || null;
  const rowByText = (text) => {
    const box = openList(); if (!box) return null;
    const hits = [...box.querySelectorAll('*')].filter((e) => visible(e) && clean(e.innerText) === text);
    return hits[hits.length - 1] || null; // phần tử trong cùng khớp đúng chữ; bấm vào nó cũng là bấm cả dòng
  };
  const firstOption = () => {
    const box = openList(); if (!box) return null;
    const opts = [...box.querySelectorAll('nz-option-item, .ant-select-item-option, [role=option]')].filter(visible);
    return opts[0] || [...(box.querySelector('.cdk-virtual-scroll-content-wrapper')?.children || [])].filter(visible)[0] || null;
  };
  /** Cuộn danh sách chọn xuống một đoạn; trả false nếu đã hết. */
  const scrollListDown = () => {
    const box = openList(); if (!box) return false;
    const sc = box.matches('cdk-virtual-scroll-viewport, .rc-virtual-list-holder') ? box : box.querySelector('cdk-virtual-scroll-viewport, .rc-virtual-list-holder') || box;
    const before = sc.scrollTop; sc.scrollBy({ top: Math.max(120, sc.clientHeight * 0.8), behavior: 'instant' });
    return sc.scrollTop !== before;
  };
  return { snapshot, observeToasts, pathOf: cssPath, how: () => lastHow, describeScroll, scrollTo, rowByText, firstOption, scrollListDown, short, fieldLabel, ctxOf, describeClick, describeInput, resolve };
}
