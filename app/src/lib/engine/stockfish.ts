// Stockfish lite (single-threaded WASM) in a Web Worker. Only used to analyse
// imported games, so the board never waits on it.
export interface PvLine {
  /** centipawns from the side to move, mates as ±(10000 − n) */
  cp: number;
  pv: string[];
  depth: number;
}

const ENGINE = (import.meta.env?.BASE_URL ?? '/') + 'engine/stockfish-19-lite-single.js';

export class Engine {
  private w: Worker;
  private listeners: ((line: string) => void)[] = [];
  private ready: Promise<void>;
  private multipv = 1;

  constructor() {
    this.w = new Worker(ENGINE);
    this.w.onmessage = (e) => { const l = String(e.data); for (const f of this.listeners) f(l); };
    this.ready = (async () => {
      this.send('uci');
      await this.until((l) => l === 'uciok');
      this.send('setoption name Hash value 32');
      this.send('isready');
      await this.until((l) => l === 'readyok');
    })();
  }
  private send(s: string) { this.w.postMessage(s); }
  private until(test: (l: string) => boolean, each?: (l: string) => void): Promise<string> {
    return new Promise((res) => {
      const f = (l: string) => { each?.(l); if (test(l)) { this.listeners = this.listeners.filter((x) => x !== f); res(l); } };
      this.listeners.push(f);
    });
  }

  /** Analyse a FEN for a fixed time. Returns up to `multipv` lines, best first. */
  async analyse(fen: string, ms: number, multipv = 1): Promise<PvLine[]> {
    await this.ready;
    if (multipv !== this.multipv) { this.send(`setoption name MultiPV value ${multipv}`); this.multipv = multipv; }
    const lines = new Map<number, PvLine>();
    this.send(`position fen ${fen}`);
    this.send(`go movetime ${ms}`);
    await this.until((l) => l.startsWith('bestmove'), (l) => {
      if (!l.startsWith('info') || !l.includes(' pv ') || l.includes('bound')) return;
      const t = l.split(' ');
      const k = +(t[t.indexOf('multipv') + 1] || 1);
      const si = t.indexOf('score');
      const v = +t[si + 2];
      const cp = t[si + 1] === 'mate' ? (v > 0 ? 10000 - v : -10000 - v) : v;
      lines.set(k, { cp, pv: t.slice(t.indexOf('pv') + 1), depth: +t[t.indexOf('depth') + 1] });
    });
    return [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }

  quit() { try { this.send('quit'); } catch { /* gone */ } this.w.terminate(); }
}
