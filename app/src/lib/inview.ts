// Svelte action: tells you when an element is on screen, so work that only matters while it is
// seen (a board playing itself, a sigil drawing) can start late and stop early.
export function inview(node: Element, opts: { on: (seen: boolean) => void; once?: boolean; margin?: string; threshold?: number }) {
  if (typeof IntersectionObserver !== 'function') { opts.on(true); return; }
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      opts.on(e.isIntersecting);
      if (e.isIntersecting && opts.once) io.disconnect();
    }
  }, { rootMargin: opts.margin ?? '0px', threshold: opts.threshold ?? 0.15 });
  io.observe(node);
  return { destroy: () => io.disconnect() };
}
