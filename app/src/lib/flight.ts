// Shared-element transitions on a desktop: the thing you clicked (a sigil on Today, the board in
// Explore) is measured before the screen changes, and the trainer's board grows out of that
// rectangle. Transform and opacity only; nothing happens with reduced motion or on a phone.
import { desk } from './desk.svelte';

let from: { x: number; y: number; w: number; h: number; at: number } | null = null;

/** remember where the next screen's hero comes from (call just before navigating) */
export function takeOff(el: Element | null | undefined) {
  if (!el || !desk.on || desk.still) { from = null; return; }
  const r = el.getBoundingClientRect();
  from = r.width > 8 ? { x: r.left, y: r.top, w: r.width, h: r.height, at: performance.now() } : null;
}
/** the element inside a click target that should fly: its sigil or board, else the target itself */
export function takeOffFrom(e: Event, selector = 'svg[aria-label="Opening sigil"], .cg-wrap') {
  const t = e.currentTarget as Element | null;
  takeOff(t?.closest('.card, .slab, .pane, section')?.querySelector(selector) ?? t);
}

/** Svelte action for the arriving element: animates from the remembered rectangle to its own place */
export function land(node: HTMLElement) {
  const f = from;
  from = null;
  if (!f || performance.now() - f.at > 1500 || !desk.on || desk.still) return;
  // wait for layout: the room is still being laid out when the action runs
  const raf = requestAnimationFrame(() => {
    const r = node.getBoundingClientRect();
    if (!r.width) return;
    const s = Math.max(0.08, f.w / r.width);
    const dx = f.x + f.w / 2 - (r.left + r.width / 2), dy = f.y + f.h / 2 - (r.top + r.height / 2);
    node.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.2 }, { opacity: 1, offset: 0.35 }, { transform: 'none', opacity: 1 }],
      { duration: 460, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' }
    );
  });
  return { destroy: () => cancelAnimationFrame(raf) };
}
