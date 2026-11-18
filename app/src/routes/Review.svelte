<script lang="ts">
  // Game review and the analysis board. A game opens with every move judged (lib/review.ts):
  // accuracy for both players, the count of each verdict, an eval graph, the verdict on the board
  // at the moved piece, and the better move as an arrow. The board behaves as on Lichess: ← → ↑ ↓,
  // play any move to explore a variation (the engine follows it live), draw arrows with the right
  // mouse button and they stay with their position. Nothing here touches a card.
  import { onMount } from 'svelte';
  import { Chess } from 'chess.js';
  import type { DrawShape } from '@lichess-org/chessground/draw';
  import { route, go } from '../lib/state.svelte';
  import { db } from '../lib/db';
  import { nameOf } from '../lib/model.svelte';
  import { epdOf, evalText, dests as destsOf, uciOf, START_FEN, type Side } from '../lib/chess';
  import { MoveTree, moveNo, type TreeNode } from '../lib/tree.svelte';
  import { classify, summarise, KINDS, KIND_LABEL, type PosEval, type MoveVerdict, type Kind } from '../lib/review';
  import { cachedReview, runReview, analyseLive, stopLive, pending, saveAccuracy, type ReviewRun } from '../lib/engine/review';
  import { sfx } from '../lib/fx';
  import Board from '../lib/Board.svelte';
  import EvalBar from '../lib/EvalBar.svelte';
  import EvalGraph from '../lib/EvalGraph.svelte';
  import KindIcon from '../lib/KindIcon.svelte';
  import NavBar from '../lib/NavBar.svelte';
  import Icon from '../lib/Icon.svelte';
  import Promo from '../lib/Promo.svelte';
  import MoveInput from '../lib/MoveInput.svelte';
  import type { KeyAction } from '../lib/keys';

  const q = new URLSearchParams(route.path.split('?')[1] ?? '');

  interface Game { id: string | null; white: string; black: string; whiteElo: string; blackElo: string; result: string; date: string; you: Side | null; rootFen: string; moves: string[]; fens: string[]; site: string }
  let game = $state.raw<Game | null>(null);
  let tree = $state.raw(new MoveTree());
  let orient = $state<Side>('w');
  let evals = $state<(PosEval | undefined)[]>([]);
  let analysed = $state(0);
  let running = $state(false);
  let engineOn = $state(true);
  let live = $state.raw<{ id: string; e: PosEval } | null>(null);
  let arrows = $state<Record<string, DrawShape[]>>({});
  let problem = $state('');
  let tab = $state<'review' | 'moves'>('review');
  let pasting = $state(false);
  let pasteText = $state('');
  let run: ReviewRun | null = null;

  function readPgn(pgn: string, id: string | null, you: Side | null): Game | null {
    const c = new Chess();
    try { c.loadPgn(pgn); } catch { return null; }
    const h = c.getHeaders();
    const hist = c.history({ verbose: true });
    const rootFen = hist[0]?.before ?? c.fen();
    return {
      id, you, rootFen, site: h.Link ?? (h.Site?.startsWith('http') ? h.Site : ''),
      white: h.White ?? 'White', black: h.Black ?? 'Black', whiteElo: h.WhiteElo ?? '', blackElo: h.BlackElo ?? '',
      result: h.Result ?? '*', date: /^\d{4}/.test(h.UTCDate ?? h.Date ?? '') ? (h.UTCDate ?? h.Date)!.replace(/\./g, '-').replace(/-\?\?.*$/, '') : '',
      moves: hist.map(uciOf), fens: [...hist.map((m) => m.before), c.fen()]
    };
  }

  function load(g: Game) {
    run?.cancel(); run = null;
    game = g;
    tree = MoveTree.of(g.moves, g.rootFen);
    orient = g.you ?? 'w';
    evals = new Array(g.fens.length).fill(undefined);
    analysed = 0; arrows = {}; live = null;
    tab = 'review';
    // open at the start, as a review does; → walks the game
    void startReview(g);
  }
  async function startReview(g: Game) {
    if (!g.moves.length) return;
    const id = g.id ?? 'pgn:' + g.moves.join('');
    const cached = await cachedReview(id, g.fens.length);
    if (game !== g) return;
    if (cached) { evals = cached; analysed = g.fens.length; return; }
    running = true;
    run = runReview(id, g.fens, g.moves, (i, e) => { if (game !== g) return; evals[i] = e; analysed++; });
    try { await run.done; } finally { if (game === g) running = false; }
    if (game === g && g.id) { const s = summary; if (s) await saveAccuracy(g.id, s.w.accuracy, s.b.accuracy); }
  }

  onMount(() => {
    void (async () => {
      const gid = q.get('g');
      if (gid) {
        const row = await db.games.get(gid);
        const g = row && readPgn(row.pgn, row.url, row.colour);
        if (g) return load(g);
        problem = 'That game is not on this device any more.';
      }
      if (q.get('pgn') && pending.pgn) {
        const g = readPgn(pending.pgn, null, null);
        pending.pgn = '';
        if (g) return load(g);
        problem = 'That PGN could not be read.';
      }
      const fen = q.get('fen');
      if (fen) { try { new Chess(fen); tree = new MoveTree(fen); orient = fen.split(' ')[1] as Side; } catch { problem = 'That FEN is not a legal position.'; } }
    })();
    return () => { run?.cancel(); stopLive(); };
  });

  // ---------- where we are
  const cur = $derived.by(() => { void tree.rev; return tree.cur; });
  const gameIds = $derived(game ? game.moves.map((_, i) => game!.moves.slice(0, i + 1).join(' ')) : []);
  /** the ply of a node if it is one of the game's own moves (0 = the start), else null */
  const gamePly = (n: TreeNode) => (n.ply === 0 ? 0 : game && n.ply <= game.moves.length && gameIds[n.ply - 1] === n.id ? n.ply : null);
  const verdicts = $derived<(MoveVerdict | null)[]>(game ? classify(game.fens, game.moves, evals) : []);
  const summary = $derived(game && analysed >= (game.fens.length || 0) ? summarise(verdicts, game.rootFen.split(' ')[1] === 'w') : null);
  const curPly = $derived(gamePly(cur));
  const verdict = $derived(curPly ? verdicts[curPly - 1] : null);
  const posEval = $derived.by(() => {
    const p = curPly;
    const e = p !== null ? evals[p] : undefined;
    if (e && e.lines[0]?.pv.length) return e;
    return live && live.id === cur.id ? live.e : e;
  });
  const turn = $derived(cur.fen.split(' ')[1] as Side);
  const over = $derived.by(() => { const c = new Chess(cur.fen); return c.isCheckmate() ? 'mate' : c.isDraw() || c.isStalemate() ? 'draw' : null; });
  const whiteCp = $derived.by(() => {
    if (over === 'mate') return turn === 'w' ? -10000 : 10000;
    if (over === 'draw') return 0;
    const l = posEval?.lines[0];
    return l ? (turn === 'w' ? l.cp : -l.cp) : null;
  });

  // the engine follows wherever you go that the review has not covered
  $effect(() => {
    const n = cur;
    if (!engineOn || over) return;
    const p = gamePly(n);
    if (p !== null && evals[p]?.lines[0]?.pv.length) return;
    let gone = false;
    void (async () => {
      const a = await analyseLive(n.fen, 350);
      if (gone || !a) return;
      live = { id: n.id, e: a };
      const b = await analyseLive(n.fen, 2200);
      if (!gone && b) live = { id: n.id, e: b };
    })().catch(() => {});
    return () => { gone = true; };
  });

  // ---------- the board
  const pos = $derived.by(() => {
    const c = new Chess(cur.fen);
    return { check: c.inCheck(), dests: destsOf(c), last: cur.uci ? [cur.uci.slice(0, 2), cur.uci.slice(2, 4)] as [string, string] : null };
  });
  const BAD = new Set<Kind>(['inaccuracy', 'mistake', 'miss', 'blunder']);
  const shapes = $derived.by<DrawShape[]>(() => {
    const out: DrawShape[] = [];
    // the better move, where the one played was not good enough (from the position before it)
    if (verdict && BAD.has(verdict.kind) && verdict.best) out.push({ orig: verdict.best.slice(0, 2) as never, dest: verdict.best.slice(2, 4) as never, brush: 'good' });
    // the engine's move from here
    const b = engineOn ? posEval?.lines[0]?.pv[0] : undefined;
    if (b) out.push({ orig: b.slice(0, 2) as never, dest: b.slice(2, 4) as never, brush: 'lead' });
    return out;
  });
  const mark = $derived(verdict && cur.uci ? { square: cur.uci.slice(2, 4), kind: verdict.kind } : null);

  let promo = $state<{ from: string; to: string } | null>(null);
  let boardRev = $state(0);
  function playUci(u: string) {
    const before = cur;
    const n = tree.play(u);
    if (!n) return;
    n.san.includes('x') ? sfx.capture() : sfx.move();
    if (before.children[0] !== n || gamePly(n) === null) tab = 'moves';
  }
  function onmove(from: string, to: string) {
    const c = new Chess(cur.fen);
    const p = c.get(from as never);
    if (p?.type === 'p' && (to[1] === '8' || to[1] === '1')) { promo = { from, to }; return; }
    playUci(from + to);
  }
  function pickPromo(piece: string) { const p = promo!; promo = null; playUci(p.from + p.to + piece); }
  function cancelPromo() { promo = null; boardRev++; }
  const legalNow = () => (promo || pasting ? null : new Chess(cur.fen).moves({ verbose: true }).map((m) => ({ san: m.san, uci: uciOf(m) })));
  function nav(a: 'back' | 'fwd' | 'first' | 'last') { if (tree.key(a)) sfx.move(); }
  function onkey(a: KeyAction): boolean {
    if (a === 'back' || a === 'fwd' || a === 'first' || a === 'last') { nav(a); return true; }
    if (a === 'undo') { nav('back'); return true; }
    if (a === 'stop') { if (pasting) pasting = false; else leave(); return true; }
    return false;
  }
  onMount(() => {
    // f flips the board, as on Lichess
    const k = (e: KeyboardEvent) => { if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !(e.target as HTMLElement)?.closest?.('input, textarea')) orient = orient === 'w' ? 'b' : 'w'; };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });
  function leave() { if (history.length > 1) history.back(); else go('/games'); }

  // ---------- the panel
  const opening = $derived.by(() => {
    if (!game) return '';
    for (let k = Math.min(game.moves.length, 30); k > 0; k--) { const [eco, nm] = nameOf(epdOf(game.fens[k]), game.moves.slice(0, k)); if (eco) return nm; }
    return '';
  });
  const top = $derived(orient === 'w' ? 'b' : 'w');
  const player = (s: Side) => game ? { name: s === 'w' ? game.white : game.black, elo: s === 'w' ? game.whiteElo : game.blackElo, acc: summary?.[s].accuracy ?? null } : { name: s === 'w' ? 'White' : 'Black', elo: '', acc: null };
  const resultOf = (s: Side) => !game || game.result === '*' ? '' : game.result === '1/2-1/2' ? '½' : (game.result === '1-0') === (s === 'w') ? '1' : '0';

  const sanLine = (fen: string, pv: string[], max = 10) => {
    const c = new Chess(fen), out: { san: string; no: string; uci: string }[] = [];
    for (const u of pv.slice(0, max)) {
      const white = c.turn() === 'w', no = c.moveNumber();
      let m; try { m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; }
      out.push({ san: m.san, uci: u, no: white ? no + '.' : out.length === 0 ? no + '…' : '' });
    }
    return out;
  };
  const sanOf = (fen: string, u: string) => sanLine(fen, [u], 1)[0]?.san ?? u;
  const comment = $derived.by(() => {
    if (!verdict || !cur.parent) return null;
    const played = cur.san, best = verdict.best ? sanOf(cur.parent.fen, verdict.best) : '';
    const k = verdict.kind;
    const head = k === 'book' ? `${played} is a book move` : k === 'best' ? `${played} is best` : k === 'brilliant' ? `${played} is brilliant` : k === 'great' ? `${played} is a great move` : k === 'miss' ? `${played} misses the chance` : `${played} is ${k === 'excellent' ? 'excellent' : k === 'good' ? 'good' : 'a' + (k === 'inaccuracy' ? 'n ' : ' ') + k}`;
    const sub = BAD.has(k) && best ? `The best move was ${best}.` : k === 'great' ? 'The only good move here.' : k === 'brilliant' ? 'A piece offered, and the engine approves.' : k === 'book' ? 'Still in the opening at your level.' : '';
    return { k, head, sub };
  });
  const lines = $derived(posEval && !over ? posEval.lines.filter((l) => l.pv.length).map((l) => ({ cp: turn === 'w' ? l.cp : -l.cp, moves: sanLine(cur.fen, l.pv) })) : []);
  function playLine(moves: { uci: string }[], upto: number) { tree.goto(tree.addLine(cur, moves.slice(0, upto + 1).map((m) => m.uci))); tab = 'moves'; sfx.move(); }

  // eval graph: the position after each game move
  const graph = $derived.by(() => {
    if (!game) return null;
    const cps = game.fens.map((f, i) => {
      const e = evals[i];
      const c = new Chess(f);
      if (c.isCheckmate()) return f.split(' ')[1] === 'w' ? -10000 : 10000;
      if (!e?.lines[0]) return null;
      return f.split(' ')[1] === 'w' ? e.lines[0].cp : -e.lines[0].cp;
    });
    const labels = ['Start', ...tree.mainline.slice(0, game.moves.length).map((n) => moveNo(n, game!.rootFen) + ' ' + n.san)];
    return { cps, labels };
  });
  function pickPly(i: number) { if (!game) return; const id = i === 0 ? '' : gameIds[i - 1]; tree.goto(tree.node(id)); }

  // the move list: the mainline in pairs, variations under the move they replace
  type Row = { kind: 'pair'; no: string; w: TreeNode | null; b: TreeNode | null } | { kind: 'vars'; alts: TreeNode[] };
  const isWhite = (n: TreeNode) => n.parent!.fen.split(' ')[1] === 'w';
  const rows = $derived.by(() => {
    void tree.rev;
    const out: Row[] = [];
    let pair: (Row & { kind: 'pair' }) | null = null;
    for (const n of tree.mainline) {
      const w = isWhite(n);
      if (w || !pair) { pair = { kind: 'pair', no: moveNo(n, tree.root.fen).replace('…', '.'), w: w ? n : null, b: null }; out.push(pair); }
      if (!w) pair.b = n;
      const alts = n.parent!.children.slice(1);
      if (alts.length) { out.push({ kind: 'vars', alts }); pair = null; }
    }
    return out;
  });
  let list = $state<HTMLElement>();
  $effect(() => { void cur; queueMicrotask(() => list?.querySelector('.on')?.scrollIntoView({ block: 'nearest' })); });
  const kindOf = (n: TreeNode | null) => { if (!n) return null; const p = gamePly(n); return p ? verdicts[p - 1]?.kind ?? null : null; };
  const SHOW_IN_LIST = new Set<Kind>(['brilliant', 'great', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder', 'best']);

  function removeHere() { const n = cur; if (gamePly(n) !== null) return; let x: TreeNode = n; while (x.parent && gamePly(x.parent) === null && x.parent.children.length === 1) x = x.parent; tree.remove(x); }
  function analysePaste() {
    const t = pasteText.trim();
    if (!t) return;
    try { const c = new Chess(t); pasting = false; pasteText = ''; game = null; evals = []; tree = new MoveTree(c.fen()); orient = c.turn(); return; } catch { /* not a FEN: a PGN */ }
    const g = readPgn(t, null, null);
    if (!g || !g.moves.length) { problem = 'That is neither a PGN nor a FEN Ply can read.'; return; }
    problem = ''; pasting = false; pasteText = '';
    load(g);
  }
  const counted = $derived(summary ? KINDS.filter((k) => k !== 'book' || summary!.w.counts.book + summary!.b.counts.book > 0) : []);
  const pct = $derived(game && game.fens.length ? Math.round((analysed / game.fens.length) * 100) : 0);
</script>

{#snippet vline(start: TreeNode)}
  {#each [start, ...tree.mainFrom(start)] as v, i (v.id)}
    <button class="vm" class:on={v === cur} onclick={() => tree.goto(v)}>{#if isWhite(v) || i === 0}<em>{moveNo(v, tree.root.fen)}</em>{/if}{v.san}</button>
    {#if i > 0}{#each v.parent!.children.slice(1) as alt (alt.id)}<span class="paren">(</span>{@render vline(alt)}<span class="paren">)</span>{/each}{/if}
  {/each}
{/snippet}

{#snippet strip(s: Side)}
  {@const p = player(s)}
  <div class="who" class:you={game?.you === s}>
    <i class="pc {s}"></i>
    <b class="nm">{p.name}</b>{#if p.elo}<span class="elo">{p.elo}</span>{/if}
    <span class="sp"></span>
    {#if resultOf(s)}<span class="res">{resultOf(s)}</span>{/if}
    {#if p.acc !== null}<span class="acc t-num" title="Accuracy">{p.acc.toFixed(1)}</span>{/if}
  </div>
{/snippet}

<div class="room">
  <header>
    <button class="x" onclick={leave} aria-label="Leave"><Icon name="close" /></button>
    <div class="ttl">
      <p class="t-name">{game ? 'Game review' : 'Analysis board'}</p>
      <p class="sub">{game ? [opening, game.date].filter(Boolean).join(' · ') : 'Play moves for both sides; the engine follows'}</p>
    </div>
    <button class="hb" class:on={engineOn} onclick={() => (engineOn = !engineOn)} aria-pressed={engineOn} title="Engine arrows, lines and the bar"><Icon name="layers" size={20} /><span>Engine</span></button>
    <button class="hb" onclick={() => (orient = orient === 'w' ? 'b' : 'w')} aria-label="Flip the board" title="Flip the board (f)"><Icon name="flip" size={20} /></button>
    <button class="hb" onclick={() => (pasting = true)} aria-label="Paste a PGN or FEN" title="Paste a PGN or FEN"><Icon name="plus" size={20} /></button>
  </header>

  <div class="boardcol">
    {@render strip(top)}
    <div class="withbar">
      {#if engineOn}<EvalBar cp={whiteCp} side={orient} />{/if}
      <div class="bd">
        <Board fen={cur.fen} side={orient} dests={pos.dests} lastMove={pos.last} check={pos.check} shapes={shapes} {mark} rev={boardRev} dark
          drawn={arrows[cur.id] ?? []} ondraw={(sh) => (arrows = { ...arrows, [cur.id]: sh })} {onmove} />
        {#if promo}<Promo side={turn} onpick={pickPromo} oncancel={cancelPromo} />{/if}
        <MoveInput legal={legalNow} onmove={playUci} onaction={onkey} dark />
      </div>
    </div>
    {@render strip(orient)}
  </div>

  <div class="side">
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}

    {#if comment}
      <div class="say {comment.k}">
        <KindIcon kind={comment.k} size={34} />
        <div><p class="h">{comment.head}{#if whiteCp !== null}<span class="ev t-num">{evalText(whiteCp)}</span>{/if}</p>{#if comment.sub}<p class="s">{comment.sub}</p>{/if}</div>
      </div>
    {:else if over}
      <div class="say"><div><p class="h">{over === 'mate' ? 'Checkmate' : 'Draw'}</p></div></div>
    {/if}

    {#if engineOn && lines.length}
      <div class="lines" aria-label="Engine lines">
        {#each lines as l}
          <p class="pv"><b class="t-num" class:wb={l.cp >= 0}>{evalText(l.cp)}</b>{#each l.moves as m, j}<button onclick={() => playLine(l.moves, j)}>{#if m.no}<em>{m.no}</em>{/if}{m.san}</button>{/each}</p>
        {/each}
      </div>
    {:else if engineOn && !over}
      <div class="lines"><p class="pv dim">Thinking…</p></div>
    {/if}

    {#if game}
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'review'} class:on={tab === 'review'} onclick={() => (tab = 'review')}>Review</button>
        <button role="tab" aria-selected={tab === 'moves'} class:on={tab === 'moves'} onclick={() => (tab = 'moves')}>Moves</button>
      </div>
    {/if}

    {#if game && tab === 'review'}
      {#if graph}<div class="gr"><EvalGraph cps={graph.cps} labels={graph.labels} cur={curPly ?? 0} kinds={verdicts.map((v) => v?.kind ?? null)} onpick={pickPly} /></div>{/if}
      {#if summary}
        <table class="sum">
          <thead><tr><th></th><th>{game.white}</th><th>{game.black}</th></tr></thead>
          <tbody>
            <tr class="accrow"><td>Accuracy</td><td class="t-num">{summary.w.accuracy?.toFixed(1) ?? '–'}</td><td class="t-num">{summary.b.accuracy?.toFixed(1) ?? '–'}</td></tr>
            {#each counted as k}
              <tr><td><span class="kl"><KindIcon kind={k} size={20} />{KIND_LABEL[k]}</span></td><td class="t-num" class:z={!summary.w.counts[k]}>{summary.w.counts[k]}</td><td class="t-num" class:z={!summary.b.counts[k]}>{summary.b.counts[k]}</td></tr>
            {/each}
          </tbody>
        </table>
      {:else if running}
        <div class="prog"><p>Reviewing the game · {pct}%</p><span class="track"><i style="width:{pct}%"></i></span></div>
      {/if}
    {:else}
      <div class="list" bind:this={list}>
        {#if !rows.length}<p class="empty">Play a move on the board, or paste a game with +.</p>{/if}
        {#each rows as r}
          {#if r.kind === 'pair'}
            <div class="pair">
              <span class="no">{r.no}</span>
              {#each [r.w, r.b] as n}
                {#if n}
                  {@const k = kindOf(n)}
                  <button class="mv" class:on={n === cur} onclick={() => tree.goto(n)}>{n.san}{#if k && SHOW_IN_LIST.has(k)}<KindIcon kind={k} size={16} />{/if}</button>
                {:else}<span class="mv ph">…</span>{/if}
              {/each}
            </div>
          {:else}
            <div class="vars">{#each r.alts as a (a.id)}<p>{@render vline(a)}</p>{/each}</div>
          {/if}
        {/each}
      </div>
      {#if gamePly(cur) === null && cur.parent}<button class="link del" onclick={removeHere}><Icon name="trash" size={16} /> Delete this variation</button>{/if}
    {/if}

    <div class="navrow"><NavBar dark canBack={!!cur.parent} canFwd={cur.children.length > 0} onnav={nav} /></div>
    <p class="keys" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd> move <kbd>↑</kbd><kbd>↓</kbd> start and end <kbd>f</kbd> flip <kbd>Nf3</kbd> play a move · right-drag draws an arrow</p>
  </div>
</div>

{#if pasting}
  <div class="sheet-bg" role="presentation" onclick={() => (pasting = false)}></div>
  <div class="dialog card" role="dialog" aria-label="Paste a PGN or FEN">
    <h2 class="t-title">Analyse a game or position</h2>
    <p class="t-small">Paste a PGN (one game) or a FEN.</p>
    <!-- svelte-ignore a11y_autofocus -->
    <textarea bind:value={pasteText} rows="7" autofocus placeholder={'[Event "…"]\n1. e4 e5 2. Nf3 …\n\nor\n\n' + START_FEN}></textarea>
    {#if problem}<p class="t-small bad">{problem}</p>{/if}
    <div class="row" style="gap:10px;margin-top:12px">
      <button class="btn quiet grow" onclick={() => (pasting = false)}>Cancel</button>
      <button class="btn grow" onclick={analysePaste} disabled={!pasteText.trim()}>Analyse</button>
    </div>
  </div>
{/if}

<style>
  .room { position: absolute; inset: 0; overflow-y: auto; background: var(--night); color: var(--night-ink); display: flex; flex-direction: column; padding: calc(env(safe-area-inset-top) + 6px) 0 calc(env(safe-area-inset-bottom) + 16px); }
  header { display: flex; align-items: center; gap: 6px; padding: 0 8px 0 4px; min-height: 52px; flex: none; }
  .x { width: 44px; height: 44px; display: grid; place-items: center; color: var(--night-ink-2); flex: none; }
  .ttl { flex: 1; min-width: 0; }
  .ttl .t-name { font-size: 19px; line-height: 1.1; }
  .ttl .sub { font-size: 12.5px; color: var(--night-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .hb { height: 40px; min-width: 40px; padding: 0 9px; display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 12px; color: var(--night-ink-2); font-size: 13px; font-weight: 650; flex: none; }
  .hb.on { background: var(--night-3); color: var(--night-ink); }
  .hb span { display: none; }
  @media (min-width: 420px) { .hb span { display: inline; } }

  .boardcol { padding: 0 8px; flex: none; }
  .withbar { display: flex; gap: 6px; align-items: stretch; }
  .withbar > :global(.bar) { margin-bottom: 12px; }
  .bd { position: relative; flex: 1; min-width: 0; }
  .who { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 4px; font-size: 14.5px; }
  .who .nm { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .who.you .nm { color: var(--sun); }
  .who .elo { color: var(--night-ink-2); font-size: 13px; }
  .who .sp { flex: 1; }
  .who .res { font-weight: 800; color: var(--night-ink-2); }
  .who .acc { min-width: 44px; text-align: center; padding: 3px 8px; border-radius: 8px; background: var(--night-3); font-weight: 800; font-size: 14px; }
  .pc { width: 13px; height: 13px; border-radius: 3px; flex: none; }
  .pc.w { background: #fff0d9; }
  .pc.b { background: #0b0d22; box-shadow: inset 0 0 0 1.5px var(--night-ink-2); }

  .side { display: flex; flex-direction: column; gap: 10px; padding: 8px 12px 0; }
  .problem { padding: 10px 12px; border-radius: 12px; background: var(--night-2); color: #feb6a8; font-size: 14px; }
  .say { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 16px; background: var(--night-2); animation: rise 160ms var(--ease) both; }
  .say .h { font-size: 17px; font-weight: 700; line-height: 1.2; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .say .ev { font-size: 14px; font-weight: 700; color: var(--night-ink-2); }
  .say .s { font-size: 14px; color: var(--night-ink-2); margin-top: 2px; }
  .lines { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; border-radius: 14px; background: var(--night-2); }
  .pv { display: flex; flex-wrap: nowrap; overflow: hidden; align-items: center; gap: 2px; min-height: 32px; font-size: 14px; white-space: nowrap; mask-image: linear-gradient(90deg, #000 85%, transparent); }
  .pv.dim { color: var(--night-ink-2); }
  .pv b { flex: none; min-width: 52px; margin-right: 6px; padding: 2px 6px; border-radius: 6px; text-align: center; font-size: 13px; background: #0b0d22; color: #fff0d9; }
  .pv b.wb { background: #fff0d9; color: #0b0d22; }
  .pv button { padding: 3px 4px; border-radius: 6px; color: var(--night-ink); font-weight: 550; }
  .pv em, .vm em { font-style: normal; color: var(--night-ink-2); margin-right: 2px; font-weight: 500; }
  .tabs { display: flex; gap: 4px; padding: 4px; border-radius: 14px; background: var(--night-2); }
  .tabs button { flex: 1; height: 38px; border-radius: 10px; font-weight: 650; font-size: 14.5px; color: var(--night-ink-2); }
  .tabs button.on { background: var(--night-3); color: var(--night-ink); }
  .gr { padding-top: 26px; }
  .sum { width: 100%; border-collapse: collapse; font-size: 14px; }
  .sum th { font-size: 12.5px; font-weight: 650; color: var(--night-ink-2); text-align: center; padding: 0 4px 6px; max-width: 110px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sum td { padding: 4px; text-align: center; border-top: 1px solid var(--night-3); }
  .sum td:first-child { text-align: left; }
  .sum .z { color: var(--night-ink-2); opacity: 0.45; }
  .sum .accrow td { font-size: 17px; font-weight: 800; padding: 8px 4px; }
  .sum .accrow td:first-child { font-size: 14px; font-weight: 650; }
  .kl { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; }
  .prog { padding: 12px; border-radius: 14px; background: var(--night-2); font-size: 14px; }
  .prog .track { display: block; height: 8px; margin-top: 8px; border-radius: 4px; background: var(--night-3); overflow: hidden; }
  .prog .track i { display: block; height: 100%; background: var(--sun); transition: width 200ms; }

  .list { max-height: 46vh; overflow-y: auto; border-radius: 14px; background: var(--night-2); padding: 4px 0; }
  .empty { padding: 14px; font-size: 14px; color: var(--night-ink-2); }
  .pair { display: grid; grid-template-columns: 44px 1fr 1fr; align-items: center; }
  .pair:nth-child(odd) { background: rgba(255, 255, 255, 0.025); }
  .no { padding-left: 12px; font-size: 13px; color: var(--night-ink-2); }
  .mv { display: flex; align-items: center; justify-content: space-between; gap: 6px; height: 32px; padding: 0 8px; margin: 1px 4px 1px 0; border-radius: 7px; font-size: 15px; font-weight: 600; text-align: left; color: var(--night-ink); }
  .mv.ph { color: var(--night-ink-2); }
  .mv.on, .vm.on { background: var(--cobalt); color: #fff; }
  .vars { padding: 4px 12px 6px 44px; font-size: 13.5px; color: var(--night-ink-2); border-left: 2px solid var(--night-3); margin-left: 12px; }
  .vars p { line-height: 1.9; }
  .vm { padding: 1px 4px; border-radius: 6px; color: var(--night-ink-2); }
  .paren { opacity: 0.6; }
  .del { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--night-ink-2); }
  .navrow { padding-top: 2px; }
  .keys { display: none; }

  .sheet-bg { position: fixed; inset: 0; z-index: 60; background: rgba(13, 16, 36, 0.55); }
  .dialog { position: fixed; z-index: 61; left: 16px; right: 16px; top: 14%; max-width: 520px; margin: 0 auto; padding: 20px; color: var(--ink); animation: rise 220ms var(--ease) both; }
  .dialog textarea { width: 100%; margin-top: 10px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--ground); color: var(--ink); font: 13.5px/1.4 ui-monospace, monospace; resize: vertical; user-select: text; -webkit-user-select: text; }
  .dialog .bad { color: var(--bad-text); margin-top: 6px; }

  /* a tablet upright: one column, the board as large as the height allows */
  @media (orientation: portrait) and (min-width: 560px) {
    .room { padding-left: max(0px, calc((100% - 760px) / 2)); padding-right: max(0px, calc((100% - 760px) / 2)); }
  }
  /* landscape and desktop: the board on the left, the review beside it */
  @media (orientation: landscape) and (min-width: 760px) {
    .room {
      --bw: min(calc(100dvh - 150px), calc(100vw - 480px), 820px);
      display: grid; grid-template-columns: calc(var(--bw) + 40px) minmax(320px, 460px); grid-template-rows: auto minmax(0, 1fr);
      grid-template-areas: 'head head' 'board side'; justify-content: center; column-gap: 24px; overflow: hidden; padding-bottom: 16px;
    }
    header { grid-area: head; max-width: calc(var(--bw) + 524px); width: 100%; justify-self: center; }
    .boardcol { grid-area: board; }
    .side { grid-area: side; min-height: 0; overflow-y: auto; padding: 0 4px 0 0; }
    .list { max-height: none; flex: 1 1 auto; min-height: 160px; }
  }
  @media (min-width: 1024px) and (min-height: 600px) {
    .room { padding: 6px 32px 24px; }
    .x, .hb { transition: background 140ms, color 140ms; }
    .x:hover, .hb:hover { background: var(--night-3); color: var(--night-ink); border-radius: 12px; }
    .mv:not(.on):hover, .vm:not(.on):hover, .pv button:hover, .tabs button:not(.on):hover { background: var(--night-3); }
    .keys { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12.5px; color: var(--night-ink-2); }
    .keys kbd { font: inherit; font-weight: 700; font-size: 11.5px; padding: 2px 7px; border-radius: 6px; background: var(--night-3); color: var(--night-ink); margin-left: 8px; }
    .keys kbd:first-child { margin-left: 0; }
  }
</style>
