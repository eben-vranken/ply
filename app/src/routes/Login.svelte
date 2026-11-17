<script lang="ts">
  // The sign-up / log-in form, on its own page (routes/Auth.svelte). Your progress lives on your Ply account.
  import { cloud, logInWithPassword, signUpWithPassword, sendPasswordReset, withLichess } from '../lib/cloud/cloud.svelte';
  import Icon from '../lib/Icon.svelte';

  /** log in to an account, make one, or ask for a password reset */
  let { mode = $bindable('login') }: { mode?: 'login' | 'signup' | 'reset' } = $props();
  let email = $state('');
  let password = $state('');
  let show = $state(false);
  let busy = $state(false);
  let shake = $state(0);
  let online = $state(navigator.onLine);
  $effect(() => {
    const on = () => (online = true), off = () => (online = false);
    addEventListener('online', on); addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  });
  const run = async (f: () => Promise<unknown>) => { busy = true; try { await f(); } finally { busy = false; if (cloud.authError) shake++; } };
  const emailOk = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
  const MIN = 8;
  const passOk = $derived(mode === 'signup' ? password.length >= MIN : password.length > 0);
  const switchTo = (m: 'login' | 'signup' | 'reset') => { mode = m; cloud.authError = ''; cloud.resetSentTo = ''; cloud.confirmSentTo = ''; };
  const submit = () => run(() => mode === 'signup' ? signUpWithPassword(email, password) : mode === 'reset' ? sendPasswordReset(email) : logInWithPassword(email, password));
  const sent = $derived((mode === 'signup' && cloud.confirmSentTo) || (mode === 'reset' && cloud.resetSentTo));
</script>

