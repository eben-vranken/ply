<script lang="ts">
  // Your games from chess.com and Lichess, newest first: tap one for its review. Also the way into
  // the analysis board, empty or from a pasted PGN or FEN.
  import { Chess } from 'chess.js';
  import { app, go } from '../lib/state.svelte';
  import { db, type GameRow } from '../lib/db';
  import { model, nameOf } from '../lib/model.svelte';
  import { epdOf, uciOf } from '../lib/chess';
  import { accuracies, pending } from '../lib/engine/review';
  import Icon from '../lib/Icon.svelte';

  let games = $state.raw<GameRow[]>([]);
  let acc = $state.raw(new Map<string, { w: number | null; b: number | null }>());
  let shown = $state(40);
  let filter = $state<'all' | 'w' | 'b' | 'win' | 'loss'>('all');
  let pasting = $state(false);
  let text = $state('');
  let bad = $state('');
  $effect(() => { void model.rev; void db.games.orderBy('date').reverse().toArray().then((g) => (games = g)); void accuracies().then((a) => (acc = a)); });

  const list = $derived(games.filter((g) => filter === 'all' || g.colour === filter || g.result === filter));
  // the opening each game reached, read once per game
  const names = new Map<string, string>();
  function opening(g: GameRow): string {
    const have = names.get(g.url);
    if (have !== undefined) return have;
    let out = '';
    try {
      const c = new Chess(); c.loadPgn(g.pgn);
      const h = c.history({ verbose: true }).slice(0, 30);
      const ucis = h.map(uciOf);
      for (let k = h.length; k > 0 && !out; k--) { const [eco, nm] = nameOf(epdOf(h[k - 1].after), ucis.slice(0, k)); if (eco) out = nm; }
    } catch { /* unreadable: no name */ }
    names.set(g.url, out);
    return out;
  }
  const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  const site = (u: string) => (u.includes('lichess.org') ? 'Lichess' : u.includes('chess.com') ? 'chess.com' : 'Pasted');

  function analyse() {
    const t = text.trim();
    if (!t) return;
    try { const c = new Chess(t); go('/review?fen=' + encodeURIComponent(c.fen())); return; } catch { /* a PGN */ }
    try { const c = new Chess(); c.loadPgn(t); if (!c.history().length) throw new Error(); } catch { bad = 'That is neither a PGN nor a FEN Ply can read.'; return; }
    pending.pgn = t;
    go('/review?pgn=1');
  }
</script>

