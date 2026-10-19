// Lớp gọi backend. Thêm ?mock=1 vào URL để dùng dữ liệu MẪU (mock.js) khi chưa có backend — luôn có biểu ngữ cảnh báo trên giao diện.
export const MOCK = new URLSearchParams(location.search).has('mock');
let mockHandler = null;
if (MOCK) mockHandler = (await import('./mock.js')).handle;

async function call(method, path, body) {
  if (MOCK) return mockHandler(method, path, body);
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

export const api = {
  get: (path) => call('GET', path),
  post: (path, body) => call('POST', path, body),
  del: (path, body) => call('DELETE', path, body),
};
