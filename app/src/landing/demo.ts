// The landing page's data: built from public/data by scripts/landing-data.ts, never typed in.
import raw from '../lib/landing/demo.json';

export interface Reply { uci: string; san: string; pct: number; games: number; w: number; d: number; b: number; cp: number | null }
export interface HeroPly { uci: string; san: string; mine: boolean; fen: string; share: number; reached: number; why: string; fan: Reply[] | null; name: string; eco: string }
export interface Step { uci: string; san: string; fen: string }
export interface TreeTile { id: string; reply: string; replyPct: number; san: string; depth: number; parent: string | null; name: string; kids: number }
export interface Demo {
  version: string; month: string; built: string; band: number; startFen: string;
  counts: { openings: number; families: number; bands: number[]; puzzles: number; games: Record<string, number>; positions: Record<string, number>; traps: Record<string, number> };
  hero: HeroPly[];
  fan: { path: string[]; order: string; fen: string; name: string; eco: string; bands: Record<string, { games: number; moves: Reply[] }> };
  trap: {
    band: number; name: string; eco: string; order: string; fen: string; setup: string; reached: number; moves: Reply[];
    bait: Step; freq: number; loss: number; safe: Step & { why: string }; refute: Step[];
    punish: { fen: string; answer: Step[]; why: string } | null;
  };
  tree: TreeTile[];
  sigils: { name: string; eco: string; path: string[]; side: 'w' | 'b' }[];
}
export const demo = raw as unknown as Demo;
export const n = (x: number) => x.toLocaleString('en');
/** "3 million" for 3,000,004 */
export const millions = (x: number) => `${Math.round(x / 100_000) / 10} million`.replace('.0 ', ' ');
/** move number text for ply index i (0 = White's first) */
export const num = (i: number) => (i % 2 === 0 ? `${i / 2 + 1}.` : `${(i + 1) / 2}…`);
export const sq = (u: string) => [u.slice(0, 2), u.slice(2, 4)] as [string, string];
