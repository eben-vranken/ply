<script lang="ts">
  import { app, save } from '../lib/state.svelte';
  import { configured } from '../lib/cloud/cloud.svelte';
  import { chooseStarter, summaries, isFocus, toggleFocus, switchBand, model, bandList } from '../lib/model.svelte';
  import OpeningPicker from '../lib/OpeningPicker.svelte';
  import type { Side } from '../lib/chess';
  import { GOALS } from '../lib/game';
  import { syncNow } from '../lib/import/sync.svelte';
  import Sigil from '../lib/Sigil.svelte';
  import Icon from '../lib/Icon.svelte';
  import Mascot from '../lib/Mascot.svelte';
  import { desk } from '../lib/desk.svelte';

  let step = $state(0);
  const S = (s: string) => s.split(' '); // UCI
  const picks = [
    { key: 'white' as const, pathKey: 'whitePath' as const, slot: 'white' as const, title: 'As White', opts: [
      { v: 'Italian Game', sub: '1.e4, Giuoco Piano', path: S('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5'), hue: '#254bd2', flip: false },
      { v: "Queen's Gambit", sub: '1.d4 and 2.c4', path: S('d2d4 d7d5 c2c4 e7e6 b1c3 g8f6'), hue: '#844bc6', flip: false }
    ] },
    { key: 'blackE4' as const, pathKey: 'blackE4Path' as const, slot: 'e4' as const, title: 'As Black against 1.e4', opts: [
      { v: '1...e5', sub: 'Open games', path: S('e2e4 e7e5 g1f3 b8c6 f1b5 a7a6'), hue: '#c82611', flip: true },
      { v: 'Sicilian Defense', sub: '1...c5', path: S('e2e4 c7c5 g1f3 d7d6 d2d4 c5d4'), hue: '#067c8e', flip: true }
    ] },
    { key: 'blackD4' as const, pathKey: 'blackD4Path' as const, slot: 'd4' as const, title: 'As Black against 1.d4', opts: [
      { v: "Queen's Gambit Declined", sub: '1...d5 and 2...e6', path: S('d2d4 d7d5 c2c4 e7e6 b1c3 g8f6'), hue: '#018359', flip: true },
      { v: "King's Indian", sub: '1...Nf6 and 2...g6', path: S('d2d4 g8f6 c2c4 g7g6 b1c3 f8g7'), hue: '#a77602', flip: true }
    ] }
  ];
  const limits = [
    { k: 'newMoves' as const, label: 'New moves a day', max: 50, note: 'About a minute each' },
    { k: 'newTraps' as const, label: 'New traps a day', max: 30, note: 'Punish, Danger and puzzles' },
    { k: 'maxReviews' as const, label: 'Most reviews a day', max: 999, note: 'The rest roll to tomorrow', step: 10, min: 20 }
  ];
  const bump = (l: (typeof limits)[number], d: number) => { app[l.k] = Math.min(l.max, Math.max(l.min ?? 0, app[l.k] + d * (l.step ?? 1))); };
  // "Something else": the full list of openings for one slot
  let picking = $state<(typeof picks)[number] | null>(null);
  const choose = (p: (typeof picks)[number], v: string, path = '') => { app[p.key] = v; app[p.pathKey] = path; };
  // your level, on Lichess's scale (the bands); a synced rating replaces it
  // one button per band the opening data has: the lowest is "Beginner", the highest open-ended
  const LEVELS: [number, string][] = bandList().map((b, i, all) => [b, i === 0 ? 'Beginner' : i === all.length - 1 ? `${b}+` : `${b}`]);
  let level = $state(1200);
  let busy = $state(false);
  async function finish() {
    busy = true;
    app.username = app.username.trim();
    app.lichessUser = app.lichessUser.trim();
    // the level sets the band and the line depth until a chess.com or Lichess rating comes in
    app.autoBand = level;
    if (level !== 1200 || app.rating) app.rating = level - 350;
    save();
    if (level !== model.band) await switchBand(level);
    await chooseStarter();
    // the openings you picked are the ones you are mastering: they feed the daily cards first
    const all = summaries();
    const pick = (sec: string, name: string) => all.find((o) => o.section === sec && o.path.length && o.family.startsWith(name)) ?? all.find((o) => o.section === sec && o.path.length);
    const own = (side: Side, path: string) => (path ? { side, path: path.split(' ') } : null);
    for (const o of [own('w', app.whitePath) ?? pick('White', app.white), own('b', app.blackE4Path) ?? pick('Black vs 1.e4', app.blackE4), own('b', app.blackD4Path) ?? pick('Black vs 1.d4', app.blackD4)]) if (o && !isFocus(o.side, o.path)) toggleFocus(o.side, o.path);
    app.onboarded = true; save();
    if (app.username || app.lichessUser) void syncNow();
  }
