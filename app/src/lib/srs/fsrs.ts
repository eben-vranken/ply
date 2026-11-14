// FSRS via ts-fsrs: default weights, retention from settings (0.90 default),
// 365-day maximum, fuzz on, learning steps 1m/10m, relearning 10m.
import { fsrs, generatorParameters, createEmptyCard, Rating, State, type Card, type Grade, type FSRS } from 'ts-fsrs';

let cached: { r: number; f: FSRS } | null = null;
export function scheduler(retention = 0.9): FSRS {
  if (cached?.r !== retention) {
    cached = {
      r: retention,
      f: fsrs(generatorParameters({ request_retention: retention, maximum_interval: 365, enable_fuzz: true, enable_short_term: true, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] }))
    };
  }
  return cached.f;
}

export { Rating, State, createEmptyCard };
export type { Card, Grade };

export type Stage = 'new' | 'learning' | 'young' | 'mature';

/** Anki-style stage: learning/relearning steps, then young (< 21 d) or mature. */
export function stageOf(c: Card | undefined | null): Stage {
  if (!c || c.state === State.New) return 'new';
  if (c.state === State.Learning || c.state === State.Relearning) return 'learning';
  return c.scheduled_days >= 21 ? 'mature' : 'young';
}

/** Dexie hands dates back as Date; JSON backups hand them back as strings. */
export function revive(c: Card): Card {
  return { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined };
}

export function grade(card: Card, rating: Grade, now: Date, retention = 0.9): Card {
  return scheduler(retention).next(revive(card), now, rating).card;
}

export function retrievability(card: Card, now: Date, retention = 0.9): number {
  if (card.state === State.New) return 0;
  return scheduler(retention).get_retrievability(revive(card), now, false);
}

/** "in 4 days", "in 10 minutes" */
export function whenText(due: Date | number, now = Date.now()): string {
  const ms = +new Date(due) - now;
  const min = Math.round(ms / 60000);
  if (min < 1) return 'in under a minute';
  if (min < 60) return `in ${min} minute${min === 1 ? '' : 's'}`;
  const h = Math.round(min / 60);
  if (h < 24) return `in ${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  if (d < 60) return `in ${d} day${d === 1 ? '' : 's'}`;
  const mo = Math.round(d / 30);
  return `in ${mo} month${mo === 1 ? '' : 's'}`;
}
