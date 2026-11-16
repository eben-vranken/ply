<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { app, route, go } from './lib/state.svelte';
  import Icon from './lib/Icon.svelte';
  import { buzz, sfx } from './lib/fx';
  import Today from './routes/Today.svelte';
  import Explore from './routes/Explore.svelte';
  import Repertoire from './routes/Repertoire.svelte';
  import Stats from './routes/Stats.svelte';
  import Settings from './routes/Settings.svelte';
  import Train from './routes/Train.svelte';
  import Tree from './routes/Tree.svelte';
  import Play from './routes/Play.svelte';
  import Onboarding from './routes/Onboarding.svelte';
  import Login from './routes/Login.svelte';
  import { configured, cloud, initCloud, autoSyncCloud } from './lib/cloud/cloud.svelte';
  import { model, boot } from './lib/model.svelte';
  import { autoSync } from './lib/import/sync.svelte';
  import { onMount } from 'svelte';

  // every slab button answers the press: a soft tick and a tap in the hand
  onMount(() => {
    const press = (e: PointerEvent) => { const b = (e.target as Element | null)?.closest?.('.btn'); if (b && !(b as HTMLButtonElement).disabled) { sfx.tick(); buzz(8); } };
    addEventListener('pointerdown', press);
    return () => removeEventListener('pointerdown', press);
  });
  // the session is restored while the opening data loads; opening the app syncs your account
  onMount(() => {
    void initCloud();
    void boot().then(() => { if (app.onboarded) void autoSync(); autoSyncCloud(); });
  });
  // leaving a training session or Play it out syncs it
  let wasTraining = false;
  $effect(() => { const t = training || base === '/play'; if (wasTraining && !t && model.status === 'ready') autoSyncCloud(); wasTraining = t; });
  const needLogin = $derived(configured && !cloud.user);
  // finishing onboarding sends it all to the account
  let wasOnboarded = app.onboarded;
  $effect(() => { const o = app.onboarded; if (o && !wasOnboarded) autoSyncCloud(); wasOnboarded = o; });
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => { if (model.notice) { clearTimeout(noticeTimer); noticeTimer = setTimeout(() => (model.notice = ''), 7000); } });

  const tabs = [
    ['/today', 'today', 'Today'],
    ['/explore', 'explore', 'Explore'],
    ['/repertoire', 'repertoire', 'Repertoire'],
    ['/stats', 'stats', 'Stats'],
    ['/settings', 'settings', 'Settings']
  ] as const;
  const base = $derived(route.path.split('?')[0]);
  // the skill tree sits under Repertoire
  const tabOf = (b: string) => (b === '/tree' ? '/repertoire' : b);
  const training = $derived(base === '/train');
  // the session and the skill tree are rooms of their own: no tab bar
  const bare = $derived(training || base === '/tree' || base === '/play');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur = reduce ? 0 : 260;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  let systemDark = $state(mq.matches);
  mq.addEventListener('change', (e) => (systemDark = e.matches));

  $effect(() => {
    const dark = app.theme === 'dark' || (app.theme === 'auto' && systemDark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', training ? '#131734' : dark ? '#0d1024' : '#eceef3');
    navigator.storage?.persist?.();
  });
</script>

{#if needLogin && cloud.ready && model.status !== 'error'}
  <div out:fade={{ duration: dur }}><Login /></div>
{:else if model.status !== 'ready' || !cloud.ready || (cloud.restoring && !app.onboarded)}
  <div class="boot" class:err={model.status === 'error'} role="status">
    <div class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    {#if model.status === 'error'}
      <p class="t-head">Ply could not load its opening data</p>
      <p class="t-small">{model.error}. The first launch needs a connection; after that Ply works offline.</p>
      <button class="btn" onclick={() => location.reload()}>Try again</button>
    {:else if model.status === 'downloading'}
      <p class="t-head">Fetching every opening</p>
      <div class="bar"><i style="width:{Math.round(model.progress * 100)}%"></i></div>
      <p class="t-small">{Math.round(model.progress * 100)}% · one time, then it all lives on this phone</p>
    {:else if cloud.restoring}
      <p class="t-head">Bringing in your progress</p>
    {:else}
      <p class="t-head">Laying out your lines</p>
    {/if}
  </div>
{:else if !app.onboarded}
  <div out:fade={{ duration: dur }}><Onboarding /></div>
{:else}
  {#key base === '/tree' || base === '/play' ? route.path : base}
    <div class="page" class:over={training}
      in:fly={{ x: training ? 0 : 28 * route.dir, y: training ? 60 : 0, duration: dur, easing: cubicOut }}
      out:fade={{ duration: dur * 0.5 }}>
      {#if base === '/today'}<Today />
      {:else if base === '/explore'}<Explore />
      {:else if base === '/repertoire'}<Repertoire />
      {:else if base === '/stats'}<Stats />
      {:else if base === '/settings'}<Settings />
      {:else if base === '/train'}<Train />
      {:else if base === '/tree'}<Tree />
      {:else if base === '/play'}<Play />
      {:else}<Today />{/if}
    </div>
  {/key}

  {#if model.notice && !training}
    <button class="notice" transition:fly={{ y: -40, duration: dur }} onclick={() => (model.notice = '')}>{model.notice}</button>
  {/if}
  {#if !bare}
    <nav transition:fly={{ y: 90, duration: dur }} aria-label="Main">
      {#each tabs as [href, icon, label]}
        <button class:on={tabOf(base) === href} onclick={() => { buzz(6); go(href); }} aria-current={tabOf(base) === href ? 'page' : undefined}>
          <span class="ico"><Icon name={icon} size={22} /></span>
          <span class="lbl">{label}</span>
        </button>
      {/each}
    </nav>
  {/if}
{/if}

<style>
  .boot { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 32px; text-align: center; background: var(--night); color: var(--night-ink); }
  .boot .t-small { color: var(--night-ink-2); max-width: 280px; }
  .boot .mark { display: flex; flex-direction: column; gap: 5px; margin-bottom: 18px; }
  .boot .mark i { width: 120px; height: 14px; border-radius: 5px; background: var(--birch); animation: lay 1.4s var(--ease) infinite alternate; }
  .boot .mark i:nth-child(2) { background: var(--birch-3); animation-delay: 120ms; }
  .boot .mark i:nth-child(3) { animation-delay: 240ms; }
  .boot .mark i:nth-child(4) { background: var(--sun); animation-delay: 360ms; }
  @keyframes lay { from { transform: scaleX(0.55); opacity: 0.5; } to { transform: none; opacity: 1; } }
  .boot.err .mark i { animation: none; }
  .boot .bar { width: 220px; height: 8px; border-radius: 4px; background: var(--night-3); overflow: hidden; }
  .boot .bar i { display: block; height: 100%; background: var(--sun); transition: width 200ms; }
  .notice { position: absolute; z-index: 40; top: calc(env(safe-area-inset-top) + 10px); left: 12px; right: 12px; max-width: 520px; margin: 0 auto; padding: 14px 16px; border-radius: 18px; background: var(--ink); color: var(--on-ink); font-size: 14.5px; text-align: left; box-shadow: var(--shadow); }
  .page { position: absolute; inset: 0; }
  .page.over { z-index: 20; }
  nav {
    position: absolute; z-index: 10; left: 12px; right: 12px; bottom: calc(env(safe-area-inset-bottom) + 12px); max-width: 520px; margin: 0 auto;
    height: 68px; display: flex; padding: 6px;
    background: var(--bar); border-radius: 26px;
    box-shadow: 0 16px 30px -10px rgba(21, 25, 54, 0.5);
  }
  nav button:active .ico { transform: scale(0.86); }
  nav button { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border-radius: 20px; color: var(--night-ink-2); transition: color 160ms, background 200ms var(--ease); }
  nav .lbl { font-size: 11px; font-weight: 600; letter-spacing: 0.01em; }
  nav .ico { transition: transform 260ms var(--spring); }
  nav button.on { color: var(--ink-fixed); background: var(--birch); }
  nav button.on .ico { transform: translateY(-1px) scale(1.08); }
  /* a phone on its side: a slim rail on the right instead of a bar over half the board */
  @media (orientation: landscape) and (max-height: 539px) and (min-width: 560px) {
    nav { left: auto; right: max(8px, env(safe-area-inset-right)); top: 8px; bottom: 8px; width: 64px; height: auto; max-width: none; margin: 0; flex-direction: column; border-radius: 22px; }
    nav .lbl { display: none; }
  }
</style>
