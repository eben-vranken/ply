<script lang="ts">
  import { app, go, run } from '../lib/state.svelte';
  import { model, todayCounts, itemsFor, requeue, arcade, allCards, grantExtraNew } from '../lib/model.svelte';
  import { loadStats, type StatsData } from '../lib/stats';
  import { sync } from '../lib/import/sync.svelte';
  import type { Item } from '../lib/session';
  import { dayStart } from '../lib/srs/queue';
  import { whenText } from '../lib/srs/fsrs';
  import Sigil from '../lib/Sigil.svelte';
  import Icon from '../lib/Icon.svelte';

  const counts = $derived.by(() => { void model.rev; return todayCounts(); });
  const firstItems = $derived(itemsFor(counts.queue.slice(0, 1)));
  const next = $derived<Item | undefined>(firstItems[0]);
  const nextPath = $derived(next ? [...next.setup, ...next.moves].slice(0, 6) : []);
  const nextName = $derived(next?.label.replace(/ \([A-E]\d\d\)$/, '') ?? '');
  const nextEco = $derived(next?.label.match(/\(([A-E]\d\d)\)$/)?.[1] ?? '');
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayIdx = (new Date().getDay() + 6) % 7;
  const staleBackup = $derived(allCards().size > 0 && Date.now() - app.lastBackup > 7 * 864e5);
  const rollText = $derived(`${String(app.rollover).padStart(2, '0')}:00`);
  // learning cards due again before the next rollover
  const nextDue = $derived.by(() => {
    void model.rev;
    const now = Date.now(), end = dayStart(now, app.rollover) + 864e5;
    const soon = [...allCards().values()].filter((c) => !c.suspended && c.fsrs.state !== 0 && c.due > now && c.due < end);
    return soon.length ? { n: soon.length, at: Math.min(...soon.map((c) => c.due)) } : null;
  });

  let stats = $state<StatsData | null>(null);
  $effect(() => { void model.rev; void loadStats(allCards().values(), app.rollover).then((s) => (stats = s)); });

  function start() {
    run.items = itemsFor(counts.queue); run.mode = 'today'; run.title = 'Today';
    run.more = () => requeue();
    go('/train');
  }
  function extra() {
    grantExtraNew(5);
    const q = todayCounts().queue.filter((i) => i.kind === 'new');
    if (!q.length) return;
    run.items = itemsFor(q); run.mode = 'today'; run.title = 'Extra new moves'; run.more = () => requeue();
    go('/train');
  }
  /** endless positions with their own rating; nothing here reaches the cards */
  function playArcade() {
    const a = arcade();
    const first = a.next();
    if (!first.length) return;
    run.items = first; run.mode = 'drill'; run.title = 'Arcade'; run.rare = false; run.more = () => a.next(); run.arcade = a.result;
    go('/train');
  }
  const kindLine: Record<string, string> = { line: 'Review', new: 'New move', punish: 'Punish', danger: 'Danger', puzzle: 'Puzzle', mistake: 'Your mistake', drill: 'Drill' };
  const spark = (v: number[]) => v.length < 2 ? '' : v.map((y, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1)) * 300} ${20 - Math.max(-2, Math.min(2, y)) * 12}`).join(' ');
  const fmt = (x: number | null) => (x === null ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1));
</script>

<div class="screen">
  <header class="screen-head">
    <div>
      <p class="t-small">{date}</p>
      <h1 class="t-display">Today</h1>
    </div>
    <div class="streak" aria-label="{stats?.streak ?? 0} day streak">
      <span class="pile" aria-hidden="true"><i></i><i></i><i></i></span>
      <b class="t-num">{stats?.streak ?? 0}</b><span>{stats?.streak === 1 ? 'day' : 'days'}</span>
    </div>
  </header>

  <section class="slab" style="animation: rise 420ms var(--ease) both">
    {#if next}
      <div class="art"><Sigil path={nextPath} size={176} bare draw flip={next.side === 'b'} hue="var(--cobalt)" /></div>
      <p class="up">First up · {kindLine[next.kind]}</p>
      <h2 class="t-name name">{nextName.split(':')[0]}</h2>
      <p class="sub">{nextName.includes(':') ? nextName.split(': ')[1] : next.side === 'w' ? 'You play White' : 'You play Black'} {#if nextEco}<span class="eco">{nextEco}</span>{/if}</p>
      <dl class="counts">
        <div><dd class="t-num">{counts.due}</dd><dt>Due</dt></div>
        <div><dd class="t-num">{counts.fresh}</dd><dt>New</dt></div>
        <div><dd class="t-num">{counts.done}</dd><dt>Done today</dt></div>
      </dl>
      <button class="btn big wide" onclick={start}><Icon name="play" size={20} fill /> {counts.done ? 'Continue' : 'Start'}</button>
    {:else}
      <div class="art done"><span class="tick"><Icon name="check" size={56} /></span></div>
      <p class="up">{counts.done} answer{counts.done === 1 ? '' : 's'} today</p>
      <h2 class="t-name name">Done for today</h2>
      <p class="sub">{nextDue ? `${nextDue.n} card${nextDue.n === 1 ? '' : 's'} come${nextDue.n === 1 ? 's' : ''} back ${whenText(nextDue.at)}.` : `Nothing else is due until tomorrow, ${rollText}.`}</p>
      <div class="row" style="margin-top:22px">
        <button class="btn grow" onclick={playArcade}><Icon name="sword" size={18} /> Arcade</button>
        <button class="btn quiet" onclick={extra}><Icon name="plus" size={18} /> 5 new</button>
      </div>
    {/if}
    <div class="edge" aria-hidden="true"></div>
  </section>

  <section class="card arc">
    <div class="grow">
      <h3 class="t-head">Arcade</h3>
      <p class="t-small">Endless puzzles, traps and positions from your openings. Your cards stay as they are.</p>
      <p class="arcnum"><span><b class="t-num">{app.arcadeRating}</b> rating</span><span><b class="t-num">{app.arcadeBest}</b> best streak</span><span><b class="t-num">{app.arcadeSolved}</b> solved</span></p>
    </div>
    <button class="btn" onclick={playArcade} aria-label="Play Arcade"><Icon name="play" size={20} fill /></button>
  </section>

  {#if sync.analysing || sync.running}
    <div class="card syncing" role="status">
      <p class="t-small">{sync.text}</p>
      {#if sync.total}<div class="meter"><i style="width:{(sync.done / sync.total) * 100}%"></i></div>{/if}
    </div>
  {/if}

  <div class="duo">
    <section class="card">
      <p class="t-small">7-day retention</p>
      <p class="pct t-num">{stats?.retention7 ?? '—'}{#if stats?.retention7 != null}<small>%</small>{/if}</p>
      <div class="meter" role="img" aria-label="{stats?.retention7 ?? 0} percent, target {app.retention} percent"><i style="width:{stats?.retention7 ?? 0}%"></i><b style="left:{app.retention}%"></b></div>
      <p class="t-small">Target {app.retention}%</p>
    </section>
    <section class="card">
      <p class="t-small">This week</p>
      <div class="week">
        {#each week as d, i}
          {@const hit = stats?.week[i] ?? false}
          <div class:hit class:now={i === todayIdx}>
            <span>{#if hit}<Icon name="check" size={13} />{/if}</span>{d}
          </div>
        {/each}
      </div>
      <p class="t-small" style="margin-top:10px">Longest streak {stats?.longest ?? 0} day{stats?.longest === 1 ? '' : 's'}</p>
    </section>
  </div>

  {#if staleBackup}
    <button class="banner" onclick={() => go('/settings')}>
      <Icon name="share" size={20} />
      <span class="grow"><b>No backup in over a week</b><br /><span class="t-small">Export one from Settings</span></span>
      <Icon name="next" size={18} />
    </button>
  {/if}

  <section class="card games">
    <div><h3 class="t-head">Out of the opening</h3><p class="t-small">Average eval in your last 30 games, your view</p></div>
    {#if stats && stats.spark10.length > 1}
      <svg viewBox="-4 -6 308 52" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" x2="300" y1="20" y2="20" stroke="var(--line)" stroke-dasharray="3 4" />
        <path d={spark(stats.spark15)} fill="none" stroke="var(--birch-3)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <path d={spark(stats.spark10)} fill="none" stroke="var(--cobalt)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <div class="legend">
        <span><i style="background:var(--cobalt)"></i>After move 10 <b>{fmt(stats.avg10)}</b></span>
        <span><i style="background:var(--birch-3)"></i>After move 15 <b>{fmt(stats.avg15)}</b></span>
      </div>
    {:else}
      <p class="t-small empty">{app.username ? 'Appears once a few of your games are analysed.' : 'Add your chess.com name in Settings to see how you leave the opening.'}</p>
    {/if}
  </section>
</div>

<style>
  .streak { display: flex; gap: 6px; height: 44px; padding: 0 14px 0 12px; background: var(--card); border-radius: 99px; box-shadow: var(--shadow); align-items: center; font-size: 14px; color: var(--ink-2); }
  .streak b { font-size: 20px; color: var(--ink); }
  .pile { display: flex; flex-direction: column; gap: 2px; width: 18px; }
  .pile i { height: 4px; border-radius: 2px; background: var(--sun); }
  .pile i:nth-child(2) { background: var(--st-learning); }
  .pile i:nth-child(3) { background: var(--bad); }

  .slab { position: relative; color: var(--ink-fixed); background: var(--birch); border-radius: var(--r-xl); padding: 22px 20px 34px; overflow: hidden; box-shadow: 0 18px 28px -16px rgba(111, 76, 44, 0.55); }
  .slab .edge { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: linear-gradient(#d8bb8a 0 2px, #b08a57 2px 5px, #e0c797 5px 8px, #a67f4d 8px 11px, #d2b382 11px 14px); }
  .art { position: absolute; right: -22px; top: -18px; color: var(--walnut); transform: rotate(8deg); }
  .art.done { right: 14px; top: 18px; transform: none; }
  .tick { display: grid; place-items: center; width: 92px; height: 92px; border-radius: 50%; background: var(--good); color: #fff; animation: pop 420ms var(--spring) both; }
  .up { font-size: 14px; font-weight: 650; color: var(--walnut); position: relative; }
  .name { font-size: 46px; line-height: 0.98; margin-top: 4px; max-width: 250px; position: relative; }
  .sub { margin-top: 8px; font-size: 15px; color: var(--walnut); position: relative; max-width: 240px; }
  .arc { display: flex; align-items: center; gap: 14px; margin-top: 14px; }
  .arc .btn { flex: none; width: 60px; min-height: 60px; padding: 0; border-radius: 20px; }
  .arcnum { margin-top: 10px; font-size: 13px; color: var(--ink-2); display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; }
  .arcnum b { font-size: 20px; color: var(--ink); margin-right: 2px; }
  .counts { display: flex; gap: 8px; margin: 22px 0 18px; }
  .counts div { flex: 1; background: rgba(255, 255, 255, 0.55); border-radius: 16px; padding: 10px 12px 9px; }
  .counts dd { margin: 0; font-size: 30px; line-height: 1; }
  .counts dt { font-size: 12.5px; font-weight: 600; color: var(--walnut); margin-top: 3px; }

  .syncing { margin-top: 12px; }
  .syncing .meter { margin: 10px 0 0; }
  .duo { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
  .pct { font-size: 44px; line-height: 1; margin: 2px 0 10px; }
  .pct small { font-size: 22px; margin-left: 2px; color: var(--ink-3); }
  .meter { position: relative; height: 8px; border-radius: 4px; background: var(--line); margin-bottom: 8px; }
  .meter i { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: var(--good); }
  .meter b { position: absolute; top: -4px; width: 2px; height: 16px; background: var(--ink); border-radius: 1px; }
  .week { display: flex; justify-content: space-between; margin-top: 12px; }
  .week div { display: flex; flex-direction: column; align-items: center; gap: 5px; font-size: 11px; font-weight: 650; color: var(--ink-3); }
  .week span { width: 17px; height: 26px; border-radius: 6px; border: 1.6px solid var(--line); display: grid; place-items: center; color: #fff; }
  .week .hit span { background: var(--cobalt); border-color: var(--cobalt); }
  .week .now { color: var(--ink); }
  .week .now span { border-color: var(--ink); }
  .week .now.hit span { border-color: var(--cobalt); }

  .banner { width: 100%; text-align: left; display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 14px 16px; border-radius: var(--r-l); background: var(--sun-tint); color: var(--sun-ink); min-height: 56px; font-size: 15px; }
  .banner .t-small { color: var(--sun-ink); }
  .games { margin-top: 12px; }
  .games svg { width: 100%; height: 76px; margin: 12px 0 8px; overflow: visible; }
  .games .empty { margin-top: 10px; }
  .legend { display: flex; gap: 18px; font-size: 13px; color: var(--ink-2); }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }
  .legend b { color: var(--ink); margin-left: 4px; }
</style>
