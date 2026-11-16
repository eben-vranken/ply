// Two devices, one account: each browser context is a device with its own storage. They log in
// with the same email and password, train, go offline and train more, then come back online and sync; they
// must end up holding the same data with nothing lost. Then one logs out (the device is
// cleared) and logs back in (everything returns).
//
// Supabase is stood in for: the app is built pointing at http://supabase.test and Playwright
// answers those requests from Node, with the server's rules from lib/cloud/engine.ts
// (MemoryRemote mirrors supabase/migrations, which is checked against Postgres separately).
// Run: npm run devices (builds into dist-devices/ first).
import { chromium, type BrowserContext, type Page, type Route } from 'playwright';
import { build, preview } from 'vite';
import { Chess } from 'chess.js';
import { MemoryRemote, toServer, KEYS, type ServerRow } from '../src/lib/cloud/engine';
import { SYNCED, rowKey, type SyncedTable } from '../src/lib/db';
import { stable } from '../src/lib/cloud/merge';

const SB = 'http://supabase.test';
process.env.VITE_SUPABASE_URL = SB;
process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_test';
const outDir = 'dist-devices';
await build({ logLevel: 'warn', build: { outDir, emptyOutDir: true } });
const server = await preview({ preview: { port: 4181 }, build: { outDir } });
const url = 'http://localhost:4181/ply/';
const step = (s: string) => console.log('·', s);
const fails: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) fails.push(what); step((ok ? 'ok   ' : 'FAIL ') + what); };

