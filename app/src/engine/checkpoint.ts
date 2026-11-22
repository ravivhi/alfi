import type { AnswerEvent, ItemId, UnitId } from './types.ts';
import type { MasteryRecord } from './mastery.ts';
import { isKnown, isWeak, recallDays } from './mastery.ts';
import { itemId } from './curriculum.ts';
import { daysBetween } from '../util/day.ts';
import type { Rng } from '../util/rng.ts';

const MAX_DAYS = 14;

// Days since the item's last attempt, by local day key, clamped to 0..14. Never seen counts as the maximum;
// a last attempt dated in the future (clock moved back) counts as 0.
export function daysSinceLastSeen(rec: MasteryRecord | undefined, today: string): number {
  if (!rec || !rec.attempts.length) return MAX_DAYS;
  const d = daysBetween(rec.attempts[rec.attempts.length - 1].day, today);
  if (!Number.isFinite(d)) return 0;
  return Math.min(Math.max(d, 0), MAX_DAYS);
}

export function reviewWeight(rec: MasteryRecord | undefined, today: string): number {
  return 1 + (isWeak(rec) ? 3 : 0) + (isKnown(rec) ? 0 : 1) + daysSinceLastSeen(rec, today) / 7;
}

export function buildCheckpoint(i: {
  blockUnits: UnitId[];
  taughtUnits: UnitId[];
  itemKinds: string[];
  mastery: Record<ItemId, MasteryRecord>;
  extraReview: number;
  today: string;
  rng: Rng;
}): ItemId[] {
  const out: ItemId[] = [];
  for (const u of i.blockUnits) {
    let best: ItemId | null = null;
    let bestDays = Infinity;
    for (const k of i.itemKinds) {
      const id = itemId(u, k);
      const d = recallDays(i.mastery[id]);
      if (d < bestDays) { best = id; bestDays = d; }
    }
    if (best !== null) out.push(best);
  }
  const others: ItemId[] = [];
  for (const u of i.taughtUnits) {
    for (const k of i.itemKinds) {
      const id = itemId(u, k);
      if (!out.includes(id) && !others.includes(id)) others.push(id);
    }
  }
  // Shuffle first so the stable sort leaves equal weights in random order.
  const ranked = i.rng
    .shuffle(others)
    .map((id) => ({ id, w: reviewWeight(i.mastery[id], i.today) }))
    .sort((a, b) => b.w - a.w);
  for (const r of ranked.slice(0, Math.max(0, i.extraReview))) out.push(r.id);
  return out;
}

// The first answer for each item decides; an item with no answer fails (no evidence never passes a check-point).
export function gradeCheckpoint(items: ItemId[], answers: AnswerEvent[]): { passed: ItemId[]; failed: ItemId[] } {
  const passed: ItemId[] = [];
  const failed: ItemId[] = [];
  for (const item of items) {
    const first = answers.find((a) => a.item === item);
    if (first && first.ok) passed.push(item);
    else failed.push(item);
  }
  return { passed, failed };
}
