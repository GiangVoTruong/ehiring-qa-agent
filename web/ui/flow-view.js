// Vẽ luồng nghiệp vụ dạng dễ đọc: hành trình trạng thái (chuỗi ô nối mũi tên), các bước theo thứ tự (ai → làm gì → kết quả), rồi nhánh / bị chặn / lưu ý.
import { esc } from './components.js';

const list = (items) => `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;

export function flowHtml(s) {
  const path = s.path?.length ? `<div class="fv-path" aria-label="Hành trình trạng thái">${s.path.map((p, i) => `${i ? '<span class="fv-arrow" aria-hidden="true">→</span>' : ''}<span class="fv-state">${esc(p)}</span>`).join('')}</div>` : '';
  const steps = `<ol class="fv-steps">${s.steps.map((x) => `<li><span class="fv-who">${esc(x.who)}</span><span class="fv-act">${esc(x.action)}</span>${x.result ? `<span class="fv-res"><i aria-hidden="true">→</i>${esc(x.result)}</span>` : ''}</li>`).join('')}</ol>`;
  const branches = s.branches?.length ? `<h4>Ngoài đường chính</h4><ul class="fv-branch">${s.branches.map((b) => `<li><b>${esc(b.when)}</b><span>${esc(b.result)}</span></li>`).join('')}</ul>` : '';
  return `<p class="fv-purpose">${esc(s.purpose)}</p>${path}<h4>Các bước</h4>${steps}${branches}
    ${s.blocked?.length ? `<h4>Khi nào bị chặn hoặc báo lỗi</h4><div class="fv-warn">${list(s.blocked)}</div>` : ''}
    ${s.notes?.length ? `<h4>Cần lưu ý</h4>${list(s.notes)}` : ''}
    <p class="small mute">Do AI diễn giải lại từ tài liệu chi tiết; điều cần chính xác thì xem tab «Chi tiết kỹ thuật».</p>`;
}
