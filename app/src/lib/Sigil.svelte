<script lang="ts">
  // An opening's sigil: the path its first moves trace across the board, inlaid in a birch tile.
  // Your moves are drawn in the opening's colour and your opponent's in ink, whichever side you play.
  // path is UCI from the start position
  interface Props { path: string[]; hue?: string; size?: number; flip?: boolean; bare?: boolean; draw?: boolean; you?: 'w' | 'b' }
  let { path, hue = '#2b4bee', size = 56, flip = false, bare = false, draw = false, you = 'w' }: Props = $props();

  const segs = $derived(
    path.map((u) => [u.slice(0, 2), u.slice(2, 4)] as const).map(([a, b], i) => {
      const xy = (s: string) => {
        const f = s.charCodeAt(0) - 97, r = +s[1] - 1;
        return [(flip ? 7 - f : f) * 10 + 5, (flip ? r : 7 - r) * 10 + 5];
      };
      const [x1, y1] = xy(a), [x2, y2] = xy(b);
      // only a knight moves one by two: draw it as its L, the long leg first
      const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
      const knight = (dx === 10 && dy === 20) || (dx === 20 && dy === 10);
      const d = knight ? `M${x1} ${y1}L${dy > dx ? `${x1} ${y2}` : `${x2} ${y1}`}L${x2} ${y2}` : `M${x1} ${y1}L${x2} ${y2}`;
      return { d, x2, y2, mine: (i % 2 === 0) === (you === 'w'), i };
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
    <path d={s.d} fill="none" stroke={s.mine ? hue : 'var(--ink-fixed)'} stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" pathLength="1" style="--i:{s.i}" />
    <circle cx={s.x2} cy={s.y2} r="3.3" fill={s.mine ? hue : 'var(--ink-fixed)'} style="--i:{s.i}" />
  {/each}
</svg>

<style>
  svg { display: block; flex: none; border-radius: 18%; }
  svg.bare { border-radius: 0; }
  .draw path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 420ms var(--ease) forwards; animation-delay: calc(var(--i) * 110ms + 200ms); }
  .draw circle { transform-box: fill-box; transform-origin: center; transform: scale(0); animation: dot 260ms var(--spring) forwards; animation-delay: calc(var(--i) * 110ms + 480ms); }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @keyframes dot { to { transform: scale(1); } }
</style>
