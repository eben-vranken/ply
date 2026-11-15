// Your own FSRS weights: fit them to your review log in a worker, use them, or go back to the defaults.
import { app, save } from '../state.svelte';
import { db } from '../db';
import { histories, MIN_REVIEWS, type Fit } from './optimize';
import { setWeights } from './fsrs';

export { MIN_REVIEWS };

/** Fit the weights to every review so far; they are used from the next review on. */
export async function fitMySchedule(): Promise<Fit & { reviews: number }> {
  const rows = await db.reviews.toArray();
  const input = histories(rows, app.rollover);
  const worker = new Worker(new URL('./optimize.worker.ts', import.meta.url), { type: 'module' });
  const url = new URL((import.meta.env?.BASE_URL ?? '/') + 'fsrs/ply_optimizer.wasm', location.href).href;
  const fit = await new Promise<Fit>((res) => {
    worker.onmessage = (e) => res(e.data as Fit);
    worker.onerror = () => res({ status: 'error', weights: [] });
    worker.postMessage({ url, input });
  }).finally(() => worker.terminate());
  if (fit.status === 'fitted') {
    app.fsrsWeights = fit.weights;
    app.fsrsFitAt = Date.now();
    app.fsrsFitReviews = rows.length;
    save();
    setWeights(fit.weights);
  }
  return { ...fit, reviews: rows.length };
}

export function useDefaultWeights() {
  app.fsrsWeights = null;
  save();
  setWeights(null);
}
