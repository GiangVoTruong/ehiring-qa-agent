// AI cho lúc chạy lại: (1) tự tìm phần tử khi giao diện đổi (self-heal), (2) đưa giá trị hợp lệ cho ô nhập chưa có luật.
// Gọi thẳng Anthropic API bằng ANTHROPIC_API_KEY (không cần Claude Code, dùng được khi deploy). Không có key / QA_AI=0 / lỗi mạng → trả null và luồng chạy như cũ.
// Dữ liệu gửi đi: nhãn, placeholder, loại ô, chữ trên nút/menu, ảnh chụp trang (tắt bằng QA_AI_IMAGE=0). KHÔNG gửi giá trị người dùng đã nhập/đã quay (chỉ "hình dạng" kiểu Aaaa 999), mật khẩu hay token.
import type { Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { aiOn, ask as _ask } from '../web/ai-ask.mjs';
import type { Profile } from './fake-person';
import { fmtDate } from './fake-person';

export { aiOn };
type Block = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } };
const ask = _ask as (system: string, content: Block[], maxTokens?: number, timeoutMs?: number) => Promise<string | null>;

/** Lấy object JSON đầu tiên trong câu trả lời (model đôi khi rào code block). */
export function parseJson(text: string | null): any {
  const m = text?.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** "Hình dạng" của giá trị đã quay: chữ→a/A, số→9, giữ độ dài (tối đa 30). Không lộ nội dung thật. */
export const shapeOf = (v: string): string => v.slice(0, 30).replace(/\p{Lu}/gu, 'A').replace(/\p{Ll}/gu, 'a').replace(/\d/g, '9');

// ---------- (2) Giá trị cho ô nhập ----------
export interface FieldAsk { key: string; label: string; placeholder?: string | null; type?: string | null; maxlength?: number | null; shape?: string }
const valueCache = new Map<string, string>();

/** Hỏi model giá trị hợp lệ cho các ô nhập chưa có luật theo nhãn; một lần gọi cho cả lô. Trả { key: giá trị } (có thể thiếu key). */
export async function aiFieldValues(fields: FieldAsk[], p: Profile): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const todo = fields.filter((f) => { const c = valueCache.get(`${f.label}|${f.placeholder}|${f.type}`); if (c) out[f.key] = c; return !c; });
  if (!todo.length || !aiOn()) return out;
  const text = await ask(
    'Bạn điền form tuyển dụng tiếng Việt để KIỂM THỬ. Với mỗi ô, đưa một giá trị giả hợp lệ, giống thật, KHÔNG phải dữ liệu thật của ai. Nhất quán với hồ sơ giả đã cho. Email chỉ dùng @example.com. Ngày theo placeholder (mặc định dd/mm/yyyy). Tôn trọng maxlength và kiểu ô (number chỉ số). Một dòng, không xuống dòng. Chỉ trả JSON dạng {"values":{"<key>":"<giá trị>"}}.',
    [{ type: 'text', text: JSON.stringify({ hoSoGia: { hoTen: p.fullName, gioiTinh: p.gender, ngaySinh: fmtDate(p.birth), sdt: p.phone, email: p.email, cccd: p.cccd }, cacO: todo }) }],
  );
  const vals = parseJson(text)?.values ?? {};
  for (const f of todo) {
    const v = typeof vals[f.key] === 'string' ? vals[f.key].replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, f.maxlength || 200).trim() : '';
    if (v) { out[f.key] = v; valueCache.set(`${f.label}|${f.placeholder}|${f.type}`, v); }
  }
  return out;
}

// ---------- (1) Tự tìm phần tử (self-heal) ----------
interface Cand { cur?: boolean; i: number; tag: string; role: string; type: string; text: string; label: string; placeholder: string }

