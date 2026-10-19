import { expect, test } from '@playwright/test';
import * as rr from '../flows/recruitment-requests';
import * as rp from '../flows/recruitment-plans';

test.describe.configure({ timeout: 240_000 });
test('tạo 1 YCTD + 1 PATD', async ({ page }) => {
  const request = await rr.create(page, 'YCTD');
  expect(await rr.approve(page, request)).toBe(200);
  const plan = await rp.create(page, request, 'PATD');
  console.log('RESULT', JSON.stringify({ request, plan }));
});
