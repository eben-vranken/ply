<script lang="ts">
  // One trap from the data, both ways. Danger: the tempting move you must not play, and what
  // happens if you do. Punish: the same mistake from the other side of the board.
  import type { DrawShape } from '@lichess-org/chessground/draw';
  import Board, { type Badge } from '../lib/Board.svelte';
  import Icon from '../lib/Icon.svelte';
  import { inview } from '../lib/inview';
  import { desk } from '../lib/desk.svelte';
  import { demo, sq } from './demo';

  const T = demo.trap;
  type Frame = { fen: string; last: [string, string] | null; shapes?: DrawShape[]; badge?: Badge; say: string; tone: 'info' | 'bad' | 'good' | 'warn'; wait: number };
  const arrow = (u: string, brush: string): DrawShape => ({ orig: u.slice(0, 2) as never, dest: u.slice(2, 4) as never, brush });
  const order = (first: number, sans: string[]) => sans.map((s, k) => { const p = first + k; return (p % 2 === 0 ? `${p / 2 + 1}.` : k === 0 ? `${(p + 1) / 2}…` : '') + s; }).join(' ');
  const PLY = 10; // plies played before the trap position
  const danger: Frame[] = [
    { fen: T.fen, last: sq(T.setup), say: `Your move. ${Math.round(T.freq)}% of players at the ${T.band} band go wrong here.`, tone: 'info', wait: 1700 },
    { fen: T.fen, last: sq(T.setup), shapes: [arrow(T.bait.uci, 'bad')], say: `${order(PLY, [T.bait.san])} looks strong: queen and knight both aim at f7.`, tone: 'warn', wait: 1700 },
    { fen: T.bait.fen, last: sq(T.bait.uci), badge: { square: T.bait.uci.slice(2, 4), glyph: '??', tone: 'bad' }, say: `That's the trap.`, tone: 'bad', wait: 1300 },
    ...T.refute.map((r, k): Frame => ({ fen: r.fen, last: sq(r.uci), say: order(PLY + 1, T.refute.slice(0, k + 1).map((x) => x.san)), tone: 'bad', wait: k === T.refute.length - 1 ? 2200 : 850 })),
    { fen: T.fen, last: sq(T.setup), shapes: [arrow(T.safe.uci, 'good')], say: `The safe move is ${order(PLY, [T.safe.san])}`, tone: 'info', wait: 1500 },
    { fen: T.safe.fen, last: sq(T.safe.uci), badge: { square: T.safe.uci.slice(2, 4), glyph: '!', tone: 'good' }, say: T.safe.why, tone: 'good', wait: 2600 }
  ];
  const P = T.punish;
  const punish: Frame[] = P ? [
    { fen: T.fen, last: sq(T.setup), say: `You are Black now. Your opponent is about to play the same mistake.`, tone: 'info', wait: 1500 },
    { fen: P.fen, last: sq(T.bait.uci), badge: { square: T.bait.uci.slice(2, 4), glyph: '?', tone: 'bad' }, say: `${order(PLY, [T.bait.san])} A mistake you will meet. Punish it.`, tone: 'warn', wait: 1900 },
    ...P.answer.map((a, k): Frame => ({ fen: a.fen, last: sq(a.uci), badge: k % 2 === 0 ? { square: a.uci.slice(2, 4), glyph: '!', tone: 'good' } : undefined, say: k === 0 ? P.why : order(PLY + 1, P.answer.slice(0, k + 1).map((x) => x.san)), tone: 'good', wait: 2600 }))
  ] : [];

  let mode = $state<'danger' | 'punish'>('danger');
  let k = $state(0);
  let seen = $state(false);
  let running = $state(false);
  let rev = $state(0);
  const frames = $derived(mode === 'danger' ? danger : punish);
  const f = $derived(frames[Math.min(k, frames.length - 1)]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  function play(from = 0) { clearTimeout(timer); k = from; rev++; running = true; tick(); }
  function tick() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!seen || document.hidden) { running = false; return; }
      if (k >= frames.length - 1) { running = false; return; }
      k++; rev++; tick();
    }, frames[k].wait);
  }
  // plays once when it scrolls in; with reduced motion it waits for the button
  let played = false;
  $effect(() => { if (seen && !played && !desk.still) { played = true; play(); } if (!seen) { clearTimeout(timer); running = false; } return () => clearTimeout(timer); });
  function set(m: 'danger' | 'punish') { mode = m; if (desk.still) { k = 0; rev++; } else play(); }
  function stepOn() { clearTimeout(timer); running = false; k = (k + 1) % frames.length; rev++; }