/** Gom phần tử tương tác đang hiện (đánh dấu data-qa-heal=i). Chỉ lấy chữ hiển thị/nhãn/placeholder, không lấy giá trị đã nhập. */
async function candidates(page: Page, inputOnly: boolean): Promise<Cand[]> {
  return page.evaluate((onlyInput) => {
    document.querySelectorAll('[data-qa-heal]').forEach((e) => e.removeAttribute('data-qa-heal'));
    const short = (t: string | null | undefined, n = 60) => (t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
    const vis = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const sel = onlyInput
      ? 'input:not([type=hidden]):not([type=password]),textarea,select,[role=textbox],[role=combobox],.ant-select,.ant-picker'
      : 'button,a[href],input:not([type=hidden]):not([type=password]),textarea,select,[role=button],[role=menuitem],[role=tab],[role=combobox],[role=checkbox],.ant-select,.ant-picker,li.ant-menu-item,[class*=btn],nz-option-item,.ant-select-item-option,[role=option],[role=menuitem]';
    const labelOf = (el: Element) => {
      const h = el as HTMLElement;
      const lab = h.id && document.querySelector('label[for="' + CSS.escape(h.id) + '"]');
      if (lab) return short(lab.textContent);
      if (h.getAttribute('aria-label')) return short(h.getAttribute('aria-label'));
      for (let n: Element | null = el, d = 0; n && n !== document.body && d < 4; n = n.parentElement, d++)
        for (let p = n.previousElementSibling; p; p = p.previousElementSibling) { const t = short(p.textContent); if (t && t.length < 60 && !p.querySelector('input,textarea,select,button')) return t; }
      return '';
    };
    const list: Cand[] = [];
    let i = 0;
    for (const el of [...document.querySelectorAll(sel)].filter(vis).slice(0, 150)) {
      el.setAttribute('data-qa-heal', String(i));
      const inp = el as HTMLInputElement;
      list.push({ cur: el.hasAttribute('data-qa-cur') || undefined, i: i++, tag: el.tagName.toLowerCase(), role: el.getAttribute('role') ?? '', type: inp.type ?? '', text: short((el as HTMLElement).innerText), label: labelOf(el), placeholder: short(inp.placeholder) });
    }
    return list;
  }, inputOnly);
}

export interface Healed { el: NonNullable<Awaited<ReturnType<Page['$']>>>; text: string; reason: string }

/**
 * Không tìm thấy phần tử đã quay (giao diện/nhãn đổi): đưa ảnh chụp + danh sách phần tử rút gọn cho model, hỏi cái nào khớp bước này.
 * `risky` là regex hành động nguy hiểm: không bao giờ chọn nút nguy hiểm thay cho nút đã quay (vd. «Save» → «Delete»).
 */
export async function aiPickElement(page: Page, step: { type: string; text?: string; field?: string; title: string }, risky: RegExp): Promise<Healed | null> {
  if (!aiOn()) return null;
  const list = await candidates(page, step.type === 'input' || step.type === 'file').catch(() => []);
  if (!list.length) return null;
  const content: Block[] = [];
  if (process.env.QA_AI_IMAGE !== '0' && process.env.ANTHROPIC_API_KEY) { // chế độ Claude Code chỉ nhận chữ, không gửi ảnh
    const shot = await page.screenshot({ type: 'jpeg', quality: 40 }).catch(() => null);
    if (shot) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: shot.toString('base64') } });
  }
  content.push({ type: 'text', text: JSON.stringify({ buocDaQuay: { loai: step.type, chu: step.text ?? '', truong: step.field ?? '', tenBuoc: step.title }, phanTuTrenTrang: list }) });
  const ans = parseJson(await ask(
    'Một bước kiểm thử đã quay không còn tìm thấy phần tử cũ vì giao diện hoặc nhãn đã đổi. Dựa vào ảnh chụp và danh sách phần tử, chọn phần tử có Ý NGHĨA khớp nhất với bước đã quay. Nếu không có phần tử nào chắc chắn là đúng thì trả index null — đừng đoán. Chỉ trả JSON {"index": số|null, "confidence": 0..1, "reason": "một câu tiếng Việt"}.',
    content, 300,
  ));
  const idx = ans?.index;
  console.log(`AI: xem ${list.length} phần tử cho «${step.text || step.title}» → ${ans ? `index=${ans.index}, chắc=${ans.confidence}, ${ans.reason ?? ''}` : 'không trả lời được'}`);
  if (typeof idx !== 'number' || !(ans.confidence >= 0.6)) return null;
  const pick = list.find((c) => c.i === idx);
  if (!pick) return null;
  const shown = `${pick.text} ${pick.label} ${pick.placeholder}`;
  if (risky.test(shown) && !risky.test(`${step.text ?? ''} ${step.title}`)) { console.log(`AI: bỏ qua phần tử nguy hiểm «${pick.text}».`); return null; }
  const el = await page.$(`[data-qa-heal="${idx}"]`);
  return el ? { el, text: (pick.text || pick.label || pick.placeholder).slice(0, 60), reason: String(ans.reason ?? '').slice(0, 200) } : null;
}

