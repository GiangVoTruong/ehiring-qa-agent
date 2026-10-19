import { expect, test } from '@playwright/test';
import { QA_PREFIX, addToRegistry, cleanupCandidates, qaTitle, readRegistry } from '../../flows/common';

test('qaTitle gắn tiền tố [AUTOTEST] (không còn [QA-AUTO]) và hậu tố thời gian duy nhất', () => {
  const a = qaTitle('YCTD', new Date('2026-10-10T08:30:45.123Z'));
  const b = qaTitle('YCTD', new Date('2026-10-10T08:30:45.124Z'));
  expect(a).toBe(`${QA_PREFIX} YCTD 20261010083045123`);
  expect(a.startsWith('[AUTOTEST]')).toBe(true);
  expect(a).not.toContain('QA-AUTO');
  expect(a).not.toBe(b);
});

test('registry: tạo file khi chưa có, ghi thêm không đè dòng cũ', () => {
  const file = test.info().outputPath('registry.jsonl');
  expect(readRegistry(file)).toEqual([]);

  addToRegistry({ flow: 'recruitment-requests', id: '1', title: `${QA_PREFIX} a` }, file);
  addToRegistry({ flow: 'recruitment-requests', id: '2', title: `${QA_PREFIX} b` }, file);

  expect(readRegistry(file).map((e) => e.id)).toEqual(['1', '2']);
  expect(readRegistry(file)[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test('cleanupCandidates chỉ chọn bản ghi vừa có trong registry vừa có tiền tố', () => {
  const registry = [
    { flow: 'recruitment-requests', id: '1', title: `${QA_PREFIX} a`, createdAt: '' },
    { flow: 'recruitment-requests', id: '2', title: `${QA_PREFIX} b`, createdAt: '' },
  ];
  const appRecords = [
    { id: '1', title: `${QA_PREFIX} a` }, // trong registry + có tiền tố → chọn
    { id: '2', title: 'YCTD thật bị đổi tên' }, // trong registry nhưng mất tiền tố → bỏ
    { id: '3', title: `${QA_PREFIX} c` }, // có tiền tố nhưng không do mình tạo → bỏ
  ];
  expect(cleanupCandidates(appRecords, registry).map((r) => r.id)).toEqual(['1']);
});

test('cleanupCandidates vẫn nhận dữ liệu cũ đặt tên [QA-AUTO] để dọn', () => {
  const registry = [{ flow: 'recruitment-requests', id: '9', title: '[QA-AUTO] YCTD cũ', createdAt: '' }];
  expect(cleanupCandidates([{ id: '9', title: '[QA-AUTO] YCTD cũ' }, { id: '9x', title: '[QA-AUTO] khác' }], registry).map((r) => r.id)).toEqual(['9']);
});
