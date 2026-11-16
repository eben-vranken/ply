// quick look: node shot.ts <name> <width> <height> <hash> [dark] [scrollY|full]
import { chromium } from 'playwright';
const [name, w, h, hash, theme, mode] = process.argv.slice(2);
const out = '/tmp/claude-1000/-home-eben-ply/89cfccb0-edd1-469a-a505-3541d0168f66/scratchpad/look';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, colorScheme: theme === 'dark' ? 'dark' : 'light', reducedMotion: process.env.STILL ? 'reduce' : 'no-preference' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
await page.clock.setFixedTime(new Date('2026-11-16T10:00:00'));
const url = process.env.URL ?? 'http://localhost:4199/ply/';
await page.goto(url + '#/welcome');
if (!hash.startsWith('/welcome')) {
  await page.goto(url);
  await page.getByText('Set up Ply').click({ timeout: 60000 });
  if (hash === 'ob1') { await page.waitForTimeout(600); await page.screenshot({ path: `${out}/${name}.png` }); await b.close(); process.exit(0); }
  for (const t of ['Continue', 'Continue', 'Skip and start']) await page.getByText(t).click();
  await page.locator('h1:text("Today")').waitFor({ timeout: 60000 });
  if (hash === 'train' || hash === 'answer') {
    await page.goto(url + '#/settings'); await page.getByText('Move on after a clean answer').click();
    await page.goto(url + '#/today'); await page.getByRole('button', { name: /Start|Continue/ }).first().click(); await page.waitForSelector('.room'); await page.waitForTimeout(1500);
    if (hash === 'answer') { await page.keyboard.type('e4'); await page.waitForTimeout(1500); }
  } else await page.goto(url + '#' + hash);
}
await page.waitForTimeout(1800);
if (mode === 'full') {
  const H = await page.evaluate(() => document.querySelector('.landing')!.scrollHeight);
  let i = 0;
  for (let y = 0; y < H; y += +h * 0.9) { await page.evaluate((y) => document.querySelector('.landing')!.scrollTo(0, y), y); await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/${name}-${String(i++).padStart(2, '0')}.png` }); }
  console.log('frames', i, 'height', H);
} else {
  if (mode) { await page.evaluate((y) => (document.querySelector('.landing') ?? document.querySelector('.screen'))!.scrollTo(0, y), +mode); await page.waitForTimeout(900); }
  await page.screenshot({ path: `${out}/${name}.png` });
}
await b.close();
