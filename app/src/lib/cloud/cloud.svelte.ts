// Accounts and sync with Supabase (docs/DECISIONS.md, "Accounts and sync"). With
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set, Ply asks you to log in first and keeps your
// progress on your account; without them (local builds, forks, CI) it runs on this device only,
// exactly as before, and this module does nothing. Only the public anon key is ever used here.
import type { SupabaseClient } from '@supabase/supabase-js';
import { rawDb, SYNCED, type SyncedTable } from '../db';
import { syncOnce, KEYS, type Remote, type ServerRow, type SyncMeta } from './engine';
import { applyRemote, resetAllProgress, model } from '../model.svelte';
import { app, save, resetSettings, route } from '../state.svelte';

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
/** Accounts are on in this build. */
export const configured = !!(URL_ && KEY);

export const cloud = $state({
  /** the session is known (or accounts are off) */
  ready: !configured,
  user: null as null | { id: string; email: string; via: string; name: string },
  status: 'idle' as 'idle' | 'syncing' | 'offline' | 'error',
  error: '',
  lastAt: 0,
  /** the first sync for this account on this device is running (onboarding waits for it) */
  restoring: false,
  /** a login link or code was sent to this address */
  sentTo: '',
  authError: ''
});

let sb: SupabaseClient | null = null;
async function client(): Promise<SupabaseClient> {
  if (sb) return sb;
  const { createClient } = await import('@supabase/supabase-js');
  sb = createClient(URL_, KEY, {
    // the callback URL is handled below: the app's own router uses the hash, and Lichess
    // comes back with a ?code= of its own
    auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey: 'ply-auth' }
  });
  return sb;
}

/** Where login providers send you back: the app itself, without the hash route. */
const appUrl = () => location.origin + location.pathname;

function setUser(u: { id: string; email?: string; app_metadata?: { provider?: string }; user_metadata?: Record<string, unknown> } | null | undefined) {
  if (!u) { cloud.user = null; return; }
  const meta = u.user_metadata ?? {};
  const lichess = meta.lichess_username as string | undefined;
  const via = lichess ? 'Lichess' : u.app_metadata?.provider === 'google' ? 'Google' : 'email';
  cloud.user = { id: u.id, email: u.email ?? '', via, name: lichess ?? (meta.full_name as string | undefined) ?? u.email ?? '' };
}

/** Start: restore the session, finish a login that just came back to the app. */
export async function initCloud() {
  if (!configured) return;
  try {
    const c = await client();
    c.auth.onAuthStateChange((event, session) => {
      setUser(session?.user);
      if (event === 'SIGNED_IN') {
        // a new device waits for the account's data before onboarding
        if (!app.onboarded) cloud.restoring = true;
        void requestSync();
      }
    });
    await finishRedirect(c);
    const { data } = await c.auth.getSession();
    setUser(data.session?.user);
    const m = (await rawDb().meta.get('sync'))?.value as SyncMeta | undefined;
    if (m && m.user === cloud.user?.id) cloud.lastAt = m.lastAt;
  } catch (e) {
    cloud.authError = msg(e);
  } finally {
    cloud.ready = true;
  }
  addEventListener('online', () => void requestSync());
  addEventListener('offline', () => { if (cloud.status !== 'syncing') cloud.status = 'offline'; });
  // coming back to the app counts as opening it
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - cloud.lastAt > 5 * 60_000) void requestSync(); });
}

async function finishRedirect(c: SupabaseClient) {
  const u = new URL(location.href);
  const code = u.searchParams.get('code'), state = u.searchParams.get('state');
  const err = u.searchParams.get('error_description') ?? u.searchParams.get('error');
  if (!code && !err) return;
  history.replaceState(null, '', location.pathname + location.hash);
  if (err) { cloud.authError = err; return; }
  try {
    if (state?.startsWith('lichess.')) await finishLichess(c, code!, state);
    else {
      const { error } = await c.auth.exchangeCodeForSession(code!);
      if (error) throw error;
    }
  } catch (e) {
    cloud.authError = /code verifier|flow state/i.test(msg(e)) ? 'That link was opened in a different browser than the one you asked from. Type the 6-digit code from the email instead.' : msg(e);
  }
}

