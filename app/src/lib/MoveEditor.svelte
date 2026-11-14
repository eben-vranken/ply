<script lang="ts">
  // Change your move at a position, or add a second one (a branch).
  // Every move is listed with frequency, W/D/L and eval at your band.
  import { data, movesAt, repRow, setMoves, setNote, model } from './model.svelte';
  import { san, child, evalGlyph, evalText, type Side } from './chess';
  import Icon from './Icon.svelte';

  let { side, epd, onclose }: { side: Side; epd: string; onclose: () => void } = $props();
  const node = $derived.by(() => { void model.rev; return data()?.tree[epd]; });
  const mine = $derived.by(() => { void model.rev; return movesAt(side, epd); });
  let note = $state(repRow(side, epd)?.note ?? '');
  let busy = $state(false);
  const rows = $derived((node?.m ?? []).map(([u, g, w, d, b]) => {
    const t = w + d + b || 1;
    const c = data()?.tree[child(epd, u)];
    return { u, san: san(epd, u), g, freq: node!.g ? g / node!.g : 0, w: (w / t) * 100, d: (d / t) * 100, b: (b / t) * 100, cp: c?.e ?? null };
  }));
  /** Make `u` your (first) move; with a branch, the other move stays as the second. */
  async function choose(u: string) {
    busy = true;
    const next = mine.length > 1 ? [u, ...mine.filter((m) => m !== u)].slice(0, mine.length) : [u];
    await setMoves(side, epd, next);
    busy = false;
  }
  async function branch(u: string) { busy = true; await setMoves(side, epd, mine.includes(u) ? mine.filter((m) => m !== u) : [...mine, u]); busy = false; }
  async function keepNote() { await setNote(side, epd, note.trim()); }
</script>

<div class="sheet-bg" role="presentation" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-label="Your move here">
  <div class="grab" aria-hidden="true"></div>
  <div class="hd">
    <h2 class="t-title">Your move here</h2>
    <button class="x" onclick={onclose} aria-label="Close"><Icon name="close" /></button>
  </div>
  <p class="t-small">Tap a move to make it yours. A second ★ creates a branch: lines are generated below each of your moves. Changing a move retires the cards below the old one.</p>
  <div class="list" aria-busy={busy}>
    {#each rows as r (r.u)}
      {@const on = mine.includes(r.u)}
      <div class="mv" class:on>
        <button class="pick" onclick={() => choose(r.u)} aria-pressed={mine[0] === r.u}>
          <span class="san">{r.san}{#if on}<span class="star"><Icon name="star" size={14} fill /></span>{/if}{#if node?.d === r.u}<span class="dot" title="Default move"></span>{/if}</span>
          <span class="pct"><b>{Math.round(r.freq * 100)}%</b><small>{r.g.toLocaleString('en')}</small></span>
          <span class="wdl" role="img" aria-label="White {Math.round(r.w)}%, draw {Math.round(r.d)}%, Black {Math.round(r.b)}%"><i class="w" style="width:{r.w}%"></i><i class="d" style="width:{r.d}%"></i><i class="b" style="width:{r.b}%"></i></span>
          <span class="ev">{#if r.cp !== null}<b>{evalGlyph(r.cp)}</b><small>{evalText(r.cp)}</small>{:else}<small>—</small>{/if}</span>
        </button>
        <button class="br" onclick={() => branch(r.u)} disabled={on && mine.length === 1} aria-label={on ? `Remove ${r.san} from your moves` : `Add ${r.san} as a second move`}>
          <Icon name={on && mine.length > 1 ? 'close' : 'plus'} size={18} />
        </button>
      </div>
    {/each}
  </div>
  <label class="notefield">
    <span class="t-small">Note for this position</span>
    <textarea rows="2" bind:value={note} onblur={keepNote} placeholder="Why this move, what to watch for"></textarea>
  </label>
</div>

<style>
  .sheet-bg { position: fixed; inset: 0; z-index: 60; background: rgba(13, 16, 36, 0.45); animation: fadein 200ms both; }
  .sheet { position: fixed; z-index: 61; left: 0; right: 0; bottom: 0; max-height: 86vh; overflow-y: auto; background: var(--ground); border-radius: 26px 26px 0 0; padding: 8px 16px calc(env(safe-area-inset-bottom) + 20px); animation: up 300ms var(--ease) both; }
  @keyframes up { from { transform: translateY(100%); } }
  @keyframes fadein { from { opacity: 0; } }
  .grab { width: 42px; height: 5px; border-radius: 3px; background: var(--line); margin: 0 auto 10px; }
  .hd { display: flex; align-items: center; justify-content: space-between; }
  .x { width: 44px; height: 44px; display: grid; place-items: center; margin-right: -10px; }
  .list { background: var(--card); border-radius: 20px; padding: 4px; margin-top: 12px; }
  .mv { display: flex; align-items: center; border-radius: 16px; }
  .mv + .mv { border-top: 1px solid var(--ground); }
  .mv.on { background: var(--accent-tint, var(--wash)); }
  .pick { flex: 1; display: grid; grid-template-columns: 84px 56px 1fr 42px; gap: 10px; align-items: center; min-height: 54px; padding: 0 6px 0 10px; text-align: left; }
  .san { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 5px; }
  .star { color: var(--accent-text); display: inline-grid; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-3); }
  .pct b, .ev b { display: block; font-size: 14px; }
  .pct small, .ev small { font-size: 11px; color: var(--ink-3); }
  .ev { text-align: right; }
  .br { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; color: var(--ink-2); flex: none; }
  .br:disabled { opacity: 0.3; }
  .notefield { display: block; margin-top: 14px; }
  .notefield textarea { width: 100%; margin-top: 6px; border: 0; border-radius: 16px; background: var(--card); padding: 12px 14px; font: inherit; color: var(--ink); resize: none; user-select: text; }
</style>
