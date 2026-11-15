<script lang="ts">
  // Onboarding's "Something else": every opening family where the defining move is yours, most played at
  // your band first, with search over every named variation. Only openings the band's data reaches.
  import { data } from './model.svelte';
  import type { Opening } from './data';
  import Sigil from './Sigil.svelte';
  import Icon from './Icon.svelte';

  type Slot = 'white' | 'e4' | 'd4';
  let { slot, onpick, onclose }: { slot: Slot; onpick: (o: { name: string; path: string[] }) => void; onclose: () => void } = $props();
  let q = $state('');

  const fits = (o: Opening) =>
    slot === 'white' ? o.uci.length % 2 === 1 : o.uci.length % 2 === 0 && o.uci.length >= 2 && o.uci[0] === (slot === 'e4' ? 'e2e4' : 'd2d4');
  const games = (o: Opening) => data()?.tree[o.epd]?.g ?? 0;
  const all = $derived((data()?.openings ?? []).filter((o) => fits(o) && games(o) > 0));
  /** one row per family: its shortest named position */
  const families = $derived.by(() => {
    const best = new Map<string, Opening>();
    for (const o of all) { const b = best.get(o.family); if (!b || o.uci.length < b.uci.length || (o.uci.length === b.uci.length && games(o) > games(b))) best.set(o.family, o); }
    return [...best.values()].sort((a, b) => games(b) - games(a));
  });
  const hits = $derived.by(() => {
    const words = q.toLowerCase().replace(/[’']/g, '').split(/\s+/).filter(Boolean);
    if (!words.length) return families.slice(0, 60);
    return all.filter((o) => { const hay = `${o.name} ${o.eco} ${o.san}`.toLowerCase().replace(/[’']/g, ''); return words.every((w) => hay.includes(w)); }).sort((a, b) => games(b) - games(a)).slice(0, 40);
  });
  const title = $derived(slot === 'white' ? 'Your opening as White' : slot === 'e4' ? 'As Black against 1.e4' : 'As Black against 1.d4');
</script>

<div class="sheet-bg" role="presentation" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-label={title}>
  <div class="grab" aria-hidden="true"></div>
  <div class="hd">
    <h2 class="t-title">{title}</h2>
    <button class="x" onclick={onclose} aria-label="Close"><Icon name="close" /></button>
  </div>
  <label class="search">
    <Icon name="search" size={20} />
    <input type="search" bind:value={q} placeholder="Name, ECO code or moves" aria-label="Search openings" autocapitalize="off" autocomplete="off" spellcheck="false" />
  </label>
  <p class="t-small">{q.trim() ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : `${families.length} opening families, the most played first`}</p>
  <ul class="list card">
    {#each hits as o (o.id)}
      <li><button onclick={() => onpick({ name: o.name, path: o.uci })}>
        <Sigil path={o.uci.slice(0, 8)} hue="#2b4bee" flip={slot !== 'white'} you={slot === 'white' ? 'w' : 'b'} size={40} />
        <span class="grow"><span class="t-name nm">{o.name}</span><span class="t-small">{o.eco} · {o.san}</span></span>
      </button></li>
    {:else}
      <li class="none t-small">No opening by that name reaches your level's data.</li>
    {/each}
  </ul>
</div>

<style>
  .sheet-bg { position: fixed; inset: 0; z-index: 60; background: rgba(13, 16, 36, 0.45); }
  .sheet { position: fixed; z-index: 61; left: 0; right: 0; bottom: 0; max-width: 640px; margin: 0 auto; height: 88vh; display: flex; flex-direction: column; gap: 10px; background: var(--ground); border-radius: 26px 26px 0 0; padding: 8px 16px calc(env(safe-area-inset-bottom) + 12px); animation: up 300ms var(--ease) both; color: var(--ink); }
  @keyframes up { from { transform: translateY(100%); } }
  .grab { width: 42px; height: 5px; border-radius: 3px; background: var(--line); margin: 0 auto; flex: none; }
  .hd { display: flex; align-items: center; justify-content: space-between; }
  .x { width: 44px; height: 44px; display: grid; place-items: center; margin-right: -10px; }
  .search { display: flex; align-items: center; gap: 10px; height: 50px; padding: 0 14px; background: var(--card); border-radius: 16px; color: var(--ink-3); flex: none; }
  .search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; height: 100%; color: var(--ink); font-size: 16px; }
  .list { list-style: none; margin: 0; padding: 4px; overflow-y: auto; flex: 1; }
  .list li + li { border-top: 1px solid var(--ground); }
  .list button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 58px; padding: 6px 10px; text-align: left; border-radius: 12px; }
  .list button:active { background: var(--ground); }
  .nm { display: block; font-size: 18px; line-height: 1.15; }
  .none { padding: 16px 10px; }
</style>
