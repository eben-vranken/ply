// Captures the main screens at phone, phone-on-its-side, tablet and desktop sizes (run `npm run build` first,
// without the Supabase keys: `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run build`).
// OUT=<dir> picks the folder (default docs/screenshots/layouts); ONLY=phone,desktop limits it to some sizes.
// The desktop sizes are captured in light and dark, with the landing page, onboarding, the command
// palette, an answer and the session-complete screen as well; the landing page is also captured on a phone.
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = process.env.OUT ?? fileURLToPath(new URL('../../docs/screenshots/layouts/', import.meta.url));
mkdirSync(out, { recursive: true });
interface Size { width: number; height: number; mobile: boolean; dark?: boolean; desk?: boolean }
const SIZES: Record<string, Size> = {
  phone: { width: 412, height: 915, mobile: true }, // Samsung Galaxy S20 FE
  'phone-land': { width: 915, height: 412, mobile: true },
  'tablet': { width: 820, height: 1180, mobile: true },
  'tablet-land': { width: 1180, height: 820, mobile: true },
  desktop: { width: 1440, height: 900, mobile: false, desk: true },
  'desktop-dark': { width: 1440, height: 900, mobile: false, desk: true, dark: true },
  'desktop-1280': { width: 1280, height: 800, mobile: false, desk: true },
  'desktop-1280-dark': { width: 1280, height: 800, mobile: false, desk: true, dark: true },
  'desktop-1920': { width: 1920, height: 1080, mobile: false, desk: true },
  'desktop-1920-dark': { width: 1920, height: 1080, mobile: false, desk: true, dark: true }
};
const only = process.env.ONLY?.split(',');
const server = await preview({ preview: { port: 4182 } });
const url = 'http://localhost:4182/ply/';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const browser: Browser = await engine.launch();
const errors: string[] = [];
const ITALIAN = 'e2e4%20e7e5%20g1f3%20b8c6%20f1c4';

/** the landing page, a window at a time from top to bottom */
async function landing(page: Page, name: string, height: number) {
  await page.goto(url + '#/welcome');
  await page.locator('.landing h1').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2500);
  const total = await page.evaluate(() => document.querySelector('.landing')!.scrollHeight);
  let i = 0;
  for (let y = 0; y < total; y += Math.round(height * 0.88)) {
    await page.evaluate((y) => document.querySelector('.landing')!.scrollTo(0, y), y);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${out}/${name}-landing-${String(i++).padStart(2, '0')}.png` });
  }
}

for (const [name, s] of Object.entries(SIZES)) {
  if (only && !only.includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1, hasTouch: s.mobile, isMobile: s.mobile && engine === chromium, colorScheme: s.dark ? 'dark' : 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  const shot = async (n: string) => { await page.waitForTimeout(900); await page.screenshot({ path: `${out}/${name}-${n}.png` }); };
  // the same clock for every run, so Birch's line of the day and the dates match between runs
  await page.clock.setFixedTime(new Date('2026-11-16T10:00:00'));
  await page.goto(url);
  await page.getByText('Set up Ply').click({ timeout: 60_000 });
  if (s.desk) await shot('onboarding');
  for (const t of ['Continue', 'Continue', 'Skip and start']) await page.getByText(t).click();
  await page.locator('h1:text("Today")').waitFor({ timeout: 60_000 });
  await page.goto(url + '#/settings'); await page.getByText('Move on after a clean answer').click();
  await page.goto(url + '#/today'); await shot('today');
  await page.goto(url + `#/explore?side=w&p=${ITALIAN}`); await shot('explore');
  await page.goto(url + '#/repertoire'); await shot('repertoire');
  await page.goto(url + '#/stats'); await shot('stats');
  await page.goto(url + '#/settings'); await shot('settings');
  await page.goto(url + `#/tree?side=w&p=${ITALIAN}`); await shot('tree');
  await page.goto(url + '#/today');
  await page.getByRole('button', { name: /Start|Continue/ }).click();
  await page.waitForSelector('.room'); await page.waitForTimeout(1200); await shot('train');
  await page.getByRole('button', { name: 'Hint' }).click(); await shot('train-hint');
  await page.goto(url + `#/play?side=w&p=${ITALIAN}%20f8c5`); await page.waitForTimeout(2500); await shot('play');

  if (s.desk) {
    // pointing at a move in Explore: the arrow on the board and the position it leads to
    await page.goto(url + `#/explore?side=w&p=${ITALIAN}`); await page.waitForTimeout(700);
    await page.locator('.mv').nth(2).hover(); await shot('explore-hover');
    await page.mouse.move(5, 5);
    // a tile picked in the skill tree: the panel on the right
    await page.goto(url + `#/tree?side=w&p=${ITALIAN}`); await page.waitForTimeout(900);
    await page.locator('.tile').first().click(); await shot('tree-tile');
    // the command palette
    await page.goto(url + '#/today'); await page.waitForTimeout(500);
    await page.keyboard.press('Control+k'); await page.keyboard.type('sicil'); await shot('palette');
    await page.keyboard.press('Escape');
    const want = async () => (await page.locator('.prompt').innerText({ timeout: 400 }).catch(() => '')).replace(/\s+/g, ' ').match(/(?:move is|Play|safe move is) ([^ .]+)/)?.[1];
    let clock = new Date('2026-11-16T10:00:00').getTime();
    const hintOn = () => page.getByRole('button', { name: 'Hint' }).isEnabled().catch(() => false);
    /** answer by typing until `until` is on screen: the named move, or a wrong one on purpose so the trainer names it */
    const answer = async (until: RegExp, first?: () => Promise<void>, known?: string) => {
      let answers = 0;
      for (let i = 0; i < 80; i++) {
        if (await page.getByText(until).isVisible().catch(() => false)) return;
        if (await page.getByRole('button', { name: /Continue/ }).isVisible().catch(() => false)) {
          if (answers++ === 0 && first) return void (await first());
          // the clock stands still for these shots, so a learning card would come back for ever: step it on
          if (!first) await page.clock.setFixedTime(new Date((clock += 30 * 60_000)));
          await page.keyboard.press('Enter'); await page.waitForTimeout(350);
          continue;
        }
        if (await hintOn()) {
          const w = await want();
          if (w) await page.keyboard.type(w);
          else if (known) await page.keyboard.type(known);
          else { await page.keyboard.type('a3'); await page.waitForTimeout(250); const fix = await want(); if (fix) await page.keyboard.type(fix); }
        }
        await page.waitForTimeout(300);
      }
    };
    // session complete: a Today session cut down to one new move
    await page.goto(url + '#/settings'); await page.waitForTimeout(400);
    for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Less New moves' }).click();
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Less New traps' }).click();
    await page.goto(url + '#/today'); await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Start|Continue/ }).first().click();
    await page.waitForSelector('.room');
    await page.waitForTimeout(600); await answer(/Session complete/, undefined, 'e4'); // the one new move is 1.e4
    await page.waitForTimeout(1500); await shot('complete');
    await page.keyboard.press('Enter'); await page.waitForTimeout(600);
    // a Learn round from Explore, answered by typing: the answer panel, then the round's summary
    await page.goto(url + '#/explore?side=w'); await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Learn from here' }).click();
    await page.waitForSelector('.room');
    await answer(/Round over/, () => shot('train-answer'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400); await shot('summary');
    await page.keyboard.press('Enter');
    await landing(page, name, s.height);
  }
  if (name === 'phone') await landing(page, name, s.height);
  console.log(name, 'done');
  await ctx.close();
}
console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no page errors');
await browser.close();
server.httpServer.close();
process.exit(errors.length ? 1 : 0);
