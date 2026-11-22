import type { Curriculum, ItemId, StationSpec, StepResult, UnitId } from './types.ts';
import type { MasteryRecord } from './mastery.ts';
import { recordAnswer } from './mastery.ts';
import { expandPath, parseItem } from './curriculum.ts';
import type { PathProgress, PlannedStep, PlannerInput } from './planner.ts';
import { FOCUS_MAX, RETRY_PARAM, activeFocus, contentStep, currentSitting, introOrder, isFinished, isRetry, isStarted, stationId, unitItems, unitNode } from './pathRules.ts';
import { gradeCheckpoint } from './checkpoint.ts';
import { createRng } from '../util/rng.ts';
import type { Rng } from '../util/rng.ts';

export interface StepOutcome {
  progress: PathProgress;
  mastery: Record<ItemId, MasteryRecord>;
  checkpoint?: { cpId: string; passed: ItemId[]; failed: ItemId[] };
}

function addSticker(p: PathProgress, id: string, day: string): PathProgress {
  if (p.stickers.some((s) => s.id === id)) return p;
  return { ...p, stickers: [...p.stickers, { id, day, shown: false }] };
}

// Records a step's answers in mastery and leaves the path as it is: a failed step, and a replay of a step already
// done (the path never moves twice for one station). Slips are never evidence: only answers reach mastery.
export function recordAnswers(i: PlannerInput, r: StepResult, now: number): StepOutcome {
  if (r.outcome === 'aborted' || !r.answers.length) return { progress: i.progress, mastery: i.mastery };
  const mastery = { ...i.mastery };
  for (const a of r.answers) {
    mastery[a.item] = recordAnswer(mastery[a.item], {
      day: i.today,
      t: Number.isFinite(a.t) ? a.t : now,
      ok: a.ok,
      kind: a.kind,
      ...(a.chose !== undefined ? { chose: a.chose } : {}),
    });
  }
  return { progress: i.progress, mastery };
}

// Applies one finished step. An aborted step (back button, app closed) records nothing, so the same step comes
// back. A failed step records its answers only (recordAnswers): the station is not done, the sitting does not move
// and never closes, so the same step comes back.
export function applyStepResult(i: PlannerInput, step: PlannedStep, r: StepResult, now: number): StepOutcome {
  if (r.outcome === 'aborted') return { progress: i.progress, mastery: i.mastery };
  if (r.outcome === 'failed') return recordAnswers(i, r, now);
  const today = i.today;
  const c = i.curriculum;
  const mastery = recordAnswers(i, r, now).mastery;

  // a closed sitting is never continued: the step opens a new one
  const cur = currentSitting(i.progress, today);
  const prev = cur && !cur.closed ? cur : { day: today, done: 0, warmupDone: false, closed: false, endShown: false, unitsStarted: 0 };
  let p: PathProgress = {
    ...i.progress,
    sitting: { ...prev, done: prev.done + 1, warmupDone: prev.warmupDone || step.kind === 'warmup' },
  };
  let checkpoint: StepOutcome['checkpoint'];
  let close = false;

  if (step.kind === 'station' && step.stationId !== undefined) {
    const path = expandPath(c, i.band);
    const node = path.find((n) => n.type === 'unit' && (n.stations ?? []).some((_, k) => stationId(n, k) === step.stationId));
    if (node && !p.stationsDone.includes(step.stationId)) {
      p = { ...p, stationsDone: [...p.stationsDone, step.stationId] };
      if (step.stationId === stationId(node, 0) && node.unitId !== undefined) {
        const s = p.sitting!;
        const order = introOrder(i.progress, path).filter((u) => u !== node.unitId);
        p = {
          ...p,
          unitStartDay: { ...p.unitStartDay, [node.unitId]: today },
          introOrder: [...order, node.unitId],
          sitting: { ...s, unitsStarted: (s.unitsStarted ?? 0) + 1 },
        };
      }
      if (isFinished(p, node)) p = addSticker(p, node.id, today);
    }
  } else if (step.kind === 'parent') {
    const s = p.sitting!;
    if (s.parent) p = { ...p, sitting: { ...s, parent: { ...s.parent, queue: s.parent.queue.slice(1) } } };
  } else if (step.kind === 'practice') {
    p = { ...p, pending: p.pending.slice(1) };
  } else if (step.kind === 'checkpoint' && step.cpId !== undefined) {
    const retry = isRetry(step);
    const g = gradeCheckpoint(step.items, r.answers);
    checkpoint = { cpId: step.cpId, passed: g.passed, failed: g.failed };
    const pending = retry ? p.pending.slice(1) : p.pending.slice();
    if (!g.failed.length) {
      if (!p.checkpointsPassed.includes(step.cpId)) p = addSticker({ ...p, checkpointsPassed: [...p.checkpointsPassed, step.cpId] }, step.cpId, today);
    } else {
      for (const item of g.failed) {
        const { unit, kind } = parseItem(item);
        for (const spec of c.practice[kind] ?? []) {
          pending.push({ kind: 'practice', step: spec.step, unitId: unit, items: [item], ...(spec.params ? { params: spec.params } : {}) });
        }
      }
      pending.push({ kind: 'checkpoint', step: c.checkpoint.step, items: g.failed, cpId: step.cpId, params: { [RETRY_PARAM]: true } });
    }
    p = { ...p, pending };
    // after the retry check-point the sitting closes, passed or not
    if (retry) close = true;
  }

  // The sitting closes when the content rules have nothing more for it (rule 8). That includes the sitting that
  // completes the path and every review sitting after it, so review play is unlimited like practice sittings.
  if (!close && step.kind !== 'warmup') {
    const n = contentStep({ ...i, progress: p, mastery }, createRng(0));
    close = n.type === 'end' && (n.reason === 'sittingDone' || n.reason === 'pathComplete');
  }
  if (close) {
    // its end screen is still to be shown; after that the next step opens a new sitting
    p = { ...p, sitting: { ...p.sitting!, closed: true, endShown: false } };
  }

  // a mark 3 days after its unit became known is dropped from the save
  if (p.focus) {
    const focus = activeFocus({ ...i, progress: p, mastery });
    if (focus.length !== p.focus.length) p = { ...p, focus };
  }

  return checkpoint ? { progress: p, mastery, checkpoint } : { progress: p, mastery };
}

