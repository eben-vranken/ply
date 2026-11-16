<script lang="ts">
  // The login, as the last panel of the landing page (routes/Landing.svelte): a birch slab in the
  // night room. Your progress lives on your Ply account.
  import { cloud, logInWithPassword, signUpWithPassword, sendPasswordReset, withGoogle, withLichess } from '../lib/cloud/cloud.svelte';
  import Icon from '../lib/Icon.svelte';

  let email = $state('');
  let password = $state('');
  /** log in to an account, make one, or ask for a password reset (the landing page picks the first) */
  let { mode = $bindable('login') }: { mode?: 'login' | 'signup' | 'reset' } = $props();
  let busy = $state(false);
  let online = $state(navigator.onLine);
  $effect(() => {
    const on = () => (online = true), off = () => (online = false);
    addEventListener('online', on); addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  });
  const run = async (f: () => Promise<unknown>) => { busy = true; try { await f(); } finally { busy = false; } };
  const emailOk = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
  const MIN = 8;
  const passOk = $derived(mode === 'signup' ? password.length >= MIN : password.length > 0);
  const switchTo = (m: 'login' | 'signup' | 'reset') => { mode = m; cloud.authError = ''; cloud.resetSentTo = ''; cloud.confirmSentTo = ''; };
  const submit = () => run(() => mode === 'signup' ? signUpWithPassword(email, password) : mode === 'reset' ? sendPasswordReset(email) : logInWithPassword(email, password));
</script>

<div class="login" id="login">
  <div class="body">
    <h2 class="t-name hl">{mode === 'signup' ? 'Sign up for Ply' : mode === 'reset' ? 'Reset your password' : 'Log in to Ply'}</h2>
    <p class="lead">{mode === 'signup' ? 'Free. Your repertoire, cards and progress live on your account, so they are the same on your phone and your desktop.' : 'Log in with Google, Lichess or your email and password. Your repertoire, cards and progress are waiting.'}</p>

    {#if !online}
      <p class="note" role="status">You are offline. Logging in needs a connection.</p>
    {/if}

    <div class="col">
      <button class="btn wide prov" disabled={busy || !online} onclick={() => run(withGoogle)}><span class="g" aria-hidden="true">G</span> Continue with Google</button>
      <button class="btn wide prov" disabled={busy || !online} onclick={() => run(withLichess)}><Icon name="explore" size={20} /> Continue with Lichess</button>
    </div>
    <p class="or"><span>{mode === 'signup' ? 'or make an account with your email' : mode === 'reset' ? 'or reset your password' : 'or with your email'}</span></p>
    {#if mode === 'signup' && cloud.confirmSentTo}
      <p class="sent" role="status">Almost there. We sent a confirmation link to <b>{cloud.confirmSentTo}</b>. Open it on this device and you are in. Your account and password are already made.</p>
      <button class="link" type="button" onclick={() => switchTo('login')}>Confirmed somewhere else? Log in</button>
    {:else if mode === 'reset' && cloud.resetSentTo}
      <p class="sent" role="status">If <b>{cloud.resetSentTo}</b> has a Ply account, a reset link is on its way. Open it on this device to choose a new password.</p>
      <button class="link" type="button" onclick={() => switchTo('login')}>Back to log in</button>
    {:else}
      <form class="col" onsubmit={(e) => { e.preventDefault(); void submit(); }}>
        <input class="field" type="email" placeholder="you@example.com" autocomplete={mode === 'signup' ? 'email' : 'username'} autocapitalize="off" spellcheck="false" bind:value={email} aria-label="Email address" />
        {#if mode !== 'reset'}
          <input class="field" type="password" placeholder={mode === 'signup' ? `Password, ${MIN}+ characters` : 'Password'} autocomplete={mode === 'signup' ? 'new-password' : 'current-password'} bind:value={password} aria-label="Password" />
        {/if}
        <button class="btn wide quiet" type="submit" disabled={busy || !online || !emailOk || (mode !== 'reset' && !passOk)}>
          {#if busy}{mode === 'reset' ? 'Sending…' : 'One moment…'}{:else}{mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Email me a reset link' : 'Log in'}{/if}
        </button>
      </form>
      <div class="alt">
        {#if mode === 'login'}
          <button class="link" type="button" onclick={() => switchTo('signup')}>New here? Create an account</button>
          <button class="link" type="button" onclick={() => switchTo('reset')}>Forgot password?</button>
        {:else}
          <button class="link" type="button" onclick={() => switchTo('login')}>{mode === 'signup' ? 'Have an account? Log in' : 'Back to log in'}</button>
        {/if}
      </div>
    {/if}

    {#if cloud.authError}<p class="err" role="alert">{cloud.authError}</p>{/if}
    <p class="fine">Ply stores your progress with Supabase, nothing else. No ads, no tracking. Training works offline once you are in, and logging out keeps everything on your account.</p>
  </div>
  <div class="edge" aria-hidden="true"></div>
</div>

<style>
  /* a slab like the board and Today's hero: a birch face on its five-veneer edge. The wood stays wood in both themes. */
  .login { position: relative; width: 100%; max-width: 480px; border-radius: var(--r-xl); background: var(--birch); color: var(--ink-fixed); overflow: hidden; box-shadow: 0 30px 60px -24px rgba(0, 0, 0, 0.7); text-align: left;
    --quiet-face: #fff; --quiet-edge: var(--birch-3); --ink: var(--ink-fixed); --accent-text: var(--cobalt-deep); }
  .edge { height: 14px; background: linear-gradient(#d8bb8a 0 2px, #b08a57 2px 5px, #e0c797 5px 8px, #a67f4d 8px 11px, #d2b382 11px 14px); }
  .body { display: flex; flex-direction: column; padding: 30px 26px 26px; }
  .hl { font-size: 44px; line-height: 0.98; letter-spacing: -0.02em; }
  .lead { margin: 10px 0 22px; font-size: 15.5px; line-height: 1.42; color: var(--walnut); }
  .col { display: flex; flex-direction: column; gap: 12px; }
  .prov { justify-content: center; gap: 10px; }
  .btn.quiet { --txt: var(--ink-fixed); }
  .btn:not(:disabled):hover { filter: brightness(1.06); }
  .g { font-weight: 800; font-size: 18px; }
  .or { display: flex; align-items: center; gap: 10px; margin: 22px 0 12px; color: var(--walnut); font-size: 13px; font-weight: 600; }
  .or::before, .or::after { content: ''; flex: 1; height: 1.5px; background: var(--birch-3); }
  .field { height: 56px; border-radius: 16px; border: 0; background: #fff; padding: 0 18px; font-size: 18px; font-weight: 600; width: 100%; user-select: text; box-shadow: inset 0 0 0 1.5px var(--birch-3); color: var(--ink-fixed); }
  .field::placeholder { color: #77684f; }
  .field:focus { outline: 3px solid var(--cobalt); outline-offset: 1px; }
  .login :global(:focus-visible) { outline-color: var(--cobalt-deep) !important; }
  .sent { margin-bottom: 14px; line-height: 1.4; }
  .note { padding: 12px 14px; border-radius: 14px; background: rgba(255, 255, 255, 0.6); margin-bottom: 14px; font-weight: 600; }
  .err { color: #a3230f; font-weight: 650; font-size: 14px; margin-top: 14px; }
  .link { align-self: center; padding: 8px; }
  .alt { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px; margin-top: 6px; }
  .alt .link { font-size: 14px; }
  .fine { margin-top: 22px; font-size: 13px; line-height: 1.4; color: var(--walnut); }
</style>