<div class="screen gm">
  <header class="screen-head">
    <h1 class="t-display">Games</h1>
  </header>

  <div class="acts">
    <button class="btn grow" onclick={() => go('/review')}><Icon name="explore" size={20} /> Analysis board</button>
    <button class="btn quiet grow" onclick={() => { pasting = true; bad = ''; }}><Icon name="plus" size={20} /> Paste PGN or FEN</button>
  </div>

  <div class="seg" role="group" aria-label="Show">
    {#each [['all', 'All'], ['w', 'White'], ['b', 'Black'], ['win', 'Wins'], ['loss', 'Losses']] as [k, l]}
      <button class:on={filter === k} onclick={() => { filter = k as typeof filter; shown = 40; }}>{l}</button>
    {/each}
  </div>

  {#if list.length}
    <ul class="card rows">
      {#each list.slice(0, shown) as g (g.url)}
        {@const a = acc.get(g.url)}
        <li>
          <button onclick={() => go('/review?g=' + encodeURIComponent(g.url))}>
            <span class="res {g.result}" aria-label={g.result}>{g.result === 'win' ? 'W' : g.result === 'loss' ? 'L' : '½'}</span>
            <span class="grow mid">
              <span class="who"><i class="pc {g.colour}" title={g.colour === 'w' ? 'You had White' : 'You had Black'}></i>vs <b>{g.opponent}</b></span>
              <span class="t-small op">{opening(g) || 'Opening not named'}</span>
              <span class="t-small meta">{day(g.date)} · {g.timeClass} · {site(g.url)}</span>
            </span>
            {#if a}{@const mine = g.colour === 'w' ? a.w : a.b}<span class="acc t-num" title="Your accuracy">{mine?.toFixed(0) ?? '–'}</span>{/if}
            <Icon name="next" size={18} />
          </button>
        </li>
      {/each}
    </ul>
    {#if list.length > shown}<button class="btn quiet more" onclick={() => (shown += 40)}>Show {Math.min(40, list.length - shown)} more</button>{/if}
  {:else}
    <div class="card empty">
      <p class="t-head">{games.length ? 'No games match' : 'No games yet'}</p>
      <p class="t-small">{games.length ? 'Try another filter.' : app.username || app.lichessUser ? 'Your games appear here after the next sync.' : 'Add your chess.com or Lichess name in Settings, and your games come in to review here. Or paste a PGN above.'}</p>
      {#if !games.length && !app.username && !app.lichessUser}<button class="btn quiet" onclick={() => go('/settings')}>Open Settings</button>{/if}
    </div>
  {/if}
</div>

{#if pasting}
  <div class="sheet-bg" role="presentation" onclick={() => (pasting = false)}></div>
  <div class="dialog card" role="dialog" aria-label="Paste a PGN or FEN">
    <h2 class="t-title">Analyse a game or position</h2>
    <p class="t-small">Paste a PGN (one game) or a FEN.</p>
    <!-- svelte-ignore a11y_autofocus -->
    <textarea bind:value={text} rows="8" autofocus placeholder="1. e4 e5 2. Nf3 Nc6 …"></textarea>
    {#if bad}<p class="t-small badt">{bad}</p>{/if}
    <div class="row" style="gap:10px;margin-top:12px">
      <button class="btn quiet grow" onclick={() => (pasting = false)}>Cancel</button>
      <button class="btn grow" onclick={analyse} disabled={!text.trim()}>Analyse</button>
    </div>
  </div>
{/if}

<style>
  .acts { display: flex; gap: 10px; flex-wrap: wrap; }
  .acts .btn { padding: 0 14px; font-size: 15.5px; gap: 8px; white-space: nowrap; }
  .seg { display: flex; gap: 4px; margin: 16px 0 10px; padding: 4px; border-radius: 14px; background: var(--card); box-shadow: var(--shadow); overflow-x: auto; scrollbar-width: none; }
  .seg button { flex: 1; height: 36px; padding: 0 10px; border-radius: 10px; font-weight: 650; font-size: 14px; color: var(--ink-2); white-space: nowrap; }
  .seg button.on { background: var(--ink); color: var(--on-ink); }
  .rows { list-style: none; margin: 0; padding: 4px; }
  .rows li + li { border-top: 1px solid var(--ground); }
  .rows button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 72px; padding: 8px 10px; text-align: left; border-radius: 14px; color: var(--ink-3); }
  .rows button:active { background: var(--ground); }
  .res { flex: none; width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; font-weight: 800; font-size: 15px; background: var(--wash); color: var(--ink-2); }
  .res.win { background: var(--good-tint); color: var(--good-text); }
  .res.loss { background: var(--bad-tint); color: var(--bad-text); }
  .mid { display: flex; flex-direction: column; min-width: 0; color: var(--ink); }
  .who { display: flex; align-items: center; gap: 7px; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .op { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink-2); }
  .meta { color: var(--ink-3); font-size: 12.5px; }
  .pc { width: 11px; height: 11px; border-radius: 3px; flex: none; }
  .pc.w { background: #fff; box-shadow: inset 0 0 0 1.5px var(--ink-3); }
  .pc.b { background: var(--ink-fixed); }
  .acc { flex: none; min-width: 40px; padding: 4px 8px; border-radius: 9px; text-align: center; font-weight: 800; font-size: 15px; color: var(--ink); background: var(--wash); }
  .more { width: 100%; margin-top: 10px; }
  .empty { padding: 20px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .sheet-bg { position: fixed; inset: 0; z-index: 60; background: rgba(13, 16, 36, 0.45); }
  .dialog { position: fixed; z-index: 61; left: 16px; right: 16px; top: 14%; max-width: 520px; margin: 0 auto; padding: 20px; animation: rise 220ms var(--ease) both; }
  .dialog textarea { width: 100%; margin-top: 10px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--ground); color: var(--ink); font: 13.5px/1.4 ui-monospace, monospace; resize: vertical; user-select: text; -webkit-user-select: text; }
  .badt { color: var(--bad-text); margin-top: 6px; }
  @media (min-width: 1024px) and (min-height: 600px) {
    .screen.gm { max-width: 760px; margin: 0 auto; padding: 24px 32px 40px; }
    .rows button { cursor: pointer; transition: background 120ms; }
    .rows button:hover { background: var(--ground); }
  }
</style>
