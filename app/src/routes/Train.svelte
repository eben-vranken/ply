<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Chess } from 'chess.js';
  import type { DrawShape } from '@lichess-org/chessground/draw';
  import { app, save, go, run } from '../lib/state.svelte';
  import { nameOf, moveOrder, type Item } from '../lib/demo';
  import { sfx, buzz } from '../lib/fx';
  import Board, { type Badge } from '../lib/Board.svelte';
  import Icon from '../lib/Icon.svelte';

  const items: Item[] = run.items.slice();
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
  let step = $state(0);
  let phase = $state<'play' | 'answered' | 'replay' | 'complete'>('play');
  let fixing = $state(false);
  let msg = $state<{ tone: 'good' | 'bad' | 'warn' | 'info'; text: string } | null>(null);
  let grade = $state<'Good' | 'Hard' | 'Again' | 'Learning'>('Good');
  let undone = $state(false);

  let wrongs = 0, hinted = false, t0 = 0, times: number[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const total = { asked: 0, clean: 0, started: Date.now() };
  let strip: HTMLDivElement | undefined = $state();

  const full = $derived([...item.setup, ...item.moves]);
  const label = $derived(nameOf(full));
  const lastAsk = $derived(item.moves.length - 1 - (((item.setup.length + item.moves.length - 1) % 2 === 0) === (item.side === 'w') ? 0 : 1));
  const showBranch = $derived(phase === 'play' && item.branch && step <= item.branch.until);

  function sync(mv?: { from: string; to: string }) {
    fen = chess.fen();
    check = chess.inCheck();
    if (mv) lastMove = [mv.from, mv.to];
    hist = chess.history();
    void tick().then(() => strip?.scrollTo({ left: 9999, behavior: 'smooth' }));
  }
  function legal() {
    const m = new Map<string, string[]>();
    for (const mv of chess.moves({ verbose: true })) m.set(mv.from, [...(m.get(mv.from) ?? []), mv.to]);
    return m;
  }
  function peek(san: string) { const mv = chess.move(san); chess.undo(); return mv; }

  function load(i: number) {
    clearTimeout(timer);
    idx = i;
    const it = items[i];
    chess = new Chess();
    it.setup.forEach((m) => chess.move(m));
    step = 0; wrongs = 0; hinted = false; times = []; fixing = false;
    phase = 'play'; msg = null; badge = null; shapes = []; lastMove = null; dests = null;
    sync();
    timer = setTimeout(advance, 450);
  }

  function advance() {
    const it = items[idx];
    if (step >= it.moves.length) return finish();
    if ((chess.turn() === it.side) === false) {
      dests = null;
      timer = setTimeout(() => {
        const mv = chess.move(it.moves[step]);
        mv.captured ? sfx.capture() : sfx.move();
        step++; badge = null; sync(mv); advance();
      }, Math.max(app.delay, 120));
      return;
    }
    dests = legal();
    t0 = performance.now();
    if (it.kind === 'new' && step === lastAsk) {
      const e = peek(it.moves[step]);
      shapes = [{ orig: e.from as never, dest: e.to as never, brush: 'good' }];
      msg = { tone: 'info', text: `New move. Play ${it.moves[step]}` };
    }
  }

  function onmove(from: string, to: string) {
    const it = items[idx];
    const expected = it.moves[step];
    const mv = chess.move({ from, to, promotion: 'q' });
    if (mv.san === expected) {
      mv.captured ? sfx.capture() : sfx.move();
      if (!fixing) { sfx.good(); total.clean++; times.push(performance.now() - t0); }
      total.asked++;
      badge = fixing ? null : { square: to, glyph: mv.san.includes('#') ? '#' : '!', tone: 'good' };
      msg = fixing ? null : { tone: 'good', text: mv.san.includes('#') ? 'Checkmate' : 'Correct' };
      fixing = false; shapes = []; step++; dests = null;
      sync(mv); advance();
      return;
    }
    chess.undo(); rev++;
    if (it.branch && step <= it.branch.until && mv.san === it.branch.alt) {
      badge = { square: to, glyph: '!?', tone: 'warn' };
      msg = { tone: 'warn', text: `That's your ${it.branch.altName} move. This line is the ${it.branch.label.replace(/ \(.*/, '')}.` };
      return;
    }
    const isBait = it.bait?.san === mv.san;
    wrongs++; fixing = true; shake++;
    buzz(50); sfx.bad();
    badge = { square: to, glyph: isBait ? '??' : '?', tone: 'bad' };
    const e = peek(expected);
    shapes = [{ orig: e.from as never, dest: e.to as never, brush: 'good' }];
    msg = { tone: 'bad', text: isBait ? `That's the trap. The safe move is ${expected}` : `Not that. Your move is ${expected}` };
  }

  function hint() {
    if (!dests) return;
    hinted = true;
    const e = peek(items[idx].moves[step]);
    shapes = [{ orig: e.from as never, brush: 'hint' }];
    msg = { tone: 'info', text: 'This piece moves. Hint used: Hard at best' };
  }

  function finish() {
    dests = null;
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    grade = items[idx].kind === 'new' ? 'Learning' : wrongs ? 'Again' : hinted || avg > app.hardSeconds * 1000 ? 'Hard' : 'Good';
    phase = 'answered';
    msg = null;
  }

  function next() {
    if (run.mode === 'today' && run.title === 'Today') { app.doneToday++; save(); }
    undone = false;
    if (idx + 1 >= items.length) return complete();
    load(idx + 1);
  }
  function undo() { undone = true; total.asked -= item.moves.length >> 1; load(idx); msg = { tone: 'info', text: 'Grade undone. Take it again' }; }

  function replay() {
    const it = items[idx];
    if (!it.bait) return;
    clearTimeout(timer);
    phase = 'replay';
    chess = new Chess();
    [...it.setup, ...it.moves.slice(0, lastAsk)].forEach((m) => chess.move(m));
    badge = null; shapes = []; lastMove = null; sync();
    const seq = [it.bait.san, ...it.bait.refute];
    let i = 0;
    const stepOn = () => {
      if (i >= seq.length) { phase = 'answered'; return; }
      const mv = chess.move(seq[i]);
      mv.captured ? sfx.capture() : sfx.move();
      badge = i === 0 ? { square: mv.to, glyph: '??', tone: 'bad' } : mv.san.includes('#') ? { square: mv.to, glyph: '#', tone: 'bad' } : badge;
      sync(mv); i++;
      timer = setTimeout(stepOn, 750);
    };
    timer = setTimeout(stepOn, 500);
  }

  let grew = $state(false);
  function complete() {
    phase = 'complete';
    sfx.done(); buzz([30, 60, 30]);
    const day = Math.floor((Date.now() - app.rollover * 36e5) / 864e5);
    if (run.mode === 'today' && app.sessionAt !== day) { app.sessionAt = day; app.streak++; grew = true; save(); }
  }
  function leave() { clearTimeout(timer); go(run.mode === 'today' ? '/today' : '/explore'); }

  onMount(() => {
    if (!items.length) { go('/today'); return; }
    load(0);
    return () => clearTimeout(timer);
  });

  const mins = $derived(Math.max(1, Math.round((Date.now() - total.started) / 60000)));
  const gradeInfo = { Good: ['good', 'Good', 'Next review in 4 days'], Hard: ['warn', 'Hard', 'Next review in 2 days'], Again: ['bad', 'Again', 'Back in 10 minutes'], Learning: ['info', 'Learning', 'First review in 1 minute'] } as const;
</script>

<div class="room">
  {#if phase === 'complete'}
    <div class="complete">
      <div class="stackart" aria-hidden="true">
        {#each items as _, i}<i style="--i:{i};--n:{items.length}"></i>{/each}
      </div>
      <h1 class="t-name">Session complete</h1>
      <p class="lead">{items.length} cards laid down. Each clean answer adds a layer.</p>
      <dl>
        <div><dd class="t-num">{total.asked}</dd><dt>moves</dt></div>
        <div><dd class="t-num">{total.asked ? Math.round((total.clean / total.asked) * 100) : 100}%</dd><dt>first try</dt></div>
        <div><dd class="t-num">{mins}</dd><dt>min</dt></div>
      </dl>
      {#if run.mode === 'today'}
        <p class="streakline" class:grew><span class="t-num">{app.streak}</span> day streak{grew ? ', one more than yesterday' : ''}</p>
      {:else}
        <p class="streakline">{run.mode === 'drill' ? 'Drill only: no schedule was changed.' : 'These moves are now in your reviews.'}</p>
      {/if}
      <button class="btn big wide sun" onclick={leave}>Done</button>
    </div>
  {:else}
    <header>
      <button class="x" onclick={leave} aria-label="Leave session"><Icon name="close" /></button>
      <div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax={items.length} aria-valuenow={idx}>
        {#each items as _, i}<i class:done={i < idx} class:now={i === idx}></i>{/each}
      </div>
      <span class="mode">{run.mode === 'drill' ? 'Drill' : run.mode === 'learn' ? 'Learn' : `${idx + 1}/${items.length}`}</span>
    </header>

    <div class="label">
      {#if phase !== 'play'}
        <p class="t-name nm">{label[1]} <span class="eco">{label[0]}</span></p>
        <p class="ord">{moveOrder(full.slice(0, item.setup.length + lastAsk), true)}</p>
      {:else if showBranch && item.branch}
        <p class="branch"><Icon name="explore" size={16} /> This line: <b class="t-name">{item.branch.label}</b></p>
      {:else if app.showName}
        <p class="t-name nm">{label[1]} <span class="eco">{label[0]}</span></p>
      {:else}
        <p class="ord quiet">{item.side === 'w' ? 'You play White' : 'You play Black'}</p>
      {/if}
    </div>

    <div class="boardwrap">
      <Board {fen} side={item.side} {dests} {lastMove} {shapes} {badge} {check} {rev} {shake} dark {onmove} />
    </div>

    {#if phase === 'play'}
      <div class="prompt" aria-live="polite">
        {#if msg}
          {#key msg.text}
            <p class="msg {msg.tone}">
              <span class="g">{msg.tone === 'good' ? '!' : msg.tone === 'bad' ? '?' : msg.tone === 'warn' ? '!?' : 'i'}</span>{msg.text}
            </p>
          {/key}
        {:else}
          <p class="ask">{item.prompt}</p>
        {/if}
      </div>
      <div class="strip" bind:this={strip}>
        {#each hist as m, i}
          <span class:last={i === hist.length - 1}>{#if i % 2 === 0}<em>{i / 2 + 1}.</em>{/if}{m}</span>
        {/each}
        {#if !hist.length}<span class="ghost">1.</span>{/if}
      </div>
      <footer>
        <button class="btn night" onclick={hint} disabled={!dests}><Icon name="hint" size={20} /> Hint</button>
        <p class="src">{item.source ?? ''}</p>
      </footer>
    {:else}
      <div class="answer">
        <div class="row">
          <span class="grade {gradeInfo[grade][0]}">{gradeInfo[grade][1]}</span>
          <span class="when">{gradeInfo[grade][2]}</span>
        </div>
        {#if item.source}<p class="srcline">{item.source}</p>{/if}
        {#if item.note}<p class="note">{item.note}</p>{/if}
        {#if item.bait}
          <button class="link trap" onclick={replay} disabled={phase === 'replay'}>
            <Icon name="warn" size={18} /> {phase === 'replay' ? 'Playing the trap…' : `See why ${item.bait.san} loses`}
          </button>
        {/if}
      </div>
      <footer>
        <button class="btn night" onclick={undo} disabled={undone || phase === 'replay'} aria-label="Undo grade"><Icon name="undo" size={20} /> Undo grade</button>
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

  .label { height: 58px; flex: none; padding: 4px 16px 0; display: flex; flex-direction: column; justify-content: center; }
  .nm { font-size: 21px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: rise 260ms var(--ease) both; }
  .nm .eco { background: rgba(255, 255, 255, 0.14); }
  .ord { font-size: 13px; color: var(--night-ink-2); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ord.quiet { font-size: 14px; font-weight: 600; }
  .branch { display: inline-flex; align-self: flex-start; align-items: center; gap: 7px; height: 36px; padding: 0 14px 0 10px; border-radius: 12px; background: var(--birch); color: var(--ink); font-size: 14px; font-weight: 600; animation: rise 260ms var(--ease) both; }
  .branch b { font-size: 17px; font-weight: 500; }

  .boardwrap { padding: 0 8px; flex: none; }

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
  .note { font-family: var(--serif); font-style: italic; font-size: 18px; line-height: 1.3; margin-top: 8px; color: var(--night-ink); }
  .trap { color: #ffd98a; gap: 8px; margin-top: 2px; }

  .complete { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 20px 8px; }
  .stackart { flex: 1; display: flex; flex-direction: column-reverse; align-items: center; justify-content: flex-start; padding-bottom: 44px; gap: 6px; justify-content: center; }
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
  .streakline .t-num { color: var(--sun); font-size: 22px; margin-right: 2px; }
</style>
