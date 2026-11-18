<script lang="ts">
  import { Chess } from 'chess.js';
  import { route, go, run, app } from '../lib/state.svelte';
  import { model, data, movesAt, nameOf, stageAt, deviations, adoptPath, learnRound, subtreeNew, subtreeTraps, drillLine, drillTrapItems, trapPreview, puzzlePreview, getCtx } from '../lib/model.svelte';
  import { epdAfter, epdOf, child, san, sans, turnOf, evalGlyph, evalText, fenOf, dests as destsOf, type Side } from '../lib/chess';
  import { replies } from '../lib/srs/lines';
  import type { Item } from '../lib/session';
  import Board from '../lib/Board.svelte';
  import Icon from '../lib/Icon.svelte';
  import Plies from '../lib/Plies.svelte';
  import MoveEditor from '../lib/MoveEditor.svelte';
  import Promo from '../lib/Promo.svelte';
  import MoveInput from '../lib/MoveInput.svelte';
  import type { KeyAction } from '../lib/keys';
  import type { DrawShape } from '@lichess-org/chessground/draw';
  import MiniBoard from '../lib/MiniBoard.svelte';
  import { desk } from '../lib/desk.svelte';
  import { takeOff } from '../lib/flight';
  import { MoveTree } from '../lib/tree.svelte';
  import NavBar from '../lib/NavBar.svelte';

  const q = new URLSearchParams(route.path.split('?')[1] ?? '');
  let side = $state<Side>((q.get('side') as Side) ?? 'w');
  // the moves you have been through, as on Lichess: back and forward walk it, a new move is a variation
  const tree = new MoveTree();
  tree.setPath(q.get('p')?.split(' ').filter(Boolean) ?? []);
  const path = $derived.by(() => { void tree.rev; return tree.path; });
  const setPath = (p: string[]) => tree.setPath(p);
  const playMove = (u: string) => { tree.play(u); };
  // the crumbs: the way here, then where forward leads (dimmed)
  const crumbs = $derived.by(() => { void tree.rev; const c = tree.cur; return { done: tree.lineTo(c), ahead: tree.mainFrom(c) }; });
  // your own arrows, per position
  let arrows = $state<Record<string, DrawShape[]>>({});
  let search = $state('');
  let toast = $state('');
  let editing = $state(false);
  let confirmDev = $state<{ epd: string; uci: string; ply: number }[] | null>(null);
  let drillOpen = $state(false);
  let rare = $state(false);
  let preview = $state<'punish' | 'danger' | 'puzzles' | null>(null);
  let showRare = $state(false);
  // follow the URL when another screen (or a link here) opens a position
  let lastRoute = route.path;
  $effect(() => {
    const r = route.path;
    if (r === lastRoute || !r.startsWith('/explore')) return;
    lastRoute = r;
    const p = new URLSearchParams(r.split('?')[1] ?? '');
    side = (p.get('side') as Side) ?? side;
    setPath(p.get('p')?.split(' ').filter(Boolean) ?? []);
  });
  $effect(() => { void path; showRare = false; preview = null; });

  const epd = $derived(epdAfter(path));
  const pos = $derived.by(() => {
    const c = new Chess(fenOf(epd));
    const last = path.length ? [path.at(-1)!.slice(0, 2), path.at(-1)!.slice(2, 4)] as [string, string] : null;
    return { fen: c.fen(), last, turn: turnOf(epd), check: c.inCheck(), dests: destsOf(c) };
  });
  const node = $derived.by(() => { void model.rev; return data()?.tree[epd]; });
  const name = $derived(nameOf(epd, path));
  const mine = $derived.by(() => { void model.rev; return pos.turn === side ? movesAt(side, epd) : []; });
  const ctx = getCtx();
  const punishAfter = $derived(new Set((node?.m ?? []).filter(([u]) => { const t = ctx?.punishAt.get(child(epd, u)); return !!t; }).map(([u]) => u)));
  const dangerHere = $derived(new Set((data()?.traps ?? []).filter((t) => t.kind === 'danger' && t.epd === epd).map((t) => t.bait!)));
  const rows = $derived((node?.m ?? []).map(([u, g, w, d, b]) => {
    const t = w + d + b || 1;
    const c = data()?.tree[child(epd, u)];
    return { u, san: san(epd, u), g, freq: node!.g ? g / node!.g : 0, w: Math.round((w / t) * 100), d: Math.round((d / t) * 100), b: Math.round((b / t) * 100), cp: c?.e ?? null };
  }));
  const traps = $derived.by(() => { void model.rev; return subtreeTraps(side, path); });
  const newBelow = $derived.by(() => { void model.rev; return subtreeNew(side, path).length; });

  const hits = $derived.by(() => {
    const s = search.trim().toLowerCase();
    if (s.length < 2 || !data()) return [];
    const words = s.split(/\s+/);
    return data()!.openings.filter((o) => words.every((w) => o.name.toLowerCase().includes(w) || o.eco.toLowerCase() === w)).sort((a, b) => a.uci.length - b.uci.length).slice(0, 8);
  });

  function say(t: string) { toast = t; setTimeout(() => (toast = ''), 2800); }
  const back = () => { tree.back(); };
  let promo = $state<{ from: string; to: string } | null>(null);
  let boardRev = $state(0);
  function onBoardMove(from: string, to: string) {
    const c = new Chess(fenOf(epd));
    const p = c.get(from as never);
    if (p?.type === 'p' && (to[1] === '8' || to[1] === '1')) { promo = { from, to }; return; }
    playMove(from + to);
  }
  const legalNow = () => (editing || confirmDev || promo ? null : new Chess(pos.fen).moves({ verbose: true }).map((m) => ({ san: m.san, uci: m.from + m.to + (m.promotion ?? '') })));
  function onkey(a: KeyAction): boolean {
    if (a === 'undo') return tree.back();
    if (a === 'back' || a === 'fwd' || a === 'first' || a === 'last') { tree.key(a); return true; }
    if (a === 'stop' && drillOpen) { drillOpen = false; return true; }
    return false;
  }
  function pickPromo(piece: string) { const p = promo!; promo = null; playMove(p.from + p.to + piece); }
  function cancelPromo() { promo = null; boardRev++; }

  // ---------- Learn from here
  function learn() {
    const dev = deviations(side, path);
    if (dev.length) { confirmDev = dev; return; }
    startLearn();
  }
  async function adopt() { await adoptPath(side, path); confirmDev = null; startLearn(); }
  function startLearn() {
    const first = learnRound(side, path);
    if (!first.length) { say(subtreeNew(side, path).length ? 'Nothing new to learn here yet.' : 'Every move below here is already learned or in your reviews.'); return; }
    const at = path.slice();
    run.items = first; run.mode = 'learn'; run.title = name[1];
    run.more = (missed: Item[]) => {
      const again = missed.map((m) => ({ ...m, asks: Object.fromEntries(Object.entries(m.asks).map(([k, a]) => [k, { ...a, intro: false, graded: false }])), prompt: 'Your move', spec: undefined }));
      return [...again, ...learnRound(side, at)];
    };
    fly();
    go('/train');
  }

  // ---------- Drill from here
  function drill(mode: 'lines' | 'traps' | 'mixed') {
    const at = path.slice();
    const trapItems = drillTrapItems(side, at);
    if (mode === 'traps' && !trapItems.length) { say('No traps or puzzles start below this position.'); return; }
    const first = mode === 'traps' ? trapItems.slice(0, 1) : [drillLine(side, at, rare)].filter((x): x is Item => !!x);
    if (!first.length) { say('The tree ends here: there is nothing to drill.'); return; }
    let n = 0, ti = mode === 'traps' ? 1 : 0;
    run.items = first; run.mode = 'drill'; run.title = name[1]; run.rare = rare;
    run.more = () => {
      n++;
      const wantTrap = mode === 'traps' || (mode === 'mixed' && n % 2 === 1 && trapItems.length);
      if (wantTrap) { const t = trapItems[ti++ % trapItems.length]; return t ? [{ ...t }] : []; }
      const l = drillLine(side, at, rare);
      return l ? [l] : [];
    };
    drillOpen = false;
    fly();
    go('/train');
  }
  function previewTrap(i: Item) { run.items = [i]; run.mode = 'drill'; run.title = 'Preview'; run.more = undefined; go('/train'); }

  let sx = 0;
  // desktop: pointing at a move draws it on the board and shows where it leads
  let hover = $state<{ u: string; top: number; left: number } | null>(null);
  $effect(() => { void path; hover = null; });
  function point(e: PointerEvent, u: string) {
    if (!desk.on || e.pointerType !== 'mouse') return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // the preview sits over the half of the board the arrow is not in
    const b = boardEl?.getBoundingClientRect();
    const rank = (+u[1] + +u[3]) / 2, upper = (side === 'w') === rank > 4.5;
    const top = b ? (upper ? Math.min(b.bottom - 292, innerHeight - 300) : b.top + 8) : Math.max(12, r.top - 96);
    hover = { u, top, left: r.left - 236 };
  }
  const lead = $derived.by(() => {
    if (!hover) return null;
    const e = child(epd, hover.u), n = nameOf(e, [...path, hover.u]), node = data()?.tree[e];
    return { fen: fenOf(e), name: n[1], eco: n[0], games: node?.g ?? 0, san: san(epd, hover.u) };
  });
  const hoverShapes = $derived<DrawShape[]>(hover ? [{ orig: hover.u.slice(0, 2) as never, dest: hover.u.slice(2, 4) as never, brush: 'lead' }] : []);
  let boardEl = $state<HTMLElement>();
  const fly = () => takeOff(boardEl?.querySelector('.cg-wrap'));
  const pctOf = (r: { freq: number }) => Math.round(r.freq * 100);
  const isMineRow = (u: string) => mine.includes(u);
  const defRow = (u: string) => pos.turn === side && node?.d === u;
  const coveredReply = (u: string) => pos.turn !== side && ctx ? replies(ctx, epd, app.replyPct / 100, 50).some(([m]) => m === u) : false;
