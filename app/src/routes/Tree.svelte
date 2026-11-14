<script lang="ts">
  // One opening as a skill tree (lib/SkillTree.svelte) with its totals and actions.
  import { route, go, run } from '../lib/state.svelte';
  import { model, openingTree, nameOf, learnRound, subtreeNew, drillLine, type TreeMove } from '../lib/model.svelte';
  import { epdAfter, moveOrder, sans, type Side } from '../lib/chess';
  import type { Item } from '../lib/session';
  import Sigil from '../lib/Sigil.svelte';
  import SkillTree from '../lib/SkillTree.svelte';
  import Icon from '../lib/Icon.svelte';

  const q = new URLSearchParams(route.path.split('?')[1] ?? '');
  const side = (q.get('side') as Side) ?? 'w';
  const path = q.get('p')?.split(' ').filter(Boolean) ?? [];
  const STAGES = ['new', 'learning', 'young', 'mature'] as const;

  const roots = $derived(openingTree(side, path));
  const name = $derived(nameOf(epdAfter(path), path));

  const total = $derived.by(() => {
    const s = { total: 0, stages: [0, 0, 0, 0], lapses: 0 };
    for (const r of roots) { s.total += r.sum.total; r.sum.stages.forEach((n, i) => (s.stages[i] += n)); s.lapses += r.sum.lapses; }
    return s;
  });
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const at = (m: TreeMove) => go(`/explore?side=${side}&p=${encodeURIComponent(m.path.join(' '))}`);

  function learn(from: string[]) {
    const first = learnRound(side, from);
    if (!first.length) return;
    run.items = first; run.mode = 'learn'; run.title = nameOf(epdAfter(from), from)[1];
    run.more = (missed: Item[]) => [...missed.map((m) => ({ ...m, asks: Object.fromEntries(Object.entries(m.asks).map(([k, a]) => [k, { ...a, intro: false, graded: false }])), prompt: 'Your move', spec: undefined })), ...learnRound(side, from)];
    go('/train');
  }
  function drill(from: string[]) {
    const l = drillLine(side, from, false);
    if (!l) return;
    run.items = [l]; run.mode = 'drill'; run.title = nameOf(epdAfter(from), from)[1];
    run.more = () => { const n = drillLine(side, from, false); return n ? [n] : []; };
    go('/train');
  }
  const newHere = $derived.by(() => { void model.rev; return subtreeNew(side, path).length; });
</script>

<div class="screen">
  <header class="top">
    <button class="back" onclick={() => (history.length > 1 ? history.back() : go('/repertoire'))} aria-label="Back"><Icon name="back" /></button>
    <p class="t-small">{side === 'w' ? 'White' : 'Black'} · skill tree</p>
  </header>

  <section class="card head">
    <Sigil path={path.slice(0, 8)} flip={side === 'b'} size={56} />
    <div class="grow">
      <h1 class="t-name ttl">{name[1]}{#if name[0]}<span class="eco">{name[0]}</span>{/if}</h1>
      <p class="t-small">{moveOrder(sans(path))}</p>
    </div>
  </section>

  <section class="card sum">
    <dl>
      <div><dd class="t-num">{total.total - total.stages[0]}<small>/{total.total}</small></dd><dt>moves learned</dt></div>
      <div><dd class="t-num">{pct(total.stages[3], total.total)}<small>%</small></dd><dt>mature</dt></div>
      <div><dd class="t-num" class:bad={total.lapses > 0}>{total.lapses}</dd><dt>lapses</dt></div>
    </dl>
    <span class="bar" role="img" aria-label="{total.stages[3]} mature, {total.stages[2]} young, {total.stages[1]} learning, {total.stages[0]} new">
      {#each [3, 2, 1, 0] as k}<i style="flex:{total.stages[k]};background:var(--st-{STAGES[k]})"></i>{/each}
    </span>
    <div class="row acts">
      <button class="btn grow" onclick={() => learn(path)} disabled={!newHere}>{newHere ? `Learn ${newHere}` : 'All learned'}</button>
      <button class="btn quiet grow" onclick={() => drill(path)}>Drill</button>
      <button class="btn quiet sq" onclick={() => go(`/explore?side=${side}&p=${encodeURIComponent(path.join(' '))}`)} aria-label="Open in Explore"><Icon name="explore" /></button>
    </div>
  </section>

  {#if roots.length}
    <SkillTree {roots} rootName={name[1]} rootMove={path.length ? sans(path).at(-1) : ''} onexplore={at} ondrill={(m) => drill([...m.path, m.uci])} />
    <p class="legend">
      <span><i class="dot dim"></i>Not learned</span>
      <span><i class="dot l1"></i>Learning 1/3</span>
      <span><i class="dot l2"></i>Young 2/3</span>
      <span><i class="dot l3"></i>Mature 3/3</span>
      <span><i class="dot lap"></i>Lapsed</span>
    </p>
    <p class="t-small foot">Each circle is one of your moves; the curves between them are your opponent's replies and how often they are played at the {model.band} band. A branch lights up as you learn it. Tap a move for its details, or a +N chip to step into the moves below it; the trail at the top takes you back.</p>
  {:else}
    <p class="t-small foot">Your lines don't pass through this position.</p>
  {/if}
</div>

<style>
  .top { display: flex; align-items: center; gap: 6px; margin: 0 -8px 8px; }
  .back { width: 44px; height: 44px; display: grid; place-items: center; }
  .head { display: flex; gap: 14px; align-items: center; }
  .ttl { font-size: 24px; line-height: 1.05; }
  .sum { margin-top: 12px; }
  .sum dl { display: flex; gap: 8px; margin: 0 0 12px; }
  .sum dl div { flex: 1; }
  .sum dd { margin: 0; font-size: 28px; line-height: 1; }
  .sum dd small { font-size: 15px; color: var(--ink-3); }
  .sum dd.bad { color: var(--bad-text); }
  .sum dt { font-size: 12.5px; color: var(--ink-2); margin-top: 3px; }
  .acts { gap: 8px; margin-top: 14px; }
  .acts .btn { min-height: 48px; font-size: 15px; padding: 0 12px; }
  .acts .sq { width: 52px; padding: 0; flex: none; }
  .bar { display: flex; gap: 2px; height: 6px; }
  .bar i { border-radius: 2px; min-width: 0; }


  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 12px 4px 0; font-size: 12.5px; color: var(--ink-2); }
  .legend > span { display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 14px; height: 14px; border-radius: 50%; display: inline-block; }
  .dot.dim { background: #1b1f38; border: 2px solid #4a5070; }
  .dot.l1 { background: #34e08f; opacity: 0.62; }
  .dot.l2 { background: #34e08f; opacity: 0.84; }
  .dot.l3 { background: #34e08f; box-shadow: 0 0 8px #34e08f; }
  .dot.lap { border: 3px solid #ff4a3d; }
  .foot { padding: 12px 4px 0; }
</style>
