// @vitest-environment happy-dom
// Drives each short game to the end with fake timers and a fake rAF, and checks its evidence and the pick-out rule.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StepContext, StepModule } from '../../src/steps/contract.ts';
import type { StepResult } from '../../src/engine/types.ts';
import { planeStep } from '../../src/steps/plane.ts';
import { raceStep, LANES } from '../../src/steps/race.ts';
import { moleStep } from '../../src/steps/mole.ts';
import { matchStep, gridLayout, TEXTURES } from '../../src/steps/match.ts';
import { REGISTRY } from '../../src/steps/registry.ts';
import { createGame } from '../../src/steps/gameKit.ts';
import { profileFor } from '../../src/engine/profiles.ts';
import type { PlannedStep } from '../../src/engine/planner.ts';
import { CONTENT } from '../../src/content/index.ts';
import { line } from '../../src/audio/lines.ts';
import { createRng } from '../../src/util/rng.ts';
import { expectSameLook } from './faceCheck.ts';
import { FACE_PALETTE } from '../../src/steps/faces.ts';
import type { FaceSeen } from './faceCheck.ts';
import type { AudioApi } from '../../src/audio/audio.ts';

const T = 'ב';
const NAME = (u: string) => CONTENT.alphabet[u].name;

let said: string[];
let instructions: string[];
let stage: HTMLElement;
let sfx: string[];
let holdSpeech: boolean;
let voice: 'clips' | 'live' | 'none';
let hums: [boolean, number][];
let stops: number;

function makeCtx(step: string, seed = 3, signal?: AbortSignal, band: '3-5' | '6-8' = '3-5'): StepContext {
  const audio = {
    ready: Promise.resolve(),
    say: (t: string) => { said.push(t); return holdSpeech ? new Promise<void>(() => undefined) : Promise.resolve(); },
    stop() { /* not used */ },
    setVoiceVolume() { /* not used */ },
    status: () => voice,
    onStatusChange: () => () => undefined,
  };
  return {
    step: { kind: 'station', step, unitId: T, items: [T + '/name'] } as PlannedStep,
    profile: profileFor(band),
    content: CONTENT,
    rng: createRng(seed),
    stage,
    signal: signal ?? new AbortController().signal,
    audio: audio as unknown as AudioApi,
    sfx: {
      play: (n: string, arg?: number) => { sfx.push(arg === undefined ? n : `${n}:${arg}`); }, setVolume() { /* not used */ },
      engineHum: (on: boolean, ratio: number) => { hums.push([on, ratio]); }, engineStop: () => { stops++; },
    } as unknown as StepContext['sfx'],
    taught: ['מ', 'ל'],
    confusions: () => [],
    setInstruction: (text) => { instructions.push(text); said.push(text); return Promise.resolve(); },
    progress: () => undefined,
  };
}

function start(m: StepModule, ctx: StepContext): { result: () => StepResult | null; p: Promise<StepResult> } {
  let r: StepResult | null = null;
  const p = m.run(ctx);
  void p.then(x => { r = x; });
  return { result: () => r, p };
}

const all = (sel: string) => Array.from(stage.querySelectorAll(sel)) as HTMLElement[];
const one = (sel: string) => stage.querySelector(sel) as HTMLElement;
const tapDown = (el: Element) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
const seq = (el: HTMLElement) => Number(el.dataset.seq);

/** Every text node that holds the target letter sits inside a pick face: no sample, no HUD letter. */
function expectNoSample(): void {
  const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n.textContent ?? '').includes(T)) expect((n.parentElement as HTMLElement).closest('.pick-face')).not.toBeNull();
  }
}

/**
 * Spawns without playing: runs the game for each seed and records every distinct face it draws (a face is new when its
 * key is new), split by whether it holds the target letter.
 */
async function faceStats(m: StepModule, id: string, key: (f: HTMLElement) => string, seeds = 30, ticks = 1200): Promise<{ target: FaceSeen[]; other: FaceSeen[] }> {
  const target: FaceSeen[] = [], other: FaceSeen[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    document.body.replaceChildren();
    stage = document.createElement('div');
    document.body.appendChild(stage);
    said = []; instructions = []; sfx = []; hums = []; stops = 0;
    const ac = new AbortController();
    const run = start(m, makeCtx(id, seed, ac.signal));
    const seen = new Set<string>();
    for (let i = 0; i < ticks && !run.result(); i++) {
      for (const f of all('.pick-face')) {
        if (!f.dataset.bg) continue;
        const k = key(f);
        if (seen.has(k)) continue;
        seen.add(k);
        (f.textContent === T ? target : other).push({ target: f.textContent === T, bg: f.dataset.bg!, scale: Number(f.dataset.scale) });
      }
      await vi.advanceTimersByTimeAsync(100);
    }
    ac.abort();
    await vi.advanceTimersByTimeAsync(10);
  }
  return { target, other };
}

const faceKey = (f: HTMLElement): string => {
  const wrap = f.closest('[data-balloon],[data-disc],[data-hole]') as HTMLElement | null;
  return wrap ? `${wrap.dataset.seq ?? wrap.dataset.hole}:${wrap.dataset.pop ?? ''}` : '';
};

/** Live faces share one class and one style. */
function collectFaces(faces: HTMLElement[], classes: Set<string>, styles: Set<string>): void {
  for (const f of faces) { classes.add(f.className); styles.add(f.getAttribute('style') ?? ''); }
}

beforeEach(() => {
  said = []; instructions = []; sfx = []; hums = []; stops = 0; holdSpeech = false; voice = 'live';
  document.body.replaceChildren();
  stage = document.createElement('div');
  document.body.appendChild(stage);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date', 'performance'] });
});
afterEach(() => { vi.useRealTimers(); });

describe('game asks on screen', () => {
  for (const [id, m] of [['plane', planeStep], ['race', raceStep], ['mole', moleStep]] as const) {
    it(`${id}: with a voice no ask is shown; with no voice and no clips the full ask is shown`, async () => {
      const ac = new AbortController();
      start(m, makeCtx(id, 3, ac.signal));
      await vi.advanceTimersByTimeAsync(50);
      const cap = one('[data-ask]');
      expect(cap.hidden).toBe(true);
      expect(cap.textContent).toBe('');
      expectNoSample();
      ac.abort();
      document.body.replaceChildren(); stage = document.createElement('div'); document.body.appendChild(stage);
      voice = 'none';
      const ac2 = new AbortController();
      start(m, makeCtx(id, 3, ac2.signal));
      await vi.advanceTimersByTimeAsync(50);
      expect(one('[data-ask]').hidden).toBe(false);
      expect(one('[data-ask]').textContent).toBe(line(CONTENT, `${id}.ask`, { name: NAME(T) }));
      ac2.abort();
    });
  }
});

