// The landing page's motion helpers. Everything here animates transform and opacity only (or a
// number's text), plays once when it scrolls in, and is instant with reduced motion.

const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function onView(node: Element, fn: () => void, margin = '0px 0px -12% 0px') {
  if (still() || typeof IntersectionObserver !== 'function') { fn(); return () => {}; }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { fn(); io.disconnect(); } }, { rootMargin: margin, threshold: 0.01 });
  io.observe(node);
  return () => io.disconnect();
}

/**
 * Reveal on scroll. `use:reveal` or `use:reveal={120}` (a delay in ms). The look comes from the
 * element's `data-r` attribute (up, scale, left, right, blur), styled in Landing.svelte.
 */
export function reveal(node: HTMLElement, delay = 0) {
  node.classList.add('rv');
  node.style.setProperty('--rd', `${delay}ms`);
  const stop = onView(node, () => node.classList.add('in'));
  return { destroy: stop };
}

/** A number that counts up to `to` once it is seen, with thousands separators and an optional suffix. */
export function count(node: HTMLElement, opts: { to: number; suffix?: string; ms?: number }) {
  const fmt = (v: number) => v.toLocaleString('en') + (opts.suffix ?? '');
  let raf = 0;
  node.textContent = fmt(still() ? opts.to : 0);
  const stop = onView(node, () => {
    if (still()) { node.textContent = fmt(opts.to); return; }
    const t0 = performance.now(), ms = opts.ms ?? 1400;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      node.textContent = fmt(Math.round(opts.to * (1 - (1 - t) ** 4)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }, '0px 0px -6% 0px');
  return { destroy() { stop(); cancelAnimationFrame(raf); } };
}

/** Sets `--mx` / `--my` (px, relative to the element) as the pointer moves over it, for a spotlight. */
export function spotlight(node: HTMLElement) {
  const move = (e: PointerEvent) => {
    const r = node.getBoundingClientRect();
    node.style.setProperty('--mx', `${e.clientX - r.left}px`);
    node.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  node.addEventListener('pointermove', move);
  return { destroy: () => node.removeEventListener('pointermove', move) };
}

/** Calls `fn(seen)` as an element comes and goes, for things that loop only while on screen. */
export function seen(node: Element, fn: (s: boolean) => void) {
  if (typeof IntersectionObserver !== 'function') { fn(true); return; }
  const io = new IntersectionObserver((es) => { for (const e of es) fn(e.isIntersecting); }, { threshold: 0.2 });
  io.observe(node);
  return { destroy: () => io.disconnect() };
}
