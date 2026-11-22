import type { UnitId } from './types.ts';

export interface Attempt { day: string; t: number; ok: boolean; kind: 'recall' | 'match'; chose?: UnitId }
export interface MasteryRecord { attempts: Attempt[]; confusions: Record<UnitId, number>; lastSeen: number }

export const MASTERY = { KNOWN_DAYS: 2, MAX_ATTEMPTS: 40, CONFUSION_MIN: 2 };

// An error not yet cleared by a correct answer on a strictly later day.
const uncleared = (w: Attempt, all: Attempt[]): boolean => !w.ok && !all.some((c) => c.ok && c.day > w.day);

// Over MAX_ATTEMPTS the cap must never hide a mistake: correct answers go first, oldest first, but the newest correct
// answer stays (it is the one that clears every earlier error); then cleared errors, oldest first. An uncleared error
// is never dropped: with only those left the cap gives way.
function trim(attempts: Attempt[]): Attempt[] {
  const out = [...attempts];
  while (out.length > MASTERY.MAX_ATTEMPTS) {
    const newestOk = out.map((x) => x.ok).lastIndexOf(true);
    let i = out.findIndex((x, k) => x.ok && k !== newestOk);
    if (i < 0) i = out.findIndex((x) => !x.ok && !uncleared(x, out));
    if (i < 0) break;
    out.splice(i, 1);
  }
  return out;
}

// Day keys are 'YYYY-MM-DD', so string order is day order.
export function recordAnswer(rec: MasteryRecord | undefined, a: Attempt): MasteryRecord {
  const attempts = trim([...(rec?.attempts ?? []), a]);
  const confusions: Record<UnitId, number> = { ...(rec?.confusions ?? {}) };
  if (!a.ok && a.chose !== undefined) confusions[a.chose] = (confusions[a.chose] ?? 0) + 1;
  return { attempts, confusions, lastSeen: a.t };
}

export function isWeak(rec?: MasteryRecord): boolean {
  if (!rec) return false;
  return rec.attempts.some((w) => !w.ok && !rec.attempts.some((c) => c.ok && c.day > w.day));
}

export function recallDays(rec?: MasteryRecord): number {
  if (!rec) return 0;
  return new Set(rec.attempts.filter((x) => x.ok && x.kind === 'recall').map((x) => x.day)).size;
}

export function isKnown(rec?: MasteryRecord): boolean {
  if (!rec) return false;
  const days = new Set(rec.attempts.filter((x) => x.ok).map((x) => x.day));
  return days.size >= MASTERY.KNOWN_DAYS && recallDays(rec) >= 1 && !isWeak(rec);
}

export function topConfusions(rec?: MasteryRecord, min: number = MASTERY.CONFUSION_MIN): UnitId[] {
  if (!rec) return [];
  return Object.entries(rec.confusions)
    .filter(([, n]) => n >= min)
    .sort((x, y) => y[1] - x[1])
    .map(([u]) => u);
}

export function unitStatus(recs: (MasteryRecord | undefined)[], taught: boolean): 'known' | 'learning' | 'notYet' {
  if (recs.length > 0 && recs.every((r) => isKnown(r))) return 'known';
  if (taught || recs.some((r) => r !== undefined && r.attempts.length > 0)) return 'learning';
  return 'notYet';
}

// The parent view of a unit: notYet (never met), met (its first station done, no answers yet), practising (answers,
// not known yet: a recent mistake or correct on one day only), known (every item known).
export type LetterLevel = 'notYet' | 'met' | 'practising' | 'known';

export function letterLevel(recs: (MasteryRecord | undefined)[], taught: boolean): LetterLevel {
  if (recs.length > 0 && recs.every((r) => isKnown(r))) return 'known';
  if (recs.some((r) => r !== undefined && r.attempts.length > 0)) return 'practising';
  return taught ? 'met' : 'notYet';
}

export interface UnitCard {
  recallDays: number; // distinct days with a correct recall, over the unit's items
  answers: number;
  firstTryRate: number | null; // share of correct answers (every recorded answer is a first pick); null with none
  confusions: UnitId[]; // summed over the unit's items, at least CONFUSION_MIN, most first
  lastDay: string | null;
}

export function unitCard(recs: (MasteryRecord | undefined)[]): UnitCard {
  const days = new Set<string>();
  const conf: Record<UnitId, number> = {};
  let answers = 0;
  let right = 0;
  let lastDay: string | null = null;
  for (const r of recs) {
    if (!r) continue;
    for (const a of r.attempts) {
      answers++;
      if (a.ok) right++;
      if (a.ok && a.kind === 'recall') days.add(a.day);
      if (lastDay === null || a.day > lastDay) lastDay = a.day;
    }
    for (const [u, n] of Object.entries(r.confusions)) conf[u] = (conf[u] ?? 0) + n;
  }
  const confusions = Object.entries(conf)
    .filter(([, n]) => n >= MASTERY.CONFUSION_MIN)
    .sort((x, y) => y[1] - x[1])
    .map(([u]) => u);
  return { recallDays: days.size, answers, firstTryRate: answers ? right / answers : null, confusions, lastDay };
}

// The day the unit last became known (every item known with the attempts up to that day), or null when it is not
// known now.
export function knownSince(recs: (MasteryRecord | undefined)[]): string | null {
  if (!recs.length || !recs.every((r) => isKnown(r))) return null;
  const upTo = (r: MasteryRecord | undefined, day: string): MasteryRecord | undefined =>
    r && { ...r, attempts: r.attempts.filter((a) => a.day <= day) };
  const days = [...new Set(recs.flatMap((r) => (r ? r.attempts.map((a) => a.day) : [])))].sort();
  let since: string | null = null;
  let before = false;
  for (const d of days) {
    const now = recs.every((r) => isKnown(upTo(r, d)));
    if (now && !before) since = d;
    before = now;
  }
  return since;
}
