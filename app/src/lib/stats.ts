// Stats (docs/BRIEF.md, "Stats"): everything from the cards, reviews and games tables.
import { db, type CardRow, type ReviewRow, type CardType } from './db';
import { stageOf, type Stage } from './srs/fsrs';
import { dayStart } from './srs/queue';
import { streakOf } from './streak';

const DAY = 864e5;
export const TYPES: CardType[] = ['move', 'punish', 'danger', 'puzzle', 'mistake'];
export const STAGES: Stage[] = ['new', 'learning', 'young', 'mature'];

export interface GamesRep { games: number; win: number; eval10: number | null; covered: number }
export interface StatsData {
  totals: Record<CardType, [number, number, number, number]>;
  suspended: number;
  forecast: number[];
  history: number[]; // reviews per day, oldest first, last entry = today
  minutes: number[]; // last 14 days
  retention: { young7: number | null; mature7: number | null; young30: number | null; mature30: number | null };
  retention7: number | null;
  streak: number;
  longest: number;
  /** streak freezes held now, and the days (history indexes) one covered (lib/streak.ts) */
  freezes: number;
  frozen: Set<number>;
  week: boolean[]; // Mon..Sun this week
  weekFrozen: boolean[];
  weakest: { card: CardRow; lapses: number }[];
  games: { months: string[]; m10: number[]; m15: number[]; rating: (number | null)[] };
  /** your last 10 analysed games against the 20 before them */
  report: { recent: GamesRep; before: GamesRep | null } | null;
  spark10: number[];
  spark15: number[];
  avg10: number | null;
  avg15: number | null;
}

const pct = (rs: ReviewRow[]) => (rs.length ? Math.round((rs.filter((r) => r.rating > 1).length / rs.length) * 100) : null);

export async function loadStats(cards: Iterable<CardRow>, rollover: number, unknownStage?: number): Promise<StatsData> {
  void unknownStage;
  const now = Date.now();
  const t0 = dayStart(now, rollover);
  const totals = Object.fromEntries(TYPES.map((t) => [t, [0, 0, 0, 0]])) as unknown as StatsData['totals'];
  let suspended = 0;
  const forecast = new Array(30).fill(0);
  const list: CardRow[] = [];
  for (const c of cards) {
    list.push(c);
    if (c.suspended) { suspended++; continue; }
    totals[c.type][STAGES.indexOf(stageOf(c.fsrs))]++;
    if (c.fsrs.state !== 0) {
      const d = Math.floor((c.due - t0) / DAY);
      if (d >= 1 && d <= 30) forecast[d - 1]++;
    }
  }
  const year = t0 - 370 * DAY;
  const reviews = await db.reviews.where('at').aboveOrEqual(year).toArray();
  const history = new Array(371).fill(0);
  const ms = new Array(371).fill(0);
  for (const r of reviews) {
    const d = 370 - Math.floor((t0 - dayStart(r.at, rollover)) / DAY);
    if (d >= 0 && d < 371) { history[d]++; ms[d] += Math.min(r.ms, 120_000); }
  }
  const minutes = ms.slice(-14).map((x) => Math.round(x / 60000));
  // streak: consecutive study days ending today (or yesterday, if today is still open); freezes earned
  // by every 7 days in a row cover a missed day (lib/streak.ts)
  const { streak, longest, held: freezes, frozen } = streakOf(history);
  const dow = (new Date(now).getDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, i) => i <= dow && history[370 - (dow - i)] > 0);
  const weekFrozen = Array.from({ length: 7 }, (_, i) => i <= dow && frozen.has(370 - (dow - i)));
  // retention: first-try correct on reviews of young and mature cards
  const scored = reviews.filter((r) => r.mode !== 'drill-again' && (r.stage === 'young' || r.stage === 'mature'));
  const since = (d: number) => scored.filter((r) => r.at >= now - d * DAY);
  const retention = {
    young7: pct(since(7).filter((r) => r.stage === 'young')), mature7: pct(since(7).filter((r) => r.stage === 'mature')),
    young30: pct(since(30).filter((r) => r.stage === 'young')), mature30: pct(since(30).filter((r) => r.stage === 'mature'))
  };
  const retention7 = pct(reviews.filter((r) => r.at >= now - 7 * DAY && r.stage !== 'new' && r.mode !== 'drill-again'));
  // weakest: most lapses in the last 30 days
  const lapses = new Map<string, number>();
  for (const r of reviews) if (r.at >= now - 30 * DAY && r.rating === 1 && r.stage !== 'new' && r.stage !== 'learning') lapses.set(r.cardId, (lapses.get(r.cardId) ?? 0) + 1);
  const byId = new Map(list.map((c) => [c.id, c]));
  const weakest = [...lapses.entries()].filter(([id]) => byId.get(id) && !byId.get(id)!.suspended).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => ({ card: byId.get(id)!, lapses: n }));
  // games: average eval after move 10 / 15 (your view), by month, and the last 30 games
  const games = (await db.games.orderBy('date').toArray()).filter((g) => g.analyzed);
  const mine = (g: (typeof games)[number], ply: number) => { const v = g.evals[ply]; return v == null ? null : (g.colour === 'w' ? v : -v) / 100; };
  const byMonth = new Map<string, { m10: number[]; m15: number[]; rating: number[] }>();
  for (const g of games) {
    const k = new Date(g.date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    const b = byMonth.get(k) ?? byMonth.set(k, { m10: [], m15: [], rating: [] }).get(k)!;
    const a = mine(g, 20), c = mine(g, 30);
    if (a !== null) b.m10.push(clampEval(a));
    if (c !== null) b.m15.push(clampEval(c));
    if (g.rating) b.rating.push(g.rating);
  }
  const avg = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
  const months = [...byMonth.keys()].slice(-6);
  const last30 = games.slice(-30);
  const spark10 = last30.map((g) => mine(g, 20)).filter((x): x is number => x !== null).map(clampEval);
  const spark15 = last30.map((g) => mine(g, 30)).filter((x): x is number => x !== null).map(clampEval);
  const rep = (gs: typeof games): GamesRep => {
    const e = gs.map((g) => mine(g, 20)).filter((x): x is number => x !== null).map(clampEval);
    return { games: gs.length, win: Math.round((gs.filter((g) => g.result === 'win').length / gs.length) * 100), eval10: e.length ? avg(e) : null, covered: Math.round((gs.filter((g) => !g.uncovered).length / gs.length) * 100) };
  };
  const report = games.length >= 3 ? { recent: rep(games.slice(-10)), before: games.length >= 15 ? rep(games.slice(-30, -10)) : null } : null;
  return {
    report,
    totals, suspended, forecast, history, minutes, retention, retention7, streak, longest, freezes, frozen, week, weekFrozen, weakest,
    games: {
      months: months.map((m) => m.split(' ')[0]),
      m10: months.map((m) => avg(byMonth.get(m)!.m10)),
      m15: months.map((m) => avg(byMonth.get(m)!.m15)),
      rating: months.map((m) => { const r = byMonth.get(m)!.rating; return r.length ? Math.round(r.at(-1)!) : null; })
    },
    spark10, spark15,
    avg10: spark10.length ? avg(spark10) : null,
    avg15: spark15.length ? avg(spark15) : null
  };
}

const clampEval = (x: number) => Math.max(-5, Math.min(5, x));