// ---------------------------------------------------------------- the stand-in Supabase
const remote = new MemoryRemote();
const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'player@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-11-16T00:00:00Z' };
const PASSWORD = 'correct horse battery';
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, email: USER.email, role: 'authenticated', aud: 'authenticated', exp })}.sig`, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresh', user: USER };
};
const requests: string[] = [];
/** requests to anywhere but the app and the stand-in Supabase (there must be none) */
const elsewhere: string[] = [];
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
async function supabase(route: Route) {
  const req = route.request();
  const u = new URL(req.url());
  requests.push(`${req.method()} ${u.pathname}`);
  const json = (status: number, body: unknown) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const p = u.pathname;
  if (p === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password') {
    const b = req.postDataJSON() as { email?: string; password?: string };
    return b.email === USER.email && b.password === PASSWORD ? json(200, session()) : json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
  }
  if (p === '/auth/v1/token') return json(200, session());
  if (p === '/auth/v1/user') return json(200, USER);
  if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
  const m = p.match(/^\/rest\/v1\/(\w+)$/);
  if (m && (SYNCED as readonly string[]).includes(m[1])) {
    const t = m[1] as SyncedTable;
    if (req.method() === 'GET') {
      const seq = Number((u.searchParams.get('seq') ?? 'gt.0').slice(3));
      const since = u.searchParams.get('synced_at')?.slice(3) ?? null;
      const rows = await remote.pull(t, since, seq, Number(u.searchParams.get('limit') ?? 1000));
      return json(200, rows.map((r) => ({ ...r, user_id: USER.id })));
    }
    if (req.method() === 'POST') {
      const conflict = u.searchParams.get('on_conflict');
      if (conflict !== ['user_id', ...KEYS[t]].join(',')) return json(400, { message: 'bad on_conflict ' + conflict });
      const rows = (req.postDataJSON() as (ServerRow & { user_id: string })[]);
      if (rows.some((r) => r.user_id !== USER.id)) return json(403, { message: 'row level security' });
      await remote.push(t, rows.map(({ user_id: _u, ...r }) => r as ServerRow));
      return route.fulfill({ status: 201, headers: cors, body: '' });
    }
  }
  return json(404, { message: 'not stood in for: ' + req.method() + ' ' + p });
}

// ---------------------------------------------------------------- devices
const browser = await chromium.launch();
async function device(name: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await ctx.route(SB + '/**', supabase);
  ctx.on('request', (r) => { const h = new URL(r.url()).host; if (h !== 'localhost:4181' && h !== 'supabase.test') elsewhere.push(r.url()); });
  const page = await ctx.newPage();
  devs.push({ name, ctx, page });
  page.on('pageerror', (e) => fails.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) fails.push(`${name} console: ${m.text()}`); });
  return { name, ctx, page };
}
type Dev = { name: string; ctx: BrowserContext; page: Page };

async function logIn(d: Dev) {
  // the landing's panel opens on a new account; this one exists
  await d.page.getByRole('button', { name: 'Have an account? Log in' }).click({ timeout: 30_000 });
  await d.page.getByLabel('Email address').fill(USER.email);
  await d.page.getByLabel('Password').fill(PASSWORD);
  await d.page.getByRole('button', { name: 'Log in', exact: true }).click();
}
const onToday = (d: Dev) => d.page.waitForSelector('h1:text("Today")', { timeout: 30_000 });

/** Play a Today session: the move the app names, else the first legal guess and then its fix. */
async function train(d: Dev, cards: number) {
  const page = d.page;
  await page.goto(url + '#/today'); await page.waitForTimeout(500);
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
  let answered = 0;
  for (let i = 0; i < 300 && answered < cards; i++) {
    if (await page.getByText(/Session complete|All learned/).isVisible().catch(() => false)) break;
    if (await page.getByRole('button', { name: 'Continue', exact: true }).isVisible().catch(() => false)) { answered++; await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.waitForTimeout(400); continue; }
    if (!(await page.getByRole('button', { name: 'Hint' }).isEnabled().catch(() => false))) { await page.waitForTimeout(250); continue; }
    const msg = (await page.locator('.prompt').innerText().catch(() => '')).replace(/\s+/g, ' ');
    const named = msg.match(/(?:move is|Play|safe move is) ([^ .]+)/);
    if (named) { await playSan(named[1]); continue; }
    const fen = await page.locator('.room .slab').getAttribute('data-fen');
    await playSan(new Chess(fen!).moves()[0]);
    await page.waitForTimeout(300);
    let fix = (await page.locator('.prompt').innerText().catch(() => '')).replace(/\s+/g, ' ').match(/(?:move is|Play|safe move is) ([^ .]+)/);
    // puzzles keep the answer back after a miss: Show me names it
    if (!fix && await page.getByRole('button', { name: 'Show me' }).isEnabled().catch(() => false)) {
      await page.getByRole('button', { name: 'Show me' }).click(); await page.waitForTimeout(200);
      fix = (await page.locator('.prompt').innerText().catch(() => '')).replace(/\s+/g, ' ').match(/move is ([^ .]+)/);
    }
    if (fix) await playSan(fix[1]);
  }
  // leaving the session syncs it
  await page.locator('.room .x').click();
  await page.waitForTimeout(800);
  return answered;
}

/** Everything a device holds, as the server would store it (device-only settings left out). */
async function dump(d: Dev) {
  const raw = await d.page.evaluate(async (tables) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('ply'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const out: Record<string, unknown[]> = {};
    for (const t of tables) out[t] = await new Promise((res) => { const r = db.transaction(t).objectStore(t).getAll(); r.onsuccess = () => res(r.result); });
    db.close();
    return out;
  }, [...SYNCED]);
  const out: Record<string, Record<string, string>> = {};
  for (const t of SYNCED) {
    out[t] = {};
    for (const r of raw[t] as Record<string, unknown>[]) out[t][rowKey(t, r)] = stable(toServer(t, r).data);
  }
  return out;
}
const count = (s: Record<string, Record<string, string>>) => Object.fromEntries(SYNCED.map((t) => [t, Object.keys(s[t]).length]));
async function syncNow(d: Dev) {
  await d.page.goto(url + '#/settings');
  await d.page.locator('section', { hasText: 'Logged in with' }).getByRole('button', { name: /Sync now/ }).click();
  await d.page.getByText(/Synced just now/).waitFor({ timeout: 20_000 });
}
function same(a: Record<string, Record<string, string>>, b: Record<string, Record<string, string>>, what: string) {
  for (const t of SYNCED) {
    const ka = Object.keys(a[t]).sort(), kb = Object.keys(b[t]).sort();
    const missing = ka.filter((k) => !(k in b[t])).length + kb.filter((k) => !(k in a[t])).length;
    const differ = ka.filter((k) => k in b[t] && a[t][k] !== b[t][k]);
    check(!missing && !differ.length, `${what}: ${t} identical (${ka.length} rows${missing ? `, ${missing} on one side only` : ''}${differ.length ? `, ${differ.length} differ, e.g. ${differ[0]}` : ''})`);
  }
}

const devs: Dev[] = [];
const SHOTS = process.env.SHOTS ?? '';
const onFail = async (e: unknown) => {
  console.log('FAILED', e); console.log(fails.join('\n'));
  for (const d of devs) { if (SHOTS) await d.page.screenshot({ path: `${SHOTS}/device-${d.name}.png` }).catch(() => {}); console.log(`--- ${d.name} at ${d.page.url()}\n` + (await d.page.locator('body').innerText().catch(() => '')).slice(0, 1500)); }
  process.exit(1);
};
process.on('unhandledRejection', onFail);
process.on('uncaughtException', onFail);

// 1. A logs in, onboards and trains; the session syncs
const A = await device('A');
await A.page.goto(url);
await logIn(A);
await A.page.getByText('Set up Ply').click({ timeout: 30_000 });
await A.page.getByText('Continue').click();
await A.page.getByText('Continue').click();
await A.page.getByText('Skip and start').click();
await onToday(A);
await A.page.goto(url + '#/settings'); await A.page.getByText('Move on after a clean answer').click(); await A.page.waitForTimeout(300);
step(`A trained ${await train(A, 6)} cards online`);
await syncNow(A);
const aFirst = await dump(A);
check(remote.rows.size > 0 && aFirst.reviews && Object.keys(aFirst.reviews).length > 0, `A's progress is on the account (${remote.rows.size} rows)`);

