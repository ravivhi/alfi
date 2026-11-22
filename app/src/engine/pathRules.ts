// Path state queries and the content rules (4-9) of the sitting planner, shared by planner.ts and progress.ts.
import type { Curriculum, ItemId, PathNode, UnitId } from './types.ts';
import type { NextResult, ParentSitting, PathProgress, PlannedStep, PlannerInput } from './planner.ts';
import { expandPath, itemId } from './curriculum.ts';
import { profileFor } from './profiles.ts';
import { isKnown, isWeak, knownSince, recallDays } from './mastery.ts';
import { buildCheckpoint } from './checkpoint.ts';
import { daysBetween } from '../util/day.ts';
import type { Rng } from '../util/rng.ts';

export const RETRY_PARAM = 'retry';
export const FOCUS_MAX = 3;
const FOCUS_CLEAR_DAYS = 3;

export function stationId(node: PathNode, index: number): string {
  return node.id + '#' + index;
}

export function unitItems(c: Curriculum, unit: UnitId): ItemId[] {
  return c.itemKinds.map((k) => itemId(unit, k));
}

export const unitNodes = (path: PathNode[]): PathNode[] => path.filter((n) => n.type === 'unit');

export const unitNode = (path: PathNode[], unit: UnitId): PathNode | undefined => path.find((n) => n.type === 'unit' && n.unitId === unit);

// Taught = the unit's first station (meet) is done.
export function isStarted(p: PathProgress, node: PathNode): boolean {
  return p.stationsDone.includes(stationId(node, 0));
}

// Every station done, or the unit's sticker is there: a unit finished when it had fewer stations (one game before
// every unit played all the games) stays finished.
export function isFinished(p: PathProgress, node: PathNode): boolean {
  if (node.type === 'unit' && p.stickers.some((s) => s.id === node.id)) return true;
  return (node.stations ?? []).every((_, k) => p.stationsDone.includes(stationId(node, k)));
}

// Only an exact match is "today": a start day stored in the future (clock moved back) is not today.
export function startedToday(p: PathProgress, path: PathNode[], today: string): PathNode[] {
  return unitNodes(path).filter((n) => n.unitId !== undefined && p.unitStartDay[n.unitId] === today);
}

export function taughtUnits(p: PathProgress, path: PathNode[]): UnitId[] {
  return unitNodes(path).filter((n) => isStarted(p, n)).map((n) => n.unitId as UnitId);
}

// The started units in the order the child started them. Older saves have no introOrder: their units follow the
// start days (same day: path order). Units missing from a stored order go after it, the same way.
export function introOrder(p: PathProgress, path: PathNode[]): UnitId[] {
  const started = taughtUnits(p, path);
  const out: UnitId[] = [];
  for (const u of p.introOrder ?? []) if (started.includes(u) && !out.includes(u)) out.push(u);
  const day = (u: UnitId): string => p.unitStartDay[u] ?? '';
  const rest = started.filter((u) => !out.includes(u)).sort((a, b) => (day(a) < day(b) ? -1 : day(a) > day(b) ? 1 : 0));
  return [...out, ...rest];
}

export interface CheckpointBlock { node: PathNode; units: UnitId[]; size: number }

// Check-point blocks follow the introduction order, not the path layout: check-point k covers the k-th group of
// units the child started (its size is the block size of its path node). A block is full once that many units began.
export function checkpointBlocks(p: PathProgress, path: PathNode[]): CheckpointBlock[] {
  const order = introOrder(p, path);
  let at = 0;
  return path.filter((n) => n.type === 'checkpoint').map((node) => {
    const size = node.blockUnits?.length ?? 0;
    const units = order.slice(at, at + size);
    at += size;
    return { node, units, size };
  });
}

const isFull = (b: CheckpointBlock): boolean => b.size > 0 && b.units.length === b.size;
const isPassed = (p: PathProgress, n: PathNode): boolean => p.checkpointsPassed.includes(n.id);

function blockFinished(p: PathProgress, path: PathNode[], b: CheckpointBlock): boolean {
  return b.units.every((u) => {
    const n = unitNode(path, u);
    return n !== undefined && isFinished(p, n);
  });
}

