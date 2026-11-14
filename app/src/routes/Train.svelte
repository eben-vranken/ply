<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Chess, type Move } from 'chess.js';
  import type { DrawShape } from '@lichess-org/chessground/draw';
  import { app, go, run } from '../lib/state.svelte';
  import { fenOf, epdOf, epdAfter, dests as destsOf, san as sanOf, turnOf, child, type Side } from '../lib/chess';
  import { applyOutcome, data, drillContinue, markAgain, isCard, nameOf, learnItemsFor, movesAt, type Applied } from '../lib/model.svelte';
  import { whenText } from '../lib/srs/fsrs';
  import type { Item, AskResult } from '../lib/session';
  import { sfx, buzz } from '../lib/fx';
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
  /** Keep going: endless rounds from Today, stopped by hand */
  const extra = $derived(run.mode === 'today' && !!run.extra);

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
    phase = 'play'; msg = null; badge = null; shapes = []; lastMove = null; dests = null; applied = null;
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
    }
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
      if (!fixing) {
        results[step] = { wrong: wrong, hinted, playable, ms: performance.now() - t0, uci: u, epd };
        if (!wrong && !hinted) { sfx.good(); total.clean++; }
        total.asked++;
      }
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
        missed = [...missed, { side: it.side, epd, uci: expected, label: nameOf(epd)[1], order: it.order }];
        if (run.mode === 'learn' && !roundMissed.includes(it)) roundMissed.push(it);
      }
    }
    fixing = true; shake++;
    buzz(50); sfx.bad();
    badge = { square: mv.to, glyph: isBait ? '??' : '?', tone: 'bad' };
    const e = peek(expected);
    shapes = [{ orig: e.from as never, dest: e.to as never, brush: 'good' }];
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
      try { applied = await applyOutcome({ item: it, results }, run.mode === 'learn' ? 'learn' : extra ? 'extra' : 'today'); } catch (e) { console.error(e); applied = null; }
    }
    phase = 'answered';
  }

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
    sfx.done(); buzz([30, 60, 30]);
  }
  function stop() {
    clearTimeout(timer);
    if ((drill || run.mode === 'learn') && total.asked > 0 && phase !== 'summary') { phase = 'summary'; return; }
    if (extra && total.cards > 0 && phase !== 'complete') return complete();
    leave();
  }
  function leave() { clearTimeout(timer); go(run.mode === 'today' ? '/today' : run.title === 'Weakest cards' ? '/stats' : '/explore'); }

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
    load(0);
    return () => clearTimeout(timer);
  });

  const mins = $derived(Math.max(1, Math.round((Date.now() - total.started) / 60000)));
  const gradeInfo = $derived.by(() => {
    if (drill) return ['info', 'Drill', 'No schedule changes in Drill'] as const;
    if (!applied) return ['info', 'Done', ''] as const;
    if (item?.kind === 'drill' && applied.rating !== 1) return ['info', 'Practice line', 'Only a miss changes your schedule'] as const;
    const when = applied.due ? `Next review ${whenText(applied.due)}` : 'Not a card yet';
    if (applied.rating === 0) return ['info', 'Learning', applied.due ? `First review ${whenText(applied.due)}` : ''] as const;
    if (applied.rating === 1) return ['bad', 'Again', when] as const;
    if (applied.rating === 2) return ['warn', 'Hard', when] as const;
    return ['good', 'Good', when] as const;
  });
  const histSans = $derived(hist);
  const PIECES = import.meta.glob('../assets/pieces/mpchess/*.svg', { eager: true, import: 'default', query: '?url' }) as Record<string, string>;
  const playedSan = $derived(item?.played ? sanOf(epdAfter(item.setup, item.start.split(' ').slice(0, 4).join(' ')), item.played.uci) : '');
</script>

