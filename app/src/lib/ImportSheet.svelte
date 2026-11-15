<script lang="ts">
  // Import a repertoire: paste PGN or pick a .pgn file, see what would change, then add it.
  // Nothing is written before "Add to my repertoire".
  import { readPgn, type PgnGame } from './pgn';
  import { plan, rows, type Plan, type Choice } from './import/repertoire';
  import { currentAt, noteAt, data, depthLimit, importRepertoire, model } from './model.svelte';
  import { moveOrder, sans, san as sanOf, type Side } from './chess';
  import Icon from './Icon.svelte';

  let { onclose, ondone }: { onclose: () => void; ondone: (msg: string) => void } = $props();

  let source = $state<'paste' | 'file'>('paste');
  let text = $state('');
  let fileName = $state('');
  let games = $state<PgnGame[] | null>(null);
  let side = $state<Side | null>(null);
  let error = $state('');
  let busy = $state(false);
  let branches = $state(false);
  let choices = $state<Record<string, Choice>>({});
  let showGames = $state(false);

  const needsSide = $derived(!!games?.some((g) => !/^[wb]/i.test(g.headers.Orientation ?? '')));
  const p = $derived.by<Plan | null>(() => {
    void model.rev;
    return games && (!needsSide || side) ? plan({ games, side, current: currentAt, note: noteAt, inTree: (e) => !!data()?.tree[e], depth: depthLimit() }) : null;
  });
  const ok = $derived(p ? p.games.filter((g) => !g.skipped) : []);
  const skipped = $derived(p ? p.games.filter((g) => g.skipped) : []);
  const yours = $derived(p ? [...p.picks.values()].filter((x) => x.moves.length).length : 0);
  const replies = $derived(p ? [...p.replies.values()].reduce((n, r) => n + r.replies.length, 0) : 0);

  async function pickFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    fileName = f.name;
    text = await f.text();
    read();
  }
  function read() {
    error = '';
    const gs = readPgn(text);
    if (!gs.length || gs.every((g) => !g.moves.length)) { error = 'No moves found. Paste the PGN of a game or a study, with its moves.'; games = null; return; }
    games = gs; choices = {};
  }
  const setAll = (c: Choice) => { if (p) choices = Object.fromEntries(p.conflicts.map((x) => [x.key, c])); };
  const order = (path: string[]) => moveOrder(sans(path), true);
  const sanList = (epd: string, ms: string[]) => ms.map((u) => sanOf(epd, u)).join(' / ');

  async function apply() {
    if (!p) return;
    busy = true;
    try {
      const r = await importRepertoire(rows(p, { choices, branches, current: currentAt, note: noteAt }));
      ondone(`Imported ${r.positions} position${r.positions === 1 ? '' : 's'} of yours from ${ok.length} game${ok.length === 1 ? '' : 's'}. Your lines were regenerated.`);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally { busy = false; }
  }
</script>

<div class="sheet-bg" role="presentation" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-label="Import a repertoire">
  <div class="grab" aria-hidden="true"></div>
  <div class="hd">
    <h2 class="t-title">Import a repertoire</h2>
    <button class="x" onclick={onclose} aria-label="Close"><Icon name="close" /></button>
  </div>

  {#if !games}
    <p class="t-small">PGN with your lines: one game or many, variations and comments included. Your moves become your repertoire, the opponent's moves your lines, and comments your notes.</p>
    <div class="seg" role="group" aria-label="Where from">
      <button class:on={source === 'paste'} onclick={() => (source = 'paste')}>Paste</button>
      <button class:on={source === 'file'} onclick={() => (source = 'file')}>File</button>
    </div>
    {#if source === 'paste'}
      <textarea rows="8" bind:value={text} placeholder={'[Orientation "white"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 …'} aria-label="PGN"></textarea>
      <button class="btn wide" onclick={read} disabled={!text.trim()}>Read the PGN</button>
    {:else}
      <label class="btn quiet wide file">{fileName || 'Choose a .pgn file'}<input type="file" accept=".pgn,application/x-chess-pgn,application/vnd.chess-pgn,text/plain" hidden onchange={pickFile} /></label>
    {/if}
  {:else}
    {#if needsSide}
      <div class="card q">
        <p><b>{games.every((g) => !g.headers.Orientation) ? 'Which side are these lines for?' : 'Some games do not say which side they are for.'}</b></p>
        <div class="seg">
          <button class:on={side === 'w'} onclick={() => (side = 'w')}><i class="pc w"></i>I play White</button>
          <button class:on={side === 'b'} onclick={() => (side = 'b')}><i class="pc b"></i>I play Black</button>
        </div>
      </div>
    {/if}
    {#if p}
      <div class="card sum">
        <p class="big"><b class="t-num">{yours}</b> position{yours === 1 ? '' : 's'} with your move · <b class="t-num">{replies}</b> opponent repl{replies === 1 ? 'y' : 'ies'}</p>
        <button class="link" onclick={() => (showGames = !showGames)}>{ok.length} game{ok.length === 1 ? '' : 's'} read{skipped.length ? `, ${skipped.length} skipped` : ''}</button>
        {#if showGames || skipped.length}
          <ul class="games">
            {#each p.games as g}
              {#if showGames || g.skipped}<li class:skip={!!g.skipped}><b class="t-name">{g.name}</b> <span>{g.skipped ?? `${g.side === 'w' ? 'White' : 'Black'} · ${g.moves} moves`}</span></li>{/if}
            {/each}
          </ul>
        {/if}
        <ul class="facts">
          <li><Icon name="check" size={16} /> {p.added} added to your repertoire{p.same ? `, ${p.same} already your own move` : ''}</li>
          {#if p.outside}<li><Icon name="explore" size={16} /> {p.outside} of your moves are past the end of the {model.band} band's data. Your lines follow them from this PGN.</li>{/if}
          {#if p.deep}<li><Icon name="layers" size={16} /> {p.deep} of your moves are deeper than your line depth ({depthLimit()} moves). They are kept, and trained once you raise Line depth in Settings.</li>{/if}
          {#if p.notes || p.notesKept}<li><Icon name="star" size={16} /> {p.notes} note{p.notes === 1 ? '' : 's'} from the comments{p.notesKept ? `; ${p.notesKept} position${p.notesKept === 1 ? '' : 's'} keep${p.notesKept === 1 ? 's' : ''} your own note` : ''}</li>{/if}
        </ul>
        {#if p.branchy.length}
          <label class="rr"><span class="grow"><b>Keep every move of yours as a branch</b><br /><span class="t-small">At {p.branchy.length} position{p.branchy.length === 1 ? '' : 's'} the PGN gives you more than one move. Off: only its main line move.</span></span><input type="checkbox" role="switch" bind:checked={branches} /></label>
        {/if}
      </div>

      {#if p.conflicts.length}
        <div class="sect"><h3 class="t-head">{p.conflicts.length} conflict{p.conflicts.length === 1 ? '' : 's'}</h3><span class="all"><button onclick={() => setAll('pgn')}>All PGN</button><button onclick={() => setAll('mine')}>All mine</button></span></div>
        <p class="t-small">You already chose a different move here. Cards for a move you drop are retired; the rest keep their schedule.</p>
        <ul class="conf">
          {#each p.conflicts as c (c.key)}
            {@const ch = choices[c.key] ?? 'pgn'}
            <li class="card">
              <p class="ord">{c.side === 'w' ? 'White' : 'Black'} · {order(c.path)}</p>
              <p class="vs"><span>Yours <b>{sanList(c.epd, c.mine)}</b></span><span>PGN <b>{sanList(c.epd, c.theirs)}</b></span></p>
              <div class="pick" role="group" aria-label="Keep which">
                <button class:on={ch === 'pgn'} onclick={() => (choices[c.key] = 'pgn')}>PGN</button>
                <button class:on={ch === 'mine'} onclick={() => (choices[c.key] = 'mine')}>Mine</button>
                <button class:on={ch === 'both'} onclick={() => (choices[c.key] = 'both')}>Both</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="row foot">
        <button class="btn quiet" onclick={() => { games = null; side = null; }} aria-label="Back"><Icon name="back" size={20} /></button>
        <button class="btn grow" onclick={apply} disabled={busy || !yours}>{busy ? 'Adding…' : 'Add to my repertoire'}</button>
      </div>
    {/if}
  {/if}
  {#if error}<p class="err" role="alert">{error}</p>{/if}
</div>

<style>
  .sheet-bg { position: fixed; inset: 0; z-index: 60; background: rgba(13, 16, 36, 0.45); animation: fadein 200ms both; }
  .sheet { position: fixed; z-index: 61; left: 0; right: 0; bottom: 0; max-width: 640px; margin: 0 auto; max-height: 92vh; overflow-y: auto; background: var(--ground); border-radius: 26px 26px 0 0; padding: 8px 16px calc(env(safe-area-inset-bottom) + 20px); animation: up 300ms var(--ease) both; display: flex; flex-direction: column; gap: 12px; }
  @keyframes up { from { transform: translateY(100%); } }
  @keyframes fadein { from { opacity: 0; } }
  .grab { width: 42px; height: 5px; border-radius: 3px; background: var(--line); margin: 0 auto; flex: none; }
  .hd { display: flex; align-items: center; justify-content: space-between; }
  .x { width: 44px; height: 44px; display: grid; place-items: center; margin-right: -10px; }
  textarea { width: 100%; border: 0; border-radius: 16px; background: var(--card); padding: 12px 14px; font: 13px/1.45 ui-monospace, monospace; color: var(--ink); resize: vertical; }
  .file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .seg { display: flex; background: var(--card); border-radius: 14px; padding: 4px; box-shadow: var(--shadow); align-self: flex-start; }
  .q .seg { margin-top: 10px; box-shadow: none; background: var(--ground); }
  .seg button { height: 40px; padding: 0 14px; border-radius: 10px; font-weight: 650; font-size: 14px; display: flex; align-items: center; gap: 7px; color: var(--ink-2); }
  .seg button.on { background: var(--ink); color: var(--on-ink); }
  .pc { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--ink-3); }
  .pc.w { background: #fff; }
  .pc.b { background: var(--ink-fixed); }
  .sum { display: flex; flex-direction: column; gap: 6px; }
  .big { font-size: 16px; }
  .big b { font-size: 22px; }
  .games { list-style: none; margin: 0; padding: 0; font-size: 13.5px; max-height: 180px; overflow-y: auto; }
  .games li { padding: 5px 0; border-top: 1px solid var(--ground); display: flex; gap: 8px; justify-content: space-between; }
  .games li span { color: var(--ink-2); text-align: right; }
  .games li.skip span { color: var(--bad-text); }
  .facts { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14px; color: var(--ink-2); }
  .facts li { display: flex; gap: 8px; align-items: flex-start; }
  .facts :global(svg) { margin-top: 2px; color: var(--accent-text); }
  .rr { display: flex; align-items: center; gap: 12px; min-height: 52px; margin-top: 6px; border-top: 1px solid var(--ground); padding-top: 10px; }
  input[role='switch'] { appearance: none; width: 54px; height: 32px; border-radius: 16px; background: var(--st-new); position: relative; transition: background 160ms; flex: none; }
  input[role='switch']::after { content: ''; position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px rgba(21, 25, 54, 0.3); transition: transform 220ms var(--spring); }
  input[role='switch']:checked { background: var(--cobalt); }
  input[role='switch']:checked::after { transform: translateX(22px); }
  .sect { display: flex; justify-content: space-between; align-items: baseline; margin: 6px 2px 0; }
  .all { display: flex; gap: 6px; }
  .all button { font-size: 13px; font-weight: 650; color: var(--accent-text); min-height: 36px; padding: 0 6px; }
  .conf { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .conf li { padding: 12px 14px; }
  .ord { font-size: 13px; color: var(--ink-2); }
  .vs { display: flex; gap: 16px; margin: 4px 0 10px; font-size: 14px; color: var(--ink-2); }
  .vs b { font-size: 17px; color: var(--ink); margin-left: 4px; }
  .pick { display: flex; gap: 6px; }
  .pick button { flex: 1; height: 40px; border-radius: 12px; background: var(--ground); font-weight: 650; font-size: 14px; color: var(--ink-2); }
  .pick button.on { background: var(--ink); color: var(--on-ink); }
  .foot { gap: 10px; position: sticky; bottom: 0; padding-top: 6px; background: var(--ground); }
  .foot .quiet { width: 56px; padding: 0; }
  .err { color: var(--bad-text); font-weight: 600; font-size: 14px; }
</style>
