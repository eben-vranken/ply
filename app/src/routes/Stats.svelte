<script lang="ts">
  import { go, run, app } from '../lib/state.svelte';
  import { model, allCards, summaries, drillItemsFor } from '../lib/model.svelte';
  import { loadStats, TYPES, STAGES, type StatsData } from '../lib/stats';
  import { moveOrder, sans } from '../lib/chess';
  import Plies from '../lib/Plies.svelte';
  import Icon from '../lib/Icon.svelte';
  import { levelOf } from '../lib/game';

  const NAMES = ['New', 'Learning', 'Young', 'Mature'];
  const TNAMES: Record<string, string> = { move: 'Move', punish: 'Punish', danger: 'Danger', puzzle: 'Puzzle', mistake: 'Mistake' };
  let S = $state<StatsData | null>(null);
  $effect(() => { void model.rev; void loadStats(allCards().values(), app.rollover).then((s) => (S = s)); });
  const ops = $derived(summaries());

  const byStage = $derived(S ? STAGES.map((_, k) => TYPES.reduce((n, t) => n + S!.totals[t][k], 0)) : [0, 0, 0, 0]);
  const all = $derived(byStage.reduce((a, b) => a + b, 0));
  const fmax = $derived(S ? Math.max(1, ...S.forecast) : 1);
  const weeks = $derived(S ? Array.from({ length: 53 }, (_, w) => S!.history.slice(w * 7, w * 7 + 7)) : []);
  const heat = (n: number) => (n === 0 ? 0 : n < 15 ? 1 : n < 35 ? 2 : n < 60 ? 3 : 4);
  const g = $derived(S?.games);
  const gx = (i: number) => 14 + (g && g.months.length > 1 ? (i / (g.months.length - 1)) * 300 : 150);
  const gy = (v: number) => 56 - Math.max(-1.5, Math.min(1.5, v)) * 30;
  const rr = $derived.by(() => { const v = (g?.rating ?? []).filter((x): x is number => x !== null); return v.length ? [Math.min(...v) - 20, Math.max(...v) + 20] : [0, 1]; });
  const ry = (v: number) => 90 - ((v - rr[0]) / (rr[1] - rr[0] || 1)) * 80;
  const linePath = (v: (number | null)[], y: (n: number) => number) => v.map((n, i) => (n === null ? '' : `${i ? 'L' : 'M'}${gx(i)} ${y(n)}`)).join(' ');
  const fmt = (x: number | undefined) => (x === undefined ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1));
  const target = $derived(app.retention);
  const lvl = $derived(levelOf(app.xp));
  // trophies come straight from what you have done: nothing is stored for them
  const trophies = $derived.by(() => {
    const learned = byStage[1] + byStage[2] + byStage[3], mature = byStage[3], longest = S?.longest ?? 0;
    const t = (icon: string, name: string, what: string, have: number, need: number) => ({ icon, name, what, have: Math.min(have, need), need, won: have >= need });
    return [
      t('layers', 'First layer', 'Learn a move', learned, 1),
      t('layers', 'Fifty deep', 'Learn 50 moves', learned, 50),
      t('layers', 'Bookworm', 'Learn 250 moves', learned, 250),
      t('layers', 'Walking book', 'Learn 1000 moves', learned, 1000),
      t('check', 'Seasoned', '10 mature moves', mature, 10),
      t('check', 'Hardwood', '100 mature moves', mature, 100),
      t('flame', 'One week', '7 day streak', longest, 7),
      t('flame', 'One month', '30 day streak', longest, 30),
      t('flame', 'Hundred days', '100 day streak', longest, 100),
      t('sword', 'Sharp', 'Arcade rating 1200', app.arcadeRating, 1200),
      t('sword', 'Tactician', 'Arcade rating 1500', app.arcadeRating, 1500),
      t('star', 'On a roll', '10 in a row in Arcade', app.arcadeBest, 10),
      t('star', 'Knighted', 'Reach level 5', lvl.level, 5),
      t('star', 'Royalty', 'Reach level 17', lvl.level, 17)
    ];
  });
  const won = $derived(trophies.filter((x) => x.won).length);
  function drill() {
    if (!S?.weakest.length) return;
    run.items = drillItemsFor(S.weakest.map((w) => w.card)); run.mode = 'drill'; run.title = 'Weakest cards'; run.more = undefined;
    go('/train');
  }
  const openCard = (c: StatsData['weakest'][number]['card']) => go(`/explore?side=${c.side}&p=${encodeURIComponent((c.path ?? []).join(' '))}`);
</script>

