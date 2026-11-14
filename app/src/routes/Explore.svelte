<script lang="ts">
  import { Chess } from 'chess.js';
  import { route, go, run } from '../lib/state.svelte';
  import { TREE, MY, LINES, epdOf, nameOf, evalGlyph, evalText, type Side, type Item, type Stage } from '../lib/demo';
  import Board from '../lib/Board.svelte';
  import Icon from '../lib/Icon.svelte';
  import Plies from '../lib/Plies.svelte';

  const q = new URLSearchParams(route.path.split('?')[1] ?? '');
  let side = $state<Side>((q.get('side') as Side) ?? 'w');
  let path = $state<string[]>(q.get('p')?.split(' ').filter(Boolean) ?? []);
  let search = $state('');
  let toast = $state('');

  const pos = $derived.by(() => {
    const c = new Chess();
    let last: [string, string] | null = null;
    for (const m of path) { const mv = c.move(m); last = [mv.from, mv.to]; }
    return { fen: c.fen(), last, turn: c.turn() as Side };
  });
  const node = $derived(TREE.get(epdOf(pos.fen)));
  const name = $derived(nameOf(path));
  const mine = $derived(pos.turn === side ? (MY[side].get(epdOf(pos.fen)) ?? []) : []);
  const below = $derived(LINES.filter((l) => l.side === side && l.san.length > path.length && path.every((m, i) => l.san[i] === m)));
  const PUNISH = new Set(['e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+']);
  const DANGER = new Set(['e4 e5 Qh5 Nc6 Bc4 g6', 'e4 e5 Nf3 Nc6 Bc4 Nd4']);
  const stageOf = (s: string): Stage => (['mature', 'young', 'learning', 'young', 'new'] as Stage[])[(s.length * 7 + s.charCodeAt(0)) % 5];

  const hits = $derived.by(() => {
    const s = search.trim().toLowerCase();
    if (s.length < 2) return [];
    const seen = new Set<string>();
    return [...TREE.values()].filter((n) => n.name.toLowerCase().includes(s) && !seen.has(n.name) && seen.add(n.name)).sort((a, b) => a.path.length - b.path.length).slice(0, 6);
  });

  function launch(mode: 'learn' | 'drill') {
    const items: Item[] = below
      .map((l) => ({ kind: mode === 'learn' ? ('new' as const) : ('line' as const), side, setup: path.slice(), moves: l.san.slice(path.length), prompt: mode === 'learn' ? 'New move' : 'Your move' }))
      .filter((it) => it.moves.some((_, i) => ((it.setup.length + i) % 2 === 0) === (side === 'w')));
    if (!items.length) { toast = 'No lines of yours pass through here in the demo data.'; setTimeout(() => (toast = ''), 2600); return; }
    run.items = items; run.mode = mode; run.title = name[1]; go('/train');
  }
  let sx = 0;
  const back = () => { if (path.length) path = path.slice(0, -1); };
</script>

