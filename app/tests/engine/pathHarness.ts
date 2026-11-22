// Test harness for the planner / progress tests: drives nextStep + applyStepResult with scripted step results.
import { nextStep, emptyProgress } from '../../src/engine/planner.ts';
import type { NextResult, PlannedStep, PlannerInput, PathProgress } from '../../src/engine/planner.ts';
import { applyStepResult, markStickersShown } from '../../src/engine/progress.ts';
import type { AgeBand, AnswerEvent, Curriculum, ItemId, StepResult } from '../../src/engine/types.ts';
import type { MasteryRecord } from '../../src/engine/mastery.ts';
import { createRng } from '../../src/util/rng.ts';
import type { Rng } from '../../src/util/rng.ts';
import { addDays } from '../../src/util/day.ts';
import { expandPath } from '../../src/engine/curriculum.ts';
import { isPathComplete } from '../../src/engine/pathRules.ts';
import json from '../../content/curriculum-letters.json';

export const c = json as unknown as Curriculum;

export function fresh(today: string, band: AgeBand = '3-5'): PlannerInput {
  return { curriculum: c, band, progress: emptyProgress(), mastery: {}, today, minutesToday: 0, dailyLimitMin: null, rng: createRng(1) };
}

export function msOf(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : 0;
}

export const ans = (item: ItemId, ok: boolean, kind: 'recall' | 'match' = 'recall', t = 0): AnswerEvent => ({ item, ok, kind, t });

// All-correct recall answers for the given items.
export const ok = (items: ItemId[], t = 0): StepResult => ({ outcome: 'done', answers: items.map((item, k) => ans(item, true, 'recall', t + k)), slips: 0, ms: 1000 });

export interface ScriptOpts {
  wrong?: ItemId;               // one wrong answer on this item, the first time a step asks it
  failCheckpointItem?: ItemId;  // wrong in the first (non-retry) checkpoint, right in the retry
  failAlways?: ItemId;          // wrong in every checkpoint, retries included
}

const NAME_STEPS = ['find', 'plane', 'race', 'mole', 'match', 'jump'];
const SOUND_STEPS = ['soundPick', 'firstSound'];

// Answers the way the real steps report evidence: name steps answer `<unit>/name`, sound steps `<unit>/sound`
// (firstSound as a match), meet and drive answer nothing, checkpoints answer every item.
export function scriptedResult(step: PlannedStep, t0: number, opts: ScriptOpts, used: { wrong: boolean }): StepResult {
  let items: ItemId[];
  if (step.kind === 'checkpoint') items = step.items;
  else if (NAME_STEPS.includes(step.step)) items = step.items.filter(x => x.endsWith('/name'));
  else if (SOUND_STEPS.includes(step.step)) items = step.items.filter(x => x.endsWith('/sound'));
  else items = [];
  const kind = step.step === 'firstSound' ? 'match' : 'recall';
  const retry = step.params?.retry === true;
  const answers: AnswerEvent[] = [];
  items.forEach((item, k) => {
    const t = t0 + k;
    if (opts.wrong === item && !used.wrong) { answers.push(ans(item, false, kind, t)); used.wrong = true; }
    const fail = step.kind === 'checkpoint' && (opts.failAlways === item || (!retry && opts.failCheckpointItem === item));
    answers.push(ans(item, !fail, kind, t));
  });
  return { outcome: 'done', answers, slips: 0, ms: 1000 };
}

// Drives one visit like the runner: nextStep -> result -> applyStepResult until an end; an end after at least one
// step shows the end screen, so the stickers are marked shown.
export function run(input: PlannerInput, result: (step: PlannedStep, n: number) => StepResult, maxSteps = 60): { trace: NextResult[]; state: PlannerInput } {
  let s = input;
  const trace: NextResult[] = [];
  for (let n = 0; n < maxSteps; n++) {
    const next = nextStep(s);
    trace.push(next);
    if (next.type === 'end') {
      if (n > 0) s = { ...s, progress: markStickersShown(s.progress) };
      return { trace, state: s };
    }
    const out = applyStepResult(s, next.step, result(next.step, n), msOf(s.today) + n * 1000);
    s = { ...s, progress: out.progress, mastery: out.mastery };
  }
  throw new Error('run did not reach an end');
}

export function runDay(input: PlannerInput, day?: string, opts: ScriptOpts = {}, used = { wrong: false }) {
  const s = day ? { ...input, today: day } : input;
  return run(s, (step, n) => scriptedResult(step, msOf(s.today) + n * 1000, opts, used));
}

