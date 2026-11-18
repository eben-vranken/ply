<script lang="ts">
  // The game's evaluation over time, as in every game review: White's winning chances fill from
  // the bottom, the midline is equal. Hover (or drag) shows the move and its eval; a click jumps
  // there. Mistakes and blunders sit on the line as dots in their verdict's colour.
  import { winPct, evalText } from './chess';
  import { KIND_COLOR } from './KindIcon.svelte';
  import type { Kind } from './review';

  interface Props {
    /** eval after each ply (index 0 = the start), White's view; null = not analysed yet */
    cps: (number | null)[];
    labels: string[];
    cur: number;
    kinds: (Kind | null)[];
    onpick: (i: number) => void;
  }
  let { cps, labels, cur, kinds, onpick }: Props = $props();
  const W = 600, H = 120;
  const n = $derived(Math.max(2, cps.length));
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (cp: number) => H - (winPct(cp) / 100) * H;
  const area = $derived.by(() => {
    let d = `M0 ${H}`;
    let last = H / 2;
    cps.forEach((c, i) => { if (c !== null) last = y(c); d += ` L${x(i).toFixed(1)} ${last.toFixed(1)}`; });
    return d + ` L${x(cps.length - 1).toFixed(1)} ${H} Z`;
  });
  const line = $derived(cps.map((c, i) => (c === null ? null : `${x(i).toFixed(1)} ${y(c).toFixed(1)}`)).filter(Boolean).join(' L'));
  const DOT = new Set<Kind>(['mistake', 'blunder', 'miss', 'brilliant', 'great']);
  const dots = $derived.by(() => {
    const out: { i: number; k: Kind }[] = [];
    kinds.forEach((k, i) => { if (k && DOT.has(k) && cps[i + 1] != null) out.push({ i: i + 1, k }); });
    return out;
  });

  let el = $state<HTMLDivElement>();
  let hover = $state<number | null>(null);
  function at(e: PointerEvent) {
    const r = el!.getBoundingClientRect();
    return Math.max(0, Math.min(cps.length - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
  }
  const tip = $derived(hover === null ? null : { i: hover, left: (hover / (n - 1)) * 100, text: labels[hover] ?? 'Start', ev: cps[hover] });
</script>

<div class="graph" bind:this={el} role="slider" tabindex="-1" aria-label="Evaluation through the game" aria-valuemin={0} aria-valuemax={cps.length - 1} aria-valuenow={cur}
  onpointermove={(e) => { hover = at(e); if (e.buttons === 1) onpick(hover); }}
  onpointerleave={() => (hover = null)}
  onpointerdown={(e) => onpick(at(e))}>
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
    <path d={area} class="w" />
    <line x1="0" x2={W} y1={H / 2} y2={H / 2} class="mid" />
    {#if line}<path d={'M' + line} class="ln" />{/if}
    <line x1={x(cur)} x2={x(cur)} y1="0" y2={H} class="cur" />
    {#if hover !== null}<line x1={x(hover)} x2={x(hover)} y1="0" y2={H} class="hv" />{/if}
  </svg>
  {#each dots as d (d.i)}
    <i class="dot" style="left:{(d.i / (n - 1)) * 100}%;top:{(y(cps[d.i]!) / H) * 100}%;background:{KIND_COLOR[d.k]}"></i>
  {/each}
  {#if tip}
    <span class="tip" style="left:clamp(40px, {tip.left}%, calc(100% - 40px))"><b>{tip.text}</b>{tip.ev != null ? ' ' + evalText(tip.ev) : ''}</span>
  {/if}
</div>

<style>
  .graph { position: relative; height: 92px; border-radius: 12px; overflow: visible; cursor: pointer; touch-action: pan-y; background: #313964; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 12px; display: block; }
  .w { fill: #fff0d9; }
  .mid { stroke: rgba(230, 60, 40, 0.45); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .ln { fill: none; stroke: #b9a27c; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .cur { stroke: var(--sun); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .hv { stroke: rgba(127, 127, 127, 0.8); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .dot { position: absolute; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; box-shadow: 0 0 0 2px #313964; pointer-events: none; }
  .tip { position: absolute; bottom: calc(100% + 6px); transform: translateX(-50%); white-space: nowrap; padding: 4px 9px; border-radius: 8px; background: var(--ink-fixed, #0f1337); color: #fff; font-size: 12.5px; pointer-events: none; box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35); }
</style>
