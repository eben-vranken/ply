// The desktop breakpoints (docs/DESIGN.md, "Desktop"), for the few places where the markup
// itself differs. The CSS uses the same queries; nothing here looks at the device or the pointer.
export const DESK = '(min-width: 1024px) and (min-height: 600px)';
export const WIDE = '(min-width: 1600px) and (min-height: 600px)';
const mq = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : null);
const d = mq(DESK), w = mq(WIDE), r = mq('(prefers-reduced-motion: reduce)');

export const desk = $state({
  /** a window of at least 1024 × 600: the sidebar and the desktop layouts */
  on: d?.matches ?? false,
  /** 1600 and wider: third columns */
  wide: w?.matches ?? false,
  /** prefers-reduced-motion */
  still: r?.matches ?? false
});
d?.addEventListener('change', (e) => (desk.on = e.matches));
w?.addEventListener('change', (e) => (desk.wide = e.matches));
r?.addEventListener('change', (e) => (desk.still = e.matches));

/** ⌘ on Apple keyboards, Ctrl elsewhere */
export const MOD = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '') ? '⌘' : 'Ctrl';

/** what floats over every screen */
export const ui = $state({ palette: false });
