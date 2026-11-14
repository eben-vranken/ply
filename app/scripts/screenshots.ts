// Captures every screen at 390x844 into docs/screenshots (run `npm run build` first).
import { chromium, type Page } from 'playwright';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';

const out = new URL('../../docs/screenshots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const server = await preview({ preview: { port: 4179 } });
const url = 'http://localhost:4179/ply/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
const shot = async (name: string, full = false) => { await page.waitForTimeout(900); await page.screenshot({ path: `${out}${name}.png`, fullPage: false }); if (full) { await page.evaluate(() => document.querySelector('.screen')?.scrollTo(0, 760)); await page.waitForTimeout(300); await page.screenshot({ path: `${out}${name}-2.png` }); } console.log(name); };
const sq = async (p: Page, s: string, white = true) => {
  const b = await p.locator('cg-board').boundingBox(); if (!b) throw new Error('no board');
  const f = s.charCodeAt(0) - 97, r = +s[1] - 1, c = b.width / 8;
  await p.mouse.click(b.x + (white ? f : 7 - f) * c + c / 2, b.y + (white ? 7 - r : r) * c + c / 2);
};
const mv = async (a: string, b: string, white = true) => { await sq(page, a, white); await page.waitForTimeout(120); await sq(page, b, white); await page.waitForTimeout(700); };

await page.goto(url);
await page.waitForTimeout(1500);
await shot('01-welcome');
await page.getByText('Set up Ply').click(); await shot('02-repertoire-pick');
await page.getByText('Continue').click(); await shot('03-limits');
await page.getByText('Continue').click(); await shot('04-username');
await page.getByText('Skip and start').click(); await page.waitForTimeout(600); await shot('05-today');
await page.getByRole('button', { name: 'Start' }).click(); await page.waitForTimeout(900);
await mv('e2', 'e4'); await mv('g1', 'f3'); await shot('06-train-branch');
await mv('f1', 'b5'); await shot('07-train-other-branch');
await mv('f1', 'c4'); await mv('d2', 'd4'); await shot('08-train-wrong');
await mv('c2', 'c3'); await mv('d2', 'd3'); await mv('e1', 'g1'); await shot('09-train-answer');
await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(1300);
await mv('g5', 'f7'); await page.waitForTimeout(300); await shot('10-train-punish');
await mv('d1', 'f3'); await mv('b1', 'c3'); await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(1300);
await mv('f3', 'e5'); await shot('11-train-danger-bait');
await mv('f3', 'd4'); await shot('12-train-danger-answer');
await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(1300);
for (const [a, b] of [['d7', 'd5'], ['e7', 'e6'], ['g8', 'f6'], ['f8', 'e7'], ['e8', 'g8']]) { await mv(a, b, false); await page.waitForTimeout(300); }
await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(1300);
await mv('f3', 'e5'); await mv('c4', 'f7'); await mv('c3', 'd5'); await shot('13-train-mate');
await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(1300);
await mv('d7', 'd5', false); await mv('g8', 'f6', false); await page.waitForTimeout(400); await shot('14-train-new-move');
await mv('c7', 'c5', false); await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(1600); await shot('15-session-complete');
await page.getByRole('button', { name: 'Done', exact: true }).click(); await page.waitForTimeout(600); await shot('16-today-done');
await page.goto(url + '#/explore?side=w&p=e4%20e5%20Nf3%20Nc6%20Bc4'); await shot('17-explore', true);
await page.goto(url + '#/repertoire'); await shot('18-repertoire', true);
await page.goto(url + '#/stats'); await shot('19-stats', true);
await page.evaluate(() => document.querySelector('.screen')?.scrollTo(0, 1500)); await page.waitForTimeout(300); await page.screenshot({ path: `${out}19-stats-3.png` });
await page.goto(url + '#/settings'); await shot('20-settings', true);

// app icons
const ip = await browser.newPage();
for (const s of [192, 512]) { await ip.setViewportSize({ width: s, height: s }); await ip.goto(url + 'icon.svg'); await ip.screenshot({ path: new URL(`../public/icon-${s}.png`, import.meta.url).pathname }); }
await browser.close();
server.httpServer.close();
process.exit(0);
