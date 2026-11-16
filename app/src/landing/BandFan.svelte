<script lang="ts">
  // One position at every rating band the data has. Scrolling through the section climbs the
  // bands (the section is pinned while it does); the control sets one by hand.
  import type { DrawShape } from '@lichess-org/chessground/draw';
  import Board from '../lib/Board.svelte';
  import { inview } from '../lib/inview';
  import { desk } from '../lib/desk.svelte';
  import { demo, n, millions } from './demo';

  const F = demo.fan, BANDS = demo.counts.bands;
  let band = $state(demo.band);
  let seen = $state(false);
  let manual = $state(false);
  let wrap = $state<HTMLElement>();
  const cur = $derived(F.bands[band]);
  // every move that is in the top six anywhere keeps its row, so rows hold still while the bars move
  const moves = [...new Map(BANDS.flatMap((b) => F.bands[b].moves).map((m) => [m.uci, m])).values()].slice(0, 7);
  const share = (uci: string, b: number) => F.bands[b].moves.find((m) => m.uci === uci)?.pct ?? 0;
  const rows = $derived(moves.map((m) => ({ ...m, pct: share(m.uci, band), trail: BANDS.map((b) => share(m.uci, b)) })).sort((a, b) => b.pct - a.pct));
  const order = $derived(new Map(rows.map((r, i) => [r.uci, i])));
  const peak = Math.max(...moves.flatMap((m) => BANDS.map((b) => share(m.uci, b))));
  const shapes = $derived(rows.filter((r) => r.pct >= 2).map((r, k): DrawShape => ({ orig: r.uci.slice(0, 2) as never, dest: r.uci.slice(2, 4) as never, brush: k === 0 ? 'lead' : 'fan', modifiers: { lineWidth: Math.max(3, Math.round(r.pct / 4)) } })));
  const spark = (t: number[]) => t.map((v, i) => `${i ? 'L' : 'M'}${(i / (t.length - 1)) * 56 + 2} ${20 - (v / peak) * 17}`).join('');
  // the story the data tells, found rather than written: the reply whose share changes most across the bands
  const mover = moves.map((m) => { const t = BANDS.map((b) => share(m.uci, b)); return { san: m.san, hi: Math.max(...t), lo: Math.min(...t), at: BANDS[t.indexOf(Math.max(...t))], low: BANDS[t.indexOf(Math.min(...t))] }; }).sort((a, b) => b.hi / Math.max(b.lo, 0.5) - a.hi / Math.max(a.lo, 0.5))[0];

  // pinned scrolling: the section is taller than the window and its progress picks the band
  $effect(() => {
    if (!seen || manual || desk.still || !wrap) return;
    const scroller = wrap.closest('.landing') ?? window;
    let raf = 0;
    const read = () => {
      raf = 0;
      const r = wrap!.getBoundingClientRect(), span = r.height - innerHeight;
      if (span <= 40) return;
      const p = Math.min(0.999, Math.max(0, -r.top / span));
      const b = BANDS[Math.floor(p * BANDS.length)];
      if (b !== band) band = b;
    };
    const on = () => { raf ||= requestAnimationFrame(read); };
    scroller.addEventListener('scroll', on, { passive: true });
    return () => { scroller.removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  });
  function pick(b: number) {
    manual = true;
    const go = () => (band = b);
    // the bars and the count morph where the browser can do it
    const d = document as Document & { startViewTransition?: (f: () => void) => unknown };
    if (d.startViewTransition && !desk.still) d.startViewTransition(go); else go();
  }
</script>

<div class="pin" class:still={desk.still} bind:this={wrap} use:inview={{ on: (s) => { seen = s; if (!s) manual = false; }, threshold: 0 }}>
  <div class="in">
    <div class="copy">
      <p class="kick">Matched to your rating</p>
      <h2>You train against what <em>your</em> opponents play.</h2>
      <p class="lead">Ply's lines are built from {demo.counts.bands.length} rating bands of the Lichess open database, up to {millions(Math.max(...Object.values(demo.counts.games)))} games in each. Here is one position, the {F.name} after {F.order}, at each of them.</p>
      <div class="bands" role="radiogroup" aria-label="Rating band">
        {#each BANDS as b}<button role="radio" aria-checked={band === b} class:on={band === b} onclick={() => pick(b)}>{b}</button>{/each}
      </div>
      <p class="note"><b>{mover.san}</b> is played in {Math.round(mover.hi)}% of games at the {mover.at} band and {mover.lo < 1 ? 'under 1' : Math.round(mover.lo)}% at {mover.low}. A line you never meet is a line you do not have to learn yet.</p>
    </div>

    <div class="board"><Board fen={F.fen} side="w" lastMove={[F.path.at(-1)!.slice(0, 2), F.path.at(-1)!.slice(2, 4)]} {shapes} /></div>

    <div class="table">
      <p class="th"><b class="t-num">{n(cur.games)}</b> games at the <b>{band}</b> band reach this position</p>
      <div class="rows" style="height:{rows.length * 44}px">
        {#each moves as m (m.uci)}
          {@const r = rows[order.get(m.uci)!]}
          <div class="r" class:top={order.get(m.uci) === 0} class:gone={r.pct < 0.5} style="transform:translateY({order.get(m.uci)! * 44}px)">
            <b>{m.san}</b>
            <span class="bar"><i style="transform:scaleX({r.pct / peak})"></i></span>
            <span class="pc t-num">{r.pct < 0.5 ? '<1' : Math.round(r.pct)}%</span>
            <svg viewBox="0 0 60 24" width="60" height="24" aria-hidden="true">
              <path d={spark(r.trail)} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.45" />
              <circle cx={(BANDS.indexOf(band) / (BANDS.length - 1)) * 56 + 2} cy={20 - (r.pct / peak) * 17} r="3" fill="currentColor" />
            </svg>
          </div>
        {/each}
      </div>
      <p class="axis"><span>share of games</span><span>{BANDS[0]} → {BANDS.at(-1)}</span></p>
    </div>
  </div>
</div>

<style>
  .pin { height: 260vh; }
  .pin.still { height: auto; }
  .in { position: sticky; top: 0; min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 1fr); align-content: center; gap: 18px; padding: 72px 20px 28px; max-width: 1240px; margin: 0 auto; }
  .still .in { position: static; min-height: 0; }
  .kick { font-size: 13.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent-text); }
  h2 { font-family: var(--serif); font-style: italic; font-weight: 500; font-size: clamp(30px, 4.2vw, 56px); line-height: 1.02; letter-spacing: -0.02em; margin: 8px 0 12px; }
  h2 em { color: var(--accent-text); }
  .lead { font-size: 16.5px; line-height: 1.45; color: var(--ink-2); max-width: 46ch; }
  .bands { display: flex; flex-wrap: wrap; gap: 6px; margin: 18px 0 14px; }
  .bands button { min-width: 58px; height: 44px; padding: 0 10px; border-radius: 13px; background: var(--card); box-shadow: var(--shadow); font-weight: 700; font-size: 15px; color: var(--ink-2); transition: transform 160ms var(--spring), background 160ms, color 160ms; }
  .bands button:hover { transform: translateY(-2px); }
  .bands button.on { background: var(--ink); color: var(--on-ink); }
  .note { font-size: 14.5px; line-height: 1.4; color: var(--ink-2); max-width: 46ch; }
  .note b { color: var(--ink); }
  .board { width: 100%; max-width: min(520px, 46vh); margin: 0 auto; pointer-events: none; }
  .table { background: var(--card); border-radius: var(--r-l); box-shadow: var(--shadow); padding: 14px 16px 10px; align-self: center; view-transition-name: band-table; }
  .th { font-size: 13.5px; color: var(--ink-2); margin-bottom: 6px; }
  .th b { color: var(--ink); font-size: 16px; }
  .rows { position: relative; }
  .r { position: absolute; left: 0; right: 0; top: 0; height: 44px; display: grid; grid-template-columns: 50px 1fr 44px 60px; align-items: center; gap: 10px; color: var(--ink-3); transition: transform 520ms var(--ease), opacity 300ms; }
  .r b { font-size: 18px; font-weight: 700; color: var(--ink); }
  .r.gone { opacity: 0.4; }
  .bar { height: 10px; border-radius: 5px; background: var(--line); overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 5px; background: var(--ink-3); transform-origin: left; transition: transform 520ms var(--ease); }
  .r.top { color: var(--accent-text); }
  .r.top .bar i { background: var(--cobalt); }
  .pc { text-align: right; font-weight: 700; font-size: 15px; color: var(--ink); }
  .axis { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--ink-3); padding: 6px 0 0 60px; }
  .axis span:last-child { width: 60px; text-align: right; white-space: nowrap; font-size: 10.5px; }

  @media (max-width: 899px) {
    .copy h2 { margin-bottom: 8px; }
    .copy .lead, .copy .note { display: none; }
    .bands { margin: 10px 0 0; }
    .bands button { min-width: 0; flex: 1 0 20%; height: 40px; }
    .board { max-width: min(340px, 36vh); }
    .r:nth-child(n + 6) { display: none; }
    .rows { height: 220px !important; }
  }
  @media (min-width: 900px) {
    .in { grid-template-columns: minmax(300px, 1fr) minmax(320px, 520px); grid-template-areas: 'copy board' 'table board'; column-gap: 56px; padding: 84px 40px 40px; }
    .copy { grid-area: copy; align-self: end; }
    .board { grid-area: board; max-width: min(520px, 70vh); align-self: center; }
    .table { grid-area: table; align-self: start; max-width: 520px; }
  }
</style>
