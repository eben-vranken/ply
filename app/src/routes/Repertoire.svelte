<script lang="ts">
  import { go } from '../lib/state.svelte';
  import { OPENINGS, MISTAKES, UNCOVERED, type Opening } from '../lib/demo';
  import Sigil from '../lib/Sigil.svelte';
  import Icon from '../lib/Icon.svelte';

  const sections = ['White', 'Black vs 1.e4', 'Black vs 1.d4', 'Black vs others'] as const;
  const open = (o: Opening) => go(`/explore?side=${o.side}&p=${encodeURIComponent(o.path.join(' '))}`);
  const STAGES = ['new', 'learning', 'young', 'mature'];
  let games = $state(MISTAKES.map((g) => ({ ...g, cards: g.cards.map((c) => ({ text: c, dx: 0 })) })));
  let resetMsg = $state('');
  let sx = 0;
  function drag(c: { dx: number }, e: TouchEvent) { c.dx = Math.min(0, e.touches[0].clientX - sx); }
  function drop(gi: number, ci: number) {
    const c = games[gi].cards[ci];
    if (c.dx < -110) games[gi].cards.splice(ci, 1); else c.dx = 0;
  }
  const totals = $derived({ lines: OPENINGS.reduce((n, o) => n + o.lines, 0), learned: OPENINGS.reduce((n, o) => n + o.learned, 0), total: OPENINGS.reduce((n, o) => n + o.total, 0) });
</script>

<div class="screen">
  <header class="screen-head">
    <div>
      <p class="t-small">{totals.lines} lines · {totals.learned} of {totals.total} moves learned</p>
      <h1 class="t-display">Repertoire</h1>
    </div>
  </header>

  {#each sections as s}
    <div class="sect">
      <h2 class="t-head">{s}</h2>
      <button class="link" onclick={() => { resetMsg = s; setTimeout(() => (resetMsg = ''), 2200); }}>Reset to defaults</button>
    </div>
    {#if resetMsg === s}<p class="note" role="status">{s} is already on the starter repertoire.</p>{/if}
    <div class="stack">
      {#each OPENINGS.filter((o) => o.section === s) as o (o.id + o.section)}
        <button class="card op" onclick={() => open(o)}>
          <Sigil path={o.path} hue={o.hue} flip={o.side === 'b'} size={60} />
          <span class="grow">
            <span class="t-name nm">{o.name.replace('Italian Game: ', '')}<span class="eco">{o.eco}</span></span>
            <span class="meta">{o.lines} lines · {o.learned}/{o.total} moves</span>
            <span class="bar" role="img" aria-label="{o.stages[3]} mature, {o.stages[2]} young, {o.stages[1]} learning, {o.stages[0]} new">
              {#each [3, 2, 1, 0] as k}<i style="flex:{o.stages[k]};background:var(--st-{STAGES[k]})"></i>{/each}
            </span>
          </span>
          <span class="cov"><b class="t-num">{o.coverage}<small>%</small></b><span>covered</span></span>
        </button>
      {/each}
    </div>
  {/each}

  <div class="sect"><h2 class="t-head">Uncovered in your games</h2></div>
  <div class="stack">
    {#each UNCOVERED as u}
      <div class="card unc">
        <div class="grow">
          <p class="t-name nm">{u.name}<span class="eco">{u.eco}</span></p>
          <p class="meta">{u.order} · met {u.times} times</p>
        </div>
        <button class="btn quiet sm" onclick={() => go(`/explore?side=${u.order.endsWith('h6') ? 'w' : 'b'}&p=${encodeURIComponent(u.path)}`)}>Learn</button>
      </div>
    {/each}
  </div>

  <div class="sect"><h2 class="t-head">Mistakes</h2><span class="t-small">Swipe a card left to delete</span></div>
  <div class="stack">
    {#each games as g, gi}
      <div class="card game">
        <p class="gh"><b>vs {g.opponent}</b><span>{g.colour} · {g.result} · {g.date}</span></p>
        {#each g.cards as c, ci (c.text)}
          <div class="swipe">
            <span class="del"><Icon name="trash" size={18} /> Delete</span>
            <div class="mc" style="transform:translateX({c.dx}px)" role="listitem"
              ontouchstart={(e) => (sx = e.touches[0].clientX)} ontouchmove={(e) => drag(c, e)} ontouchend={() => drop(gi, ci)}>
              <span class="q">?</span>{c.text.split(' lost ')[0]}<span class="loss">−{c.text.split(' lost ')[1]} win chance</span>
            </div>
          </div>
        {/each}
        {#if !g.cards.length}<p class="t-small">No cards left from this game.</p>{/if}
      </div>
    {/each}
  </div>

  <div class="sect"><h2 class="t-head">Rare cards</h2></div>
  <div class="card unc">
    <p class="grow t-small"><b style="color:var(--ink)">3 cards</b> sit in positions your band no longer reaches. They keep their schedule until you retire them.</p>
    <button class="btn quiet sm">Retire</button>
  </div>
</div>

<style>
  .op { display: flex; align-items: center; gap: 14px; text-align: left; width: 100%; padding: 12px 16px 12px 12px; transition: transform 120ms var(--ease); }
  .op:active { transform: scale(0.98); }
  .nm { display: block; font-size: 20px; line-height: 1.12; }
  .meta { display: block; font-size: 13px; color: var(--ink-2); margin-top: 3px; }
  .bar { display: flex; gap: 2px; height: 6px; margin-top: 9px; }
  .bar i { border-radius: 2px; min-width: 0; }
  .cov { text-align: right; display: flex; flex-direction: column; }
  .cov b { font-size: 24px; line-height: 1; }
  .cov small { font-size: 13px; color: var(--ink-3); }
  .cov span { font-size: 11.5px; color: var(--ink-3); }
  .note { margin: -4px 4px 10px; font-size: 13.5px; color: var(--ink-2); }
  .unc { display: flex; align-items: center; gap: 12px; }
  .btn.sm { min-height: 44px; padding: 0 16px; font-size: 15px; border-radius: 13px; box-shadow: 0 4px 0 var(--edge); }
  .gh { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
  .gh span { font-size: 13px; color: var(--ink-2); }
  .swipe { position: relative; margin-top: 6px; border-radius: 12px; overflow: hidden; background: var(--bad); }
  .del { position: absolute; right: 14px; top: 0; bottom: 0; display: flex; align-items: center; gap: 6px; color: #fff; font-weight: 650; font-size: 14px; }
  .mc { position: relative; display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 0 12px; background: var(--ground); font-weight: 650; transition: transform 160ms var(--ease); touch-action: pan-y; }
  .q { width: 24px; height: 24px; border-radius: 7px; background: var(--bad); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 14px; }
  .loss { margin-left: auto; font-weight: 500; font-size: 13px; color: var(--ink-2); }
</style>
