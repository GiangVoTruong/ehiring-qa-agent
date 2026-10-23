import { expect, test } from '@playwright/test';
import { aiFieldValues, aiOn, parseJson, shapeOf } from '../../flows/ai';
import { makeProfile } from '../../flows/fake-person';

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; delete process.env.QA_AI; delete process.env.QA_AI_CLI; });

test('không có key hoặc QA_AI=0 thì AI tắt và không gọi mạng', async () => {
  delete process.env.ANTHROPIC_API_KEY; delete process.env.QA_AI_CLI;
  let called = 0; globalThis.fetch = (async () => { called++; return new Response('{}'); }) as any;
  expect(aiOn()).toBe(false);
  expect(await aiFieldValues([{ key: 'a', label: 'Sở thích đặc biệt' }], makeProfile(1))).toEqual({});
  process.env.ANTHROPIC_API_KEY = 'k'; process.env.QA_AI = '0';
  expect(aiOn()).toBe(false);
  expect(called).toBe(0);
});

test('hình dạng giá trị không lộ nội dung đã quay', () => {
  expect(shapeOf('Nguyễn Văn A 1990')).toBe('Aaaaaa Aaa A 9999');
  expect(shapeOf('x'.repeat(50)).length).toBe(30);
});

test('đọc JSON dù model rào code block; hỏng thì null', () => {
  expect(parseJson('```json\n{"values":{"f":"ok"}}\n```').values.f).toBe('ok');
  expect(parseJson('không phải json')).toBeNull();
  expect(parseJson(null)).toBeNull();
});

test('aiFieldValues: gửi nhãn + hồ sơ giả, không gửi key; làm sạch xuống dòng và cắt theo maxlength; có cache', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test-secret';
  const bodies: string[] = [];
  globalThis.fetch = (async (_u: any, init: any) => {
    bodies.push(String(init.body));
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"values":{"f1":"Đọc sách\\nvà nấu ăn dài dài dài","f2":""}}' }] }), { status: 200 });
  }) as any;
  const p = makeProfile(7);
  const out = await aiFieldValues([{ key: 'f1', label: 'Sở thích', maxlength: 12, shape: 'Aaa aaa' }, { key: 'f2', label: 'Ô rỗng' }], p);
  expect(out.f1).toBe('Đọc sách và'); // một dòng, cắt theo maxlength 12 rồi bỏ khoảng trắng thừa
  expect(out.f2).toBeUndefined(); // model trả rỗng → để luật mặc định lo
  expect(bodies[0]).toContain('Sở thích');
  expect(bodies[0]).toContain(p.fullName);
  expect(bodies[0]).not.toContain('sk-test-secret'); // key chỉ nằm ở header
  await aiFieldValues([{ key: 'f1', label: 'Sở thích', maxlength: 12 }], p);
  expect(bodies.length).toBe(1); // lần sau lấy từ cache
});

test('API lỗi thì trả rỗng, không ném lỗi làm hỏng lượt chạy', async () => {
  process.env.ANTHROPIC_API_KEY = 'k';
  globalThis.fetch = (async () => new Response('{}', { status: 500 })) as any;
  expect(await aiFieldValues([{ key: 'z', label: 'Nhãn mới chưa có cache' }], makeProfile(2))).toEqual({});
  globalThis.fetch = (async () => { throw new Error('mất mạng'); }) as any;
  expect(await aiFieldValues([{ key: 'z', label: 'Nhãn mới chưa có cache 2' }], makeProfile(2))).toEqual({});
});
