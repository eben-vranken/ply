<script lang="ts">
  import { go, run } from '../lib/state.svelte';
  import { STATS, OPENINGS, SESSION } from '../lib/demo';
  import Plies from '../lib/Plies.svelte';
  import type { Stage } from '../lib/demo';

  const STAGES: Stage[] = ['new', 'learning', 'young', 'mature'];
  const NAMES = ['New', 'Learning', 'Young', 'Mature'];
  const types = Object.keys(STATS.totals);
  const byStage = STAGES.map((_, k) => types.reduce((n, t) => n + STATS.totals[t][k], 0));
  const all = byStage.reduce((a, b) => a + b, 0);
  const fmax = Math.max(...STATS.forecast);
  const weeks = Array.from({ length: 53 }, (_, w) => STATS.history.slice(w * 7, w * 7 + 7));
  const heat = (n: number) => (n === 0 ? 0 : n < 15 ? 1 : n < 35 ? 2 : n < 60 ? 3 : 4);
  const g = STATS.games;
  const gx = (i: number) => 14 + (i / (g.months.length - 1)) * 300;
  const gy = (v: number) => 70 - (v + 1.2) * 44;
  const ry = (v: number) => 84 - ((v - 790) / 120) * 76;
  const linePath = (v: number[], y: (n: number) => number) => v.map((n, i) => `${i ? 'L' : 'M'}${gx(i)} ${y(n)}`).join(' ');
  function drill() { run.items = SESSION.filter((i) => i.kind === 'line' || i.kind === 'punish'); run.mode = 'drill'; run.title = 'Weakest cards'; go('/train'); }
  const R = STATS.retention;
</script>