describe('gameKit', () => {
  it('gameKit no longer exports arrowButton', async () => {
    const kit = await import('../../src/steps/gameKit.ts');
    expect('arrowButton' in kit).toBe(false);
  });

  it('game.fail resolves failed once, with its failLine, and leaves no timer or frame', async () => {
    const game = createGame(makeCtx('race'));
    let frames = 0, fired = 0, heard = 0;
    game.loop(() => { frames++; });
    game.later(5000, () => { fired++; });
    game.listen(stage, 'pointerdown', () => { heard++; });
    await vi.advanceTimersByTimeAsync(50);
    const before = frames;
    expect(before).toBeGreaterThan(0);
    const answers = [{ item: T + '/name', ok: true, kind: 'recall' as const, t: 1 }];
    game.fail(answers, 2, 'result.fail');
    game.fail([], 0);
    game.done([], 0);
    const r = await game.result;
    expect(r).toMatchObject({ outcome: 'failed', answers, slips: 2, failLine: 'result.fail' });
    expect(game.over).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(frames).toBe(before);
    expect(fired).toBe(0);
    expect(heard).toBe(0);
    // without a failLine the result carries none
    const g2 = createGame(makeCtx('race'));
    g2.fail([], 0);
    expect('failLine' in await g2.result).toBe(false);
  });
});

describe('registry', () => {
  it('registers the four short games', () => {
    expect(REGISTRY.plane).toBe(planeStep);
    expect(REGISTRY.race).toBe(raceStep);
    expect(REGISTRY.mole).toBe(moleStep);
    expect(REGISTRY.match).toBe(matchStep);
  });
});

// ---- plane ---------------------------------------------------------------------