<div class="form">
  {#if mode !== 'reset'}
    <div class="tabs" role="tablist" aria-label="Sign up or log in" class:right={mode === 'login'}>
      <span class="thumb" aria-hidden="true"></span>
      <button role="tab" aria-selected={mode === 'signup'} onclick={() => switchTo('signup')}>Sign up</button>
      <button role="tab" aria-selected={mode === 'login'} onclick={() => switchTo('login')}>Log in</button>
    </div>
  {/if}

  {#key mode + (sent ? '-sent' : '')}
    <div class="pane">
      {#if sent}
        <div class="sent" role="status">
          <span class="env" aria-hidden="true"><svg viewBox="0 0 48 48" width="56" height="56"><rect x="5" y="11" width="38" height="27" rx="5" /><path d="M7 14l17 13 17-13" /></svg></span>
          <h2 class="hl">Check your email</h2>
          {#if mode === 'signup'}
            <p>We sent a confirmation link to <b>{cloud.confirmSentTo}</b>. Open it on this device and you are in. Your account and password are already made.</p>
            <button class="link" type="button" onclick={() => switchTo('login')}>Confirmed somewhere else? Log in instead</button>
          {:else}
            <p>If <b>{cloud.resetSentTo}</b> has a Ply account, a reset link is on its way. Open it on this device to choose a new password.</p>
            <button class="link" type="button" onclick={() => switchTo('login')}>Back to log in</button>
          {/if}
        </div>
      {:else}
        <h2 class="hl">{mode === 'signup' ? 'Create your free account' : mode === 'reset' ? 'Reset your password' : 'Log in to Ply'}</h2>
        <p class="lead">{mode === 'signup' ? 'Your repertoire, cards and streak live on your account, the same on your phone and at your desk.' : mode === 'reset' ? 'Give us the email you signed up with and we will send you a link.' : 'Your repertoire, cards and streak are where you left them.'}</p>

        {#if !online}<p class="note" role="status"><Icon name="wifi" size={18} /> You are offline. Logging in needs a connection.</p>{/if}

        {#if mode !== 'reset'}
          <button class="btn wide quiet prov" disabled={busy || !online} onclick={() => run(withLichess)}>
            <span class="lc"><Icon name="explore" size={20} /></span>
            Continue with Lichess
          </button>
          <p class="or"><span>or with email</span></p>
        {/if}

        <form onsubmit={(e) => { e.preventDefault(); void submit(); }}>
          <label class="field">
            <input type="email" placeholder=" " autocomplete={mode === 'signup' ? 'email' : 'username'} autocapitalize="off" spellcheck="false" bind:value={email} />
            <span class="fl">Email address</span>
            {#if emailOk}<i class="okmark" aria-hidden="true"><Icon name="check" size={14} /></i>{/if}
          </label>
          {#if mode !== 'reset'}
            <label class="field">
              <input type={show ? 'text' : 'password'} placeholder=" " autocomplete={mode === 'signup' ? 'new-password' : 'current-password'} bind:value={password} />
              <span class="fl">Password</span>
              <button type="button" class="eye" onclick={() => (show = !show)} aria-label={show ? 'Hide what you typed' : 'Show what you typed'} aria-pressed={show}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{#if !show}<path class="slash" d="M4 4l16 16" />{/if}</svg>
              </button>
            </label>
            {#if mode === 'signup'}
              <p class="req" class:ok={passOk}><span class="rc"><Icon name="check" size={12} /></span>At least {MIN} characters<span class="meter" aria-hidden="true"><i style="transform:scaleX({Math.min(1, password.length / MIN)})"></i></span></p>
            {/if}
          {/if}
          <button class="btn big wide go" type="submit" disabled={busy || !online || !emailOk || (mode !== 'reset' && !passOk)}>
            {#if busy}<span class="spin" aria-hidden="true"></span>{mode === 'reset' ? 'Sending…' : 'One moment…'}{:else}{mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Email me a reset link' : 'Log in'}{/if}
          </button>
        </form>

        {#if mode === 'login'}<button class="link small" type="button" onclick={() => switchTo('reset')}>Forgot your password?</button>{/if}
        {#if mode === 'reset'}<button class="link small" type="button" onclick={() => switchTo('login')}>Back to log in</button>{/if}
      {/if}
    </div>
  {/key}

  {#if cloud.authError}{#key shake}<p class="err" role="alert"><Icon name="warn" size={18} />{cloud.authError}</p>{/key}{/if}
  <p class="fine">{mode === 'signup' ? 'Free, with no ads and no tracking. ' : ''}Ply keeps your progress with Supabase and nothing else. Training works offline once you are in.</p>
</div>

<style>
  .form { width: 100%; max-width: 420px; display: flex; flex-direction: column; }
  .tabs { position: relative; display: grid; grid-template-columns: 1fr 1fr; padding: 4px; border-radius: 16px; background: var(--wash); margin-bottom: 30px; }
  .thumb { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc(50% - 4px); border-radius: 12px; background: var(--card); box-shadow: 0 1px 2px rgba(21, 25, 54, 0.08), 0 6px 14px -6px rgba(21, 25, 54, 0.25); transition: transform 460ms var(--spring); }
  .tabs.right .thumb { transform: translateX(100%); }
  .tabs button { position: relative; height: 42px; font-weight: 700; font-size: 15px; color: var(--ink-3); transition: color 260ms; }
  .tabs button[aria-selected='true'] { color: var(--ink); }
  .pane { display: flex; flex-direction: column; animation: swap 460ms var(--ease) both; }
  @keyframes swap { from { opacity: 0; transform: translateY(12px); } }
  .hl { font-family: var(--serif); font-style: italic; font-weight: 500; font-size: 38px; line-height: 1.02; letter-spacing: -0.025em; }
  .lead { margin: 10px 0 26px; font-size: 15.5px; line-height: 1.5; color: var(--ink-2); }
  .prov { gap: 12px; }
  .btn:not(:disabled):hover { filter: brightness(1.04); }
  .lc { display: inline-grid; transition: transform 400ms var(--spring); }
  .prov:not(:disabled):hover .lc { transform: rotate(-12deg) scale(1.1); }
  .or { display: flex; align-items: center; gap: 12px; margin: 24px 0 18px; color: var(--ink-3); font-size: 13px; font-weight: 600; }
  .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  form { display: flex; flex-direction: column; gap: 12px; }
  .field { position: relative; display: block; }
  .field input { width: 100%; height: 60px; border-radius: 16px; border: 0; background: var(--card); padding: 22px 52px 0 18px; font-size: 17px; font-weight: 600; box-shadow: inset 0 0 0 1.5px var(--line); transition: box-shadow 220ms; user-select: text; }
  .field input:hover { box-shadow: inset 0 0 0 1.5px var(--ink-3); }
  .field input:focus { outline: none; box-shadow: inset 0 0 0 2px var(--cobalt), 0 0 0 5px color-mix(in srgb, var(--cobalt) 18%, transparent); }
  .fl { position: absolute; left: 18px; top: 19px; font-size: 16px; font-weight: 550; color: var(--ink-3); pointer-events: none; transform-origin: left top; transition: transform 240ms var(--ease), color 240ms; }
  .field input:focus + .fl, .field input:not(:placeholder-shown) + .fl { transform: translateY(-10px) scale(0.75); }
  .field input:focus + .fl { color: var(--accent-text); }
  .okmark { position: absolute; right: 16px; top: 18px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--good); color: #fff; animation: pop 380ms var(--spring) both; }
  .eye { position: absolute; right: 8px; top: 8px; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; color: var(--ink-3); transition: color 200ms, background 200ms; }
  .eye:hover { color: var(--ink); background: var(--wash); }
  .eye svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .slash { animation: draw 300ms var(--ease) both; stroke-dasharray: 23; }
  @keyframes draw { from { stroke-dashoffset: 23; } }
  .req { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--ink-3); margin: -2px 0 4px 4px; transition: color 300ms; }
  .rc { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: var(--line); color: transparent; transition: background 300ms, color 300ms, transform 400ms var(--spring); }
  .req.ok { color: var(--good-text); }
  .req.ok .rc { background: var(--good); color: #fff; transform: scale(1.12); }
  .meter { margin-left: auto; width: 70px; height: 4px; border-radius: 2px; background: var(--line); overflow: hidden; }
  .meter i { display: block; height: 100%; background: var(--sun); transform-origin: left; transition: transform 300ms var(--ease), background 300ms; }
  .req.ok .meter i { background: var(--good); }
  .go { margin-top: 6px; }
  .spin { width: 18px; height: 18px; border-radius: 50%; border: 2.5px solid rgba(255, 255, 255, 0.35); border-top-color: #fff; animation: turn 700ms linear infinite; }
  @keyframes turn { to { transform: rotate(360deg); } }
  .link { align-self: center; padding: 8px 10px; border-radius: 10px; }
  .link.small { margin-top: 10px; font-size: 14.5px; }
  .note { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--sun-tint); color: var(--sun-ink); margin-bottom: 16px; font-weight: 600; font-size: 14.5px; }
  .err { display: flex; align-items: flex-start; gap: 10px; margin-top: 16px; padding: 12px 14px; border-radius: 14px; background: var(--bad-tint); color: var(--bad-text); font-weight: 650; font-size: 14.5px; line-height: 1.4; animation: shake 360ms ease-out both; }
  .err :global(svg) { flex: none; margin-top: 1px; }
  .sent { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
  .sent p { font-size: 15.5px; line-height: 1.5; color: var(--ink-2); }
  .sent b { color: var(--ink); }
  .sent .link { align-self: flex-start; padding-left: 0; }
  .env { display: grid; place-items: center; width: 84px; height: 84px; border-radius: 24px; background: var(--cobalt-tint); color: var(--accent-text); margin-bottom: 8px; animation: pop 520ms var(--spring) both; }
  .env svg { fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
  .env path { stroke-dasharray: 60; animation: env 700ms var(--ease) both 300ms; }
  @keyframes env { from { stroke-dashoffset: 60; } }
  .fine { margin-top: 28px; font-size: 12.5px; line-height: 1.5; color: var(--ink-3); }
</style>
