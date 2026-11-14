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
    onmove?: (from: string, to: string) => void;
  }
  let { fen, side = 'w', dests = null, lastMove = null, shapes = [], badge = null, check = false, rev = 0, shake = 0, dark = false, coords = true, onmove = () => {} }: Props = $props();

  let el = $state<HTMLDivElement>()!;
  let top = $state<HTMLDivElement>();
  $effect(() => {
    if (shake > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      top?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 300, easing: 'ease-out' });
  });
  let api: Api | undefined = $state();

  onMount(() => {
    api = Chessground(el, {
      coordinates: coords,
      animation: { enabled: true, duration: 170 },
      highlight: { lastMove: true, check: true },
      draggable: { showGhost: true },
      drawable: { enabled: false, visible: true, brushes: {
        good: { key: 'good', color: '#0f7a55', opacity: 0.9, lineWidth: 11 },
        bad: { key: 'bad', color: '#cf331c', opacity: 0.85, lineWidth: 11 },
        hint: { key: 'hint', color: '#f4b740', opacity: 1, lineWidth: 9 }
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
    api.set({
      fen,
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
</script>

<div class="slab" class:dark data-fen={fen}>
  <div class="top" bind:this={top}>
    <div class="cg-wrap" bind:this={el}></div>
    {#if badge && pos}
      {#key badge.square + badge.glyph + rev}
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
    background: linear-gradient(#d8bb8a 0 2px, #b08a57 2px 4px, #e0c797 4px 7px, #a67f4d 7px 9px, #d2b382 9px 12px);
  }
  .badge {
    position: absolute; z-index: 5; width: 30px; height: 30px; margin: -9px 0 0 -21px;
    display: grid; place-items: center; border-radius: 50%;
    font-weight: 800; font-size: 17px; letter-spacing: -0.06em; color: #fff;
    border: 2.5px solid #fff; box-shadow: 0 3px 8px rgba(21, 25, 54, 0.35);
    animation: pop 260ms var(--spring) both; pointer-events: none;
  }
  .badge.good { background: var(--good); }
  .badge.bad { background: var(--bad); border-radius: 9px; }
  .badge.warn { background: var(--sun); color: #3d2800; border-radius: 9px; }
</style>