<div class="screen">
  <header class="screen-head">
    <div><p class="t-small">{all} cards · {STATS.suspended} suspended</p><h1 class="t-display">Stats</h1></div>
  </header>

  <!-- Totals: the whole deck as one plywood cross-section -->
  <section class="card">
    <h2 class="t-head">Your deck, in layers</h2>
    <div class="xsec" role="img" aria-label="Cards by stage">
      {#each [3, 2, 1, 0] as k, i}
        <div style="flex:{byStage[k]};background:var(--st-{STAGES[k]});animation-delay:{i * 80}ms" class:lt={k === 0 || k === 2}>
          <span><Plies stage={STAGES[k]} size={16} /> {NAMES[k]}</span><b class="t-num">{byStage[k]}</b>
        </div>
      {/each}
    </div>
    <table>
      <thead><tr><th></th>{#each NAMES as n}<th>{n}</th>{/each}</tr></thead>
      <tbody>
        {#each types as t}<tr><th>{t}</th>{#each STATS.totals[t] as n}<td>{n}</td>{/each}</tr>{/each}
      </tbody>
    </table>
  </section>

  <div class="sect"><h2 class="t-head">Next 30 days</h2><span class="t-small">reviews due per day</span></div>
  <section class="card">
    <div class="bars" role="img" aria-label="Forecast, {STATS.forecast[0]} due tomorrow">
      {#each STATS.forecast as n, i}<i style="height:{(n / fmax) * 100}%;animation-delay:{i * 14}ms" class:wk={i % 7 === 0}></i>{/each}
    </div>
    <div class="axis"><span>Tomorrow <b>{STATS.forecast[0]}</b></span><span>+2 weeks</span><span>+30 days</span></div>
  </section>

  <div class="sect"><h2 class="t-head">Past year</h2><span class="t-small">reviews per day</span></div>
  <section class="card">
    <div class="heat" role="img" aria-label="Review calendar">
      {#each weeks as w}<div>{#each w as n}<i class="h{heat(n)}"></i>{/each}</div>{/each}
    </div>
    <div class="row" style="margin-top:14px;align-items:flex-end">
      <div class="grow"><p class="t-small">Time spent, last 14 days</p><p class="t-num" style="font-size:26px">{Math.round(STATS.minutes.reduce((a, b) => a + b, 0) / 14)} <small>min a day</small></p></div>
      <div class="mins" aria-hidden="true">{#each STATS.minutes as m}<i style="height:{m * 3}px"></i>{/each}</div>
    </div>
  </section>

  <div class="sect"><h2 class="t-head">Retention</h2><span class="t-small">first-try correct, target {R.target}%</span></div>
  <section class="card ret">
    {#each [['Young', R.young7, R.young30], ['Mature', R.mature7, R.mature30]] as [n, a, b]}
      <div class="rrow">
        <span class="rn">{n}</span>
        {#each [[a, '7 days'], [b, '30 days']] as [v, l]}
          <div class="gauge">
            <div class="track"><i style="width:{((+v - 70) / 30) * 100}%" class:under={+v < R.target}></i><b style="left:{((R.target - 70) / 30) * 100}%"></b></div>
            <p><b class="t-num">{v}%</b> {l} <span class:under={+v < R.target}>{+v < R.target ? `${R.target - +v} below` : `${+v - R.target} above`}</span></p>
          </div>
        {/each}
      </div>
    {/each}
  </section>

  <div class="sect"><h2 class="t-head">By opening</h2></div>
  <section class="card ops">
    {#each OPENINGS as o}
      <button onclick={() => go('/repertoire')}>
        <span class="t-name on">{o.name.replace('Italian Game: ', '')}<small>{o.side === 'w' ? 'White' : 'Black'}</small></span>
        <span class="obar">{#each [3, 2, 1, 0] as k}<i style="flex:{o.stages[k]};background:var(--st-{STAGES[k]})"></i>{/each}</span>
        <span class="om"><b>{Math.round((o.stages[3] / o.total) * 100)}%</b> mature · <b>{o.coverage}%</b> covered</span>
      </button>
    {/each}
  </section>

  <div class="sect"><h2 class="t-head">Weakest cards</h2><span class="t-small">lapses, last 30 days</span></div>
  <section class="card weak">
    {#each STATS.weakest as w}
      <button onclick={() => go('/explore')}>
        <span class="lap t-num">{w.lapses}</span>
        <span class="grow"><span class="t-name wn">{w.name}<span class="eco">{w.eco}</span></span><span class="wo">{w.order}</span></span>
      </button>
    {/each}
    <button class="btn wide" style="margin-top:14px" onclick={drill}>Drill these</button>
  </section>

  <div class="sect"><h2 class="t-head">Your games</h2><span class="t-small">eval out of the opening</span></div>
  <section class="card">
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
      <span><i style="background:var(--cobalt)"></i>Move 10 <b>+0.1</b></span>
      <span><i style="background:var(--birch-3)"></i>Move 15 <b>−0.2</b></span>
      <span><i style="background:var(--line)"></i>Rapid <b>{g.rating.at(-1)}</b></span>
    </div>
  </section>
</div>

<style>
  .xsec { display: flex; flex-direction: column; gap: 3px; height: 236px; margin: 14px 0 16px; border-radius: 14px; overflow: hidden; }
  .xsec div { display: flex; align-items: center; justify-content: space-between; padding: 0 14px; color: #fff; min-height: 30px; font-weight: 650; font-size: 14px; border-radius: 4px; transform-origin: left; animation: lay 520ms var(--ease) both; }
  .xsec div.lt { color: var(--ink); }
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
  .bars i { flex: 1; background: var(--cobalt); border-radius: 3px 3px 1px 1px; opacity: 0.35; transform-origin: bottom; animation: grow 480ms var(--ease) both; }
  .bars i.wk { opacity: 1; }
  @keyframes grow { from { transform: scaleY(0); } }
  .axis { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-3); margin-top: 8px; }
  .axis b { color: var(--ink); }

  .heat { display: flex; gap: 2px; }
  .heat div { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .heat i { aspect-ratio: 1; border-radius: 1.5px; background: var(--ground); }
  .heat .h1 { background: #c8d2fb; } .heat .h2 { background: #8fa3f6; } .heat .h3 { background: var(--cobalt); } .heat .h4 { background: var(--ink); }
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
  .gauge p span { display: block; color: var(--good); font-weight: 600; }
  .gauge p span.under { color: #a85a00; }

  .ops button { display: block; width: 100%; text-align: left; padding: 11px 0; min-height: 44px; }
  .ops button + button { border-top: 1px solid var(--ground); }
  .on { font-size: 18px; display: flex; justify-content: space-between; align-items: baseline; }
  .on small { font-family: var(--sans); font-style: normal; font-size: 12px; }
  .obar { display: flex; gap: 2px; height: 10px; margin: 7px 0 6px; }
  .obar i { border-radius: 2px; }
  .om { font-size: 12.5px; color: var(--ink-2); }
  .om b { color: var(--ink); }

  .weak > button:not(.btn) { display: flex; gap: 12px; align-items: center; width: 100%; text-align: left; padding: 9px 0; min-height: 52px; }
  .weak > button:not(.btn) + button:not(.btn) { border-top: 1px solid var(--ground); }
  .lap { width: 36px; height: 36px; flex: none; border-radius: 11px; background: var(--bad-tint); color: var(--bad); display: grid; place-items: center; font-size: 18px; }
  .wn { display: block; font-size: 17px; line-height: 1.15; }
  .wo { display: block; font-size: 12.5px; color: var(--ink-2); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 270px; }

  .gchart { width: 100%; height: auto; display: block; margin-top: 4px; }
  .gchart text { font-size: 10px; fill: var(--ink-3); font-family: var(--sans); font-weight: 600; }
  .legend { display: flex; gap: 14px; font-size: 12.5px; color: var(--ink-2); margin-top: 10px; flex-wrap: wrap; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }
  .legend b { color: var(--ink); margin-left: 3px; }
</style>
