// Học "vào trang bằng cách nào": đọc menu trái (hover từng nhóm → mục con + đường dẫn) → .nav-map.json + knowledge/navigation.md.
// Chỉ ĐỌC (hover), không bấm/ghi gì. Dùng khi chạy lại luồng: gặp "chuyển tới trang X" thì đi bằng menu như người dùng thay vì gõ link.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function learnMenu({ ROOT, BASE_URL, AUTH_STATE, AUTH_SESSION, KNOWLEDGE }) {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, ...(existsSync(AUTH_STATE) ? { storageState: AUTH_STATE } : {}) });
    const session = existsSync(AUTH_SESSION) ? readFileSync(AUTH_SESSION, 'utf8') : '{}';
    await context.addInitScript(({ session, host }) => {
      if (location.host !== host) return;
      localStorage.setItem('locale', 'en');
      if (!sessionStorage.length) for (const [k, v] of Object.entries(JSON.parse(session))) sessionStorage.setItem(k, v);
    }, { session, host: new URL(BASE_URL).host });
    const page = await context.newPage();
    await page.goto(new URL('/dashboard', BASE_URL).href, { waitUntil: 'domcontentloaded' });
    const titles = page.locator('nz-sider .ant-menu-submenu-title');
    await titles.first().waitFor({ timeout: 30_000 });
    const entries = [];
    const n = await titles.count();
    const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
    // Menu mở rộng (cửa sổ rộng): mọi mục đã nằm sẵn trong DOM, nhóm lấy từ tiêu đề cha.
    const inline = await page.evaluate(() => [...document.querySelectorAll('nz-sider li.ant-menu-item')].map((e) => ({
      group: (e.closest('li.ant-menu-submenu')?.querySelector(':scope > .ant-menu-submenu-title')?.textContent || '').replace(/\s+/g, ' ').trim(),
      text: (e.textContent || '').replace(/\s+/g, ' ').trim(), href: e.querySelector('a')?.getAttribute('href') || '' })).filter((x) => x.href));
    for (const it of inline) if (!entries.some((x) => x.href === it.href)) entries.push(it);
    // Menu thu gọn (cửa sổ hẹp): mục con chỉ hiện ở lớp phủ khi hover từng nhóm.
    for (let i = 0; i < n && !inline.length; i++) {
      const group = clean(await titles.nth(i).innerText());
      await page.mouse.move(900, 600);
      await page.waitForTimeout(500);
      await titles.nth(i).hover().catch(() => undefined);
      await page.waitForTimeout(900);
      const items = await page.evaluate(() => [...document.querySelectorAll('.ant-menu-submenu-popup li.ant-menu-item, li.ant-menu-item')]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => ({ text: (e.textContent || '').replace(/\s+/g, ' ').trim(), href: e.querySelector('a')?.getAttribute('href') || '' })));
      for (const it of items) if (it.href && !entries.some((x) => x.href === it.href)) entries.push({ group, ...it });
    }
    writeFileSync(join(ROOT, '.nav-map.json'), JSON.stringify(entries, null, 1));
    const byGroup = new Map();
    for (const e of entries) byGroup.set(e.group, [...(byGroup.get(e.group) ?? []), e]);
    const md = `# Cách vào các trang (menu trái)\n\n_Học tự động ngày ${new Date().toISOString().slice(0, 10)}. Menu mặc định thu gọn: **di chuột vào biểu tượng nhóm** thì mục con hiện ra, bấm mục con để vào trang. Không cần gõ link._\n\n${[...byGroup].map(([g, l]) => `## ${g}\n${l.map((e) => `- **${e.text}** → \`${e.href}\``).join('\n')}`).join('\n\n')}\n\nTrang sâu hơn (vd \`/recruitment-plans/<id>\`) vào bằng cách: vào trang danh sách ở trên rồi bấm dòng cần mở.\n`;
    mkdirSync(KNOWLEDGE, { recursive: true });
    writeFileSync(join(KNOWLEDGE, 'navigation.md'), md);
    return { entries, groups: n };
  } finally {
    await browser.close();
  }
}
