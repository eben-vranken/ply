// Runs the FSRS optimiser off the main thread, so the screen never stalls while it fits.
import { runOptimizer } from './optimize';

self.onmessage = async (e: MessageEvent<{ url: string; input: Uint32Array }>) => {
  try {
    const wasm = await (await fetch(e.data.url)).arrayBuffer();
    self.postMessage(await runOptimizer(wasm, e.data.input));
  } catch (err) {
    self.postMessage({ status: 'error', weights: [], message: String(err) });
  }
};
