<script lang="ts">
  import { app, save } from '../lib/state.svelte';
  import Sigil from '../lib/Sigil.svelte';
  import Icon from '../lib/Icon.svelte';

  let step = $state(0);
  const S = (s: string) => s.split(' ');
  const picks = [
    { key: 'white' as const, title: 'As White', opts: [
      { v: 'Italian Game', sub: '1.e4, Giuoco Piano', path: S('e4 e5 Nf3 Nc6 Bc4 Bc5'), hue: '#2b4bee', flip: false },
      { v: "Queen's Gambit", sub: '1.d4 and 2.c4', path: S('d4 d5 c4 e6 Nc3 Nf6'), hue: '#7a3fc4', flip: false }
    ] },
    { key: 'blackE4' as const, title: 'As Black against 1.e4', opts: [
      { v: '1...e5', sub: 'Open games', path: S('e4 e5 Nf3 Nc6 Bb5 a6'), hue: '#cf331c', flip: true },
      { v: 'Sicilian Defense', sub: '1...c5', path: S('e4 c5 Nf3 d6 d4 cxd4'), hue: '#0b7f93', flip: true }
    ] },
    { key: 'blackD4' as const, title: 'As Black against 1.d4', opts: [
      { v: "Queen's Gambit Declined", sub: '1...d5 and 2...e6', path: S('d4 d5 c4 e6 Nc3 Nf6'), hue: '#0f7a55', flip: true },
      { v: "King's Indian", sub: '1...Nf6 and 2...g6', path: S('d4 Nf6 c4 g6 Nc3 Bg7'), hue: '#b9770a', flip: true }
    ] }
  ];
  const limits = [
    { k: 'newMoves' as const, label: 'New moves a day', max: 50, note: 'About a minute each' },
    { k: 'newTraps' as const, label: 'New traps a day', max: 30, note: 'Punish, Danger and puzzles' },
    { k: 'maxReviews' as const, label: 'Most reviews a day', max: 999, note: 'The rest roll to tomorrow', step: 10, min: 20 }
  ];
  const bump = (l: (typeof limits)[number], d: number) => { app[l.k] = Math.min(l.max, Math.max(l.min ?? 0, app[l.k] + d * (l.step ?? 1))); };
  function finish() { app.onboarded = true; save(); }
</script>

