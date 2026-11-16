<script lang="ts">
  // A small skill tree, drawn like the app's (lib/SkillTree.svelte) from the same data: the Italian
  // Game as White, your answer to every reply played often enough. Tiles turn to birch as it scrolls in.
  import { inview } from '../lib/inview';
  import { desk } from '../lib/desk.svelte';
  import { demo, type TreeTile } from './demo';

  let { deep = true }: { deep?: boolean } = $props();
  const PALETTE = ['#34e08f', '#f6c445', '#ff7a6b', '#7f9bff', '#c58bff'];
  const W = 112, H = 44, COL = 158, ROW = 66;
  interface N extends TreeTile { x: number; y: number; colour: string; lit: number; folded: number }
  const layout = $derived.by(() => {
    const kids = (id: string | null) => demo.tree.filter((t) => t.parent === id);
    const out: N[] = [];
    let y = 0, order = 0;
    // like the app's tree it opens folded: the first branch to the end, the next ones less and less
    const opens = (t: TreeTile, bi: number, first: boolean) => (deep ? (t.depth === 1 && bi <= 2) || (t.depth === 2 && (bi === 0 || (bi === 1 && first))) : t.depth === 1 && bi <= 1);
    const place = (t: TreeTile, colour: string, open: boolean, bi = 0): number => {
      const ks = open ? kids(t.id) : [];
      const node: N = { ...t, x: t.depth * COL, y: 0, colour, lit: -1, folded: open ? 0 : t.kids };
      out.push(node);
      if (ks.length) { const ys = ks.map((k, i) => place(k, colour, opens(k, bi, i === 0), bi)); node.y = (ys[0] + ys.at(-1)!) / 2; }
      else { node.y = y; y += ROW; }
      return node.y;
    };
    const tops = kids(null).map((t, i) => { const at = place(t, PALETTE[i % PALETTE.length], opens(t, i, true), i); y += 10; return at; });
    // the first branch is learned to the end, the second is under way: the order tiles light up in
    const first = out.filter((n) => n.colour === PALETTE[0]), second = out.filter((n) => n.colour === PALETTE[1]).slice(0, 3);
    for (const n of [...first, ...second]) n.lit = order++;
    return { nodes: out, root: { x: 0, y: (tops[0] + tops.at(-1)!) / 2 }, w: Math.max(...out.map((n) => n.x)) + W + 56, h: y - 12 + 24 };
  });
  const elbow = (x1: number, y1: number, x2: number, y2: number) => {
    const tx = x2 - 16, dy = y2 - y1;
    if (Math.abs(dy) < 0.5) return `M${x1} ${y1}H${x2}`;
    const r = Math.min(9, Math.abs(dy) / 2), s = Math.sign(dy);
    return `M${x1} ${y1}H${tx - r}Q${tx} ${y1} ${tx} ${y1 + s * r}V${y2 - s * r}Q${tx} ${y2} ${tx + r} ${y2}H${x2}`;
  };
  const at = (id: string | null) => (id ? layout.nodes.find((n) => n.id === id)! : layout.root);
  let seen = $state(desk.still);
  const tail = (s: string) => { const t = s.split(/: |, /).at(-1)!; return t.length > 22 ? t.slice(0, 21) + '…' : t; };
</script>

<div class="mt" class:seen use:inview={{ on: (s) => { if (s) seen = true; }, once: true, threshold: 0.3 }}>
  <svg viewBox="{-W / 2 - 8} {-H / 2 - 30} {layout.w + 8} {layout.h + 40}" role="img" aria-label="Skill tree of the {demo.fan.name}: one tile for each of your moves, with the reply it answers above it">
    {#each layout.nodes as n (n.id)}
      {@const p = at(n.parent)}
      <path d={elbow(p.x + W / 2, p.y, n.x - W / 2, n.y)} fill="none" stroke={n.colour} stroke-width="2" stroke-opacity={n.lit >= 0 ? 0.9 : 0.35} stroke-linecap="round" />
    {/each}
    <g transform="translate({layout.root.x} {layout.root.y})">
      <rect x={-W / 2} y={-H / 2} width={W} height={H} rx="12" fill="#0d1024" stroke="#e8d3a8" stroke-width="2" />
      <text class="rootm" y="5.5" text-anchor="middle">3.Bc4</text>
    </g>
    {#each layout.nodes as n (n.id)}
      <g transform="translate({n.x} {n.y})" style="--c:{n.colour};--i:{n.lit}">
        {#if n.name}<text class="lab" x={-W / 2 + 2} y={-H / 2 - 8} fill={n.colour}>{tail(n.name)}</text>{/if}
        <rect class="face" x={-W / 2} y={-H / 2} width={W} height={H} rx="11" />
        <text class="rep" x={-W / 2 + 14} y="-6">{n.reply}<tspan dx="5" class="pc">{Math.round(n.replyPct)}%</tspan></text>
        <text class="san" x={-W / 2 + 14} y="13.5">{n.san}</text>
        {#if n.lit >= 0}
          <g class="lit">
            <rect x={-W / 2} y={-H / 2 + 5} width={W} height={H} rx="11" fill="#dcc08f" />
            <rect x={-W / 2} y={-H / 2 + 2.5} width={W} height={H} rx="11" fill="#a67f4d" />
            <rect x={-W / 2} y={-H / 2} width={W} height={H} rx="11" fill="#f1e0bf" />
            <rect x={-W / 2 + 5} y="-11" width="4" height="22" rx="2" fill={n.colour} />
            <text class="rep on" x={-W / 2 + 14} y="-6">{n.reply}<tspan dx="5">{Math.round(n.replyPct)}%</tspan></text>
            <text class="san on" x={-W / 2 + 14} y="13.5">{n.san}</text>
          </g>
        {/if}
        {#if n.folded}
          <g transform="translate({W / 2 - 6} 0)"><rect y="-11" width="30" height="22" rx="11" fill="#0d1024" stroke="#3d4577" stroke-width="1.5" /><text class="pill" x="15" y="3.8" text-anchor="middle">+{n.folded}</text></g>
        {/if}
      </g>
    {/each}
  </svg>
</div>

<style>
  .mt { width: 100%; }
  svg { display: block; width: 100%; height: auto; overflow: visible; }
  text { font-family: var(--sans); }
  .rootm { font-weight: 750; font-size: 16px; fill: #e8d3a8; }
  .lab { font-family: var(--serif); font-style: italic; font-weight: 500; font-size: 13px; }
  .face { fill: #141936; stroke: color-mix(in srgb, var(--c) 40%, #1c2248); stroke-width: 1.5; }
  .rep { font-weight: 600; font-size: 10.5px; fill: #8088b3; }
  .rep.on { fill: #6f4c2c; }
  .san { font-weight: 750; font-size: 15.5px; letter-spacing: -0.02em; fill: #aab0d2; }
  .san.on { fill: #151936; }
  .pill { font-weight: 750; font-size: 11px; fill: #aab0d2; }
  /* learned tiles lay themselves down one after another; only opacity and transform move */
  .lit { opacity: 0; transform: translateY(-8px); transition: opacity 380ms var(--ease), transform 480ms var(--spring); transition-delay: calc(var(--i) * 170ms + 250ms); }
  .seen .lit { opacity: 1; transform: none; }
</style>
