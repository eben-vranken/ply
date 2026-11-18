<script lang="ts">
  // The four buttons under every board that steps through moves, as on Lichess:
  // to the start, back, forward, to the end. The keys do the same (lib/keys.ts: ← → ↑ ↓ Home End).
  import Icon from './Icon.svelte';

  interface Props {
    canBack: boolean;
    canFwd: boolean;
    onnav: (a: 'first' | 'back' | 'fwd' | 'last') => void;
    dark?: boolean;
    /** a "live" chip: you are looking at an earlier position; tap to come back */
    away?: boolean;
  }
  let { canBack, canFwd, onnav, dark = false, away = false }: Props = $props();

  // holding a button repeats it, as holding an arrow key does
  let rep: ReturnType<typeof setTimeout> | undefined;
  function hold(a: 'back' | 'fwd') {
    onnav(a);
    const again = (ms: number) => { rep = setTimeout(() => { onnav(a); again(70); }, ms); };
    again(380);
  }
  const stop = () => clearTimeout(rep);
</script>

<div class="nav" class:dark role="group" aria-label="Move through the game">
  <button onclick={() => onnav('first')} disabled={!canBack} aria-label="To the start" title="To the start (↑ or Home)"><Icon name="first" size={20} /></button>
  <button onpointerdown={(e) => { if (e.button === 0) hold('back'); }} onpointerup={stop} onpointerleave={stop} onpointercancel={stop} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onnav('back'); } }} disabled={!canBack} aria-label="Back" title="Back (←)"><Icon name="back" size={22} /></button>
  <button onpointerdown={(e) => { if (e.button === 0) hold('fwd'); }} onpointerup={stop} onpointerleave={stop} onpointercancel={stop} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onnav('fwd'); } }} disabled={!canFwd} aria-label="Forward" title="Forward (→)" class:away><Icon name="next" size={22} /></button>
  <button onclick={() => onnav('last')} disabled={!canFwd} aria-label="To the end" title="To the end (↓ or End)" class:away><Icon name="last" size={20} /></button>
</div>

<style>
  .nav { display: flex; gap: 4px; padding: 4px; border-radius: 14px; background: var(--wash); }
  .nav.dark { background: var(--night-3); }
  button { flex: 1; height: 44px; display: grid; place-items: center; border-radius: 10px; color: var(--ink-2); transition: background 120ms, color 120ms; touch-action: manipulation; }
  .dark button { color: var(--night-ink); }
  button:disabled { opacity: 0.32; }
  button:not(:disabled):active { background: var(--card); }
  .dark button:not(:disabled):active { background: var(--night-2); }
  button.away:not(:disabled) { color: var(--accent-text); }
  .dark button.away:not(:disabled) { color: var(--sun); }
  @media (hover: hover) {
    button:not(:disabled):hover { background: var(--card); color: var(--ink); }
    .dark button:not(:disabled):hover { background: var(--night-2); color: var(--night-ink); }
  }
</style>