export function todaysSitting(p: PathProgress, today: string): PathProgress['sitting'] {
  return p.sitting && p.sitting.day === today ? p.sitting : null;
}

// The sitting the next step belongs to: today's, unless it closed and its end screen was shown (then the next step
// opens a new sitting).
export function currentSitting(p: PathProgress, today: string): PathProgress['sitting'] {
  const s = todaysSitting(p, today);
  return s && !(s.closed && s.endShown) ? s : null;
}

// New units begun in the current sitting. A sitting saved before unitsStarted existed counts the units started today,
// so the upgrade day cannot start a second new unit in that sitting.
function unitsStartedInSitting(p: PathProgress, path: PathNode[], today: string): number {
  const s = currentSitting(p, today);
  if (!s) return 0;
  return s.unitsStarted ?? startedToday(p, path, today).length;
}

// Content steps already played in the current sitting (the warm-up does not count).
function playedInSitting(p: PathProgress, today: string): number {
  const s = currentSitting(p, today);
  return s ? s.done - (s.warmupDone ? 1 : 0) : 0;
}

export function isRetry(step: PlannedStep): boolean {
  return step.kind === 'checkpoint' && step.params?.[RETRY_PARAM] === true;
}

export function isPathComplete(p: PathProgress, path: PathNode[]): boolean {
  return path.every((n) => (n.type === 'unit' ? isFinished(p, n) : isPassed(p, n)));
}

// The next unit in path order not started yet, unless a full check-point block waits for its check-point.
function nextNewUnit(p: PathProgress, path: PathNode[]): PathNode | null {
  if (checkpointBlocks(p, path).some((b) => isFull(b) && !isPassed(p, b.node))) return null;
  return unitNodes(path).find((n) => !isStarted(p, n)) ?? null;
}

// A check-point is due when its block is full and finished and no block unit started today: it opens a later sitting.
function dueCheckpoint(p: PathProgress, path: PathNode[], today: string): CheckpointBlock | null {
  for (const b of checkpointBlocks(p, path)) {
    if (isPassed(p, b.node) || !isFull(b)) continue;
    if (blockFinished(p, path, b) && b.units.every((u) => p.unitStartDay[u] !== today)) return b;
  }
  return null;
}

// The node the path goes to next, for the map (it keeps the curriculum layout): a check-point whose block is full and
// finished, else a started unit not finished, else the next new unit, else the first node not done. Null when done.
export function nextPathNode(p: PathProgress, path: PathNode[]): PathNode | null {
  for (const b of checkpointBlocks(p, path)) {
    if (!isPassed(p, b.node) && isFull(b) && blockFinished(p, path, b)) return b.node;
  }
  for (const n of unitNodes(path)) if (isStarted(p, n) && !isFinished(p, n)) return n;
  const nu = nextNewUnit(p, path);
  if (nu) return nu;
  return path.find((n) => (n.type === 'unit' ? !isFinished(p, n) : !isPassed(p, n))) ?? null;
}

// The "practise more" marks still in force: units already met, dropped 3 days after the unit became known.
export function activeFocus(i: Pick<PlannerInput, 'curriculum' | 'band' | 'progress' | 'mastery' | 'today'>): UnitId[] {
  const path = expandPath(i.curriculum, i.band);
  const out: UnitId[] = [];
  for (const u of i.progress.focus ?? []) {
    const node = unitNode(path, u);
    if (out.includes(u) || !node || !isStarted(i.progress, node)) continue;
    const since = knownSince(unitItems(i.curriculum, u).map((id) => i.mastery[id]));
    if (since !== null && daysBetween(since, i.today) >= FOCUS_CLEAR_DAYS) continue;
    out.push(u);
  }
  return out;
}

export function stationStep(c: Curriculum, node: PathNode, k: number): PlannedStep {
  const st = (node.stations ?? [])[k];
  return {
    kind: 'station',
    step: st.step,
    unitId: node.unitId,
    items: unitItems(c, node.unitId as UnitId),
    ...(st.params ? { params: st.params } : {}),
    stationId: stationId(node, k),
  };
}