<div class="screen">
  <header class="screen-head">
    <h1 class="t-display">Explore</h1>
    <div class="seg" role="group" aria-label="Playing as">
      <button class:on={side === 'w'} onclick={() => (side = 'w')}><i class="pc w"></i>White</button>
      <button class:on={side === 'b'} onclick={() => (side = 'b')}><i class="pc b"></i>Black</button>
    </div>
  </header>

  <label class="search">
    <Icon name="search" size={20} />
    <input placeholder="Search every opening" bind:value={search} />
    {#if search}<button onclick={() => (search = '')} aria-label="Clear search"><Icon name="close" size={18} /></button>{/if}
  </label>
  {#if hits.length}
    <ul class="hits card">
      {#each hits as h}
        <li><button onclick={() => { path = h.path.slice(); search = ''; }}><span class="t-name">{h.name}</span><span class="eco">{h.eco}</span></button></li>
      {/each}
    </ul>
  {/if}

  <div class="where">
    <p class="t-name nm">{name[1]}{#if name[0]}<span class="eco">{name[0]}</span>{/if}</p>
    <div class="crumbs">
      <button class="crumb home" onclick={() => (path = [])} aria-label="Start position">Start</button>
      {#each path as m, i}
        <button class="crumb" class:cur={i === path.length - 1} onclick={() => (path = path.slice(0, i + 1))}>{#if i % 2 === 0}<em>{i / 2 + 1}.</em>{/if}{m}</button>
      {/each}
    </div>
  </div>

  <div class="bw" role="presentation" ontouchstart={(e) => (sx = e.touches[0].clientX)} ontouchend={(e) => { if (e.changedTouches[0].clientX - sx > 70) back(); }}>
    <Board fen={pos.fen} {side} lastMove={pos.last} />
  </div>

  <div class="acts">
    <button class="btn quiet sq" onclick={back} disabled={!path.length} aria-label="Step back"><Icon name="back" /></button>
    <button class="btn grow" onclick={() => launch('learn')}>Learn from here</button>
    <button class="btn quiet grow" onclick={() => launch('drill')}>Drill</button>
  </div>
  {#if toast}<p class="toast" role="status">{toast}</p>{/if}

  <section class="card list">
    {#if node?.moves.length}
      <div class="lh"><span>Move</span><span>Played</span><span>Results</span><span>Eval</span></div>
      {#each node.moves as m, i (m.san)}
        {@const key = [...path, m.san].join(' ')}
        <button class="mv" onclick={() => (path = [...path, m.san])}>
          <span class="san">
            {m.san}
            <span class="marks">
              {#if mine.includes(m.san)}<span class="mk star" title="Your move"><Icon name="star" size={14} fill /></span><Plies stage={stageOf(key)} size={14} />
              {:else if i === 0 && pos.turn === side}<span class="mk dot" title="Default move"></span>{/if}
              {#if PUNISH.has(key)}<span class="mk sw" title="A Punish trap follows"><Icon name="sword" size={14} /></span>{/if}
              {#if DANGER.has(key)}<span class="mk wr" title="Danger: popular but losing"><Icon name="warn" size={14} /></span>{/if}
            </span>
          </span>
          <span class="pct"><b>{Math.round(m.freq * 100)}%</b><small>{m.games.toLocaleString('en')}</small></span>
          <span class="wdl" role="img" aria-label="White {m.w}%, draw {m.d}%, Black {m.b}%"><i class="w" style="width:{m.w}%"></i><i class="d" style="width:{m.d}%"></i><i class="b" style="width:{m.b}%"></i></span>
          <span class="ev"><b>{evalGlyph(m.cp)}</b><small>{evalText(m.cp)}</small></span>
        </button>
      {/each}
    {:else}
      <div class="empty">
        <p class="t-head">The book ends here</p>
        <p class="t-small">Fewer than 50 games at your band reach this position, so there is nothing reliable to show.</p>
      </div>
    {/if}
  </section>

  <p class="legend">
    <span><span class="mk star"><Icon name="star" size={13} fill /></span>Your move</span>
    <span><span class="mk dot"></span>Default</span>
    <span><span class="mk sw"><Icon name="sword" size={13} /></span>Punish follows</span>
    <span><span class="mk wr"><Icon name="warn" size={13} /></span>Danger</span>
  </p>

  <div class="sect"><h2 class="t-head">Traps below this position</h2></div>
  <section class="card traps">
    {#if below.length}
      <div><b class="t-num">{Math.max(1, Math.round(below.length * 0.8))}</b><span>Punish</span></div>
      <div><b class="t-num">{Math.ceil(below.length / 3)}</b><span>Danger</span></div>
      <div><b class="t-num">{below.length * 4 + 3}</b><span>Puzzles</span></div>
    {:else}
      <p class="t-small">No traps or puzzles start below this position.</p>
    {/if}
  </section>
</div>

<style>
  .seg { display: flex; background: var(--card); border-radius: 14px; padding: 4px; box-shadow: var(--shadow); }
  .seg button { height: 38px; padding: 0 12px; border-radius: 10px; font-weight: 650; font-size: 14px; display: flex; align-items: center; gap: 7px; color: var(--ink-2); }
  .seg button.on { background: var(--ink); color: #fff; }
  .pc { width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; }
  .pc.w { background: #fff; border-color: var(--ink-3); }
  .pc.b { background: var(--ink); border-color: var(--ink-3); }
  .search { display: flex; align-items: center; gap: 10px; height: 50px; padding: 0 14px; background: var(--card); border-radius: 16px; box-shadow: var(--shadow); color: var(--ink-3); }
  .search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; height: 100%; color: var(--ink); user-select: text; }
  .search input::placeholder { color: var(--ink-3); }
  .search button { width: 44px; height: 44px; display: grid; place-items: center; margin-right: -12px; }
  .hits { list-style: none; margin: 8px 0 0; padding: 6px; }
  .hits button { width: 100%; text-align: left; min-height: 46px; padding: 6px 10px; font-size: 18px; border-radius: 12px; }
  .hits button:active { background: var(--ground); }

  .where { margin: 18px 0 12px; }
  .nm { font-size: 27px; line-height: 1.08; }
  .crumbs { display: flex; gap: 4px; overflow-x: auto; margin: 10px -16px 0; padding: 0 16px; scrollbar-width: none; }
  .crumbs::-webkit-scrollbar { display: none; }
  .crumb { flex: none; height: 34px; padding: 0 9px; border-radius: 10px; font-weight: 600; font-size: 14.5px; color: var(--ink-2); background: rgba(21, 25, 54, 0.06); }
  .crumb em { font-style: normal; opacity: 0.55; margin-right: 2px; font-weight: 500; }
  .crumb.cur { background: var(--ink); color: #fff; }

  .bw { position: relative; }
  .backbtn { position: absolute; left: -6px; bottom: 26px; width: 48px; height: 48px; border-radius: 50%; background: var(--ink); color: #fff; display: grid; place-items: center; box-shadow: 0 6px 14px rgba(21, 25, 54, 0.35); }
  .acts { display: flex; gap: 10px; margin: 20px 0 6px; }
  .acts .btn { padding: 0 14px; font-size: 16px; white-space: nowrap; }
  .acts .sq { width: 52px; padding: 0; }
  .toast { margin-top: 12px; padding: 12px 14px; border-radius: 14px; background: var(--ink); color: #fff; font-size: 14px; animation: rise 200ms var(--ease) both; }

  .list { padding: 6px 6px 8px; margin-top: 16px; }
  .lh, .mv { display: grid; grid-template-columns: 96px 62px 1fr 44px; align-items: center; gap: 10px; padding: 0 10px; }
  .lh { font-size: 11.5px; font-weight: 600; color: var(--ink-3); height: 30px; }
  .lh span:last-child { text-align: right; }
  .mv { width: 100%; min-height: 54px; text-align: left; border-radius: 16px; border-top: 1px solid var(--ground); }
  .mv:active { background: var(--ground); }
  .san { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; display: flex; align-items: center; gap: 6px; }
  .marks { display: flex; align-items: center; gap: 4px; }
  .mk { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 6px; flex: none; }
  .mk.star { color: var(--cobalt); }
  .mk.dot::after { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--ink-3); }
  .mk.sw { background: var(--good-tint); color: var(--good); }
  .mk.wr { background: var(--bad-tint); color: var(--bad); }
  .pct b, .ev b { display: block; font-size: 15px; }
  .pct small, .ev small { font-size: 11.5px; color: var(--ink-3); }
  .ev { text-align: right; }
  .ev b { font-size: 17px; font-weight: 600; }
  .empty { padding: 22px 14px; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 12px 6px 0; font-size: 12.5px; color: var(--ink-2); }
  .legend > span { display: inline-flex; align-items: center; gap: 5px; }
  .traps { display: flex; gap: 8px; }
  .traps div { flex: 1; display: flex; flex-direction: column; }
  .traps b { font-size: 28px; }
  .traps span { font-size: 13px; color: var(--ink-2); }
</style>
