<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Chess, type Move } from 'chess.js';
  import type { DrawShape } from '@lichess-org/chessground/draw';
  import { app, go, run } from '../lib/state.svelte';
  import { fenOf, epdOf, epdAfter, dests as destsOf, san as sanOf, turnOf, child, type Side } from '../lib/chess';
  import { allCards, applyOutcome, data, drillContinue, markAgain, isCard, nameOf, learnItemsFor, movesAt, type Applied } from '../lib/model.svelte';
  import { whenText } from '../lib/srs/fsrs';
  import type { Item, AskResult } from '../lib/session';
  import { sfx, buzz } from '../lib/fx';
  import { addXp, xpFor, xpToday, levelOf, type Level } from '../lib/game';
  import { loadStats } from '../lib/stats';
  import { countup } from '../lib/countup';
  import { explain } from '../lib/explain';
  import { tipOnce, type Tip } from '../lib/voice';
  import Mascot from '../lib/Mascot.svelte';
  import Board, { type Badge } from '../lib/Board.svelte';
  import Icon from '../lib/Icon.svelte';

  let items = $state<Item[]>(run.items.slice());
  let idx = $state(0);
  const item = $derived(items[Math.min(idx, items.length - 1)]);

  let chess = new Chess();
  let fen = $state(chess.fen());
  let lastMove = $state<[string, string] | null>(null);
  let dests = $state<Map<string, string[]> | null>(null);
  let shapes = $state<DrawShape[]>([]);
  let badge = $state<Badge | null>(null);
  let check = $state(false);
  let rev = $state(0);
  let shake = $state(0);
  let hist = $state<string[]>([]);
  let histStart = $state(0);
  let step = $state(0);
  let phase = $state<'play' | 'answered' | 'replay' | 'complete' | 'summary'>('play');
  let fixing = $state(false);
  let msg = $state<{ tone: 'good' | 'bad' | 'warn' | 'info'; text: string } | null>(null);
  let applied = $state<Applied | null>(null);
  let undone = $state(false);
  let promo = $state<{ from: string; to: string } | null>(null);
  let showOthers = $state(false);

  let wrong = false, hinted = false, playable = false, t0 = 0;
  let results: Record<number, AskResult> = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const total = { asked: 0, clean: 0, started: Date.now(), cards: 0 };
  let missed = $state<{ side: Side; epd: string; uci: string; label: string; order: string }[]>([]);
  let roundMissed: Item[] = [];
  let strip: HTMLDivElement | undefined = $state();

  const branch = $derived(phase === 'play' ? item?.branches?.find((b) => step <= b.until) : undefined);
  const drill = $derived(run.mode === 'drill');
  /** Arcade: endless positions with their own rating; nothing reaches the cards */
  const arcade = $derived(run.mode === 'drill' && !!run.arcade);
  let arc = $state<ReturnType<NonNullable<typeof run.arcade>> | null>(null);
  const rating0 = app.arcadeRating;
  const tally = { solved: 0, missed: 0, streak: 0 };
  // the streak is what the arcade plays for: a flame that heats up, and a cheer at 3, 5 and every 5 after
  const streak = $derived(arc?.streak ?? 0);
  const tier = $derived(streak >= 10 ? 3 : streak >= 3 ? 2 : streak >= 1 ? 1 : 0);
  const goal = $derived(streak < 3 ? 3 : streak < 5 ? 5 : (Math.floor(streak / 5) + 1) * 5);
  const from = $derived(streak < 3 ? 0 : streak < 5 ? 3 : Math.floor(streak / 5) * 5);
  let cheer = $state<{ text: string; n: number } | null>(null);
  let cheers = 0, lost = 0;
  // the game layer: a combo of clean answers, XP for every position, and what the sitting unlocked
  let combo = $state(0);
  let gained = $state(0);
  let lastXp = $state(0);
  let auto = $state(false);
  // teaching: why the move is played, and Birch explaining each thing the first time it happens
  let why = $state('');
  let coach = $state('');
  function tip(k: Tip) { const t = tipOnce(k); if (t) coach = t; return !!t; }
  function reason(epd: string, u: string) { const n = data()?.tree[epd], row = n?.m.find((m) => m[0] === u); return explain(epd, u, n && row && n.g ? row[1] / n.g : undefined); }
  let levelUp = $state<Level | null>(null);
  let goalHit = $state(false);
  let streak0 = -1;
  let streakNow = $state(0);
  let streakGrew = $state(false);
  const PRAISE = ['Nice', 'Spot on', 'Clean', 'Exactly', 'Well played', 'Just right'];
  const CONFETTI = Array.from({ length: 34 }, (_, i) => ({ x: (i * 37 + 11) % 100, d: (i * 53) % 900, r: (i * 71) % 360, c: ['var(--birch)', 'var(--sun)', 'var(--birch-3)', '#7f9bff', '#34e08f', '#ff7a6b'][i % 6], w: 7 + (i % 3) * 3 }));

  function sync(mv?: { from: string; to: string }) {
    fen = chess.fen();
    check = chess.inCheck();
    if (mv) lastMove = [mv.from, mv.to];
    hist = chess.history();
    void tick().then(() => strip?.scrollTo({ left: 9999, behavior: 'smooth' }));
  }
  const toMove = (u: string) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  function peek(u: string): Move { const mv = chess.move(toMove(u)); chess.undo(); return mv; }

  function load(i: number) {
    clearTimeout(timer);
    idx = i;
    const it = items[i];
    chess = new Chess(fenOf(it.start));
    histStart = (chess.moveNumber() - 1) * 2 + (chess.turn() === 'b' ? 1 : 0);
    for (const u of it.setup) chess.move(toMove(u));
    step = 0; wrong = false; hinted = false; playable = false; results = {}; fixing = false; showOthers = false;
    phase = 'play'; msg = null; badge = null; shapes = []; lastMove = null; dests = null; applied = null; cheer = null; auto = false; lastXp = 0; why = ''; coach = '';
    sync();
    timer = setTimeout(advance, 450);
  }

  function advance() {
    const it = items[idx];
    if (step >= it.moves.length) return void finish();
    if (chess.turn() !== it.side) {
      dests = null;
      timer = setTimeout(() => {
        const mv = chess.move(toMove(it.moves[step]));
        mv.captured ? sfx.capture() : sfx.move();
        step++; badge = null; sync(mv); advance();
      }, Math.max(app.delay, step === 0 && it.kind === 'puzzle' ? 700 : 120));
      return;
    }
    dests = destsOf(chess);
    t0 = performance.now();
    wrong = false; hinted = false; playable = false;
    const a = it.asks[step];
    if (a?.intro) {
      const e = peek(it.moves[step]);
      shapes = [{ orig: e.from as never, dest: e.to as never, brush: 'good' }];
      msg = { tone: 'info', text: `New move. Play ${e.san}` };
      why = reason(epdOf(chess), it.moves[step]);
      tip('intro');
    } else { why = ''; if (it.kind === 'line' || it.kind === 'new') tip('quiz'); }
  }

  function onmove(from: string, to: string) {
    const p = chess.get(from as never);
    if (p?.type === 'p' && (to[1] === '8' || to[1] === '1')) { promo = { from, to }; return; }
    play(from + to);
  }
  function pickPromo(piece: string) { const p = promo!; promo = null; play(p.from + p.to + piece); }
  function cancelPromo() { promo = null; rev++; }

  /** "Playable, but your move is X": within 30 cp of best by the tree. */
  function isPlayable(epd: string, u: string): boolean {
    const D = data();
    const n = D?.tree[epd], c = D?.tree[child(epd, u)];
    if (!n || !c) return false;
    const w = turnOf(epd) === 'w';
    return (w ? c.e : -c.e) >= (w ? n.e : -n.e) - 30;
  }

  function play(u: string) {
    const it = items[idx];
    const a = it.asks[step] ?? {};
    const expected = it.moves[step];
    const epd = epdOf(chess);
    const ok = u === expected || a.accepted?.includes(u);
    const mv = chess.move(toMove(u));
    if (ok) {
      mv.captured ? sfx.capture() : sfx.move();
      // the answer is recorded even after a wrong try, so a miss is graded as one
      results[step] = { wrong, hinted, playable, ms: performance.now() - t0, uci: u, epd };
      if (!wrong && !hinted) { sfx.good(); total.clean++; }
      total.asked++;
      if (it.drill && u !== expected) {
        // Drill: one of your other moves; continue down that branch
        const mine = Object.keys(it.asks).filter((k) => +k < step).length + 1;
        const rest = drillContinue(it.side, epdOf(chess), !!it.drill.rare, mine);
        const moves = [...it.moves.slice(0, step), u, ...rest];
        const asks: Item['asks'] = {};
        for (let i = 0; i <= step; i++) if (it.asks[i]) asks[i] = it.asks[i];
        items[idx] = { ...it, moves, asks: fillDrillAsks(it.side, it.start, it.setup, moves, asks, step) };
      }
      badge = fixing ? null : { square: mv.to, glyph: mv.san.includes('#') ? '#' : '!', tone: 'good' };
      msg = fixing ? null : { tone: 'good', text: mv.san.includes('#') ? 'Checkmate' : wrong ? 'Now you have it' : 'Correct' };
      fixing = false; shapes = []; step++; dests = null;
      sync(mv); advance();
      return;
    }
    chess.undo(); rev++;
    if (a.other?.some(([m]) => m === u)) {
      const name = a.other.find(([m]) => m === u)![1];
      badge = { square: mv.to, glyph: '!?', tone: 'warn' };
      msg = { tone: 'warn', text: `That's your ${name} move. This line is the ${(it.branches?.find((b) => step <= b.until)?.label ?? 'other branch').replace(/ \(.*/, '')}.` };
      return; // not a mistake: the attempt never happened
    }
    if ((it.kind === 'line' || it.kind === 'new' || it.kind === 'drill') && !fixing && !a.intro && isPlayable(epd, u)) {
      playable = true;
      badge = { square: mv.to, glyph: '!?', tone: 'warn' };
      msg = { tone: 'warn', text: `Playable, but your move is ${sanOf(epd, expected)}` };
      return;
    }
    const isBait = it.bait?.uci === u;
    if (!wrong) {
      wrong = true;
      if (drill || run.mode === 'learn') {
        missed = [...missed, { side: it.side, epd, uci: expected, label: arcade ? it.label.replace(/ \([A-E]\d\d\)$/, '') : nameOf(epd)[1], order: it.order }];
        if (run.mode === 'learn' && !roundMissed.includes(it)) roundMissed.push(it);
      }
    }
    fixing = true; shake++;
    buzz(50); sfx.bad();
    badge = { square: mv.to, glyph: isBait ? '??' : '?', tone: 'bad' };
    const e = peek(expected);
    shapes = [{ orig: e.from as never, dest: e.to as never, brush: 'good' }];
    why = reason(epd, expected);
    tip('wrong');
    msg = { tone: 'bad', text: isBait ? `That's the trap. The safe move is ${e.san}` : `Not that. The move is ${e.san}` };
  }

  /** your later moves in a drill continuation accept any of your repertoire moves */
  function fillDrillAsks(side: Side, start: string, setup: string[], moves: string[], asks: Item['asks'], after: number): Item['asks'] {
    const c = new Chess(fenOf(start));
    for (const u of setup) c.move(toMove(u));
    let e = epdOf(c);
    moves.forEach((u, i) => {
      if (i > after && turnOf(e) === side) asks[i] = { accepted: Array.from(new Set([u, ...movesAt(side, e)])) };
      e = child(e, u);
    });
    return asks;
  }

  function hint() {
    if (!dests) return;
    hinted = true;
    const e = peek(items[idx].moves[step]);
    shapes = [{ orig: e.from as never, brush: 'hint' }];
    msg = { tone: 'info', text: drill ? 'This piece moves' : 'This piece moves. Hint used: Hard at best' };
  }

  async function finish() {
    dests = null; msg = null;
    total.cards++;
    const it = items[idx];
    if (!drill) {
      try { applied = await applyOutcome({ item: it, results }, run.mode === 'learn' ? 'learn' : 'today'); } catch (e) { console.error(e); applied = null; }
    }
    phase = 'answered';
    const rs0 = Object.values(results);
    const clean = rs0.length > 0 && rs0.every((r) => !r.wrong && !r.hinted);
    const intro = rs0.length > 0 && Object.keys(results).every((k) => it.asks[+k]?.intro);
    if (!arcade) {
      if (!intro) combo = clean ? combo + 1 : 0;
      if (clean && !intro && (combo === 3 || (combo >= 5 && combo % 5 === 0))) {
        cheer = { text: `${combo} in a row`, n: ++cheers };
        sfx.combo(combo); buzz([18, 50, 18]);
      }
      // a clean answer with nothing to read moves on by itself
      const told = !drill && tip('grade');
      if (app.autoNext && clean && !told && !it.note && !it.bait && !it.played) { auto = true; timer = setTimeout(next, cheer ? 1700 : 1250); }
    }
    if (arcade) {
      const rs = Object.values(results);
      const before = arc?.streak ?? 0, was = app.arcadeRating;
      arc = run.arcade!(it, rs.length > 0 && rs.every((r) => !r.wrong && !r.hinted));
      if (arc.clean) tally.solved++; else tally.missed++;
      tally.streak = Math.max(tally.streak, arc.streak);
      lost = arc.clean ? 0 : before;
      if (arc.clean) {
        const n = arc.streak, mile = n === 3 || (n >= 5 && n % 5 === 0);
        const step = Math.floor(arc.rating / 50) > Math.floor(was / 50);
        if (mile || step) {
          cheer = { text: mile ? `${n} in a row` : `Rating ${Math.floor(arc.rating / 50) * 50}`, n: ++cheers };
          if (mile && n >= 10) sfx.done();
          buzz([18, 50, 18, 50, 60]);
        } else buzz(n >= 3 ? [12, 40, 12] : 12);
        // a clean answer moves straight on; a miss waits so you can look at it
        timer = setTimeout(next, cheer ? 1700 : 1100);
      }
    }
    lastXp = xpFor(arcade ? 'arcade' : drill ? 'drill' : intro ? 'intro' : 'card', arcade ? !!arc?.clean : clean, arcade ? arc?.streak ?? 0 : combo);
    gained += lastXp;
    const g = addXp(lastXp);
    if (g.level) levelUp = g.level;
    if (g.goal) { goalHit = true; if (!cheer) { cheer = { text: 'Daily goal reached', n: ++cheers }; sfx.combo(8); } }
  }
  /** a touch on the answer holds it on screen */
  function hold() { if (auto) { clearTimeout(timer); auto = false; } }

  async function next() {
    undone = false;
    if (idx + 1 < items.length) return load(idx + 1);
    if (run.more) {
      const more = await run.more(roundMissed.splice(0));
      if (more.length) { items = [...items, ...more]; return load(idx + 1); }
    }
    complete();
  }
  async function undo() {
    if (!applied || undone) return;
    undone = true;
    clearTimeout(timer); auto = false;
    addXp(-lastXp); gained -= lastXp; combo = 0;
    await applied.undo();
    total.asked -= Object.keys(results).length;
    total.cards--;
    load(idx);
    msg = { tone: 'info', text: 'Grade undone. Take it again' };
  }

  function replay(seq: string[], firstBad: boolean) {
    const it = items[idx];
    clearTimeout(timer);
    phase = 'replay';
    chess = new Chess(fenOf(it.start));
    for (const u of it.setup) chess.move(toMove(u));
    // back to the position of the card's first asked move
    const firstAsk = Object.keys(it.asks).map(Number).sort((a, b) => a - b)[0] ?? 0;
    for (const u of it.moves.slice(0, firstAsk)) chess.move(toMove(u));
    badge = null; shapes = []; lastMove = null; sync();
    let i = 0;
    const stepOn = () => {
      if (i >= seq.length) { phase = 'answered'; return; }
      let mv: Move;
      try { mv = chess.move(toMove(seq[i])); } catch { phase = 'answered'; return; }
      mv.captured ? sfx.capture() : sfx.move();
      badge = i === 0 && firstBad ? { square: mv.to, glyph: '??', tone: 'bad' } : mv.san.includes('#') ? { square: mv.to, glyph: '#', tone: 'bad' } : badge;
      sync(mv); i++;
      timer = setTimeout(stepOn, 750);
    };
    timer = setTimeout(stepOn, 500);
  }

  let grew = $state(false);
  function complete() {
    clearTimeout(timer);
    phase = drill || (run.mode === 'learn' && missed.length) ? 'summary' : 'complete';
    levelUp ? sfx.level() : sfx.done(); buzz([30, 60, 30]);
    void loadStats(allCards().values(), app.rollover).then((s) => { streakNow = s.streak; streakGrew = streak0 >= 0 && s.streak > streak0; });
  }
  function stop() {
    clearTimeout(timer);
    if ((drill || run.mode === 'learn') && (total.asked > 0 || tally.solved + tally.missed > 0) && phase !== 'summary') { phase = 'summary'; return; }
    leave();
  }
  /** back to the screen the session was started from */
  function leave() { clearTimeout(timer); if (history.length > 1) history.back(); else go('/today'); }

  let marked = $state(-1);
  async function again() { marked = await markAgain(missed.map((m) => ({ side: m.side, epd: m.epd, uci: m.uci }))); }
  const unknown = $derived(missed.filter((m) => !isCard(m.side, m.epd, m.uci)));
  function learnThese() {
    // run the missed positions that are not cards yet through Learn
    const fresh = learnItemsFor(unknown);
    if (!fresh.length) { go(`/explore?side=${unknown[0].side}`); return; }
    run.items = fresh; run.mode = 'learn'; run.title = 'Missed in Drill'; run.more = undefined;
    items = fresh; missed = []; roundMissed = []; total.asked = 0; total.clean = 0; total.cards = 0;
    load(0);
  }

  onMount(() => {
    if (!items.length) { go('/today'); return; }
    void loadStats(allCards().values(), app.rollover).then((s) => (streak0 = s.streak));
    load(0);
    return () => { clearTimeout(timer); run.arcade = undefined; };
  });

  const mins = $derived(Math.max(1, Math.round((Date.now() - total.started) / 60000)));
  const gradeInfo = $derived.by(() => {
    if (arcade && arc) {
      const sub = arc.clean ? `Rating ${arc.rating}${arc.returns ? ' · once more later' : ''}` : `${lost >= 3 ? `Streak of ${lost} ended · ` : ''}Rating ${arc.rating} · comes back soon`;
      if (arc.back) return [arc.clean ? 'good' : 'bad', arc.clean ? 'Got it' : 'Again', sub] as const;
      return [arc.clean ? 'good' : 'bad', `${arc.delta > 0 ? '+' : '−'}${Math.abs(arc.delta)}`, sub] as const;
    }
    if (drill) return [Object.values(results).some((r) => r.wrong) ? 'bad' : 'good', 'Drill', 'No schedule changes in Drill'] as const;
    if (!applied) return ['info', 'Done', ''] as const;
    const when = applied.due ? `Next review ${whenText(applied.due)}` : 'Not a card yet';
    if (applied.rating === 0) return ['info', 'Learning', applied.due ? `First review ${whenText(applied.due)}` : ''] as const;
    if (applied.rating === 1) return ['bad', 'Again', when] as const;
    if (applied.rating === 2) return ['warn', 'Hard', when] as const;
    return ['good', 'Good', when] as const;
  });
  const title = $derived(arcade ? (arc?.clean ? PRAISE[idx % PRAISE.length] : 'Not this time') : gradeInfo[0] === 'good' ? PRAISE[idx % PRAISE.length] : gradeInfo[0] === 'warn' ? 'Got there' : gradeInfo[0] === 'bad' ? 'One to repeat' : run.mode === 'learn' || item?.kind === 'new' ? 'New move' : 'Done');
  const lvl = $derived(levelOf(app.xp));
  // the last line of the sitting can be played on against the engine
  const lastLine = $derived([...items].reverse().find((i) => (i.kind === 'line' || i.kind === 'new' || i.kind === 'drill') && i.start.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w')));
  function playOut() {
    if (!lastLine) return;
    clearTimeout(timer);
    // replaces this session in the history, so Done there goes back to where you started
    location.replace(`${location.pathname}${location.search}#/play?side=${lastLine.side}&p=${encodeURIComponent([...lastLine.setup, ...lastLine.moves].join(' '))}`);
  }
  const histSans = $derived(hist);
  const PIECES = import.meta.glob('../assets/pieces/mpchess/*.svg', { eager: true, import: 'default', query: '?url' }) as Record<string, string>;
  const playedSan = $derived(item?.played ? sanOf(epdAfter(item.setup, item.start.split(' ').slice(0, 4).join(' ')), item.played.uci) : '');
</script>

<div class="room">
  {#if phase === 'complete'}
    <div class="complete">
      <div class="confetti" aria-hidden="true">{#each CONFETTI as c}<i style="left:{c.x}%;width:{c.w}px;background:{c.c};animation-delay:{c.d}ms;--r:{c.r}deg"></i>{/each}</div>
      <div class="stackart" aria-hidden="true">
        {#each Array(Math.min(6, Math.max(3, total.cards))) as _, i}<i style="--i:{i}"></i>{/each}
        <span class="birch"><Mascot mood="cheer" size={92} /></span>
      </div>
      <h1 class="t-name">{levelUp ? `Level ${levelUp.level}` : run.mode === 'learn' ? 'All learned' : 'Session complete'}</h1>
      <p class="lead">{levelUp ? `You are now a level ${levelUp.level} ${levelUp.rank}. ` : ''}{total.cards} card{total.cards === 1 ? '' : 's'} laid down. Each clean answer adds a layer.</p>
      <dl>
        <div class="xpt"><dd class="t-num">+<span use:countup={gained}></span></dd><dt>XP</dt></div>
        <div><dd class="t-num">{total.asked ? Math.round((total.clean / total.asked) * 100) : 100}%</dd><dt>first try</dt></div>
        <div><dd class="t-num">{mins}</dd><dt>min</dt></div>
      </dl>
      <div class="lvl">
        <span class="lb"><b>Level {lvl.level}</b> {lvl.rank}</span>
        <span class="lbar"><i style="width:{(lvl.into / lvl.span) * 100}%"></i></span>
        <span class="ln t-num">{lvl.into}/{lvl.span}</span>
      </div>
      <p class="streakline">
        {#if streakGrew}<span class="won"><Icon name="flame" size={18} fill /> {streakNow} day streak</span>{/if}
        {#if goalHit}<span class="won goal"><Icon name="check" size={16} /> Daily goal reached</span>{:else if !streakGrew}{xpToday()} of {app.goal} XP today. {run.mode === 'learn' ? 'These moves are now in your reviews.' : 'Progress is saved after every card.'}{/if}
      </p>
      <div class="row" style="gap:10px">
        {#if lastLine}<button class="btn big night" onclick={playOut}><Icon name="sword" size={20} /> Play it out</button>{/if}
        <button class="btn big grow sun" onclick={leave}>Done</button>
      </div>
    </div>
  {:else if phase === 'summary'}
    <div class="complete summary">
      <h1 class="t-name">{arcade ? `Rating ${app.arcadeRating}` : drill ? 'Drill over' : 'Round over'}</h1>
      <p class="lead">+{gained} XP. {arcade ? `${app.arcadeRating >= rating0 ? 'Up' : 'Down'} ${Math.abs(app.arcadeRating - rating0)} this sitting. Best streak ever: ${app.arcadeBest}. Your cards were not touched; what you missed comes back next time.` : drill ? 'Drill only: no schedule was changed.' : 'Missed moves came back at the end of each round.'}</p>
      <dl>
        {#if arcade}
          <div><dd class="t-num">{tally.solved}</dd><dt>solved</dt></div>
          <div><dd class="t-num">{tally.missed}</dd><dt>missed</dt></div>
          <div><dd class="t-num">{tally.streak}</dd><dt>best streak</dt></div>
        {:else}
          <div><dd class="t-num">{total.asked}</dd><dt>moves played</dt></div>
          <div><dd class="t-num">{total.asked ? Math.round((total.clean / total.asked) * 100) : 100}%</dd><dt>accuracy</dt></div>
          <div><dd class="t-num">{missed.length}</dd><dt>missed</dt></div>
        {/if}
      </dl>
      {#if missed.length}
        <ul class="missed">
          {#each missed.slice(arcade ? -4 : 0).slice(0, 8) as m}<li><span class="q">?</span><span class="grow"><b class="t-name">{m.label}</b><small>{m.order}</small></span><b>{sanOf(m.epd, m.uci)}</b></li>{/each}
        </ul>
        {#if drill && !arcade}
          <div class="row" style="gap:10px;margin-bottom:12px">
            <button class="btn night grow" onclick={again} disabled={marked >= 0}>{marked >= 0 ? `${marked} marked Again` : 'Mark missed as Again'}</button>
            {#if unknown.length}<button class="btn night grow" onclick={learnThese}>Learn these</button>{/if}
          </div>
        {/if}
      {/if}
      <button class="btn big wide sun" onclick={leave}>Done</button>
    </div>
  {:else if item}
    <header>
      <button class="x" onclick={stop} aria-label={drill || run.mode === 'learn' ? 'Stop' : 'Leave session'}><Icon name="close" /></button>
      {#if arcade}
        <div class="arcbar grow">
          <span class="rate" aria-label="Arcade rating {app.arcadeRating}"><b class="t-num">{app.arcadeRating}</b></span>
          <span class="flame t{tier}" aria-label="Streak {streak}">{#key streak}<span class="fl"><Icon name="flame" size={22} fill /></span>{/key}<b class="t-num">{streak}</b></span>
          <span class="to" role="progressbar" aria-label="Towards {goal} in a row" aria-valuemin={from} aria-valuemax={goal} aria-valuenow={streak}><i class="t{tier}" style="width:{((streak - from) / (goal - from)) * 100}%"></i></span>
          <span class="goal t-num">{goal}</span>
        </div>
        <button class="stopbtn" onclick={stop}>Stop</button>
      {:else if drill || run.mode === 'learn'}
        <p class="runtitle grow">{drill ? 'Drill' : 'Learn'} · {run.title}</p>
        <button class="stopbtn" onclick={stop}>Stop</button>
      {:else}
        <div class="prog" class:hot={combo >= 3} role="progressbar" aria-valuemin="0" aria-valuemax={items.length} aria-valuenow={idx}>
          <i style="width:{Math.max(4, ((idx + (phase === 'play' ? 0 : 1)) / items.length) * 100)}%"></i>
        </div>
        {#if combo >= 2}{#key combo}<span class="combo" aria-label="{combo} clean in a row"><Icon name="flame" size={18} fill /><b class="t-num">{combo}</b></span>{/key}{/if}
        {#key gained}<span class="xpc t-num" aria-label="{gained} XP this session">{gained} XP</span>{/key}
      {/if}
    </header>

    <div class="label">
      {#if phase !== 'play'}
        <p class="t-name nm">{item.label}</p>
        <p class="ord">
          {item.order}
          {#if item.others?.length}<button class="also" onclick={() => (showOthers = !showOthers)}>also in {item.others.length} other line{item.others.length === 1 ? '' : 's'}</button>{/if}
        </p>
      {:else if branch}
        <p class="branch"><Icon name="explore" size={16} /> This line: <b class="t-name">{branch.label}</b></p>
      {:else if app.showName}
        <p class="t-name nm">{item.label}</p>
      {:else}
        <p class="ord quiet">{item.side === 'w' ? 'You play White' : 'You play Black'}</p>
      {/if}
    </div>
    {#if showOthers && item.others}
      <div class="others" role="dialog" aria-label="Other move orders">
        {#each item.others as o}<p>{o}</p>{/each}
      </div>
    {/if}

    <div class="boardwrap">
      <Board {fen} side={item.side} {dests} {lastMove} {shapes} {badge} {check} {rev} {shake} dark {onmove} />
      {#if cheer}
        {#key cheer.n}<p class="cheer" role="status"><Icon name="flame" size={30} fill /><b>{cheer.text}</b></p>{/key}
      {/if}
      {#if promo}
        <div class="promo" role="dialog" aria-label="Promote to">
          {#each ['q', 'r', 'b', 'n'] as p}
            <button onclick={() => pickPromo(p)} aria-label={{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p]}>
              <img src={PIECES[`../assets/pieces/mpchess/${item.side}${p.toUpperCase()}.svg`]} alt="" />
            </button>
          {/each}
          <button class="cancel" onclick={cancelPromo} aria-label="Cancel"><Icon name="close" size={20} /></button>
        </div>
      {/if}
    </div>

    {#if coach}
      <button class="coach" onclick={() => (coach = '')} aria-label="Birch says: {coach} Tap to dismiss"><Mascot size={46} /><span>{coach}</span></button>
    {/if}
    {#if phase === 'play'}
      <div class="prompt" aria-live="polite">
        {#if msg}
          {#key msg.text}
            <p class="msg {msg.tone}">
              <span class="g">{msg.tone === 'good' ? '!' : msg.tone === 'bad' ? '?' : msg.tone === 'warn' ? '!?' : 'i'}</span>{msg.text}
            </p>
          {/key}
          {#if item.asks[step]?.intro && (item.note || why)}<p class="note inl">{item.note || why}</p>
          {:else if why && msg.tone === 'bad'}<p class="note inl">{why}</p>{/if}
        {:else}
          <p class="ask">{item.prompt}</p>
        {/if}
      </div>
      <div class="strip" bind:this={strip}>
        {#each histSans as m, i}
          {@const ply = histStart + i}
          <span class:last={i === histSans.length - 1}>{#if ply % 2 === 0}<em>{ply / 2 + 1}.</em>{:else if i === 0}<em>{(ply + 1) / 2}…</em>{/if}{m}</span>
        {/each}
        {#if !histSans.length}<span class="ghost">1.</span>{/if}
      </div>
      <footer>
        <button class="btn night" onclick={hint} disabled={!dests}><Icon name="hint" size={20} /> Hint</button>
        <p class="src">{item.source ?? ''}</p>
      </footer>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="answer {gradeInfo[0]}" onpointerdown={hold}>
        <div class="row">
          {#key idx}<span class="gm"><Mascot mood={gradeInfo[0] === 'good' ? 'cheer' : gradeInfo[0] === 'bad' ? 'sad' : gradeInfo[0] === 'warn' ? 'think' : 'idle'} size={54} /></span>{/key}
          <div class="grow">
            <p class="gt">{title}</p>
            <p class="when"><span class="grade {gradeInfo[0]}" class:pop={arcade}>{gradeInfo[1]}</span>{gradeInfo[2]}</p>
          </div>
          {#if lastXp}<span class="xp t-num">+{lastXp} XP</span>{/if}
        </div>
        {#if item.source}<p class="srcline">{item.source}</p>{/if}
        {#if item.note}<p class="note">{item.note}</p>{/if}
        {#if item.bait}
          <button class="link trap" onclick={() => replay([item.bait!.uci, ...item.bait!.refute], true)} disabled={phase === 'replay'}>
            <Icon name="warn" size={18} /> {phase === 'replay' ? 'Playing the trap…' : `See why ${item.bait.san} loses`}
          </button>
        {/if}
        {#if item.played}
          <p class="srcline">In the game you played <b>{playedSan}</b>.</p>
          <button class="link trap" onclick={() => replay([item.played!.uci, ...item.played!.refute], true)} disabled={phase === 'replay'}>
            <Icon name="warn" size={18} /> {phase === 'replay' ? 'Replaying…' : 'See how it was punished'}
          </button>
        {/if}
      </div>
      <footer>
        {#if !drill}<button class="btn night sq" onclick={undo} disabled={undone || !applied || phase === 'replay'} aria-label="Undo grade"><Icon name="undo" size={22} /></button>{/if}
        <button class="btn grow go {gradeInfo[0]}" class:auto onclick={next}><span>Continue</span> <Icon name="next" size={20} /></button>
      </footer>
    {/if}
  {/if}
</div>

<style>
  .room { position: absolute; inset: 0; background: var(--night); color: var(--night-ink); display: flex; flex-direction: column; padding: calc(env(safe-area-inset-top) + 6px) 0 calc(env(safe-area-inset-bottom) + 16px); }
  header { display: flex; align-items: center; gap: 10px; padding: 0 12px 0 4px; height: 48px; flex: none; }
  .x { width: 44px; height: 44px; display: grid; place-items: center; color: var(--night-ink-2); }
  .prog { flex: 1; height: 14px; border-radius: 7px; background: var(--night-3); overflow: hidden; }
  .prog i { display: block; height: 100%; border-radius: 7px; background: linear-gradient(var(--birch) 0 45%, var(--birch-2) 45% 100%); box-shadow: inset 0 -3px 0 var(--birch-3); transition: width 420ms var(--spring); }
  .prog.hot i { background: linear-gradient(#ffc24d 0 45%, #ff8a2a 45% 100%); box-shadow: inset 0 -3px 0 #d9601a, 0 0 12px rgba(255, 138, 42, 0.7); }
  .prog { transition: box-shadow 300ms; }
  .xpc { flex: none; height: 28px; padding: 0 9px; border-radius: 99px; display: inline-grid; place-items: center; background: var(--night-2); color: var(--sun); font-size: 13px; font-weight: 750; animation: pop 320ms var(--spring) both; }
  .combo { display: inline-flex; align-items: center; gap: 1px; color: #ff8a2a; font-size: 17px; animation: pop 340ms var(--spring) both; }
  .mode { font-size: 13px; font-weight: 650; color: var(--night-ink-2); min-width: 34px; text-align: right; }
  .runtitle { font-size: 14px; font-weight: 650; color: var(--night-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .arcbar { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .rate { height: 32px; padding: 0 11px; border-radius: 11px; background: var(--night-2); display: inline-grid; place-items: center; font-size: 16px; }
  .flame { display: inline-flex; align-items: center; gap: 1px; font-size: 18px; color: #6f76a0; transition: color 200ms; }
  .flame.t1 { color: var(--sun); }
  .flame.t2 { color: #ff8a2a; }
  .flame.t3 { color: #ff5a3d; filter: drop-shadow(0 0 7px rgba(255, 90, 61, 0.65)); }
  .fl { display: inline-flex; animation: pop 340ms var(--spring) both; }
  .to { flex: 1; min-width: 20px; height: 8px; border-radius: 4px; background: var(--night-3); overflow: hidden; }
  .to i { display: block; height: 100%; border-radius: 4px; background: #6f76a0; transition: width 320ms var(--ease), background 200ms; }
  .to i.t1 { background: var(--sun); }
  .to i.t2 { background: #ff8a2a; }
  .to i.t3 { background: #ff5a3d; }
  .goal { font-size: 13px; font-weight: 700; color: var(--night-ink-2); }
  .cheer { position: absolute; z-index: 6; left: 50%; top: 36%; display: flex; align-items: center; gap: 8px; padding: 12px 20px 12px 14px; border-radius: 22px; background: var(--sun); color: #3d2800; box-shadow: 0 6px 0 #c98a12, 0 18px 30px rgba(0, 0, 0, 0.45); white-space: nowrap; pointer-events: none; animation: cheer 1600ms var(--ease) both; }
  .cheer b { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
  @keyframes cheer { 0% { opacity: 0; transform: translate(-50%, 16px) scale(0.6); } 14% { opacity: 1; transform: translate(-50%, 0) scale(1.08); } 22% { transform: translate(-50%, 0) scale(1); } 80% { opacity: 1; transform: translate(-50%, 0) scale(1); } 100% { opacity: 0; transform: translate(-50%, -18px) scale(1); } }
  .grade.pop { animation: pop 300ms var(--spring) both; }
  .stopbtn { height: 40px; padding: 0 16px; border-radius: 12px; background: var(--night-3); font-weight: 700; font-size: 14px; }

  .label { height: 58px; flex: none; padding: 4px 16px 0; display: flex; flex-direction: column; justify-content: center; }
  /* a long name scrolls sideways under the finger; it fades out at the right edge while there is more */
  .nm { font-size: 21px; line-height: 1.1; padding: 3px 28px 3px 0; white-space: nowrap; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; touch-action: pan-x; overscroll-behavior-x: contain; -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent); animation: rise 260ms var(--ease) both; }
  .nm::-webkit-scrollbar { display: none; }
  .ord { font-size: 13px; color: var(--night-ink-2); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ord.quiet { font-size: 14px; font-weight: 600; }
  .also { color: #ffd98a; font-weight: 600; margin-left: 6px; font-size: 13px; text-decoration: underline; text-underline-offset: 2px; }
  .others { position: absolute; z-index: 30; left: 12px; right: 12px; top: 116px; background: var(--night-2); border-radius: 16px; padding: 10px 14px; font-size: 14px; box-shadow: 0 16px 30px rgba(0, 0, 0, 0.5); animation: rise 200ms var(--ease) both; }
  .others p { padding: 6px 0; }
  .others p + p { border-top: 1px solid var(--night-3); }
  .branch { display: inline-flex; align-self: flex-start; align-items: center; gap: 7px; height: 36px; padding: 0 14px 0 10px; border-radius: 12px; background: var(--birch); color: var(--ink-fixed); font-size: 14px; font-weight: 600; animation: rise 260ms var(--ease) both; max-width: 100%; }
  .branch b { font-size: 17px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .boardwrap { padding: 0 8px; flex: none; position: relative; }
  .promo { position: absolute; inset: 0 8px; z-index: 20; display: flex; align-items: center; justify-content: center; gap: 8px; background: rgba(13, 16, 36, 0.72); border-radius: 10px; animation: rise 160ms var(--ease) both; }
  .promo button { width: 68px; height: 68px; border-radius: 18px; background: var(--birch); display: grid; place-items: center; box-shadow: 0 6px 0 var(--birch-3); }
  .promo img { width: 54px; height: 54px; }
  .promo .cancel { width: 48px; height: 48px; background: var(--night-3); color: var(--night-ink); box-shadow: none; }

  .prompt { min-height: 62px; padding: 14px 16px 0; flex: none; }
  .ask { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
  .msg { display: flex; align-items: flex-start; gap: 10px; font-size: 17px; font-weight: 600; line-height: 1.25; animation: rise 200ms var(--ease) both; }
  .g { flex: none; min-width: 28px; height: 28px; padding: 0 5px; display: grid; place-items: center; border-radius: 9px; font-weight: 800; font-size: 15px; letter-spacing: -0.05em; margin-top: -3px; }
  .msg.good .g { background: var(--good); color: #fff; border-radius: 50%; }
  .msg.bad .g { background: var(--bad); color: #fff; }
  .msg.warn .g { background: var(--sun); color: #3d2800; }
  .msg.info .g { background: var(--night-3); color: var(--night-ink); font-family: var(--serif); font-style: italic; }
  .msg.good { color: #8fe3bd; }
  .msg.bad { color: #ffb4a6; }
  .msg.warn { color: #ffd98a; }

  .strip { display: flex; gap: 4px; overflow-x: auto; padding: 8px 16px; scrollbar-width: none; flex: none; min-height: 46px; align-items: center; }
  .strip::-webkit-scrollbar { display: none; }
  .strip span { white-space: nowrap; font-size: 15px; font-weight: 600; color: var(--night-ink-2); padding: 4px 7px; border-radius: 8px; }
  .strip em { font-style: normal; font-weight: 500; opacity: 0.6; margin-right: 3px; }
  .strip .last { background: var(--night-3); color: var(--night-ink); }
  .strip .ghost { opacity: 0.4; }

  footer { margin-top: auto; display: flex; align-items: center; gap: 12px; padding: 8px 16px 6px; }
  .src { font-size: 13px; color: var(--night-ink-2); text-align: right; flex: 1; }

  .answer { margin: 12px 8px 0; padding: 14px 14px 12px; border-radius: 22px; background: var(--night-2); animation: rise 280ms var(--ease) both; overflow-y: auto; border: 1.5px solid transparent; }
  .answer.good { background: #10392f; border-color: #1d6b53; }
  .answer.bad { background: #43191a; border-color: #7a2a22; }
  .answer.warn { background: #3d3013; border-color: #6e5518; }
  .gi { flex: none; width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: var(--night-3); color: var(--night-ink); animation: pop 380ms var(--spring) both; }
  .good .gi { background: #1fb47a; color: #fff; }
  .bad .gi { background: var(--bad); color: #fff; }
  .warn .gi { background: var(--sun); color: #3d2800; }
  .gm { flex: none; }
  .coach { position: absolute; z-index: 25; left: 12px; right: 12px; bottom: calc(env(safe-area-inset-bottom) + 96px); display: flex; align-items: center; gap: 12px; padding: 12px 16px 12px 12px; border-radius: 22px; background: var(--birch); color: var(--ink-fixed); text-align: left; font-size: 14.5px; font-weight: 550; line-height: 1.3; box-shadow: 0 5px 0 var(--birch-3), 0 18px 30px rgba(0, 0, 0, 0.45); animation: rise 320ms var(--spring) both; }
  .gt { font-size: 21px; font-weight: 750; letter-spacing: -0.02em; line-height: 1.1; }
  .good .gt { color: #8fe3bd; }
  .bad .gt { color: #ffb4a6; }
  .warn .gt { color: #ffd98a; }
  .xp { flex: none; align-self: flex-start; height: 28px; padding: 0 10px; border-radius: 99px; display: inline-grid; place-items: center; background: rgba(255, 255, 255, 0.1); font-size: 13.5px; font-weight: 750; color: var(--sun); animation: pop 420ms var(--spring) 120ms both; }
  .grade { height: 22px; padding: 0 8px; margin-right: 8px; border-radius: 7px; display: inline-grid; place-items: center; font-weight: 700; font-size: 12.5px; vertical-align: 1px; }
  .grade.good { background: var(--good); color: #fff; }
  .grade.bad { background: var(--bad); color: #fff; }
  .grade.warn { background: var(--sun); color: #3d2800; }
  .grade.info { background: var(--cobalt); color: #fff; }
  .when { font-size: 14px; color: var(--night-ink-2); margin-top: 4px; }
  footer .sq { width: 56px; padding: 0; flex: none; }
  .btn.go { --face: var(--sun); --edge: #c98a12; --txt: #3d2800; overflow: hidden; }
  .btn.go.good { --face: #1fb47a; --edge: #0c7a50; --txt: #fff; }
  .btn.go.bad { --face: #e5412b; --edge: #8f1f0e; --txt: #fff; }
  .btn.go :global(svg), .btn.go span { position: relative; }
  /* while it is about to move on by itself, the button fills */
  .btn.go.auto::before { content: ''; position: absolute; inset: 0; background: rgba(255, 255, 255, 0.22); transform-origin: left; animation: fill 1250ms linear both; }
  @keyframes fill { from { transform: scaleX(0); } }
  .srcline { font-size: 13.5px; color: var(--night-ink-2); margin-top: 10px; }
  .srcline b { color: var(--night-ink); }
  .note { font-family: var(--serif); font-style: italic; font-size: 18px; line-height: 1.3; margin-top: 8px; color: var(--night-ink); }
  .note.inl { font-size: 16px; color: var(--night-ink-2); margin-left: 38px; animation: rise 260ms var(--ease) 120ms both; }
  .trap { color: #ffd98a; gap: 8px; margin-top: 2px; }

  .complete { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 20px 8px; }
  .summary { justify-content: flex-start; padding-top: 40px; overflow-y: auto; }
  .stackart { flex: 1; display: flex; flex-direction: column-reverse; align-items: center; padding-bottom: 44px; gap: 6px; justify-content: center; }
  .stackart i { width: calc(300px - var(--i) * 14px); height: 34px; border-radius: 11px; background: var(--birch); animation: drop 520ms var(--spring) both; animation-delay: calc(var(--i) * 110ms + 150ms); }
  .stackart i:nth-child(even) { background: var(--birch-3); }
  .stackart i:last-of-type { background: var(--sun); }
  .birch { margin-bottom: -4px; animation: drop 620ms var(--spring) 700ms both; }
  @keyframes drop { from { opacity: 0; transform: translateY(-140px) rotate(-6deg); } to { opacity: 1; transform: none; } }
  .complete h1 { font-size: 52px; line-height: 0.95; letter-spacing: -0.02em; }
  .lead { color: var(--night-ink-2); margin-top: 10px; font-size: 16px; }
  .complete dl { display: flex; gap: 8px; margin: 24px 0 14px; }
  .complete dl div { flex: 1; background: var(--night-2); border-radius: 18px; padding: 14px; }
  .complete dd { margin: 0; font-size: 32px; line-height: 1; }
  .complete dt { font-size: 13px; color: var(--night-ink-2); margin-top: 4px; }
  .streakline { font-size: 15px; color: var(--night-ink-2); margin-bottom: 22px; display: flex; flex-wrap: wrap; gap: 8px; min-height: 34px; align-items: center; }
  .won { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px 0 10px; border-radius: 99px; background: #ff8a2a; color: #3d1a00; font-weight: 750; animation: pop 460ms var(--spring) 900ms both; }
  .won.goal { background: #1fb47a; color: #fff; animation-delay: 1100ms; }
  .xpt dd { color: var(--sun); }
  .lvl { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; font-size: 13.5px; color: var(--night-ink-2); }
  .lvl .lb b { color: var(--night-ink); }
  .lbar { flex: 1; height: 10px; border-radius: 5px; background: var(--night-3); overflow: hidden; }
  .lbar i { display: block; height: 100%; border-radius: 5px; background: var(--sun); animation: lgrow 900ms var(--ease) 500ms both; transform-origin: left; }
  @keyframes lgrow { from { transform: scaleX(0); } }
  .complete { position: relative; }
  .confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .confetti i { position: absolute; top: -20px; height: 14px; border-radius: 3px; opacity: 0; animation: fall 2600ms cubic-bezier(0.3, 0.6, 0.6, 1) both; }
  @keyframes fall { 0% { opacity: 1; transform: translateY(0) rotate(var(--r)); } 85% { opacity: 1; } 100% { opacity: 0; transform: translateY(78vh) rotate(calc(var(--r) + 540deg)); } }
  .missed { list-style: none; padding: 0; margin: 4px 0 16px; background: var(--night-2); border-radius: 18px; }
  .missed li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; min-height: 52px; }
  .missed li + li { border-top: 1px solid var(--night-3); }
  .missed b.t-name { display: block; font-size: 16px; font-weight: 500; }
  .missed small { font-size: 12px; color: var(--night-ink-2); }
  .missed .q { width: 26px; height: 26px; border-radius: 8px; background: var(--bad); color: #fff; display: grid; place-items: center; font-weight: 800; flex: none; }
</style>
