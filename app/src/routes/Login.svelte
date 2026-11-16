<script lang="ts">
  // The first screen when accounts are on: your progress lives on your Ply account.
  import { cloud, sendEmail, verifyCode, withGoogle, withLichess } from '../lib/cloud/cloud.svelte';
  import Icon from '../lib/Icon.svelte';

  let email = $state('');
  let code = $state('');
  let busy = $state(false);
  let online = $state(navigator.onLine);
  $effect(() => {
    const on = () => (online = true), off = () => (online = false);
    addEventListener('online', on); addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  });
  const run = async (f: () => Promise<unknown>) => { busy = true; try { await f(); } finally { busy = false; } };
  const emailOk = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
</script>

<div class="login">
  <div class="body">
    <h1 class="t-name hl">Ply</h1>
    <p class="lead">Log in to keep your repertoire, cards and progress on your account, so they are on every device you use. Training works offline once you are in.</p>

    {#if !online}
      <p class="note">You are offline. Logging in needs a connection.</p>
    {/if}

    {#if cloud.sentTo}
      <p class="sent">We sent a login link and a 6-digit code to <b>{cloud.sentTo}</b>. Open the link on this device, or type the code here.</p>
      <form class="col" onsubmit={(e) => { e.preventDefault(); void run(() => verifyCode(code)); }}>
        <input class="field code" placeholder="123456" inputmode="numeric" autocomplete="one-time-code" maxlength="10" bind:value={code} aria-label="Code from the email" />
        <button class="btn wide" type="submit" disabled={busy || code.replace(/\s/g, '').length < 6}>{busy ? 'Checking…' : 'Log in'}</button>
        <button class="link" type="button" onclick={() => { cloud.sentTo = ''; code = ''; }}>Use another way</button>
      </form>
    {:else}
      <div class="col">
        <button class="btn wide prov" disabled={busy || !online} onclick={() => run(withGoogle)}><span class="g" aria-hidden="true">G</span> Continue with Google</button>
        <button class="btn wide prov" disabled={busy || !online} onclick={() => run(withLichess)}><Icon name="explore" size={20} /> Continue with Lichess</button>
      </div>
      <p class="or"><span>or with your email</span></p>
      <form class="col" onsubmit={(e) => { e.preventDefault(); void run(() => sendEmail(email)); }}>
        <input class="field" type="email" placeholder="you@example.com" autocomplete="email" autocapitalize="off" spellcheck="false" bind:value={email} aria-label="Email address" />
        <button class="btn wide quiet" type="submit" disabled={busy || !online || !emailOk}>{busy ? 'Sending…' : 'Email me a login link'}</button>
      </form>
    {/if}

    {#if cloud.authError}<p class="err" role="alert">{cloud.authError}</p>{/if}
    <p class="t-small fine">Ply stores your progress with Supabase, nothing else. No ads, no tracking. Logging out keeps everything on your account.</p>
  </div>
</div>

<style>
  .login { position: absolute; inset: 0; overflow-y: auto; background: var(--ground); display: flex; justify-content: center; padding: calc(env(safe-area-inset-top) + 40px) 16px calc(env(safe-area-inset-bottom) + 28px); }
  .body { width: 100%; max-width: 440px; display: flex; flex-direction: column; }
  .hl { font-size: 64px; line-height: 0.96; letter-spacing: -0.02em; margin-top: 8vh; }
  .lead { margin-top: 12px; font-size: 16.5px; line-height: 1.4; color: var(--ink-2); margin-bottom: 26px; }
  .col { display: flex; flex-direction: column; gap: 10px; }
  .prov { justify-content: center; gap: 10px; }
  .g { font-weight: 800; font-size: 18px; }
  .or { display: flex; align-items: center; gap: 10px; margin: 22px 0 12px; color: var(--ink-3); font-size: 13px; }
  .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  .field { height: 58px; border-radius: 18px; border: 0; background: var(--card); padding: 0 18px; font-size: 18px; font-weight: 600; width: 100%; user-select: text; box-shadow: var(--shadow); color: var(--ink); }
  .field:focus { outline: 3px solid var(--cobalt); }
  .code { letter-spacing: 0.3em; text-align: center; font-size: 24px; }
  .sent { margin-bottom: 14px; line-height: 1.4; }
  .note { padding: 12px 14px; border-radius: 14px; background: var(--card); margin-bottom: 14px; font-weight: 600; }
  .err { color: var(--bad-text); font-weight: 600; font-size: 14px; margin-top: 14px; }
  .link { align-self: center; padding: 8px; }
  .fine { margin-top: auto; padding-top: 28px; color: var(--ink-3); }
</style>
