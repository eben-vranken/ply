<script lang="ts">
  // A position drawn without chessground: for previews and illustrations that never take a move.
  // It wears the same wood and the same pieces as the real board (the classes in app.css).
  interface Props { fen: string; side?: 'w' | 'b'; last?: [string, string] | null; arrow?: [string, string] | null; edge?: boolean; label?: string }
  let { fen, side = 'w', last = null, arrow = null, edge = true, label = 'Chess position' }: Props = $props();
  const ROLE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const xy = (f: number, r: number) => [side === 'w' ? f : 7 - f, side === 'w' ? 7 - r : r];
  const at = (s: string) => xy(s.charCodeAt(0) - 97, +s[1] - 1);
  const pieces = $derived.by(() => {
    const out: { cls: string; x: number; y: number; k: string }[] = [];
    fen.split(' ')[0].split('/').forEach((row, i) => {
      let f = 0;
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') { f += +ch; continue; }
        const [x, y] = xy(f, 7 - i);
        out.push({ cls: `${ch === ch.toUpperCase() ? 'white' : 'black'} ${ROLE[ch.toLowerCase()]}`, x, y, k: ch + f + i });
        f++;
      }
    });
    return out;
  });
  const line = $derived.by(() => {
    if (!arrow) return null;
    const [a, b] = [at(arrow[0]), at(arrow[1])];
    return { x1: a[0] + 0.5, y1: a[1] + 0.5, x2: b[0] + 0.5, y2: b[1] + 0.5 };
  });
</script>

<div class="mb" class:edge role="img" aria-label={label}>
  <div class="cg-wrap sq">
    {#each last ?? [] as s}{@const [x, y] = at(s)}<i class="lm" style="left:{x * 12.5}%;top:{y * 12.5}%"></i>{/each}
    {#each pieces as p (p.k)}<piece class={p.cls} style="left:{p.x * 12.5}%;top:{p.y * 12.5}%"></piece>{/each}
    {#if line}
      <svg viewBox="0 0 8 8" aria-hidden="true">
        <defs><marker id="mb-head" orient="auto" markerWidth="4" markerHeight="4" refX="2.05" refY="2"><path d="M0,0 V4 L3,2 Z" fill="#0f7a55" /></marker></defs>
        <line {...line} stroke="#0f7a55" stroke-width="0.17" stroke-linecap="round" marker-end="url(#mb-head)" opacity="0.9" />
      </svg>
    {/if}
  </div>
</div>

<style>
  .mb { border-radius: 6px 6px 8px 8px; overflow: hidden; }
  .mb.edge { padding-bottom: 6px; background: linear-gradient(to top, #d2b382 0 2px, #a67f4d 2px 4px, #e0c797 4px 6px, transparent 6px); }
  .sq {
    background-color: var(--birch);
    background-image: conic-gradient(var(--stain) 90deg, var(--birch) 0 180deg, var(--stain) 0 270deg, var(--birch) 0);
    background-size: 25% 25%; border-radius: 6px 6px 0 0; overflow: hidden;
  }
  piece { position: absolute; width: 12.5%; height: 12.5%; }
  .lm { position: absolute; width: 12.5%; height: 12.5%; box-shadow: inset 0 0 0 2px var(--sun); background: rgba(255, 255, 255, 0.16); }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
</style>
