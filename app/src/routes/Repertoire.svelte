<script lang="ts">
  import { go, app } from '../lib/state.svelte';
  import { model, isFocus as mastered, searchOpenings, summaries, resetSection, rareCards, retireRare, allCards, deleteCard, nameOf, sectionCoverage, type OpeningSummary } from '../lib/model.svelte';
  import { db, type GameRow } from '../lib/db';
  import { sans, moveOrder, epdAfter, san } from '../lib/chess';
  import type { Section } from '../lib/srs/lines';
  import Sigil from '../lib/Sigil.svelte';
  import Icon from '../lib/Icon.svelte';
  import ImportSheet from '../lib/ImportSheet.svelte';

  const sections: Section[] = ['White', 'Black vs 1.e4', 'Black vs 1.d4', 'Black vs others'];
  const STAGES = ['new', 'learning', 'young', 'mature'];
  const HUES = ['#2b4bee', '#cf331c', '#0f7a55', '#b9770a', '#7a3fc4', '#0b7f93'];
  const all = $derived(summaries());
  const isFocus = (o: OpeningSummary) => { void model.rev; return mastered(o.side, o.path); };
  let q = $state('');
  const hits = $derived.by(() => { void model.rev; return searchOpenings(q); });
  const open = (o: { side: 'w' | 'b'; path: string[] }) => go(`/tree?side=${o.side}&p=${encodeURIComponent(o.path.join(' '))}`);
  const totals = $derived({ lines: all.reduce((n, o) => n + o.lines, 0), learned: all.reduce((n, o) => n + o.learned, 0), total: all.reduce((n, o) => n + o.total, 0) });
  const rare = $derived.by(() => { void model.rev; return rareCards(); });
  const cov = $derived.by(() => { void model.rev; return { w: Math.round(sectionCoverage('w') * 100), b: Math.round(sectionCoverage('b') * 100) }; });

  let asking = $state<Section | null>(null);
  let importing = $state(false);
  let toast = $state('');
  function done(msg: string) { importing = false; toast = msg; setTimeout(() => (toast = ''), 6000); }
  let games = $state<GameRow[]>([]);
  $effect(() => { void model.rev; void db.games.orderBy('date').reverse().toArray().then((g) => (games = g)); });
  const withCards = $derived(games.filter((g) => (g.mistakes ?? []).some((id) => allCards().has(id))));
  const uncovered = $derived.by(() => {
    const m = new Map<string, { path: string[]; side: 'w' | 'b'; times: number }>();
    for (const g of games) if (g.uncovered) {
      const k = g.colour + g.uncovered.join(' ');
      const cur = m.get(k) ?? { path: g.uncovered, side: g.colour, times: 0 };
      cur.times++; m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.times - a.times).slice(0, 12);
  });

  // swipe left to delete a mistake card
  let drag = $state<Record<string, number>>({});
  let sx = 0;
  function move(id: string, e: TouchEvent) { drag[id] = Math.min(0, e.touches[0].clientX - sx); }
  async function drop(id: string) { if ((drag[id] ?? 0) < -110) await deleteCard(id); drag[id] = 0; }
  async function reset(s: Section) { asking = null; await resetSection(s); }
  const label = (id: string) => {
    const c = allCards().get(id);
    if (!c) return null;
    const ply = c.path?.length ?? 0;
    const num = ply % 2 === 0 ? `${ply / 2 + 1}.` : `${(ply + 1) / 2}…`;
    return { id, text: num + san(c.epd, c.played ?? c.move), loss: c.loss ?? 0 };
  };
</script>

