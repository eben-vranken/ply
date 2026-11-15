// A number that counts up to its value (Svelte action). Instant with reduced motion.
export function countup(node: HTMLElement, value: number) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = 0, raf = 0;
  const run = (to: number) => {
    cancelAnimationFrame(raf);
    if (still) { cur = to; node.textContent = String(to); return; }
    const from = cur, t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 800);
      cur = Math.round(from + (to - from) * (1 - (1 - t) ** 3));
      node.textContent = String(cur);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  run(value);
  return { update: run, destroy() { cancelAnimationFrame(raf); } };
}
