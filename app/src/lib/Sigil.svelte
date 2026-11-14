<script lang="ts">
  // An opening's sigil: the path its first moves trace across the board, inlaid in a birch tile.
  import { squaresOf } from './demo';
  interface Props { path: string[]; hue?: string; size?: number; flip?: boolean; bare?: boolean; draw?: boolean }
  let { path, hue = '#2b4bee', size = 56, flip = false, bare = false, draw = false }: Props = $props();

  const segs = $derived(
    squaresOf(path).map(([a, b], i) => {
      const xy = (s: string) => {
        const f = s.charCodeAt(0) - 97, r = +s[1] - 1;
        return [(flip ? 7 - f : f) * 10 + 5, (flip ? r : 7 - r) * 10 + 5];
      };
      const [x1, y1] = xy(a), [x2, y2] = xy(b);
      return { x1, y1, x2, y2, white: i % 2 === 0, i };
    })
  );
</script>

<svg viewBox="0 0 80 80" width={size} height={size} class:bare class:draw role="img" aria-label="Opening sigil">
  {#if !bare}<rect width="80" height="80" rx="14" fill="var(--birch)" />{/if}
  <g opacity={bare ? 0.16 : 0.5}>
    {#each Array(8) as _, y}{#each Array(8) as _, x}
      {#if (x + y) % 2 === 1}<rect x={x * 10} y={y * 10} width="10" height="10" fill={bare ? 'currentColor' : 'var(--birch-2)'} />{/if}
    {/each}{/each}
  </g>
  {#each segs as s (s.i)}
    <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.white ? hue : 'var(--ink)'} stroke-width="3.6" stroke-linecap="round" pathLength="1" style="--i:{s.i}" />
    <circle cx={s.x2} cy={s.y2} r="3.3" fill={s.white ? hue : 'var(--ink)'} style="--i:{s.i}" />
  {/each}
</svg>

<style>
  svg { display: block; flex: none; border-radius: 18%; }
  svg.bare { border-radius: 0; }
  .draw line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 420ms var(--ease) forwards; animation-delay: calc(var(--i) * 110ms + 200ms); }
  .draw circle { transform-box: fill-box; transform-origin: center; transform: scale(0); animation: dot 260ms var(--spring) forwards; animation-delay: calc(var(--i) * 110ms + 480ms); }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @keyframes dot { to { transform: scale(1); } }
</style>
