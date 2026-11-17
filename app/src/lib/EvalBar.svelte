<script lang="ts">
  // The evaluation bar beside the board, as on Lichess: White's share fills from White's side.
  // The fill follows winning chances, not raw centipawns, so +1 and +2 look different and +9 and
  // +12 do not. `cp` is from White's view (mates as ±(10000 − n)); null means not known yet.
  import { evalText } from './chess';

  let { cp, side = 'w' }: { cp: number | null; side?: 'w' | 'b' } = $props();

  const white = $derived.by(() => {
    if (cp === null) return 50;
    if (Math.abs(cp) >= 9000) return cp > 0 ? 100 : 0;
    // Lichess's winning-chances curve
    const wc = 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
    return Math.max(3, Math.min(97, 50 + 50 * wc));
  });
  const text = $derived(cp === null ? '' : evalText(cp));
  // the number sits at the end of whoever is better, on their colour
  const whiteBetter = $derived((cp ?? 0) >= 0);
  const atBottom = $derived(whiteBetter === (side === 'w'));
</script>

<div class="bar" class:flip={side === 'b'} class:unknown={cp === null} role="img" aria-label={cp === null ? 'Evaluation loading' : `Evaluation ${text}`} title={text}>
  <i class="w" style="height:{white}%"></i>
  <span class="mid" aria-hidden="true"></span>
  {#if text}<b class="t-num" class:bottom={atBottom} class:onwhite={whiteBetter}>{text.replace(/^[+−-]/, '')}</b>{/if}
</div>

<style>
  .bar { position: relative; width: 14px; flex: none; border-radius: 5px; overflow: hidden; background: #313964; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25); }
  .w { position: absolute; left: 0; right: 0; bottom: 0; background: #fff0d9; transition: height 420ms var(--ease, ease); }
  .flip .w { bottom: auto; top: 0; }
  .unknown .w { opacity: 0.55; }
  .mid { position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: rgba(230, 60, 40, 0.55); }
  b { position: absolute; left: 0; right: 0; top: 3px; text-align: center; font-size: 8px; font-weight: 800; letter-spacing: -0.06em; color: #fff0d9; }
  b.bottom { top: auto; bottom: 3px; }
  b.onwhite { color: #313964; }
  @media (min-width: 1024px) { .bar { width: 18px; } b { font-size: 10px; } }
</style>
