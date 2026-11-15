// Fitting FSRS weights to your own review log, on the device (optimizer/ is fsrs-rs, the optimiser
// Anki uses, compiled to single-threaded WebAssembly: public/fsrs/ply_optimizer.wasm).
// The review log becomes one history per card: each review's rating and the study days since the
// card's previous review. Pure where it can be, so it is tested.
import { dayStart } from './queue';

/** Reviews needed before a fit is offered. */
export const MIN_REVIEWS = 1000;

export interface LogRow { cardId: string; at: number; rating: number }

/** The optimiser's input: [cards, then per card n and n × (rating, days since the previous review)]. */
export function histories(rows: LogRow[], rollover: number): Uint32Array {
  const by = new Map<string, LogRow[]>();
  for (const r of rows) if (r.rating >= 1 && r.rating <= 4) (by.get(r.cardId) ?? by.set(r.cardId, []).get(r.cardId)!).push(r);
  const out: number[] = [by.size];
  const day = (t: number) => Math.round(dayStart(t, rollover) / 864e5);
  for (const list of by.values()) {
    list.sort((a, b) => a.at - b.at);
    out.push(list.length);
    let prev: number | null = null;
    for (const r of list) {
      const d = day(r.at);
      out.push(r.rating, prev === null ? 0 : Math.max(0, d - prev));
      prev = d;
    }
  }
  return Uint32Array.from(out);
}

export interface Fit { status: 'fitted' | 'too-little' | 'error'; weights: number[] }

interface OptimizerExports { memory: WebAssembly.Memory; alloc(n: number): number; optimize(p: number, n: number): number }

/** Run the WebAssembly optimiser on prepared histories. */
export async function runOptimizer(wasm: BufferSource, input: Uint32Array): Promise<Fit> {
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const x = instance.exports as unknown as OptimizerExports;
  const p = x.alloc(input.length * 4);
  new Uint32Array(x.memory.buffer, p, input.length).set(input);
  const r = x.optimize(p, input.length);
  // the memory may have grown during training: read through the current buffer
  const out = Array.from(new Float32Array(x.memory.buffer, r, 22));
  const status = out[0] === 1 ? 'fitted' : out[0] === 0 ? 'too-little' : 'error';
  return { status, weights: out.slice(1).map((w) => Math.round(w * 1e4) / 1e4) };
}
