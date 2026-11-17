<script lang="ts">
  // An opening as a skill tree on a canvas you drag and pinch. It grows from the opening's
  // position to the right and down: a move's answers either stack below one another or sit
  // side by side on the row under it, whichever keeps the tree wide instead of tall. Each tile is one of your moves, with the reply it answers written
  // above it. A learned tile turns to birch and sits on one, two or four veneers as it goes
  // from learning to mature; the moves you can learn next are outlined in their branch colour.
  // Branches fold and unfold in place, and tapping a tile shows its position on a board.
  import { untrack } from 'svelte';
  import { branchName, LINE_COLOURS as PALETTE, type TreeMove } from './model.svelte';
  import { child, fenOf, type Side } from './chess';
  import type { Stage } from './srs/fsrs';
  import Board from './Board.svelte';
  import Plies from './Plies.svelte';
  import Icon from './Icon.svelte';
  import { desk } from './desk.svelte';

  interface Sum { total: number; stages: number[]; lapses: number }
  interface Props {
    roots: TreeMove[];
    rootName: string;
    rootMove?: string;
    side: Side;
    sum: Sum;
    /** moves still to learn below a move (null = the whole opening) */
    newCount: (m: TreeMove | null) => number;
    onexplore: (m: TreeMove) => void;
    ondrill: (m: TreeMove | null) => void;
    onlearn: (m: TreeMove | null) => void;
    onplay: (m: TreeMove) => void;
  }
  let { roots, rootName, rootMove = '', side, sum, newCount, onexplore, ondrill, onlearn, onplay }: Props = $props();

  const TRUNK = '#e8d3a8';
  const W = 112, H = 44, COL = 164, ROW = 68, GAP = 22, PLY = 2.5;
  const KMIN = 0.1, KMAX = 1.6, MS = 300;
  // a row of answers under a move: how far down it sits, its indent, and the gap between neighbours
  const HROW = 86, IN = 36, HGAP = 8, LEFT = W / 2 + 16, BUS = 36;
  /** the shape a part of the tree aims for, width over height */
  const ASPECT = 1.6;
  /** the smallest zoom at which a tile can still be read */
  const READ = 0.5;
  const NAV = 0; // the tree has the whole screen: the tab bar is hidden here
  const TOP = 60; // the row of tools over the canvas
  const PLIES: Record<string, number> = { new: 0, learning: 1, young: 2, mature: 4 };
  const STAGE_NAME: Record<string, string> = { new: 'Not learned yet', learning: 'Learning', young: 'Young', mature: 'Mature' };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- the tree
  type Step = { n: TreeMove; reply: TreeMove | null };
  /** your next moves from a move, each through one opponent reply */
  function next(m: TreeMove): Step[] {
    if (m.mine) return m.children.flatMap((r): Step[] => (r.mine ? [{ n: r, reply: null }] : r.children.filter((c) => c.mine).map((c) => ({ n: c, reply: r }))));
    return m.children.filter((c) => c.mine).map((c) => ({ n: c, reply: m }));
  }
  const lit = (m: TreeMove) => m.stage !== null && m.stage !== 'new';
  const learned = (m: TreeMove) => m.sum.total - m.sum.stages[0];
  const family = $derived(rootName.split(':')[0]);
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const shortName = (n: string) => (n.startsWith(family + ': ') ? n.slice(family.length + 2) : n);
  /** the most specific part of a name, e.g. "Fried Liver Attack" */
  const tail = (n: string) => clip(n.split(/: |, /).at(-1)!, 24);

  interface N {
    id: string; m: TreeMove; reply: TreeMove | null; depth: number; parent: N | null; kids: N[];
    colour: string; name: string; label: string; state: 'lit' | 'next' | 'far';
  }
  const tree = $derived.by(() => {
    const all = new Map<string, N>();
    let deepest = 0;
    // a move keeps the colour of the main branch it grows from; the trunk before the first split stays birch
    const grow = (steps: Step[], depth: number, parent: N | null, colour: string | null, name: string): N[] =>
      steps.map((s, i) => {
        const split = colour === null && steps.length > 1;
        const c = colour ?? (split ? PALETTE[i % PALETTE.length] : null);
        // a deeper name replaces its parent's only when it is more specific
        let own = name;
        if (s.reply) {
          const b = branchName(s.reply, name)[1];
          if (b && b !== name && (split || (b.length > name.length && b.split(':')[0] === name.split(':')[0]))) own = b;
        }
        const state = lit(s.n) ? 'lit' : !parent || parent.state === 'lit' ? 'next' : 'far';
        const n: N = { id: [...s.n.path, s.n.uci].join(' '), m: s.n, reply: s.reply, depth, parent, kids: [], colour: c ?? TRUNK, name: own, label: own !== name ? tail(own) : '', state };
        all.set(n.id, n);
        deepest = Math.max(deepest, depth);
        n.kids = grow(next(s.n), depth + 1, n, c, own);
        return n;
      });
    const first = roots.flatMap((r): Step[] => (r.mine ? [{ n: r, reply: null }] : r.children.filter((c) => c.mine).map((c) => ({ n: c, reply: r }))));
    return { top: grow(first, 1, null, null, rootName), all, deepest };
  });

  // which branches are unfolded: at first only what you have learned, so the tree opens on its main branches
  const firstOpen = () => new Set([...tree.all.values()].filter((n) => n.kids.length && (n.state === 'lit' || (n.depth === 1 && tree.top.length === 1))).map((n) => n.id));
  let open = $state.raw(untrack(firstOpen));

  interface P { x: number; y: number }
  /** a move with everything unfolded below it: its size, and whether its answers sit in a row under it */
  interface Box { id: string; n: N | null; w: number; h: number; row: boolean; kids: Box[] }
  const layout = $derived.by(() => {
    // Each part of the tree is given a shape to aim for. Stacking k answers makes a part k times
    // taller and putting them in a row makes it k times wider, so the answers are asked for the
    // opposite: wide ones to stack, tall ones to stand in a row. Both ways are tried, top down.
    const measure = (id: string, n: N | null, kids: N[], aim: number): Box => {
      if (!kids.length) return { id, n, w: COL, h: ROW, row: false, kids: [] };
      const sub = (k: N, a: number) => measure(k.id, k, k.kids.length && open.has(k.id) ? k.kids : [], Math.min(8, Math.max(0.2, a)));
      const st = kids.map((k) => sub(k, aim * kids.length));
      const sw = COL + Math.max(...st.map((b) => b.w)), sh = st.reduce((a, b) => a + b.h, 0);
      const stacked: Box = { id, n, w: sw, h: sh, row: false, kids: st };
      if (kids.length < 2) return stacked;
      const rs = kids.map((k) => sub(k, aim / kids.length));
      const rw = Math.max(COL, IN + rs.reduce((a, b) => a + b.w, 0) + HGAP * (rs.length - 1)), rh = HROW + Math.max(...rs.map((b) => b.h));
      const off = (w: number, h: number) => Math.abs(Math.log(w / h / aim));
      // a row has to be clearly better: a stack reads more easily
      return off(rw, rh) < off(sw, sh) - 0.15 ? { id, n, w: rw, h: rh, row: true, kids: rs } : stacked;
    };
    const pos = new Map<string, P>();
    const vis: N[] = [];
    const rows = new Set<string>();
    const place = (b: Box, x: number, y: number) => {
      pos.set(b.id, { x, y });
      if (b.n) vis.push(b.n);
      if (b.row) { rows.add(b.id); let cx = x + IN; for (const k of b.kids) { place(k, cx, y + HROW); cx += k.w + HGAP; } }
      else { let cy = y; for (const k of b.kids) { place(k, x + COL, cy); cy += k.h; } }
    };
    place(measure('root', null, tree.top, ASPECT), 0, 0);
    const ps = [...pos.values()];
    return { pos, vis, rows, box: { x0: -W / 2, y0: -H / 2 - 22, x1: Math.max(...ps.map((q) => q.x)) + W / 2 + 40, y1: Math.max(...ps.map((q) => q.y)) + H / 2 + 14 } };
  });

  // positions on screen follow the layout with a short ease, so a branch unfolds out of its parent
  let disp = $state.raw(new Map<string, P & { o: number }>());
  let started = false;
  $effect(() => {
    const target = layout.pos;
    const from = untrack(() => disp);
    const settle = () => { disp = new Map([...target].map(([id, p]) => [id, { ...p, o: 1 }])); };
    if (!started || reduce) { started = true; settle(); return; }
    const origin = (id: string): P & { o: number } => {
      for (let n = tree.all.get(id)?.parent; n; n = n.parent) { const p = from.get(n.id); if (p) return { ...p, o: 0 }; }
      return { ...(from.get('root') ?? target.get(id)!), o: 0 };
    };
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - t0) / MS), e = 1 - (1 - t) ** 3;
      if (t >= 1) return settle();
      disp = new Map([...target].map(([id, p]) => { const s = from.get(id) ?? origin(id); return [id, { x: s.x + (p.x - s.x) * e, y: s.y + (p.y - s.y) * e, o: s.o + (1 - s.o) * e }]; }));
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  });
  const at = (id: string) => disp.get(id) ?? { ...layout.pos.get(id)!, o: 1 };

  // ---------------------------------------------------------------- the view: drag, pinch, wheel
  let el = $state<HTMLDivElement>();
  let vw = $state(0), vh = $state(0), sheetH = $state(0);
  let view = $state.raw({ x: 0, y: 0, k: 1 });
  const clampK = (k: number) => Math.min(KMAX, Math.max(KMIN, k));
  /** keep a good part of the tree on screen */
  function bound(v: { x: number; y: number; k: number }) {
    const b = layout.box, m = 90;
    return { k: v.k, x: Math.min(vw - m - b.x0 * v.k, Math.max(m - b.x1 * v.k, v.x)), y: Math.min(vh - sheetH - NAV - m - b.y0 * v.k, Math.max(m - b.y1 * v.k, v.y)) };
  }
  let vraf = 0;
  function glide(to: { x: number; y: number; k: number }) {
    cancelAnimationFrame(vraf);
    to = bound(to);
    if (reduce) { view = to; return; }
    const s = view, t0 = performance.now();
    vraf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - t0) / MS), e = 1 - (1 - t) ** 3;
      view = { x: s.x + (to.x - s.x) * e, y: s.y + (to.y - s.y) * e, k: s.k + (to.k - s.k) * e };
      if (t < 1) vraf = requestAnimationFrame(tick);
    });
  }
  // desktop: the sheet is a panel on the right, so the tree keeps its height and gives up some width
  const PANEL = 372;
  const uw = () => vw - (desk.on ? PANEL : 0);
  /** the part of the canvas the sheet does not cover */
  const clear = () => Math.max(160, vh - (desk.on ? 0 : sheetH) - NAV - 14);
  function fit() {
    const b = layout.box, pad = 18, room = clear() - TOP;
    const k = clampK(Math.min((uw() - pad * 2) / (b.x1 - b.x0), (room - pad * 2) / (b.y1 - b.y0), 1.1));
    glide({ k, x: (uw() - (b.x0 + b.x1) * k) / 2, y: TOP + (room - (b.y0 + b.y1) * k) / 2 });
  }
  /** everything unfolded: the whole tree if its moves can still be read at that size, otherwise from its first move */
  function overview() {
    const b = layout.box, room = clear() - TOP;
    const all = Math.min((uw() - 36) / (b.x1 - b.x0), (room - 36) / (b.y1 - b.y0), 1.1);
    if (all >= READ) return fit();
    glide({ k: READ, x: 18 - b.x0 * READ, y: TOP + 18 - b.y0 * READ });
  }
  /** where you start: the whole tree when it is readable at that size, otherwise the moves you can learn next */
  function start() {
    const b = layout.box, room = clear() - TOP;
    const all = Math.min((uw() - 36) / (b.x1 - b.x0), (room - 28) / (b.y1 - b.y0), 1);
    if (all >= 0.72) return { k: all, x: (uw() - (b.x0 + b.x1) * all) / 2, y: TOP + (room - (b.y0 + b.y1) * all) / 2 };
    // a readable size, with the first move you can learn next a little left of the middle
    const k = Math.min(1, Math.max(0.7, uw() / 520));
    const n = layout.vis.find((v) => v.state === 'next') ?? layout.vis[0];
    const p = layout.pos.get(n?.id ?? 'root')!;
    return { k, x: uw() * 0.4 - p.x * k, y: TOP + room * 0.45 - p.y * k };
  }
  let placed = false;
  $effect(() => { if (!placed && vw && vh && sheetH) { placed = true; untrack(() => (view = bound(start()))); } });

  function zoomAt(cx: number, cy: number, k: number) {
    k = clampK(k);
    const r = k / view.k;
    view = bound({ k, x: cx - (cx - view.x) * r, y: cy - (cy - view.y) * r });
  }
  const pts = new Map<number, P>();
  let moved = false;
  function down(e: PointerEvent) {
    cancelAnimationFrame(vraf);
    if (pts.size === 0) moved = false;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  function move(e: PointerEvent) {
    const p = pts.get(e.pointerId);
    if (!p || !el) return;
    if (pts.size === 1) {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      if (!moved) { moved = true; el.setPointerCapture(e.pointerId); }
      p.x = e.clientX; p.y = e.clientY;
      view = bound({ k: view.k, x: view.x + dx, y: view.y + dy });
    } else if (pts.size === 2) {
      const o = [...pts.values()].find((q) => q !== p)!;
      const r = el.getBoundingClientRect();
      const d0 = Math.hypot(p.x - o.x, p.y - o.y), mx0 = (p.x + o.x) / 2, my0 = (p.y + o.y) / 2;
      p.x = e.clientX; p.y = e.clientY;
      const d1 = Math.hypot(p.x - o.x, p.y - o.y), mx = (p.x + o.x) / 2, my = (p.y + o.y) / 2;
      moved = true;
      view = { ...view, x: view.x + mx - mx0, y: view.y + my - my0 };
      if (d0 > 0) zoomAt(mx - r.left, my - r.top, view.k * (d1 / d0));
    }
  }
  const up = (e: PointerEvent) => { pts.delete(e.pointerId); };
  $effect(() => {
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(vraf);
      const r = el!.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, view.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el?.removeEventListener('wheel', wheel);
  });

  // keyboard: arrows pan, + and - zoom at the centre, 0 fits the tree, Escape lets go of a tile
  $effect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const pan: Record<string, [number, number]> = { ArrowLeft: [90, 0], ArrowRight: [-90, 0], ArrowUp: [0, 90], ArrowDown: [0, -90] };
      if (pan[e.key]) { e.preventDefault(); glide({ k: view.k, x: view.x + pan[e.key][0], y: view.y + pan[e.key][1] }); }
      else if (e.key === '+' || e.key === '=') zoomBy(ZOOM);
      else if (e.key === '-' || e.key === '_') zoomBy(1 / ZOOM);
      else if (e.key === '0') fit();
      else if (e.key === 'Escape' && selId) { e.preventDefault(); selId = null; }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  const ZOOM = 1.4;
  /** zoom about the middle of the part of the canvas you can see */
  function zoomBy(f: number) {
    const k = clampK(view.k * f), r = k / view.k, cx = uw() / 2, cy = (TOP + clear()) / 2;
    glide({ k, x: cx - (cx - view.x) * r, y: cy - (cy - view.y) * r });
  }

  // ---------------------------------------------------------------- selecting and folding
  let selId = $state<string | null>(null);
  const sel = $derived(selId ? tree.all.get(selId) ?? null : null);
  /** the opening's totals and chapters over Learn and Drill: put away until you ask for them */
  let showBook = $state(false);

  /** bring a tile into the part of the canvas that is free, moving as little as possible */
  function reveal(p: P, sheet: number, room = 0) {
    const k = view.k, hw = (W / 2) * k, bottom = Math.max(160, vh - (desk.on ? 0 : sheet) - NAV - 14);
    const sx = p.x * k + view.x, sy = p.y * k + view.y;
    const maxX = Math.max(hw + 12, uw() - hw - 14 - room * k);
    const tx = Math.min(maxX, Math.max(hw + 12, sx)), ty = Math.min(bottom - 40 * k, Math.max(TOP + 40 * k, sy));
    return { k, x: view.x + tx - sx, y: view.y + ty - sy };
  }
  function pick(n: N) {
    if (moved) return;
    if (selId === n.id) { selId = null; return; }
    selId = n.id;
    glide(reveal(layout.pos.get(n.id)!, 262));
  }
  function toggle(n: N, e?: Event) {
    e?.stopPropagation();
    if (moved) return;
    const before = layout.pos.get(n.id)!;
    const s = new Set(open);
    if (s.has(n.id)) s.delete(n.id); else s.add(n.id);
    open = s;
    // the tile you tapped stays under your finger while the rest rearranges around it
    const after = layout.pos.get(n.id)!;
    const kept = { k: view.k, x: view.x - (after.x - before.x) * view.k, y: view.y - (after.y - before.y) * view.k };
    const sx = after.x * kept.k + kept.x;
    const want = s.has(n.id) ? Math.max((W / 2) * kept.k + 12, Math.min(sx, uw() - (COL + W / 2 + 18) * kept.k)) : sx;
    glide({ ...kept, x: kept.x + want - sx });
  }
  // every line unfolded, or back to the main branches and what you have learned
  const unfoldable = $derived([...tree.all.values()].filter((n) => n.kids.length).map((n) => n.id));
  const allOpen = $derived(unfoldable.length > 0 && unfoldable.every((id) => open.has(id)));
  const canUnfold = $derived(allOpen || unfoldable.some((id) => !open.has(id)));
  function expandAll() {
    selId = null;
    if (allOpen) { open = firstOpen(); glide(start()); }
    else { open = new Set(unfoldable); overview(); }
  }
  function ground() { if (!moved) selId = null; }
  const key = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

  // ---------------------------------------------------------------- drawing
  const moveNo = (m: TreeMove) => (m.ply % 2 === 0 ? `${m.ply / 2 + 1}.` : `${(m.ply + 1) / 2}…`);
  const pct = (f: number) => (f < 0.01 ? '<1%' : `${Math.round(f * 100)}%`);
  const pillText = (n: N) => (open.has(n.id) ? '–' : `+${n.m.sum.total - 1}`);
  const pillW = (n: N) => (open.has(n.id) ? 22 : 13 + 6.4 * pillText(n).length);
  /** a right-angled connector with rounded corners: out of the parent, along a shared trunk, into the child */
  function elbow(x1: number, y1: number, x2: number, y2: number) {
    const tx = x2 - 16, dy = y2 - y1;
    if (Math.abs(dy) < 0.5) return `M${x1} ${y1}H${x2}`;
    const r = Math.min(9, Math.abs(dy) / 2), s = Math.sign(dy);
    return `M${x1} ${y1}H${tx - r}Q${tx} ${y1} ${tx} ${y1 + s * r}V${y2 - s * r}Q${tx} ${y2} ${tx + r} ${y2}H${x2}`;
  }
  /** to an answer in the row below: down from under the move, along the row's rail, and into the tile from its left */
  function hook(ax: number, ay: number, bx: number, by: number) {
    const x1 = ax - W / 2 + IN - 16, x2 = bx - LEFT, top = ay + H / 2, rail = Math.min(ay + BUS, by), end = bx - W / 2;
    const r2 = Math.max(0, Math.min(9, (by - rail) / 2, (end - x2) / 2));
    if (Math.abs(x2 - x1) < 1) { const r = Math.max(0, Math.min(9, (by - top) / 2)); return `M${x1} ${top}V${by - r}Q${x1} ${by} ${x1 + r} ${by}H${end}`; }
    const s = Math.sign(x2 - x1), r1 = Math.max(0, Math.min(9, (rail - top) / 2, Math.abs(x2 - x1) / 2)), r3 = Math.min(r1, r2);
    return `M${x1} ${top}V${rail - r1}Q${x1} ${rail} ${x1 + s * r1} ${rail}H${x2 - s * r3}Q${x2} ${rail} ${x2} ${rail + r3}V${by - r2}Q${x2} ${by} ${x2 + r2} ${by}H${end}`;
  }
  const edges = $derived(layout.vis.map((n) => {
    const pid = n.parent?.id ?? 'root';
    const a = at(pid), b = at(n.id);
    if (layout.rows.has(pid)) return { n, d: hook(a.x, a.y, b.x, b.y), o: b.o };
    const out = a.x + W / 2 + (n.parent ? pillW(n.parent) - 6 : 0);
    return { n, d: elbow(out, a.y, b.x - W / 2, b.y), o: b.o };
  }));
  const tf = $derived(`translate(${view.x} ${view.y}) scale(${view.k})`);
</script>

<div class="tree">
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="canvas" bind:this={el} bind:clientWidth={vw} bind:clientHeight={vh}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onclick={ground}>
    <svg width={vw} height={vh} role="group" aria-label="Skill tree of {rootName}">
      <defs>
        <pattern id="st-dots" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform={tf}>
          <circle cx="14" cy="14" r="1.3" fill="#2a3160" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#st-dots)" />
      <g transform={tf}>
        <!-- connectors: quiet ones first, the learned path on top -->
        {#each [false, true] as on}
          {#each edges as e (e.n.id)}
            {#if (e.n.state === 'lit') === on}
              <path d={e.d} fill="none" opacity={e.o} stroke-linecap="round"
                stroke={e.n.colour} stroke-opacity={on ? 1 : e.n.state === 'next' ? 0.5 : 0.24} stroke-width={on ? 3.5 : 2} />
            {/if}
          {/each}
        {/each}

        <!-- where the tree starts -->
        <g transform="translate({at('root').x} {at('root').y})" class="root">
          <rect x={-W / 2} y={-H / 2} width={W} height={H} rx="12" />
          <text y="5.5" text-anchor="middle">{rootMove || 'Start'}</text>
        </g>

        {#each layout.vis as n (n.id)}
          {@const m = n.m}
          {@const p = at(n.id)}
          {@const plies = PLIES[m.stage ?? 'new']}
          <g transform="translate({p.x} {p.y})" opacity={p.o}>
            {#if n.label}<text class="lab" x={-W / 2 + 2} y={-H / 2 - 8} fill={n.colour}>{n.label}</text>{/if}
            <g class="tile {n.state}" role="button" tabindex="0" style="--c:{n.colour}"
              aria-label="{moveNo(m)}{m.san}{n.reply ? ` after ${n.reply.san}` : ''}: {STAGE_NAME[m.stage ?? 'new']}{m.lapses ? `, ${m.lapses} lapses` : ''}" aria-pressed={selId === n.id}
              onclick={(e) => { e.stopPropagation(); pick(n); }} onkeydown={key(() => pick(n))}>
              {#if selId === n.id}<rect class="ring" x={-W / 2 - 5} y={-H / 2 - 5} width={W + 10} height={H + 10 + plies * PLY} rx="15" />{/if}
              {#each Array(plies) as _, i}
                <rect x={-W / 2} y={-H / 2 + (plies - i) * PLY} width={W} height={H} rx="11" fill={(plies - i) % 2 ? '#a67f4d' : '#dcc08f'} />
              {/each}
              <rect class="face" x={-W / 2} y={-H / 2} width={W} height={H} rx="11" />
              {#if n.state === 'lit'}<rect x={-W / 2 + 6} y={-11} width="4" height="22" rx="2" fill={n.colour} stroke="rgba(21,25,54,.35)" stroke-width="0.6" />{/if}
              {#if n.reply}
                <text class="rep" x={-W / 2 + 17} y="-6">{n.reply.san}<tspan class="pc" dx="5">{pct(n.reply.freq)}</tspan></text>
                <text class="san" x={-W / 2 + 17} y="13.5">{m.san}</text>
              {:else}
                <text class="san" x={-W / 2 + 17} y="5.5">{m.san}</text>
              {/if}
              {#if m.joins}<text class="join" x={W / 2 - 12} y="6" text-anchor="end">↪</text>{/if}
              {#if m.lapses}
                <g transform="translate({W / 2 - 6} {-H / 2 + 4})"><circle r="9" fill="#e5412b" stroke="#0d1024" stroke-width="2" /><text class="lap" y="3.5" text-anchor="middle">{m.lapses}</text></g>
              {/if}
            </g>
            {#if n.kids.length}
              {@const w = pillW(n)}
              <g class="pill" class:has={learned(m) > (lit(m) ? 1 : 0)} style="--c:{n.colour}" transform="translate({W / 2 - 6} 0)" role="button" tabindex="0"
                aria-label={open.has(n.id) ? `Fold the moves after ${m.san}` : `Show the ${m.sum.total - 1} moves after ${m.san}`} aria-expanded={open.has(n.id)}
                onclick={(e) => toggle(n, e)} onkeydown={key(() => toggle(n))}>
                <rect class="hit" x="-6" y="-21" width={w + 16} height="42" />
                <rect class="body" y="-11" width={w} height="22" rx="11" />
                <text x={w / 2} y="3.8" text-anchor="middle">{pillText(n)}</text>
              </g>
            {/if}
          </g>
        {/each}
      </g>
    </svg>
  </div>

  <div class="tools">
    <button onclick={() => zoomBy(ZOOM)} disabled={view.k >= KMAX - 0.001} aria-label="Zoom in" title="Zoom in (+)"><Icon name="plus" size={22} /></button>
    <button onclick={() => zoomBy(1 / ZOOM)} disabled={view.k <= KMIN + 0.001} aria-label="Zoom out" title="Zoom out (−)"><Icon name="minus" size={22} /></button>
    {#if canUnfold}
      <button class:on={allOpen} onclick={expandAll} aria-pressed={allOpen} aria-label={allOpen ? 'Collapse to the main lines' : 'Expand all lines'} title={allOpen ? 'Collapse' : 'Expand all'}><Icon name={allOpen ? 'fold' : 'unfold'} size={22} /></button>
    {/if}
    <button class:on={showBook} onclick={() => { showBook = !showBook; if (showBook) selId = null; }} aria-pressed={showBook} aria-label={showBook ? 'Hide progress and chapters' : 'Show progress and chapters'} title="Progress and chapters"><Icon name="book" size={22} /></button>
  </div>

  <p class="how2" aria-hidden="true"><kbd>scroll</kbd> zoom <kbd>drag</kbd> move <kbd>← ↑ ↓ →</kbd> pan <kbd>0</kbd> fit</p>

  <div class="sheet" bind:clientHeight={sheetH}>
    {#if sel}
      {@const m = sel.m}
      {@const fresh = newCount(m)}
      {#key sel.id}
        <div class="one" style="--c:{sel.colour}">
          <div class="bd"><Board draw={false} fen={fenOf(child(m.epd, m.uci))} {side} lastMove={[m.uci.slice(0, 2), m.uci.slice(2, 4)]} coords={false} dark /></div>
          <div class="grow">
            <p class="t-name nm">{shortName(sel.name)}</p>
            <p class="mv">{moveNo(m)}{m.san}</p>
            {#if sel.reply}<p class="sub">Your answer to {moveNo(sel.reply)}{sel.reply.san}, played in {pct(sel.reply.freq)} of games here</p>{/if}
            <p class="st"><Plies stage={(m.stage ?? 'new') as Stage} size={16} />{STAGE_NAME[m.stage ?? 'new']}{m.lapses ? `, forgot ${m.lapses}×` : ''}</p>
            {#if m.sum.total > 1}<p class="sub">{learned(m)} of {m.sum.total} learned from here on</p>{:else if m.joins}<p class="sub">Continues in another line</p>{/if}
          </div>
          <button class="x" onclick={() => (selId = null)} aria-label="Close"><Icon name="close" size={20} /></button>
        </div>
      {/key}
      <div class="acts">
        {#if fresh}<button class="btn grow" onclick={() => onlearn(m)}>Learn {fresh}</button>{/if}
        <button class="btn night grow" onclick={() => ondrill(m)}>Drill</button>
        <button class="btn night grow" onclick={() => onplay(m)}>Play</button>
        <button class="btn night sqb" onclick={() => onexplore(m)} aria-label="Open in Explore"><Icon name="explore" size={20} /></button>
      </div>
    {:else}
      {@const fresh = newCount(null)}
      {#if showBook}
        <div class="book">
          <p class="tot"><b class="t-num">{sum.total - sum.stages[0]}</b> of {sum.total} moves learned{#if sum.stages[3]}, {sum.stages[3]} mature{/if}{#if sum.lapses}, <span class="bad">{sum.lapses} forgotten</span>{/if}</p>
          <span class="bar" role="img" aria-label="{sum.stages[3]} mature, {sum.stages[2]} young, {sum.stages[1]} learning, {sum.stages[0]} new">
            {#each ['mature', 'young', 'learning', 'new'] as s, i}<i style="flex:{sum.stages[3 - i]};background:var(--st-{s})"></i>{/each}
          </span>
          {#if tree.top.length > 1}
            <div class="chs" aria-label="Chapters">
              {#each tree.top as n, i (n.id)}
                <button style="--c:{n.colour}" class:done={learned(n.m) === n.m.sum.total} onclick={(e) => { e.stopPropagation(); moved = false; pick(n); }}>
                  <small>Chapter {i + 1}</small><span>{tail(n.name)}</span><b class="t-num">{learned(n.m)}/{n.m.sum.total}</b>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      <div class="acts">
        <button class="btn grow" onclick={() => onlearn(null)} disabled={!fresh}>{fresh ? `Learn ${fresh}` : 'All learned'}</button>
        <button class="btn night grow" onclick={() => ondrill(null)}>Drill</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .tree { position: relative; flex: 1; min-height: 0; }
  .canvas { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; border-radius: 26px 26px 0 0; background: radial-gradient(120% 70% at 10% 20%, #1a1e44 0%, #0d1024 60%, #090b1a 100%); }
  .canvas:active { cursor: grabbing; }
  svg { display: block; }
  text { pointer-events: none; font-family: var(--sans); }

  .root rect { fill: #0d1024; stroke: #e8d3a8; stroke-width: 2; }
  .root text { font-weight: 750; font-size: 16px; fill: #e8d3a8; }
  .lab { font-family: var(--serif); font-style: italic; font-weight: 500; font-size: 13px; }

  .tile { cursor: pointer; outline: none; }
  .tile .face { fill: #141936; stroke: color-mix(in srgb, var(--c) 34%, #1c2248); stroke-width: 1.5; }
  .tile .rep { font-weight: 600; font-size: 10.5px; fill: #6f76a0; }
  .tile .pc { font-weight: 500; fill: #565d88; }
  .tile .san { font-weight: 750; font-size: 15.5px; letter-spacing: -0.02em; fill: #8088b3; }
  .tile .join { font-size: 14px; font-weight: 700; fill: #6f76a0; }
  .tile.next .face { fill: #1d2350; stroke: var(--c); stroke-width: 1.8; }
  .tile.next .face { animation: nextp 1.9s ease-in-out infinite; }
  @keyframes nextp { 50% { stroke-width: 3.4; fill: #232a60; } }
  .tile.next .rep { fill: #b3b9d8; }
  .tile.next .pc { fill: #868db6; }
  .tile.next .san { fill: #f3f4fc; }
  .tile.lit .face { fill: #f1e0bf; stroke: none; }
  .tile.lit .rep { fill: #6f4c2c; }
  .tile.lit .pc { fill: #94714b; }
  .tile.lit .san, .tile.lit .join { fill: #151936; }
  .tile:focus-visible .face { stroke: #fff; stroke-width: 3; }
  .ring { fill: none; stroke: #f4b740; stroke-width: 2.5; }
  .lap { font-weight: 800; font-size: 10.5px; fill: #fff; }

  .pill { cursor: pointer; outline: none; }
  .pill .hit { fill: transparent; }
  .pill .body { fill: #0d1024; stroke: #3d4577; stroke-width: 1.5; }
  .pill text { font-weight: 750; font-size: 11px; fill: #aab0d2; }
  .pill.has .body { stroke: var(--c); }
  .pill.has text { fill: var(--c); }
  .pill:focus-visible .body { stroke: #fff; stroke-width: 2.5; }

  .tools { position: absolute; z-index: 4; top: 10px; right: 12px; display: flex; flex-direction: column; gap: 8px; }
  .tools button { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 14px; background: rgba(29, 34, 71, 0.94); border: 1px solid #2c3366; color: #d6d9ee; font-size: 13.5px; font-weight: 700; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35); }
  .tools button:disabled { opacity: 0.4; }
  .tools button:active:not(:disabled) { background: #2c3366; }
  .tools button.on { background: var(--birch); color: var(--ink-fixed); border-color: var(--birch); }

  .sheet { position: absolute; z-index: 5; left: 12px; right: 12px; bottom: calc(env(safe-area-inset-bottom) + 12px); max-width: 600px; margin: 0 auto; padding: 14px; border-radius: 24px; background: rgba(29, 34, 71, 0.97); border: 1px solid #2c3366; color: var(--night-ink); box-shadow: 0 16px 34px rgba(0, 0, 0, 0.5); }
  .one { display: flex; gap: 14px; align-items: flex-start; animation: rise 220ms var(--ease) both; }
  .bd { flex: none; width: 124px; pointer-events: none; }
  .nm { font-size: 17px; line-height: 1.15; color: var(--c); padding-right: 30px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .mv { font-size: 26px; font-weight: 750; letter-spacing: -0.03em; line-height: 1.15; margin-top: 2px; }
  .sub { font-size: 12.5px; line-height: 1.3; color: var(--night-ink-2); margin-top: 3px; }
  .st { display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 650; margin-top: 8px; }
  .x { position: absolute; top: 6px; right: 6px; width: 44px; height: 44px; display: grid; place-items: center; color: var(--night-ink-2); }
  .bar { display: flex; gap: 2px; height: 6px; }
  .bar i { border-radius: 2px; min-width: 0; }
  .tot { font-size: 14px; color: var(--night-ink-2); margin: -2px 0 10px; }
  .tot b { font-size: 20px; color: var(--night-ink); }
  .tot .bad { color: #ff9a8a; }
  .acts .sqb { flex: none; width: 48px; padding: 0; }
  .chs { display: flex; gap: 8px; overflow-x: auto; margin: 12px -14px 0; padding: 0 14px 2px; scrollbar-width: none; }
  .chs::-webkit-scrollbar { display: none; }
  .chs button { flex: none; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; min-width: 116px; max-width: 170px; padding: 8px 12px 9px; border-radius: 14px; background: #141936; border: 1.5px solid color-mix(in srgb, var(--c) 55%, #1c2248); text-align: left; }
  .chs small { font-size: 11px; font-weight: 650; color: var(--c); }
  .chs span { font-family: var(--serif); font-style: italic; font-size: 15px; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .chs b { font-size: 12.5px; color: var(--night-ink-2); }
  .chs .done { background: var(--birch); border-color: var(--birch); color: var(--ink-fixed); }
  .chs .done small, .chs .done b { color: var(--walnut); }
  .book { animation: rise 220ms var(--ease) both; }
  .book + .acts { margin-top: 14px; }
  .acts { display: flex; gap: 8px; margin: 14px 0 5px; }
  .sheet > .acts:first-child { margin-top: 0; }
  .acts .btn { min-height: 46px; font-size: 15px; padding: 0 10px; border-radius: 14px; }
  .how2 { display: none; }
  /* ---------- desktop: a full-window canvas, the sheet as a panel on the right (DESIGN.md, "Desktop") ---------- */
  @media (min-width: 1024px) and (min-height: 600px) {
    .canvas { border-radius: 0; }
    .tools { right: auto; left: 16px; top: 14px; }
    .tools button { transition: background 140ms, color 140ms; }
    .tools button:not(.on):hover { background: #2c3366; color: #fff; }
    .how2 { display: flex; align-items: center; gap: 6px; position: absolute; left: 18px; bottom: 16px; font-size: 12.5px; color: #868db6; pointer-events: none; }
    .how2 kbd { font: inherit; font-weight: 700; font-size: 11.5px; padding: 2px 7px; border-radius: 6px; background: rgba(29, 34, 71, 0.92); border: 1px solid #2c3366; color: #d6d9ee; margin-left: 8px; }
    .how2 kbd:first-child { margin-left: 0; }
    .sheet { left: auto; right: 16px; top: 14px; bottom: auto; width: 340px; margin: 0; max-height: calc(100% - 28px); overflow-y: auto; padding: 16px; }
    .one { flex-direction: column; gap: 12px; }
    .bd { width: 100%; }
    .nm { font-size: 20px; }
    .mv { font-size: 32px; }
    .chs { flex-direction: column; overflow: visible; margin: 14px 0 0; padding: 0; }
    .chs button { max-width: none; width: 100%; flex-direction: row; align-items: baseline; gap: 10px; transition: background 140ms; }
    .chs button:not(.done):hover { background: #1d2350; }
    .chs span { flex: 1; text-align: left; }
    .acts { flex-wrap: wrap; }
    .acts .btn:not(:disabled):hover { filter: brightness(1.1); }
    .tile:hover .face { stroke-width: 2.6; }
    .tile.far:hover .face { stroke: var(--c); }
    .pill:hover .body { stroke: #fff; }
  }
</style>
