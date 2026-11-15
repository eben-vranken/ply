// End-to-end smoke test on the built app: onboarding, a Today session, every
// tab, Learn and Drill. Fails on any page error. Run `npm run build` first.
import { chromium } from 'playwright';
import { preview } from 'vite';
import { Chess } from 'chess.js';

const server = await preview({ preview: { port: 4180 } });
const url = 'http://localhost:4180/ply/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const out = process.env.SHOTS ?? '';
const shot = async (n: string) => { if (out) await page.screenshot({ path: `${out}/${n}.png` }); };
const step = (s: string) => console.log('·', s);

process.on('unhandledRejection', async (e) => { console.log('FAILED', e); console.log(errors.join(String.fromCharCode(10))); await shot('failure'); process.exit(1); });
await page.goto(url);
await page.getByText('Set up Ply').click({ timeout: 30_000 });
await page.getByText('Continue').click();
await page.getByText('Continue').click();
await page.getByText('Skip and start').click();
try { await page.waitForSelector('h1:text("Today")', { timeout: 15_000 }); }
catch (e) { await shot('failure'); console.log('FAILED to reach Today'); console.log(errors.join(String.fromCharCode(10))); console.log(await page.locator('body').innerText()); process.exit(1); }
await page.waitForTimeout(800);
await shot('today');
// a clean answer moves on by itself; the script wants every answer screen to wait
await page.goto(url + '#/settings'); await page.getByText('Move on after a clean answer').click(); await page.waitForTimeout(300);
await page.goto(url + '#/today'); await page.waitForTimeout(500);
step('today: ' + (await page.locator('.counts').innerText()).replace(/\s+/g, ' '));

// play the Today session: one deliberately wrong move per question, then the move the app names
await page.getByRole('button', { name: /Start|Continue/ }).click();
await page.waitForSelector('.room');
const click = async (sq: string) => {
  const b = (await page.locator('.room cg-board').boundingBox())!;
  const white = await page.locator('.room .cg-wrap').evaluate((e) => e.classList.contains('orientation-white'));
  const f = sq.charCodeAt(0) - 97, r = +sq[1] - 1, c = b.width / 8;
  await page.mouse.click(b.x + (white ? f : 7 - f) * c + c / 2, b.y + (white ? 7 - r : r) * c + c / 2);
};
const playSan = async (san: string) => {
  const fen = await page.locator('.room .slab').getAttribute('data-fen');
  const mv = new Chess(fen!).move(san);
  await click(mv.from); await page.waitForTimeout(80); await click(mv.to); await page.waitForTimeout(250);
};
let answered = 0, asked = 0;
for (let i = 0; i < 400 && answered < 12; i++) {
  if (await page.getByText(/Session complete|All learned/).isVisible().catch(() => false)) break;
  if (await page.getByRole('button', { name: 'Continue', exact: true }).isVisible().catch(() => false)) {
    answered++;
    if (answered === 1) await shot('answer');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.waitForTimeout(500);
    continue;
  }
  const hintOn = await page.getByRole('button', { name: 'Hint' }).isEnabled().catch(() => false);
  if (!hintOn) { await page.waitForTimeout(250); continue; }
  const msg = (await page.locator('.prompt').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const named = msg.match(/(?:move is|Play|safe move is) ([^ .]+)/);
  if (named) { await playSan(named[1]); asked++; continue; }
  // a wrong legal move first, to exercise the wrong-answer path
  const fen = await page.locator('.room .slab').getAttribute('data-fen');
  const legal = new Chess(fen!).moves();
  await playSan(legal[legal.length - 1]);
  await page.waitForTimeout(300);
  const after = (await page.locator('.prompt').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const fix = after.match(/(?:move is|Play|safe move is) ([^ .]+)/);
  if (fix) await playSan(fix[1]);
  asked++;
  if (asked === 1) await shot('train-wrong');
}
step(`answered ${answered} cards, ${asked} questions`);
await shot('train');
await page.locator('.room .x').click();
await page.waitForTimeout(600);

for (const tab of ['Explore', 'Repertoire', 'Stats', 'Settings']) {
  await page.locator('nav').getByText(tab).click();
  await page.waitForTimeout(900);
  await shot(tab.toLowerCase());
  step(tab + ' ok');
}
await page.goto(url + '#/explore?side=w&p=e2e4%20e7e5%20g1f3%20b8c6%20f1c4');
await page.waitForTimeout(900);
step('explore name: ' + (await page.locator('.where .nm').innerText()));
await shot('explore-italian');
await page.getByRole('button', { name: 'Drill', exact: true }).click();
await page.getByRole('button', { name: 'Lines', exact: true }).click();
await page.waitForTimeout(1500);
await shot('drill');
step('drill started: ' + (await page.locator('.runtitle').innerText().catch(() => 'no')));
await page.locator('.stopbtn').click();
await page.waitForTimeout(500);
await shot('drill-summary');
await page.waitForTimeout(500);

await page.goto(url + '#/play?side=w&p=e2e4%20e7e5%20g1f3%20b8c6%20f1c4%20f8c5');
await page.waitForTimeout(2500);
await playSan('c3');
await page.waitForTimeout(2500);
step('play it out: ' + (await page.locator('.room .msg').innerText().catch(() => 'no message')).replace(/\s+/g, ' ') + ' | eval ' + (await page.locator('.room .ev b').innerText().catch(() => '?')));
await shot('play');

console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no page errors');
await browser.close();
server.httpServer.close();
process.exit(errors.length ? 1 : 0);
