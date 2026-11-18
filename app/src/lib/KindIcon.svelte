<script lang="ts" module>
  import type { Kind } from './review';
  /** one colour per verdict, from the warm end (good) to red (bad); the glyph or icon always carries the meaning too */
  export const KIND_COLOR: Record<Kind, string> = {
    brilliant: '#1aa6b7', great: '#3f74e0', best: '#3fa34d', excellent: '#5bb04f', good: '#7a9b6e',
    book: '#a6825a', inaccuracy: '#e8b42f', mistake: '#ec8a2e', miss: '#e2604a', blunder: '#cf2f22'
  };
</script>

<script lang="ts">
  // A move's verdict in game review: a round badge with the annotation glyph (!!, !, ?!, ?, ??)
  // or a small icon where there is no glyph (best, excellent, good, book, miss). Drawn for Ply.
  let { kind, size = 22 }: { kind: Kind; size?: number } = $props();
  const GLYPH: Partial<Record<Kind, string>> = { brilliant: '!!', great: '!', inaccuracy: '?!', mistake: '?', blunder: '??' };
  const PATH: Partial<Record<Kind, string>> = {
    // a five-point star
    best: 'M12 5.2l2 4.1 4.5.6-3.3 3.1.8 4.5-4-2.2-4 2.2.8-4.5-3.3-3.1 4.5-.6z',
    // a thumb up
    excellent: 'M8.5 11v6.5h-2V11zM8.5 11l2.8-4.6c1 0 1.7.7 1.5 1.8l-.4 2h3.9a1.1 1.1 0 0 1 1.1 1.3l-.9 4.4a1.4 1.4 0 0 1-1.4 1.1H8.5',
    // a tick
    good: 'M7.5 12.4l3 3 6-6.4',
    // an open book
    book: 'M12 8.3C10.6 7.3 8.7 7 6.6 7v8.6c2.1 0 4 .3 5.4 1.3 1.4-1 3.3-1.3 5.4-1.3V7c-2.1 0-4 .3-5.4 1.3zM12 8.3v8.6',
    // a cross: the chance went by
    miss: 'M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8'
  };
  const glyph = $derived(GLYPH[kind]);
  const fillPath = $derived(kind === 'best');
</script>

<svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={kind}>
  <circle cx="12" cy="12" r="11" fill={KIND_COLOR[kind]} stroke="#fff" stroke-width="1.6" />
  {#if glyph}
    <text x="12" y="12.2" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size={glyph.length > 1 ? 10.5 : 13} font-weight="800" letter-spacing="-0.6" font-family="inherit">{glyph}</text>
  {:else}
    <path d={PATH[kind]} fill={fillPath ? '#fff' : 'none'} stroke="#fff" stroke-width={fillPath ? 0.6 : 2.1} stroke-linecap="round" stroke-linejoin="round" />
  {/if}
</svg>

<style>svg { display: block; flex: none; }</style>