const label = (n: NextResult, f: (s: PlannedStep) => string): string => (n.type === 'end' ? 'end:' + n.reason : f(n.step));
export const steps = (input: PlannerInput, day?: string, opts?: ScriptOpts): string[] => runDay(input, day, opts).trace.map(n => label(n, s => s.step));
export const kinds = (input: PlannerInput, day?: string, opts?: ScriptOpts): string[] => runDay(input, day, opts).trace.map(n => label(n, s => s.kind));
export const stepOf = (n: NextResult): string => label(n, s => s.step);

export function playDays(input: PlannerInput, firstDay: string, count: number, opts: ScriptOpts = {}): { state: PlannerInput; last: NextResult[] } {
  let s = input;
  let last: NextResult[] = [];
  const used = { wrong: false };
  for (let k = 0; k < count; k++) {
    const r = runDay(s, addDays(firstDay, k), opts, used);
    s = r.state;
    last = r.trace;
  }
  return { state: s, last };
}

// n units done, one per day, the last one on `lastDay`; today = lastDay.
export function afterUnits(n: number, lastDay: string, opts: ScriptOpts = {}): PlannerInput {
  const first = addDays(lastDay, -(n - 1));
  return playDays(fresh(first), first, n, opts).state;
}

export function afterRetryPassed(s: PlannerInput, day: string): PlannerInput {
  return runDay(s, day, { failCheckpointItem: 'ל/name' }).state;
}

// The whole path finished on `lastDay` (6 units + 2 check-points take 7 sittings).
export function allDone(lastDay: string): PlannerInput {
  const first = addDays(lastDay, -6);
  const r = playDays(fresh(first), first, 7);
  if (!isPathComplete(r.state.progress, expandPath(c, r.state.band))) throw new Error('allDone: path not complete');
  return r.state;
}

// The first `n` steps of a fresh child's sitting, then interrupted.
export function partway(day: string, n: number): PlannerInput {
  let s = fresh(day);
  const used = { wrong: false };
  for (let k = 0; k < n; k++) {
    const next = nextStep(s);
    if (next.type !== 'step') throw new Error('partway: ended early');
    const out = applyStepResult(s, next.step, scriptedResult(next.step, msOf(day) + k * 1000, {}, used), msOf(day) + k * 1000);
    s = { ...s, progress: out.progress, mastery: out.mastery };
  }
  return s;
}

export function withSittingDay(input: PlannerInput, day: string, extra: Partial<NonNullable<PathProgress['sitting']>> = {}): PlannerInput {
  return { ...input, progress: { ...input.progress, sitting: { day, done: 0, warmupDone: false, closed: false, endShown: false, ...extra } } };
}

export function firstStep(s: PlannerInput): PlannedStep {
  const n = nextStep(s);
  if (n.type !== 'step') throw new Error('firstStep: got end ' + n.reason);
  return n.step;
}

// Plays the stations of `unit` for a fresh child on day 'd' (all correct) and returns the progress, before any
// end screen (stickers still unshown).
export function finishUnit(unit: string): PathProgress {
  let s = fresh('d');
  for (let k = 0; k < 20; k++) {
    const next = nextStep(s);
    if (next.type !== 'step' || next.step.unitId !== unit) break;
    const out = applyStepResult(s, next.step, ok([]), k);
    s = { ...s, progress: out.progress, mastery: out.mastery };
  }
  return s.progress;
}

// Check-point input: block ב, taught מ ת ב, sound items only; `weakOld` failed 20 days ago, `knownFresh` right on
// the last two days.
export function cpWith(spec: { weakOld: ItemId; knownFresh: ItemId }): { blockUnits: string[]; taughtUnits: string[]; itemKinds: string[]; mastery: Record<ItemId, MasteryRecord>; extraReview: number; today: string; rng: Rng } {
  const today = '2026-11-21';
  const at = (day: string, okv: boolean) => ({ day, t: msOf(day), ok: okv, kind: 'recall' as const });
  const mastery: Record<ItemId, MasteryRecord> = {
    [spec.weakOld]: { attempts: [at(addDays(today, -20), false)], confusions: {}, lastSeen: msOf(addDays(today, -20)) },
    [spec.knownFresh]: { attempts: [at(addDays(today, -2), true), at(addDays(today, -1), true)], confusions: {}, lastSeen: msOf(addDays(today, -1)) },
  };
  return { blockUnits: ['ב'], taughtUnits: ['מ', 'ת', 'ב'], itemKinds: ['sound'], mastery, extraReview: 1, today, rng: createRng(1) };
}