// 2. B logs in: no onboarding, A's progress arrives
const B = await device('B');
await B.page.goto(url);
await logIn(B);
await onToday(B);
check(!(await B.page.getByText('Set up Ply').isVisible().catch(() => false)), 'B skipped onboarding: the account had progress');
await B.page.waitForTimeout(1500);
same(aFirst, await dump(B), 'after B logged in');
await B.page.goto(url + '#/settings'); await B.page.waitForTimeout(300);
check(await B.page.getByRole('switch', { name: /Move on after a clean answer/ }).isChecked().then((c) => !c, () => true), 'B took A\'s settings');

// 3. both go offline and train; each changes a different setting
await A.ctx.setOffline(true); await B.ctx.setOffline(true);
step(`offline: A trained ${await train(A, 5)}, B trained ${await train(B, 4)}`);
await A.page.goto(url + '#/settings');
check(await A.page.getByText('Offline, will sync later').isVisible({ timeout: 5_000 }).catch(() => false), 'A shows "Offline, will sync later"');
await A.page.getByRole('button', { name: 'More New moves' }).click();
await B.page.goto(url + '#/settings');
await B.page.getByRole('button', { name: '250' }).click();
const aOff = await dump(A), bOff = await dump(B);
step(`offline: A ${JSON.stringify(count(aOff))}`);
step(`offline: B ${JSON.stringify(count(bOff))}`);

// 4. back online: they sync (A on the online event, then each with Sync now)
await A.ctx.setOffline(false); await B.ctx.setOffline(false);
await A.page.waitForTimeout(1500);
await syncNow(B); await syncNow(A); await syncNow(B);
const aEnd = await dump(A), bEnd = await dump(B);
same(aEnd, bEnd, 'after both synced');
for (const [n, off] of [['A', aOff], ['B', bOff]] as const) {
  const lost = Object.keys(off.reviews).filter((k) => !(k in aEnd.reviews));
  check(!lost.length, `no review from ${n}'s offline training lost (${Object.keys(off.reviews).length} kept)`);
  const lostCards = Object.keys(off.cards).filter((k) => !(k in aEnd.cards));
  check(!lostCards.length, `no card from ${n} lost`);
}
const union = new Set([...Object.keys(aOff.reviews), ...Object.keys(bOff.reviews)]).size;
check(Object.keys(aEnd.reviews).length === union, `reviews are the union of both devices (${union})`);
const app = JSON.parse(aEnd.settings.app) as { value: { newMoves: number; goal: number } };
check(app.value.newMoves === 11 && app.value.goal === 250, `settings merged per key (new moves ${app.value.newMoves} from A, goal ${app.value.goal} from B)`);
// every card on both devices is the version with the latest review
for (const [k, v] of Object.entries(aEnd.cards)) {
  const lr = (s?: string) => (s ? +new Date((JSON.parse(s).fsrs?.last_review as string) ?? 0) : 0);
  if (lr(v) < Math.max(lr(aOff.cards[k]), lr(bOff.cards[k]))) { check(false, `card ${k} kept the later review`); break; }
}

// 5. B logs out (cleared), logs back in (everything returns)
await B.page.goto(url + '#/settings');
await B.page.getByRole('button', { name: 'Log out' }).click();
await B.page.getByLabel('Email address').waitFor({ timeout: 20_000 });
const cleared = await dump(B);
check(Object.keys(cleared.cards).length === 0 && Object.keys(cleared.reviews).length === 0, 'logging out cleared B');
await logIn(B);
await onToday(B);
await B.page.waitForTimeout(1500);
same(aEnd, await dump(B), 'after B logged back in');

step(`${requests.length} requests to the stand-in Supabase`);
check(!elsewhere.length, `no requests anywhere else${elsewhere.length ? ': ' + elsewhere.slice(0, 3).join(', ') : ''}`);
await browser.close();
server.httpServer.close();
console.log(fails.length ? 'FAILED\n' + fails.join('\n') : 'two devices: all checks passed');
process.exit(fails.length ? 1 : 0);
