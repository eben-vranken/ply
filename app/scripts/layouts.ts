// Captures the main screens at phone, phone-on-its-side, tablet and desktop sizes (run `npm run build` first).
// OUT=<dir> picks the folder (default docs/screenshots/layouts); ONLY=phone limits it to one size.
import { chromium, webkit, type Browser } from 'playwright';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = process.env.OUT ?? fileURLToPath(new URL('../../docs/screenshots/layouts/', import.meta.url));
mkdirSync(out, { recursive: true });
const SIZES: Record<string, { width: number; height: number; mobile: boolean }> = {
  phone: { width: 412, height: 915, mobile: true }, // Samsung Galaxy S20 FE
  'phone-land': { width: 915, height: 412, mobile: true },
  'tablet': { width: 820, height: 1180, mobile: true },
  'tablet-land': { width: 1180, height: 820, mobile: true },
  desktop: { width: 1440, height: 900, mobile: false }
};
const only = process.env.ONLY?.split(',');
const server = await preview({ preview: { port: 4182 } });
const url = 'http://localhost:4182/ply/';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const browser: Browser = await engine.launch();
const errors: string[] = [];

for (const [name, s] of Object.entries(SIZES)) {
  if (only && !only.includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1, hasTouch: s.mobile, isMobile: s.mobile && engine === chromium });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  const shot = async (n: string) => { await page.waitForTimeout(900); await page.screenshot({ path: `${out}/${name}-${n}.png` }); };
  // the same clock for every run, so Birch's line of the day and the dates match between runs
  await page.clock.setFixedTime(new Date('2026-11-16T10:00:00'));
  await page.goto(url);
  await page.getByText('Set up Ply').click({ timeout: 60_000 });
  for (const t of ['Continue', 'Continue', 'Skip and start']) await page.getByText(t).click();
  await page.locator('h1:text("Today")').waitFor({ timeout: 60_000 });
  await page.goto(url + '#/settings'); await page.getByText('Move on after a clean answer').click();
  await page.goto(url + '#/today'); await shot('today');
  await page.goto(url + '#/explore?side=w&p=e2e4%20e7e5%20g1f3%20b8c6%20f1c4'); await shot('explore');
  await page.goto(url + '#/repertoire'); await shot('repertoire');
  await page.goto(url + '#/stats'); await shot('stats');
  await page.goto(url + '#/settings'); await shot('settings');
  await page.goto(url + '#/tree?side=w&p=e2e4%20e7e5%20g1f3%20b8c6%20f1c4'); await shot('tree');
  await page.goto(url + '#/today');
  await page.getByRole('button', { name: /Start|Continue/ }).click();
  await page.waitForSelector('.room'); await page.waitForTimeout(1200); await shot('train');
  await page.getByRole('button', { name: 'Hint' }).click(); await shot('train-hint');
  await page.goto(url + '#/play?side=w&p=e2e4%20e7e5%20g1f3%20b8c6%20f1c4%20f8c5'); await page.waitForTimeout(2500); await shot('play');
  console.log(name, 'done');
  await ctx.close();
}
console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no page errors');
await browser.close();
server.httpServer.close();
process.exit(errors.length ? 1 : 0);
