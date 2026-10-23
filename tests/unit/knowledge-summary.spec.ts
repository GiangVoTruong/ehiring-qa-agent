import { expect, test } from '@playwright/test';
// @ts-ignore — module .mjs dùng chung với web
import { parseSummary } from '../../web/knowledge-summary.mjs';

test('đọc luồng nghiệp vụ từ câu trả lời mô hình: bỏ rào code, ép về đúng dạng, thiếu phần cốt lõi thì hỏng', () => {
  const ok = '```json\n{"purpose":"Xin tuyển thêm người","path":["Chờ duyệt","Đang mở"],"steps":[{"who":"Người tạo","action":"điền và lưu","result":"Chờ duyệt"}],"branches":[{"when":"Bị từ chối","result":"Kết thúc"}],"blocked":["Không có quyền"],"notes":[],"thua":1}\n```';
  expect(parseSummary(ok)).toEqual({ purpose: 'Xin tuyển thêm người', path: ['Chờ duyệt', 'Đang mở'], steps: [{ who: 'Người tạo', action: 'điền và lưu', result: 'Chờ duyệt' }], branches: [{ when: 'Bị từ chối', result: 'Kết thúc' }], blocked: ['Không có quyền'], notes: [] });
  expect(parseSummary('{"purpose":"x","steps":[]}')).toBeNull(); // không có bước nào
  expect(parseSummary('không phải json')).toBeNull();
  expect(parseSummary(null)).toBeNull();
});
