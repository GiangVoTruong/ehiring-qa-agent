import { expect, test } from '@playwright/test';
// @ts-ignore — module .mjs dùng chung với web
import { buildSteps, loginFlags } from '../../web/recorder.mjs';

test('kéo thả được gom thành một bước đọc được, giữ phần tử kéo, phần tử thả và vector', () => {
  const steps = buildSteps([{ type: 'drag', t: 1000, url: '/recruitment-plans/1/applications', ctx: '', from: { text: 'Nguyen Van A', sel: 'main > div > div:nth-of-type(1) > div', tag: 'div' }, to: { text: 'Phỏng vấn', sel: 'main > div > div:nth-of-type(2)', tag: 'div' }, dx: 320, dy: 8, vw: 1600, vh: 900 }]);
  expect(steps).toHaveLength(1);
  expect(steps[0].text).toBe('Kéo «Nguyen Van A» sang «Phỏng vấn»');
  expect(steps[0].act.type).toBe('drag');
  expect(steps[0].act.from.sel).toContain('div:nth-of-type(1)');
  expect(steps[0].act.to.sel).toContain('div:nth-of-type(2)');
  expect(steps[0].act.dx).toBe(320);
});

test('kéo thả không bị coi là bước đăng nhập', () => {

  expect(loginFlags([{ type: 'drag', url: '/x' }])).toEqual([false]);
});