/**
 * Hệ thống ĐÃ tìm ra một phần tử nhưng bằng cách dò gần đúng (chữ gần giống, nhiều phần tử trùng chữ, đường dẫn CSS): nhờ AI xác nhận trước khi bấm.
 * Trả phần tử khác nếu AI chắc chắn (>= 0,7) rằng phần tử hiện tại sai; null = giữ phần tử hiện tại.
 */
export async function aiVerifyElement(page: Page, step: { type: string; text?: string; field?: string; title: string }, current: NonNullable<Awaited<ReturnType<Page['$']>>>, risky: RegExp): Promise<Healed | null> {
  if (!aiOn()) return null;
  await current.evaluate((e: Element) => { document.querySelectorAll('[data-qa-cur]').forEach((x) => x.removeAttribute('data-qa-cur')); e.setAttribute('data-qa-cur', '1'); }).catch(() => undefined);
  const list = await candidates(page, step.type === 'input' || step.type === 'file').catch(() => []);
  const curText = await current.evaluate((e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)).catch(() => '');
  await current.evaluate((e: Element) => e.removeAttribute('data-qa-cur')).catch(() => undefined);
  if (list.length < 2) return null;
  const content: Block[] = [];
  if (process.env.QA_AI_IMAGE !== '0' && process.env.ANTHROPIC_API_KEY) {
    const shot = await page.screenshot({ type: 'jpeg', quality: 40 }).catch(() => null);
    if (shot) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: shot.toString('base64') } });
  }
  content.push({ type: 'text', text: JSON.stringify({ buocDaQuay: { loai: step.type, chu: step.text ?? '', truong: step.field ?? '', tenBuoc: step.title }, phanTuHeThongDaChon: list.find((c) => c.cur)?.i ?? { khongCoTrongDanhSach: curText }, phanTuTrenTrang: list }) });
  const ans = parseJson(await ask(
    'Hệ thống kiểm thử đã chọn một phần tử để thực hiện bước đã quay nhưng chỉ dò gần đúng nên có thể SAI (nhiều phần tử trùng chữ, nhãn đổi). Xác nhận phần tử hệ thống đã chọn có đúng Ý NGHĨA của bước không. Nếu đúng hoặc không chắc: {"correct": true}. Chỉ khi chắc chắn là sai và có phần tử khác đúng hơn: {"correct": false, "index": số, "confidence": 0..1, "reason": "một câu tiếng Việt"}.',
    content, 300,
  ));
  if (!ans || ans.correct !== false || typeof ans.index !== 'number' || !(ans.confidence >= 0.7)) return null;
  const pick = list.find((c) => c.i === ans.index);
  if (!pick || pick.cur) return null;
  const shown = `${pick.text} ${pick.label} ${pick.placeholder}`;
  if (risky.test(shown) && !risky.test(`${step.text ?? ''} ${step.title}`)) { console.log(`AI: bỏ qua phần tử nguy hiểm «${pick.text}».`); return null; }
  const el = await page.$(`[data-qa-heal="${ans.index}"]`);
  return el ? { el, text: (pick.text || pick.label || pick.placeholder).slice(0, 60), reason: String(ans.reason ?? '').slice(0, 200) } : null;
}

// ---------- (3) Xử lý khi một bước không làm được: AI nhìn trang và thử cách khác ----------
let recoverCalls = 0;
export interface Recovery { done: boolean; skipped?: boolean; note: string; detail?: { action: string; text: string } }

/**
 * Bước đã quay không thực hiện được (lỗi `error`): đưa lỗi + ảnh (nếu có) + danh sách phần tử/mục đang hiện cho model, hỏi MỘT hành động tiếp theo để đạt cùng mục đích
 * (bấm phần tử khác, điền giá trị, chọn một mục trong danh sách đang mở, nhấn phím, cuộn) hoặc bỏ qua nếu bước không còn cần. Chạy hành động đó rồi trả kết quả.
 * Giới hạn số lần gọi mỗi lượt chạy (QA_AI_MAX_RECOVER, mặc định 12); không bao giờ bấm nút nguy hiểm (`risky`).
 */