<div class="room">
  {#if phase === 'complete'}
    <div class="complete">
      <div class="stackart" aria-hidden="true">
        {#each Array(Math.min(8, Math.max(3, total.cards))) as _, i}<i style="--i:{i}"></i>{/each}
      </div>
      <h1 class="t-name">{run.mode === 'learn' ? 'All learned' : extra ? 'Good sitting' : 'Session complete'}</h1>
      <p class="lead">{total.cards} card{total.cards === 1 ? '' : 's'} laid down. Each clean answer adds a layer.</p>
      <dl>
        <div><dd class="t-num">{total.asked}</dd><dt>moves</dt></div>
        <div><dd class="t-num">{total.asked ? Math.round((total.clean / total.asked) * 100) : 100}%</dd><dt>first try</dt></div>
        <div><dd class="t-num">{mins}</dd><dt>min</dt></div>
      </dl>
      <p class="streakline" class:grew>{run.mode === 'learn' ? 'These moves are now in your reviews.' : 'Progress is saved after every card.'}</p>
      <button class="btn big wide sun" onclick={leave}>Done</button>
    </div>
  {:else if phase === 'summary'}
    <div class="complete summary">
      <h1 class="t-name">{drill ? 'Drill over' : 'Round over'}</h1>
      <p class="lead">{drill ? 'Drill only: no schedule was changed.' : 'Missed moves came back at the end of each round.'}</p>
      <dl>
        <div><dd class="t-num">{total.asked}</dd><dt>moves played</dt></div>
        <div><dd class="t-num">{total.asked ? Math.round((total.clean / total.asked) * 100) : 100}%</dd><dt>accuracy</dt></div>
        <div><dd class="t-num">{missed.length}</dd><dt>missed</dt></div>
      </dl>
      {#if missed.length}
        <ul class="missed">
          {#each missed.slice(0, 8) as m}<li><span class="q">?</span><span class="grow"><b class="t-name">{m.label}</b><small>{m.order}</small></span><b>{sanOf(m.epd, m.uci)}</b></li>{/each}
        </ul>
        {#if drill}
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
      {#if drill || run.mode === 'learn' || extra}
        <p class="runtitle grow">{extra ? `Keep going · ${idx} done` : `${drill ? 'Drill' : 'Learn'} · ${run.title}`}</p>
        <button class="stopbtn" onclick={stop}>Stop</button>
      {:else}
        <div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax={items.length} aria-valuenow={idx}>
          {#each items.slice(0, 40) as _, i}<i class:done={i < idx} class:now={i === idx}></i>{/each}
        </div>
        <span class="mode">{idx + 1}/{items.length}</span>
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

    {#if phase === 'play'}
      <div class="prompt" aria-live="polite">
        {#if msg}
          {#key msg.text}
            <p class="msg {msg.tone}">
              <span class="g">{msg.tone === 'good' ? '!' : msg.tone === 'bad' ? '?' : msg.tone === 'warn' ? '!?' : 'i'}</span>{msg.text}
            </p>
          {/key}
          {#if item.asks[step]?.intro && item.note}<p class="note inl">{item.note}</p>{/if}
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
      <div class="answer">
        <div class="row">
          <span class="grade {gradeInfo[0]}">{gradeInfo[1]}</span>
          <span class="when">{gradeInfo[2]}</span>
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
        {#if !drill}<button class="btn night" onclick={undo} disabled={undone || !applied || phase === 'replay'} aria-label="Undo grade"><Icon name="undo" size={20} /> Undo grade</button>{/if}
        <button class="btn sun grow" onclick={next}>Next <Icon name="next" size={20} /></button>
      </footer>
    {/if}
  {/if}
</div>

<style>
  .room { position: absolute; inset: 0; background: var(--night); color: var(--night-ink); display: flex; flex-direction: column; padding: calc(env(safe-area-inset-top) + 6px) 0 calc(env(safe-area-inset-bottom) + 16px); }
  header { display: flex; align-items: center; gap: 10px; padding: 0 12px 0 4px; height: 48px; flex: none; }
  .x { width: 44px; height: 44px; display: grid; place-items: center; color: var(--night-ink-2); }
  .prog { flex: 1; display: flex; gap: 5px; }
  .prog i { flex: 1; height: 8px; border-radius: 3px; background: var(--night-3); transition: background 300ms; }
  .prog i.done { background: var(--birch); }
  .prog i.now { background: linear-gradient(90deg, var(--birch) 50%, var(--night-3) 50%); }
  .mode { font-size: 13px; font-weight: 650; color: var(--night-ink-2); min-width: 34px; text-align: right; }
  .runtitle { font-size: 14px; font-weight: 650; color: var(--night-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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

  .answer { padding: 14px 16px 0; animation: rise 280ms var(--ease) both; overflow-y: auto; }
  .grade { height: 30px; padding: 0 12px; border-radius: 10px; display: inline-grid; place-items: center; font-weight: 700; font-size: 15px; }
  .grade.good { background: var(--good); color: #fff; }
  .grade.bad { background: var(--bad); color: #fff; }
  .grade.warn { background: var(--sun); color: #3d2800; }
  .grade.info { background: var(--cobalt); color: #fff; }
  .when { font-size: 14px; color: var(--night-ink-2); }
  .srcline { font-size: 13.5px; color: var(--night-ink-2); margin-top: 10px; }
  .srcline b { color: var(--night-ink); }
  .note { font-family: var(--serif); font-style: italic; font-size: 18px; line-height: 1.3; margin-top: 8px; color: var(--night-ink); }
  .note.inl { font-size: 16px; color: var(--night-ink-2); margin-left: 38px; }
  .trap { color: #ffd98a; gap: 8px; margin-top: 2px; }

  .complete { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 20px 8px; }
  .summary { justify-content: flex-start; padding-top: 40px; overflow-y: auto; }
  .stackart { flex: 1; display: flex; flex-direction: column-reverse; align-items: center; padding-bottom: 44px; gap: 6px; justify-content: center; }
  .stackart i { width: calc(300px - var(--i) * 14px); height: 34px; border-radius: 11px; background: var(--birch); animation: drop 520ms var(--spring) both; animation-delay: calc(var(--i) * 110ms + 150ms); }
  .stackart i:nth-child(even) { background: var(--birch-3); }
  .stackart i:last-child { background: var(--sun); }
  @keyframes drop { from { opacity: 0; transform: translateY(-140px) rotate(-6deg); } to { opacity: 1; transform: none; } }
  .complete h1 { font-size: 52px; line-height: 0.95; letter-spacing: -0.02em; }
  .lead { color: var(--night-ink-2); margin-top: 10px; font-size: 16px; }
  .complete dl { display: flex; gap: 8px; margin: 24px 0 14px; }
  .complete dl div { flex: 1; background: var(--night-2); border-radius: 18px; padding: 14px; }
  .complete dd { margin: 0; font-size: 32px; line-height: 1; }
  .complete dt { font-size: 13px; color: var(--night-ink-2); margin-top: 4px; }
  .streakline { font-size: 15px; color: var(--night-ink-2); margin-bottom: 22px; }
  .missed { list-style: none; padding: 0; margin: 4px 0 16px; background: var(--night-2); border-radius: 18px; }
  .missed li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; min-height: 52px; }
  .missed li + li { border-top: 1px solid var(--night-3); }
  .missed b.t-name { display: block; font-size: 16px; font-weight: 500; }
  .missed small { font-size: 12px; color: var(--night-ink-2); }
  .missed .q { width: 26px; height: 26px; border-radius: 8px; background: var(--bad); color: #fff; display: grid; place-items: center; font-weight: 800; flex: none; }
</style>