<div class="screen">
  <header class="screen-head">
    <div><p class="t-small">{all} cards · {S?.suspended ?? 0} suspended</p><h1 class="t-display">Stats</h1></div>
  </header>

  {#if S}
    <section class="card prof">
      <span class="badge t-num" aria-hidden="true">{lvl.level}</span>
      <div class="grow">
        <p class="t-head">Level {lvl.level} · {lvl.rank}</p>
        <div class="lbar" role="progressbar" aria-valuemin="0" aria-valuemax={lvl.span} aria-valuenow={lvl.into}><i style="width:{(lvl.into / lvl.span) * 100}%"></i></div>
        <p class="t-small">{app.xp.toLocaleString('en')} XP · {lvl.span - lvl.into} to level {lvl.level + 1} · {S.streak} day streak</p>
      </div>
    </section>

    <div class="sect"><h2 class="t-head">Trophies</h2><span class="t-small">{won} of {trophies.length}</span></div>
    <section class="troph">
      {#each trophies as t}
        <div class="tr" class:won={t.won}>
          <span class="ti"><Icon name={t.icon} size={22} fill={t.won && t.icon !== 'check' && t.icon !== 'sword' && t.icon !== 'layers'} /></span>
          <b>{t.name}</b>
          <small>{t.what}</small>
          {#if !t.won}<span class="tp"><i style="width:{(t.have / t.need) * 100}%"></i></span>{/if}
        </div>
      {/each}
    </section>

    <div class="sect"><h2 class="t-head">Your deck, in layers</h2></div>
    <section class="card">
      {#if all}
        <div class="xsec" role="img" aria-label="Cards by stage: {byStage[3]} mature, {byStage[2]} young, {byStage[1]} learning, {byStage[0]} new">
          {#each [3, 2, 1, 0] as k, i}
            {#if byStage[k]}
              <div style="flex:{byStage[k]};background:var(--st-{STAGES[k]});animation-delay:{i * 80}ms" class:lt={k === 0 || k === 2}>
                <span><Plies stage={STAGES[k]} size={16} /> {NAMES[k]}</span><b class="t-num">{byStage[k]}</b>
              </div>
            {/if}
          {/each}
        </div>
      {:else}
        <p class="t-small" style="margin:10px 0 14px">No cards yet. Start today's session and every move you learn is laid down here.</p>
      {/if}
      <table>
        <thead><tr><th></th>{#each NAMES as n}<th>{n}</th>{/each}</tr></thead>
        <tbody>
          {#each TYPES as t}<tr><th>{TNAMES[t]}</th>{#each S.totals[t] as n}<td>{n}</td>{/each}</tr>{/each}
        </tbody>
      </table>
    </section>

    <div class="sect"><h2 class="t-head">Next 30 days</h2><span class="t-small">reviews due per day</span></div>
    <section class="card">
      <div class="bars" role="img" aria-label="Forecast, {S.forecast[0]} due tomorrow">
        {#each S.forecast as n, i}<i style="height:{(n / fmax) * 100}%;animation-delay:{i * 14}ms" class:wk={i % 7 === 0}></i>{/each}
      </div>
      <div class="axis"><span>Tomorrow <b>{S.forecast[0]}</b></span><span>+2 weeks</span><span>+30 days</span></div>
    </section>

    <div class="sect"><h2 class="t-head">Past year</h2><span class="t-small">reviews per day</span></div>
    <section class="card">
      <div class="heat" role="img" aria-label="Review calendar">
        {#each weeks as w}<div>{#each w as n}<i class="h{heat(n)}"></i>{/each}</div>{/each}
      </div>
      <div class="row" style="margin-top:14px;align-items:flex-end">
        <div class="grow"><p class="t-small">Time spent, last 14 days</p><p class="t-num" style="font-size:26px">{Math.round(S.minutes.reduce((a, b) => a + b, 0) / 14)} <small>min a day</small></p></div>
        <div class="mins" aria-hidden="true">{#each S.minutes as m}<i style="height:{Math.min(48, m * 3 + 2)}px"></i>{/each}</div>
      </div>
    </section>

    <div class="sect"><h2 class="t-head">Retention</h2><span class="t-small">first-try correct, target {target}%</span></div>
    <section class="card ret">
      {#each [['Young', S.retention.young7, S.retention.young30], ['Mature', S.retention.mature7, S.retention.mature30]] as [n, a, b]}
        <div class="rrow">
          <span class="rn">{n}</span>
          {#each [[a, '7 days'], [b, '30 days']] as [v, l]}
            <div class="gauge">
              {#if v === null}
                <div class="track"><b style="left:{((target - 70) / 30) * 100}%"></b></div>
                <p><b class="t-num">—</b> {l} <span>no reviews yet</span></p>
              {:else}
                <div class="track"><i style="width:{Math.max(0, ((+v - 70) / 30) * 100)}%" class:under={+v < target}></i><b style="left:{((target - 70) / 30) * 100}%"></b></div>
                <p><b class="t-num">{v}%</b> {l} <span class:under={+v < target}>{+v < target ? `${target - +v} below` : `${+v - target} above`}</span></p>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    </section>

    <div class="sect"><h2 class="t-head">By opening</h2></div>
    <section class="card ops">
      {#each ops as o (o.key)}
        <button onclick={() => go(`/tree?side=${o.side}&p=${encodeURIComponent(o.path.join(' '))}`)}>
          <span class="t-name on">{o.name}<small>{o.section}</small></span>
          <span class="obar">{#each [3, 2, 1, 0] as k}<i style="flex:{o.stages[k]};background:var(--st-{STAGES[k]})"></i>{/each}</span>
          <span class="om"><b>{o.total ? Math.round((o.stages[3] / o.total) * 100) : 0}%</b> mature · <b>{o.coverage}%</b> covered</span>
        </button>
      {/each}
    </section>

    <div class="sect"><h2 class="t-head">Weakest cards</h2><span class="t-small">lapses, last 30 days</span></div>
    <section class="card weak">
      {#each S.weakest as w (w.card.id)}
        <button onclick={() => openCard(w.card)}>
          <span class="lap t-num">{w.lapses}</span>
          <span class="grow"><span class="t-name wn">{w.card.label}</span><span class="wo">{moveOrder(sans(w.card.path ?? []), true)}</span></span>
        </button>
      {:else}
        <p class="t-small">No lapses in the last 30 days.</p>
      {/each}
      {#if S.weakest.length}<button class="btn wide" style="margin-top:14px" onclick={drill}>Drill these</button>{/if}
    </section>

    <div class="sect"><h2 class="t-head">Your games</h2><span class="t-small">eval out of the opening, your view</span></div>
    <section class="card">
      {#if g && g.months.length}
        <svg viewBox="0 0 328 112" class="gchart" role="img" aria-label="Average eval after move 10 and 15 by month, with rapid rating">
          <line x1="14" x2="314" y1={gy(0)} y2={gy(0)} stroke="var(--line)" stroke-dasharray="3 4" />
          <path d={linePath(g.rating, ry)} fill="none" stroke="var(--line)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
          <path d={linePath(g.m15, gy)} fill="none" stroke="var(--birch-3)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          <path d={linePath(g.m10, gy)} fill="none" stroke="var(--cobalt)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          {#each g.months as m, i}
            <circle cx={gx(i)} cy={gy(g.m10[i])} r="4" fill="var(--card)" stroke="var(--cobalt)" stroke-width="2.5" />
            <text x={gx(i)} y="108" text-anchor="middle">{m}</text>
          {/each}
        </svg>
        <div class="legend">
          <span><i style="background:var(--cobalt)"></i>Move 10 <b>{fmt(g.m10.at(-1))}</b></span>
          <span><i style="background:var(--birch-3)"></i>Move 15 <b>{fmt(g.m15.at(-1))}</b></span>
          <span><i style="background:var(--line)"></i>Rapid <b>{g.rating.at(-1) ?? (app.rating || '—')}</b></span>
        </div>
      {:else}
        <p class="t-small">{app.username || app.lichessUser ? 'Shows up once your games are analysed.' : 'Add your chess.com or Lichess username in Settings to chart your games.'}</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .prof { display: flex; align-items: center; gap: 16px; }
  .badge { flex: none; width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center; background: var(--sun); color: #3d2800; font-size: 30px; box-shadow: 0 5px 0 #c98a12; margin-bottom: 5px; }
  .lbar { height: 10px; border-radius: 5px; background: var(--line); overflow: hidden; margin: 8px 0 7px; }
  .lbar i { display: block; height: 100%; border-radius: 5px; background: var(--sun); }
  .troph { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .tr { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 2px; padding: 14px 6px 12px; border-radius: 20px; background: var(--card); box-shadow: var(--shadow); color: var(--ink-3); }
  .tr b { font-size: 13.5px; color: var(--ink-2); line-height: 1.15; margin-top: 6px; }
  .tr small { font-size: 11.5px; font-weight: 500; line-height: 1.2; }
  .ti { width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center; background: var(--ground); }
  .tr.won { background: var(--birch); color: var(--walnut); box-shadow: 0 5px 0 var(--birch-3); margin-bottom: 5px; }
  .tr.won b { color: var(--ink-fixed); }
  .tr.won .ti { background: var(--sun); color: #3d2800; box-shadow: 0 3px 0 #c98a12; }
  .tp { width: 70%; height: 5px; border-radius: 3px; background: var(--ground); overflow: hidden; margin-top: 6px; }
  .tp i { display: block; height: 100%; background: var(--st-learning); border-radius: 3px; }
  .xsec { display: flex; flex-direction: column; gap: 3px; height: 236px; margin: 14px 0 16px; border-radius: 14px; overflow: hidden; }
  .xsec div { display: flex; align-items: center; justify-content: space-between; padding: 0 14px; color: #fff; min-height: 30px; font-weight: 650; font-size: 14px; border-radius: 4px; transform-origin: left; animation: lay 520ms var(--ease) both; }
  .xsec div.lt { color: var(--ink-fixed); }
  .xsec span { display: flex; align-items: center; gap: 8px; }
  .xsec :global(svg rect) { fill: currentColor; stroke: currentColor; }
  .xsec b { font-size: 22px; }
  @keyframes lay { from { transform: scaleX(0.2); opacity: 0; } }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: right; padding: 7px 0; font-weight: 500; }
  thead th { font-size: 12px; color: var(--ink-3); font-weight: 600; }
  tbody th { text-align: left; font-weight: 650; }
  tbody tr { border-top: 1px solid var(--ground); }

  .bars { display: flex; align-items: flex-end; gap: 3px; height: 120px; }
  .bars i { flex: 1; background: var(--accent-text); border-radius: 3px 3px 1px 1px; opacity: 0.35; transform-origin: bottom; animation: grow 480ms var(--ease) both; min-height: 2px; }
  .bars i.wk { opacity: 1; }
  @keyframes grow { from { transform: scaleY(0); } }
  .axis { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-3); margin-top: 8px; }
  .axis b { color: var(--ink); }

  .heat { display: flex; gap: 2px; }
  .heat div { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .heat i { aspect-ratio: 1; border-radius: 1.5px; background: var(--ground); }
  .heat .h1 { background: var(--h1); } .heat .h2 { background: var(--h2); } .heat .h3 { background: var(--h3); } .heat .h4 { background: var(--h4); }
  .mins { display: flex; align-items: flex-end; gap: 3px; height: 48px; }
  .mins i { width: 6px; border-radius: 2px; background: var(--birch-3); }
  small { font-size: 14px; font-weight: 500; color: var(--ink-2); letter-spacing: 0; }

  .rrow { display: grid; grid-template-columns: 62px 1fr 1fr; gap: 12px; align-items: center; padding: 8px 0; }
  .rrow + .rrow { border-top: 1px solid var(--ground); }
  .rn { font-weight: 650; }
  .track { position: relative; height: 8px; border-radius: 4px; background: var(--ground); }
  .track i { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: var(--good); }
  .track i.under { background: var(--st-learning); }
  .track b { position: absolute; top: -4px; width: 2px; height: 16px; background: var(--ink); }
  .gauge p { font-size: 12px; color: var(--ink-2); margin-top: 7px; line-height: 1.3; }
  .gauge p b { font-size: 17px; color: var(--ink); }
  .gauge p span { display: block; color: var(--good-text); font-weight: 600; }
  .gauge p span.under { color: var(--warn-text); }

  .ops button { display: block; width: 100%; text-align: left; padding: 11px 0; min-height: 44px; }
  .ops button + button { border-top: 1px solid var(--ground); }
  .on { font-size: 18px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .on small { font-family: var(--sans); font-style: normal; font-size: 12px; white-space: nowrap; }
  .obar { display: flex; gap: 2px; height: 10px; margin: 7px 0 6px; }
  .obar i { border-radius: 2px; }
  .om { font-size: 12.5px; color: var(--ink-2); }
  .om b { color: var(--ink); }

  .weak > button:not(.btn) { display: flex; gap: 12px; align-items: center; width: 100%; text-align: left; padding: 9px 0; min-height: 52px; }
  .weak > button:not(.btn) + button:not(.btn) { border-top: 1px solid var(--ground); }
  .lap { width: 36px; height: 36px; flex: none; border-radius: 11px; background: var(--bad-tint); color: var(--bad-text); display: grid; place-items: center; font-size: 18px; }
  .wn { display: block; font-size: 17px; line-height: 1.15; }
  .wo { display: block; font-size: 12.5px; color: var(--ink-2); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 270px; }

  .gchart { width: 100%; height: auto; display: block; margin-top: 4px; }
  .gchart text { font-size: 10px; fill: var(--ink-3); font-family: var(--sans); font-weight: 600; }
  .legend { display: flex; gap: 14px; font-size: 12.5px; color: var(--ink-2); margin-top: 10px; flex-wrap: wrap; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }
  .legend b { color: var(--ink); margin-left: 3px; }
</style>