<div class="screen">
  <header class="screen-head">
    <div>
      <p class="t-small">{totals.lines} lines · {totals.learned} of {totals.total} moves learned · {model.band} band</p>
      <h1 class="t-display">Repertoire</h1>
    </div>
  </header>

  <label class="search">
    <Icon name="search" size={20} />
    <input type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Search your openings" aria-label="Search your openings" bind:value={q} />
    {#if q}<button onclick={() => (q = '')} aria-label="Clear search"><Icon name="close" size={18} /></button>{/if}
  </label>

  {#if !q.trim()}
    <div class="io">
      <button class="btn quiet sm" onclick={() => (importing = true)}><Icon name="plus" size={18} /> Import PGN</button>
    </div>
  {/if}
  {#if toast}<p class="toast" role="status">{toast}</p>{/if}

  {#if q.trim()}
    <div class="stack">
      {#each hits as h, i (h.side + h.name)}
        <button class="card op" onclick={() => open(h)}>
          <Sigil path={h.path.slice(0, 8)} hue={HUES[i % HUES.length]} flip={h.side === 'b'} you={h.side} size={48} />
          <span class="grow">
            <span class="t-name nm sm">{h.name}{#if h.eco}<span class="eco">{h.eco}</span>{/if}</span>
            <span class="meta">{h.side === 'w' ? 'White' : 'Black'} · {moveOrder(sans(h.path))}</span>
          </span>
          <Icon name="next" size={18} />
        </button>
      {:else}
        <p class="t-small none">Nothing in your lines matches “{q.trim()}”. Try part of a name, a code like C50, or moves like e4 e5 Nf3.</p>
      {/each}
    </div>
  {:else}
  {#each sections as s}
    {@const ops = all.filter((o) => o.section === s)}
    <div class="sect">
      <h2 class="t-head">{s}{#if s === 'White'}<span class="sc">{cov.w}% covered</span>{:else if s === 'Black vs 1.e4'}<span class="sc">Black {cov.b}% covered</span>{/if}</h2>
      <button class="link" onclick={() => (asking = asking === s ? null : s)}>Reset to defaults</button>
    </div>
    {#if asking === s}
      <div class="confirm card" role="alert">
        <p class="t-small">Put {s} back on the starter repertoire? Cards for moves you no longer play are retired; everything else keeps its schedule.</p>
        <div class="row" style="gap:8px;margin-top:10px"><button class="btn quiet sm grow" onclick={() => (asking = null)}>Cancel</button><button class="btn sm grow" onclick={() => reset(s)}>Reset</button></div>
      </div>
    {/if}
    <div class="stack">
      {#each ops as o, i (o.key)}
        <button class="card op" onclick={() => open(o)}>
          <Sigil path={o.path.slice(0, 8)} hue={HUES[i % HUES.length]} flip={o.side === 'b'} you={o.side} size={60} />
          <span class="grow">
            <span class="t-name nm">{o.name}{#if o.eco}<span class="eco">{o.eco}</span>{/if}</span>
            <span class="meta">{#if isFocus(o)}<b class="fc"><Icon name="star" size={13} fill /> Mastering</b>{/if}{o.lines} line{o.lines === 1 ? '' : 's'} · {o.learned}/{o.total} moves</span>
            <span class="bar" role="img" aria-label="{o.stages[3]} mature, {o.stages[2]} young, {o.stages[1]} learning, {o.stages[0]} new">
              {#each [3, 2, 1, 0] as k}<i style="flex:{o.stages[k]};background:var(--st-{STAGES[k]})"></i>{/each}
            </span>
          </span>
          <span class="cov"><b class="t-num">{o.coverage}<small>%</small></b><span>covered</span></span>
        </button>
      {:else}
        <p class="t-small">No lines here yet.</p>
      {/each}
    </div>
  {/each}

  <div class="sect"><h2 class="t-head">Uncovered in your games</h2></div>
  <div class="stack">
    {#each uncovered as u}
      {@const end = epdAfter(u.path)}
      <div class="card unc">
        <div class="grow">
          <p class="t-name nm">{nameOf(end, u.path)[1]}{#if nameOf(end, u.path)[0]}<span class="eco">{nameOf(end, u.path)[0]}</span>{/if}</p>
          <p class="meta">{moveOrder(sans(u.path))} · met {u.times} time{u.times === 1 ? '' : 's'}</p>
        </div>
        <button class="btn quiet sm" onclick={() => go(`/explore?side=${u.side}&p=${encodeURIComponent(u.path.join(' '))}`)}>Learn from here</button>
      </div>
    {:else}
      <p class="t-small">{app.username ? 'Every reply your opponents played is in your lines.' : 'Sync your chess.com games to see replies your lines miss.'}</p>
    {/each}
  </div>

  <div class="sect"><h2 class="t-head">Mistakes</h2>{#if withCards.length}<span class="t-small">Swipe a card left to delete</span>{/if}</div>
  <div class="stack">
    {#each withCards.slice(0, 30) as g (g.url)}
      <div class="card game">
        <p class="gh"><b>vs {g.opponent}</b><span>{g.colour === 'w' ? 'White' : 'Black'} · {g.result === 'win' ? 'Won' : g.result === 'draw' ? 'Drew' : 'Lost'} · {new Date(g.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></p>
        {#each (g.mistakes ?? []).map(label).filter((x) => !!x) as c (c!.id)}
          <div class="swipe">
            <span class="del"><Icon name="trash" size={18} /> Delete</span>
            <div class="mc" style="transform:translateX({drag[c!.id] ?? 0}px)" role="listitem"
              ontouchstart={(e) => (sx = e.touches[0].clientX)} ontouchmove={(e) => move(c!.id, e)} ontouchend={() => drop(c!.id)}>
              <span class="q">?</span>{c!.text}<span class="loss">−{c!.loss}% win chance</span>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="t-small">{app.username ? 'No mistake cards yet. They appear as your games are analysed.' : 'Add your chess.com username in Settings, or paste PGN there.'}</p>
    {/each}
  </div>

  <div class="sect"><h2 class="t-head">Rare cards</h2></div>
  <div class="card unc">
    <p class="grow t-small"><b style="color:var(--ink)">{rare.length} card{rare.length === 1 ? '' : 's'}</b> sit in positions your lines no longer reach at this band. They keep their schedule until you retire them.</p>
    <button class="btn quiet sm" onclick={retireRare} disabled={!rare.length}>Retire rare cards</button>
  </div>
  {/if}
</div>

{#if importing}<ImportSheet onclose={() => (importing = false)} ondone={done} />{/if}

<style>
  .io { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .toast { margin-top: 12px; padding: 12px 14px; border-radius: 14px; background: var(--ink); color: var(--on-ink); font-size: 14px; animation: rise 200ms var(--ease) both; }
  .sc { font-family: var(--sans); font-size: 12.5px; font-weight: 600; color: var(--ink-3); margin-left: 8px; }
  .search { display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 8px 0 16px; margin-bottom: 4px; border-radius: 18px; background: var(--card); box-shadow: var(--shadow); color: var(--ink-3); }
  .search:focus-within { outline: 3px solid var(--cobalt); outline-offset: 1px; }
  .search input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: none; font-size: 16px; color: var(--ink); user-select: text; }
  .search input::placeholder { color: var(--ink-3); }
  .search input::-webkit-search-cancel-button { display: none; }
  .search button { width: 40px; height: 40px; display: grid; place-items: center; color: var(--ink-2); }
  .search + .stack { margin-top: 14px; }
  .nm.sm { font-size: 18px; }
  .none { padding: 6px 4px; }
  .op { display: flex; align-items: center; gap: 14px; text-align: left; width: 100%; padding: 12px 16px 12px 12px; transition: transform 120ms var(--ease); }
  .op:active { transform: scale(0.98); }
  .nm { display: block; font-size: 20px; line-height: 1.12; }
  .meta { display: block; font-size: 13px; color: var(--ink-2); margin-top: 3px; }
  .fc { display: inline-flex; align-items: center; gap: 3px; margin-right: 7px; color: var(--warn-text); font-weight: 700; vertical-align: -1px; }
  .bar { display: flex; gap: 2px; height: 6px; margin-top: 9px; }
  .bar i { border-radius: 2px; min-width: 0; }
  .cov { text-align: right; display: flex; flex-direction: column; }
  .cov b { font-size: 24px; line-height: 1; }
  .cov small { font-size: 13px; color: var(--ink-3); }
  .cov span { font-size: 11.5px; color: var(--ink-3); }
  .confirm { margin-bottom: 10px; }
  .unc { display: flex; align-items: center; gap: 12px; }
  .btn.sm { min-height: 44px; padding: 0 14px; font-size: 14.5px; border-radius: 13px; box-shadow: 0 4px 0 var(--edge); white-space: nowrap; }
  .gh { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
  .gh span { font-size: 13px; color: var(--ink-2); }
  .swipe { position: relative; margin-top: 6px; border-radius: 12px; overflow: hidden; background: var(--bad); }
  .del { position: absolute; right: 14px; top: 0; bottom: 0; display: flex; align-items: center; gap: 6px; color: #fff; font-weight: 650; font-size: 14px; }
  .mc { position: relative; display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 0 12px; background: var(--ground); font-weight: 650; transition: transform 160ms var(--ease); touch-action: pan-y; }
  .q { width: 24px; height: 24px; border-radius: 7px; background: var(--bad); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 14px; }
  .loss { margin-left: auto; font-weight: 500; font-size: 13px; color: var(--ink-2); }
</style>