describe('plane', () => {
  it('plane: targets are drawn like the other letters (colour and scale frequencies, chi-square, >= 300 target faces)', async () => {
    expectSameLook(await faceStats(planeStep, 'plane', faceKey));
  }, 240000);
  const live = () => all('[data-balloon]').filter(b => !b.classList.contains('is-popped') && !b.classList.contains('is-bumped'));
  // an active child: the finger stays on the sky and follows the goal balloon's height (a held drag is steering)
  let fingerDown = false;
  const steer = (goal: HTMLElement) => {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(goal.style.transform);
    if (!m) return;
    const ev = new Event(fingerDown ? 'pointermove' : 'pointerdown', { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
    ev.pointerId = 1; ev.clientX = 200; ev.clientY = Number(m[2]) + 36; // the balloon's centre (72 px tall)
    one('[data-step="plane"]').dispatchEvent(ev);
    fingerDown = true;
  };

  it('pops the named letter, a wrong balloon only bumps (slip), ends after the targets', async () => {
    fingerDown = false;
    const run = start(planeStep, makeCtx('plane'));
    const bumps = new Set<string>();
    const spawns = new Map<number, { lane: number; target: boolean }>();
    const classes = new Set<string>(), styles = new Set<string>();
    for (let i = 0; i < 6000 && !run.result(); i++) {
      const balloons = live();
      for (const b of all('[data-balloon]')) spawns.set(seq(b), { lane: Number(b.dataset.lane), target: b.textContent === T });
      collectFaces(balloons.map(b => b.querySelector('.pick-face') as HTMLElement), classes, styles);
      for (const b of all('[data-balloon].is-bumped')) bumps.add(b.dataset.seq!);
      const goal = bumps.size === 0
        ? balloons.find(b => b.textContent !== T)
        : balloons.filter(b => b.textContent === T).sort((a, b) => seq(a) - seq(b))[0];
      if (goal) steer(goal);
      if (i % 20 === 0) expectNoSample();
      await vi.advanceTimersByTimeAsync(50);
    }
    const r = run.result()!;
    expect(r.outcome).toBe('done');
    expect(r.answers).toHaveLength(profileFor('3-5').plane.targets);
    r.answers.forEach(a => expect(a).toMatchObject({ item: T + '/name', ok: true, kind: 'recall' }));
    expect(bumps.size).toBeGreaterThanOrEqual(1);
    expect(r.slips).toBe(bumps.size);
    expect(classes).toEqual(new Set(['pick-face']));
    expect(instructions[0]).toBe(line(CONTENT, 'plane.ask', { name: NAME(T) }));
    expect(said.filter(s => s === NAME(T)).length).toBe(profileFor('3-5').plane.targets);
    expect(all('[data-slot][data-full]')).toHaveLength(profileFor('3-5').plane.targets);
    // scattered: consecutive targets never share a row and always have another balloon between them
    const order = [...spawns.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    order.forEach((s, k) => { if (k && s.target) expect(order[k - 1].target).toBe(false); });
    const tl = order.filter(s => s.target).map(s => s.lane);
    tl.forEach((l, k) => { if (k) expect(l).not.toBe(tl[k - 1]); });
  });

  it('a wrong balloon plays bad', async () => {
    fingerDown = false;
    const run = start(planeStep, makeCtx('plane'));
    for (let i = 0; i < 6000 && !run.result() && !sfx.includes('bad'); i++) {
      const goal = live().find(b => b.textContent !== T);
      if (goal) steer(goal);
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(sfx).toContain('bad');
    expect(sfx).not.toContain('bonk');
  });

  it('drag moves the plane to the finger height and measures the arena only on pointerdown', async () => {
    start(planeStep, makeCtx('plane'));
    const arena = one('[data-step="plane"]');
    const fire = (type: string, y: number) => {
      const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
      ev.pointerId = 1; ev.clientX = 200; ev.clientY = y;
      arena.dispatchEvent(ev);
    };
    const spy = vi.spyOn(arena, 'getBoundingClientRect');
    fire('pointerdown', 100);
    expect(spy).toHaveBeenCalledTimes(1);
    fire('pointermove', 250); fire('pointermove', 330); fire('pointermove', 400);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(one('[data-plane]').dataset.lane).toBe('2');
    fire('pointerup', 400);
  });

  it('plane: its lowest point leaves the finger zone (25% of the stage height) on tall and wide stages', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    for (const [w, hh, extra] of [[390, 700, 0], [800, 400, 0], [390, 600, 0], [390, 700, 150]]) {
      const top = 88; // the header above the stage; a stage may run below the screen (extra px)
      rect.mockReturnValue({ width: w, height: hh + extra, left: 0, top, right: w, bottom: top + hh + extra, x: 0, y: top, toJSON: () => ({}) } as DOMRect);
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: top + hh });
      document.body.replaceChildren();
      stage = document.createElement('div');
      document.body.appendChild(stage);
      const ac = new AbortController();
      start(planeStep, makeCtx('plane', 3, ac.signal));
      const arena = one('[data-step="plane"]');
      const ev = new Event('pointerdown', { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
      ev.pointerId = 1; ev.clientX = 100; ev.clientY = top + hh - 5; // a finger at the very bottom of the visible stage
      arena.dispatchEvent(ev);
      await vi.advanceTimersByTimeAsync(2500);
      const y = Number(/translate\([-\d.]+px,\s*([-\d.]+)px\)/.exec(one('[data-plane]').style.transform)![1]) + 35;
      expect(y + 35 + 4, `${w}x${hh}`).toBeLessThanOrEqual(hh * 0.75 + 2); // plane bottom (bobbing 4 px) above the zone
      ac.abort();
      await vi.advanceTimersByTimeAsync(10);
    }
    rect.mockRestore();
  });

  it('plane: losing the pointer capture releases the steering like a pointerup', async () => {
    start(planeStep, makeCtx('plane'));
    const arena = one('[data-step="plane"]');
    const fire = (type: string, y: number) => {
      const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
      ev.pointerId = 1; ev.clientX = 200; ev.clientY = y;
      arena.dispatchEvent(ev);
    };
    fire('pointerdown', 100);
    expect(one('[data-plane]').dataset.lane).toBe('0');
    fire('lostpointercapture', 100);
    fire('pointermove', 400); // no longer steering
    expect(one('[data-plane]').dataset.lane).toBe('0');
  });

  it('a plane nobody steers still finishes (stars and praise), but a passive pop records no answer', async () => {
    const run = start(planeStep, makeCtx('plane', 11));
    for (let i = 0; i < 600 && !run.result(); i++) await vi.advanceTimersByTimeAsync(500);
    const r = run.result()!;
    expect(r.outcome).toBe('done');
    expect(r.answers).toEqual([]);
    expect(all('[data-slot][data-full]')).toHaveLength(profileFor('3-5').plane.targets);
  });

  it('a finger held on the sky is active steering: every pop is a recall answer', async () => {
    const run = start(planeStep, makeCtx('plane', 11));
    const arena = one('[data-step="plane"]');
    const ev = new Event('pointerdown', { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
    ev.pointerId = 1; ev.clientX = 200; ev.clientY = 270; // the middle row, never lifted
    arena.dispatchEvent(ev);
    for (let i = 0; i < 600 && !run.result(); i++) await vi.advanceTimersByTimeAsync(500);
    const r = run.result()!;
    expect(r.outcome).toBe('done');
    expect(r.answers).toHaveLength(profileFor('3-5').plane.targets);
    r.answers.forEach(a => expect(a).toMatchObject({ item: T + '/name', ok: true, kind: 'recall' }));
  });

  it('plane: no buttons in the arena; a held finger keeps steering and keys move one row', async () => {
    start(planeStep, makeCtx('plane'));
    const arena = one('[data-step="plane"]');
    expect(arena.querySelectorAll('button, [data-move]')).toHaveLength(0);
    const fire = (type: string, y: number) => {
      const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
      ev.pointerId = 1; ev.clientX = 200; ev.clientY = y;
      arena.dispatchEvent(ev);
    };
    const lane = () => Number(one('[data-plane]').dataset.lane);
    const planeY = () => Number(/translate\([-\d.]+px,\s*([-\d.]+)px\)/.exec(one('[data-plane]').style.transform)![1]) + 35;
    // a finger pressed low and held still: the plane eases down to its lowest spot (above the finger zone) and stays
    const lowest = 600 * 0.75 - 35;
    fire('pointerdown', 520);
    await vi.advanceTimersByTimeAsync(1500);
    expect(lane()).toBe(2);
    expect(Math.abs(planeY() - lowest)).toBeLessThan(12);
    await vi.advanceTimersByTimeAsync(1000);
    expect(Math.abs(planeY() - lowest)).toBeLessThan(12);
    fire('pointerup', 520);
    // keys move the target one row, clamped at both ends
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(lane()).toBe(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(lane()).toBe(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(lane()).toBe(1);
  });

  it('abort resolves aborted, records nothing and leaves no timer or frame', async () => {
    const ac = new AbortController();
    const run = start(planeStep, makeCtx('plane', 3, ac.signal));
    await vi.advanceTimersByTimeAsync(3000);
    ac.abort();
    const r = await run.p;
    expect(r).toMatchObject({ outcome: 'aborted', answers: [], slips: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ---- race ----------------------------------------------------------------------

describe('race', () => {
  it('race: targets are drawn like the other letters (colour and scale frequencies, chi-square, >= 300 target faces)', async () => {
    expectSameLook(await faceStats(raceStep, 'race', faceKey, 40)); // 40 seeds: the denser 13-20 slots changed the sample and 20 seeds landed at 0.0601 on a 0.06 bound
  }, 240000);
  const arena = () => one('[data-step="race"]');
  const carX = () => Number(one('[data-car]').dataset.x);
  const carSeg = () => Number(arena().dataset.seg);
  const raceState = () => arena().dataset.state;
  const timerText = () => one('[data-timer] b').textContent;
  const at = (type: string, clientX: number, clientY = 300, id = 1) =>
    arena().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX, clientY, pointerId: id }));
  /** The finger x (390 px test stage) that steers the car to road position p. */
  const fingerAt = (p: number) => 195 + (p / 0.8) * 195;
  const isTarget = (el: HTMLElement) => el.hasAttribute('data-disc') && el.textContent === T;
  const isWrong = (el: HTMLElement) => el.hasAttribute('data-disc') && el.textContent !== T;
  const isCone = (el: HTMLElement) => el.hasAttribute('data-cone');
  /** The nearest item still ahead of the car (and past minSeg) that matches. */
  const ahead = (pred: (el: HTMLElement) => boolean, minSeg = 0) => all('[data-disc],[data-cone]')
    .filter(el => !el.dataset.leaving && pred(el) && Number(el.dataset.seg) > Math.max(carSeg(), minSeg))
    .sort((a, b) => Number(a.dataset.seg) - Number(b.dataset.seg))[0] as HTMLElement | undefined;
  const got = () => all('[data-slot][data-full]').length;
  const untilPlay = async () => { for (let i = 0; i < 200 && raceState() !== 'play'; i++) await vi.advanceTimersByTimeAsync(50); };
  /** An active child: the finger stays down and slides to the lane of the next target. */
  async function driveToTargets(run: { result: () => StepResult | null }, until: () => boolean = () => false): Promise<void> {
    let down = false;
    for (let t = 0; t < 120000 && !run.result() && !until(); t += 50) {
      const goal = ahead(isTarget);
      at(down ? 'pointermove' : 'pointerdown', fingerAt(goal ? LANES[Number(goal.dataset.lane)] : 0));
      down = true;
      await vi.advanceTimersByTimeAsync(50);
    }
  }
  /** Steers onto the next matching item and returns it once the car has hit it. */
  async function hitNext(pred: (el: HTMLElement) => boolean): Promise<HTMLElement> {
    await untilPlay();
    await vi.advanceTimersByTimeAsync(3000); // up to speed
    let goal: HTMLElement | undefined;
    for (let i = 0; i < 400 && !goal; i++) { goal = ahead(pred); if (!goal) await vi.advanceTimersByTimeAsync(50); }
    expect(goal).toBeDefined();
    at('pointerdown', fingerAt(LANES[Number(goal!.dataset.lane)]));
    for (let i = 0; i < 2000 && !goal!.classList.contains('is-hit'); i++) await vi.advanceTimersByTimeAsync(16);
    expect(goal!.classList.contains('is-hit')).toBe(true);
    return goal!;
  }

  it('race: the car\'s drawn bottom sits at 33% of the VISIBLE stage height above the visible bottom, even when the stage runs below the screen (owner 2026-11-21)', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    const savedInner = window.innerHeight;
    // [width, visible stage height, how far the stage extends below the screen]; an 88 px header sits above the stage
    for (const [w, vis, extra] of [[390, 700, 0], [800, 400, 0], [390, 700, 150], [800, 400, 90]]) {
      const top = 88;
      rect.mockReturnValue({ width: w, height: vis + extra, left: 0, top, right: w, bottom: top + vis + extra, x: 0, y: top, toJSON: () => ({}) } as DOMRect);
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: top + vis });
      document.body.replaceChildren();
      stage = document.createElement('div');
      document.body.appendChild(stage);
      const ac = new AbortController();
      start(raceStep, makeCtx('race', 3, ac.signal));
      await vi.advanceTimersByTimeAsync(50);
      const car = one('[data-car]');
      const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(car.style.transform)!;
      const carW = parseFloat(car.style.width) / 1.14;
      const bottom = Number(m[2]) + carW * 0.67; // where the wheels touch the road, from the stage top
      const frac = (vis - bottom) / vis;
      expect(Math.abs(frac - 0.33), `${w}x${vis}+${extra}`).toBeLessThanOrEqual(0.02);
      ac.abort();
      await vi.advanceTimersByTimeAsync(10);
    }
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: savedInner });
    rect.mockRestore();
  });

  it('race: steering reads the cached stage rect (not one per pointermove) and re-reads it on resize', async () => {
    start(raceStep, makeCtx('race'));
    await vi.advanceTimersByTimeAsync(50);
    const spy = vi.spyOn(arena(), 'getBoundingClientRect');
    at('pointerdown', 100);
    const afterDown = spy.mock.calls.length;
    for (let x = 100; x < 300; x += 10) at('pointermove', x);
    expect(spy.mock.calls.length).toBe(afterDown);
    window.dispatchEvent(new Event('resize'));
    expect(spy.mock.calls.length).toBeGreaterThan(afterDown);
    const n = spy.mock.calls.length;
    window.dispatchEvent(new Event('orientationchange'));
    expect(spy.mock.calls.length).toBeGreaterThan(n);
  });

  it('race: nothing draws from ctx.rng after the road is dealt, and the moving items are promoted layers', async () => {
    const ctx = makeCtx('race', 3);
    let draws = 0;
    for (const k of ['next', 'int', 'pick', 'shuffle'] as const) {
      const orig = ctx.rng[k] as (...a: unknown[]) => unknown;
      (ctx.rng as unknown as Record<string, unknown>)[k] = (...a: unknown[]) => { draws++; return orig(...a); };
    }
    const run = start(raceStep, ctx);
    const setup = draws;
    expect(setup).toBeGreaterThan(0);
    await driveToTargets(run, () => got() >= 3);
    expect(draws).toBe(setup);
    expect(all('[data-leaf]').length).toBeGreaterThan(0);
    expect(all('[data-burst]').length).toBeGreaterThan(0);
    for (const el of all('[data-disc],[data-cone],[data-car],[data-leaf],[data-burst]')) expect(el.style.willChange, el.outerHTML.slice(0, 40)).toBe('transform');
  }, 60000);

  it('collects the named letter by overlap at the car\'s segment (|off - carPos| < 0.3)', async () => {
    const ac = new AbortController();
    start(raceStep, makeCtx('race', 3, ac.signal));
    await untilPlay();
    let goal: HTMLElement | undefined;
    for (let i = 0; i < 400 && !goal; i++) { goal = ahead(isTarget); if (!goal) await vi.advanceTimersByTimeAsync(50); }
    const lane = Number(goal!.dataset.lane), seg = Number(goal!.dataset.seg);
    // park the car 0.2 beside the letter's lane centre: still overlapping
    at('pointerdown', fingerAt(LANES[lane] + (lane === 2 ? -0.2 : 0.2)));
    let hitSeg = -1, hitX = NaN;
    for (let i = 0; i < 3000 && hitSeg < 0; i++) {
      await vi.advanceTimersByTimeAsync(16);
      if (goal!.classList.contains('is-collected')) { hitSeg = carSeg(); hitX = carX(); }
    }
    expect(hitSeg).toBeGreaterThanOrEqual(seg);
    expect(hitSeg).toBeLessThanOrEqual(seg + 1);
    expect(Math.abs(LANES[lane] - hitX)).toBeLessThan(0.3);
    expect(Math.abs(LANES[lane] - hitX)).toBeGreaterThan(0.1);
    expect(said).toContain(NAME(T));
    expect(sfx).toContain('good');
    expect(all('[data-slot][data-full]')).toHaveLength(1);
    // a car 0.31 from the next letter's lane centre (between two lanes) does not take it
    let next: HTMLElement | undefined;
    for (let i = 0; i < 400 && !next; i++) { next = ahead(isTarget, seg); if (!next) await vi.advanceTimersByTimeAsync(16); }
    const nl = Number(next!.dataset.lane), nseg = Number(next!.dataset.seg);
    at('pointermove', fingerAt(LANES[nl] + (nl === 2 ? -0.31 : 0.31)));
    for (let i = 0; i < 3000 && carSeg() <= nseg + 2; i++) await vi.advanceTimersByTimeAsync(16);
    expect(carSeg()).toBeGreaterThan(nseg);
    expect(next!.classList.contains('is-collected')).toBe(false);
    expect(all('[data-slot][data-full]')).toHaveLength(1);
    expectNoSample();
    ac.abort();
  });

  it('a wrong letter slows the car for 0.9 s and is a slip, not an answer', async () => {
    const run = start(raceStep, makeCtx('race', 5));
    await hitNext(isWrong);
    const slow = Number(arena().dataset.slow);
    expect(slow).toBeGreaterThan(0.8);
    expect(slow).toBeLessThanOrEqual(0.9);
    expect(sfx).toContain('bump');
    const before = Number(arena().dataset.speed);
    await vi.advanceTimersByTimeAsync(500);
    expect(Number(arena().dataset.slow)).toBeGreaterThan(0.3);
    expect(Number(arena().dataset.slow)).toBeLessThan(0.45);
    expect(Number(arena().dataset.speed)).toBeLessThan(before * 0.7);
    at('pointerup', 195);
    for (let i = 0; i < 2000 && !run.result(); i++) await vi.advanceTimersByTimeAsync(50);
    const r = run.result()!;
    expect(r.slips).toBeGreaterThanOrEqual(1);
    r.answers.forEach(a => expect(a).toMatchObject({ item: T + '/name', ok: true, kind: 'recall' }));
  }, 60000);

  it('a cone slows the car for 1.6 s and is a slip', async () => {
    const run = start(raceStep, makeCtx('race', 5));
    await hitNext(isCone);
    const slow = Number(arena().dataset.slow);
    expect(slow).toBeGreaterThan(1.5);
    expect(slow).toBeLessThanOrEqual(1.6);
    expect(sfx).toContain('bump');
    await vi.advanceTimersByTimeAsync(500);
    expect(Number(arena().dataset.slow)).toBeGreaterThan(1.0);
    expect(Number(arena().dataset.slow)).toBeLessThan(1.15);
    at('pointerup', 195);
    for (let i = 0; i < 2000 && !run.result(); i++) await vi.advanceTimersByTimeAsync(50);
    const r = run.result()!;
    expect(r.slips).toBeGreaterThanOrEqual(1);
    r.answers.forEach(a => expect(a.ok).toBe(true));
  }, 60000);

  it('the timer starts after the countdown, ticks in the last 10 s and stops at the 10th target', async () => {
    const run = start(raceStep, makeCtx('race', 3));
    await vi.advanceTimersByTimeAsync(50);
    expect(raceState()).toBe('count');
    expect(timerText()).toBe('60');
    expect(one('[data-count]').hidden).toBe(false);
    expect(one('[data-count]').textContent).toBe('3');
    // the HUD: ten star slots, smaller when there are more than eight, and no letter
    expect(all('[data-slot]')).toHaveLength(10);
    all('[data-slot]').forEach(sl => { expect(sl.style.width).toBe('24px'); expect(sl.textContent).toBe(''); });
    await vi.advanceTimersByTimeAsync(1500);
    expect(timerText()).toBe('60');
    expect(one('[data-count]').textContent).toBe('2');
    await untilPlay();
    expect(sfx.filter(s => s === 'tick')).toHaveLength(3);
    expect(sfx).toContain('go');
    expect(said).toContain(line(CONTENT, 'race.go'));
    expect(one('[data-count]').hidden).toBe(true);
    const box = one('[data-timer]');
    for (const v of ['border:3px solid #0D2A5C', 'border-radius:16px', 'box-shadow:0 4px 0 #0D2A5C', 'font-weight:900']) expect(box.getAttribute('style')).toContain(v);
    await vi.advanceTimersByTimeAsync(5000);
    expect(Number(timerText())).toBeGreaterThanOrEqual(54);
    expect(Number(timerText())).toBeLessThanOrEqual(56);
    const bg = () => box.style.background.toUpperCase().replace(/\s/g, '');
    expect(bg()).toMatch(/#FFFFFF|RGB\(255,255,255\)/);
    for (let i = 0; i < 2000 && Number(timerText()) > 25; i++) await vi.advanceTimersByTimeAsync(50);
    expect(bg()).toMatch(/#FFF3CD|RGB\(255,243,205\)/);
    expect(sfx.filter(s => s === 'tick')).toHaveLength(3);
    for (let i = 0; i < 2000 && Number(timerText()) > 10; i++) await vi.advanceTimersByTimeAsync(50);
    expect(bg()).toMatch(/#FFCDD2|RGB\(255,205,210\)/);
    for (let i = 0; i < 2000 && !run.result(); i++) await vi.advanceTimersByTimeAsync(50);
    expect(run.result()!.outcome).toBe('failed');
    expect(sfx.filter(s => s === 'tick')).toHaveLength(3 + 10);
    expect(timerText()).toBe('0');

    // an active child: the clock freezes at the 10th letter
    document.body.replaceChildren(); stage = document.createElement('div'); document.body.appendChild(stage);
    const run2 = start(raceStep, makeCtx('race', 3));
    await untilPlay();
    await driveToTargets(run2, () => all('[data-slot][data-full]').length === 10);
    expect(run2.result()).toBeNull();
    const frozen = timerText();
    expect(raceState()).toBe('finish');
    expect(Number(frozen)).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(1500);
    expect(timerText()).toBe(frozen);
  }, 60000);

  it('ten targets show the finish line and the step ends done when the car passes it', async () => {
    const run = start(raceStep, makeCtx('race', 3));
    await untilPlay();
    const finishDrawn = () => all('[data-finish]').some(p => (p.getAttribute('d') ?? '') !== '');
    await driveToTargets(run, () => { if (all('[data-slot][data-full]').length === 10) return true; expect(finishDrawn()).toBe(false); return false; });
    const finishAt = carSeg();
    let seen = false;
    for (let i = 0; i < 400 && !run.result(); i++) { await vi.advanceTimersByTimeAsync(16); if (finishDrawn()) seen = true; }
    const r = run.result()!;
    expect(r.outcome).toBe('done');
    expect(seen).toBe(true);
    expect(carSeg()).toBeGreaterThanOrEqual(finishAt + 39);
    expect(said).toContain(line(CONTENT, 'race.finish'));
    expect(said.filter(s => s === NAME(T))).toHaveLength(10);
    expect(r.answers).toHaveLength(10);
    r.answers.forEach(a => expect(a).toMatchObject({ item: T + '/name', ok: true, kind: 'recall' }));
    expect(instructions[0]).toBe(line(CONTENT, 'race.ask', { name: NAME(T) }));
    expectNoSample();
  }, 60000);

  it('60 s without ten targets resolves failed with failLine race.timeUp and keeps the answers before it', async () => {
    const run = start(raceStep, makeCtx('race', 3));
    await untilPlay();
    at('pointerdown', 195); // a finger held on the middle lane: active, but it misses the other lanes' letters
    let ms = 0;
    for (; ms < 120000 && !run.result(); ms += 50) await vi.advanceTimersByTimeAsync(50);
    const r = run.result()!;
    expect(r).toMatchObject({ outcome: 'failed', failLine: 'race.timeUp' });
    expect(ms).toBeGreaterThanOrEqual(59900);
    expect(ms).toBeLessThanOrEqual(60200);
    expect(r.answers.length).toBeGreaterThanOrEqual(1);
    expect(r.answers.length).toBeLessThan(10);
    expect(r.answers).toHaveLength(all('[data-slot][data-full]').length);
    expect(line(CONTENT, 'race.timeUp')).toBe('נגמר הזמן!');
  }, 60000);

  it('a drag anywhere steers continuously toward the finger', async () => {
    start(raceStep, makeCtx('race'));
    expect(arena().querySelectorAll('button, [data-move]')).toHaveLength(0);
    expect(carX()).toBe(0);
    // a press on the top of the stage steers too, through every position between the lanes
    at('pointerdown', 390, 40);
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) { await vi.advanceTimersByTimeAsync(33); seen.push(carX()); }
    expect(seen.some(x => x > 0.1 && x < 0.6)).toBe(true);
    seen.forEach((x, k) => { if (k) expect(x).toBeGreaterThanOrEqual(seen[k - 1]); });
    expect(Math.max(...seen)).toBeCloseTo(0.8, 2);
    expect(sfx).toContain('lane:2');
    at('pointermove', 100, 500);
    const back: number[] = [];
    for (let i = 0; i < 40; i++) { await vi.advanceTimersByTimeAsync(33); back.push(carX()); }
    expect(back.some(x => x > 0.1 && x < 0.6)).toBe(true);
    expect(back[back.length - 1]).toBeCloseTo((100 - 195) / 195 * 0.8, 2);
    expect(sfx).toContain('lane:1');
    at('pointerup', 100, 500);
    const rest = carX();
    await vi.advanceTimersByTimeAsync(500);
    expect(carX()).toBe(rest);
    // a lost pointer capture lets go too
    at('pointerdown', 390, 300, 2);
    await vi.advanceTimersByTimeAsync(100);
    at('lostpointercapture', 390, 300, 2);
    const lost = carX();
    expect(lost).toBeGreaterThan(rest);
    await vi.advanceTimersByTimeAsync(500);
    expect(carX()).toBe(lost);
    // arrow keys steer while held, at the profile speed
    const sp = profileFor('3-5').race.steerPerSec;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);
    const a = carX();
    expect(a).toBeGreaterThan(lost);
    expect(a - lost).toBeLessThanOrEqual(sp * 0.15);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    const stop = carX();
    await vi.advanceTimersByTimeAsync(300);
    expect(carX()).toBe(stop);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await vi.advanceTimersByTimeAsync(200);
    expect(carX()).toBeLessThan(stop - 0.1);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
  });

  it('a held key lets go when the window loses focus or the page hides (the release never comes)', async () => {
    start(raceStep, makeCtx('race'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);
    window.dispatchEvent(new Event('blur'));
    const a = carX();
    expect(a).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(carX()).toBe(a);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);
    const vis = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
    } finally {
      if (vis) Object.defineProperty(document, 'visibilityState', vis); else delete (document as unknown as Record<string, unknown>).visibilityState;
    }
    const b = carX();
    expect(b).toBeLessThan(a);
    await vi.advanceTimersByTimeAsync(300);
    expect(carX()).toBe(b);
  });

  it('the engine hums while driving, rising with speed (silent during the ask and the countdown)', async () => {
    const ac = new AbortController();
    start(raceStep, makeCtx('race', 3, ac.signal));
    await untilPlay();
    await vi.advanceTimersByTimeAsync(2000);
    const n = hums.findIndex(([on]) => on);
    expect(n).toBeGreaterThan(10); // every 0.1 s, off, during the ask and the countdown
    hums.slice(0, n).forEach(([, r]) => expect(r).toBe(0));
    const driving = hums.slice(n);
    expect(driving.length).toBeGreaterThanOrEqual(15);
    expect(driving.length).toBeLessThanOrEqual(25);
    driving.forEach(([on], k) => { expect(on).toBe(true); if (k) expect(driving[k][1]).toBeGreaterThanOrEqual(driving[k - 1][1]); });
    expect(driving[0][1]).toBeLessThan(0.2);
    expect(driving[driving.length - 1][1]).toBeGreaterThan(0.6);
    expect(driving[driving.length - 1][1]).toBeLessThanOrEqual(1);
    expect(stops).toBe(0);
    ac.abort();
  });

  it('engineStop is called on done, fail and abort', async () => {
    // abort (the back button)
    const ac = new AbortController();
    const r1 = start(raceStep, makeCtx('race', 3, ac.signal));
    await untilPlay();
    await vi.advanceTimersByTimeAsync(2000);
    ac.abort();
    await r1.p;
    expect(stops).toBe(1);
    const n = hums.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(hums.length).toBe(n);
    // fail (the timer runs out)
    stops = 0;
    document.body.replaceChildren(); stage = document.createElement('div'); document.body.appendChild(stage);
    const r2 = start(raceStep, makeCtx('race', 3));
    for (let i = 0; i < 3000 && !r2.result(); i++) await vi.advanceTimersByTimeAsync(50);
    expect(r2.result()!.outcome).toBe('failed');
    expect(stops).toBe(1);
    // done (past the finish line)
    stops = 0;
    document.body.replaceChildren(); stage = document.createElement('div'); document.body.appendChild(stage);
    const r3 = start(raceStep, makeCtx('race', 3));
    await untilPlay();
    await driveToTargets(r3);
    expect(r3.result()!.outcome).toBe('done');
    expect(stops).toBe(1);
  }, 90000);

  it('a child who never steers: a passive pick-up records no answer (stars and the name still come)', async () => {
    const run = start(raceStep, makeCtx('race', 11));
    for (let i = 0; i < 3000 && !run.result(); i++) await vi.advanceTimersByTimeAsync(50);
    const r = run.result()!;
    expect(r.outcome).toBe('failed');
    expect(r.answers).toEqual([]);
    const stars = all('[data-slot][data-full]').length;
    expect(stars).toBeGreaterThanOrEqual(1);
    expect(said.filter(s => s === NAME(T)).length).toBe(stars);
  }, 60000);

  it('a finger held on the road is active steering: every pick-up is a recall answer', async () => {
    const run = start(raceStep, makeCtx('race', 11));
    at('pointerdown', 195); // the middle lane, never lifted
    for (let i = 0; i < 3000 && !run.result(); i++) await vi.advanceTimersByTimeAsync(50);
    const r = run.result()!;
    const stars = all('[data-slot][data-full]').length;
    expect(stars).toBeGreaterThanOrEqual(1);
    expect(r.answers).toHaveLength(stars);
    r.answers.forEach(a => expect(a).toMatchObject({ item: T + '/name', ok: true, kind: 'recall' }));
  }, 60000);

  it('steering long before a pick-up does not count: the window is 1.5 s', async () => {
    const run = start(raceStep, makeCtx('race', 11));
    await untilPlay();
    at('pointerdown', 195); at('pointerup', 195); // one touch before the first letter comes
    let firstAt = -1;
    for (let i = 0; i < 3000 && !run.result(); i++) {
      await vi.advanceTimersByTimeAsync(50);
      if (firstAt < 0 && all('[data-slot][data-full]').length) firstAt = i * 50;
    }
    expect(firstAt).toBeGreaterThan(1500);
    expect(run.result()!.answers).toEqual([]);
  }, 60000);

  it('decoration: 12 falling leaves and an 18-dot burst on a pick-up; none when motion is reduced', async () => {
    for (const reduce of [false, true]) {
      document.body.replaceChildren(); stage = document.createElement('div'); document.body.appendChild(stage);
      const mm = vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: reduce && q.includes('reduce'), media: q } as MediaQueryList));
      try {
        const ac = new AbortController();
        const run = start(raceStep, makeCtx('race', 3, ac.signal));
        expect(all('[data-leaf]')).toHaveLength(reduce ? 0 : 12);
        await untilPlay();
        await driveToTargets(run, () => all('[data-slot][data-full]').length >= 1);
        expect(all('[data-burst]')).toHaveLength(reduce ? 0 : 18);
        ac.abort();
        await run.p;
      } finally { mm.mockRestore(); }
    }
  });

  it('abort leaves no timer or frame', async () => {
    const ac = new AbortController();
    const run = start(raceStep, makeCtx('race', 3, ac.signal));
    await vi.advanceTimersByTimeAsync(6000);
    ac.abort();
    expect(await run.p).toMatchObject({ outcome: 'aborted', answers: [], slips: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ---- mole ----------------------------------------------------------------------

describe('mole', () => {
  it('mole: targets are drawn like the other letters (colour and scale frequencies, chi-square, >= 300 target faces)', async () => {
    expectSameLook(await faceStats(moleStep, 'mole', faceKey));
  }, 240000);
  it('a hit on the named letter is ok; a wrong letter is a knowledge error; an empty hole is nothing', async () => {
    const run = start(moleStep, makeCtx('mole'));
    const cols = profileFor('3-5').mole.cols;
    const holes = all('[data-hole]');
    expect(holes).toHaveLength(profileFor('3-5').mole.rows * cols);
    let wrong: string | null = null;
    let tappedDown = false;
    const seen = new Set<string>();
    const targetCols: number[] = [];
    const classes = new Set<string>(), styles = new Set<string>();
    for (let i = 0; i < 6000 && !run.result(); i++) {
      const up = holes.filter(h => h.hasAttribute('data-up') && !h.hasAttribute('data-answered'));
      expect(holes.filter(h => h.hasAttribute('data-up')).length).toBeLessThanOrEqual(profileFor('3-5').mole.maxUp);
      collectFaces(up.map(h => h.querySelector('.pick-face') as HTMLElement), classes, styles);
      for (const h of up) {
        const key = holes.indexOf(h) + ':' + h.dataset.pop;
        if (!seen.has(key)) { seen.add(key); if (h.textContent === T) targetCols.push(holes.indexOf(h) % cols); }
      }
      if (!tappedDown) { const d = holes.find(h => !h.hasAttribute('data-up')); if (d) { tapDown(d); tappedDown = true; } }
      if (wrong === null) {
        const w = up.find(h => h.textContent !== T);
        if (w) { wrong = w.textContent; tapDown(w); tapDown(w); }
      }
      const t = up.find(h => h.textContent === T);
      if (t) { tapDown(t); tapDown(t); }
      if (i % 20 === 0) expectNoSample();
      await vi.advanceTimersByTimeAsync(50);
    }
    const r = run.result()!;
    expect(r.outcome).toBe('done');
    expect(wrong).not.toBeNull();
    expect(r.answers.filter(a => !a.ok)).toEqual([expect.objectContaining({ item: T + '/name', ok: false, kind: 'recall', chose: wrong })]);
    expect(r.answers.filter(a => a.ok)).toHaveLength(profileFor('3-5').mole.targets);
    r.answers.filter(a => a.ok).forEach(a => expect(a).toMatchObject({ item: T + '/name', kind: 'recall' }));
    expect(r.slips).toBe(0);
    expect(said).toContain(line(CONTENT, 'find.wrong', { name: NAME(wrong!) }));
    expect(instructions[0]).toBe(line(CONTENT, 'mole.ask', { name: NAME(T) }));
    expect(classes).toEqual(new Set(['pick-face']));
    targetCols.forEach((c, k) => { if (k) expect(c).not.toBe(targetCols[k - 1]); });
  });

  it('a third target in a row plays combo 3', async () => {
    const run = start(moleStep, makeCtx('mole'));
    const holes = all('[data-hole]');
    for (let i = 0; i < 6000 && !run.result(); i++) {
      const t = holes.find(h => h.hasAttribute('data-up') && !h.hasAttribute('data-answered') && h.textContent === T);
      if (t) tapDown(t);
      await vi.advanceTimersByTimeAsync(50);
    }
    const targets = profileFor('3-5').mole.targets;
    expect(sfx.filter(n => n.startsWith('combo'))).toEqual(Array.from({ length: targets - 2 }, (_, k) => `combo:${k + 3}`));
    expect(sfx).not.toContain('bad');
    // every tap of a raised mole bonks
    expect(sfx.filter(n => n === 'bonk')).toHaveLength(targets);
  });

  it('a wrong letter resets the streak', async () => {
    const run = start(moleStep, makeCtx('mole'));
    const holes = all('[data-hole]');
    let wrongTapped = false;
    for (let i = 0; i < 6000 && !run.result(); i++) {
      const up = holes.filter(h => h.hasAttribute('data-up') && !h.hasAttribute('data-answered'));
      const w = up.find(h => h.textContent !== T);
      const t = up.find(h => h.textContent === T);
      const hits = sfx.filter(n => n === 'good').length;
      if (!wrongTapped && hits === 2 && w) { tapDown(w); wrongTapped = true; }
      else if (t && (wrongTapped || hits < 2)) tapDown(t);
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(wrongTapped).toBe(true);
    expect(sfx).not.toContain('combo:3');
  });

  // with the 6-8 timing a third target rarely comes up before the first is down; long, uneven up times make it the common case
  it('6-8 (maxUp 3): two up, untapped targets never share a column, even with long, uneven up times', async () => {
    const p = { ...profileFor('6-8').mole, upMs: [2000, 12000] as [number, number] };
    for (let seed = 1; seed <= 30; seed++) {
      document.body.replaceChildren(); stage = document.createElement('div'); document.body.appendChild(stage);
      const ac = new AbortController();
      const ctx = makeCtx('mole', seed, ac.signal, '6-8');
      ctx.profile = { ...ctx.profile, mole: p };
      start(moleStep, ctx);
      const holes = all('[data-hole]');
      let maxTargetsUp = 0;
      for (let i = 0; i < 2400; i++) {
        const cols = holes.map((h, k) => ({ h, k })).filter(x => x.h.hasAttribute('data-up') && !x.h.hasAttribute('data-answered') && x.h.textContent === T).map(x => x.k % p.cols);
        maxTargetsUp = Math.max(maxTargetsUp, cols.length);
        expect(new Set(cols).size).toBe(cols.length);
        await vi.advanceTimersByTimeAsync(50);
      }
      expect(maxTargetsUp).toBeGreaterThanOrEqual(2);
      ac.abort();
    }
  });

  it('after a wrong pick, other wrong taps are locked only briefly, and an ignored tap still sounds bad', async () => {
    holdSpeech = true; // the explanation never reports an end: the lock must not wait for it
    const run = start(moleStep, makeCtx('mole', 5));
    const holes = all('[data-hole]');
    let phase = 0, at = 0;
    for (let i = 0; i < 8000 && !run.result(); i++) {
      const up = holes.filter(h => h.hasAttribute('data-up') && !h.hasAttribute('data-answered'));
      const wrong = up.filter(h => h.textContent !== T);
      if (phase === 0 && wrong.length >= 2) { tapDown(wrong[0]); tapDown(wrong[1]); phase = 1; at = Date.now(); }
      else if (phase === 1 && Date.now() - at >= 600 && wrong.length) { tapDown(wrong[0]); phase = 2; }
      else if (phase === 2) { const t = up.find(h => h.textContent === T); if (t) tapDown(t); }
      await vi.advanceTimersByTimeAsync(50);
    }
    const r = run.result()!;
    expect(phase).toBe(2);
    expect(r.outcome).toBe('done');
    expect(r.answers.filter(a => !a.ok)).toHaveLength(2);
    expect(sfx.filter(n => n === 'bad')).toHaveLength(3);
  });

  it('abort resolves aborted and leaves no timer or frame', async () => {
    const ac = new AbortController();
    const run = start(moleStep, makeCtx('mole', 3, ac.signal));
    await vi.advanceTimersByTimeAsync(4000);
    ac.abort();
    expect(await run.p).toMatchObject({ outcome: 'aborted', answers: [], slips: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ---- match ---------------------------------------------------------------------

describe('match', () => {
  const cards = () => all('[data-card]').filter(c => !c.hasAttribute('data-matched'));
  const sameKind = (a: HTMLElement, b: HTMLElement) => a.dataset.letter === b.dataset.letter && a.dataset.texture === b.dataset.texture;
  const clearRound = async () => {
    for (let guard = 0; guard < 20 && cards().length; guard++) {
      const c = cards();
      const a = c[0], b = c.slice(1).find(x => sameKind(a, x))!;
      a.click(); b.click();
      await vi.advanceTimersByTimeAsync(1000);
    }
  };
  const lookAlike = CONTENT.lookAlikes[T][0];

  it('a pair needs the same letter and texture', async () => {
    const run = start(matchStep, makeCtx('match'));
    await vi.advanceTimersByTimeAsync(10);
    expect(instructions[0]).toBe(line(CONTENT, 'match.ask1'));
    const first = cards();
    expect(first).toHaveLength(profileFor('3-5').match.pairs * 2);
    expect(new Set(first.map(c => c.className))).toEqual(new Set(['pick-face']));
    expectNoSample();
    const tgt = first.find(c => c.textContent === T)!;
    const mate = first.find(c => c !== tgt && sameKind(tgt, c))!;
    tgt.click(); mate.click(); mate.click(); // the third tap lands during feedback: ignored
    expect(sfx).toContain('good');
    await vi.advanceTimersByTimeAsync(1000);
    expect(tgt.hasAttribute('data-matched')).toBe(true);
    await clearRound();
    await vi.advanceTimersByTimeAsync(2000);
    expect(cards().filter(c => c.textContent === lookAlike)).toHaveLength(4);
    await clearRound();
    await vi.advanceTimersByTimeAsync(3000);
    const r = run.result()!;
    expect(r.outcome).toBe('done');
    expect(r.answers).toHaveLength(4);
    expect(r.answers.every(a => a.ok && a.kind === 'match')).toBe(true);
    expect(r.slips).toBe(0);
  });

  it('same letter, other texture: no answer', async () => {
    const run = start(matchStep, makeCtx('match'));
    await vi.advanceTimersByTimeAsync(10);
    const c = cards();
    const a = c.find(x => x.textContent === T)!;
    const b = c.find(x => x.textContent === T && x.dataset.texture !== a.dataset.texture)!;
    a.click(); b.click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(a.hasAttribute('data-matched')).toBe(false);
    expect(sfx).toContain('bad');
    await clearRound();
    await vi.advanceTimersByTimeAsync(2000);
    await clearRound();
    await vi.advanceTimersByTimeAsync(3000);
    expect(run.result()!.answers.map(x => x.ok)).toEqual([true, true, true, true]);
  });

  it('the target with another letter: an error with chose', async () => {
    const run = start(matchStep, makeCtx('match'));
    await vi.advanceTimersByTimeAsync(10);
    const c = cards();
    const tgt = c.find(x => x.textContent === T)!;
    const other = c.find(x => x.textContent !== T)!;
    tgt.click(); other.click();
    await vi.advanceTimersByTimeAsync(1000);
    const o1 = c.find(x => x.textContent !== T)!;
    const o2 = c.find(x => x.textContent !== T && x.textContent !== o1.textContent)!;
    o1.click(); o2.click(); // two non-target letters: nothing
    await vi.advanceTimersByTimeAsync(1000);
    await clearRound();
    await vi.advanceTimersByTimeAsync(2000);
    await clearRound();
    await vi.advanceTimersByTimeAsync(3000);
    expect(run.result()!.answers.map(a => ({ ok: a.ok, chose: a.chose }))).toEqual([
      { ok: false, chose: other.textContent },
      { ok: true, chose: undefined },
      { ok: true, chose: undefined },
      { ok: true, chose: undefined },
      { ok: true, chose: undefined },
    ]);
  });

  it('four columns of cards >= 60px on a 390px-wide stage', async () => {
    const { cols, cell } = gridLayout(390 - 32, 600, 12);
    expect(cols).toBe(4);
    expect(cell).toBeGreaterThanOrEqual(60);
    expect(4 * cell + 3 * 10).toBeLessThanOrEqual(390 - 32);
    start(matchStep, makeCtx('match'));
    await vi.advanceTimersByTimeAsync(10);
    const grid = one('[data-round]');
    expect(grid.dataset.cols).toBe('4');
    expect(Number(grid.dataset.cell)).toBeGreaterThanOrEqual(60);
    expect(grid.style.gridTemplateColumns).toContain('repeat(4');
  });

  it('the six texture fills are defined once and used by the cards', async () => {
    start(matchStep, makeCtx('match'));
    await vi.advanceTimersByTimeAsync(10);
    for (const id of ['color', 'stripe', 'wave', 'dot']) expect(stage.querySelectorAll(`[id$="-${id}"]`)).toHaveLength(1);
    const texts = all('[data-card] text');
    const used = new Set(texts.map(t => t.getAttribute('data-fill')));
    expect(used.size).toBe(3);
    for (const u of used) expect(TEXTURES).toContain(u);
    for (const t of texts) {
      const f = t.getAttribute('fill')!;
      if (f.startsWith('url(')) expect(stage.querySelectorAll('#' + f.slice(5, -1))).toHaveLength(1);
    }
  });

  it('round 2 says match.ask2 with the look-alike', async () => {
    start(matchStep, makeCtx('match'));
    await vi.advanceTimersByTimeAsync(10);
    await clearRound();
    await vi.advanceTimersByTimeAsync(2000);
    expect(instructions[1]).toBe(line(CONTENT, 'match.ask2', { name: NAME(lookAlike) }));
  });

  it('abort leaves no timer', async () => {
    const ac = new AbortController();
    const run = start(matchStep, makeCtx('match', 3, ac.signal));
    await vi.advanceTimersByTimeAsync(100);
    const c = cards();
    c[0].click(); c.slice(1).find(x => sameKind(c[0], x))!.click();
    ac.abort();
    expect(await run.p).toMatchObject({ outcome: 'aborted', answers: [], slips: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cards are white and carry their colour look on the border; every glyph has the same size', async () => {
    const ref = document.createElement('div');
    const norm = (v: string) => { ref.style.borderColor = ''; ref.style.borderColor = v; return ref.style.borderColor; };
    const white = norm('#FFFFFF');
    start(matchStep, makeCtx('match'));
    await vi.advanceTimersByTimeAsync(10);
    const cs = cards();
    expect(cs.length).toBe(12);
    for (const c of cs) {
      ref.style.background = '#FFFFFF';
      expect(c.style.background).toBe(ref.style.background);
      expect(c.style.borderColor).toBe(norm(c.dataset.bg!));
      expect(c.style.borderWidth || c.getAttribute('style')).toMatch(/4px|border:4px/);
      expect(c.dataset.scale).toBe('1');
    }
    const sizes = new Set(all('[data-card] text').map(t => t.getAttribute('font-size')));
    expect(sizes).toEqual(new Set(['86']));
    expect(white).not.toBe('');
    // a selected card gets the navy double ring (no look colour), and goes back to its own colour when tapped again
    const a = cs[0];
    a.click();
    expect(a.style.borderColor).toBe(norm('#0D2A5C'));
    expect(a.style.transform).toBe('scale(1.07)');
    a.click();
    expect(a.style.borderColor).toBe(norm(a.dataset.bg!));
  });

  it('match: the deal needs 6 pairs in every band (three letters x two textures) and rounds come from the profile', () => {
    for (const band of ['3-5', '6-8'] as const) expect(profileFor(band).match.pairs).toBe(6);
  });

  it('pair-mates draw independent colours: they share a colour about as often as chance, never always', async () => {
    let pairs = 0, sameBg = 0;
    for (let seed = 1; seed <= 300; seed++) {
      document.body.replaceChildren();
      stage = document.createElement('div');
      document.body.appendChild(stage);
      const ac = new AbortController();
      start(matchStep, makeCtx('match', seed, ac.signal));
      await vi.advanceTimersByTimeAsync(10);
      const byLetter = new Map<string, HTMLElement[]>();
      for (const c of cards()) { const k = c.dataset.letter! + c.dataset.texture!; byLetter.set(k, [...(byLetter.get(k) ?? []), c]); }
      for (const [, [a, b]] of byLetter) {
        pairs++;
        if (a.dataset.bg === b.dataset.bg) sameBg++;
      }
      ac.abort();
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(pairs).toBeGreaterThanOrEqual(600);
    expect(Math.abs(sameBg / pairs - 1 / FACE_PALETTE.length)).toBeLessThanOrEqual(0.04);
  });
});
