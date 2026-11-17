<script lang="ts">
  // The forgetting curve, as an illustration (not data): a move learned once fades within days;
  // a move reviewed just before it would be forgotten comes back stronger each time, so the gaps grow.
  // Both lines draw themselves when the chart scrolls in; the reviews pop in order.
  import { seen } from './motion';

  const W = 640, H = 260, PAD = { l: 44, r: 16, t: 18, b: 34 }, DAYS = 30;
  const x = (d: number) => PAD.l + (d / DAYS) * (W - PAD.l - PAD.r);
  const y = (r: number) => PAD.t + (1 - r) * (H - PAD.t - PAD.b);
  // without review: one stability, never renewed
  const once = Array.from({ length: 61 }, (_, i) => { const d = (i / 60) * DAYS; return `${i ? 'L' : 'M'}${x(d).toFixed(1)} ${y(Math.exp(-d / 10)).toFixed(1)}`; }).join('');
  // with review: each review lands when recall reaches 90% and multiplies the stability
  const reviews: number[] = [];
  const ply = (() => {
    let s = 10, at = 0, out = `M${x(0)} ${y(1)}`;
    while (at < DAYS) {
      const gap = -s * Math.log(0.9), end = Math.min(DAYS, at + gap);
      for (let k = 1; k <= 12; k++) { const d = at + ((end - at) * k) / 12; out += `L${x(d).toFixed(1)} ${y(Math.exp(-(d - at) / s)).toFixed(1)}`; }
      if (end >= DAYS) break;
      at = end; reviews.push(at); out += `L${x(at).toFixed(1)} ${y(1)}`; s *= 2.5;
    }
    return out;
  })();
  let on = $state(false);
</script>

<figure class="curve" class:on use:seen={(s) => { if (s) on = true; }}>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="Illustration: a move learned once is mostly forgotten within a month; a move reviewed just before it fades stays near the top, and each review comes later than the last.">
    {#each [0, 0.5, 1] as r}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(r)} y2={y(r)} class="grid" />
      <text x={PAD.l - 10} y={y(r) + 4} text-anchor="end" class="ax">{r * 100}%</text>
    {/each}
    {#each [0, 7, 14, 21, 30] as d}<text x={x(d)} y={H - 10} text-anchor="middle" class="ax">{d === 0 ? 'Day 1' : `Day ${d}`}</text>{/each}
    <path d={once} class="once" pathLength="1" />
    <path d="{ply}L{x(DAYS)} {y(0)}L{x(0)} {y(0)}Z" class="fill" />
    <path d={ply} class="ply" pathLength="1" />
    {#each reviews as d, i}
      <g class="rev" style="--i:{i}" transform="translate({x(d)} {y(1)})">
        <circle r="11" class="halo" /><circle r="6.5" class="dot" />
      </g>
    {/each}
    <g class="tag t1" transform="translate({x(23)} {y(Math.exp(-2.3)) - 18})"><rect x="-58" y="-14" width="116" height="26" rx="13" /><text text-anchor="middle" y="4">Learned once</text></g>
    <g class="tag t2" transform="translate({x(reviews.at(-1)! + 0.3) - 64} {y(1) + 34})"><rect x="-62" y="-14" width="124" height="26" rx="13" /><text text-anchor="middle" y="4">Reviewed by Ply</text></g>
  </svg>
  <figcaption>An illustration of the forgetting curve. Each dot is a review, and each one buys a longer gap.</figcaption>
</figure>

<style>
  .curve { margin: 0; }
  svg { display: block; width: 100%; height: auto; overflow: visible; }
  .grid { stroke: var(--line); stroke-width: 1; stroke-dasharray: 3 5; }
  .ax { font-size: 11px; font-weight: 600; fill: var(--ink-3); font-family: var(--sans); }
  .once { fill: none; stroke: var(--ink-3); stroke-width: 2.5; stroke-dasharray: 1; stroke-dashoffset: 1; opacity: 0.55; stroke-linecap: round; }
  .ply { fill: none; stroke: var(--cobalt); stroke-width: 3.5; stroke-linejoin: round; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
  .fill { fill: var(--cobalt); opacity: 0; }
  .on .once { transition: stroke-dashoffset 1600ms var(--ease) 100ms; stroke-dashoffset: 0; }
  .on .ply { transition: stroke-dashoffset 2400ms cubic-bezier(0.45, 0, 0.25, 1) 500ms; stroke-dashoffset: 0; }
  .on .fill { transition: opacity 900ms ease 2400ms; opacity: 0.07; }
  .dot { fill: var(--sun); stroke: var(--card); stroke-width: 2.5; }
  .halo { fill: var(--sun); opacity: 0.25; }
  .rev { opacity: 0; }
  .rev circle { transform: scale(0); transform-box: fill-box; transform-origin: center; }
  .on .rev { opacity: 1; transition: opacity 1ms calc(700ms + var(--i) * 480ms); }
  .on .rev .dot { transform: scale(1); transition: transform 460ms var(--spring) calc(700ms + var(--i) * 480ms); }
  .on .rev .halo { animation: halo 2.6s ease-out calc(900ms + var(--i) * 480ms) infinite; }
  @keyframes halo { 0% { transform: scale(0.6); opacity: 0.45; } 70%, 100% { transform: scale(2.1); opacity: 0; } }
  .tag rect { fill: var(--card); stroke: var(--line); }
  .tag text { font-size: 12px; font-weight: 700; font-family: var(--sans); }
  .t1 text { fill: var(--ink-3); } .t2 text { fill: var(--accent-text); }
  .tag { opacity: 0; }
  .on .t1 { opacity: 1; transition: opacity 500ms ease 1500ms; }
  .on .t2 { opacity: 1; transition: opacity 500ms ease 2700ms; }
  figcaption { margin-top: 10px; font-size: 12.5px; color: var(--ink-3); }
  @media (prefers-reduced-motion: reduce) { .on .rev .halo { animation: none; } }
</style>
