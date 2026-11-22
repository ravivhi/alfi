// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoad, roadDown, roadMove, roadUp, ROAD } from '../../src/steps/road.ts';
import type { Pt, RoadState } from '../../src/steps/road.ts';
import { samplePath, driveStep, driveTol, ROAD_WIDTH_FACTOR, CAR_HALF_WIDTH } from '../../src/steps/drive.ts';
import { REGISTRY } from '../../src/steps/registry.ts';
import type { StepContext } from '../../src/steps/contract.ts';
import type { PlannedStep } from '../../src/engine/planner.ts';
import { profileFor } from '../../src/engine/profiles.ts';
import { CONTENT } from '../../src/content/index.ts';
import { createRng } from '../../src/util/rng.ts';
import type { AudioApi } from '../../src/audio/audio.ts';

const N = ROAD.SAMPLES;
const H: Pt[] = Array.from({ length: N }, (_, i) => ({ x: 200 - (120 * i) / (N - 1), y: 100 }));
const V: Pt[] = Array.from({ length: N }, (_, i) => ({ x: 80, y: 150 + (100 * i) / (N - 1) }));
const TOL = 40;

const drivenTo = (k: number): RoadState => {
  let s = roadDown(createRoad(), [H], H[0], TOL);
  for (let i = 1; i <= k; i++) s = roadMove(s, [H], H[i], TOL);
  return s;
};
const offRoadAt = (k: number): RoadState => {
  let s = drivenTo(k);
  s = roadMove(s, [H], { x: H[k].x, y: 200 }, TOL);
  return roadMove(s, [H], { x: H[k].x, y: 210 }, TOL);
};
function driveAll(strokes: Pt[][]): RoadState {
  let s = createRoad();
  for (let si = 0; si < strokes.length; si++) {
    s = roadDown(s, strokes, strokes[si][0], TOL);
    for (let i = 1; i < N && !s.done && s.stroke === si; i++) s = roadMove(s, strokes, strokes[si][i], TOL);
    s = roadUp(s);
  }
  return s;
}

describe('road tracking', () => {
  it('advances when the finger follows the road', () => { let s = roadDown(createRoad(), [H], H[0], 40); s = roadMove(s, [H], H[3], 40); expect(s.idx).toBe(3); });
  it('cannot skip ahead more than 4 samples per move', () => { let s = roadDown(createRoad(), [H], H[0], 40); s = roadMove(s, [H], H[20], 40); expect(s.idx).toBe(0); });
  it('lifting the finger keeps progress', () => { let s = roadDown(createRoad(), [H], H[0], 40); s = roadMove(s, [H], H[4], 40); s = roadUp(s); expect(s.idx).toBe(4); expect(s.holding).toBe(false); });
  it('leaving the road flags offRoad, counts one slip and never resets', () => {
    let s = drivenTo(8); s = roadMove(s, [H], { x: H[8].x, y: 200 }, 40); s = roadMove(s, [H], { x: H[8].x, y: 210 }, 40);
    expect(s).toMatchObject({ offRoad: true, idx: 8, slips: 1 });
  });
  it('returning near the car resumes', () => { let s = offRoadAt(8); s = roadMove(s, [H], H[9], 40); expect(s).toMatchObject({ offRoad: false, idx: 9 }); });
  it('grabbing far from the car is ignored', () => expect(roadDown(createRoad(), [H], H[30], 40).holding).toBe(false));
  it('finishing the last stroke sets done', () => expect(driveAll([H, V]).done).toBe(true));
  it('finishing a non-last stroke moves to the next one, not holding', () => {
    let s = roadDown(createRoad(), [H, V], H[0], TOL);
    for (let i = 1; i < N && s.stroke === 0; i++) s = roadMove(s, [H, V], H[i], TOL);
    expect(s).toMatchObject({ stroke: 1, idx: 0, holding: false, done: false });
  });
  it('a move without holding changes nothing', () => {
    const s = createRoad();
    expect(roadMove(s, [H], H[2], TOL)).toEqual(s);
  });
  it('grab is symmetric around the car (either hand)', () => {
    for (const d of [{ x: 30, y: 0 }, { x: -30, y: 0 }, { x: 0, y: 30 }, { x: 0, y: -30 }]) {
      expect(roadDown(createRoad(), [H], { x: H[0].x + d.x, y: 100 + d.y }, TOL).holding).toBe(true);
    }
  });
  it('a second slip needs a return to the road first', () => {
    let s = offRoadAt(8);
    s = roadMove(s, [H], { x: H[8].x, y: 230 }, TOL);
    expect(s.slips).toBe(1);
    s = roadMove(s, [H], H[8], TOL);
    s = roadMove(s, [H], { x: H[8].x, y: 230 }, TOL);
    expect(s.slips).toBe(2);
  });
  it('a move at the car or behind it leaves idx unchanged', () => {
    const s = drivenTo(8);
    expect(roadMove(s, [H], H[8], TOL).idx).toBe(8);
    expect(roadMove(s, [H], H[5], TOL).idx).toBe(8);
    expect(roadMove(s, [H], { x: H[8].x, y: 100 + 20 }, TOL).idx).toBe(8);
  });
  it('re-grabbing near the car clears offRoad', () => {
    const s = roadDown(roadUp(offRoadAt(8)), [H], H[8], TOL);
    expect(s).toMatchObject({ holding: true, offRoad: false, idx: 8 });
    const again = roadMove(roadMove(s, [H], { x: H[8].x, y: 200 }, TOL), [H], { x: H[8].x, y: 210 }, TOL);
    expect(again.slips).toBe(2);
  });
  it('does not mutate its input', () => {
    const frozen = Object.freeze({ ...createRoad() });
    expect(() => roadDown(frozen, [H], H[0], TOL)).not.toThrow();
  });
});

