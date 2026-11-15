<script lang="ts">
  // Keyboard play (desktop): type a move in SAN or UCI and it is played as soon as only one move is
  // meant (Enter plays the best reading). With nothing typed, ? / Enter / Backspace / ← / Escape drive the
  // screen through `onaction`. Lives over the board; shows what is typed and what it could become.
  import { onMount } from 'svelte';
  import { matchMove, actionOf, isMoveChar, type Legal, type KeyAction } from './keys';

  interface Props {
    /** legal moves now, or null while moves are not taken (opponent to move, answer showing) */
    legal: () => Legal[] | null;
    onmove: (uci: string) => void;
    /** returns true when the screen used the key */
    onaction?: (a: KeyAction) => boolean;
    dark?: boolean;
  }
  let { legal, onmove, onaction = () => false, dark = false }: Props = $props();
  let buf = $state('');
  let bad = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const view = $derived.by(() => { const l = buf ? legal() : null; return l ? matchMove(buf, l) : null; });

  function typing(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
  }
  function play(m: Legal) { buf = ''; onmove(m.uci); }

  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e) || e.defaultPrevented) return;
      // a focused button answers Enter and Space itself
      if ((e.key === 'Enter' || e.key === ' ') && !buf && (e.target as HTMLElement | null)?.closest?.('button, a, [role=switch]')) return;
      const l = legal();
      if (l && isMoveChar(e.key)) {
        e.preventDefault();
        clearTimeout(timer); bad = false;
        buf += e.key;
        const m = matchMove(buf, l);
        if (m.sure) return play(m.sure);
        if (!m.options.length) { bad = true; timer = setTimeout(() => { buf = ''; bad = false; }, 900); }
        return;
      }
      if (buf) {
        if (e.key === 'Backspace') { e.preventDefault(); buf = buf.slice(0, -1); bad = false; return; }
        if (e.key === 'Escape') { e.preventDefault(); buf = ''; bad = false; return; }
        if (e.key === 'Enter' && l) { e.preventDefault(); const m = matchMove(buf, l); if (m.best) play(m.best); else { bad = true; } return; }
      }
      const a = actionOf(e);
      if (a && onaction(a)) e.preventDefault();
    };
    addEventListener('keydown', key);
    return () => { removeEventListener('keydown', key); clearTimeout(timer); };
  });
  // a new position clears whatever was half typed
  $effect(() => { if (!legal()) buf = ''; });
</script>

{#if buf}
  <div class="typed" class:dark class:bad role="status" aria-live="polite">
    <b>{buf}</b>
    {#if view?.options.length && !bad}
      <span class="opts">{#each view.options as o, i}<span class:best={o === view.best}>{o.san}</span>{#if i < view.options.length - 1}{' '}{/if}{/each}{#if view.best}<small>Enter</small>{/if}</span>
    {:else}
      <span class="opts">No such move here</span>
    {/if}
  </div>
{/if}

<style>
  .typed { position: absolute; z-index: 8; left: 18px; top: 10px; display: flex; align-items: center; gap: 10px; max-width: calc(100% - 36px); padding: 8px 12px; border-radius: 14px; background: var(--ink); color: var(--on-ink); box-shadow: 0 10px 24px rgba(13, 16, 36, 0.35); font-size: 15px; animation: rise 120ms var(--ease) both; pointer-events: none; }
  .typed.dark { background: var(--birch); color: var(--ink-fixed); }
  .typed b { font-size: 20px; font-weight: 750; letter-spacing: -0.01em; }
  .typed.bad b { text-decoration: line-through; color: var(--bad); }
  .opts { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; opacity: 0.85; }
  .opts .best { font-weight: 750; text-decoration: underline; text-underline-offset: 3px; }
  .opts small { font-size: 11.5px; font-weight: 700; padding: 1px 6px; border-radius: 6px; background: rgba(127, 127, 127, 0.25); }
</style>
