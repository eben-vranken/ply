<script lang="ts">
  // Memory strength as veneers: new = an empty outline, learning = 1 ply, young = 2, mature = 4.
  // Shape carries the meaning, so the stage never depends on colour alone.
  import type { Stage } from './demo';
  let { stage, size = 18 }: { stage: Stage; size?: number } = $props();
  const n = $derived({ new: 0, learning: 1, young: 2, mature: 4 }[stage]);
  const label = $derived({ new: 'New', learning: 'Learning', young: 'Young', mature: 'Mature' }[stage]);
</script>

<svg width={size} height={size} viewBox="0 0 18 18" role="img" aria-label={label}>
  {#if n === 0}
    <rect x="2" y="7" width="14" height="4" rx="2" fill="none" stroke="var(--st-new)" stroke-width="1.6" />
  {:else}
    {#each Array(n) as _, i}
      <rect x="2" y={16 - (i + 1) * (n === 4 ? 4 : 5) + (n === 1 ? -3 : n === 2 ? -1 : 0)} width="14" height={n === 4 ? 3 : 4} rx="1.5" fill="var(--st-{stage})" />
    {/each}
  {/if}
</svg>

<style>svg { display: block; flex: none; }</style>
