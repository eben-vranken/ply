// End-to-end smoke test on the built app: onboarding, a Today session, every
// tab, Learn and Drill. Fails on any page error. Run `npm run build` first.
import { chromium, webkit, devices } from 'playwright';
import { preview } from 'vite';
import { Chess } from 'chess.js';
import { readFileSync } from 'node:fs';

const server = await preview({ preview: { port: 4180 } });
const url = 'http://localhost:4180/ply/';
// BROWSER=webkit runs it in WebKit (Safari's engine); with DEVICE=iphone as an iPhone 13 (touch, mobile Safari user agent)
const isWebkit = process.env.BROWSER === 'webkit';
const browser = await (isWebkit ? webkit : chromium).launch();
const ctx = await browser.newContext(process.env.DEVICE === 'iphone' ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: !isWebkit });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const out = process.env.SHOTS ?? '';
const shot = async (n: string) => { if (out) await page.screenshot({ path: `${out}/${n}.png` }); };
const step = (s: string) => console.log('·', s);
step(`${isWebkit ? 'WebKit' : 'Chromium'}${process.env.DEVICE === 'iphone' ? ' as iPhone 13' : ''}`);

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
// Safari's 7-day storage rule is explained on Safari only; the vibration switch shows only where vibration exists
const risk = await page.getByText('Keep Ply on your Home Screen').isVisible();
if (risk !== isWebkit) errors.push(`storage note visible: ${risk} in ${isWebkit ? 'WebKit' : 'Chromium'}`);
await page.goto(url + '#/settings'); await page.waitForTimeout(400);
const vib = await page.getByText('Vibration', { exact: true }).isVisible();
if (vib !== (await page.evaluate(() => typeof navigator.vibrate === 'function'))) errors.push('vibration switch shown where vibration does not exist');
step(`storage note ${risk ? 'shown' : 'hidden'}, vibration switch ${vib ? 'shown' : 'hidden'}`);
await page.goto(url + '#/today'); await page.waitForTimeout(400);
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
  if (await page.getByRole('button', { name: /^(Continue|Next puzzle)$/ }).isVisible().catch(() => false)) {
    answered++;
    if (answered === 1) await shot('answer');
    await page.getByRole('button', { name: /^(Continue|Next puzzle)$/ }).click();
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
  let fix = after.match(/(?:move is|Play|safe move is) ([^ .]+)/);
  // puzzles keep the answer back after a miss: Show me names it
  if (!fix && await page.getByRole('button', { name: 'Show me' }).isEnabled().catch(() => false)) {
    await page.getByRole('button', { name: 'Show me' }).click(); await page.waitForTimeout(200);
    fix = (await page.locator('.prompt').innerText().catch(() => '')).replace(/\s+/g, ' ').match(/move is ([^ .]+)/);
  }
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

// promotion: the pawn on b7 takes on a8 and becomes a knight, on the Explore board and in Play it out
const PROMO = 'e2e4%20d7d5%20e4d5%20c7c6%20d5c6%20g8f6%20c6b7%20b8d7';
const promote = async (scope: string) => {
  const b = (await page.locator(`${scope} cg-board`).boundingBox())!;
  const c = b.width / 8;
  await page.mouse.click(b.x + 1.5 * c, b.y + 1.5 * c); await page.waitForTimeout(80); // b7
  await page.mouse.click(b.x + 0.5 * c, b.y + 0.5 * c); await page.waitForTimeout(300); // a8
  await page.getByRole('dialog', { name: 'Promote to' }).getByRole('button', { name: 'Knight' }).click();
  await page.waitForTimeout(400);
};
await page.goto(url + '#/explore?side=w&p=' + PROMO);
await page.waitForTimeout(900);
await promote('.bw');
const crumb = await page.locator('.crumb.cur').innerText();
if (!crumb.includes('bxa8=N')) errors.push('explore promotion: expected bxa8=N, got ' + crumb);
step('explore promotion: ' + crumb.replace(/\s+/g, ''));
await page.goto(url + '#/play?side=w&p=' + PROMO);
await page.waitForTimeout(2500);
await promote('.room');
await page.waitForTimeout(600);
const strip = await page.locator('.room .strip').innerText();
if (!strip.includes('bxa8=N')) errors.push('play-out promotion: expected bxa8=N in ' + strip);
step('play-out promotion: ' + (strip.includes('bxa8=N') ? 'bxa8=N' : strip.replace(/\s+/g, ' ')));

// keyboard: moves typed in SAN on the Explore board, Backspace steps back; a Today card answered by typing
await page.goto(url + '#/explore?side=w');
await page.waitForTimeout(900);
for (const k of ['e4', 'e5', 'nf3']) { await page.keyboard.type(k); await page.waitForTimeout(150); }
let crumbs = (await page.locator('.crumbs').innerText()).replace(/\s+/g, ' ');
if (!crumbs.includes('2.Nf3')) errors.push('typed moves: expected 2.Nf3 in ' + crumbs);
await page.keyboard.press('Backspace'); await page.waitForTimeout(200);
crumbs = (await page.locator('.crumbs').innerText()).replace(/\s+/g, ' ');
if (crumbs.includes('Nf3')) errors.push('Backspace should step back: ' + crumbs);
step('keyboard in Explore: ' + crumbs);
await page.goto(url + '#/today'); await page.waitForTimeout(600);
await page.getByRole('button', { name: /Start|Continue/ }).click();
await page.waitForSelector('.room');
let typedOk = false, hinted = false;
for (let i = 0; i < 40 && !typedOk; i++) {
  await page.waitForTimeout(300);
  const prompt = (await page.locator('.prompt').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const want = prompt.match(/(?:move is|Play|safe move is) ([^ .]+)/)?.[1];
  const hintOn = await page.getByRole('button', { name: 'Hint' }).isEnabled().catch(() => false);
  if (want && hintOn) {
    await page.keyboard.type(want); await page.waitForTimeout(400);
  } else if (hintOn && !hinted) {
    // ? shows the hint; then a wrong move typed on purpose makes the trainer name the right one
    await page.keyboard.type('?'); await page.waitForTimeout(200);
    hinted = (await page.locator('.prompt').innerText()).includes('This piece moves');
    const fen = await page.locator('.room .slab').getAttribute('data-fen');
    const legal = new Chess(fen!).moves();
    await page.keyboard.type(legal[legal.length - 1]); await page.waitForTimeout(300);
  } else if (hintOn && await page.getByRole('button', { name: 'Show me' }).isEnabled().catch(() => false)) {
    await page.getByRole('button', { name: 'Show me' }).click(); await page.waitForTimeout(200);
  }
  if (await page.getByRole('button', { name: /Continue|Next puzzle/ }).isVisible().catch(() => false)) {
    await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    typedOk = hinted && !(await page.getByRole('button', { name: /Continue|Next puzzle/ }).isVisible().catch(() => false));
  }
}
if (!typedOk) errors.push('could not answer a card and move on with the keyboard');
step('keyboard in a session: ' + (typedOk ? 'answered by typing, Enter moved on' : 'failed'));
await page.keyboard.press('Escape'); await page.waitForTimeout(400);

// PGN import: a Black repertoire pasted without an Orientation header, with a variation and a comment
await page.goto(url + '#/repertoire'); await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Import PGN' }).click();
await page.getByRole('button', { name: 'Paste', exact: true }).click();
await page.getByLabel('PGN').fill('1. e4 c6 2. d4 d5 3. e5 (3. exd5 cxd5 { The Exchange. }) 3... Bf5 4. Nf3 e6 *');
await page.getByRole('button', { name: 'Read the PGN' }).click();
await page.getByRole('button', { name: 'I play Black' }).click();
await page.waitForTimeout(400);
const summary = (await page.locator('.sheet .sum').innerText()).replace(/\s+/g, ' ');
step('import preview: ' + summary.slice(0, 90));
await shot('import-preview');
await page.getByRole('button', { name: 'Add to my repertoire' }).click();
await page.waitForTimeout(1200);
const imported = await page.locator('.toast').innerText().catch(() => '');
if (!/Imported \d+ position/.test(imported)) errors.push('PGN import did not finish: ' + imported);
step('import: ' + imported);
// PGN export: the whole repertoire downloads as one file that reads back
await page.getByRole('button', { name: 'Export PGN' }).click();
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), page.getByRole('button', { name: 'Everything' }).click()]);
const exported = readFileSync((await dl.path())!, 'utf8');
const games = (exported.match(/\[Event /g) ?? []).length;
if (games !== 2 || !exported.includes('[Orientation "black"]')) errors.push('export: expected a White and a Black game');
step(`export: ${dl.suggestedFilename()} · ${games} games · ${Math.round(exported.length / 1024)} KB`);

// backup: export from Settings, then import the same file through the Settings screen
await page.goto(url + '#/settings'); await page.waitForTimeout(600);
const [bk] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), page.getByRole('button', { name: 'Export backup' }).click()]);
const bkPath = (await bk.path())!;
await page.locator('input[type=file][accept*=json]').setInputFiles({ name: bk.suggestedFilename(), mimeType: 'application/json', buffer: readFileSync(bkPath) });
await page.getByRole('button', { name: 'Replace and import' }).click();
const restored = await page.getByText('Backup imported').waitFor({ timeout: 15_000 }).then(() => true, () => false);
if (!restored) errors.push('backup import from Settings did not finish');
step('backup: exported ' + bk.suggestedFilename() + (restored ? ' and imported back' : ', import FAILED'));

