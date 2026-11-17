<script lang="ts">
  // Sign up (#/signup) and log in (#/login): a page of their own, reached from the landing page.
  // On a desktop the night room sits on the left with a board laying down the first moves of a line;
  // on a phone the night room is a short header and the form rises over it as a sheet.
  import { onMount, untrack } from 'svelte';
  import { route, go } from '../lib/state.svelte';
  import { desk } from '../lib/desk.svelte';
  import Icon from '../lib/Icon.svelte';
  import Mascot from '../lib/Mascot.svelte';
  import MiniBoard from '../lib/MiniBoard.svelte';
  import Plies from '../lib/Plies.svelte';
  import Login from './Login.svelte';
  import { demo, sq, num, n } from '../landing/demo';

  /** called on arrival, so the app starts fetching its opening data while the form is filled in */
  let { onintent = () => {} }: { onintent?: () => void } = $props();
  onMount(() => onintent());

  const base = (p: string) => p.split('?')[0];
  let mode = $state<'login' | 'signup' | 'reset'>(base(route.path) === '/login' ? 'login' : 'signup');
  // the address follows the form, and the form follows the address (the back button)
  $effect(() => { const b = base(route.path); untrack(() => { if (b === '/signup') mode = 'signup'; else if (b === '/login' && mode === 'signup') mode = 'login'; }); });
  $effect(() => {
    const want = mode === 'signup' ? '/signup' : '/login';
    if (untrack(() => base(route.path)) === want) return;
    history.replaceState(null, '', '#' + want);
    route.path = want;
  });

  // the board lays down the hero line one move at a time, your moves turning to birch as they are learned
  const H = demo.hero;
  let i = $state(desk.still ? 5 : 1);
  $effect(() => {
    if (desk.still) return;
    const t = setInterval(() => (i = i >= H.length ? 1 : i + 1), 1500);
    return () => clearInterval(t);
  });
  const cur = $derived(H[i - 1]);
  const mine = $derived(H.slice(0, i).filter((p) => p.mine));
  const C = demo.counts;

  const TITLE = { signup: ['Lay down the', 'first layer.'], login: ['Welcome', 'back.'], reset: ['It happens', 'to everyone.'] } as const;
  const POINTS = [`All ${n(C.openings)} named openings, built in`, 'Lines from what your rating really plays', 'Reviews just before you would forget'];
</script>

