<script lang="ts">
  // The landing page (docs/DESIGN.md, "The landing page"): what Ply is, shown working on the real
  // opening data, built to turn a visitor into someone training. Signing up and logging in are
  // pages of their own (routes/Auth.svelte). Every number comes from src/landing/demo.ts.
  import { onMount } from 'svelte';
  import { go, app } from '../lib/state.svelte';
  import { configured, cloud } from '../lib/cloud/cloud.svelte';
  import { desk } from '../lib/desk.svelte';
  import Icon from '../lib/Icon.svelte';
  import Sigil from '../lib/Sigil.svelte';
  import Plies from '../lib/Plies.svelte';
  import Mascot from '../lib/Mascot.svelte';
  import MiniBoard from '../lib/MiniBoard.svelte';
  import HeroDemo from '../landing/HeroDemo.svelte';
  import Bands from '../landing/Bands.svelte';
  import Curve from '../landing/Curve.svelte';
  import TrapDemo from '../landing/TrapDemo.svelte';
  import MiniTree from '../landing/MiniTree.svelte';
  import { reveal, count, spotlight, seen } from '../landing/motion';
  import { demo, n, sq, mover, allGames } from '../landing/demo';

  /** called once the visitor shows they mean to come in, so the app can start fetching its data */
  let { onintent = () => {} }: { onintent?: () => void } = $props();
  const C = demo.counts, T = demo.trap;
  // accounts are on and nobody is logged in: the buttons lead to sign up and log in. Otherwise they open the app.
  const login = $derived(configured && !cloud.user);
  const cta = $derived(login ? 'Start training free' : app.onboarded ? 'Open Ply' : 'Start training');
  const ctaShort = $derived(login ? 'Get started' : app.onboarded ? 'Open Ply' : 'Start');
  function enter(mode: 'login' | 'signup' = 'signup') {
    onintent();
    menu = false;
    go(login ? '/' + mode : '/today');
  }

  let root = $state<HTMLDivElement>();
  let scrolled = $state(false);
  let menu = $state(false);
  /** 0 → 1 over the first part of the page: the hero's words and sky drift as you leave it */
  let tilt = $state(0);
  let raf = 0;
  function onscroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const y = root?.scrollTop ?? 0;
      scrolled = y > 12;
      tilt = Math.min(1, y / 520);
    });
  }
  function to(id: string) {
    menu = false;
    document.getElementById(id)?.scrollIntoView({ behavior: desk.still ? 'auto' : 'smooth' });
  }
  // the phone's bottom bar: once the hero's buttons have gone, and until the closing call to action
  let heroCta = $state(true), closing = $state(false);
  const bar = $derived(!heroCta && !closing);

  let narrow = $state(typeof matchMedia === 'function' && matchMedia('(max-width: 899px)').matches);
  onMount(() => {
    const m = matchMedia('(max-width: 899px)');
    const f = () => (narrow = m.matches);
    m.addEventListener('change', f);
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') menu = false; };
    addEventListener('keydown', k);
    return () => { m.removeEventListener('change', f); removeEventListener('keydown', k); cancelAnimationFrame(raf); };
  });

  // the heavy demos (they own a chessground board) are built just before they scroll in
  let near = $state({ trap: false });


  // typing a move: N, f, 3, then it is played
  const KEYS = ['N', 'f', '3'];
  let typed = $state(0), typing = $state(false);
  $effect(() => {
    if (!typing || desk.still) { if (desk.still) typed = 4; return; }
    const t = setInterval(() => (typed = (typed + 1) % 7), 650);
    return () => clearInterval(t);
  });

  // offline, then back online, then synced: the review trained on the phone arrives on the laptop
  let syncing = $state(false), sync = $state(2);
  $effect(() => {
    if (!syncing || desk.still || !configured) { sync = 2; return; }
    sync = 0;
    const t = setInterval(() => (sync = (sync + 1) % 3), 1900);
    return () => clearInterval(t);
  });

  // the game layer: XP fills to the daily goal, then the flame lights
  let xpOn = $state(false);

  let faq = $state<number | null>(0);
  const HUES = ['#254bd2', '#c82611', '#018359', '#a77602', '#844bc6', '#067c8e'];
  const QUEUE: [string, string, string][] = [['Review', '!', 'good'], ['New move', '+', 'info'], ['Punish', '!', 'good'], ['Danger', '??', 'bad'], ['Your mistake', '?', 'bad']];
  const learn = demo.hero[4], before = demo.hero[3];
  const short = (s: string) => s.split(': ')[0];
  const rowA = demo.sigils.slice(0, 12), rowB = demo.sigils.slice(12, 24);
  const FREE = ['Unlimited openings and unlimited reviews', 'Today, Learn, Drill, Arcade and Play it out', 'PGN import and export, Lichess studies', 'Your chess.com and Lichess games, analysed', 'Streak freezes you earn by playing'];
  const FAQ = $derived<[string, string][]>([
    ['Is Ply really free?', 'Yes. Unlimited openings and reviews, every way to train, and your games imported and analysed, with no ads.'],
    ['I am not a strong player. Is it for me?', `Ply builds your lines from what players at your level actually play, in ${C.bands.length} rating bands from ${C.bands[0]} to ${C.bands.at(-1)}. A line you will never meet is a line you do not have to learn yet.`],
    ['Can I bring my own repertoire?', 'Yes. Import a PGN or a Lichess study, or build your lines move by move from the opening tree, with every move\'s frequency, results and engine eval beside it. Export them again whenever you like.'],
    ['Does it work offline?', `After the first launch, yes: every opening ships inside the app. ${configured ? 'Your progress syncs to your account when you are back online, so your phone and your desktop stay the same.' : 'This build keeps everything on this device; export a backup from Settings whenever you like.'}`],
    ['What does Ply store, and where?', configured ? 'Your login (an email address and a password Supabase keeps only as a hash, or who you are on Lichess, never a Lichess password) and a copy of your repertoire, cards, reviews, games and settings, kept with Supabase so your devices can share them. Only your own login can read your rows. You can delete the account and everything on it from Settings.' : 'This build has no accounts: everything stays in this browser\'s storage and is never sent anywhere.'],
    ['Will it raise my rating?', 'Nobody can honestly promise that. Spaced repetition is well supported by memory research, but there is no published study on chess openings in particular. What Ply can show you is your own evidence: how you leave the opening in your real games, before and after.']
  ]);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="landing" bind:this={root} {onscroll} onkeydown={(e) => { if (e.key === 'Tab') near.trap = true; }}>
  <!-- the bar: clear over the hero, frosted once you scroll -->
  <header class="top" class:scrolled>
    <div class="bar-in">
      <button class="mark" onclick={() => root?.scrollTo({ top: 0, behavior: desk.still ? 'auto' : 'smooth' })} aria-label="Ply, back to the top">
        <span class="logo" aria-hidden="true"><i></i><i></i><i></i></span><span class="t-name">Ply</span>
      </button>
      <nav aria-label="On this page">
        <button onclick={() => to('how')}>How it works</button>
        <button onclick={() => to('features')}>Features</button>
        <button onclick={() => to('traps')}>Traps</button>
        <button onclick={() => to('open')}>Privacy</button>
        <button onclick={() => to('faq')}>FAQ</button>
      </nav>
      <div class="acts-top">
        {#if login}<button class="ghost" onclick={() => enter('login')}>Log in</button>{/if}
        <button class="pill in" onclick={() => enter('signup')} aria-label={login ? 'Get started: create a free account' : 'Open Ply'}><span>{ctaShort}</span><Icon name="next" size={16} /></button>
        <button class="burger" class:open={menu} onclick={() => (menu = !menu)} aria-label={menu ? 'Close the menu' : 'Open the menu'} aria-expanded={menu}><i></i><i></i></button>
      </div>
    </div>
  </header>

  {#if menu}
    <div class="menu" role="dialog" aria-modal="true" aria-label="Menu">
      <nav>
        {#each [['how', 'How it works'], ['features', 'Features'], ['traps', 'Traps'], ['open', 'Privacy'], ['faq', 'FAQ']] as [id, label], i}
          <button style="--i:{i}" onclick={() => to(id)}>{label}<Icon name="next" size={20} /></button>
        {/each}
      </nav>
      <div class="menu-acts" style="--i:5">
        <button class="btn big sun wide" onclick={() => enter('signup')}>{cta}</button>
        {#if login}<button class="btn big night wide" onclick={() => enter('login')}>Log in</button>{/if}
      </div>
    </div>
  {/if}

  <!-- 1. hero: the night room, where the board is the only bright thing -->
  <section class="hero">
    <div class="sky" aria-hidden="true" style="--p:{tilt}"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="checks"></i></div>
    <div class="wrap hero-in" style="--p:{tilt}">
      <h1 aria-label="Openings that stay learned.">
        <span class="w" style="--w:0">Openings</span>{' '}<span class="w" style="--w:1">that</span>{' '}<span class="w" style="--w:2"><em>stay</em></span>{' '}<span class="w" style="--w:3">learned.</span>
      </h1>
      <p class="sub">Ply teaches you the opening lines players at your rating really play, then brings each move back just before you would forget it. A few minutes a day.</p>
      <div class="acts" use:seen={(s) => (heroCta = s)}>
        <button class="btn big sun cta" onclick={() => enter('signup')}><span>{cta}</span><span class="arr"><Icon name="next" size={20} /></span></button>
        <button class="btn big night more" onclick={() => to('how')}>See how it works</button>
      </div>
      <ul class="trust">
        <li><Icon name="book" size={16} />{n(C.openings)} openings built in</li>
        <li><Icon name="wifi" size={16} />Works offline</li>
        <li><Icon name="check" size={16} />No tracking</li>
      </ul>
    </div>

    <div class="stage-wrap wrap">
      <div class="frame-in">
        <div class="frame">
          <div class="chrome" aria-hidden="true"><i></i><i></i><i></i><span>Learn · Italian Game</span></div>
          <div class="screen-in"><HeroDemo /></div>
        </div>
        <div class="float f1" aria-hidden="true"><span class="g good">!</span><span><b>1.e4</b> learned</span></div>
        <div class="float f2" aria-hidden="true"><span class="g bad">??</span><span><b>Danger</b> · 6.{T.bait.san}</span></div>
        <div class="float f3" aria-hidden="true"><Icon name="flame" size={18} /><span><b>+10 XP</b> clean answer</span></div>
        <div class="float f4" aria-hidden="true"><Plies stage="young" size={18} /><span>Next review <b>in 6 days</b></span></div>
      </div>
      <p class="caption">Not a recording: this board is playing the {demo.band} band's data, built from {n(C.games[demo.band])} Lichess games.</p>
    </div>
  </section>

  <!-- 2. every opening, built in -->
  <section class="marquee" aria-label="Some of the openings inside">
    <p class="mq-label" use:reveal>Every named opening is built in, from the Lichess open database</p>
    <div class="mq">
      {#each [rowA, rowB] as row, r}
        <div class="track" class:rev={r === 1}>
          {#each [0, 1] as copy}
            <ul aria-hidden={copy === 1}>
              {#each row as s, i (s.name)}
                <li><span class="mini-s"><Sigil path={s.path} hue={HUES[(i + r * 3) % HUES.length]} flip={s.side === 'b'} you={s.side} size={30} /></span><span class="t-name">{short(s.name)}</span>{#if s.name.includes(': ')}<span class="var">{s.name.split(': ')[1].replace(/ (Variation|Attack|Defense)$/, '')}</span>{/if}<span class="eco-s">{s.eco}</span></li>
              {/each}
            </ul>
          {/each}
        </div>
      {/each}
    </div>
  </section>

  <!-- 3. the numbers -->
  <section class="facts" aria-label="What is inside">
    <dl class="wrap">
      <div use:reveal={0}><dd class="t-num" use:count={{ to: C.openings }}></dd><dt>named openings, every one built in</dt></div>
      <div use:reveal={90}><dd class="t-num" use:count={{ to: Math.floor(allGames / 1e6), suffix: 'M' }}></dd><dt>Lichess games behind the lines</dt></div>
      <div use:reveal={180}><dd class="t-num" use:count={{ to: C.bands.length, ms: 900 }}></dd><dt>rating bands, {C.bands[0]} to {C.bands.at(-1)}</dt></div>
      <div use:reveal={270}><dd class="t-num" use:count={{ to: C.traps[demo.band] }}></dd><dt>traps at the {demo.band} band alone</dt></div>
    </dl>
  </section>

  <!-- 4. how it works -->
  <section id="how" class="how">
    <div class="wrap">
      <header class="head center">
        <p class="kick" use:reveal>How it works</p>
        <h2 use:reveal={60}>Three steps. A few minutes a day.</h2>
      </header>
      <ol class="steps">
        <li class="step" use:reveal={0} data-r="up">
          <span class="num">1</span>
          <div class="ill pick">
            {#each [demo.sigils[0], demo.sigils[2], demo.sigils[7]] as s, i}
              <span class="pt" style="--i:{i}"><Sigil path={s.path} hue={HUES[i * 2]} flip={s.side === 'b'} you={s.side} size={64} /><span class="t-name">{short(s.name).replace(' Defense', '')}</span>{#if i !== 1}<i class="tick"><Icon name="check" size={13} /></i>{/if}</span>
            {/each}
          </div>
          <h3>Pick your openings</h3>
          <p>Choose what you play as White and as Black from all {n(C.openings)}, or import your own PGN.</p>
        </li>
        <li class="step" use:reveal={140} data-r="up">
          <span class="num">2</span>
          <div class="ill learn">
            <div class="mini"><MiniBoard fen={before.fen} last={sq(before.uci)} arrow={sq(learn.uci)} label="After 1.e4 e5 2.Nf3 Nc6, an arrow shows the new move 3.Bc4" /></div>
            <p class="say"><b><i class="info">i</i>Play {learn.san}</b><span>{learn.why.split('. ')[0]}.</span></p>
          </div>
          <h3>Learn what you will meet</h3>
          <p>Each line follows the replies players at your rating really choose, and every move comes with the reason it is played.</p>
        </li>
        <li class="step" use:reveal={280} data-r="up">
          <span class="num">3</span>
          <div class="ill queue">
            {#each QUEUE as [label, g, tone], i}<span class="qi" style="--i:{i}"><i class={tone}>{g}</i>{label}</span>{/each}
          </div>
          <h3>Review before you forget</h3>
          <p>A short daily queue brings each move back right on time. It is graded from how you play, with no buttons to rate yourself.</p>
        </li>
      </ol>
    </div>
  </section>

  <!-- 5. why it sticks -->
  <section class="science">
    <div class="wrap two">
      <div>
        <p class="kick" use:reveal>Spaced repetition</p>
        <h2 use:reveal={60}>Remember the line when the game <em>needs</em> it.</h2>
        <p class="lead" use:reveal={120}>Learn a line once and most of it is gone within a week. Ply schedules every move with FSRS, a modern spaced-repetition algorithm, and brings it back just before it would slip. Each review buys a longer gap, so a few minutes a day keeps a whole repertoire sharp.</p>
        <ul class="points" use:reveal={180}>
          <li><span class="ck"><Icon name="check" size={14} /></span>Tuned to your own memory, on your device</li>
          <li><span class="ck"><Icon name="check" size={14} /></span>Drilling never moves your schedule</li>
          <li><span class="ck"><Icon name="check" size={14} /></span>Your limits: new moves and reviews per day</li>
        </ul>
      </div>
      <div class="card chart" use:reveal={120} data-r="scale"><Curve /></div>
    </div>
  </section>

  <!-- 6. features: a bento grid on a desktop, a carousel on a phone -->
  <section id="features" class="features">
    <div class="wrap">
      <header class="head">
        <p class="kick" use:reveal>Everything inside</p>
        <h2 use:reveal={60}>Built around the games you actually play.</h2>
      </header>

      {#snippet level()}
        <div class="fc-copy">
          <h3>Matched to your rating</h3>
          <p>Lines built from {C.bands.length} rating bands. <b>{mover.san}</b> is played in {Math.round(mover.hi)}% of games at {mover.at} and {mover.lo < 1 ? 'under 1' : Math.round(mover.lo)}% at {mover.low}, so you learn what you will meet.</p>
        </div>
        <div class="fc-ill"><Bands rows={5} board /></div>
      {/snippet}
      {#snippet mistakes()}
        <div class="fc-copy">
          <h3>Your mistakes become cards</h3>
          <p>Link chess.com or Lichess. Ply finds where you left your lines and turns every slip into a card, analysed by Stockfish on your device.</p>
        </div>
        <div class="fc-ill mis">
          <div class="gm"><p class="gh">From one of your games</p><p class="mrow"><i class="slip">?</i><b>6.{T.bait.san}</b><span>−{T.loss}%</span></p></div>
          <span class="flow" aria-hidden="true"><i></i><i></i><i></i></span>
          <div class="mc">
            <div class="mini"><MiniBoard fen={T.fen} last={sq(T.setup)} arrow={sq(T.safe.uci)} label="The position from the game, with the right move {T.safe.san} shown" /></div>
            <div><p class="tag"><Plies stage="learning" size={14} /> Your mistake</p><p class="ans">Play <b>{T.safe.san}</b></p></div>
          </div>
        </div>
      {/snippet}
      {#snippet tree()}
        <div class="fc-copy">
          <h3>Grow each opening like a skill tree</h3>
          <p>Every tile is one of your moves. It turns to birch as you learn it and gains a veneer as it matures. This is the {demo.fan.name} at {demo.band}.</p>
          <ul class="key"><li><Plies stage="learning" size={16} /> Learning</li><li><Plies stage="young" size={16} /> Young</li><li><Plies stage="mature" size={16} /> Mature</li></ul>
        </div>
        <div class="fc-ill canvas">{#key narrow}<MiniTree deep={!narrow} />{/key}</div>
      {/snippet}
      {#snippet game()}
        <div class="fc-copy">
          <h3>A game around the work</h3>
          <p>XP, levels from Pawn to King, a daily goal, streaks and trophies. Nothing you win ever changes a card.</p>
        </div>
        <div class="fc-ill xp" class:on={xpOn} use:seen={(s) => { if (s) xpOn = true; }}>
          <span class="birch"><Mascot mood={xpOn ? 'cheer' : 'idle'} size={76} /></span>
          <div class="xpc">
            <p class="xph"><b>Daily goal</b><span class="t-num">50 / 50 XP</span></p>
            <span class="xpb"><i></i></span>
            <p class="xpf"><span class="flame"><Icon name="flame" size={18} /></span><b>Streak kept</b></p>
          </div>
        </div>
      {/snippet}
      {#snippet keys()}
        <div class="fc-copy">
          <h3>Type the move</h3>
          <p>At a desk, a keyboard is faster than a mouse.</p>
        </div>
        <div class="fc-ill kb" use:seen={(s) => (typing = s)}>
          <div class="kr">{#each KEYS as k, i}<kbd class:down={typed === i + 1}>{k}</kbd>{/each}<kbd class="ent" class:down={typed === 4}>↵</kbd></div>
          <p class="typed" class:ok={typed >= 4}><span>{typed >= 4 ? 'Nf3' : KEYS.slice(0, Math.min(typed, 3)).join('')}</span><i class="caret"></i>{#if typed >= 4}<i class="g good">!</i>{/if}</p>
        </div>
      {/snippet}
      {#snippet offline()}
        <div class="fc-copy">
          <h3>Offline, on every device</h3>
          <p>{configured ? 'Train on the train. It all syncs to your account when you are back online.' : 'Install it from the browser and it works like an app, with or without a connection.'}</p>
        </div>
        <div class="fc-ill sync s{sync}" aria-hidden="true" use:seen={(v) => (syncing = v)}>
          <div class="devs">
            <div class="ph1"><span class="pb"></span><span class="pb"></span><span class="pb s"></span><i class="dot"></i></div>
            <span class="beam"><i></i><i></i><i></i></span>
            <div class="lap"><div class="ls"><span class="pb"></span><span class="pb new"></span><span class="pb s"></span></div><span class="base"></span></div>
          </div>
          {#if configured}
            <p class="state">{#key sync}<span class="st">{#if sync === 0}<i class="sd off"></i>Offline · 2 reviews saved{:else if sync === 1}<i class="sd on"></i>Back online · syncing{:else}<i class="sd ok"><Icon name="check" size={11} /></i>Synced to every device{/if}</span>{/key}</p>
          {:else}
            <p class="state"><span class="st"><i class="sd ok"><Icon name="wifi" size={11} /></i>Works without a connection</span></p>
          {/if}
        </div>
      {/snippet}

      {#if narrow}
        <!-- the phone: one card after another, each at its own height, each arriving as it scrolls in -->
        <div class="flow-f">
          {#each [level, mistakes, tree, game, offline] as card}
            <article class="fc" class:dark={card === tree} use:reveal>{@render card()}</article>
          {/each}
        </div>
      {:else}
        <div class="bento">
          <article class="fc b-level" use:reveal={0} use:spotlight>{@render level()}</article>
          <article class="fc b-mis" use:reveal={80} use:spotlight>{@render mistakes()}</article>
          <article class="fc b-game" use:reveal={160} use:spotlight>{@render game()}</article>
          <article class="fc b-tree dark" use:reveal={0} use:spotlight>{@render tree()}</article>
          <article class="fc b-keys" use:reveal={120} use:spotlight>{@render keys()}</article>
          <article class="fc b-off" use:reveal={200} use:spotlight>{@render offline()}</article>
        </div>
      {/if}
    </div>
  </section>

  <!-- 7. traps, both ways -->
  <section id="traps" class="traps" use:seen={(s) => { if (s) near.trap = true; }}>
    <div class="wrap">
      <header class="head">
        <p class="kick" use:reveal>Traps, both ways</p>
        <h2 use:reveal={60}>Know the move that loses <em>before</em> you play it.</h2>
        <p class="lead" use:reveal={120}>In this position {Math.round(T.freq)}% of players at the {T.band} band play {T.bait.san}, and it costs them {T.loss} points of winning chance. <b>Danger</b> cards teach you to dodge it. <b>Punish</b> cards teach you to cash in.</p>
      </header>
      <div class="trap-box" use:reveal={160}>{#if near.trap}<TrapDemo />{:else}<div class="ph"></div>{/if}</div>
    </div>
  </section>

  <!-- 8. free and open -->
  <section id="open" class="open">
    <div class="wrap">
      <header class="head center">
        <p class="kick" use:reveal>Free and private</p>
        <h2 use:reveal={60}>No ads. No tracking.</h2>
        <p class="lead" use:reveal={120}>Ply is free to use, and your training is nobody's business but yours.</p>
      </header>
      <div class="pillars">
        <div class="pl" use:reveal={0} use:spotlight><span class="pi"><Icon name="star" size={22} /></span><h3>Free to use</h3><p>Every way to train, with unlimited openings and reviews.</p></div>
        <div class="pl" use:reveal={100} use:spotlight><span class="pi"><Icon name="explore" size={22} /></span><h3>Open data</h3><p>Built from the Lichess open database, released as CC0.</p></div>
        <div class="pl" use:reveal={200} use:spotlight><span class="pi"><Icon name="layers" size={22} /></span><h3>Private by design</h3><p>No analytics, no cookies, no third-party scripts.</p></div>
      </div>
      <ul class="free" use:reveal={120}>
        {#each FREE as f, i}<li style="--i:{i}"><span class="ck"><Icon name="check" size={14} /></span>{f}</li>{/each}
      </ul>
    </div>
  </section>

  <!-- 9. questions -->
  <section id="faq" class="faq">
    <div class="wrap two top-al">
      <header class="head">
        <p class="kick" use:reveal>Questions</p>
        <h2 use:reveal={60}>Good to know.</h2>
        <p class="lead" use:reveal={120}>The short answers to what people ask first.</p>
      </header>
      <div class="qs" use:reveal={120}>
        {#each FAQ as [q, a], i}
          <div class="q" class:open={faq === i}>
            <button aria-expanded={faq === i} aria-controls="faq-{i}" onclick={() => (faq = faq === i ? null : i)}><span>{q}</span><i class="pm" aria-hidden="true"></i></button>
            <div class="a" id="faq-{i}" role="region"><div><p>{a}</p></div></div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- 10. back into the night: the way in -->
  <section class="enter" use:seen={(s) => { closing = s; if (s) onintent(); }}>
    <div class="sky" aria-hidden="true"><i class="blob b1"></i><i class="blob b2"></i></div>
    <div class="orbit" aria-hidden="true">
      {#each demo.sigils.slice(0, 6) as s, i}<span class="os" style="--i:{i}"><Sigil path={s.path} hue={HUES[i]} flip={s.side === 'b'} you={s.side} size={narrow ? 44 : 64} /></span>{/each}
    </div>
    <div class="wrap enter-in">
      <span class="birch-e" use:reveal data-r="scale"><Mascot mood="cheer" size={narrow ? 84 : 104} /></span>
      <h2 use:reveal={60}>{login ? 'Lay down the first layer.' : 'The board is set.'}</h2>
      <p class="lead" use:reveal={120}>{login ? 'Your first session takes a few minutes. Pick your openings and Ply builds the lines from what your level plays.' : 'Everything on this page is in the app, on the full data.'}</p>
      <div class="acts center" use:reveal={180}>
        <button class="btn big sun cta" onclick={() => enter('signup')}><span>{login ? 'Create your free account' : cta}</span><span class="arr"><Icon name="next" size={20} /></span></button>
        {#if login}<button class="btn big night" onclick={() => enter('login')}>I have an account</button>{/if}
      </div>
      {#if !configured}<p class="fine" use:reveal={220}>This build has no accounts: your progress stays on this device.</p>{/if}
    </div>

    <footer class="foot wrap">
      <div class="fbrand">
        <span class="mark"><span class="logo" aria-hidden="true"><i></i><i></i><i></i></span><span class="t-name">Ply</span></span>
        <p>Chess openings that stay learned. Free, private and offline.</p>
      </div>
      <div class="fcol"><b>Product</b><button onclick={() => to('how')}>How it works</button><button onclick={() => to('features')}>Features</button><button onclick={() => to('traps')}>Traps</button><button onclick={() => to('faq')}>FAQ</button></div>
      
      {#if login}<div class="fcol"><b>Account</b><button onclick={() => enter('signup')}>Sign up</button><button onclick={() => enter('login')}>Log in</button></div>{/if}
      <div class="legal"><span>© {new Date().getFullYear()} Ply · opening data {demo.version}</span><span>Opening data from the <a href="https://database.lichess.org" rel="noopener">Lichess open database</a> (CC0)</span></div>
    </footer>
  </section>

  <!-- the phone's bottom bar -->
  <div class="dock" class:show={bar} aria-hidden={!bar}>
    <button class="btn sun wide" tabindex={bar ? 0 : -1} onclick={() => enter('signup')}>{cta}</button>
    {#if login}<button class="dock-l" tabindex={bar ? 0 : -1} onclick={() => enter('login')}>Log in</button>{/if}
  </div>
</div>

<style>
  .landing { position: absolute; inset: 0; z-index: 30; overflow-y: auto; overflow-x: hidden; background: var(--ground); color: var(--ink); user-select: text; -webkit-user-select: text; scroll-padding-top: 72px; overscroll-behavior: none; }
  .wrap { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 20px; }
  section { position: relative; padding: 88px 0; }
  .kick { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent-text); }
  .kick::before { content: ''; width: 18px; height: 2px; border-radius: 2px; background: currentColor; }
  h1, h2 { font-family: var(--serif); font-style: italic; font-weight: 500; letter-spacing: -0.025em; text-wrap: balance; }
  h2 { font-size: clamp(34px, 4.6vw, 62px); line-height: 1.02; margin: 12px 0 0; max-width: 20ch; }
  h2 em, h1 em { font-style: italic; color: var(--accent-text); }
  h3 { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; }
  .lead { font-size: 17.5px; line-height: 1.55; color: var(--ink-2); max-width: 54ch; margin-top: 18px; }
  .lead b { color: var(--ink); }
  .head.center { text-align: center; display: flex; flex-direction: column; align-items: center; }
  .head.center h2, .head.center .lead { margin-left: auto; margin-right: auto; }
  a { color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1.5px; }
  .ck { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--good); color: #fff; }
  .ph { min-height: 520px; }
  .landing :global(:focus-visible) { outline-color: var(--sun); }

  /* ------------------------------------------------ the bar */
  .top { position: sticky; top: 0; z-index: 20; height: 0; }
  .bar-in { position: relative; display: flex; align-items: center; gap: 8px; height: 64px; margin-top: env(safe-area-inset-top); padding: 0 12px 0 14px; color: var(--night-ink); animation: drop 700ms var(--ease) both; }
  .bar-in::before { content: ''; position: absolute; inset: 0; top: calc(-1 * env(safe-area-inset-top)); background: rgba(19, 23, 52, 0.93); -webkit-backdrop-filter: blur(16px) saturate(1.4); backdrop-filter: blur(16px) saturate(1.4); box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06); opacity: 0; transition: opacity 300ms; pointer-events: none; }
  .scrolled .bar-in::before { opacity: 1; }
  .bar-in > * { position: relative; }
  @keyframes drop { from { opacity: 0; transform: translateY(-16px); } }
  .mark { display: flex; align-items: center; gap: 9px; height: 44px; padding: 0 8px 0 4px; border-radius: 12px; font-size: 28px; }
  .logo { display: flex; flex-direction: column; gap: 3px; }
  .logo i { width: 22px; height: 5px; border-radius: 2px; background: var(--birch); transition: transform 400ms var(--spring); }
  .logo i:nth-child(2) { background: var(--birch-3); transition-delay: 40ms; }
  .logo i:nth-child(3) { background: var(--sun); transition-delay: 80ms; }
  .mark:hover .logo i:nth-child(1) { transform: translateX(3px); }
  .mark:hover .logo i:nth-child(3) { transform: translateX(-3px); }
  .top nav { display: none; margin: 0 auto; gap: 2px; }
  .top nav button { position: relative; height: 40px; padding: 0 14px; font-size: 14.5px; font-weight: 600; color: var(--night-ink-2); transition: color 200ms; }
  .top nav button::after { content: ''; position: absolute; left: 14px; right: 14px; bottom: 6px; height: 2px; border-radius: 2px; background: var(--sun); transform: scaleX(0); transform-origin: left; transition: transform 300ms var(--ease); }
  .top nav button:hover { color: var(--night-ink); }
  .top nav button:hover::after { transform: scaleX(1); }
  .acts-top { margin-left: auto; display: flex; align-items: center; gap: 6px; }
  .ghost { display: none; height: 40px; padding: 0 14px; border-radius: 12px; font-weight: 650; font-size: 14.5px; color: var(--night-ink); transition: background 200ms; }
  .ghost:hover { background: rgba(255, 255, 255, 0.08); }
  .pill { position: relative; overflow: hidden; display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 12px 0 16px; border-radius: 99px; background: var(--sun); color: #3c2a0b; font-weight: 750; font-size: 14.5px; box-shadow: 0 3px 0 #be8709; transition: transform 160ms var(--ease), box-shadow 160ms var(--ease); }
  .pill :global(svg) { transition: transform 260ms var(--spring); }
  .pill:hover :global(svg) { transform: translateX(3px); }
  .pill:hover { transform: translateY(-1px); box-shadow: 0 4px 0 #be8709; }
  .pill:active { transform: translateY(2px); box-shadow: 0 1px 0 #be8709; }
  .burger { width: 44px; height: 44px; display: grid; place-content: center; gap: 6px; border-radius: 12px; }
  .burger i { display: block; width: 20px; height: 2px; border-radius: 2px; background: var(--night-ink); transition: transform 320ms var(--spring); }
  .burger.open i:first-child { transform: translateY(4px) rotate(45deg); }
  .burger.open i:last-child { transform: translateY(-4px) rotate(-45deg); }

  .menu { position: fixed; inset: 0; z-index: 15; padding: calc(env(safe-area-inset-top) + 84px) 20px calc(env(safe-area-inset-bottom) + 24px); background: var(--night); color: var(--night-ink); display: flex; flex-direction: column; justify-content: space-between; animation: fadein 260ms ease both; }
  .menu nav { display: flex; flex-direction: column; }
  .menu nav button { display: flex; align-items: center; justify-content: space-between; min-height: 64px; border-bottom: 1px solid var(--night-3); font-family: var(--serif); font-style: italic; font-size: 32px; letter-spacing: -0.02em; animation: slidein 520ms var(--ease) both; animation-delay: calc(80ms + var(--i) * 50ms); }
  .menu nav button :global(svg) { color: var(--night-ink-2); }
  .menu-acts { display: flex; flex-direction: column; gap: 14px; animation: slidein 520ms var(--ease) both; animation-delay: 360ms; }
  @keyframes fadein { from { opacity: 0; } }
  @keyframes slidein { from { opacity: 0; transform: translateY(18px); } }

  /* ------------------------------------------------ hero */
  .hero { padding: calc(env(safe-area-inset-top) + 112px) 0 72px; background: var(--night); color: var(--night-ink); overflow: hidden; isolation: isolate; }
  .sky { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
  .blob { position: absolute; border-radius: 50%; filter: blur(70px); opacity: 0.55; }
  .b1 { width: 620px; height: 620px; left: -160px; top: -220px; background: #254bd2; animation: drift1 18s ease-in-out infinite alternate; }
  .b2 { width: 520px; height: 520px; right: -180px; top: 120px; background: #7238b1; opacity: 0.35; animation: drift2 22s ease-in-out infinite alternate; }
  .b3 { width: 460px; height: 460px; left: 40%; bottom: -240px; background: #ffbe45; opacity: 0.16; animation: drift1 26s ease-in-out infinite alternate-reverse; }
  @keyframes drift1 { to { transform: translate(120px, 80px) scale(1.15); } }
  @keyframes drift2 { to { transform: translate(-140px, -60px) scale(0.9); } }
  .checks { position: absolute; inset: 0; background-image: conic-gradient(rgba(255, 255, 255, 0.045) 90deg, transparent 0 180deg, rgba(255, 255, 255, 0.045) 0 270deg, transparent 0); background-size: 96px 96px; -webkit-mask-image: radial-gradient(70% 55% at 50% 30%, #000 0%, transparent 75%); mask-image: radial-gradient(70% 55% at 50% 30%, #000 0%, transparent 75%); animation: fadein 1600ms ease both 200ms; }
  .hero-in { display: flex; flex-direction: column; align-items: flex-start; translate: 0 calc(var(--p, 0) * -60px); opacity: calc(1 - var(--p, 0) * 0.6); }
  .sky { translate: 0 calc(var(--p, 0) * 120px); }
  @keyframes shine { 0% { transform: translateX(-100%); } 40%, 100% { transform: translateX(100%); } }
  h1 { font-size: clamp(54px, 15vw, 128px); line-height: 0.92; margin: 22px 0 22px; letter-spacing: -0.035em; }
  h1 .w { display: inline-block; animation: word 900ms var(--ease) both; animation-delay: calc(180ms + var(--w) * 90ms); }
  h1 em { color: var(--sun); position: relative; }
  h1 em::after { content: ''; position: absolute; left: 0.05em; right: 0.12em; bottom: 0.04em; height: 0.07em; border-radius: 99px; background: var(--sun); opacity: 0.7; transform: scaleX(0); transform-origin: left; animation: under 900ms var(--ease) both 1050ms; }
  @keyframes word { from { opacity: 0; transform: translateY(0.4em) rotate(2deg); filter: blur(8px); } }
  @keyframes under { to { transform: scaleX(1); } }
  @keyframes up { from { opacity: 0; transform: translateY(18px); } }
  .sub { font-size: clamp(17px, 1.6vw, 21px); line-height: 1.5; color: var(--night-ink-2); max-width: 46ch; animation: up 800ms var(--ease) both 520ms; }
  .acts { display: flex; flex-direction: column; align-items: stretch; gap: 12px; margin-top: 30px; width: 100%; animation: up 800ms var(--ease) both 640ms; }
  .acts.center { animation: none; }
  .cta { position: relative; overflow: hidden; gap: 10px; }
  .cta::after { content: ''; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.45) 50%, transparent 70%); transform: translateX(-100%); animation: shine 3.8s ease-in-out infinite 2s; pointer-events: none; }
  .cta .arr { display: inline-grid; transition: transform 280ms var(--spring); }
  .cta:hover .arr { transform: translateX(4px); }
  .btn.big:hover { filter: brightness(1.05); }
  .more { box-shadow: 0 5px 0 #090b2d, inset 0 0 0 1px rgba(255, 255, 255, 0.08); }
  .trust { list-style: none; padding: 0; margin: 22px 0 0; display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 13.5px; font-weight: 600; color: var(--night-ink-2); animation: up 800ms var(--ease) both 760ms; }
  .trust li { display: flex; align-items: center; gap: 7px; }
  .trust :global(svg) { color: var(--sun); }

  .stage-wrap { margin-top: 56px; animation: rise-frame 1100ms var(--ease) both 820ms; }
  @keyframes rise-frame { from { opacity: 0; transform: translateY(60px); } }
  .frame-in { position: relative; perspective: 2000px; }
  .frame { position: relative; border-radius: 22px; background: linear-gradient(180deg, rgba(29, 34, 71, 0.95), rgba(19, 23, 52, 0.95)); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.09), 0 40px 120px -30px rgba(43, 75, 238, 0.55), 0 30px 60px -30px rgba(0, 0, 0, 0.8); overflow: hidden; }
  .frame::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1px; background: linear-gradient(140deg, rgba(244, 183, 64, 0.6), transparent 30%, transparent 70%, rgba(43, 75, 238, 0.7)); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
  .chrome { display: flex; align-items: center; gap: 7px; height: 40px; padding: 0 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
  .chrome i { width: 11px; height: 11px; border-radius: 50%; background: var(--night-3); }
  .chrome span { margin: 0 auto; padding-right: 50px; font-size: 12.5px; font-weight: 600; color: var(--night-ink-2); }
  .screen-in { padding: 18px; }
  .caption { margin-top: 18px; font-size: 13px; color: var(--night-ink-2); text-align: center; }
  .float { display: none; }

  /* ------------------------------------------------ marquee */
  .marquee { padding: 40px 0 36px; background: var(--card); border-bottom: 1px solid var(--line); }
  .mq-label { text-align: center; font-size: 13.5px; font-weight: 650; color: var(--ink-3); padding: 0 20px; }
  .mq { margin-top: 22px; display: flex; flex-direction: column; gap: 12px; -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); }
  .track { display: flex; width: max-content; animation: marquee 60s linear infinite; }
  .track.rev { animation-direction: reverse; animation-duration: 70s; }
  .mq:hover .track { animation-play-state: paused; }
  .track ul { list-style: none; display: flex; gap: 12px; padding: 0 12px 0 0; margin: 0; }
  .track li { display: flex; align-items: center; gap: 10px; height: 50px; padding: 0 16px 0 8px; border-radius: 14px; background: var(--ground); white-space: nowrap; }
  .track li .t-name { font-size: 17px; }
  .mini-s { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 9px; background: var(--birch); box-shadow: 0 2px 0 var(--birch-3); }
  .eco-s { font-size: 11px; font-weight: 700; color: var(--ink-3); }
  .var { font-size: 13.5px; font-weight: 600; color: var(--ink-2); }
  @keyframes marquee { to { transform: translateX(-50%); } }

  /* ------------------------------------------------ numbers */
  .facts { padding: 56px 0; }
  .facts dl { display: grid; grid-template-columns: 1fr 1fr; gap: 28px 16px; margin: 0 auto; }
  .facts dl > div { position: relative; padding-left: 16px; }
  .facts dl > div::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 3px; background: linear-gradient(var(--sun), var(--cobalt)); }
  .facts dd { margin: 0; font-size: clamp(36px, 5vw, 64px); line-height: 1; font-weight: 750; letter-spacing: -0.045em; }
  .facts dt { font-size: 14px; color: var(--ink-2); margin-top: 8px; font-weight: 550; line-height: 1.35; }

  /* ------------------------------------------------ how it works */
  .how { padding-top: 64px; }
  .steps { list-style: none; padding: 0; margin: 44px 0 0; display: grid; gap: 34px; position: relative; }
  .step { position: relative; padding-left: 58px; }
  .step::before { content: ''; position: absolute; left: 19px; top: 46px; bottom: -34px; width: 2px; background: linear-gradient(var(--line), var(--line)); }
  .step:last-child::before { display: none; }
  .num { position: absolute; left: 0; top: 0; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--ink); color: var(--on-ink); font-weight: 800; font-size: 16px; box-shadow: 0 0 0 6px var(--ground); }
  .step h3 { margin-top: 18px; }
  .step > p { margin-top: 6px; font-size: 15.5px; line-height: 1.5; color: var(--ink-2); }
  .ill { height: 196px; border-radius: 22px; background: var(--card); box-shadow: var(--shadow); overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 18px; position: relative; }
  .pick { gap: 12px; }
  .pt { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 14px; }
  .pt :global(svg) { border-radius: 13px; background: var(--birch); box-shadow: 0 4px 0 var(--birch-3); }
  .tick { position: absolute; top: -7px; right: -7px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--good); color: #fff; box-shadow: 0 0 0 3px var(--card); }
  .learn { gap: 14px; justify-content: flex-start; }
  .learn .mini { flex: none; width: 148px; }
  .say { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; line-height: 1.35; color: var(--ink-2); min-width: 0; }
  .say b { display: flex; align-items: center; gap: 7px; font-size: 16px; color: var(--ink); }
  .say span { font-family: var(--serif); font-style: italic; font-size: 15px; }
  .queue { flex-direction: column; align-items: stretch; gap: 6px; background: var(--ground); box-shadow: inset 0 0 0 1px var(--line); }
  .qi { display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 10px 0 4px; border-radius: 10px; background: var(--card); font-size: 14px; font-weight: 650; box-shadow: var(--shadow); width: calc(100% - var(--i) * 7%); }
  .qi i, .say i, .mrow .slip, .g { flex: none; display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 4px; border-radius: 7px; font-style: normal; font-weight: 800; font-size: 12px; letter-spacing: -0.05em; color: #fff; }
  i.good, .g.good { background: var(--good); border-radius: 50%; } i.bad, .g.bad, .mrow .slip { background: var(--bad); } i.info { background: var(--cobalt); font-family: var(--serif); font-style: italic !important; }
  /* the illustrations play when their step is revealed */
  .step :global(.pt) { opacity: 0; transform: translateY(16px) rotate(-4deg); transition: opacity 500ms var(--ease), transform 640ms var(--spring); transition-delay: calc(300ms + var(--i) * 110ms); }
  .step:global(.in) :global(.pt) { opacity: 1; transform: none; }
  .step .tick { transform: scale(0); transition: transform 420ms var(--spring) 900ms; }
  .step:global(.in) .tick { transform: scale(1); }
  .step .qi { opacity: 0; transform: translateX(-22px); transition: opacity 400ms var(--ease), transform 520ms var(--ease); transition-delay: calc(320ms + var(--i) * 90ms); }
  .step:global(.in) .qi { opacity: 1; transform: none; }
  .step .learn .say { opacity: 0; transform: translateX(14px); transition: opacity 500ms var(--ease) 500ms, transform 600ms var(--ease) 500ms; }
  .step:global(.in) .learn .say { opacity: 1; transform: none; }
  .step .num { transform: scale(0.4); opacity: 0; transition: transform 520ms var(--spring) 120ms, opacity 300ms 120ms; }
  .step:global(.in) .num { transform: none; opacity: 1; }

  /* ------------------------------------------------ science */
  .science { background: var(--card); }
  .two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 40px; align-items: center; }
  .points { list-style: none; padding: 0; margin: 26px 0 0; display: flex; flex-direction: column; gap: 12px; font-weight: 600; font-size: 15.5px; }
  .points li { display: flex; align-items: center; gap: 12px; }
  .chart { padding: 22px 18px 16px; background: var(--ground); box-shadow: inset 0 0 0 1px var(--line); }

  /* ------------------------------------------------ features */
  .features .head { margin-bottom: 36px; }
  .fc { position: relative; overflow: hidden; display: flex; flex-direction: column; border-radius: 26px; background: var(--card); box-shadow: var(--shadow); padding: 24px; isolation: isolate; }
  .fc::after { content: ''; position: absolute; inset: 0; z-index: -1; background: radial-gradient(420px circle at var(--mx, -999px) var(--my, -999px), color-mix(in srgb, var(--cobalt) 9%, transparent), transparent 60%); opacity: 0; transition: opacity 300ms; pointer-events: none; }
  .fc:hover::after { opacity: 1; }
  .fc-copy { flex: none; }
  .fc-copy h3 { font-size: 21px; }
  .fc-copy p { margin-top: 8px; font-size: 15px; line-height: 1.5; color: var(--ink-2); max-width: 48ch; }
  .fc-copy b { color: var(--ink); }
  .fc-ill { margin-top: 22px; flex: 1; display: flex; flex-direction: column; justify-content: flex-end; }
  .fc.dark { background: radial-gradient(120% 90% at 0% 0%, #232a52 0%, #090b2d 70%); color: var(--night-ink); box-shadow: inset 0 0 0 1px var(--night-3); }
  .fc.dark .fc-copy p { color: var(--night-ink-2); }
  .fc.dark::after { background: radial-gradient(420px circle at var(--mx, -999px) var(--my, -999px), rgba(127, 155, 255, 0.14), transparent 60%); }
  .key { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 0; margin: 14px 0 0; font-size: 13.5px; font-weight: 600; color: var(--night-ink-2); }
  .key li { display: flex; align-items: center; gap: 6px; }
  .canvas { justify-content: center; }

  .mis { gap: 10px; align-items: stretch; }
  .gm { padding: 12px 14px; border-radius: 16px; background: var(--ground); }
  .gh { font-size: 12px; font-weight: 700; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  .mrow { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; }
  .mrow span { margin-left: auto; font-weight: 650; font-size: 13.5px; color: var(--bad-text); }
  .flow { align-self: center; display: flex; flex-direction: column; gap: 4px; padding: 2px 0; }
  .flow i { width: 6px; height: 6px; border-radius: 50%; background: var(--cobalt); opacity: 0.2; animation: beam 1.6s ease-in-out infinite; }
  .flow i:nth-child(2) { animation-delay: 180ms; } .flow i:nth-child(3) { animation-delay: 360ms; }
  .mc { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 18px; background: var(--night); color: var(--night-ink); }
  .mc .mini { flex: none; width: 92px; }
  .mc .tag { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--night-ink-2); }
  .mc .ans { margin-top: 4px; font-size: 19px; font-weight: 650; }
  .mc .ans b { color: #8be0b6; }

  .xp { flex-direction: row; align-items: center; gap: 14px; justify-content: flex-start; }
  .birch { flex: none; animation: bob 3.4s ease-in-out infinite; }
  .xpc { flex: 1; min-width: 0; padding: 12px 14px; border-radius: 16px; background: var(--ground); }
  .xph { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 8px; font-size: 13px; }
  .xph span { color: var(--ink-3); font-weight: 700; }
  .xpb { display: block; height: 10px; margin: 8px 0 10px; border-radius: 5px; background: var(--line); overflow: hidden; }
  .xpb i { display: block; height: 100%; border-radius: 5px; background: linear-gradient(90deg, var(--sun), #f87e1a); transform: scaleX(0.08); transform-origin: left; transition: transform 1600ms var(--ease) 300ms; }
  .xp.on .xpb i { transform: scaleX(1); }
  .xpf { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--ink-3); transition: color 300ms 1800ms; }
  .flame { display: inline-grid; color: var(--st-new); transition: color 300ms 1800ms, transform 500ms var(--spring) 1800ms; }
  .xp.on .xpf { color: var(--ink); }
  .xp.on .flame { color: #f87e1a; transform: scale(1.25); animation: flicker 1.6s ease-in-out infinite 2.3s; }
  @keyframes flicker { 0%, 100% { transform: scale(1.25) rotate(-3deg); } 50% { transform: scale(1.12) rotate(4deg); } }

  .kb { align-items: center; justify-content: center; gap: 16px; }
  .kr { display: flex; gap: 8px; }
  kbd { display: grid; place-items: center; min-width: 46px; height: 46px; padding: 0 10px; border-radius: 12px; background: var(--card); box-shadow: inset 0 0 0 1px var(--line), 0 4px 0 var(--quiet-edge); font: inherit; font-weight: 750; font-size: 18px; transition: transform 90ms var(--ease), box-shadow 90ms var(--ease), background 200ms; }
  kbd.down { transform: translateY(3px); box-shadow: inset 0 0 0 1px var(--line), 0 1px 0 var(--quiet-edge); background: var(--cobalt-tint); }
  kbd.ent { min-width: 58px; }
  .typed { display: flex; align-items: center; gap: 6px; height: 40px; min-width: 150px; padding: 0 14px; border-radius: 12px; background: var(--ground); font-weight: 750; font-size: 18px; transition: background 300ms; }
  .typed.ok { background: var(--good-tint); color: var(--good-text); }
  .caret { width: 2px; height: 20px; background: var(--cobalt); animation: blink 1s steps(1) infinite; }
  .typed.ok .caret { display: none; }
  .typed .g { animation: pop 380ms var(--spring) both; }
  @keyframes blink { 50% { opacity: 0; } }

  /* offline, on every device: the devices sit in the middle of whatever room the card has */
  .sync { justify-content: center; align-items: center; gap: 22px; }
  .devs { display: flex; align-items: flex-end; justify-content: center; gap: 8px; width: 100%; max-width: 300px; }
  .ph1 { position: relative; flex: none; width: 27%; aspect-ratio: 9 / 17; border-radius: 15px; border: 4px solid var(--ink); background: var(--ground); padding: 14px 7px; display: flex; flex-direction: column; gap: 7px; }
  .lap { flex: 1; min-width: 0; }
  .ls { aspect-ratio: 16 / 10.5; border-radius: 10px 10px 0 0; border: 5px solid var(--ink); border-bottom-width: 6px; background: var(--ground); padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .base { display: block; height: 8px; margin: 0 -8px; border-radius: 0 0 9px 9px; background: var(--ink); }
  .pb { display: block; flex: none; height: 18px; border-radius: 5px; background: var(--birch); box-shadow: 0 2px 0 var(--birch-3); }
  .pb.s { height: 9px; background: var(--card); box-shadow: none; }
  /* the review made offline lands on the laptop once it syncs */
  .pb.new { transform-origin: left; transform: scaleX(0); opacity: 0; transition: transform 520ms var(--spring), opacity 200ms; }
  .s2 .pb.new { transform: none; opacity: 1; }
  .dot { position: absolute; top: -7px; right: -7px; width: 16px; height: 16px; border-radius: 50%; background: var(--sun); box-shadow: 0 0 0 3px var(--card); transition: background 300ms, transform 400ms var(--spring); }
  .s2 .dot { background: var(--good); transform: scale(1.1); }
  .beam { flex: none; display: flex; gap: 4px; align-self: center; margin-bottom: 18px; }
  .beam i { width: 6px; height: 6px; border-radius: 50%; background: var(--cobalt); opacity: 0.18; }
  .s1 .beam i { animation: beam 900ms ease-in-out infinite; }
  .beam i:nth-child(2) { animation-delay: 150ms; } .beam i:nth-child(3) { animation-delay: 300ms; }
  .state { display: flex; justify-content: center; min-height: 34px; }
  .st { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px 0 10px; border-radius: 99px; background: var(--ground); font-size: 13px; font-weight: 650; white-space: nowrap; animation: swapin 360ms var(--ease) both; }
  @keyframes swapin { from { opacity: 0; transform: translateY(6px); } }
  .sd { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; }
  .sd.off { background: var(--sun); }
  .sd.on { background: var(--cobalt); animation: pulse 900ms ease-in-out infinite; }
  .sd.ok { background: var(--good); color: #fff; }
  @keyframes pulse { 50% { transform: scale(0.7); opacity: 0.6; } }
  .beam i:nth-child(2) { animation-delay: 180ms; } .beam i:nth-child(3) { animation-delay: 360ms; }
  @keyframes beam { 0%, 100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.3); } }

  /* the phone: a carousel */

  /* the phone: the features one under another */
  .flow-f { display: flex; flex-direction: column; gap: 14px; }
  .flow-f .fc { padding: 22px 20px; }
  .flow-f .devs { max-width: 240px; }

  /* ------------------------------------------------ traps */
  .traps { background: var(--night); color: var(--night-ink); overflow: hidden; }
  .traps .kick { color: var(--sun); }
  .traps h2 em { color: var(--sun); }
  .traps .lead { color: var(--night-ink-2); }
  .traps .lead b { color: var(--night-ink); }
  .trap-box { margin-top: 40px; padding: 20px; border-radius: 28px; background: rgba(255, 255, 255, 0.03); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08); }

  /* ------------------------------------------------ open */
  .pillars { display: grid; gap: 14px; margin-top: 44px; }
  .pl { position: relative; overflow: hidden; isolation: isolate; padding: 24px; border-radius: 24px; background: var(--card); box-shadow: var(--shadow); }
  .pl::after { content: ''; position: absolute; inset: 0; z-index: -1; background: radial-gradient(300px circle at var(--mx, -999px) var(--my, -999px), color-mix(in srgb, var(--sun) 16%, transparent), transparent 60%); opacity: 0; transition: opacity 300ms; }
  .pl:hover { translate: 0 -4px; }
  .pl:hover::after { opacity: 1; }
  .pi { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 14px; background: var(--birch); color: var(--ink-fixed); box-shadow: 0 3px 0 var(--birch-3); margin-bottom: 18px; transition: transform 400ms var(--spring); }
  .pl:hover .pi { transform: rotate(-8deg) scale(1.08); }
  .pl p { margin-top: 6px; color: var(--ink-2); font-size: 15px; line-height: 1.5; }
  .free { list-style: none; padding: 0; margin: 28px auto 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 900px; }
  .free li { display: flex; align-items: center; gap: 10px; height: 46px; padding: 0 16px 0 11px; border-radius: 99px; background: var(--card); box-shadow: var(--shadow); font-weight: 600; font-size: 14.5px; opacity: 0; transform: translateY(10px) scale(0.96); transition: opacity 400ms var(--ease), transform 500ms var(--spring); transition-delay: calc(200ms + var(--i) * 70ms); }
  .free:global(.in) li { opacity: 1; transform: none; }

  /* ------------------------------------------------ faq */
  .faq { background: var(--card); }
  .top-al { align-items: start; }
  .qs { border-top: 1px solid var(--line); }
  .q { border-bottom: 1px solid var(--line); }
  .q button { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 68px; padding: 14px 0; text-align: left; font-weight: 650; font-size: 17px; transition: color 200ms; }
  .q button:hover { color: var(--accent-text); }
  .pm { position: relative; flex: none; width: 32px; height: 32px; border-radius: 50%; background: var(--ground); transition: background 300ms, transform 400ms var(--spring); }
  .pm::before, .pm::after { content: ''; position: absolute; left: 50%; top: 50%; width: 12px; height: 2px; margin: -1px 0 0 -6px; border-radius: 2px; background: currentColor; transition: transform 400ms var(--spring); }
  .pm::after { transform: rotate(90deg); }
  .q.open .pm { background: var(--cobalt); color: #fff; transform: rotate(180deg); }
  .q.open .pm::after { transform: rotate(0); }
  .a { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 420ms var(--ease); }
  .a > div { overflow: hidden; }
  .a p { padding: 0 48px 22px 0; font-size: 15.5px; line-height: 1.6; color: var(--ink-2); opacity: 0; transform: translateY(-6px); transition: opacity 300ms, transform 400ms var(--ease); }
  .q.open .a { grid-template-rows: 1fr; }
  .q.open .a p { opacity: 1; transform: none; transition-delay: 120ms; }

  /* ------------------------------------------------ the way in */
  .enter { padding: 120px 0 0; background: var(--night); color: var(--night-ink); overflow: hidden; isolation: isolate; text-align: center; }
  .enter .b1 { left: 10%; top: -200px; }
  .enter .b2 { right: 0; top: 40px; }
  .enter-in { display: flex; flex-direction: column; align-items: center; position: relative; }
  .enter h2 { font-size: clamp(42px, 7vw, 92px); max-width: 14ch; margin-top: 18px; }
  .enter .lead { color: var(--night-ink-2); margin-left: auto; margin-right: auto; }
  .enter .acts { width: 100%; max-width: 420px; }
  .birch-e { display: inline-block; animation: bob 3.4s ease-in-out infinite; }
  @keyframes bob { 50% { transform: translateY(-8px); } }
  .fine { margin-top: 16px; font-size: 13.5px; color: var(--night-ink-2); }
  .orbit { position: absolute; inset: 0; pointer-events: none; }
  .os { position: absolute; display: grid; place-items: center; padding: 6px; border-radius: 16px; background: var(--birch); box-shadow: 0 4px 0 var(--birch-3), 0 20px 40px -14px rgba(0, 0, 0, 0.6); opacity: 0.9; animation: float 7s ease-in-out infinite; animation-delay: calc(var(--i) * -1.1s); }
  .os:nth-child(1) { left: 6%; top: 90px; rotate: -10deg; }
  .os:nth-child(2) { right: 7%; top: 70px; rotate: 8deg; }
  .os:nth-child(3) { left: 13%; top: 330px; rotate: 6deg; }
  .os:nth-child(4) { right: 12%; top: 320px; rotate: -7deg; }
  .os:nth-child(5) { left: 30%; top: 30px; rotate: 4deg; opacity: 0.45; scale: 0.7; }
  .os:nth-child(6) { right: 4%; top: 560px; rotate: -4deg; opacity: 0.45; scale: 0.7; }
  .os:nth-child(n + 3) { display: none; }
  @keyframes float { 50% { transform: translateY(-14px); } }

  .foot { display: grid; grid-template-columns: 1fr 1fr; gap: 44px 24px; margin-top: 110px; padding-top: 56px; padding-bottom: calc(env(safe-area-inset-bottom) + 112px); text-align: left; position: relative; }
  .fbrand { grid-column: 1 / -1; }
  .foot .mark { padding: 0; height: auto; display: inline-flex; }
  .fbrand p { margin-top: 14px; font-size: 15px; line-height: 1.55; color: var(--night-ink-2); max-width: 30ch; }
  .fcol { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; font-size: 15px; }
  .fcol b { font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--night-ink-2); margin-bottom: 10px; }
  .fcol button { min-height: 40px; display: inline-flex; align-items: center; text-decoration: none; color: var(--night-ink); opacity: 0.85; transition: opacity 200ms, transform 200ms var(--ease); }
  .fcol button:hover { opacity: 1; transform: translateX(3px); }
  .legal { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding-top: 28px; border-top: 1px solid var(--night-3); font-size: 13px; line-height: 1.5; color: var(--night-ink-2); }
  .legal a { color: var(--night-ink); }
  .foot::before { content: ''; position: absolute; top: 0; left: 20px; right: 20px; height: 1px; background: var(--night-3); }

  /* the phone's bottom bar */
  .dock { position: fixed; z-index: 12; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 10px; padding: 12px 16px calc(env(safe-area-inset-bottom) + 12px); background: color-mix(in srgb, var(--night) 88%, transparent); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.08); transform: translateY(110%); transition: transform 460ms var(--ease); }
  .dock.show { transform: none; }
  .dock .btn { min-height: 50px; }
  .dock-l { flex: none; height: 50px; padding: 0 14px; font-weight: 700; color: var(--night-ink); }

  /* ------------------------------------------------ reveals: transform and opacity only */
  .landing :global(.rv) { opacity: 0; transform: translateY(28px); transition: opacity 800ms var(--ease) var(--rd, 0ms), transform 900ms var(--ease) var(--rd, 0ms), translate 400ms var(--ease), box-shadow 400ms var(--ease); }
  .landing :global(.rv[data-r='scale']) { transform: translateY(20px) scale(0.95); }
  .landing :global(.rv.in) { opacity: 1; transform: none; }

  /* ------------------------------------------------ wider */
  @media (min-width: 620px) {
    .facts dl { grid-template-columns: repeat(4, 1fr); }
    .acts { flex-direction: row; width: auto; }
    .enter .acts { max-width: none; justify-content: center; }
    .pillars { grid-template-columns: repeat(3, 1fr); }
    .foot { grid-template-columns: minmax(0, 2fr) minmax(160px, 1fr) minmax(160px, 1fr); column-gap: 48px; }
    .fbrand { grid-column: auto; }
    .legal { flex-direction: row; justify-content: space-between; gap: 24px; }
  }

  /* ------------------------------------------------ desktop: a design of its own */
  @media (min-width: 900px) {
    .wrap { padding: 0 40px; }
    section { padding: 128px 0; }
    .bar-in { max-width: 1280px; margin: env(safe-area-inset-top) auto 0; padding: 0 24px; height: 72px; }
    .bar-in::before { left: -100vw; right: -100vw; }
    .top nav { display: flex; }
    .acts-top { margin-left: 0; }
    .ghost { display: inline-flex; align-items: center; }
    .burger { display: none; }
    .menu { display: none; }
    .dock { display: none; }

    .hero { padding-top: calc(env(safe-area-inset-top) + 150px); padding-bottom: 96px; }
    .hero-in { align-items: center; text-align: center; }
    h1 { font-size: clamp(72px, 8.4vw, 136px); max-width: 11ch; }
    .sub { margin: 0 auto; }
    .acts { justify-content: center; }
    .trust { justify-content: center; }
    .stage-wrap { max-width: 1240px; margin-top: 72px; }
    .screen-in { padding: 28px 32px; }
    .float { display: flex; position: absolute; align-items: center; gap: 10px; height: 46px; padding: 0 16px 0 10px; border-radius: 14px; background: rgba(29, 34, 71, 0.82); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 20px 40px -16px rgba(0, 0, 0, 0.7); font-size: 14px; color: var(--night-ink-2); white-space: nowrap; animation: pop-in 700ms var(--spring) both, hover 6s ease-in-out infinite; }
    .float b { color: var(--night-ink); }
    .float :global(svg) { color: #f87e1a; }
    .f1 { left: -28px; top: 18%; animation-delay: 1.6s, 2.3s; }
    .f2 { left: -40px; top: 62%; animation-delay: 1.9s, 3.1s; }
    .f3 { right: -32px; top: 12%; animation-delay: 2.2s, 2.7s; }
    .f4 { right: -24px; bottom: 14%; animation-delay: 2.5s, 3.5s; }
    @keyframes pop-in { from { opacity: 0; transform: scale(0.6) translateY(20px); } }
    @keyframes hover { 0%, 100% { translate: 0 0; } 50% { translate: 0 -10px; } }

    .marquee { padding: 52px 0 48px; }

    .facts { padding: 80px 0 40px; }
    .how { padding-top: 88px; }
    .steps { grid-template-columns: repeat(3, 1fr); gap: 28px; margin-top: 64px; }
    .step { padding-left: 0; }
    .step::before { left: 52px; right: -28px; top: 19px; bottom: auto; width: auto; height: 2px; background: var(--line); transform-origin: left; transform: scaleX(0); transition: transform 1000ms var(--ease) 500ms; }
    .step:global(.in)::before { transform: scaleX(1); }
    .num { position: relative; display: grid; margin-bottom: 22px; }
    .ill { height: 220px; transition: transform 400ms var(--ease), box-shadow 400ms var(--ease); }
    .step:hover .ill { transform: translateY(-6px); box-shadow: 0 30px 50px -28px rgba(21, 25, 54, 0.35); }

    .two { grid-template-columns: 1fr 1fr; gap: 72px; }
    .science .two { grid-template-columns: 0.9fr 1.1fr; }
    .chart { padding: 30px 26px 22px; }

    .bento { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: minmax(260px, auto); gap: 18px; }
    .fc { padding: 30px; }
    .fc:hover { translate: 0 -4px; box-shadow: 0 1px 0 rgba(21, 25, 54, 0.04), 0 36px 60px -32px rgba(21, 25, 54, 0.4); }
    .fc.b-level { grid-column: span 2; grid-row: span 2; }
    .fc.b-mis { grid-column: span 2; }
    /* the game card takes the row beside the level card; the tree spans two rows with keys and offline stacked beside it */
    .fc.b-game { grid-column: span 2; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: center; }
    .fc.b-game .fc-ill { margin-top: 0; }
    .fc.b-keys .fc-ill, .fc.b-off .fc-ill { justify-content: center; }
    .fc.b-tree { grid-column: span 3; grid-row: span 2; display: grid; grid-template-columns: minmax(220px, 0.7fr) 1.3fr; gap: 30px; align-items: center; }
    .fc.b-tree .fc-ill { margin-top: 0; }
    .fc.b-level .fc-copy h3, .fc.b-tree .fc-copy h3 { font-size: 26px; }
    .fc.b-mis { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: center; }
    .fc.b-mis .fc-ill { margin-top: 0; }

    .trap-box { padding: 40px; }
    .traps .head { display: grid; grid-template-columns: 1fr 1fr; column-gap: 72px; align-items: end; }
    .traps .head .kick { grid-column: 1 / -1; }
    .traps .head .lead { margin: 0; }

    .faq .head { position: sticky; top: 120px; }
    .foot::before { left: 40px; right: 40px; }
    .os:nth-child(n + 3) { display: grid; }
    .enter { padding-top: 160px; }
    .foot { margin-top: 160px; padding-top: 72px; padding-bottom: calc(env(safe-area-inset-bottom) + 56px); }
  }
  @media (min-width: 1200px) {
    .f1 { left: -64px; } .f2 { left: -80px; } .f3 { right: -70px; } .f4 { right: -56px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .landing :global(.rv) { opacity: 1; transform: none; }
    .track { animation: none; }
    .hero-in, .sky { translate: none !important; opacity: 1 !important; }
  }
</style>
