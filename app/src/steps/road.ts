// Pure tracking for the drive step: where the car is on the letter-shaped road and what the finger is doing.
export type Pt = { x: number; y: number };

export interface RoadState {
  stroke: number;
  idx: number;
  holding: boolean;
  offRoad: boolean;
  done: boolean;
  slips: number;
}

export const ROAD = { SAMPLES: 40, LOOKAHEAD: 4, GRAB_EXTRA: 12, OFF_FACTOR: 1.6 };

export function createRoad(): RoadState {
  return { stroke: 0, idx: 0, holding: false, offRoad: false, done: false, slips: 0 };
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The car sits on the current stroke at the current sample. */
export function carPoint(s: RoadState, strokes: Pt[][]): Pt {
  return strokes[s.stroke][s.idx];
}

/** A grab counts only near the car; the test is a circle, so it does not depend on the hand. */
export function roadDown(s: RoadState, strokes: Pt[][], p: Pt, tol: number): RoadState {
  if (s.done || s.holding) return s;
  const d = dist(p, carPoint(s, strokes));
  if (d > tol + ROAD.GRAB_EXTRA) return s;
  return { ...s, holding: true, offRoad: d <= tol ? false : s.offRoad };
}

/**
 * While holding, the car moves to the sample nearest the finger among the next LOOKAHEAD samples
 * (within tol; the car's own sample counts, so a finger at or behind it never drags the car), so a fast swipe cannot skip ahead. Far from the car the road is only flagged, never reset.
 */
export function roadMove(s: RoadState, strokes: Pt[][], p: Pt, tol: number): RoadState {
  if (!s.holding || s.done) return s;
  const pts = strokes[s.stroke];
  let best = -1;
  let bestD = Infinity;
  for (let j = s.idx; j <= Math.min(s.idx + ROAD.LOOKAHEAD, pts.length - 1); j++) {
    const d = dist(p, pts[j]);
    if (d < tol && d < bestD) { best = j; bestD = d; }
  }
  if (best > s.idx) {
    if (best >= ROAD.SAMPLES - 2 || best >= pts.length - 2) {
      if (s.stroke + 1 < strokes.length) return { ...s, stroke: s.stroke + 1, idx: 0, holding: false, offRoad: false };
      return { ...s, idx: pts.length - 1, holding: false, offRoad: false, done: true };
    }
    return { ...s, idx: best, offRoad: false };
  }
  const d = dist(p, pts[s.idx]);
  if (d > tol * ROAD.OFF_FACTOR) return s.offRoad ? s : { ...s, offRoad: true, slips: s.slips + 1 };
  if (d <= tol && s.offRoad) return { ...s, offRoad: false };
  return s;
}

/** The car waits where it is; nothing is lost. */
export function roadUp(s: RoadState): RoadState {
  return s.holding ? { ...s, holding: false } : s;
}