// ---------------------------------------------------------------- logging in
export async function sendEmail(email: string) {
  cloud.authError = '';
  const { error } = await (await client()).auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: appUrl(), shouldCreateUser: true } });
  if (error) { cloud.authError = error.message; return false; }
  cloud.sentTo = email.trim();
  return true;
}
export async function verifyCode(code: string) {
  cloud.authError = '';
  const { error } = await (await client()).auth.verifyOtp({ email: cloud.sentTo, token: code.replace(/\s/g, ''), type: 'email' });
  if (error) { cloud.authError = error.message; return false; }
  cloud.sentTo = '';
  return true;
}
export async function withGoogle() {
  cloud.authError = '';
  const { error } = await (await client()).auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } });
  if (error) cloud.authError = error.message;
}

// Lichess: OAuth with PKCE straight to lichess.org (no app registration needed), then the
// `lichess-login` Edge Function swaps the code for the Lichess account and returns a one-time
// Supabase login for it (supabase/functions/lichess-login).
const LICHESS = 'https://lichess.org';
const LICHESS_CLIENT = 'ply';
const PKCE_KEY = 'ply-lichess-pkce';
const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function withLichess() {
  cloud.authError = '';
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = 'lichess.' + b64url(crypto.getRandomValues(new Uint8Array(12)));
  localStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  const q = new URLSearchParams({ response_type: 'code', client_id: LICHESS_CLIENT, redirect_uri: appUrl(), code_challenge_method: 'S256', code_challenge: challenge, state });
  location.assign(`${LICHESS}/oauth?${q}`);
}
async function finishLichess(c: SupabaseClient, code: string, state: string) {
  const saved = JSON.parse(localStorage.getItem(PKCE_KEY) ?? 'null') as { verifier: string; state: string } | null;
  localStorage.removeItem(PKCE_KEY);
  if (!saved || saved.state !== state) throw new Error('That Lichess login was started in another browser. Try again here.');
  const { data, error } = await c.functions.invoke('lichess-login', { body: { code, verifier: saved.verifier, redirectUri: appUrl(), clientId: LICHESS_CLIENT } });
  if (error) throw new Error('Lichess login failed: ' + msg(error));
  const r = data as { token_hash: string; username: string };
  const v = await c.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' });
  if (v.error) throw v.error;
  if (!app.lichessUser) { app.lichessUser = r.username; save(); }
}

// ---------------------------------------------------------------- sync
class SupabaseRemote implements Remote {
  constructor(private c: SupabaseClient, private user: string) {}
  async pull(t: SyncedTable, since: string | null, afterSeq: number, limit: number) {
    let q = this.c.from(t).select('*').gt('seq', afterSeq).order('seq').limit(limit);
    if (since) q = q.gt('synced_at', since);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as ServerRow[];
  }
  async push(t: SyncedTable, rows: ServerRow[]) {
    const { error } = await this.c.from(t).upsert(rows.map((r) => ({ ...r, user_id: this.user })), { onConflict: ['user_id', ...KEYS[t]].join(',') });
    if (error) throw new Error(error.message);
  }
}

let running: Promise<boolean> | null = null;
let again = false;
/** Sync now, or right after the sync that is running. False when it failed. */
export function requestSync(): Promise<boolean> {
  if (!configured || !cloud.user) return Promise.resolve(false);
  // the app syncs once its data has loaded (App.svelte), so pulled rows reach the screens
  if (model.status !== 'ready' && !running) return Promise.resolve(false);
  if (running) { again = true; return running; }
  running = (async () => {
    let ok = false;
    do { again = false; ok = await syncNowOnce(); } while (again && ok);
    running = null;
    return ok;
  })();
  return running;
}
/** Automatic syncs wait while you are in a session (the trainer holds cards in memory). */
export function autoSyncCloud() {
  const base = route.path.split('?')[0];
  if (base === '/train' || base === '/play') return;
  void requestSync();
}

const LABEL: Record<SyncedTable, [string, string]> = { settings: ['setting', 'settings'], repertoire: ['repertoire position', 'repertoire positions'], book: ['book reply', 'book replies'], cards: ['card', 'cards'], reviews: ['review', 'reviews'], games: ['game', 'games'] };