<div class="ob" class:night={step === 0}>
  <div class="dots" aria-hidden="true">{#each Array(4) as _, i}<i class:on={i <= step}></i>{/each}</div>

  {#key step}
    <div class="body">
      {#if step === 0}
        <div class="hero" aria-hidden="true">
          <div class="tile t1"><Sigil path={S('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6')} size={200} draw /></div>
          <div class="tile t2"><Sigil path={S('d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7')} size={128} hue="#0f7a55" flip /></div>
          <div class="tile t3"><Sigil path={S('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6')} size={104} hue="#cf331c" /></div>
        </div>
        <h1 class="t-name hl">Openings that stay learned.</h1>
        <p class="lead">Ply drills the lines people at your rating really play, the traps inside them, and the mistakes from your own games. A few minutes a day, on a schedule that fades what you know and repeats what you don't.</p>
      {:else if step === 1}
        <h1 class="t-title">Pick a repertoire</h1>
        <p class="lead">Every line is built in. You can change any move later.</p>
        {#each picks as p}
          <h2 class="gh">{p.title}</h2>
          <div class="opts">
            {#each p.opts as o}
              <button class="opt" class:on={app[p.key] === o.v} aria-pressed={app[p.key] === o.v} onclick={() => (app[p.key] = o.v)}>
                <Sigil path={o.path} hue={o.hue} flip={o.flip} size={48} />
                <span class="grow"><b class="t-name">{o.v}</b><small>{o.sub}</small></span>
                <span class="radio">{#if app[p.key] === o.v}<Icon name="check" size={16} />{/if}</span>
              </button>
            {/each}
          </div>
        {/each}
      {:else if step === 2}
        <h1 class="t-title">How much each day?</h1>
        <p class="lead">Small and steady wins. These are easy to change in Settings.</p>
        {#each limits as l}
          <div class="lim">
            <div class="grow"><p class="ll">{l.label}</p><p class="t-small">{l.note}</p></div>
            <div class="stepper">
              <button onclick={() => bump(l, -1)} aria-label="Fewer">−</button>
              <output class="t-num">{app[l.k]}</output>
              <button onclick={() => bump(l, 1)} aria-label="More">+</button>
            </div>
          </div>
        {/each}
      {:else}
        <h1 class="t-title">Your chess.com name</h1>
        <p class="lead">Ply reads your rapid rating to match lines to your level, and turns real mistakes from your games into cards. Nothing leaves this phone.</p>
        <input class="name" placeholder="username" bind:value={app.username} autocapitalize="off" autocomplete="off" spellcheck="false" />
        <p class="t-small" style="margin-top:12px">Leave it empty to start at the 1200 band with 8-move lines.</p>
      {/if}
    </div>
  {/key}

  <footer>
    {#if step > 0}<button class="btn quiet" onclick={() => step--} aria-label="Back"><Icon name="back" size={20} /></button>{/if}
    <button class="btn big grow {step === 0 ? 'sun' : ''}" onclick={() => (step < 3 ? step++ : finish())}>
      {step === 0 ? 'Set up Ply' : step === 3 ? (app.username ? 'Start training' : 'Skip and start') : 'Continue'}
    </button>
  </footer>
</div>

<style>
  .ob { position: absolute; inset: 0; z-index: 50; display: flex; flex-direction: column; padding: calc(env(safe-area-inset-top) + 18px) 20px calc(env(safe-area-inset-bottom) + 22px); background: var(--ground); transition: background 400ms var(--ease), color 400ms; overflow: hidden; }
  .ob.night { background: var(--night); color: var(--night-ink); }
  .dots { display: flex; gap: 6px; }
  .dots i { flex: 1; height: 6px; border-radius: 3px; background: rgba(120, 128, 170, 0.3); transition: background 300ms; }
  .dots i.on { background: var(--cobalt); }
  .night .dots i.on { background: var(--birch); }
  .body { flex: 1; overflow-y: auto; padding-top: 26px; animation: rise 360ms var(--ease) both; display: flex; flex-direction: column; }
  .hero { position: relative; flex: 1; min-height: 300px; }
  .tile { position: absolute; filter: drop-shadow(0 18px 20px rgba(0, 0, 0, 0.45)); animation: pop 600ms var(--spring) both; }
  .t1 { left: 0; top: 34%; rotate: -7deg; }
  .t2 { right: 0; top: 6%; rotate: 9deg; animation-delay: 140ms; }
  .t3 { right: 26px; top: 58%; rotate: -4deg; animation-delay: 260ms; }
  .hl { font-size: 54px; line-height: 0.96; letter-spacing: -0.02em; }
  .lead { margin-top: 12px; font-size: 16.5px; line-height: 1.4; color: var(--ink-2); }
  .night .lead { color: var(--night-ink-2); margin-bottom: 8px; }
  .gh { font-size: 14px; font-weight: 650; color: var(--ink-2); margin: 20px 2px 8px; }
  .opts { display: flex; flex-direction: column; gap: 8px; }
  .opt { display: flex; align-items: center; gap: 12px; text-align: left; padding: 8px 14px 8px 8px; border-radius: 20px; background: var(--card); min-height: 64px; box-shadow: inset 0 0 0 2px transparent; transition: box-shadow 160ms, transform 120ms; }
  .opt:active { transform: scale(0.98); }
  .opt.on { box-shadow: inset 0 0 0 2.5px var(--cobalt); }
  .opt b { display: block; font-size: 20px; font-weight: 500; line-height: 1.1; }
  .opt small { font-size: 13px; color: var(--ink-2); }
  .radio { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--line); display: grid; place-items: center; color: #fff; flex: none; }
  .opt.on .radio { background: var(--cobalt); border-color: var(--cobalt); }
  .lim { display: flex; align-items: center; gap: 12px; background: var(--card); border-radius: 20px; padding: 14px 12px 14px 16px; margin-top: 12px; }
  .lim:first-of-type { margin-top: 24px; }
  .ll { font-weight: 650; font-size: 17px; }
  .stepper { display: flex; align-items: center; background: var(--ground); border-radius: 14px; padding: 3px; }
  .stepper button { width: 46px; height: 46px; border-radius: 11px; background: var(--card); font-size: 22px; font-weight: 600; box-shadow: 0 2px 0 var(--line); }
  .stepper output { min-width: 54px; text-align: center; font-size: 22px; }
  .name { margin-top: 24px; height: 64px; border-radius: 20px; border: 0; background: var(--card); padding: 0 20px; font-size: 22px; font-weight: 650; width: 100%; user-select: text; box-shadow: var(--shadow); }
  .name:focus { outline: 3px solid var(--cobalt); }
  footer { display: flex; gap: 10px; padding-top: 14px; }
  footer .quiet { min-height: 64px; border-radius: 20px; padding: 0 20px; }
</style>
