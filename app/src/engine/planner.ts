import type { AgeBand, Curriculum, ItemId, StepTypeId, UnitId } from './types.ts';
import type { MasteryRecord } from './mastery.ts';
import { isKnown, isWeak } from './mastery.ts';
import { expandPath, itemId, parseItem } from './curriculum.ts';
import { activeFocus, contentStep, currentSitting, taughtUnits, todaysSitting } from './pathRules.ts';
import { applyStepResult } from './progress.ts';
import { daysBetween } from '../util/day.ts';
import { createRng } from '../util/rng.ts';
import type { Rng } from '../util/rng.ts';

// 'parent': a step of a parent-started practice sitting on one unit (it never moves the path).
export interface PlannedStep {
  kind: 'warmup' | 'station' | 'practice' | 'checkpoint' | 'review' | 'parent';
  step: StepTypeId;
  unitId?: UnitId;
  items: ItemId[];
  params?: Record<string, unknown>;
  stationId?: string;
  cpId?: string;
}

// A sitting the parent started on one unit: 'practice' (the unit was met: queue holds the steps still to play) or
// 'unit' (not met yet: the unit's own stations, as its real path stations).
export interface ParentSitting { unit: UnitId; mode: 'practice' | 'unit'; queue: PlannedStep[] }

export interface PathProgress {
  stationsDone: string[];
  unitStartDay: Record<UnitId, string>;
  checkpointsPassed: string[];
  pending: PlannedStep[]; // practice steps then the retry checkpoint, in order
  extraSittingDay: string | null; // no longer used (sittings are unlimited); kept so older saves still load
  // endShown: the end screen of the closed sitting was shown (false while the sitting is open or just closed); once
  // it is, the next step opens a new sitting the same day. unitsStarted: new units begun in this sitting (missing in
  // older saves: the units started today count instead). parent: a parent-started sitting (no warm-up; it ends when
  // its unit's steps are done).
  sitting: { day: string; done: number; warmupDone: boolean; closed: boolean; endShown: boolean; unitsStarted?: number; parent?: ParentSitting } | null;
  stickers: { id: string; day: string; shown: boolean }[];
  // "Practise more" marks set by the parent: at most 3, units already met. Missing in older saves.
  focus?: UnitId[];
  // Units in the order the child started them (check-point blocks follow it). Missing in older saves: derived from
  // unitStartDay.
  introOrder?: UnitId[];
}

export interface PlannerInput {
  curriculum: Curriculum;
  band: AgeBand;
  progress: PathProgress;
  mastery: Record<ItemId, MasteryRecord>;
  today: string;
  minutesToday: number;
  dailyLimitMin: number | null; // ignored: there is no daily limit (the UI runs the breaks)
  rng: Rng;
}

export type NextResult =
  | { type: 'step'; step: PlannedStep }
  | { type: 'end'; reason: 'sittingDone' | 'tomorrow' | 'limit' | 'pathComplete' }; // 'tomorrow' / 'limit' are no longer returned

export const WARMUP_ROUNDS = 2;
const STALE_KNOWN_DAYS = 3;

export function emptyProgress(): PathProgress {
  return { stationsDone: [], unitStartDay: {}, checkpointsPassed: [], pending: [], extraSittingDay: null, sitting: null, stickers: [] };
}

const lastDay = (rec?: MasteryRecord): string | undefined => (rec && rec.attempts.length ? rec.attempts[rec.attempts.length - 1].day : undefined);
const lastSeen = (rec?: MasteryRecord): number => (rec && rec.attempts.length ? rec.lastSeen : -Infinity);

// Latest wrong attempt as a sortable [day, t] pair.
function lastWrong(rec?: MasteryRecord): [string, number] {
  let best: [string, number] = ['', -Infinity];
  for (const a of rec?.attempts ?? []) {
    if (!a.ok && (a.day > best[0] || (a.day === best[0] && a.t > best[1]))) best = [a.day, a.t];
  }
  return best;
}

function oldest(items: ItemId[], m: Record<ItemId, MasteryRecord>): ItemId | undefined {
  let best: ItemId | undefined;
  for (const id of items) if (best === undefined || lastSeen(m[id]) < lastSeen(m[best])) best = id;
  return best;
}

