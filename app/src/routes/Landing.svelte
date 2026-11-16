<script lang="ts">
  // The landing page (docs/DESIGN.md, "The landing page"): what Ply is, shown working on the real
  // opening data, ending in the login. Every number comes from src/landing/demo.ts.
  import { onMount } from 'svelte';
  import { go, app } from '../lib/state.svelte';
  import { configured, cloud } from '../lib/cloud/cloud.svelte';
  import { desk } from '../lib/desk.svelte';
  import { inview } from '../lib/inview';
  import { TIPS } from '../lib/voice';
  import Icon from '../lib/Icon.svelte';
  import Sigil from '../lib/Sigil.svelte';
  import Plies from '../lib/Plies.svelte';
  import Mascot, { type Mood } from '../lib/Mascot.svelte';
  import MiniBoard from '../lib/MiniBoard.svelte';
  import Login from './Login.svelte';
  import HeroDemo from '../landing/HeroDemo.svelte';
  import BandFan from '../landing/BandFan.svelte';
  import TrapDemo from '../landing/TrapDemo.svelte';
  import MiniTree from '../landing/MiniTree.svelte';
  import { demo, n, millions, sq } from '../landing/demo';

  /** called once the visitor shows they mean to come in, so the app can start fetching its data */
  let { onintent = () => {} }: { onintent?: () => void } = $props();
  const C = demo.counts, T = demo.trap;
  // accounts are on and nobody is logged in: the page ends in the login. Otherwise its buttons open the app.
  const login = $derived(configured && !cloud.user);
  const cta = $derived(login ? 'Sign up' : app.onboarded ? 'Open Ply' : 'Start training');
  /** which form the login panel shows: Sign up opens it on a new account, Log in on logging in */
  let loginMode = $state<'login' | 'signup' | 'reset'>('signup');
  let root = $state<HTMLDivElement>();
  let scrolled = $state(false);
  function enter(mode: 'login' | 'signup' = 'signup') {
    onintent();
    if (!login) return go('/today');
    loginMode = mode;
    document.getElementById('login')?.scrollIntoView({ behavior: desk.still ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => (document.querySelector('#login input') as HTMLElement | null)?.focus({ preventScroll: true }), desk.still ? 0 : 700);
  }
  const to = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: desk.still ? 'auto' : 'smooth' });

  // scroll reveals: CSS scroll timelines where the browser has them, an observer otherwise
  const timelines = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()');
  function reveal(node: HTMLElement) {
    if (timelines || desk.still || typeof IntersectionObserver !== 'function') return;
    node.classList.add('wait');
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { node.classList.add('in'); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }
  // heavier sections (they own a board) are built just before they scroll in
  let near = $state({ fan: false, trap: false });
  let wall = $state(desk.still);
  // Birch says the four things he explains once in the app, one at a time
  const TALK: [Mood, string][] = [['idle', TIPS.intro], ['think', TIPS.quiz], ['sad', TIPS.wrong], ['cheer', TIPS.grade]];
  let talk = $state(0), birchSeen = $state(false);
  $effect(() => { if (!birchSeen || desk.still) return; const t = setInterval(() => (talk = (talk + 1) % TALK.length), 4200); return () => clearInterval(t); });
  let narrow = $state(typeof matchMedia === 'function' && matchMedia('(max-width: 899px)').matches);
  onMount(() => { const m = matchMedia('(max-width: 899px)'); const f = () => (narrow = m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); });

  const HUES = ['#2b4bee', '#cf331c', '#0f7a55', '#b9770a', '#7a3fc4', '#0b7f93'];
  const QUEUE: [string, string, string][] = [['Review', '!', 'good'], ['New move', '+', 'info'], ['Punish', '!', 'good'], ['Danger', '??', 'bad'], ['Your mistake', '?', 'bad']];
  const learn = demo.hero[4], before = demo.hero[3];
  const FREE = ['Unlimited repertoire and unlimited reviews', 'Every way to train: Today, Learn, Drill, Arcade, Play it out', 'Import and export PGN, import Lichess studies', 'Your chess.com and Lichess games, synced and analysed', 'Streak freezes you earn by playing, never buy'];
</script>

<!-- the sections that are built late are built at once for anyone moving through the page with Tab -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="landing" class:timelines bind:this={root} onkeydown={(e) => { if (e.key === 'Tab') near = { fan: true, trap: true }; }} onscroll={() => { const s = (root?.scrollTop ?? 0) > 24; if (s !== scrolled) scrolled = s; }}>
  <header class="top" class:scrolled>
    <button class="mark" onclick={() => root?.scrollTo({ top: 0, behavior: desk.still ? 'auto' : 'smooth' })} aria-label="Ply, back to the top"><span class="logo" aria-hidden="true"><i></i><i></i><i></i></span><span class="t-name">Ply</span></button>
    <nav aria-label="On this page">
      <button onclick={() => to('level')}>Your level</button>
      <button onclick={() => to('ways')}>Training</button>
      <button onclick={() => to('traps')}>Traps</button>
      <button onclick={() => to('free')}>Free and open</button>
    </nav>
    <button class="in" onclick={() => enter('login')} aria-label={login ? 'Log in to Ply: go to the login' : 'Open Ply'}>{login ? 'Log in' : 'Open Ply'}</button>
  </header>

  <!-- 1. the night room: the board is the only bright thing -->
  <section class="hero night">
    <div class="wrap hgrid">
      <div class="pitch">
        <p class="kick">Chess openings, on a spaced-repetition schedule</p>
        <h1>Openings that <em>stay</em> learned.</h1>
        <p class="sub">Ply drills the lines players at your rating actually play, the traps inside them and the mistakes from your own games. A few minutes a day. Free, with no ads.</p>
        <div class="acts">
          <button class="btn big sun" onclick={() => enter('signup')}>{cta}</button>
          <button class="btn big night" onclick={() => to('level')}>See how it works</button>
        </div>
        <p class="tiny">This board is not a recording. It is playing the {demo.band} band's data, built from {millions(C.games[demo.band])} games.</p>
      </div>
      <div class="live"><HeroDemo /></div>
    </div>
  </section>

  <section class="facts" aria-label="What is inside">
    <dl class="wrap">
      <div use:reveal class="rv" style="--d:0"><dd class="t-num">{n(C.openings)}</dd><dt>named openings, all built in</dt></div>
      <div use:reveal class="rv" style="--d:1"><dd class="t-num">{C.bands.length}</dd><dt>rating bands, {C.bands[0]} to {C.bands.at(-1)}</dt></div>
      <div use:reveal class="rv" style="--d:2"><dd class="t-num">{millions(C.games[demo.band]).replace(' million', 'M')}</dd><dt>games behind each band up to {C.bands.at(-2)}</dt></div>
      <div use:reveal class="rv" style="--d:3"><dd class="t-num">{n(C.traps[demo.band])}</dd><dt>traps at the {demo.band} band alone</dt></div>
    </dl>
  </section>

  <!-- 2. lines matched to your rating -->
  <section id="level" class="level" use:inview={{ on: (s) => { if (s) near.fan = true; }, once: true, margin: '700px', threshold: 0 }}>
    {#if near.fan}<BandFan />{:else}<div class="ph tall"></div>{/if}
  </section>

  <!-- 3. three ways to train -->
  <section id="ways" class="ways">
    <div class="wrap">
      <p class="kick rv" use:reveal>Three ways to train</p>
      <h2 class="rv" use:reveal>A daily queue, and two ways off it.</h2>
      <div class="three">
        <article class="card way rv" use:reveal style="--d:0">
          <div class="ill q">
            {#each QUEUE as [label, g, tone], i}<span class="qi" style="--i:{i}"><i class={tone}>{g}</i>{label}</span>{/each}
          </div>
          <h3><span class="t-name">Today</span></h3>
          <p>The reviews that are due, a few new moves, traps and your own mistakes, capped by limits you set. It is graded from how you play: there are no buttons to rate yourself with.</p>
        </article>
        <article class="card way rv" use:reveal style="--d:1">
          <div class="ill b">
            <div class="mini"><MiniBoard fen={before.fen} last={sq(before.uci)} arrow={sq(learn.uci)} label="After 1.e4 e5 2.Nf3 Nc6, an arrow shows the new move 3.Bc4" /></div>
            <p class="say"><b><i class="info">i</i>New move. Play {learn.san}</b><span>{learn.why}</span></p>
          </div>
          <h3><span class="t-name">Learn</span></h3>
          <p>Pick any position in the opening tree and learn the lines below it. A new move comes with an arrow and the reason it is played, then joins your reviews.</p>
        </article>
        <article class="card way rv" use:reveal style="--d:2">
          <div class="ill b">
            <div class="mini"><MiniBoard fen={demo.fan.fen} last={sq(demo.fan.path.at(-1)!)} label="The Italian Game after 3.Bc4" /></div>
            <p class="say"><span class="segs"><b>Lines</b><b>Traps</b><b>Mixed</b></span><span>Drill never changes your schedule.</span></p>
          </div>
          <h3><span class="t-name">Drill</span></h3>
          <p>Practise any line or its traps whenever you like, as often as you like. Your cards and their dates stay exactly as they were.</p>
        </article>
      </div>
      <p class="also rv" use:reveal>Also inside: <b>Arcade</b>, endless positions from your openings with a rating of their own, and <b>Play it out</b>, where you finish a line against an opponent that plays what your level plays, then Stockfish.</p>
    </div>
  </section>

  <!-- 4. traps, both ways -->
  <section id="traps" class="traps night" use:inview={{ on: (s) => { if (s) near.trap = true; }, once: true, margin: '700px', threshold: 0 }}>
    <div class="wrap">
      <p class="kick rv" use:reveal>Traps, both ways</p>
      <h2 class="rv" use:reveal>Know the move that loses <em>before</em> you play it.</h2>
      <p class="lead rv" use:reveal>In this position {Math.round(T.freq)}% of players at the {T.band} band play {T.bait.san}. It costs {T.loss} points of winning chance. A <b>Danger</b> card teaches you the safe move and shows why the tempting one fails; a <b>Punish</b> card puts you on the other side when your opponent plays it.</p>
      <div class="rv" use:reveal>{#if near.trap}<TrapDemo />{:else}<div class="ph"></div>{/if}</div>
    </div>
  </section>

  <!-- 5. your own games -->
  <section class="own">
    <div class="wrap two">
      <div>
        <p class="kick rv" use:reveal>Your own games</p>
        <h2 class="rv" use:reveal>Every real mistake becomes a card.</h2>
        <p class="lead rv" use:reveal>Give Ply your chess.com or Lichess name and it reads your recent games, finds the moves where you left your lines or lost the thread, and turns them into cards you review until they stick. Replies your opponents played that your lines do not cover show up too, ready to learn.</p>
        <p class="lead small rv" use:reveal>The analysis runs on your device, with a copy of Stockfish built into the app. Your games are not analysed on a server.</p>
      </div>
      <div class="mis rv" use:reveal aria-label="An example: a mistake from a game turned into a card">
        <div class="card game">
          <p class="gh"><b>From one of your games</b><span>example</span></p>
          <p class="mrow"><i class="q">?</i><b>6.{T.bait.san}</b><span>−{T.loss}% win chance</span></p>
        </div>
        <span class="arrow" aria-hidden="true"><Icon name="next" size={22} /></span>
        <div class="card mcard">
          <p class="tag"><Plies stage="learning" size={15} /> Your mistake</p>
          <div class="mini"><MiniBoard fen={T.fen} last={sq(T.setup)} arrow={sq(T.safe.uci)} label="The position from the game, with the right move {T.safe.san} shown" /></div>
          <p class="in">In the game you played <b>{T.bait.san}</b>.</p>
          <p class="ans">The move is <b>{T.safe.san}</b></p>
        </div>
      </div>
    </div>
  </section>

  <!-- 6. the skill tree: its own night room -->
  <section class="treeband night">
    <div class="wrap two">
      <div>
        <p class="kick rv" use:reveal>The skill tree</p>
        <h2 class="rv" use:reveal>An opening is something you grow.</h2>
        <p class="lead rv" use:reveal>Each tile is one of your moves, with the reply it answers and how often you will meet it written above. A learned tile turns to birch and gains a veneer as it goes from learning to young to mature. This is the {demo.fan.name} at the {demo.band} band.</p>
        <ul class="key rv" use:reveal>
          <li><Plies stage="learning" size={18} /> Learning</li>
          <li><Plies stage="young" size={18} /> Young</li>
          <li><Plies stage="mature" size={18} /> Mature</li>
        </ul>
      </div>
      <div class="canvas rv" use:reveal>{#key narrow}<MiniTree deep={!narrow} />{/key}</div>
    </div>
  </section>

  <!-- 7. sigils -->
  <section class="wall" use:inview={{ on: (s) => { if (s) wall = true; }, once: true, threshold: 0.12 }}>
    <div class="wrap">
      <p class="kick rv" use:reveal>{n(C.openings)} named openings</p>
      <h2 class="rv" use:reveal>Each one has its own mark.</h2>
      <p class="lead rv" use:reveal>A sigil is the path an opening's first moves trace across the board: your moves in colour, your opponent's in ink, a knight's move as its L. It is drawn from the moves, so every opening in the data has one. You never type a line in.</p>
      <ul class="sigils">
        {#each demo.sigils as s, i (s.name)}
          <li style="--i:{i}">
            <span class="tile">{#if wall}<Sigil path={s.path} hue={HUES[i % HUES.length]} flip={s.side === 'b'} you={s.side} size={84} draw={!desk.still} />{/if}</span>
            <span class="t-name sn">{s.name.split(': ')[0]}</span><span class="se">{s.name.includes(': ') ? s.name.split(': ')[1] + ' · ' : ''}{s.eco}</span>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <!-- 8. Birch and the game layer -->
  <section class="birch">
    <div class="wrap two">
      <div class="stagebirch rv" use:reveal use:inview={{ on: (s) => (birchSeen = s), threshold: 0.4 }}>
        <button class="pawn" onclick={() => (talk = (talk + 1) % TALK.length)} aria-label="Birch. Press for his next line"><Mascot mood={TALK[talk][0]} size={168} /></button>
        {#key talk}<p class="bubble" role="status">{TALK[talk][1]}</p>{/key}
      </div>
      <div>
        <p class="kick rv" use:reveal>Meet Birch</p>
        <h2 class="rv" use:reveal>A pawn on your side.</h2>
        <p class="lead rv" use:reveal>Birch explains each thing the first time it happens, then gets out of the way. Around the schedule there is a game: XP and levels from Pawn to King, a daily goal, a streak with freezes you earn every seven days, and fourteen trophies.</p>
        <p class="lead small rv" use:reveal>The game only rewards the work. The schedule decides what you see, and nothing you win ever changes a card.</p>
      </div>
    </div>
  </section>

  <!-- 9. every device -->
  <section class="devices">
    <div class="wrap two">
      <div>
        <p class="kick rv" use:reveal>Every device</p>
        <h2 class="rv" use:reveal>Train on the phone. Carry on at the desk.</h2>
        <p class="lead rv" use:reveal>{#if configured}Your repertoire, cards, reviews and settings live on your Ply account. A second device just logs in. {:else}Install Ply from the browser and it works like an app. {/if}It is built for a phone in one hand and for a wide screen with a keyboard: type <kbd>Nf3</kbd> and the move is played.</p>
        <p class="lead small rv" use:reveal>After the first launch Ply works offline. {#if configured}Changes sync when you open it, finish a session or come back online.{:else}This build keeps everything on this device; export a backup from Settings whenever you like.{/if}</p>
      </div>
      <div class="devs rv" use:reveal aria-hidden="true">
        <div class="lap"><div class="scr"><span class="sb"><i></i><i></i><i></i><i></i></span><span class="sl"><b class="t-name">Italian Game</b><i></i></span><span class="sc"><i></i><i></i></span></div><span class="base"></span></div>
        <span class="beam"><i></i><i></i><i></i></span>
        <div class="ph1"><div class="scr"><span class="sl"><b class="t-name">Italian Game</b><i></i></span><span class="sc"><i></i></span><span class="nb"></span></div></div>
      </div>
    </div>
  </section>

  <!-- 10. free and open -->
  <section id="free" class="free">
    <div class="wrap">
      <p class="kick rv" use:reveal>Free and open source</p>
      <h2 class="rv" use:reveal>No ads. No tracking. No cap.</h2>
      <div class="two start">
        <ul class="list rv" use:reveal>
          {#each FREE as f}<li><span class="ck"><Icon name="check" size={16} /></span>{f}</li>{/each}
        </ul>
        <div class="rv" use:reveal>
          <p class="lead">Ply is free software under the GPL-3.0 licence, and its opening data comes from the Lichess open database (CC0). It contains no analytics, advertising or third-party scripts, sets no cookies, and loads its fonts and icons from its own files.</p>
          <details>
            <summary>What does Ply store, and where?</summary>
            <p>{#if configured}Your login (an email address and a password Supabase keeps only as a hash, or who you are on Google or Lichess, with no Google or Lichess password), and a copy of your repertoire, cards, review history, games and settings, kept with Supabase, our database provider, so your devices can share them. Only your own login can read your rows. You can delete the account and everything on it from Settings.{:else}This build has no accounts: everything stays in this browser's storage and is never sent anywhere.{/if}</p>
          </details>
          <details>
            <summary>When does it connect to the internet?</summary>
            <p>To load the app and its opening data from GitHub Pages{#if configured}, to sync your account{/if}, and to chess.com or Lichess only for the usernames or studies you give it, to fetch public games, a rating or a study.</p>
          </details>
          <details>
            <summary>Will it raise my rating?</summary>
            <p>Nobody can promise that. Spaced repetition is well supported by memory research, but there is no published study on chess openings in particular. What Ply can show you is your own evidence: how you leave the opening in your real games, before and after.</p>
          </details>
          <p class="links"><a href="https://github.com/eben-vranken/ply" rel="noopener">Source code on GitHub</a><a href="https://database.lichess.org" rel="noopener">Lichess open database</a></p>
        </div>
      </div>
    </div>
  </section>

  <!-- back into the night: the way in -->
  <section class="enter night">
    <div class="wrap two mid">
      <div>
        <h2>{login ? 'Lay down the first layer.' : 'The board is set.'}</h2>
        <p class="lead">{#if login}Your first session takes a few minutes. Pick the openings you want to master, and Ply builds the lines from what your level plays.{:else}Everything on this page is in the app, on the full data.{/if}</p>
        <div class="row3" aria-hidden="true">
          <Sigil path={demo.sigils[0].path} size={72} /><Sigil path={demo.sigils[5].path} size={72} hue="#0f7a55" flip you="b" /><Sigil path={demo.sigils[2].path} size={72} hue="#cf331c" flip you="b" />
        </div>
      </div>
      <div class="door" use:inview={{ on: (s) => { if (s) onintent(); }, once: true, margin: '300px', threshold: 0 }}>
        {#if login}<Login bind:mode={loginMode} />
        {:else}
          <div class="open">
            <Mascot mood="cheer" size={96} />
            <button class="btn big sun wide" onclick={() => enter()}>{app.onboarded ? 'Open Ply' : 'Start training'}</button>
            {#if !configured}<p>This build has no accounts: your progress stays on this device.</p>{/if}
          </div>
        {/if}
      </div>
    </div>
    <footer class="wrap">
      <span>Ply 1.0 · GPL-3.0 · opening data {demo.version}</span>
      <span>Opening data from the <a href="https://database.lichess.org" rel="noopener">Lichess open database</a> (CC0) · <a href="https://github.com/eben-vranken/ply" rel="noopener">Source code</a></span>
    </footer>
  </section>
</div>

<style>
  .landing { position: absolute; inset: 0; z-index: 30; overflow-y: auto; overflow-x: hidden; background: var(--ground); color: var(--ink); user-select: text; -webkit-user-select: text; scroll-padding-top: 64px; overscroll-behavior: none; }
  .wrap { width: 100%; max-width: 1240px; margin: 0 auto; padding: 0 20px; }
  section { position: relative; padding: 84px 0; }
  .night { background: var(--night); color: var(--night-ink); }
  .kick { font-size: 13.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent-text); }
  .night .kick { color: var(--sun); }
  h1, h2 { font-family: var(--serif); font-style: italic; font-weight: 500; letter-spacing: -0.02em; text-wrap: balance; }
  h2 { font-size: clamp(32px, 4.4vw, 60px); line-height: 1.02; margin: 8px 0 14px; max-width: 18ch; }
  h2 em, h1 em { font-style: italic; color: var(--accent-text); }
  .night h2 em, .night h1 em { color: var(--sun); }
  .lead { font-size: 17px; line-height: 1.5; color: var(--ink-2); max-width: 56ch; }
  .lead b { color: var(--ink); }
  .lead.small { font-size: 15px; margin-top: 12px; }
  .night .lead { color: var(--night-ink-2); }
  .night .lead b { color: var(--night-ink); }
  .two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 36px; align-items: center; }
  kbd { font: inherit; font-weight: 700; font-size: 0.9em; padding: 1px 7px; border-radius: 7px; background: var(--card); box-shadow: 0 2px 0 var(--quiet-edge); }
  a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
  .ph { min-height: 420px; }
  .ph.tall { height: 260vh; }

  /* the bar: clear over the hero, ink once you scroll */
  .top { position: sticky; top: 0; z-index: 20; height: 0; display: flex; align-items: flex-start; gap: 8px; padding: 0 12px; color: var(--night-ink); }
  .top > * { margin-top: calc(env(safe-area-inset-top) + 10px); position: relative; }
  .top::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: calc(env(safe-area-inset-top) + 64px); background: rgba(19, 23, 52, 0.92); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); opacity: 0; transition: opacity 240ms; pointer-events: none; }
  .top.scrolled::before { opacity: 1; }
  .mark { display: flex; align-items: center; gap: 9px; height: 44px; padding: 0 10px 0 6px; border-radius: 12px; font-size: 27px; }
  .logo { display: flex; flex-direction: column; gap: 3px; }
  .logo i { width: 22px; height: 5px; border-radius: 2px; background: var(--birch); }
  .logo i:nth-child(2) { background: var(--birch-3); }
  .logo i:nth-child(3) { background: var(--sun); }
  .top nav { display: none; margin-left: auto; gap: 2px; }
  .top nav button { height: 44px; padding: 0 12px; border-radius: 12px; font-size: 14.5px; font-weight: 600; color: var(--night-ink-2); transition: color 160ms, background 160ms; }
  .top nav button:hover { color: var(--night-ink); background: rgba(255, 255, 255, 0.08); }
  .top .in { margin-left: auto; height: 44px; padding: 0 18px; border-radius: 13px; background: var(--birch); color: var(--ink-fixed); font-weight: 700; font-size: 15px; box-shadow: 0 3px 0 var(--birch-3); transition: transform 90ms var(--ease), box-shadow 90ms var(--ease); }
  .top .in:hover { background: #fff0d2; }
  .top .in:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--birch-3); }
  .landing :global(:focus-visible) { outline-color: var(--sun); }

  /* hero */
  .hero { padding: calc(env(safe-area-inset-top) + 84px) 0 56px; overflow: hidden; background: radial-gradient(90% 70% at 78% 30%, #1d2350 0%, var(--night) 62%); }
  .hgrid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 34px; align-items: center; }
  h1 { font-size: clamp(50px, 7.4vw, 112px); line-height: 0.92; margin: 12px 0 18px; }
  .sub { font-size: clamp(16.5px, 1.5vw, 20px); line-height: 1.45; color: var(--night-ink-2); max-width: 44ch; }
  .acts { display: flex; flex-wrap: wrap; gap: 12px; margin: 26px 0 16px; }
  .acts .btn:hover, .open .btn:hover { filter: brightness(1.06); }
  .tiny { font-size: 13px; color: var(--night-ink-2); max-width: 46ch; }

  /* the numbers */
  .facts { padding: 0; background: var(--birch); color: var(--ink-fixed); box-shadow: inset 0 -10px 0 -4px var(--birch-3), inset 0 -4px 0 #a67f4d; }
  .facts dl { display: grid; grid-template-columns: 1fr 1fr; gap: 22px 16px; margin: 0 auto; padding-top: 30px; padding-bottom: 38px; }
  .facts dd { margin: 0; font-size: clamp(34px, 4.6vw, 60px); line-height: 1; font-weight: 750; letter-spacing: -0.04em; }
  .facts dt { font-size: 14px; color: var(--walnut); margin-top: 5px; font-weight: 550; }

  .level { padding: 0; }

  /* three ways */
  .three { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; margin-top: 28px; }
  .way { display: flex; flex-direction: column; padding: 14px 14px 20px; transition: transform 260ms var(--ease); }
  .way:hover { transform: translateY(-4px); }
  .way h3 { font-size: 30px; font-weight: 500; margin: 16px 6px 6px; }
  .way > p { font-size: 15px; line-height: 1.45; color: var(--ink-2); margin: 0 6px; }
  .ill { height: 200px; border-radius: 16px; background: var(--ground); display: flex; align-items: center; gap: 14px; padding: 16px; overflow: hidden; }
  .ill.q { flex-direction: column; align-items: stretch; justify-content: center; gap: 6px; }
  .qi { display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 10px 0 4px; border-radius: 10px; background: var(--card); font-size: 14px; font-weight: 650; box-shadow: var(--shadow); width: calc(100% - var(--i) * 7%); }
  .qi i, .say i, .mrow .q { flex: none; display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 4px; border-radius: 7px; font-style: normal; font-weight: 800; font-size: 12px; letter-spacing: -0.05em; color: #fff; }
  i.good { background: var(--good); border-radius: 50%; } i.bad, .mrow .q { background: var(--bad); } i.info { background: var(--cobalt); font-family: var(--serif); font-style: italic !important; }
  .mini { flex: none; width: 46%; max-width: 168px; }
  .say { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; line-height: 1.35; color: var(--ink-2); min-width: 0; }
  .say b { display: flex; align-items: center; gap: 7px; font-size: 15px; color: var(--ink); }
  .say span:not(.segs) { font-family: var(--serif); font-style: italic; font-size: 14.5px; }
  .segs { display: flex; gap: 4px; }
  .segs b { height: 28px; padding: 0 9px; border-radius: 9px; background: var(--card); font-size: 13px; box-shadow: var(--shadow); }
  .segs b:first-child { background: var(--cobalt); color: #fff; }
  .also { margin-top: 22px; font-size: 15px; line-height: 1.5; color: var(--ink-2); max-width: 78ch; }
  .also b { color: var(--ink); }

  .traps .lead { margin-bottom: 34px; }

  /* your own games */
  .mis { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .game { width: 100%; max-width: 340px; padding: 14px 16px; }
  .gh { display: flex; justify-content: space-between; align-items: baseline; font-size: 14.5px; margin-bottom: 10px; }
  .gh span { font-size: 12px; color: var(--ink-3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .mrow { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px; border-radius: 12px; background: var(--ground); font-weight: 650; }
  .mrow span { margin-left: auto; font-weight: 500; font-size: 13px; color: var(--ink-2); }
  .arrow { color: var(--ink-3); transform: rotate(90deg); }
  .mcard { width: 100%; max-width: 340px; background: var(--night); color: var(--night-ink); padding: 16px; display: grid; grid-template-columns: 124px 1fr; gap: 6px 14px; align-items: center; }
  .mcard .tag { grid-column: 1 / -1; display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; color: var(--night-ink-2); }
  .mcard .mini { grid-row: 2 / span 2; width: 124px; }
  .mcard .in { font-size: 13.5px; color: var(--night-ink-2); align-self: end; }
  .mcard .in b { color: var(--night-ink); }
  .mcard .ans { font-size: 19px; font-weight: 700; align-self: start; color: #8fe3bd; }

  /* the tree */
  .canvas { border-radius: 26px; padding: 22px 18px; background: radial-gradient(120% 70% at 10% 20%, #1a1e44 0%, #0d1024 60%, #090b1a 100%); box-shadow: inset 0 0 0 1px var(--night-3); background-size: auto; }
  .key { list-style: none; display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 0; margin: 18px 0 0; font-size: 14px; font-weight: 600; color: var(--night-ink-2); }
  .key li { display: flex; align-items: center; gap: 7px; }

  /* sigils */
  .sigils { list-style: none; padding: 0; margin: 32px 0 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px 10px; }
  .sigils li { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 2px; }
  .tile { width: 84px; height: 84px; border-radius: 15px; background: var(--birch); margin-bottom: 8px; box-shadow: 0 4px 0 var(--birch-3); transition: transform 260ms var(--spring); }
  .sigils li:hover .tile { transform: translateY(-4px) rotate(-3deg); }
  .sigils :global(.draw path), .sigils :global(.draw circle) { animation-delay: calc(var(--i) * 70ms + var(--i, 0) * 0ms + 200ms); }
  .sn { font-size: 16px; line-height: 1.15; }
  .se { font-size: 11.5px; font-weight: 600; color: var(--ink-3); line-height: 1.25; }
  .sigils li:nth-child(n + 13) { display: none; }

  /* Birch */
  .stagebirch { display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .pawn { border-radius: 50%; padding: 10px; transition: transform 200ms var(--spring); }
  .pawn:hover { transform: scale(1.05) rotate(-3deg); }
  .pawn:active { transform: scale(0.96); }
  .bubble { position: relative; max-width: 380px; padding: 14px 18px; border-radius: 20px; background: var(--card); box-shadow: var(--shadow); font-size: 16px; line-height: 1.4; min-height: 74px; animation: rise 360ms var(--spring) both; }
  .bubble::before { content: ''; position: absolute; left: 50%; top: -6px; width: 14px; height: 14px; margin-left: -7px; background: var(--card); border-radius: 3px; transform: rotate(45deg); }

  /* devices: two outlines, one hero slab in each */
  .devs { display: flex; align-items: flex-end; justify-content: center; gap: 14px; }
  .lap { width: min(62%, 380px); }
  .lap .scr { aspect-ratio: 16 / 10; border-radius: 12px 12px 0 0; border: 6px solid var(--ink); border-bottom-width: 8px; background: var(--ground); display: grid; grid-template-columns: 17% 1fr 26%; gap: 5%; padding: 5%; }
  .base { display: block; height: 9px; margin: 0 -7%; border-radius: 0 0 10px 10px; background: var(--ink); }
  .ph1 { width: min(21%, 124px); }
  .ph1 .scr { aspect-ratio: 9 / 18.5; border-radius: 16px; border: 5px solid var(--ink); background: var(--ground); display: flex; flex-direction: column; gap: 6%; padding: 12% 9% 8%; }
  .sb { display: flex; flex-direction: column; gap: 9%; padding: 14% 12%; border-radius: 6px; background: var(--bar); }
  .sb i { height: 9%; border-radius: 3px; background: rgba(255, 255, 255, 0.25); }
  .sb i:first-child { background: var(--birch); }
  .sl { display: flex; flex-direction: column; justify-content: space-between; border-radius: 7px; background: var(--birch); padding: 9%; box-shadow: 0 3px 0 var(--birch-3); color: var(--ink-fixed); min-height: 0; }
  .sl b { font-size: clamp(8px, 1.3vw, 15px); font-weight: 500; line-height: 1; }
  .sl i { height: 16%; min-height: 6px; border-radius: 4px; background: var(--cobalt); box-shadow: 0 2px 0 var(--cobalt-deep); }
  .ph1 .sl { flex: 1.1; }
  .sc { display: flex; flex-direction: column; gap: 10%; min-height: 0; }
  .sc i { flex: 1; border-radius: 6px; background: var(--card); }
  .ph1 .sc { flex: 0.6; }
  .nb { height: 9%; border-radius: 6px; background: var(--bar); }
  .beam { display: flex; gap: 6px; align-self: center; }
  .beam i { width: 7px; height: 7px; border-radius: 50%; background: var(--cobalt); opacity: 0.25; animation: beam 1.8s ease-in-out infinite; }
  .beam i:nth-child(2) { animation-delay: 200ms; } .beam i:nth-child(3) { animation-delay: 400ms; }
  @keyframes beam { 0%, 100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.25); } }

  /* free */
  .two.start { align-items: start; margin-top: 26px; }
  .list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .list li { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 18px; background: var(--card); box-shadow: var(--shadow); font-weight: 600; font-size: 16px; line-height: 1.3; }
  .ck { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--good); color: #fff; }
  details { border-top: 1px solid var(--line); margin-top: 16px; padding-top: 4px; }
  summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; font-weight: 650; font-size: 16px; list-style: none; border-radius: 8px; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: '+'; margin-left: auto; font-size: 22px; font-weight: 500; color: var(--ink-3); transition: transform 200ms var(--ease); }
  details[open] summary::after { transform: rotate(45deg); }
  details p { font-size: 15px; line-height: 1.5; color: var(--ink-2); padding: 0 0 10px; max-width: 60ch; }
  .links { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 20px; font-weight: 650; color: var(--accent-text); }
  .links a { min-height: 44px; display: inline-flex; align-items: center; }

  /* the way in */
  .enter { padding-bottom: 0; background: radial-gradient(80% 60% at 70% 30%, #1d2350 0%, var(--night) 65%); }
  .enter h2 { font-size: clamp(38px, 5vw, 72px); }
  .row3 { display: flex; gap: 12px; margin-top: 26px; }
  .row3 :global(svg:nth-child(1)) { transform: rotate(-6deg); } .row3 :global(svg:nth-child(3)) { transform: rotate(5deg) translateY(6px); }
  .door { display: flex; justify-content: center; }
  .open { width: 100%; max-width: 420px; display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 28px 24px 30px; border-radius: var(--r-xl); background: var(--night-2); box-shadow: inset 0 0 0 1.5px var(--night-3); text-align: center; }
  .open p { font-size: 13.5px; color: var(--night-ink-2); }
  footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 20px; margin-top: 72px; padding-top: 18px; padding-bottom: calc(env(safe-area-inset-bottom) + 22px); border-top: 1px solid var(--night-3); font-size: 13px; color: var(--night-ink-2); }

  /* scroll reveals: transform and opacity only */
  @media (prefers-reduced-motion: no-preference) {
    @supports (animation-timeline: view()) {
      .rv { animation: rv linear both; animation-timeline: view(); animation-range: entry calc(var(--d, 0) * 6%) entry calc(46% + var(--d, 0) * 6%); }
      /* the board sinks back into the room as the hero scrolls away */
      .live { animation: sink linear both; animation-timeline: view(); animation-range: exit 10% exit 100%; }
    }
    .rv:global(.wait) { opacity: 0; transform: translateY(26px); transition: opacity 640ms var(--ease), transform 640ms var(--ease); transition-delay: calc(var(--d, 0) * 80ms); }
    .rv:global(.wait.in) { opacity: 1; transform: none; }
  }
  @keyframes rv { from { opacity: 0; transform: translateY(30px); } }
  @keyframes sink { to { opacity: 0.25; transform: translateY(-40px) scale(0.94); } }

  @media (min-width: 620px) {
    .facts dl { grid-template-columns: repeat(4, 1fr); }
    .sigils { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .sigils li:nth-child(n + 13) { display: flex; }
    .mis { flex-direction: row; justify-content: center; }
    .arrow { transform: none; }
  }
  @media (min-width: 900px) {
    .wrap { padding: 0 40px; }
    section { padding: 120px 0; }
    .top { padding: 0 28px; }
    .top nav { display: flex; }
    .top .in { margin-left: 8px; }
    .hero { min-height: min(100vh, 980px); display: flex; align-items: center; padding-bottom: 72px; }
    .hero .wrap { max-width: 1480px; }
    .hgrid { grid-template-columns: minmax(340px, 0.66fr) minmax(0, 1.34fr); gap: 48px; }
    h1 { font-size: clamp(50px, 6.2vw, 104px); }
    .two { grid-template-columns: 1fr 1fr; gap: 64px; }
    .two.mid { grid-template-columns: 1fr minmax(0, 480px); }
    .enter { padding-top: 84px; }
    .three { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
    .treeband .two { grid-template-columns: 0.7fr 1.3fr; align-items: start; }
    .treeband .two > div:first-child { position: sticky; top: 110px; }
    .sigils { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 34px 14px; }
    .birch .two { grid-template-columns: 0.8fr 1.2fr; }
    .mis { flex-direction: column; }
    .arrow { transform: rotate(90deg); }
    .game, .mcard { max-width: 400px; }
    .mcard { grid-template-columns: 150px 1fr; }
    .mcard .mini { width: 150px; }
  }
  @media (min-width: 1200px) { .sigils { grid-template-columns: repeat(8, minmax(0, 1fr)); } }
</style>
