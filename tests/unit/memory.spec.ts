import { expect, test } from '@playwright/test';
// @ts-ignore — module .mjs dùng chung với web
import { openStore } from '../../web/store.mjs';

test('bộ nhớ luồng: lưu cách xử lý thành công, gộp trùng và tăng số lần dùng', () => {
  const s = openStore(':memory:');
  const flowId = s.createFlow({ name: 'f', module: 'm', url: '/', description: '', signature: 'sig', steps: [], expected: {}, params: {}, analysis: {}, sourceRecording: 'r' });
  s.addMemory(flowId, [{ step_key: '5:Save', kind: 'target', data: { text: 'Lưu thay đổi', sel: 'div > button' } }]);
  s.addMemory(flowId, [{ step_key: '5:Save', kind: 'target', data: { text: 'Lưu thay đổi', sel: 'div > button' } }, { step_key: '7:Chọn', kind: 'action', data: { action: 'pick_option', text: 'Hà Nội' } }]);
  const m = s.listMemory(flowId);
  expect(m).toHaveLength(2);
  expect(m[0]).toMatchObject({ step_key: '5:Save', kind: 'target', hits: 2, data: { text: 'Lưu thay đổi' } }); // dùng nhiều nhất đứng đầu
  expect(m[1]).toMatchObject({ kind: 'action', hits: 1 });
  expect(s.listMemory(flowId + 1)).toEqual([]); // bộ nhớ riêng từng flow
});

test('đề xuất sau lượt chạy: chạy nhiều lần chỉ có một bản đang chờ, bản mới ghi đè bản chờ', () => {
  const s = openStore(':memory:');
  const flowId = s.createFlow({ name: 'f', module: 'm', url: '/', description: '', signature: 'sig', steps: [{ n: 0 }], expected: {}, params: {}, analysis: {}, sourceRecording: null });
  const v1 = s.proposeVersion(flowId, { steps: [{ n: 1 }], expected: {}, params: {}, analysis: {}, note: 'lần 1' });
  const v2 = s.proposeVersion(flowId, { steps: [{ n: 2 }], expected: {}, params: {}, analysis: {}, note: 'lần 2' });
  expect(v2).toBe(v1);
  expect(s.getVersion(flowId, v1)).toMatchObject({ steps: [{ n: 2 }], note: 'lần 2' });
  s.rejectVersion(flowId, v1); // từ chối xong thì lượt chạy sau được đề xuất bản mới
  expect(s.proposeVersion(flowId, { steps: [{ n: 3 }], expected: {}, params: {}, analysis: {}, note: 'lần 3' })).toBe(v1 + 1);
});