// Rule 3: the weak item with the most recent wrong attempt, else the not-known item seen longest ago (not seen
// today), else an item of a marked unit not seen today, else a known item not seen for more than 3 days. Items of
// marked ("practise more") units come first among equals: weak items still come before a marked unit's other items.
function pickWarmup(i: PlannerInput): PlannedStep | null {
  const c = i.curriculum;
  const m = i.mastery;
  const items = taughtUnits(i.progress, expandPath(c, i.band)).flatMap((u) => c.itemKinds.map((k) => itemId(u, k)));
  if (!items.length) return null;
  const focus = activeFocus(i);
  const marked = (id: ItemId): boolean => focus.includes(parseItem(id).unit);
  const prefer = (list: ItemId[]): ItemId[] => (list.some(marked) ? list.filter(marked) : list);
  let pick: ItemId | undefined;
  const weak = prefer(items.filter((id) => isWeak(m[id])));
  if (weak.length) {
    pick = weak[0];
    for (const id of weak.slice(1)) {
      const a = lastWrong(m[id]);
      const b = lastWrong(m[pick]);
      if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) pick = id;
    }
  } else {
    pick = oldest(prefer(items.filter((id) => !isKnown(m[id]) && lastDay(m[id]) !== i.today)), m);
    if (pick === undefined) pick = oldest(items.filter((id) => marked(id) && lastDay(m[id]) !== undefined && lastDay(m[id]) !== i.today), m);
    if (pick === undefined) {
      pick = oldest(items.filter((id) => {
        const d = lastDay(m[id]);
        return isKnown(m[id]) && d !== undefined && daysBetween(d, i.today) > STALE_KNOWN_DAYS;
      }), m);
    }
  }
  if (pick === undefined) return null;
  const { unit, kind } = parseItem(pick);
  const step = c.itemSteps[kind];
  if (!step) return null;
  return { kind: 'warmup', step, unitId: unit, items: [pick], params: { rounds: WARMUP_ROUNDS } };
}

export function nextStep(i: PlannerInput): NextResult {
  const p = i.progress;
  // (1) no daily limit. (2) A closed sitting whose end screen was not shown yet has just ended (sittingDone); once it
  // was shown, the next step opens a new sitting the same day.
  const day = todaysSitting(p, i.today);
  if (day && day.closed && !day.endShown) return { type: 'end', reason: 'sittingDone' };
  // (3) warm-up at the start of every sitting, except a parent-started one
  const sit = currentSitting(p, i.today);
  if (!sit || (sit.done === 0 && !sit.warmupDone && !sit.parent)) {
    const w = pickWarmup(i);
    if (w) return { type: 'step', step: w };
  }
  // (4)-(9)
  return contentStep(i, i.rng);
}

// 'ready' whenever a step can be offered; a just-closed sitting counts as ready (its end screen comes first, then a
// new sitting opens). 'tomorrow' / 'limit' stay in the union for older callers and are not returned in practice.
export function sittingStatus(i: PlannerInput): 'ready' | 'tomorrow' | 'limit' | 'complete' {
  let n = nextStep({ ...i, rng: createRng(0) });
  const sit = todaysSitting(i.progress, i.today);
  if (n.type === 'end' && n.reason === 'sittingDone' && sit && sit.closed) {
    n = nextStep({ ...i, progress: { ...i.progress, sitting: { ...sit, endShown: true } }, rng: createRng(0) });
  }
  if (n.type === 'step') return 'ready';
  if (n.reason === 'pathComplete') return 'complete';
  return 'tomorrow';
}

// The step a tap on the map leads to, past the warm-up (and past a just-closed sitting's end screen): what the map
// glows and announces. Null when no step can be offered.
export function upcomingStep(i: PlannerInput): PlannedStep | null {
  let s: PlannerInput = { ...i, rng: createRng(0) };
  const sit = todaysSitting(s.progress, s.today);
  if (sit && sit.closed && !sit.endShown) s = { ...s, progress: { ...s.progress, sitting: { ...sit, endShown: true } } };
  for (let n = 0; n < 3; n++) {
    const next = nextStep(s);
    if (next.type === 'end') return null;
    if (next.step.kind !== 'warmup') return next.step;
    const answers = next.step.items.map((item, k) => ({ item, ok: true, kind: 'recall' as const, t: k }));
    const r = applyStepResult(s, next.step, { outcome: 'done', answers, slips: 0, ms: 0 }, 0);
    s = { ...s, progress: r.progress, mastery: r.mastery };
  }
  return null;
}

const PREVIEW_MAX_STEPS = 50;

// The steps left in the current sitting, assuming every answer (so every check-point) is right.
export function previewSitting(i: PlannerInput): PlannedStep[] {
  let s: PlannerInput = { ...i, rng: createRng(0) };
  const out: PlannedStep[] = [];
  for (let n = 0; n < PREVIEW_MAX_STEPS; n++) {
    const next = nextStep(s);
    if (next.type === 'end') break;
    out.push(next.step);
    const answers = next.step.items.map((item, k) => ({ item, ok: true, kind: 'recall' as const, t: k }));
    const r = applyStepResult(s, next.step, { outcome: 'done', answers, slips: 0, ms: 0 }, 0);
    s = { ...s, progress: r.progress, mastery: r.mastery };
  }
  return out;
}
