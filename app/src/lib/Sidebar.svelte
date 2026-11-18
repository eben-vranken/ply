<script lang="ts">
  // The desktop's navigation (docs/DESIGN.md, "Desktop"): the phone's tab bar stood on end, with
  // what you would otherwise open Today for: the daily goal, the streak, the level and the sync status.
  // A 76 px rail of icons from 1024 px, the full sidebar from 1280 px.
  import { app, go } from './state.svelte';
  import { model, allCards } from './model.svelte';
  import { loadStats, type StatsData } from './stats';
  import { levelOf, xpToday } from './game';
  import { configured, cloud, requestSync, syncLabel } from './cloud/cloud.svelte';
  import { ui, MOD } from './desk.svelte';
  import Icon from './Icon.svelte';

  let { current }: { current: string } = $props();
  const tabs = [['/today', 'today', 'Today'], ['/explore', 'explore', 'Explore'], ['/games', 'games', 'Games'], ['/repertoire', 'repertoire', 'Repertoire'], ['/stats', 'stats', 'Stats'], ['/settings', 'settings', 'Settings']] as const;
  let stats = $state<StatsData | null>(null);
  $effect(() => { void model.rev; void loadStats(allCards().values(), app.rollover).then((s) => (stats = s)); });
  const xp = $derived.by(() => { void app.xpToday; void app.xpDay; return xpToday(); });
  const pct = $derived(Math.min(1, xp / app.goal));
  const lvl = $derived(levelOf(app.xp));
  const lit = $derived(stats?.week[(new Date().getDay() + 6) % 7] ?? false);
  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 30_000); return () => clearInterval(t); });
  const sync = $derived.by(() => {
    if (!configured || !cloud.user) return { tone: 'off', word: 'On this device', title: 'This build has no accounts: your progress stays in this browser.' };
    void cloud.lastAt;
    const label = syncLabel(now);
    if (cloud.status === 'syncing') return { tone: 'busy', word: 'Syncing…', title: label };
    if (cloud.status === 'offline') return { tone: 'wait', word: 'Offline', title: label };
    if (cloud.status === 'error') return { tone: 'bad', word: 'Not synced', title: label };
    return { tone: 'ok', word: 'Synced', title: label };
  });
</script>