function firstUndone(p: PathProgress, node: PathNode): number {
  return (node.stations ?? []).findIndex((_, j) => !p.stationsDone.includes(stationId(node, j)));
}

// Weakest taught unit: most weak items, then marked ("practise more"), then most not-known items, then fewest recall
// days, then path order.
function weakestUnit(i: PlannerInput, units: UnitId[], focus: UnitId[]): UnitId {
  const score = (u: UnitId): number[] => {
    const recs = unitItems(i.curriculum, u).map((id) => i.mastery[id]);
    return [
      -recs.filter((r) => isWeak(r)).length,
      focus.includes(u) ? 0 : 1,
      -recs.filter((r) => !isKnown(r)).length,
      recs.reduce((s, r) => s + recallDays(r), 0),
    ];
  };
  let best = units[0];
  let bestScore = score(best);
  for (const u of units.slice(1)) {
    const s = score(u);
    const k = s.findIndex((v, j) => v !== bestScore[j]);
    if (k >= 0 && s[k] < bestScore[k]) { best = u; bestScore = s; }
  }
  return best;
}

// A parent-started sitting: a unit already met plays its practice queue; a unit not met yet plays its own stations
// (it moves into the path now). The sitting ends when they are done.
function parentStep(i: PlannerInput, path: PathNode[], ps: ParentSitting): NextResult {
  if (ps.mode === 'practice') return ps.queue.length ? { type: 'step', step: ps.queue[0] } : { type: 'end', reason: 'sittingDone' };
  const node = unitNode(path, ps.unit);
  if (!node || isFinished(i.progress, node)) return { type: 'end', reason: 'sittingDone' };
  return { type: 'step', step: stationStep(i.curriculum, node, firstUndone(i.progress, node)) };
}

// Rules 4-9 of nextStep (no closed-sitting or warm-up checks).
export function contentStep(i: PlannerInput, rng: Rng): NextResult {
  const p = i.progress;
  const c = i.curriculum;
  const path = expandPath(c, i.band);
  const profile = profileFor(i.band);

  const sit = currentSitting(p, i.today);
  if (sit?.parent) return parentStep(i, path, sit.parent);

  if (p.pending.length) return { type: 'step', step: p.pending[0] };

  const cp = dueCheckpoint(p, path, i.today);
  if (cp) {
    const items = buildCheckpoint({
      blockUnits: cp.units,
      taughtUnits: taughtUnits(p, path),
      itemKinds: c.itemKinds,
      mastery: i.mastery,
      extraReview: profile.checkpointExtraReview,
      today: i.today,
      rng,
    });
    return { type: 'step', step: { kind: 'checkpoint', step: c.checkpoint.step, items, cpId: cp.node.id } };
  }

  for (const n of unitNodes(path)) {
    if (!isStarted(p, n) || isFinished(p, n)) continue;
    return { type: 'step', step: stationStep(c, n, firstUndone(p, n)) };
  }

  // at most unitsPerSitting new units in the current sitting
  const nu = nextNewUnit(p, path);
  if (nu && unitsStartedInSitting(p, path, i.today) < profile.unitsPerSitting) return { type: 'step', step: stationStep(c, nu, 0) };

  const played = playedInSitting(p, i.today);
  const taught = taughtUnits(p, path);
  const game = (kind: PlannedStep['kind']): NextResult => {
    const unit = weakestUnit(i, taught, activeFocus(i));
    return { type: 'step', step: { kind, step: rng.pick(c.gameRotation), unitId: unit, items: unitItems(c, unit) } };
  };

  if (isPathComplete(p, path)) {
    if (played === 0 && taught.length && c.gameRotation.length) return game('review');
    return { type: 'end', reason: 'pathComplete' };
  }

  // Nothing new can be offered (a check-point waits for a later day): a practice sitting, one game on the weakest
  // taught unit, as often as the child wants.
  if (played === 0 && taught.length && c.gameRotation.length) return game('station');

  return { type: 'end', reason: 'sittingDone' };
}
