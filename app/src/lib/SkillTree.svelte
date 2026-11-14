<script lang="ts">
  // An opening as a skill tree, growing sideways: the position is the root on the left,
  // each of your moves is a node, the opponent's replies are the curved edges between them.
  // Main branches have their own colour and light up as you learn them. Three levels of
  // your moves show at a time; deeper parts fold into "+N" nodes you can step into.
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { branchName, type TreeMove } from './model.svelte';

  interface Props {
    roots: TreeMove[];
    rootName: string;
    rootMove?: string;
    onexplore: (m: TreeMove) => void;
    ondrill: (m: TreeMove) => void;
  }
  let { roots, rootName, rootMove = '', onexplore, ondrill }: Props = $props();

  const PALETTE = ['#34e08f', '#f6c445', '#ff5c4d', '#6f8dff', '#c07bff', '#2fd0e0', '#ff8ad0', '#9be04a'];
  const TRUNK = '#e8d3a8';
  const LEVELS = 3; // levels of your moves shown at once
  const COL = 96, ROW = 58, GROUP = 54, X0 = 8, Y0 = 18, R = 21;
  const STAGE_LEVEL: Record<string, number> = { new: 0, learning: 1, young: 2, mature: 3 };
  const STAGE_NAME: Record<string, string> = { new: 'Not learned yet', learning: 'Learning', young: 'Young', mature: 'Mature' };

  type Step = { n: TreeMove; reply: TreeMove | null };
  /** your next moves from a move, each through one opponent reply */
  function next(m: TreeMove): Step[] {
    if (m.mine) return m.children.flatMap((r): Step[] => (r.mine ? [{ n: r, reply: null }] : r.children.filter((c) => c.mine).map((c) => ({ n: c, reply: r }))));
    return m.children.filter((c) => c.mine).map((c) => ({ n: c, reply: m }));
  }
  const top = $derived(roots.flatMap((r): Step[] => (r.mine ? [{ n: r, reply: null }] : r.children.filter((c) => c.mine).map((c) => ({ n: c, reply: r })))));
  const lit = (m: TreeMove) => m.stage !== null && m.stage !== 'new';
  const learned = (m: TreeMove) => m.sum.total - m.sum.stages[0];
  const family = $derived(rootName.split(':')[0]);
  function shortName(n: string) {
    const s = n.startsWith(family + ': ') ? n.slice(family.length + 2) : n;
    return s.length > 40 ? s.slice(0, 39) + '…' : s;
  }

  /** a section title: the most specific part of the name, e.g. "Fried Liver Attack" */
  function sectionTitle(n: string, parent: string) {
    if (n === parent || !n) return shortName(n || parent);
    const tail = n.split(/: |, /).at(-1)!;
    return tail.length > 30 ? tail.slice(0, 29) + '…' : tail;
  }

  // every move keeps the colour and name of the main branch it grows from
  const paint = $derived.by(() => {
    const colour = new Map<TreeMove, string>();
    const name = new Map<TreeMove, string>();
    let split: Step[] = top;
    const trunk: TreeMove[] = [];
    while (split.length === 1) { trunk.push(split[0].n); split = next(split[0].n); }
    for (const t of trunk) { colour.set(t, TRUNK); name.set(t, rootName); }
    const walk = (s: Step, c: string, nm: string) => {
      colour.set(s.n, c);
      // a deeper name replaces its parent's only when it is more specific
      let own = nm;
      if (s.reply) { const b = branchName(s.reply, nm)[1]; if (b && b !== nm && b.length > nm.length && b.split(':')[0] === nm.split(':')[0]) own = b; }
      name.set(s.n, own);
      for (const k of next(s.n)) walk(k, c, own);
    };
    split.forEach((s, i) => walk(s, PALETTE[i % PALETTE.length], s.reply ? branchName(s.reply, rootName)[1] : rootName));
    return { colour, name };
  });
  const colourOf = (m: TreeMove) => paint.colour.get(m) ?? TRUNK;
  const nameOf = (m: TreeMove) => paint.name.get(m) ?? rootName;

  // focus: the move the view grows from (null = the opening itself)
  let trail = $state<TreeMove[]>([]);
  const focus = $derived(trail.at(-1) ?? null);
  let sel = $state<TreeMove | null>(null);

  interface V { m: TreeMove; reply: TreeMove | null; x: number; y: number; depth: number; parent: V | null; more: number }
  interface G { label: string; learned: number; total: number; colour: string; y: number }
  const view = $derived.by(() => {
    const first = focus ? next(focus) : top;
    const nodes: V[] = [];
    const groups: G[] = [];
    let y = Y0;
    const place = (s: Step, depth: number, parent: V | null): V => {
      const v: V = { m: s.n, reply: s.reply, x: X0 + depth * COL, y: 0, depth, parent, more: 0 };
      nodes.push(v);
      const kids = next(s.n);
      if (depth < LEVELS && kids.length) {
        const placed = kids.map((k) => place(k, depth + 1, v));
        v.y = (placed[0].y + placed[placed.length - 1].y) / 2;
      } else {
        v.more = kids.length ? s.n.sum.total - 1 : 0;
        v.y = y + ROW / 2;
        y += ROW;
      }
      return v;
    };
    const parentName = focus ? nameOf(focus) : rootName;
    for (const s of first) {
      const nm = s.reply ? branchName(s.reply, parentName)[1] : nameOf(s.n);
      groups.push({ label: sectionTitle(nm, parentName), learned: learned(s.n), total: s.n.sum.total, colour: colourOf(s.n), y: y + 4 });
      y += GROUP;
      place(s, 1, null);
      y += 10;
    }
    return { nodes, groups, h: y + 20 };
  });
  const W = X0 + LEVELS * COL + R + 56;

  const curve = (x1: number, y1: number, x2: number, y2: number) => { const mx = (x1 + x2) / 2; return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`; };
  const radius = (m: TreeMove) => (m.stage === 'mature' ? R + 3 : R);
  const moveNo = (m: TreeMove) => (m.ply % 2 === 0 ? `${m.ply / 2 + 1}.` : `${(m.ply + 1) / 2}…`);
  function enter(m: TreeMove) { trail = [...trail, m]; sel = null; }
  function back(i: number) { trail = trail.slice(0, i); sel = null; }
</script>

<div class="wrap">
  <nav class="trail" aria-label="Where you are in the tree">
    <button class:on={!trail.length} onclick={() => back(0)}>{rootMove || 'Start'}</button>
    {#each trail as t, i}
      <span class="sep">›</span><button class:on={i === trail.length - 1} onclick={() => back(i + 1)} style="--c:{colourOf(t)}">{moveNo(t)}{t.san}</button>
    {/each}
  </nav>

  {#key focus}
    <div class="canvas" in:fly={{ x: 40, duration: 260, easing: cubicOut }}>
      <svg width={W} height={view.h} viewBox="0 0 {W} {view.h}" role="img" aria-label="Skill tree of {rootName}">
        <defs>
          <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <!-- branch names and counts -->
        {#each view.groups as g}
          <text x={16} y={g.y + 14} class="gl" fill={g.colour}>{g.label.toUpperCase()}</text>
          <text x={16} y={g.y + 40} class="gc" fill={g.colour}>{g.learned}<tspan class="of">/{g.total} learned</tspan></text>
        {/each}
        <!-- edges, dim first, lit on top -->
        {#each [false, true] as on}
          {#each view.nodes as v}
            {@const l = lit(v.m)}
            {#if l === on}
              {@const px = v.parent ? v.parent.x : 0}
              {@const py = v.parent ? v.parent.y : v.y}
              <path d={curve(px, py, v.x, v.y)} fill="none" stroke={l ? colourOf(v.m) : '#3a3f5c'} stroke-width={l ? 5 : 2.2} stroke-linecap="round" />
            {/if}
          {/each}
        {/each}
        <!-- replies on the edges -->
        {#each view.nodes as v}
          {#if v.reply}
            {@const px = v.parent ? v.parent.x : 0}
            <g class="reply" transform="translate({v.parent ? px + (v.x - px) * 0.52 : v.x - R - 33} {v.y})">
              <rect x="-27" y="-10" width="54" height="20" rx="10" />
              <text y="4" text-anchor="middle">{v.reply.san} <tspan class="pc">{Math.round(v.reply.freq * 100)}%</tspan></text>
            </g>
          {/if}
        {/each}
        <!-- your moves -->
        {#each view.nodes as v}
          {@const m = v.m}
          {@const l = lit(m)}
          {@const c = colourOf(m)}
          <g class="node" transform="translate({v.x} {v.y})" role="button" tabindex="0"
            aria-label="{moveNo(m)}{m.san}: {STAGE_NAME[m.stage ?? 'new']}{m.lapses ? `, ${m.lapses} lapses` : ''}"
            onclick={() => (sel = sel === m ? null : m)} onkeydown={(e) => { if (e.key === 'Enter') sel = m; }}>
            {#if sel === m}<circle r={radius(m) + 8} fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 4" />{/if}
            {#if m.lapses}<circle r={radius(m) + 4.5} fill="none" stroke="#ff4a3d" stroke-width="3" />{/if}
            <circle r={radius(m)} fill={l ? c : '#1b1f38'} stroke={l ? c : '#4a5070'} stroke-width="2.2"
              opacity={l ? [0, 0.62, 0.84, 1][STAGE_LEVEL[m.stage ?? 'new']] : 1} filter={m.stage === 'mature' ? 'url(#glow)' : undefined} />
            <text y="4" text-anchor="middle" class="san" fill={l ? '#11142a' : '#a3a9c9'}>{m.san}</text>
            {#if l}
              <g transform="translate(0 {radius(m) + 1})">
                <rect x="-13" y="-7" width="26" height="14" rx="7" fill="#11142a" stroke={c} stroke-width="1.3" />
                <text y="3.5" text-anchor="middle" class="lvl" fill={c}>{STAGE_LEVEL[m.stage ?? 'new']}/3</text>
              </g>
            {/if}
          </g>
          {#if v.more}
            <g class="more" transform="translate({v.x + radius(m) + 6} {v.y})" role="button" tabindex="0" aria-label="{v.more} more moves below {m.san}, open them"
              onclick={() => enter(m)} onkeydown={(e) => { if (e.key === 'Enter') enter(m); }}>
              <rect x="0" y="-13" width="42" height="26" rx="13" stroke={learned(m) > (lit(m) ? 1 : 0) ? c : '#4a5070'} />
              <text x="21" y="4.5" text-anchor="middle" fill={learned(m) > (lit(m) ? 1 : 0) ? c : '#a3a9c9'}>+{v.more}</text>
            </g>
          {:else if m.joins}
            <text x={v.x + radius(m) + 6} y={v.y + 4} class="joins">↪</text>
          {/if}
        {/each}
      </svg>
    </div>
  {/key}

  {#if sel}
    {@const m = sel}
    {@const c = colourOf(m)}
    <div class="info" style="--c:{c}" role="dialog" aria-label="{m.san}">
      <div class="it">
        <span class="mv" class:lit={lit(m)}>{moveNo(m)}{m.san}</span>
        <span class="grow">
          <b class="t-name">{shortName(nameOf(m))}</b>
          <small>{STAGE_NAME[m.stage ?? 'new']}{m.lapses ? ` · ${m.lapses} lapse${m.lapses === 1 ? '' : 's'}` : ''} · {learned(m)}/{m.sum.total} learned from here{m.joins ? ' · continues in another line' : ''}</small>
        </span>
        <button class="x" onclick={() => (sel = null)} aria-label="Close">×</button>
      </div>
      <div class="ib">
        <button onclick={() => onexplore(m)}>Explore</button>
        <button onclick={() => ondrill(m)}>Drill</button>
        {#if next(m).length}<button onclick={() => enter(m)}>Go deeper</button>{/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .wrap { margin: 0 -16px; background: radial-gradient(140% 60% at 0% 30%, #1d2045 0%, #0d1024 55%, #090b1a 100%); min-height: 60dvh; }
  .trail { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: 4px; overflow-x: auto; padding: 10px 16px; background: rgba(13, 16, 36, 0.94); backdrop-filter: blur(6px); scrollbar-width: none; }
  .trail::-webkit-scrollbar { display: none; }
  .trail button { flex: none; height: 36px; padding: 0 12px; border-radius: 12px; font-weight: 700; font-size: 14px; color: #c9cde6; background: #1b1f38; }
  .trail button.on { background: var(--c, #e8d3a8); color: #11142a; }
  .trail .sep { color: #5a6088; }
  .canvas { overflow-x: auto; padding-bottom: 120px; }
  svg { display: block; }
  .node { cursor: pointer; outline: none; }
  .san { font: 700 12px var(--sans); letter-spacing: -0.02em; pointer-events: none; }
  .lvl { font: 700 9px var(--sans); pointer-events: none; }
  .reply { pointer-events: none; }
  .reply rect { fill: #0d1024; stroke: #3a4062; stroke-width: 1; }
  .reply text { font: 600 10.5px var(--sans); fill: #d6d9ee; }
  .reply .pc { fill: #8a90b4; font-weight: 500; }
  .gl { font: 650 12px var(--sans); letter-spacing: 0.11em; }
  .gc { font: 800 24px var(--sans); }
  .gc .of { font-size: 12px; font-weight: 600; opacity: 0.75; letter-spacing: 0.02em; }
  .more { cursor: pointer; }
  .more rect { fill: #11142a; stroke-width: 1.6; }
  .more text { font: 800 12px var(--sans); }
  .joins { font: 700 14px var(--sans); fill: #8a90b4; }
  .info { position: fixed; z-index: 30; left: 12px; right: 12px; bottom: calc(env(safe-area-inset-bottom) + 92px); background: rgba(17, 20, 42, 0.97); border: 1.5px solid var(--c); border-radius: 18px; padding: 12px; color: #e8eaf6; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5); animation: rise 200ms var(--ease) both; }
  .it { display: flex; align-items: center; gap: 12px; }
  .mv { flex: none; min-width: 58px; height: 44px; padding: 0 10px; border-radius: 22px; display: grid; place-items: center; font-weight: 800; font-size: 15px; background: #1b1f38; border: 2px solid #4a5070; }
  .mv.lit { background: var(--c); border-color: var(--c); color: #11142a; }
  .it b { display: block; font-size: 17px; font-weight: 500; line-height: 1.15; }
  .it small { font-size: 12.5px; color: #a7acc9; }
  .x { width: 40px; height: 40px; font-size: 24px; color: #a7acc9; flex: none; }
  .ib { display: flex; gap: 8px; margin-top: 10px; }
  .ib button { flex: 1; min-height: 44px; border-radius: 13px; background: #23284a; font-weight: 700; font-size: 14px; }
  .ib button:first-child { background: var(--c); color: #11142a; }
</style>
