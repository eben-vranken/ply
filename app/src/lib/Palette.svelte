<script lang="ts">
  // The command palette (Ctrl/Cmd+K, or /): jump to a screen, an action, one of your openings,
  // or any named opening in the data by name, ECO code or moves.
  import { tick } from 'svelte';
  import { app, go, run, save } from './state.svelte';
  import { data, summaries, todayCounts, itemsFor, requeue, arcade } from './model.svelte';
  import { configured, cloud, requestSync } from './cloud/cloud.svelte';
  import { ui } from './desk.svelte';
  import Icon from './Icon.svelte';
  import Sigil from './Sigil.svelte';

  interface Row { key: string; group: string; label: string; sub?: string; eco?: string; icon?: string; sigil?: { path: string[]; side: 'w' | 'b' }; go: () => void }
  let q = $state('');
  let at = $state(0);
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLUListElement>();
  const close = () => { ui.palette = false; };
  const treeUrl = (side: string, path: string[]) => `/tree?side=${side}&p=${encodeURIComponent(path.join(' '))}`;
  const theme = (t: typeof app.theme) => () => { app.theme = t; save(); };

  function startToday() {
    const queue = todayCounts().queue;
    if (!queue.length) return go('/today');
    run.items = itemsFor(queue); run.mode = 'today'; run.title = 'Today'; run.arcade = undefined; run.more = () => requeue();
    go('/train');
  }
  function playArcade() {
    const a = arcade(), first = a.next();
    if (!first.length) return go('/today');
    run.items = first; run.mode = 'drill'; run.title = 'Arcade'; run.rare = false; run.more = () => a.next(); run.arcade = a.result;
    go('/train');
  }
  const fixed = $derived.by((): Row[] => {
    const left = todayCounts().queue.length;
    return [
      { key: 's1', group: 'Go to', label: 'Today', icon: 'today', go: () => go('/today') },
      { key: 's2', group: 'Go to', label: 'Explore', icon: 'explore', go: () => go('/explore') },
      { key: 's3', group: 'Go to', label: 'Repertoire', icon: 'repertoire', go: () => go('/repertoire') },
      { key: 's4', group: 'Go to', label: 'Stats', icon: 'stats', go: () => go('/stats') },
      { key: 's5', group: 'Go to', label: 'Settings', icon: 'settings', go: () => go('/settings') },
      { key: 'a1', group: 'Do', label: left ? "Start today's session" : 'Today is done', sub: left ? `${left} card${left === 1 ? '' : 's'} in the queue` : 'Nothing is due', icon: 'play', go: startToday },
      { key: 'a2', group: 'Do', label: 'Play Arcade', sub: `Rating ${app.arcadeRating}`, icon: 'sword', go: playArcade },
      { key: 'a3', group: 'Do', label: 'Explore from the start as Black', icon: 'explore', go: () => go('/explore?side=b') },
      ...(configured && cloud.user ? [{ key: 'a4', group: 'Do', label: 'Sync now', icon: 'wifi', go: () => void requestSync() }] : []),
      { key: 't1', group: 'Appearance', label: 'Light', icon: 'hint', go: theme('light') },
      { key: 't2', group: 'Appearance', label: 'Dark', icon: 'layers', go: theme('dark') },
      { key: 't3', group: 'Appearance', label: 'Follow the system', icon: 'fit', go: theme('auto') },
      { key: 'w', group: 'Go to', label: 'About Ply', sub: 'The landing page', icon: 'star', go: () => go('/welcome') }
    ];
  });
  const rows = $derived.by((): Row[] => {
    const s = q.trim().toLowerCase();
    const words = s.split(/\s+/).filter(Boolean);
    const hit = (text: string) => words.every((w) => text.toLowerCase().includes(w));
    const mine = summaries().filter((o) => o.path.length);
    const own: Row[] = mine.filter((o) => !s || hit(o.name) || o.eco.toLowerCase() === s).slice(0, s ? 6 : 5)
      .map((o) => ({ key: 'o' + o.key, group: 'Your openings', label: o.name, eco: o.eco, sub: `${o.side === 'w' ? 'White' : 'Black'} · ${o.learned}/${o.total} moves`, sigil: { path: o.path.slice(0, 8), side: o.side }, go: () => go(treeUrl(o.side, o.path)) }));
    if (!s) return [...fixed.slice(5, 7), ...own, ...fixed.slice(0, 5)];
    const all: Row[] = s.length < 2 ? [] : (data()?.openings ?? [])
      .filter((o) => hit(o.name) || o.eco.toLowerCase() === s || o.san.toLowerCase().startsWith(s))
      .sort((a, b) => a.uci.length - b.uci.length).slice(0, 24)
      // an opening that ends on Black's move is Black's to play
      .map((o) => ({ key: 'd' + o.id, group: 'Every opening', label: o.name, eco: o.eco, sub: o.san, sigil: { path: o.uci.slice(0, 8), side: o.uci.length % 2 ? 'w' as const : 'b' as const }, go: () => go(`/explore?side=${o.uci.length % 2 ? 'w' : 'b'}&p=${encodeURIComponent(o.uci.join(' '))}`) }));
    return [...fixed.filter((r) => hit(r.label) || hit(r.group)), ...own, ...all];
  });
  $effect(() => { void q; at = 0; });
  $effect(() => { if (ui.palette) { q = ''; void tick().then(() => input?.focus()); } });
  function pick(r: Row | undefined) { if (!r) return; close(); r.go(); }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      at = (at + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % Math.max(1, rows.length);
      void tick().then(() => list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
    } else if (e.key === 'Enter') { e.preventDefault(); pick(rows[at]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }
</script>

{#if ui.palette}
  <div class="bg" role="presentation" onclick={close}></div>
  <div class="pal" role="dialog" aria-modal="true" aria-label="Jump to">
    <label class="in">
      <Icon name="search" size={20} />
      <input bind:this={input} bind:value={q} onkeydown={key} placeholder="An opening, a screen, an action…" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" aria-activedescendant={rows[at] ? 'pal-' + rows[at].key : undefined} autocomplete="off" autocapitalize="off" spellcheck="false" />
      <kbd>Esc</kbd>
    </label>
    <ul id="pal-list" role="listbox" bind:this={list}>
      {#each rows as r, i (r.key)}
        {#if i === 0 || rows[i - 1].group !== r.group}<li class="gh" role="presentation">{r.group}</li>{/if}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li id="pal-{r.key}" role="option" aria-selected={i === at} class:on={i === at} onclick={() => pick(r)} onpointermove={() => (at = i)}>
          {#if r.sigil}<Sigil path={r.sigil.path} flip={r.sigil.side === 'b'} you={r.sigil.side} size={34} />{:else}<span class="ic"><Icon name={r.icon ?? 'next'} size={18} /></span>{/if}
          <span class="grow"><span class:t-name={!!r.sigil} class="lb">{r.label}{#if r.eco}<span class="eco">{r.eco}</span>{/if}</span>{#if r.sub}<span class="sub">{r.sub}</span>{/if}</span>
          {#if i === at}<kbd>Enter</kbd>{/if}
        </li>
      {:else}
        <li class="none" role="presentation">Nothing matches “{q.trim()}”. Try part of a name, a code like C50, or moves like e4 e5 Nf3.</li>
      {/each}
    </ul>
    <p class="hint"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span>{data()?.openings.length.toLocaleString('en') ?? ''} openings</span></p>
  </div>
{/if}

<style>
  .bg { position: fixed; inset: 0; z-index: 80; background: rgba(13, 16, 36, 0.5); animation: fadein 160ms both; }
  @keyframes fadein { from { opacity: 0; } }
  .pal { position: fixed; z-index: 81; left: 50%; top: min(14vh, 120px); width: min(640px, calc(100vw - 32px)); max-height: min(70vh, 620px); display: flex; flex-direction: column; margin-left: calc(min(640px, 100vw - 32px) / -2); border-radius: 22px; background: var(--card); box-shadow: 0 30px 80px -20px rgba(13, 16, 36, 0.55), 0 0 0 1px var(--line); overflow: hidden; animation: rise 200ms var(--ease) both; }
  .in { display: flex; align-items: center; gap: 12px; height: 60px; padding: 0 16px 0 18px; border-bottom: 1px solid var(--line); color: var(--ink-3); flex: none; }
  input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: none; font-size: 18px; font-weight: 550; color: var(--ink); }
  input::placeholder { color: var(--ink-3); font-weight: 450; }
  kbd { flex: none; font: inherit; font-size: 11.5px; font-weight: 700; padding: 2px 7px; border-radius: 6px; background: var(--wash); color: var(--ink-2); }
  ul { list-style: none; margin: 0; padding: 6px 8px 8px; overflow-y: auto; flex: 1; min-height: 0; scroll-padding: 34px 0 8px; }
  .gh { padding: 12px 10px 4px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-3); }
  li[role='option'] { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 6px 10px; border-radius: 12px; cursor: pointer; }
  li.on { background: var(--cobalt-tint); }
  .ic { flex: none; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: var(--ground); color: var(--ink-2); }
  li.on .ic { background: var(--cobalt); color: #fff; }
  .lb { display: block; font-weight: 600; font-size: 15.5px; line-height: 1.2; }
  .lb.t-name { font-size: 18px; font-weight: 500; }
  .sub { display: block; font-size: 12.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .none { padding: 18px 12px; font-size: 14.5px; color: var(--ink-2); }
  .hint { flex: none; display: flex; gap: 16px; padding: 9px 16px; border-top: 1px solid var(--line); font-size: 12px; color: var(--ink-3); }
  .hint span:last-child { margin-left: auto; }
  .hint kbd { margin-right: 4px; }
</style>