export async function aiRecover(page: Page, step: { type: string; text?: string; field?: string; ctx?: string; title: string; recorded?: unknown }, error: string, risky: RegExp): Promise<Recovery | null> {
  if (!aiOn() || recoverCalls >= (Number(process.env.QA_AI_MAX_RECOVER) || 12)) return null;
  const list = await candidates(page, false).catch(() => []);
  if (!list.length) return null;
  recoverCalls++;
  const pageInfo = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('nz-modal-container, .ant-modal, [role=dialog]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).pop();
    return { url: location.pathname, dialog: ((dlg as HTMLElement | undefined)?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 300) };
  }).catch(() => ({ url: '', dialog: '' }));
  const content: Block[] = [];
  if (process.env.QA_AI_IMAGE !== '0' && process.env.ANTHROPIC_API_KEY) {
    const shot = await page.screenshot({ type: 'jpeg', quality: 40 }).catch(() => null);
    if (shot) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: shot.toString('base64') } });
  }
  content.push({ type: 'text', text: JSON.stringify({ buocDaQuay: { loai: step.type, chu: step.text ?? '', truong: step.field ?? '', hop: step.ctx ?? '', tenBuoc: step.title }, trangThaiLucQuay: step.recorded ?? null, loi: error, trang: pageInfo, phanTuTrenTrang: list }) });
  const ans = parseJson(await ask(
    'Một bước kiểm thử đã quay không làm được trên trang hiện tại. Dựa vào lỗi và danh sách phần tử (kể cả các mục của danh sách chọn đang mở), đề xuất MỘT hành động tiếp theo để đạt cùng MỤC ĐÍCH của bước, hoặc một cách khác đạt cùng mục đích. Nếu bước là chọn dữ liệu và danh sách có mục thì chọn một mục bất kỳ hợp lý. Hành động cho phép: {"action":"click","index":n} · {"action":"fill","index":n,"value":"..."} · {"action":"pick_option","index":n} · {"action":"press","key":"Enter|Escape|Tab|ArrowDown"} · {"action":"scroll","dy":n} · {"action":"skip"} (chỉ khi bước không còn cần, ví dụ đã đạt sẵn). Tuyệt đối không chọn nút xoá, gửi email, tạo nhân viên, đăng tin, chặn. Chỉ trả JSON {"action":...,"reason":"một câu tiếng Việt","confidence":0..1} cùng các trường của hành động.',
    content, 400,
  ));
  if (!ans?.action || !(ans.confidence >= 0.5)) { console.log(`AI xử lý lỗi: không đề xuất được (${ans?.reason ?? 'không trả lời'})`); return null; }
  const reason = String(ans.reason ?? '').slice(0, 160);
  const target = typeof ans.index === 'number' ? list.find((c) => c.i === ans.index) : undefined;
  const label = (target && (target.text || target.label || target.placeholder)) ? (target.text || target.label || target.placeholder).slice(0, 50) : '';
  if (target && risky.test(`${target.text} ${target.label} ${target.placeholder}`) && !risky.test(`${step.text ?? ''} ${step.title}`)) { console.log(`AI: bỏ qua phần tử nguy hiểm «${label}».`); return null; }
  try {
    const loc = () => page.locator(`[data-qa-heal="${ans.index}"]`).first();
    if (ans.action === 'skip') return { done: true, skipped: true, note: `AI cho rằng bước không còn cần: ${reason}` };
    if ((ans.action === 'click' || ans.action === 'pick_option') && target) { await loc().scrollIntoViewIfNeeded().catch(() => undefined); await loc().click({ timeout: 6000 }); }
    else if (ans.action === 'fill' && target && typeof ans.value === 'string') await loc().fill(ans.value.replace(/\s*[\r\n]+\s*/g, ' ').slice(0, 200), { timeout: 6000 });
    else if (ans.action === 'press' && ['Enter', 'Escape', 'Tab', 'ArrowDown'].includes(ans.key)) await page.keyboard.press(ans.key);
    else if (ans.action === 'scroll' && typeof ans.dy === 'number') await page.mouse.wheel(0, Math.max(-1500, Math.min(1500, ans.dy)));
    else return null;
  } catch (e) { console.log(`AI xử lý lỗi: thao tác đề xuất không chạy được (${String((e as Error).message).split('\n')[0]})`); return null; }
  const note = `AI ${ans.action}${label ? ` «${label}»` : ''}: ${reason}`;
  console.log(note);
  return { done: true, note, ...(label && ['click', 'pick_option'].includes(ans.action) ? { detail: { action: ans.action, text: label } } : {}) };
}
