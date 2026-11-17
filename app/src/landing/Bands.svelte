<script lang="ts">
  // One position at every rating band the data has: the Italian Game after 3.Bc4. While it is on
  // screen it climbs the bands by itself; picking a band takes over. No board, no pinned scrolling.
  import { desk } from '../lib/desk.svelte';
  import MiniBoard from '../lib/MiniBoard.svelte';
  import { seen } from './motion';
  import { demo, n } from './demo';

  let { rows: limit = 5, board = false }: { rows?: number; board?: boolean } = $props();
  const F = demo.fan, BANDS = demo.counts.bands;
  let band = $state(demo.band);
  let on = $state(false);
  let manual = $state(false);
  const cur = $derived(F.bands[band]);
  const share = (uci: string, b: number) => F.bands[b].moves.find((m) => m.uci === uci)?.pct ?? 0;
  // every move in the top few anywhere keeps its row, so rows slide rather than appear
  const moves = [...new Map(BANDS.flatMap((b) => F.bands[b].moves).map((m) => [m.uci, m])).values()].slice(0, 6);
  const order = $derived(new Map([...moves].sort((a, b) => share(b.uci, band) - share(a.uci, band)).map((m, i) => [m.uci, i])));
  const peak = Math.max(...moves.flatMap((m) => BANDS.map((b) => share(m.uci, b))));

  $effect(() => {
    if (!on || manual || desk.still) return;
    const t = setInterval(() => (band = BANDS[(BANDS.indexOf(band) + 1) % BANDS.length]), 1700);
    return () => clearInterval(t);
  });
  const H = 38;
</script>

<div class="bands" use:seen={(s) => (on = s)}>
  {#if board}
    {@const top = [...order].find(([, i]) => i === 0)![0]}
    <div class="pos"><MiniBoard fen={F.fen} last={[F.path.at(-1)!.slice(0, 2), F.path.at(-1)!.slice(2, 4)]} arrow={[top.slice(0, 2), top.slice(2, 4)]} label="The {F.name} after {F.order}, with the most played reply at this band drawn as an arrow" /></div>
  {/if}
  <div class="seg" role="radiogroup" aria-label="Rating band" style="--n:{BANDS.length};--at:{BANDS.indexOf(band)}">
    <span class="thumb" aria-hidden="true"></span>
    {#each BANDS as b}<button role="radio" aria-checked={band === b} class:on={band === b} onclick={() => { manual = true; band = b; }}>{b}</button>{/each}
  </div>
  <p class="th"><b class="t-num">{n(cur.games)}</b> games at {band} reach <span class="t-name">{F.order}</span></p>
  <div class="rows" style="height:{limit * H}px">
    {#each moves as m (m.uci)}
      {@const i = order.get(m.uci)!}
      {@const p = share(m.uci, band)}
      <div class="r" class:top={i === 0} class:out={i >= limit} style="transform:translateY({i * H}px)">
        <b>{m.san}</b>
        <span class="bar"><i style="transform:scaleX({p / peak})"></i></span>
        <span class="pc t-num">{p < 0.5 ? '<1' : Math.round(p)}%</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .bands { display: flex; flex-direction: column; gap: 12px; }
  .pos { width: min(100%, 250px); margin: 0 auto 6px; animation: none; }
  .seg { position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); padding: 4px; border-radius: 14px; background: var(--ground); }
  .thumb { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / var(--n)); border-radius: 10px; background: var(--ink); transform: translateX(calc(var(--at) * 100%)); transition: transform 420ms var(--spring); box-shadow: 0 4px 10px -4px rgba(21, 25, 54, 0.45); }
  .seg button { position: relative; height: 36px; border-radius: 10px; font-size: 12.5px; font-weight: 700; color: var(--ink-3); transition: color 260ms; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  /* a phone: the eight bands as a 4 × 2 grid of chips, the picked one filled */
  @media (max-width: 899px) {
    .seg { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
    .thumb { display: none; }
    .seg button { height: 40px; font-size: 14px; transition: color 260ms, background 260ms, transform 300ms var(--spring); }
    .seg button.on { background: var(--ink); box-shadow: 0 4px 10px -4px rgba(21, 25, 54, 0.45); transform: scale(1.04); }
    .pos { width: min(100%, 230px); }
  }
  .seg button:hover { color: var(--ink); }
  .seg button.on { color: var(--on-ink); }
  .th { font-size: 13px; color: var(--ink-2); }
  .th b { color: var(--ink); font-size: 14.5px; display: inline-block; min-width: 5.5ch; }
  .rows { position: relative; overflow: hidden; }
  .r { position: absolute; left: 0; right: 0; top: 0; height: 38px; display: grid; grid-template-columns: 46px 1fr 40px; align-items: center; gap: 10px; transition: transform 560ms var(--ease), opacity 300ms; }
  .r.out { opacity: 0; }
  .r b { font-size: 16px; font-weight: 750; }
  .bar { height: 10px; border-radius: 5px; background: var(--line); overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 5px; background: var(--ink-3); transform-origin: left; transition: transform 560ms var(--ease), background 300ms; }
  .r.top .bar i { background: var(--cobalt); }
  .r.top b { color: var(--accent-text); }
  .pc { text-align: right; font-weight: 700; font-size: 14px; }
</style>
