<script lang="ts">
  // The four-piece promotion picker laid over the board (docs/BRIEF.md, "Shared board behaviour").
  // Keyboard: q, r, b or n picks, Escape cancels.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

  let { side, onpick, oncancel, inset = '0' }: { side: 'w' | 'b'; onpick: (piece: string) => void; oncancel: () => void; inset?: string } = $props();
  const PIECES = import.meta.glob('../assets/pieces/mpchess/*.svg', { eager: true, import: 'default', query: '?url' }) as Record<string, string>;
  const NAMES: Record<string, string> = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
  let first: HTMLButtonElement | undefined = $state();

  onMount(() => {
    first?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k in NAMES) { e.preventDefault(); e.stopPropagation(); onpick(k); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); oncancel(); }
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  });
</script>

<div class="promo" style="inset:{inset}" role="dialog" aria-label="Promote to">
  {#each ['q', 'r', 'b', 'n'] as p, i}
    {#if i === 0}
      <button bind:this={first} onclick={() => onpick(p)} aria-label={NAMES[p]}><img src={PIECES[`../assets/pieces/mpchess/${side}${p.toUpperCase()}.svg`]} alt="" /></button>
    {:else}
      <button onclick={() => onpick(p)} aria-label={NAMES[p]}><img src={PIECES[`../assets/pieces/mpchess/${side}${p.toUpperCase()}.svg`]} alt="" /></button>
    {/if}
  {/each}
  <button class="cancel" onclick={oncancel} aria-label="Cancel"><Icon name="close" size={20} /></button>
</div>

<style>
  .promo { position: absolute; z-index: 20; display: flex; align-items: center; justify-content: center; gap: 8px; background: rgba(13, 16, 36, 0.72); border-radius: 10px; animation: rise 160ms var(--ease) both; }
  .promo button { width: 68px; height: 68px; border-radius: 18px; background: var(--birch); display: grid; place-items: center; box-shadow: 0 6px 0 var(--birch-3); }
  .promo img { width: 54px; height: 54px; }
  .promo .cancel { width: 48px; height: 48px; background: var(--night-3); color: var(--night-ink); box-shadow: none; }
</style>