</script>

<div class="screen ex">
  <div class="pane top">
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
      {#each hits as h (h.id)}
        <li><button onclick={() => { setPath(h.uci.slice()); search = ''; }}><span class="t-name">{h.name}</span><span class="eco">{h.eco}</span></button></li>
      {/each}
    </ul>
  {/if}
  </div>

  <div class="pane a">
  <div class="where">
    <p class="t-name nm">{name[1]}{#if name[0]}<span class="eco">{name[0]}</span>{/if}</p>
    <div class="crumbs">
      <button class="crumb home" class:cur={!path.length} onclick={() => tree.first()} aria-label="Start position">Start</button>
      {#each crumbs.done as n, i (n.id)}
        <button class="crumb" class:cur={i === crumbs.done.length - 1} onclick={() => tree.goto(n)}>{#if n.ply % 2 === 1}<em>{(n.ply + 1) / 2}.</em>{/if}{n.san}</button>
      {/each}
      {#each crumbs.ahead as n (n.id)}
        <button class="crumb ahead" onclick={() => tree.goto(n)}>{#if n.ply % 2 === 1}<em>{(n.ply + 1) / 2}.</em>{/if}{n.san}</button>
      {/each}
    </div>
  </div>

  <div class="bw" role="presentation" bind:this={boardEl} ontouchstart={(e) => (sx = e.touches[0].clientX)} ontouchend={(e) => { const dx = e.changedTouches[0].clientX - sx; if (dx > 70) back(); else if (dx < -70) tree.fwd(); }}>
    <Board fen={pos.fen} {side} lastMove={pos.last} check={pos.check} dests={pos.dests} rev={boardRev} shapes={hoverShapes} drawn={arrows[path.join(' ')] ?? []} ondraw={(sh) => (arrows = { ...arrows, [path.join(' ')]: sh })} onmove={onBoardMove} />
    {#if promo}<Promo side={pos.turn} onpick={pickPromo} oncancel={cancelPromo} />{/if}
    <MoveInput legal={legalNow} onmove={playMove} onaction={onkey} />
  </div>
  <div class="navrow"><NavBar canBack={!!path.length} canFwd={crumbs.ahead.length > 0} onnav={(a) => tree.key(a)} /></div>

  <div class="acts">
    <button class="btn grow" onclick={learn}>Learn from here</button>
    <button class="btn quiet grow" onclick={() => (drillOpen = !drillOpen)} aria-expanded={drillOpen}>Drill</button>
  </div>
  {#if drillOpen}
    <div class="card drillbox">
      <div class="row" style="gap:8px">
        <button class="btn sm grow" onclick={() => drill('lines')}>Lines</button>
        <button class="btn sm quiet grow" onclick={() => drill('traps')}>Traps</button>
        <button class="btn sm quiet grow" onclick={() => drill('mixed')}>Mixed</button>
      </div>
      <label class="rr"><span class="grow"><b>Rare replies</b><br /><span class="t-small">Pick evenly among every reply ≥ {app.replyPct}%</span></span><input type="checkbox" role="switch" bind:checked={rare} /></label>
      <p class="t-small">Drill never changes your schedule.</p>
    </div>
  {/if}
  {#if toast}<p class="toast" role="status">{toast}</p>{/if}
  <p class="keys" aria-hidden="true"><kbd>Nf3</kbd> type a move <kbd>←</kbd><kbd>→</kbd> back and forward <kbd>/</kbd> jump to an opening</p>
  </div>

  <div class="pane b">
  <section class="card list">
    {#if rows.length}
      <div class="lh"><span>Move</span><span>Played</span><span>Results</span><span>Eval</span></div>
      {#each showRare ? rows : rows.slice(0, 8) as m (m.u)}
        {@const st = isMineRow(m.u) ? stageAt(side, epd, m.u) : null}
        <button class="mv" class:out={pos.turn !== side && !coveredReply(m.u)} class:pointed={hover?.u === m.u} onclick={() => playMove(m.u)} onpointerenter={(e) => point(e, m.u)} onpointerleave={() => (hover = null)}>
          <span class="san">
            {m.san}
            <span class="marks">
              {#if isMineRow(m.u)}<span class="mk star" title="Your move"><Icon name="star" size={14} fill /></span>{#if st}<Plies stage={st} size={14} />{/if}
              {:else if defRow(m.u)}<span class="mk dot" title="Default move"></span>{/if}
              {#if punishAfter.has(m.u)}<span class="mk sw" title="A Punish trap follows"><Icon name="sword" size={14} /></span>{/if}
              {#if dangerHere.has(m.u)}<span class="mk wr" title="Danger: popular but losing"><Icon name="warn" size={14} /></span>{/if}
            </span>
          </span>
          <span class="pct"><b>{pctOf(m)}%</b><small>{m.g.toLocaleString('en')}</small></span>
          <span class="wdl" role="img" aria-label="White {m.w}%, draw {m.d}%, Black {m.b}%"><i class="w" style="width:{m.w}%"></i><i class="d" style="width:{m.d}%"></i><i class="b" style="width:{m.b}%"></i></span>
          <span class="ev">{#if m.cp !== null}<b>{evalGlyph(m.cp)}</b><small>{evalText(m.cp)}</small>{:else}<small>—</small>{/if}</span>
        </button>
      {/each}
      {#if rows.length > 8}
        <button class="more" onclick={() => (showRare = !showRare)}>{showRare ? 'Show fewer moves' : `Show ${rows.length - 8} rarer move${rows.length === 9 ? '' : 's'}`}</button>
      {/if}
      {#if pos.turn === side}
        <button class="edit" onclick={() => (editing = true)}><Icon name="star" size={16} /> {mine.length > 1 ? 'Edit your moves here' : 'Change your move or add a second'}</button>
      {/if}
    {:else}
      <div class="empty">
        <p class="t-head">The book ends here</p>
        <p class="t-small">Fewer than 50 games at the {model.band} band reach this position, so there is nothing reliable to show.{#if pos.turn === side} To go on with a line of your own, play your move on the board and tap Learn from here: Ply keeps the moves on the way as yours.{/if}</p>
      </div>
    {/if}
  </section>

  <p class="legend">
    <span><span class="mk star"><Icon name="star" size={13} fill /></span>Your move</span>
    <span><span class="mk dot"></span>Default</span>
    <span><span class="mk sw"><Icon name="sword" size={13} /></span>Punish follows</span>
    <span><span class="mk wr"><Icon name="warn" size={13} /></span>Danger</span>
  </p>
  {#if node}
    <p class="t-small foot">{node.g.toLocaleString('en')} games at the {model.band} band reach this position · eval {evalText(node.e)} · {newBelow} new move{newBelow === 1 ? '' : 's'} below for you</p>
  {/if}

  </div>

  <div class="pane c">
  <div class="sect"><h2 class="t-head">Traps below this position</h2></div>
  <section class="card traps">
    {#if traps.punish.length + traps.danger.length + traps.puzzles.length}
      <button onclick={() => (preview = preview === 'punish' ? null : 'punish')} disabled={!traps.punish.length}><b class="t-num">{traps.punish.length}</b><span>Punish</span></button>
      <button onclick={() => (preview = preview === 'danger' ? null : 'danger')} disabled={!traps.danger.length}><b class="t-num">{traps.danger.length}</b><span>Danger</span></button>
      <button onclick={() => (preview = preview === 'puzzles' ? null : 'puzzles')} disabled={!traps.puzzles.length}><b class="t-num">{traps.puzzles.length}</b><span>Puzzles</span></button>
    {:else}
      <p class="t-small">No traps or puzzles for {side === 'w' ? 'White' : 'Black'} start below this position.</p>
    {/if}
  </section>
  {#if preview}
    <ul class="card plist">
      {#each (preview === 'puzzles' ? traps.puzzles.slice(0, 12).map(puzzlePreview) : (preview === 'punish' ? traps.punish : traps.danger).slice(0, 12).map(trapPreview)) as it}
        <li><button onclick={() => previewTrap(it)}><span class="grow"><span class="t-name pn">{it.label}</span><span class="t-small">{it.source}</span></span><Icon name="play" size={18} /></button></li>
      {/each}
    </ul>
  {/if}
  </div>
</div>

{#if hover && lead}
  <div class="lead card" style="top:{hover.top}px;left:{hover.left}px" aria-hidden="true">
    <MiniBoard fen={lead.fen} {side} last={[hover.u.slice(0, 2), hover.u.slice(2, 4)]} />
    <p class="t-name ln">{lead.name}{#if lead.eco}<span class="eco">{lead.eco}</span>{/if}</p>
    <p class="t-small">after {lead.san}{lead.games ? ` · ${lead.games.toLocaleString('en')} games` : ''}</p>
  </div>
{/if}

{#if editing}<MoveEditor {side} {epd} onclose={() => (editing = false)} />{/if}

{#if confirmDev}
  <div class="sheet-bg" role="presentation" onclick={() => (confirmDev = null)}></div>
  <div class="dialog card" role="dialog" aria-label="Different from your repertoire">
    <h2 class="t-title">Not your repertoire</h2>
    <p class="t-small">The path here plays {confirmDev.length === 1 ? 'a move' : 'moves'} you don't play:</p>
    <ul>
      {#each confirmDev as d}<li><b>{sans(path.slice(0, d.ply + 1)).slice(-1)[0]}</b> instead of <b>{movesAt(side, d.epd).map((u) => san(d.epd, u)).join(' / ') || '—'}</b></li>{/each}
    </ul>
    <div class="row" style="gap:10px;margin-top:14px">
      <button class="btn quiet grow" onclick={() => (confirmDev = null)}>Cancel</button>
      <button class="btn grow" onclick={adopt}>Set as my repertoire</button>
    </div>
  </div>
{/if}

<style>
  .seg { display: flex; background: var(--card); border-radius: 14px; padding: 4px; box-shadow: var(--shadow); }
  .seg button { height: 38px; padding: 0 12px; border-radius: 10px; font-weight: 650; font-size: 14px; display: flex; align-items: center; gap: 7px; color: var(--ink-2); }
  .seg button.on { background: var(--ink); color: var(--on-ink); }
  .pc { width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; }
  .pc.w { background: #fff; border-color: var(--ink-3); }
  .pc.b { background: var(--ink-fixed); border-color: var(--ink-3); }
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
  .crumb { flex: none; height: 34px; padding: 0 9px; border-radius: 10px; font-weight: 600; font-size: 14.5px; color: var(--ink-2); background: var(--wash); }
  .crumb em { font-style: normal; opacity: 0.55; margin-right: 2px; font-weight: 500; }
  .crumb.cur { background: var(--ink); color: var(--on-ink); }
  .crumb.ahead { background: none; color: var(--ink-3); font-weight: 500; }
  .navrow { margin-top: 14px; }

  .bw { position: relative; }
  .acts { display: flex; gap: 10px; margin: 12px 0 6px; }
  .acts .btn { padding: 0 14px; font-size: 16px; white-space: nowrap; }
  .drillbox { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; animation: rise 200ms var(--ease) both; }
  .btn.sm { min-height: 46px; font-size: 15px; }
  .rr { display: flex; align-items: center; gap: 12px; min-height: 52px; }
  input[role='switch'] { appearance: none; width: 54px; height: 32px; border-radius: 16px; background: var(--st-new); position: relative; transition: background 160ms; flex: none; }
  input[role='switch']::after { content: ''; position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px rgba(21, 25, 54, 0.3); transition: transform 220ms var(--spring); }
  input[role='switch']:checked { background: var(--cobalt); }
  input[role='switch']:checked::after { transform: translateX(22px); }
  .toast { margin-top: 12px; padding: 12px 14px; border-radius: 14px; background: var(--ink); color: var(--on-ink); font-size: 14px; animation: rise 200ms var(--ease) both; }

  .list { padding: 6px 6px 8px; margin-top: 16px; }
  .lh, .mv { display: grid; grid-template-columns: 96px 62px 1fr 44px; align-items: center; gap: 10px; padding: 0 10px; }
  .lh { font-size: 11.5px; font-weight: 600; color: var(--ink-3); height: 30px; }
  .lh span:last-child { text-align: right; }
  .mv { width: 100%; min-height: 54px; text-align: left; border-radius: 16px; border-top: 1px solid var(--ground); }
  .mv:active { background: var(--ground); }
  .mv.out .san, .mv.out .pct { opacity: 0.6; }
  .san { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; display: flex; align-items: center; gap: 6px; }
  .marks { display: flex; align-items: center; gap: 4px; }
  .mk { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 6px; flex: none; }
  .mk.star { color: var(--accent-text); }
  .mk.dot::after { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--ink-3); }
  .mk.sw { background: var(--good-tint); color: var(--good-text); }
  .mk.wr { background: var(--bad-tint); color: var(--bad-text); }
  .pct b, .ev b { display: block; font-size: 15px; }
  .pct small, .ev small { font-size: 11.5px; color: var(--ink-3); }
  .ev { text-align: right; }
  .ev b { font-size: 17px; font-weight: 600; }
  .more { width: 100%; min-height: 44px; padding: 0 12px; text-align: left; font-size: 14px; font-weight: 650; color: var(--ink-2); border-top: 1px solid var(--ground); }
  .edit { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 48px; padding: 0 12px; margin-top: 4px; border-top: 1px solid var(--ground); font-weight: 650; color: var(--accent-text); }
  .empty { padding: 22px 14px; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 12px 6px 0; font-size: 12.5px; color: var(--ink-2); }
  .legend > span { display: inline-flex; align-items: center; gap: 5px; }
  .foot { padding: 8px 6px 0; }
  .traps { display: flex; gap: 8px; }
  .traps button { flex: 1; display: flex; flex-direction: column; align-items: flex-start; text-align: left; min-height: 56px; border-radius: 12px; }
  .traps button:disabled { opacity: 0.5; }
  .traps b { font-size: 28px; }
  .traps span { font-size: 13px; color: var(--ink-2); }
  .plist { list-style: none; margin: 10px 0 0; padding: 4px; }
  .plist button { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; min-height: 56px; padding: 6px 10px; border-radius: 12px; }
  .plist li + li { border-top: 1px solid var(--ground); }
  .pn { display: block; font-size: 16px; line-height: 1.15; }
  .sheet-bg { position: fixed; inset: 0; z-index: 60; background: rgba(13, 16, 36, 0.45); }
  .dialog { position: fixed; z-index: 61; left: 16px; right: 16px; top: 22%; max-width: 480px; margin: 0 auto; padding: 20px; animation: rise 220ms var(--ease) both; }

  /* wide screens: the board and its actions stay on the left at the screen's height, the moves and traps beside it */
  @media (orientation: landscape) and (min-width: 760px) and (min-height: 540px) {
    .screen.ex {
      /* room above for the name and moves, below for the buttons and the tab bar */
      --bw: min(calc(100vh - 320px), 54vw, 760px);
      --bw: min(calc(100dvh - 320px - env(safe-area-inset-bottom)), 54vw, 760px);
      display: grid; grid-template-columns: var(--bw) minmax(340px, 1fr); grid-template-rows: auto auto 1fr; grid-template-areas: 'a top' 'a b' 'a c';
      column-gap: 28px; align-items: start; padding-left: max(16px, calc((100% - 1260px) / 2)); padding-right: max(16px, calc((100% - 1260px) / 2));
    }
    .ex .pane { display: block; }
    .ex .top { grid-area: top; }
    .ex .a { grid-area: a; position: sticky; top: 0; }
    .ex .b { grid-area: b; }
    .ex .c { grid-area: c; }
    .ex .where { margin-top: 4px; }
    .ex .crumbs { margin: 10px 0 0; padding: 0; flex-wrap: wrap; }
    .ex .list { margin-top: 0; }
  }
  /* a phone on its side: board on the left, everything else scrolls beside it */
  @media (orientation: landscape) and (max-height: 539px) and (min-width: 560px) {
    .screen.ex {
      --bw: min(calc(100vh - 110px), 40vw);
      --bw: min(calc(100dvh - 110px - env(safe-area-inset-top) - env(safe-area-inset-bottom)), 40vw);
      display: grid; grid-template-columns: var(--bw) minmax(300px, 1fr); grid-template-rows: auto auto 1fr; grid-template-areas: 'a top' 'a b' 'a c';
      column-gap: 20px; align-items: start; padding-top: calc(env(safe-area-inset-top) + 12px);
      padding-left: max(16px, env(safe-area-inset-left));
    }
    .ex .pane { display: block; }
    .ex .top { grid-area: top; }
    .ex .a { grid-area: a; }
    .ex .b { grid-area: b; }
    .ex .c { grid-area: c; }
    .ex .where { margin-top: 0; }
    .ex .where .nm { font-size: 20px; }
    .ex .crumbs { margin: 6px 0 0; padding: 0; }
  }
  .keys, .lead { display: none; }
  /* ---------- desktop: board, moves, context (DESIGN.md, "Desktop") ---------- */
  @media (min-width: 1024px) and (min-height: 600px) {
    .screen.ex {
      --bw: min(calc(100vh - 258px), calc(100% - 420px), 760px);
      --bw: min(calc(100dvh - 258px), calc(100% - 420px), 760px);
      display: grid; grid-template-columns: var(--bw) minmax(340px, 560px); grid-template-rows: auto auto 1fr; grid-template-areas: 'a top' 'a b' 'a c';
      justify-content: center; column-gap: 32px; align-items: start; padding: 24px 32px 40px;
    }
    .ex .pane { display: block; min-width: 0; }
    .ex .top { grid-area: top; }
    .ex .a { grid-area: a; position: sticky; top: 0; }
    .ex .b { grid-area: b; }
    .ex .c { grid-area: c; }
    .ex :global(.t-display) { font-size: 30px; }
    .ex .screen-head { margin-bottom: 12px; align-items: center; }
    .ex .where { margin: 0 0 12px; min-height: 84px; }
    .ex .nm { font-size: 30px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ex .crumbs { flex-wrap: nowrap; overflow-x: auto; }
    .ex .crumb { cursor: pointer; transition: background 140ms; }
    .ex .crumb:not(.cur):hover { background: var(--line); color: var(--ink); }
    .ex .acts { margin-top: 12px; }
    .ex .btn:not(:disabled):hover { filter: brightness(1.06); }
    .ex .keys { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; font-size: 12.5px; color: var(--ink-3); }
    .ex .keys kbd { font: inherit; font-weight: 700; font-size: 11.5px; padding: 2px 7px; border-radius: 6px; background: var(--card); box-shadow: 0 1.5px 0 var(--quiet-edge); color: var(--ink-2); margin-left: 8px; }
    .ex .keys kbd:first-child { margin-left: 0; }
    .ex .list { margin-top: 12px; }
    .ex .mv { min-height: 50px; transition: background 120ms; }
    .ex .mv:hover, .ex .mv.pointed { background: var(--cobalt-tint); }
    .ex .more:hover, .ex .edit:hover, .ex .plist button:hover, .ex .hits button:hover { background: var(--ground); }
    .ex .traps button:not(:disabled) { padding: 6px 10px; margin: -6px -10px; transition: background 120ms; }
    .ex .traps button:not(:disabled):hover { background: var(--ground); }
    .ex .sect { margin-top: 20px; }
    .lead { display: block; position: fixed; z-index: 45; width: 220px; padding: 10px 10px 12px; border-radius: 18px; pointer-events: none; box-shadow: 0 24px 50px -18px rgba(13, 16, 36, 0.5), 0 0 0 1px var(--line); animation: rise 140ms var(--ease) both; }
    .lead .ln { font-size: 16px; line-height: 1.15; margin-top: 10px; }
    .lead .t-small { margin-top: 2px; font-size: 12.5px; }
  }
  /* from 1600: search, traps and puzzles get a column of their own */
  @media (min-width: 1600px) and (min-height: 600px) {
    .screen.ex { grid-template-columns: var(--bw) minmax(380px, 480px) minmax(300px, 380px); grid-template-rows: auto 1fr; grid-template-areas: 'a b top' 'a b c'; --bw: min(calc(100dvh - 258px), calc(100% - 800px), 820px); }
    .ex .list { margin-top: 0; }
    .ex .c .sect { margin-top: 18px; }
    .ex .traps { flex-direction: column; gap: 14px; }
    .ex .traps button { flex-direction: row; align-items: baseline; gap: 10px; min-height: 44px; }
  }
  .dialog ul { margin: 10px 0 0; padding-left: 18px; font-size: 15px; }
  .dialog li { margin: 4px 0; }
</style>
