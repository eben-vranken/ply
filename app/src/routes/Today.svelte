<script lang="ts">
  import { app, save, go, run } from '../lib/state.svelte';
  import { SESSION, STATS, nameOf, type Item } from '../lib/demo';
  import Sigil from '../lib/Sigil.svelte';
  import Icon from '../lib/Icon.svelte';

  const asks = (it: Item) => it.moves.filter((_, i) => ((it.setup.length + i) % 2 === 0) === (it.side === 'w')).length;
  const left = $derived(SESSION.slice(Math.min(app.doneToday, SESSION.length)));
  const due = $derived(left.filter((i) => i.kind !== 'new').reduce((n, i) => n + asks(i), 0));
  const fresh = $derived(left.filter((i) => i.kind === 'new').length * 1 + (left.length ? 9 : 0));
  const doneCount = $derived(SESSION.slice(0, app.doneToday).reduce((n, i) => n + asks(i), 0));
  const next = $derived(left[0]);
  const nextPath = $derived(next ? [...next.setup, ...next.moves].slice(0, 6) : []);
  const nextName = $derived(next ? nameOf([...next.setup, ...next.moves]) : ['', '']);
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayIdx = (new Date().getDay() + 6) % 7;
  const staleBackup = $derived(Date.now() - app.lastBackup > 7 * 864e5);

  function start() { run.items = left; run.mode = 'today'; run.title = 'Today'; go('/train'); }
  function extra() {
    app.extraNew += 5; save();
    run.items = SESSION.filter((i) => i.kind === 'new'); run.mode = 'today'; run.title = 'Extra new moves'; go('/train');
  }
  const spark = (v: number[]) => v.map((y, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1)) * 300} ${34 - (y + 1.3) * 22}`).join(' ');
</script>

<div class="screen">
  <header class="screen-head">
    <div>
      <p class="t-small">{date}</p>
      <h1 class="t-display">Today</h1>
    </div>
    <div class="streak" aria-label="{app.streak} day streak">
      <span class="pile" aria-hidden="true"><i></i><i></i><i></i></span>
      <b class="t-num">{app.streak}</b><span>days</span>
    </div>
  </header>

  <section class="slab" style="animation: rise 420ms var(--ease) both">
    {#if next}
      <div class="art"><Sigil path={nextPath} size={176} bare draw flip={next.side === 'b'} hue="var(--cobalt)" /></div>
      <p class="up">First up</p>
      <h2 class="t-name name">{nextName[1].split(':')[0]}</h2>
      <p class="sub">{nextName[1].includes(':') ? nextName[1].split(': ')[1] : 'Main line'} <span class="eco">{nextName[0]}</span></p>
      <dl class="counts">
        <div><dd class="t-num">{due}</dd><dt>Due</dt></div>
        <div><dd class="t-num">{fresh}</dd><dt>New</dt></div>
        <div><dd class="t-num">{doneCount}</dd><dt>Done today</dt></div>
      </dl>
      <button class="btn big wide" onclick={start}><Icon name="play" size={20} fill /> {app.doneToday ? 'Continue' : 'Start'}</button>
    {:else}
      <div class="art done"><span class="tick"><Icon name="check" size={56} /></span></div>
      <p class="up">{doneCount} moves reviewed</p>
      <h2 class="t-name name">Done for today</h2>
      <p class="sub">Nothing else is due until tomorrow, 04:00.</p>
      <div class="row" style="margin-top:22px">
        <button class="btn grow" onclick={() => go('/explore')}>Explore</button>
        <button class="btn quiet grow" onclick={extra}><Icon name="plus" size={18} /> 5 new moves</button>
      </div>
      <button class="link" style="margin-top:6px" onclick={() => { app.doneToday = 0; save(); }}>Replay the demo session</button>
    {/if}
    <div class="edge" aria-hidden="true"></div>
  </section>

  <div class="duo">
    <section class="card">
      <p class="t-small">7-day retention</p>
      <p class="pct t-num">91<small>%</small></p>
      <div class="meter" role="img" aria-label="91 percent, target 90 percent"><i style="width:91%"></i><b style="left:90%"></b></div>
      <p class="t-small">Target 90%</p>
    </section>
    <section class="card">
      <p class="t-small">This week</p>
      <div class="week">
        {#each week as d, i}
          <div class:hit={i < todayIdx || (i === todayIdx && app.doneToday > 0)} class:now={i === todayIdx}>
            <span>{#if i < todayIdx || (i === todayIdx && app.doneToday > 0)}<Icon name="check" size={13} />{/if}</span>{d}
          </div>
        {/each}
      </div>
      <p class="t-small" style="margin-top:10px">Longest streak 31 days</p>
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
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div><h3 class="t-head">Out of the opening</h3><p class="t-small">Average eval in your last 30 games</p></div>
    </div>
    <svg viewBox="-4 -6 308 52" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="300" y1={34 - 1.3 * 22} y2={34 - 1.3 * 22} stroke="var(--line)" stroke-dasharray="3 4" />
      <path d={spark(STATS.spark15)} fill="none" stroke="var(--birch-3)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <path d={spark(STATS.spark10)} fill="none" stroke="var(--cobalt)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <div class="legend">
      <span><i style="background:var(--cobalt)"></i>After move 10 <b>+0.1</b></span>
      <span><i style="background:var(--birch-3)"></i>After move 15 <b>−0.2</b></span>
    </div>
  </section>
</div>

<style>
  .streak { display: flex; align-items: baseline; gap: 6px; height: 44px; padding: 0 14px 0 12px; background: var(--card); border-radius: 99px; box-shadow: var(--shadow); align-items: center; font-size: 14px; color: var(--ink-2); }
  .streak b { font-size: 20px; color: var(--ink); }
  .pile { display: flex; flex-direction: column; gap: 2px; width: 18px; }
  .pile i { height: 4px; border-radius: 2px; background: var(--sun); }
  .pile i:nth-child(2) { background: var(--st-learning); }
  .pile i:nth-child(3) { background: var(--bad); }

  .slab { --wash: rgba(21, 25, 54, 0.08); position: relative; color: var(--ink-fixed); background: var(--birch); border-radius: var(--r-xl); padding: 22px 20px 34px; overflow: hidden; box-shadow: 0 18px 28px -16px rgba(111, 76, 44, 0.55); }
  .slab .edge { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: linear-gradient(#d8bb8a 0 2px, #b08a57 2px 5px, #e0c797 5px 8px, #a67f4d 8px 11px, #d2b382 11px 14px); }
  .art { position: absolute; right: -22px; top: -18px; color: var(--walnut); transform: rotate(8deg); }
  .art.done { right: 14px; top: 18px; transform: none; }
  .tick { display: grid; place-items: center; width: 92px; height: 92px; border-radius: 50%; background: var(--good); color: #fff; animation: pop 420ms var(--spring) both; }
  .up { font-size: 14px; font-weight: 650; color: var(--walnut); }
  .name { font-size: 46px; line-height: 0.98; margin-top: 4px; max-width: 250px; position: relative; }
  .sub { margin-top: 8px; font-size: 15px; color: var(--walnut); position: relative; max-width: 240px; }
  .counts { display: flex; gap: 8px; margin: 22px 0 18px; }
  .counts div { flex: 1; background: rgba(255, 255, 255, 0.55); border-radius: 16px; padding: 10px 12px 9px; }
  .counts dd { margin: 0; font-size: 30px; line-height: 1; }
  .counts dt { font-size: 12.5px; font-weight: 600; color: var(--walnut); margin-top: 3px; }

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
  .legend { display: flex; gap: 18px; font-size: 13px; color: var(--ink-2); }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }
  .legend b { color: var(--ink); margin-left: 4px; }
</style>
