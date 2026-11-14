<script lang="ts">
  // One opening as a skill tree (lib/SkillTree.svelte): a night room with the opening's name on top
  // and the canvas filling the rest.
  import { route, go, run } from '../lib/state.svelte';
  import { model, openingTree, nameOf, learnRound, subtreeNew, drillLine, focusOf, setFocus, type TreeMove } from '../lib/model.svelte';
  import { epdAfter, moveOrder, sans, type Side } from '../lib/chess';
  import type { Item } from '../lib/session';
  import Sigil from '../lib/Sigil.svelte';
  import SkillTree from '../lib/SkillTree.svelte';
  import Icon from '../lib/Icon.svelte';

  const q = new URLSearchParams(route.path.split('?')[1] ?? '');
  const side = (q.get('side') as Side) ?? 'w';
  const path = q.get('p')?.split(' ').filter(Boolean) ?? [];

  const roots = $derived(openingTree(side, path));
  const name = $derived(nameOf(epdAfter(path), path));

  const total = $derived.by(() => {
    const s = { total: 0, stages: [0, 0, 0, 0], lapses: 0 };
    for (const r of roots) { s.total += r.sum.total; r.sum.stages.forEach((n, i) => (s.stages[i] += n)); s.lapses += r.sum.lapses; }
    return s;
  });
  const explore = (p: string[]) => go(`/explore?side=${side}&p=${encodeURIComponent(p.join(' '))}`);
  /** a move's own position is where its lessons start; null is the whole opening */
  const from = (m: TreeMove | null) => (m ? m.path : path);

  function learn(at: string[]) {
    const first = learnRound(side, at);
    if (!first.length) return;
    run.items = first; run.mode = 'learn'; run.title = nameOf(epdAfter(at), at)[1];
    run.more = (missed: Item[]) => [...missed.map((m) => ({ ...m, asks: Object.fromEntries(Object.entries(m.asks).map(([k, a]) => [k, { ...a, intro: false, graded: false }])), prompt: 'Your move', spec: undefined })), ...learnRound(side, at)];
    go('/train');
  }
  function drill(at: string[]) {
    const l = drillLine(side, at, false);
    if (!l) return;
    run.items = [l]; run.mode = 'drill'; run.title = nameOf(epdAfter(at), at)[1];
    run.more = () => { const n = drillLine(side, at, false); return n ? [n] : []; };
    go('/train');
  }
  const colour = side === 'w' ? 'White' : 'Black';
  const focused = $derived(focusOf(side)?.join(' ') === path.join(' '));
  function focus() {
    setFocus(side, focused ? null : path);
    model.notice = focused ? `${name[1]} is your ${colour} focus. About half of each day's new moves now come from it.` : `No ${colour} focus now. New moves follow what you are most likely to meet.`;
  }
  const newCount = (m: TreeMove | null) => { void model.rev; return subtreeNew(side, from(m)).length; };
</script>

<div class="room">
  <header>
    <button class="ib" onclick={() => (history.length > 1 ? history.back() : go('/repertoire'))} aria-label="Back to Repertoire"><Icon name="back" /></button>
    <Sigil path={path.slice(0, 8)} flip={side === 'b'} you={side} size={44} />
    <div class="grow">
      <h1 class="t-name ttl">{name[1]}{#if name[0]}<span class="eco">{name[0]}</span>{/if}</h1>
      <p class="ord">{#if focused}<b class="fc">Focus</b>{/if}{colour}{path.length ? `, ${moveOrder(sans(path))}` : ''}</p>
    </div>
    <button class="ib" class:on={focused} onclick={focus} aria-pressed={focused} aria-label={focused ? `Stop focusing on this opening` : `Make this your ${colour} focus opening`}><Icon name="star" fill={focused} /></button>
    <button class="ib" onclick={() => explore(path)} aria-label="Open this position in Explore"><Icon name="explore" /></button>
  </header>

  {#if roots.length}
    <SkillTree {roots} rootName={name[1]} rootMove={path.length ? sans(path).at(-1) : ''} {side} sum={total} {newCount}
      onexplore={(m) => explore(m.path)} ondrill={(m) => drill(m ? [...m.path, m.uci] : path)} onlearn={(m) => learn(from(m))} />
  {:else}
    <p class="none">Your lines don't pass through this position.</p>
  {/if}
</div>

<style>
  .room { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--night); color: var(--night-ink); }
  header { display: flex; align-items: center; gap: 10px; padding: calc(env(safe-area-inset-top) + 12px) 8px 12px; }
  .ib { flex: none; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 14px; }
  .ib.on { color: var(--sun); }
  .ttl { font-size: 21px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ttl .eco { background: rgba(255, 255, 255, 0.12); }
  .ord { font-size: 13px; color: var(--night-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .fc { color: var(--sun); font-weight: 700; margin-right: 6px; }
  .none { padding: 24px 20px; color: var(--night-ink-2); }
</style>