describe('samplePath', () => {
  it('samples M/L/Q paths into SAMPLES points from the start to the end', () => {
    const pts = samplePath('M 82 60 L 200 60 Q 214 60 214 74 L 214 238');
    expect(pts).toHaveLength(N);
    expect(pts[0]).toEqual({ x: 82, y: 60 });
    expect(pts[N - 1].x).toBeCloseTo(214, 3); expect(pts[N - 1].y).toBeCloseTo(238, 3);
  });
  it('is evenly spaced on a straight line', () => {
    const pts = samplePath('M 0 0 L 390 0');
    expect(pts[1].x).toBeCloseTo(10, 3); expect(pts[20].x).toBeCloseTo(200, 3);
  });
  it('terminates on a stray number after Z or a truncated curve', () => {
    expect(samplePath('M 0 0 L 10 0 Z 5')).toHaveLength(N);
    const q = samplePath('M 0 0 L 10 0 Q 5 5');
    expect(q).toHaveLength(N);
    expect(q.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
  it('handles C, H and V commands', () => {
    expect(samplePath('M 0 0 H 100 V 100')[N - 1]).toEqual({ x: 100, y: 100 });
    const c = samplePath('M 0 0 C 0 100 100 100 100 0');
    expect(c[N - 1].x).toBeCloseTo(100, 3); expect(c[N - 1].y).toBeCloseTo(0, 3);
  });
});

// ---- the mounted step -------------------------------------------------------
let said: string[];
let stage: HTMLElement;
const tick = () => new Promise<void>(r => setTimeout(r, 0));

function makeCtx(signal?: AbortSignal): StepContext {
  const audio = {
    ready: Promise.resolve(), say: (t: string) => { said.push(t); return Promise.resolve(); },
    stop() { /* not used */ }, setVoiceVolume() { /* not used */ }, status: () => 'live' as const, onStatusChange: () => () => undefined,
  };
  return {
    step: { kind: 'station', step: 'drive', unitId: 'ב', items: [] } as unknown as PlannedStep,
    profile: profileFor('3-5'), content: CONTENT, rng: createRng(3), stage,
    signal: signal ?? new AbortController().signal,
    audio: audio as unknown as AudioApi, sfx: {} as StepContext['sfx'],
    taught: [], confusions: () => [],
    setInstruction: (t) => { said.push(t); return Promise.resolve(); },
    progress: () => undefined,
  };
}

function fire(el: Element, type: string, p: Pt, id = 1): void {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
  ev.pointerId = id; ev.clientX = p.x; ev.clientY = p.y;
  el.dispatchEvent(ev);
}

describe('drive step', () => {
  beforeEach(() => { said = []; document.body.replaceChildren(); stage = document.createElement('div'); document.body.appendChild(stage); });

  it('is registered', () => expect(REGISTRY.drive).toBe(driveStep));

  it('smoke: drives the whole letter with a fake pointer sequence, reports done with no answers', async () => {
    const p = driveStep.run(makeCtx());
    await tick();
    const board = stage.querySelector('[data-drive-board]') as HTMLElement;
    expect(board).toBeTruthy();
    expect(board.style.touchAction).toBe('none');
    // happy-dom has no layout (zero-size rect), so the step maps client coordinates 1:1 to board units
    for (const path of CONTENT.letters['ב'].strokes) {
      const st = samplePath(path);
      fire(board, 'pointerdown', st[0]);
      for (let i = 1; i < st.length; i++) fire(board, 'pointermove', st[i]);
      fire(board, 'pointerup', st[st.length - 1]);
    }
    const r = await p;
    expect(r).toMatchObject({ outcome: 'done', answers: [], slips: 0 });
    expect(said[0]).toContain('נוסעים');
    expect(said).toContain(CONTENT.lines['drive.next']);
    expect(said[said.length - 1]).toContain('יופי');
  });

  it('leaving the road speaks drive.back once, shows no restart and keeps the board', async () => {
    void driveStep.run(makeCtx());
    await tick();
    const board = stage.querySelector('[data-drive-board]') as HTMLElement;
    const st = samplePath(CONTENT.letters['ב'].strokes[0]);
    fire(board, 'pointerdown', st[0]);
    for (let i = 1; i <= 6; i++) fire(board, 'pointermove', st[i]);
    for (let k = 0; k < 4; k++) fire(board, 'pointermove', { x: st[6].x, y: st[6].y + 150 + k });
    expect(said.filter(s => s === CONTENT.lines['drive.back'])).toHaveLength(1);
    fire(board, 'pointerup', st[6]);
    expect(stage.querySelector('button')).toBeNull();
    expect(stage.querySelector('[data-drive-board]')).toBe(board);
  });

  it('resolves aborted on abort and ignores later pointer events', async () => {
    const ac = new AbortController();
    const p = driveStep.run(makeCtx(ac.signal));
    await tick();
    const board = stage.querySelector('[data-drive-board]') as HTMLElement;
    ac.abort();
    expect(await p).toMatchObject({ outcome: 'aborted', answers: [], slips: 0 });
    expect(() => fire(board, 'pointerdown', { x: 82, y: 60 })).not.toThrow();
  });
});

describe('drive: a road 25% thinner (owner 2026-11-21)', () => {
  beforeEach(() => { said = []; document.body.replaceChildren(); stage = document.createElement('div'); document.body.appendChild(stage); });

  it('the drawn road stroke is 0.75 of the old 2 x traceTolerance', async () => {
    void driveStep.run(makeCtx());
    await tick();
    const board = stage.querySelector('[data-drive-board]') as HTMLElement;
    const roadPath = board.querySelectorAll('path')[0] as SVGPathElement;
    expect(Number(roadPath.getAttribute('stroke-width'))).toBeCloseTo(0.75 * 2 * profileFor('3-5').traceTolerance, 6);
    expect(ROAD_WIDTH_FACTOR).toBe(0.75);
  });

  it('the on-road tolerance follows the new half width and never drops below the car half width', () => {
    for (const age of ['3-5', '6-8'] as const) {
      const old = profileFor(age).traceTolerance;
      expect(driveTol(old)).toBeCloseTo(Math.max(0.75 * old, CAR_HALF_WIDTH), 6);
      expect(driveTol(old)).toBeGreaterThanOrEqual(CAR_HALF_WIDTH);
    }
    expect(driveTol(1)).toBe(CAR_HALF_WIDTH);
  });

  it('the car on the centre line is on the road; a point just outside the new width is not', () => {
    const tol = driveTol(profileFor('3-5').traceTolerance);
    const start = roadDown(createRoad(), [H], H[0], tol);
    expect(start).toMatchObject({ holding: true, offRoad: false });
    const at = (dy: number): RoadState => roadMove(start, [H], { x: H[1].x, y: H[1].y + dy }, tol);
    expect(at(0).idx).toBe(1);
    expect(at(tol - 1).idx).toBe(1);
    expect(at(tol + 1).idx).toBe(0);
    // far outside the road is a slip, just inside the road is not
    const held = drivenTo(8);
    expect(roadMove(held, [H], { x: H[8].x, y: H[8].y + tol * ROAD.OFF_FACTOR + 1 }, tol).offRoad).toBe(true);
    expect(roadMove(held, [H], { x: H[8].x, y: H[8].y + tol - 1 }, tol).offRoad).toBe(false);
  });
});
