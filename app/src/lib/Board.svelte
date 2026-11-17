<script lang="ts" module>
  export interface Badge { square: string; glyph: string; tone: 'good' | 'bad' | 'warn' }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { Chessground } from '@lichess-org/chessground';
  import type { Api } from '@lichess-org/chessground/api';
  import type { Key } from '@lichess-org/chessground/types';
  import type { DrawShape } from '@lichess-org/chessground/draw';

  interface Props {
    fen: string;
    side?: 'w' | 'b';
    dests?: Map<string, string[]> | null;
    lastMove?: [string, string] | null;
    shapes?: DrawShape[];
    badge?: Badge | null;
    check?: boolean;
    rev?: number;
    shake?: number;
    dark?: boolean;
    coords?: boolean;
    /** right-click drags an arrow, right-click a square rings it; a left click clears them (off for the landing's demos) */
    draw?: boolean;
    onmove?: (from: string, to: string) => void;
  }
  let { fen, side = 'w', dests = null, lastMove = null, shapes = [], badge = null, check = false, rev = 0, shake = 0, dark = false, coords = true, draw = true, onmove = () => {} }: Props = $props();

  let el = $state<HTMLDivElement>()!;
  let top = $state<HTMLDivElement>();
  $effect(() => {
    if (shake > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      top?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 300, easing: 'ease-out' });
  });
  let api: Api | undefined = $state();
  let shownFen = '', shownRev = -1;

  onMount(() => {
    api = Chessground(el, {
      coordinates: coords,
      animation: { enabled: true, duration: 170 },
      highlight: { lastMove: true, check: true },
      draggable: { showGhost: true },
      // your own arrows, as on Lichess: plain right-drag is green, Shift red, Alt blue, Shift+Alt yellow
      disableContextMenu: draw,
      drawable: { enabled: draw, visible: true, brushes: {
        good: { key: 'good', color: '#018359', opacity: 0.9, lineWidth: 11 },
        bad: { key: 'bad', color: '#c82611', opacity: 0.85, lineWidth: 11 },
        hint: { key: 'hint', color: '#ffbe45', opacity: 1, lineWidth: 9 },
        // what the other side plays (the landing page's fans, Explore's hover): ink, quieter than an answer
        fan: { key: 'fan', color: '#0f1337', opacity: 0.5, lineWidth: 8 },
        lead: { key: 'lead', color: '#254bd2', opacity: 0.85, lineWidth: 10 }
      } as never },
      premovable: { enabled: false }
    });
    // The screen may still be sliding in when chessground caches its bounds, so re-measure on every press.
    const fresh = () => api?.state.dom.bounds.clear();
    el.addEventListener('touchstart', fresh, { capture: true, passive: true });
    el.addEventListener('mousedown', fresh, { capture: true });
    const settle = setTimeout(() => api?.redrawAll(), 400);
    return () => { clearTimeout(settle); api?.destroy(); };
  });

  $effect(() => {
    void rev;
    if (!api) return;
    const turn = fen.split(' ')[1] === 'w' ? 'white' : 'black';
    // a new fen clears your arrows (chessground does that), so it is only passed when the position
    // changes or rev asks for a redraw: a hint or a hover arrow appearing must not wipe what you drew
    const moved = fen !== shownFen || rev !== shownRev;
    shownFen = fen; shownRev = rev;
    api.set({
      ...(moved ? { fen } : {}),
      orientation: side === 'w' ? 'white' : 'black',
      turnColor: turn,
      lastMove: (lastMove as Key[] | null) ?? undefined,
      check,
      movable: {
        free: false,
        color: dests ? turn : undefined,
        dests: (dests as Map<Key, Key[]> | null) ?? new Map(),
        showDests: true,
        events: { after: (f, t) => onmove(f, t) }
      }
    });
    api.setAutoShapes(shapes);
  });

  const pos = $derived.by(() => {
    if (!badge) return null;
    const f = badge.square.charCodeAt(0) - 97;
    const r = +badge.square[1] - 1;
    const x = side === 'w' ? f : 7 - f;
    const y = side === 'w' ? 7 - r : r;
    return `left:${(x + 1) * 12.5}%;top:${y * 12.5}%`;
  });
  const sq = $derived.by(() => {
    if (!badge) return '';
    const f = badge.square.charCodeAt(0) - 97, r = +badge.square[1] - 1;
    return `left:${(side === 'w' ? f : 7 - f) * 12.5}%;top:${(side === 'w' ? 7 - r : r) * 12.5}%`;
  });
</script>

<div class="slab" class:dark data-fen={fen}>
  <div class="top" bind:this={top}>
    <div class="cg-wrap" bind:this={el}></div>
    {#if badge && pos}
      {#key badge.square + badge.glyph + rev}
        <span class="flash {badge.tone}" style={sq} aria-hidden="true"></span>
        {#if badge.tone === 'good'}<span class="burst" style={pos} aria-hidden="true">{#each Array(8) as _, i}<i style="--a:{i * 45 + 12}deg"></i>{/each}</span>{/if}
        <span class="badge {badge.tone}" style={pos} aria-hidden="true">{badge.glyph}</span>
      {/key}
    {/if}
  </div>
  <div class="edge" aria-hidden="true"></div>
</div>

<style>
  .slab { position: relative; border-radius: 10px 10px 12px 12px; filter: drop-shadow(0 14px 14px rgba(21, 25, 54, 0.18)); }
  .slab.dark { filter: drop-shadow(0 18px 20px rgba(0, 0, 0, 0.5)); }
  .top { position: relative; }
  /* the plywood edge: five veneers, alternating grain */
  .edge {
    height: 12px; border-radius: 0 0 10px 10px;
    background: linear-gradient(#d0b386 0 2px, #ad8c59 2px 4px, #e1c69e 4px 7px, #9b7a45 7px 9px, #d0b386 9px 12px);
  }
  .badge {
    position: absolute; z-index: 5; width: 30px; height: 30px; margin: -9px 0 0 -21px;
    display: grid; place-items: center; border-radius: 50%;
    font-weight: 800; font-size: 17px; letter-spacing: -0.06em; color: var(--ivory);
    border: 2.5px solid var(--ivory); box-shadow: 0 3px 8px rgba(21, 25, 54, 0.35);
    animation: pop 260ms var(--spring) both; pointer-events: none;
  }
  .badge.good { background: var(--good-mark); }
  .flash { position: absolute; z-index: 3; width: 12.5%; aspect-ratio: 1; pointer-events: none; opacity: 0; animation: flash 520ms ease-out both; }
  .flash.good { background: #52db9c; }
  .flash.bad { background: #ee5b45; }
  .flash.warn { background: var(--sun); }
  @keyframes flash { 0% { opacity: 0.75; } 100% { opacity: 0; } }
  .burst { position: absolute; z-index: 4; width: 0; height: 0; margin: 6px 0 0 -6px; pointer-events: none; }
  .burst i { position: absolute; left: -3.5px; top: -3.5px; width: 7px; height: 7px; border-radius: 50%; background: var(--sun); animation: spark 560ms cubic-bezier(0.1, 0.7, 0.3, 1) both; }
  .burst i:nth-child(odd) { background: #52db9c; }
  @keyframes spark { 0% { opacity: 1; transform: rotate(var(--a)) translateY(-10px) scale(1); } 100% { opacity: 0; transform: rotate(var(--a)) translateY(-42px) scale(0.3); } }
  .badge.bad { background: var(--bad); border-radius: 9px; }
  .badge.warn { background: var(--sun); color: #3c2a0b; border-radius: 9px; }
</style>