// Toggles the parent's "practise more" mark on a unit: only units already met, at most FOCUS_MAX marks ('full' asks
// the parent to remove one first). Marks never change isKnown, check-points or the path order.
export function toggleFocus(i: PlannerInput, unit: UnitId): { progress: PathProgress; result: 'added' | 'removed' | 'full' | 'notMet' } {
  const focus = activeFocus(i);
  if (focus.includes(unit)) return { progress: { ...i.progress, focus: focus.filter((u) => u !== unit) }, result: 'removed' };
  const node = unitNode(expandPath(i.curriculum, i.band), unit);
  if (!node || !isStarted(i.progress, node)) return { progress: i.progress, result: 'notMet' };
  if (focus.length >= FOCUS_MAX) return { progress: i.progress, result: 'full' };
  return { progress: { ...i.progress, focus: [...focus, unit] }, result: 'added' };
}

function unitPracticeSteps(c: Curriculum, unit: UnitId, rng: Rng): PlannedStep[] {
  const specs: StationSpec[] = c.unitPractice ?? [...c.itemKinds.map((k) => ({ step: c.itemSteps[k] })).filter((s) => s.step), { step: '$game' }];
  return specs.flatMap((s) => {
    const step = s.step === '$game' ? (c.gameRotation.length ? rng.pick(c.gameRotation) : null) : s.step === '$allGames' ? null : s.step;
    return step ? [{ kind: 'parent' as const, step, unitId: unit, items: unitItems(c, unit), ...(s.params ? { params: s.params } : {}) }] : [];
  });
}

// Opens a sitting the parent started on one unit, replacing today's sitting. A unit already met gets a practice
// sitting (unitPractice, one rotating game) that leaves the path as it is; a unit not met yet moves into the path now:
// its own stations run as its real stations (start day, introduction order, sticker), and the normal path later skips
// it. A unit outside the path changes nothing.
export function startParentSitting(i: PlannerInput, unit: UnitId): PathProgress {
  const c = i.curriculum;
  const node = unitNode(expandPath(c, i.band), unit);
  if (!node) return i.progress;
  const met = isStarted(i.progress, node);
  return {
    ...i.progress,
    sitting: {
      day: i.today, done: 0, warmupDone: false, closed: false, endShown: false, unitsStarted: 0,
      parent: { unit, mode: met ? 'practice' : 'unit', queue: met ? unitPracticeSteps(c, unit, i.rng) : [] },
    },
  };
}

// Called after the end screen: marks the stickers shown and, when the sitting is closed, its end screen shown.
// An open sitting keeps endShown false, so a later close still reports sittingDone.
export function markStickersShown(p: PathProgress): PathProgress {
  return {
    ...p,
    stickers: p.stickers.map((s) => (s.shown ? s : { ...s, shown: true })),
    sitting: p.sitting && p.sitting.closed ? { ...p.sitting, endShown: true } : p.sitting,
  };
}