<aside class="sb" aria-label="Ply">
  <button class="brand" onclick={() => go('/today')} aria-label="Ply: Today"><span class="logo" aria-hidden="true"><i></i><i></i><i></i></span><span class="t-name wm">Ply</span></button>

  <button class="jump" onclick={() => (ui.palette = true)} aria-label="Jump to an opening, a screen or an action" title="Jump to… ({MOD}+K)">
    <Icon name="search" size={18} /><span class="lbl">Jump to…</span><kbd class="lbl">{MOD} K</kbd>
  </button>

  <nav aria-label="Main">
    {#each tabs as [href, icon, label]}
      <button class:on={current === href} onclick={() => go(href)} aria-current={current === href ? 'page' : undefined} title={label}>
        <span class="ico"><Icon name={icon} size={22} /></span><span class="lbl">{label}</span>
      </button>
    {/each}
  </nav>

  <div class="foot">
    <button class="goal" onclick={() => go('/today')} aria-label="Daily goal: {xp} of {app.goal} XP. Level {lvl.level}, {lvl.rank}" title="Daily goal: {xp} of {app.goal} XP">
      <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
        <circle cx="22" cy="22" r="17" fill="none" stroke="var(--night-3)" stroke-width="6" />
        <circle cx="22" cy="22" r="17" fill="none" stroke={pct >= 1 ? '#52db9c' : 'var(--sun)'} stroke-width="6" stroke-linecap="round" stroke-dasharray="106.8" stroke-dashoffset={106.8 * (1 - pct)} transform="rotate(-90 22 22)" />
        {#if pct >= 1}<path d="M15 22.500l5 5 9.500-10" fill="none" stroke="#52db9c" stroke-width="3.500" stroke-linecap="round" stroke-linejoin="round" />{/if}
      </svg>
      <span class="lbl gt"><b class="t-num">{xp}<small> / {app.goal} XP</small></b><span>{pct >= 1 ? 'Daily goal reached' : 'Daily goal'}</span></span>
    </button>
    <div class="pair">
      <span class="pill" class:lit title="{stats?.streak ?? 0} day streak{lit ? '' : ': nothing done yet today'}" aria-label="{stats?.streak ?? 0} day streak{lit ? '' : ', nothing done yet today'}">
        <Icon name="flame" size={18} fill /><b class="t-num">{stats?.streak ?? 0}</b>
        {#if stats?.freezes}<span class="frz" title="Streak freezes"><Icon name="freeze" size={14} /><b class="t-num">{stats.freezes}</b></span>{/if}
      </span>
      <span class="pill lv lbl" title="Level {lvl.level}: {lvl.span - lvl.into} XP to the next" aria-label="Level {lvl.level}, {lvl.rank}"><i>{lvl.level}</i>{lvl.rank}</span>
    </div>
    <button class="sync {sync.tone}" onclick={() => (configured && cloud.user ? void requestSync() : go('/settings'))} title={sync.title} aria-label="{sync.word}. {sync.title}">
      <span class="dot" aria-hidden="true"></span><span class="lbl">{sync.word}</span>
      {#if cloud.user}<span class="lbl who">{cloud.user.name}</span>{/if}
    </button>
  </div>
</aside>

<style>
  .sb { position: absolute; z-index: 10; left: 0; top: 0; bottom: 0; width: 76px; display: flex; flex-direction: column; gap: 6px; padding: 16px 10px 14px; background: var(--bar); color: var(--night-ink-2); }
  .sb .lbl { display: none; }
  button { border-radius: 14px; transition: background 160ms, color 160ms; }
  .brand { display: flex; align-items: center; justify-content: center; gap: 10px; height: 48px; color: var(--night-ink); }
  .logo { display: flex; flex-direction: column; gap: 3px; }
  .logo i { width: 24px; height: 5.5px; border-radius: 2px; background: var(--birch); }
  .logo i:nth-child(2) { background: var(--birch-3); }
  .logo i:nth-child(3) { background: var(--sun); }
  .wm { display: none; font-size: 30px; line-height: 1; }
  .jump { display: flex; align-items: center; justify-content: center; gap: 10px; height: 44px; margin: 8px 0 10px; background: rgba(255, 255, 255, 0.07); color: var(--night-ink-2); font-size: 14.5px; }
  .jump:hover { background: rgba(255, 255, 255, 0.13); color: var(--night-ink); }
  kbd { font: inherit; font-size: 11.5px; font-weight: 700; padding: 2px 6px; border-radius: 6px; background: rgba(255, 255, 255, 0.1); margin-left: auto; white-space: nowrap; }
  nav { display: flex; flex-direction: column; gap: 4px; }
  nav button { display: flex; align-items: center; justify-content: center; gap: 12px; height: 48px; font-weight: 650; font-size: 15.5px; }
  nav button:hover { background: rgba(255, 255, 255, 0.08); color: var(--night-ink); }
  nav button.on { background: var(--birch); color: var(--ink-fixed); box-shadow: 0 3px 0 var(--birch-3); }
  nav .ico { transition: transform 260ms var(--spring); }
  nav button:active .ico { transform: scale(0.86); }
  .sb :global(:focus-visible) { outline-color: var(--sun); }

  .foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
  .goal { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 6px; text-align: left; }
  .goal:hover { background: rgba(255, 255, 255, 0.08); }
  .goal circle { transition: stroke-dashoffset 700ms var(--ease); }
  .gt b { display: block; font-size: 19px; color: var(--night-ink); line-height: 1.1; }
  .gt small { font-size: 12.5px; font-weight: 500; color: var(--night-ink-2); }
  .gt span { font-size: 12.5px; }
  .pair { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .pill { display: inline-flex; align-items: center; gap: 5px; height: 34px; padding: 0 10px 0 8px; border-radius: 99px; background: rgba(255, 255, 255, 0.07); font-size: 13px; font-weight: 650; color: var(--night-ink-2); }
  .pill b { font-size: 15px; color: var(--night-ink); }
  .pill.lit :global(svg) { color: #f87e1a; }
  .pill.lv i { display: grid; place-items: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 7px; background: var(--sun); color: #3c2a0b; font-style: normal; font-weight: 800; font-size: 12.5px; }
  .frz { display: inline-flex; align-items: center; gap: 2px; margin-left: 3px; padding-left: 6px; border-left: 1.5px solid var(--night-3); color: #68c4f1; }
  .frz b { color: #68c4f1; font-size: 13px; }
  .sync { display: flex; align-items: center; justify-content: center; gap: 9px; min-height: 40px; padding: 0 10px; font-size: 13px; font-weight: 600; text-align: left; }
  .sync:hover { background: rgba(255, 255, 255, 0.08); color: var(--night-ink); }
  /* the status is a shape as well as a colour: a full dot, a ring, a square */
  .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: #52db9c; }
  .off .dot { background: none; box-shadow: inset 0 0 0 2px var(--night-ink-2); }
  .wait .dot { background: none; box-shadow: inset 0 0 0 2px var(--sun); }
  .bad .dot { background: #fea387; border-radius: 2px; }
  .busy .dot { background: var(--sun); animation: pulse 900ms ease-in-out infinite alternate; }
  @keyframes pulse { to { opacity: 0.3; transform: scale(0.7); } }
  .who { margin-left: auto; max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; opacity: 0.8; }

  @media (min-width: 1280px) {
    .sb { width: 232px; padding: 18px 14px 14px; }
    .sb .lbl { display: inline; }
    .sb .pill.lbl { display: inline-flex; }
    .sb .gt { display: block; }
    .wm { display: block; }
    .brand { justify-content: flex-start; padding: 0 8px; }
    .jump, nav button { justify-content: flex-start; padding: 0 12px; }
    .goal { justify-content: flex-start; }
    .pair { flex-direction: row; padding: 0 4px; }
    .sync { justify-content: flex-start; }
  }
</style>