async function syncNowOnce(): Promise<boolean> {
  const user = cloud.user!;
  if (!navigator.onLine) { cloud.status = 'offline'; cloud.restoring = false; return false; }
  cloud.status = 'syncing';
  const m = (await rawDb().meta.get('sync'))?.value as SyncMeta | undefined;
  const first = !m || m.user !== user.id;
  if (first) cloud.restoring = true;
  try {
    const c = await client();
    const r = await syncOnce(new SupabaseRemote(c, user.id), rawDb(), user.id, Date.now, app.onboarded);
    if (r.changed.size) await applyRemote(r.changed);
    cloud.status = 'idle'; cloud.error = ''; cloud.lastAt = Date.now();
    if (r.first) {
      const parts = (['cards', 'reviews', 'repertoire', 'games'] as SyncedTable[]).filter((t) => r.pulled[t]).map((t) => `${r.pulled[t]!.toLocaleString('en')} ${LABEL[t][r.pulled[t] === 1 ? 0 : 1]}`);
      if (parts.length) model.notice = `From your account: ${parts.join(', ')}. Everything on this device was kept too.`;
    }
    return true;
  } catch (e) {
    cloud.status = navigator.onLine ? 'error' : 'offline';
    cloud.error = msg(e);
    return false;
  } finally {
    cloud.restoring = false;
  }
}

/** "Synced 2 min ago", "Offline, will sync later", … */
export function syncLabel(now = Date.now()): string {
  if (cloud.status === 'syncing') return 'Syncing…';
  if (cloud.status === 'offline') return 'Offline, will sync later';
  if (cloud.status === 'error') return 'Sync failed: ' + cloud.error;
  if (!cloud.lastAt) return 'Not synced yet';
  const s = Math.round((now - cloud.lastAt) / 1000);
  if (s < 60) return 'Synced just now';
  if (s < 3600) return `Synced ${Math.round(s / 60)} min ago`;
  if (s < 86400) return `Synced ${Math.round(s / 3600)} h ago`;
  return 'Synced ' + new Date(cloud.lastAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------- leaving
/** Changes on this device the account does not have yet (rows written since the last push). */
export async function unsynced(): Promise<number> {
  const m = (await rawDb().meta.get('sync'))?.value as SyncMeta | undefined;
  const mark = m && m.user === cloud.user?.id ? m.pushMark : -Infinity;
  let n = await rawDb().tomb.where('at').aboveOrEqual(mark).count();
  for (const t of SYNCED) n += await rawDb().table(t).where('updatedAt').aboveOrEqual(mark).count();
  return n;
}

async function wipeDevice() {
  await resetAllProgress();
  resetSettings();
  try { localStorage.removeItem(PKCE_KEY); } catch { /* private mode */ }
  history.replaceState(null, '', location.pathname + '#/today');
}

/** Log out: a last sync, then this device is cleared; logging in again brings it all back. */
export async function logOut(force = false): Promise<{ ok: true } | { ok: false; pending: number }> {
  if (!force && !(await requestSync())) return { ok: false, pending: await unsynced() };
  await (await client()).auth.signOut({ scope: 'local' });
  await wipeDevice();
  location.reload();
  return { ok: true };
}

/** Delete the account and everything synced to it, then clear this device. */
export async function deleteAccount() {
  const c = await client();
  const { error } = await c.rpc('delete_my_account');
  if (error) throw new Error(error.message);
  await c.auth.signOut({ scope: 'local' });
  await wipeDevice();
  location.reload();
}

/**
 * Reset all progress, on the account too: every synced row becomes a deletion, so the reset
 * reaches your other devices. This device then starts over from onboarding; what it writes
 * after the reset counts as newer than the deletions.
 */
export async function resetAccount(): Promise<number | undefined> {
  if (!configured || !cloud.user) return undefined;
  const c = await client();
  const at = Date.now();
  for (const t of SYNCED) {
    const { error } = await c.from(t).update({ deleted: true, data: null, updated_at: at }).eq('user_id', cloud.user.id).eq('deleted', false);
    if (error) throw new Error(error.message);
  }
  return at + 1;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e));