<div class="auth" class:login={mode !== 'signup'}>
  <aside class="night">
    <div class="sky" aria-hidden="true"><i class="blob b1"></i><i class="blob b2"></i><i class="checks"></i></div>
    <header class="bar">
      <button class="back" onclick={() => go('/')} aria-label="Back to the Ply home page"><Icon name="back" size={20} /><span class="logo" aria-hidden="true"><i></i><i></i><i></i></span><span class="t-name">Ply</span></button>
    </header>

    <div class="pitch">
      <span class="birch" aria-hidden="true"><Mascot mood={mode === 'signup' ? 'cheer' : mode === 'reset' ? 'think' : 'idle'} size={64} /></span>
      {#key mode}
        <h1><span class="ln" style="--l:0">{TITLE[mode][0]}</span> <span class="ln" style="--l:1"><em>{TITLE[mode][1]}</em></span></h1>
      {/key}
      <ul class="pts">
        {#each POINTS as p, k}<li style="--k:{k}"><span class="ck"><Icon name="check" size={13} /></span>{p}</li>{/each}
      </ul>
    </div>

    <div class="show" aria-hidden="true">
      <div class="slab">
        <div class="board"><MiniBoard fen={cur.fen} last={sq(cur.uci)} edge /></div>
        <div class="feed">
          <p class="nm t-name">{cur.name.split(': ').at(-1)}</p>
          {#each mine.slice(-3) as m (m.uci)}
            <p class="mv"><Plies stage="learning" size={14} /><b>{num(H.indexOf(m))}{m.san}</b><i>!</i></p>
          {/each}
        </div>
      </div>
      <p class="tag">Free · No ads · Works offline</p>
    </div>
  </aside>

  <main class="side">
    <div class="sheet"><Login bind:mode /></div>
  </main>
</div>

<style>
  .auth { position: absolute; inset: 0; z-index: 30; overflow-y: auto; overflow-x: hidden; background: var(--night); color: var(--ink); user-select: text; -webkit-user-select: text; display: flex; flex-direction: column; }
  .night { position: relative; isolation: isolate; color: var(--night-ink); padding: env(safe-area-inset-top) 16px 0; overflow: hidden; flex: none; }
  .sky { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
  .blob { position: absolute; border-radius: 50%; filter: blur(70px); }
  .b1 { width: 420px; height: 420px; left: -140px; top: -200px; background: #2b4bee; opacity: 0.55; animation: drift 18s ease-in-out infinite alternate; }
  .b2 { width: 360px; height: 360px; right: -160px; top: 40px; background: #6a3fc4; opacity: 0.3; animation: drift 22s ease-in-out infinite alternate-reverse; }
  @keyframes drift { to { transform: translate(90px, 60px) scale(1.12); } }
  .checks { position: absolute; inset: 0; background-image: conic-gradient(rgba(255, 255, 255, 0.04) 90deg, transparent 0 180deg, rgba(255, 255, 255, 0.04) 0 270deg, transparent 0); background-size: 72px 72px; -webkit-mask-image: radial-gradient(80% 70% at 30% 20%, #000, transparent 75%); mask-image: radial-gradient(80% 70% at 30% 20%, #000, transparent 75%); }
  .bar { display: flex; align-items: center; height: 60px; }
  .back { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 12px 0 6px; border-radius: 12px; font-size: 25px; transition: background 200ms; animation: fade 500ms var(--ease) both; }
  .back:hover { background: rgba(255, 255, 255, 0.07); }
  .back :global(svg) { transition: transform 300ms var(--spring); }
  .back:hover :global(svg) { transform: translateX(-3px); }
  .logo { display: flex; flex-direction: column; gap: 3px; margin-left: 2px; }
  .logo i { width: 20px; height: 4.5px; border-radius: 2px; background: var(--birch); }
  .logo i:nth-child(2) { background: var(--birch-3); }
  .logo i:nth-child(3) { background: var(--sun); }

  .pitch { display: flex; align-items: flex-end; gap: 12px; padding: 8px 4px 40px; }
  .birch { flex: none; animation: bob 3.4s ease-in-out infinite, pop 600ms var(--spring) both; }
  @keyframes bob { 50% { translate: 0 -6px; } }
  h1 { font-family: var(--serif); font-style: italic; font-weight: 500; font-size: 34px; line-height: 1; letter-spacing: -0.03em; }
  h1 em { color: var(--sun); }
  .ln { display: inline-block; animation: word 800ms var(--ease) both; animation-delay: calc(80ms + var(--l) * 110ms); }
  @keyframes word { from { opacity: 0; transform: translateY(0.45em); filter: blur(6px); } }
  @keyframes fade { from { opacity: 0; } }
  .pts, .show { display: none; }

  .side { flex: 1; display: flex; flex-direction: column; }
  .sheet { flex: 1; display: flex; justify-content: center; padding: 30px 20px calc(env(safe-area-inset-bottom) + 36px); border-radius: 28px 28px 0 0; background: var(--ground); box-shadow: 0 -20px 50px -20px rgba(0, 0, 0, 0.5); animation: sheet 720ms var(--ease) both 120ms; }
  @keyframes sheet { from { transform: translateY(70px); opacity: 0; } }

  @media (min-width: 900px) and (min-height: 560px) {
    .auth { flex-direction: row; background: var(--ground); }
    .night { width: 46%; max-width: 760px; display: flex; flex-direction: column; padding: 28px 48px 40px; background: var(--night); }
    .b1 { width: 640px; height: 640px; left: -200px; top: -260px; }
    .b2 { width: 520px; height: 520px; right: -240px; top: 40%; }
    .bar { height: 48px; }
    .pitch { flex-direction: column; align-items: flex-start; gap: 22px; padding: 64px 0 0; }
    h1 { font-size: clamp(52px, 5vw, 80px); line-height: 0.95; }
    .pts { display: flex; flex-direction: column; gap: 12px; list-style: none; padding: 0; margin: 8px 0 0; }
    .pts li { display: flex; align-items: center; gap: 12px; font-size: 16px; font-weight: 600; color: var(--night-ink-2); animation: slide 640ms var(--ease) both; animation-delay: calc(450ms + var(--k) * 110ms); }
    @keyframes slide { from { opacity: 0; transform: translateX(-16px); } }
    .ck { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: rgba(52, 224, 143, 0.16); color: #34e08f; }
    .show { display: flex; flex-direction: column; gap: 18px; margin-top: auto; padding-top: 40px; animation: rise 900ms var(--ease) both 500ms; }
    @keyframes rise { from { opacity: 0; transform: translateY(30px); } }
    .slab { display: flex; gap: 22px; align-items: stretch; padding: 18px; border-radius: 24px; background: rgba(255, 255, 255, 0.04); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08); max-width: 520px; }
    .board { flex: none; width: min(220px, 34vh); }
    .feed { display: flex; flex-direction: column; justify-content: flex-end; gap: 8px; min-width: 0; }
    .nm { font-size: 19px; color: var(--night-ink); margin-bottom: auto; }
    .mv { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border-radius: 12px; background: var(--birch); color: var(--ink-fixed); box-shadow: 0 3px 0 var(--birch-3); font-size: 15px; animation: lay 520ms var(--spring) both; }
    .mv i { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--good); color: #fff; font-style: normal; font-weight: 800; font-size: 12px; }
    @keyframes lay { from { opacity: 0; transform: translateY(-14px) scale(0.92); } }
    .tag { font-size: 13px; font-weight: 600; color: var(--night-ink-2); letter-spacing: 0.01em; }

    .side { justify-content: center; align-items: center; overflow-y: auto; }
    .sheet { flex: none; width: 100%; border-radius: 0; background: none; box-shadow: none; padding: 48px 40px; animation: swapin 700ms var(--ease) both 150ms; }
    @keyframes swapin { from { opacity: 0; transform: translateX(24px); } }
  }
  @media (prefers-reduced-motion: reduce) { .birch { animation: none; } }
</style>