</script>

<div class="trap" use:inview={{ on: (s) => (seen = s), threshold: 0.35 }}>
  <div class="board">
    <Board draw={false} fen={f.fen} side={mode === 'danger' ? 'w' : 'b'} lastMove={f.last} shapes={f.shapes ?? []} badge={f.badge ?? null} {rev} dark />
  </div>
  <div class="side">
    <div class="tabs" role="tablist" aria-label="Trap card type">
      <button role="tab" aria-selected={mode === 'danger'} class:on={mode === 'danger'} onclick={() => set('danger')}><Icon name="warn" size={18} /> Danger</button>
      {#if P}<button role="tab" aria-selected={mode === 'punish'} class:on={mode === 'punish'} onclick={() => set('punish')}><Icon name="sword" size={18} /> Punish</button>{/if}
    </div>
    <p class="t-name nm">{T.name.split(': ').slice(1).join(': ') || T.name}<span class="eco">{T.eco}</span></p>
    <p class="ord">{T.order}</p>
    {#key k + mode}
      <p class="msg {f.tone}" role="status"><span class="g">{f.tone === 'good' ? '!' : f.tone === 'bad' ? '??' : f.tone === 'warn' ? '?' : 'i'}</span>{f.say}</p>
    {/key}
    <div class="ctl">
      <button class="btn night" onclick={() => play()} disabled={running}><Icon name="undo" size={18} /> {running ? 'Playing…' : 'Play it again'}</button>
      <button class="btn night sq" onclick={stepOn} aria-label="Next step"><Icon name="next" size={20} /></button>
    </div>
  </div>
</div>

<style>
  .trap { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: center; }
  .board { width: 100%; max-width: 520px; margin: 0 auto; pointer-events: none; }
  .side { color: var(--night-ink); display: flex; flex-direction: column; min-width: 0; }
  .tabs { display: inline-flex; align-self: flex-start; gap: 4px; padding: 4px; border-radius: 16px; background: var(--night-2); margin-bottom: 18px; }
  .tabs button { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px; border-radius: 12px; font-weight: 700; font-size: 15px; color: var(--night-ink-2); transition: background 180ms, color 180ms; }
  .tabs button:hover { color: var(--night-ink); }
  .tabs button.on { background: var(--birch); color: var(--ink-fixed); }
  .nm { font-size: 24px; line-height: 1.1; }
  .nm .eco { background: rgba(255, 255, 255, 0.12); }
  .ord { font-size: 13.5px; color: var(--night-ink-2); margin-top: 4px; }
  .msg { display: flex; align-items: flex-start; gap: 10px; min-height: 76px; margin-top: 18px; font-size: 18px; font-weight: 600; line-height: 1.3; animation: rise 240ms var(--ease) both; }
  .g { flex: none; min-width: 30px; height: 30px; padding: 0 6px; display: grid; place-items: center; border-radius: 9px; font-weight: 800; font-size: 15px; letter-spacing: -0.05em; background: var(--night-3); margin-top: -3px; }
  .msg.info .g { font-family: var(--serif); font-style: italic; }
  .msg.good { color: #8be0b6; } .msg.good .g { background: var(--good); color: #fff; border-radius: 50%; }
  .msg.bad { color: #feb6a8; } .msg.bad .g { background: var(--bad); color: #fff; }
  .msg.warn { color: #ffd38d; } .msg.warn .g { background: var(--sun); color: #3c2a0b; }
  .ctl { display: flex; gap: 10px; margin-top: 14px; }
  .ctl .sq { width: 52px; padding: 0; }
  @media (min-width: 900px) { .trap { grid-template-columns: minmax(0, 480px) minmax(280px, 1fr); gap: 44px; } .board { max-width: none; } }
</style>