</script>

<div class="ob" class:night={step === 0} class:wide={desk.on}>
  {#if desk.on}
    <!-- desktop: the night panel stays through all four steps, Birch saying what each is for -->
    <aside class="art" aria-hidden="true">
      <div class="tiles">
        <div class="tile t1"><Sigil path={S('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6')} size={230} draw /></div>
        <div class="tile t2"><Sigil path={S('d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7')} size={150} hue="#018359" flip you="b" /></div>
        <div class="tile t3"><Sigil path={S('e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6')} size={120} hue="#c82611" /></div>
      </div>
      {#key step}
        <div class="says"><Mascot mood={step === 0 ? 'cheer' : step === 3 ? 'think' : 'idle'} size={72} /><p>{['I am Birch. Four short steps and your first session is ready.', 'Pick what you want to play. You can change it any time, and every other opening is still there.', 'A few minutes now beats an hour on Sunday. These are easy to change later.', 'With your games I can match the lines to your level and turn your real mistakes into cards.'][step]}</p></div>
      {/key}
    </aside>
  {/if}
  <div class="dots" aria-hidden="true">{#each Array(4) as _, i}<i class:on={i <= step}></i>{/each}</div>

  {#key step}
    <div class="body">
      {#if step === 0}
        <div class="hero" aria-hidden="true">
          <div class="tile t1"><Sigil path={S('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6')} size={200} draw /></div>
          <div class="tile t2"><Sigil path={S('d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7')} size={128} hue="#018359" flip you="b" /></div>
          <div class="tile t3"><Sigil path={S('e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6')} size={104} hue="#c82611" /></div>
        </div>
        <h1 class="t-name hl">Openings that stay learned.</h1>
        <p class="lead">Ply drills the lines people at your rating really play, the traps inside them, and the mistakes from your own games. A few minutes a day, on a schedule that fades what you know and repeats what you don't.</p>
      {:else if step === 1}
        <h1 class="t-title">What are you mastering?</h1>
        <p class="lead">These openings feed your daily cards first. Every other line is built in too, and you can add or swap openings whenever you like.</p>
        {#each picks as p}
          <h2 class="gh">{p.title}</h2>
          <div class="opts">
            {#each p.opts as o}
              <button class="opt" class:on={app[p.key] === o.v && !app[p.pathKey]} aria-pressed={app[p.key] === o.v && !app[p.pathKey]} onclick={() => choose(p, o.v)}>
                <Sigil path={o.path} hue={o.hue} flip={o.flip} you={o.flip ? 'b' : 'w'} size={48} />
                <span class="grow"><b class="t-name">{o.v}</b><small>{o.sub}</small></span>
                <span class="radio">{#if app[p.key] === o.v && !app[p.pathKey]}<Icon name="check" size={16} />{/if}</span>
              </button>
            {/each}
            <button class="opt other" class:on={!!app[p.pathKey]} aria-pressed={!!app[p.pathKey]} onclick={() => (picking = p)}>
              <span class="plus"><Icon name={app[p.pathKey] ? 'check' : 'search'} size={20} /></span>
              <span class="grow">{#if app[p.pathKey]}<b class="t-name">{app[p.key]}</b><small>Tap to pick another</small>{:else}<b>Something else</b><small>Any opening, by name or moves</small>{/if}</span>
            </button>
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
        <div class="lim goalrow">
          <div class="grow"><p class="ll">Daily goal</p><p class="t-small">XP for every answer. Hit it to keep your streak honest</p></div>
        </div>
        <div class="goals" role="group" aria-label="Daily goal">
          {#each GOALS as g, i}
            <button class:on={app.goal === g} aria-pressed={app.goal === g} onclick={() => (app.goal = g)}><b class="t-num">{g}</b><small>{['Casual', 'Regular', 'Serious', 'Intense'][i]}</small></button>
          {/each}
        </div>
      {:else}
        <h1 class="t-title">Your online games</h1>
        <p class="lead">Ply reads your rapid rating to match lines to your level, and turns real mistakes from your games into cards. Your games are fetched from chess.com or Lichess and analysed on this device.{configured ? ' Your progress is kept on your Ply account, so it is there on every device you log in on.' : ' Everything stays on this device.'}</p>
        <input class="name" placeholder="chess.com username" aria-label="chess.com username" bind:value={app.username} autocapitalize="off" autocomplete="off" spellcheck="false" />
        <input class="name two" placeholder="Lichess username" aria-label="Lichess username" bind:value={app.lichessUser} autocapitalize="off" autocomplete="off" spellcheck="false" />
        <p class="t-small" style="margin-top:12px">Either or both, or neither.</p>
        <h2 class="gh">Your level</h2>
        <div class="levels" role="group" aria-label="Your level">
          {#each LEVELS as [v, l]}<button class:on={level === v} aria-pressed={level === v} onclick={() => (level = v)}>{l}</button>{/each}
        </div>
        <p class="t-small" style="margin-top:8px">Roughly your Lichess rapid rating (chess.com is about 350 lower). Lines follow what players at this level play. Once your games sync, your rating takes over.</p>
      {/if}
    </div>
  {/key}

  <footer>
    {#if step > 0}<button class="btn quiet" onclick={() => step--} aria-label="Back"><Icon name="back" size={20} /></button>{/if}
    <button class="btn big grow {step === 0 ? 'sun' : ''}" disabled={busy} onclick={() => (step < 3 ? step++ : finish())}>
      {step === 0 ? 'Set up Ply' : step === 3 ? (app.username || app.lichessUser ? 'Start training' : 'Skip and start') : 'Continue'}
    </button>
  </footer>
</div>

{#if picking}
  {@const p = picking}
  <OpeningPicker slot={p.slot} onclose={() => (picking = null)} onpick={(o) => { choose(p, o.name, o.path.join(' ')); picking = null; }} />
{/if}

<style>
  .ob { position: absolute; inset: 0; z-index: 50; display: flex; flex-direction: column; padding: calc(env(safe-area-inset-top) + 18px) max(20px, calc((100% - 560px) / 2)) calc(env(safe-area-inset-bottom) + 22px); background: var(--ground); transition: background 400ms var(--ease), color 400ms; overflow: hidden; }
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
  .opt.other .plus { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: var(--ground); color: var(--accent-text); flex: none; }
  .opt.other b:not(.t-name) { display: block; font-size: 17px; font-weight: 650; }
  .levels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .levels button { height: 48px; border-radius: 14px; background: var(--card); font-weight: 650; box-shadow: inset 0 0 0 2px transparent; }
  .levels button.on { box-shadow: inset 0 0 0 2.5px var(--cobalt); }
  .lim { display: flex; align-items: center; gap: 12px; background: var(--card); border-radius: 20px; padding: 14px 12px 14px 16px; margin-top: 12px; }
  .lim:first-of-type { margin-top: 24px; }
  .ll { font-weight: 650; font-size: 17px; }
  .goalrow { background: none; padding: 8px 2px 0; }
  .goals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 8px; }
  .goals button { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 10px 0 9px; border-radius: 16px; background: var(--card); box-shadow: inset 0 0 0 2px transparent; transition: box-shadow 160ms; }
  .goals button.on { box-shadow: inset 0 0 0 2.5px var(--cobalt); }
  .goals b { font-size: 20px; }
  .goals small { font-size: 12px; color: var(--ink-2); }
  .stepper { display: flex; align-items: center; background: var(--ground); border-radius: 14px; padding: 3px; }
  .stepper button { width: 46px; height: 46px; border-radius: 11px; background: var(--card); font-size: 22px; font-weight: 600; box-shadow: 0 2px 0 var(--line); }
  .stepper output { min-width: 54px; text-align: center; font-size: 22px; }
  .name { margin-top: 24px; height: 64px; border-radius: 20px; border: 0; background: var(--card); padding: 0 20px; font-size: 22px; font-weight: 650; width: 100%; user-select: text; box-shadow: var(--shadow); }
  .name.two { margin-top: 10px; }
  .name:focus { outline: 3px solid var(--cobalt); }
  footer { display: flex; gap: 10px; padding-top: 14px; }
  footer .quiet { min-height: 64px; border-radius: 20px; padding: 0 20px; }
  /* ---------- desktop: the steps on the right, the night panel on the left (DESIGN.md, "Desktop") ---------- */
  @media (min-width: 1024px) and (min-height: 600px) {
    .ob.wide { display: grid; grid-template-columns: minmax(380px, 0.85fr) minmax(0, 1.15fr); grid-template-rows: auto minmax(0, 1fr) auto; column-gap: 0; padding: 0; }
    .ob.wide > :global(*) { grid-column: 2; width: 100%; max-width: 600px; margin-left: auto; margin-right: auto; padding-left: 32px; padding-right: 32px; }
    .ob.wide .dots { padding-top: 40px; }
    .ob.wide footer { padding-bottom: 40px; }
    .ob.wide .body { padding-top: 32px; justify-content: safe center; }
    .art { grid-column: 1 !important; grid-row: 1 / -1; max-width: none !important; margin: 0 !important; padding: 40px !important; position: relative; display: flex; flex-direction: column; justify-content: flex-end; background: radial-gradient(90% 70% at 30% 30%, #232a52 0%, var(--night) 70%); color: var(--night-ink); overflow: hidden; }
    .tiles { position: absolute; inset: 8% 10% 30% 10%; }
    .says { position: relative; display: flex; align-items: center; gap: 14px; animation: rise 360ms var(--ease) both; }
    .says p { flex: 1; padding: 14px 18px; border-radius: 20px; background: var(--birch); color: var(--ink-fixed); font-size: 15.5px; line-height: 1.4; font-weight: 550; box-shadow: 0 4px 0 var(--birch-3); max-width: 420px; }
    .ob.wide .hero { display: none; }
    .ob.wide .hl { font-size: 72px; }
    .ob.wide.night .lead { font-size: 18px; }
    .ob.wide .opt, .ob.wide .levels button, .ob.wide .goals button { transition: box-shadow 160ms, transform 160ms var(--ease); }
    .ob.wide .opt:hover, .ob.wide .levels button:hover, .ob.wide .goals button:hover { transform: translateY(-1px); box-shadow: inset 0 0 0 2px var(--line); }
    .ob.wide .opt.on:hover, .ob.wide .levels button.on:hover, .ob.wide .goals button.on:hover { box-shadow: inset 0 0 0 2.5px var(--cobalt); }
    .ob.wide .btn:not(:disabled):hover { filter: brightness(1.06); }
    .ob.wide .stepper button:hover { background: var(--cobalt-tint); }
  }
</style>
