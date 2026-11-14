// Captures every screen at 390x844 into docs/screenshots (run `npm run build` first).
// Plays a real Today session on the real data: a wrong move first on some cards,
// then the move the app names, and grabs the first card of each kind it meets.
import { chromium, type Page } from 'playwright';
import { preview } from 'vite';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const out = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const server = await preview({ preview: { port: 4179 } });
const url = 'http://localhost:4179/ply/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
const taken = new Set<string>();
const shot = async (name: string, scroll = 0) => {
  if (taken.has(name)) return;
  taken.add(name);
  await page.waitForTimeout(700);
  if (scroll) { await page.evaluate((y) => document.querySelector('.screen')?.scrollTo(0, y), scroll); await page.waitForTimeout(300); }
  await page.screenshot({ path: `${out}${name}.png` });
  console.log(name);
};

const click = async (p: Page, sq: string) => {
  const b = (await p.locator('.room cg-board').boundingBox())!;
  const white = await p.locator('.room .cg-wrap').evaluate((e) => e.classList.contains('orientation-white'));
  const f = sq.charCodeAt(0) - 97, r = +sq[1] - 1, c = b.width / 8;
  await p.mouse.click(b.x + (white ? f : 7 - f) * c + c / 2, b.y + (white ? 7 - r : r) * c + c / 2);
};
const playSan = async (san: string) => {
  const fen = await page.locator('.room .slab').getAttribute('data-fen');
  const mv = new Chess(fen!).move(san);
  await click(page, mv.from); await page.waitForTimeout(90); await click(page, mv.to); await page.waitForTimeout(300);
};
const text = async (sel: string) => (await page.locator(sel).innerText().catch(() => '')).replace(/\s+/g, ' ');
const named = (s: string) => s.match(/(?:move is|Play|safe move is) ([^ .]+)/)?.[1];

await page.goto(url);
await page.getByText('Set up Ply').waitFor({ timeout: 120_000 });
await shot('01-welcome');
await page.getByText('Set up Ply').click(); await shot('02-repertoire-pick');
await page.getByText('Continue').click(); await shot('03-limits');
await page.getByText('Continue').click(); await shot('04-username');
await page.getByText('Skip and start').click();
await page.locator('h1:text("Today")').waitFor({ timeout: 60_000 });
await shot('05-today');

await page.getByRole('button', { name: /Start|Continue/ }).click();
await page.waitForSelector('.room');
let cards = 0, asks = 0;
const kinds: Record<string, string> = { 'New move': '06-train-new-move', 'They blundered. Punish it': '10-train-punish', 'Careful. Find the safe move': '11-train-danger', 'Find the best line': '13-train-puzzle' };
for (let i = 0; i < 900 && cards < 15; i++) {
  if (await page.getByText('Session complete').isVisible().catch(() => false)) break;
  if (await page.getByRole('button', { name: 'Next', exact: true }).isVisible().catch(() => false)) {
    cards++;
    const grade = await text('.answer .grade');
    if (await page.getByText(/See why .* loses/).isVisible().catch(() => false) && !taken.has('12-train-danger-replay')) {
      await shot('12-train-danger-answer');
      await page.getByText(/See why .* loses/).click();
      await page.waitForTimeout(4200);
      await shot('12-train-danger-replay');
    } else if (grade.includes('Again')) await shot('09-train-again');
    else if (grade.includes('Good') || grade.includes('Learning')) await shot('08-train-answer');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForTimeout(600);
    continue;
  }
  if (!(await page.getByRole('button', { name: 'Hint' }).isEnabled().catch(() => false))) { await page.waitForTimeout(250); continue; }
  const prompt = await text('.prompt');
  for (const [k, n] of Object.entries(kinds)) if (prompt.includes(k)) await shot(n);
  if (await page.locator('.branch').isVisible().catch(() => false)) await shot('07-train-branch');
  const want = named(prompt);
  if (want) { await playSan(want); asks++; continue; }
  if (asks % 4 === 2) {
    // a wrong move, to show the correction
    const fen = await page.locator('.room .slab').getAttribute('data-fen');
    const legal = new Chess(fen!).moves();
    await playSan(legal[Math.floor(legal.length / 2)]);
    await page.waitForTimeout(350);
    await shot('08-train-wrong');
    const fix = named(await text('.prompt'));
    if (fix) await playSan(fix);
  } else {
    // ask for the hint, then fail once to learn the move, as a user would
    const fen = await page.locator('.room .slab').getAttribute('data-fen');
    const legal = new Chess(fen!).moves();
    await playSan(legal[legal.length - 1]);
    const fix = named(await text('.prompt'));
    if (fix) await playSan(fix);
  }
  asks++;
}
console.log(`played ${cards} cards`);
await page.locator('.room .x').click();
await page.waitForTimeout(800);
await shot('15-today-after');

await page.goto(url + '#/explore?side=w&p=e2e4%20e7e5%20g1f3%20b8c6%20f1c4'); await shot('16-explore'); await shot('16-explore-2', 760);
await page.goto(url + '#/explore?side=w&p=e2e4%20e7e5%20g1f3%20b8c6%20f1c4%20g8f6%20f3g5'); await shot('17-explore-traps', 900);
await page.goto(url + '#/repertoire'); await shot('18-repertoire'); await shot('18-repertoire-2', 900);
await page.goto(url + '#/tree?side=w&p=e2e4%20e7e5%20g1f3%20b8c6%20f1c4'); await shot('18-tree'); await shot('18-tree-2', 700);
await page.locator('.canvas g.more').first().click(); await page.waitForTimeout(700); await page.evaluate(() => document.querySelector('.screen')?.scrollTo(0, 560)); await page.waitForTimeout(300); await page.screenshot({ path: `${out}18-tree-3.png` });
await page.locator('.canvas g.node[role=button]').nth(1).click(); await page.waitForTimeout(500); await page.screenshot({ path: `${out}18-tree-4.png` });
await page.goto(url + '#/tree?side=b&p=e2e4'); await shot('18-tree-black');
await page.goto(url + '#/stats'); await shot('19-stats'); await shot('19-stats-2', 760); await shot('19-stats-3', 1500);
await page.goto(url + '#/settings'); await shot('20-settings'); await shot('20-settings-2', 900);
await page.goto(url + '#/explore?side=w&p=e2e4%20e7e5%20g1f3%20b8c6'); await page.waitForTimeout(600);
await page.getByText(/Change your move|Edit your moves/).click(); await shot('21-move-editor');

// dark mode
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ply-state-v1') || '{}'); s.theme = 'dark'; localStorage.setItem('ply-state-v1', JSON.stringify(s)); });
for (const [r, n] of [['today', '22-dark-today'], ['explore?side=w&p=e2e4%20e7e5', '23-dark-explore'], ['repertoire', '24-dark-repertoire'], ['stats', '25-dark-stats'], ['settings', '26-dark-settings']]) {
  await page.goto(url + '#/' + r); await page.reload(); await page.locator('nav').waitFor(); await shot(n);
}

// app icons
const ip = await browser.newPage();
for (const s of [192, 512]) { await ip.setViewportSize({ width: s, height: s }); await ip.goto(url + 'icon.svg'); await ip.screenshot({ path: fileURLToPath(new URL(`../public/icon-${s}.png`, import.meta.url)) }); }
await browser.close();
server.httpServer.close();
process.exit(0);