// the landing page: in a build without accounts it lives at #/welcome and its buttons open the app
await page.goto(url + '#/welcome');
await page.locator('.landing h1').waitFor({ timeout: 20_000 });
const pitch = (await page.locator('.landing h1').innerText()).replace(/\s+/g, ' ');
// the numbers count up once they are seen
await page.locator('.landing .facts').scrollIntoViewIfNeeded();
await page.waitForTimeout(1800);
const facts = (await page.locator('.landing .facts').innerText()).replace(/\s+/g, ' ');
const openings = JSON.parse(readFileSync(new URL('../public/data/openings.json', import.meta.url), 'utf8')).length as number;
if (!/Openings that stay learned/.test(pitch)) errors.push('landing headline: ' + pitch);
if (!facts.includes(openings.toLocaleString('en'))) errors.push(`landing: expected ${openings.toLocaleString('en')} openings in "${facts}"`);
if (!(await page.locator('.landing .demo cg-board').isVisible())) errors.push('landing: the hero board is missing');
await page.locator('.landing .top .in').click();
await page.waitForSelector('h1:text("Today")', { timeout: 10_000 });
step(`landing: "${pitch}", ${openings.toLocaleString('en')} openings, button opens the app`);
await shot('landing');

// a desktop-sized window: the sidebar instead of the tab bar, the command palette, a card answered by typing
if (process.env.DEVICE !== 'iphone') {
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const d = await dctx.newPage();
  d.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message));
  d.on('console', (m) => { if (m.type() === 'error') errors.push('desktop console: ' + m.text()); });
  await d.goto(url);
  await d.getByText('Set up Ply').click({ timeout: 30_000 });
  for (const t of ['Continue', 'Continue', 'Skip and start']) await d.getByText(t).click();
  await d.waitForSelector('h1:text("Today")', { timeout: 15_000 });
  if (!(await d.locator('aside.sb').isVisible())) errors.push('desktop: no sidebar');
  if (await d.locator('nav[aria-label="Main"] .lbl').first().isHidden()) errors.push('desktop: sidebar labels hidden at 1440');
  if (!(await d.locator('.queue').isVisible())) errors.push('desktop: Today has no queue card');
  await d.locator('aside.sb').getByText('Explore').click();
  await d.waitForSelector('.screen.ex');
  await d.keyboard.press('Control+k');
  await d.getByRole('dialog', { name: 'Jump to' }).waitFor();
  await d.keyboard.type('caro-kann');
  await d.waitForTimeout(300);
  await d.keyboard.press('Enter');
  await d.waitForTimeout(900);
  const jumped = d.url();
  if (!/#\/(tree|explore)\?/.test(jumped)) errors.push('desktop: the palette did not open an opening: ' + jumped);
  const where = (await d.locator('.ttl, .where .nm').first().innerText()).replace(/\s+/g, ' ');
  if (!/Caro-Kann/.test(where)) errors.push('desktop: palette opened ' + where);
  await d.goto(url + '#/today'); await d.waitForTimeout(500);
  await d.getByRole('button', { name: /Start|Continue/ }).first().click();
  await d.waitForSelector('.room');
  let dOk = false;
  for (let i = 0; i < 30 && !dOk; i++) {
    await d.waitForTimeout(300);
    const want = (await d.locator('.prompt').innerText({ timeout: 500 }).catch(() => '')).replace(/\s+/g, ' ').match(/(?:move is|Play|safe move is) ([^ .]+)/)?.[1];
    if (want && (await d.getByRole('button', { name: 'Hint' }).isEnabled().catch(() => false))) await d.keyboard.type(want);
    dOk = await d.getByRole('button', { name: /Continue|Next puzzle/ }).isVisible().catch(() => false);
  }
  if (!dOk) errors.push('desktop: could not answer a card by typing');
  if (out) await d.screenshot({ path: `${out}/desktop-answer.png` });
  await d.keyboard.press('Escape'); await d.waitForTimeout(500);
  if (!(await d.locator('aside.sb').isVisible())) errors.push('desktop: the sidebar did not come back after the session');
  step(`desktop 1440×900: sidebar, palette → ${where}, ${dOk ? 'a card answered by typing' : 'typing FAILED'}`);
  await dctx.close();
}

console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no page errors');
await browser.close();
server.httpServer.close();
process.exit(errors.length ? 1 : 0);
