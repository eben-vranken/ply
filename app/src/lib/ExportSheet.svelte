<script lang="ts">
  // Export your repertoire as PGN: everything, one colour, or one opening.
  import { summaries, model } from './model.svelte';
  import { exportRepertoire, exportOpening, pgnName } from './export';
  import { shareFile } from './backup';
  import type { Side } from './chess';
  import Icon from './Icon.svelte';

  let { onclose, ondone }: { onclose: () => void; ondone: (msg: string) => void } = $props();
  const ops = $derived.by(() => { void model.rev; return summaries().filter((o) => o.path.length && o.total > 0); });
  let busy = $state(false);

  async function go(what: 'all' | Side | { side: Side; path: string[]; name: string }) {
    busy = true;
    try {
      const text = typeof what === 'string' ? exportRepertoire(what) : exportOpening(what.side, what.path);
      const label = typeof what === 'string' ? (what === 'all' ? 'repertoire' : what === 'w' ? 'white' : 'black') : `${what.name}-${what.side === 'w' ? 'white' : 'black'}`;
      if (await shareFile(pgnName(label), text, 'application/x-chess-pgn')) ondone(`Exported ${pgnName(label)}.`);
    } finally { busy = false; }
  }
</script>

<div class="sheet-bg" role="presentation" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-label="Export PGN">
  <div class="grab" aria-hidden="true"></div>
  <div class="hd">
    <h2 class="t-title">Export PGN</h2>
    <button class="x" onclick={onclose} aria-label="Close"><Icon name="close" /></button>
  </div>
  <p class="t-small">Your lines with every variation, the most played move first, and your notes as comments. Lichess studies, ChessBase and Ply itself read it back.</p>
  <div class="row three">
    <button class="btn" onclick={() => go('all')} disabled={busy}><Icon name="share" size={18} /> Everything</button>
    <button class="btn quiet" onclick={() => go('w')} disabled={busy}>White</button>
    <button class="btn quiet" onclick={() => go('b')} disabled={busy}>Black</button>
  </div>
  <h3 class="t-head">One opening</h3>
  <ul class="card ops">
    {#each ops as o (o.key)}
      <li><button onclick={() => go({ side: o.side, path: o.path, name: o.name })} disabled={busy}>
        <span class="grow"><span class="t-name nm">{o.name}</span><span class="t-small">{o.side === 'w' ? 'White' : `Black, ${o.section.slice(6)}`} · {o.lines} line{o.lines === 1 ? '' : 's'}</span></span>
        <Icon name="share" size={18} />
      </button></li>
    {/each}
  </ul>
</div>

<style>
  .sheet-bg { position: fixed; inset: 0; z-index: 60; background: rgba(13, 16, 36, 0.45); animation: fadein 200ms both; }
  .sheet { position: fixed; z-index: 61; left: 0; right: 0; bottom: 0; max-width: 640px; margin: 0 auto; max-height: 88vh; overflow-y: auto; background: var(--ground); border-radius: 26px 26px 0 0; padding: 8px 16px calc(env(safe-area-inset-bottom) + 20px); animation: up 300ms var(--ease) both; display: flex; flex-direction: column; gap: 12px; }
  @keyframes up { from { transform: translateY(100%); } }
  @keyframes fadein { from { opacity: 0; } }
  .grab { width: 42px; height: 5px; border-radius: 3px; background: var(--line); margin: 0 auto; flex: none; }
  .hd { display: flex; align-items: center; justify-content: space-between; }
  .x { width: 44px; height: 44px; display: grid; place-items: center; margin-right: -10px; }
  .three { gap: 8px; }
  .three .btn { flex: 1; padding: 0 10px; font-size: 15px; }
  .t-head { margin: 6px 2px 0; }
  .ops { list-style: none; margin: 0; padding: 4px; }
  .ops li + li { border-top: 1px solid var(--ground); }
  .ops button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 56px; padding: 6px 10px; text-align: left; border-radius: 12px; color: var(--ink-2); }
  .ops button:active { background: var(--ground); }
  .nm { display: block; font-size: 18px; color: var(--ink); line-height: 1.15; }
</style>
