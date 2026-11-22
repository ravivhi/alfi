// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRunner, CURRICULUM, plannerInputFor } from '../../src/ui/runner.ts';
import type { MapStatus } from '../../src/ui/runner.ts';
import { createRouter } from '../../src/ui/router.ts';
import { createAppState } from '../../src/ui/app.ts';
import { bootApp } from '../../src/ui/boot.ts';
import { mountMap } from '../../src/ui/screens/map.ts';
import { mountBreak, fillFraction, REDUCED_STEPS } from '../../src/ui/screens/break.ts';
import { active, addPlay, due, idle, remaining, settle, skip, start } from '../../src/ui/breakClock.ts';
import { memoryKV } from '../../src/store/kv.ts';
import type { KV } from '../../src/store/kv.ts';
import { loadSave, saveNow } from '../../src/store/save.ts';
import { freshSave, newChild } from '../../src/store/schema.ts';
import type { ChildRecord } from '../../src/store/schema.ts';

type BreakFields = Partial<Pick<ChildRecord, 'breakUntil' | 'playedSinceBreakSec' | 'lastPlayAt'>>;
import type { StepModule } from '../../src/steps/contract.ts';
import type { StepResult } from '../../src/engine/types.ts';
import { expandPath } from '../../src/engine/curriculum.ts';
import { sittingStatus } from '../../src/engine/planner.ts';
import { SLICE_STEPS } from '../../src/engine/profiles.ts';
import type { AudioApi } from '../../src/audio/audio.ts';
import { line } from '../../src/audio/lines.ts';
import { CONTENT } from '../../src/content/index.ts';

const TODAY = '2026-11-21';
const T0 = Date.UTC(2026, 10, 21, 9);
const MIN = 60_000;
const tick = () => new Promise<void>(r => setTimeout(r, 0));
const ok = (): StepResult => ({ outcome: 'done', answers: [], slips: 0, ms: 0 });

function fakeAudio() {
  const a = {
    stopped: 0,
    said: [] as string[],
    ready: Promise.resolve(),
    say: async (t: string) => { a.said.push(t); },
    stop() { a.stopped++; },
    setVoiceVolume() { /* not used */ },
    status: () => 'live' as const,
    onStatusChange: () => () => undefined,
  };
  return a;
}

// The break clock is per child: the fields go on the child record.
function seedKV(clock: BreakFields = {}, second = false): KV {
  const kv = memoryKV();
  const save = freshSave();
  save.children.push(Object.assign(newChild('נועה', 4, null, TODAY, 'c0'), clock));
  if (second) save.children.push(newChild('דנה', 5, null, TODAY, 'c1'));
  saveNow(kv, save, 0, 1);
  return kv;
}

// A runner on a fake clock; each scripted step may move the clock (play time) before it returns.
function harness(o: { kv?: KV; stepMs?: number[] } = {}) {
  const kv = o.kv ?? seedKV();
  let now = T0;
  const root = document.createElement('div');
  const mapCalls: (MapStatus | undefined)[] = [];
  const showMap = (s?: MapStatus) => {
    mapCalls.push(s);
    router.show('map', r => { const d = document.createElement('div'); d.setAttribute('data-screen', 'map'); r.appendChild(d); return () => undefined; });
  };
  const router = createRouter(root, { station: () => showMap(), end: () => showMap(), break: () => showMap() });
  const app = createAppState(kv, null, 1, { fetchIndex: async () => null });
  const audio = fakeAudio();
  app.audio = audio as unknown as AudioApi;
  const stepMs = [...(o.stepMs ?? [])];
  const t = {
    app, audio, router, root, kv, mapCalls,
    stepsStarted: 0,
    stepsDone: 0,
    ids: [] as string[],
    advance: (ms: number) => { now += ms; },
    now: () => now,
    start: () => { void runner.start('c0'); },
    /** The continue button of a game's result window (teaching steps flow on with no window). */
    nextBtn: () => root.querySelector('[data-result-choice="continue"]') as HTMLButtonElement | null,
    async settle() { for (let i = 0; i < 40; i++) await tick(); },
  };
  const mod = (id: string): StepModule => ({
    id,
    run: async () => {
      t.stepsStarted++;
      t.ids.push(id);
      now += stepMs.shift() ?? 0;
      t.stepsDone++;
      return ok();
    },
  });
  const registry = Object.fromEntries(SLICE_STEPS.map(id => [id, mod(id)]));
  const runner = createRunner({ app, registry, router, clock: { now: () => now, today: () => TODAY }, showMap });
  return t;
}

function mapFor(clock: BreakFields, now: number) {
  const child = newChild('נועה', 4, null, TODAY, 'c0');
  const input = plannerInputFor(child, TODAY, 1);
  const root = document.createElement('div');
  const audio = fakeAudio();
  const calls = { start: 0 };
  const cleanup = mountMap(root, {
    child, path: expandPath(CURRICULUM, input.band), status: sittingStatus(input), audio, content: CONTENT,
    onStart: () => { calls.start++; }, onParent: () => undefined, width: 390,
    breakUntil: clock.breakUntil ?? null, breakTotalMs: 2 * MIN, now: () => now,
  });
  return { root, audio, calls, cleanup };
}

afterEach(() => { vi.useRealTimers(); });

describe('break clock', () => {
  it('is due after everyMin minutes of play; a break resets the count and ends after lengthMin', () => {
    let b = addPlay(idle(), 599, T0, 2);
    expect(due(b, T0, 10)).toBe(false);
    b = addPlay(b, 1, T0 + 1000, 2);
    expect(due(b, T0 + 1000, 10)).toBe(true);
    b = start(b, T0 + 1000, 2);
    expect(b.playedSec).toBe(0);
    expect(active(b, T0 + 1000 + 2 * MIN - 1)).toBe(true);
    expect(remaining(b, T0 + 1000 + MIN)).toBe(MIN);
    expect(active(b, T0 + 1000 + 2 * MIN)).toBe(false);
    expect(due(b, T0 + 1000 + 2 * MIN, 10)).toBe(false);
  });
  it('a moved-back clock never makes a break longer than its length', () => {
    const b = start(idle(), T0 + 60 * MIN, 2); // started, then the clock went back an hour
    const s = settle(b, T0, 2);
    expect(remaining(s, T0)).toBe(2 * MIN);
  });
  it('skip ends the break and clears the play count', () => {
    const b = skip(start(addPlay(idle(), 700, T0, 2), T0, 2));
    expect(active(b, T0)).toBe(false);
    expect(b.playedSec).toBe(0);
  });
});

describe('breaks', () => {
  it('break starts after 10 minutes of play, only between stations', async () => {
    const t = harness({ stepMs: [11 * MIN] });
    t.start();
    await t.settle();
    // the step ran its full 11 minutes and finished: no break inside it; the break comes before the next station
    expect(t.stepsDone).toBe(1);
    expect(t.router.current()).toBe('break');
    expect(t.stepsStarted).toBe(1);
    expect(t.audio.said).toContain(line(CONTENT, 'break.start'));
    const saved = loadSave(t.kv, null, 0).data.children[0];
    expect(saved.breakUntil).toBe(t.now() + 2 * MIN);
    expect(saved.playedSinceBreakSec).toBe(0);
  });

  it('before 10 minutes there is no break', async () => {
    const t = harness({ stepMs: [9 * MIN] });
    t.start();
    await t.settle();
    expect(t.router.current()).toBe('station');
    expect(t.stepsStarted).toBeGreaterThan(1);
  });

  it('the child cannot start a station during a break', async () => {
    const m = mapFor({ breakUntil: T0 + MIN }, T0);
    const next = m.root.querySelector('.node-next') as HTMLElement;
    expect(next.classList.contains('on-break')).toBe(true);
    expect(next.classList.contains('alfi-glow')).toBe(false);
    expect(next.querySelector('[data-break-ring]')).not.toBeNull();
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(next.getAttribute('aria-label')).toBe('הפסקה - עוד מעט ממשיכים');
    next.click();
    expect(m.calls.start).toBe(0);
    expect(m.audio.said[m.audio.said.length - 1]).toBe(line(CONTENT, 'break.start'));
    m.cleanup();
    // the runner itself also refuses: a start during a break shows the break screen, no step
    const t = harness({ kv: seedKV({ breakUntil: T0 + MIN, playedSinceBreakSec: 0, lastPlayAt: T0 }) });
    t.start();
    await t.settle();
    expect(t.router.current()).toBe('break');
    expect(t.stepsStarted).toBe(0);
  });

  it('when the break ends on the map, the station glows again and break.end is said', () => {
    vi.useFakeTimers();
    let now = T0;
    const child = newChild('נועה', 4, null, TODAY, 'c0');
    const input = plannerInputFor(child, TODAY, 1);
    const root = document.createElement('div');
    const audio = fakeAudio();
    let starts = 0;
    mountMap(root, {
      child, path: expandPath(CURRICULUM, input.band), status: 'ready', audio, content: CONTENT,
      onStart: () => { starts++; }, onParent: () => undefined, width: 390,
      breakUntil: T0 + MIN, breakTotalMs: 2 * MIN, now: () => now,
    });
    now += MIN;
    vi.advanceTimersByTime(MIN);
    const next = root.querySelector('.node-next') as HTMLElement;
    expect(next.classList.contains('alfi-glow')).toBe(true);
    expect(next.querySelector('[data-break-ring]')).toBeNull();
    expect(next.getAttribute('aria-disabled')).toBeNull();
    expect(next.getAttribute('aria-label')).toBe('התחנה הבאה: האות מ');
    expect(audio.said).toContain(line(CONTENT, 'break.end'));
    next.click();
    expect(starts).toBe(1);
  });

  it('a break that falls due at the end of a sitting starts when the end screen is dismissed', async () => {
    // the last of the ten stations takes the play past 10 minutes; the sitting ends on its end screen
    const t = harness({ stepMs: [0, 0, 0, 0, 0, 0, 0, 0, 0, 10 * MIN] });
    t.start();
    for (let i = 0; i < 10; i++) {
      await t.settle();
      t.nextBtn()?.click();
    }
    await t.settle();
    expect(t.router.current()).toBe('end');
    expect(loadSave(t.kv, null, 0).data.children[0].breakUntil ?? null).toBeNull();
    (t.root.querySelector('[data-end=map]') as HTMLElement).click();
    expect(t.router.current()).toBe('map');
    expect(loadSave(t.kv, null, 0).data.children[0].breakUntil).toBe(t.now() + 2 * MIN);
  }, 20_000); // ten stations of real-timer settling (about 15 ms a tick on Windows)

  it('a letter sitting gets its break between two games; after the break the next game follows', async () => {
    // the first game (station 6 of 10, after the paint window) takes the play past 10 minutes
    const t = harness({ stepMs: [0, 0, 0, 0, 0, 10 * MIN] });
    t.start();
    for (let i = 0; i < 6; i++) {
      await t.settle();
      t.nextBtn()?.click();
    }
    await t.settle();
    expect(t.router.current()).toBe('break');
    expect(t.ids).toEqual(['meet', 'find', 'drive', 'paint', 'firstSound', 'plane']);
    expect(loadSave(t.kv, null, 0).data.children[0].progress.stationsDone).toEqual(['u:מ#0', 'u:מ#1', 'u:מ#2', 'u:מ#3', 'u:מ#4', 'u:מ#5']);
    t.advance(2 * MIN);
    t.start();
    await t.settle();
    expect(t.router.current()).toBe('station');
    expect(t.ids[t.ids.length - 1]).toBe('race');
  }, 20_000);

  it('each child has its own break clock', () => {
    const kv = seedKV({ breakUntil: T0 + MIN, playedSinceBreakSec: 0, lastPlayAt: T0 }, true);
    const clock = { now: () => T0, today: () => TODAY };
    const open = (index: number) => {
      const root = document.createElement('div');
      bootApp({ root, kv, native: null, now: 2, clock, audioDeps: { fetchIndex: async () => null } });
      (root.querySelectorAll('[data-child]')[index] as HTMLElement).click();
      return root.querySelector('.node-next') as HTMLElement;
    };
    expect(open(0).classList.contains('on-break')).toBe(true);
    const other = open(1);
    expect(other.classList.contains('on-break')).toBe(false);
    expect(other.classList.contains('alfi-glow')).toBe(true);
  });

  it('closing the app does not skip a break', async () => {
    const t = harness({ stepMs: [10 * MIN] });
    t.start();
    await t.settle();
    expect(t.router.current()).toBe('break');
    const until = loadSave(t.kv, null, 0).data.children[0].breakUntil;
    expect(until).toBe(t.now() + 2 * MIN);
    // the app is closed and opened again 30 s later: the map still rests and a tap starts nothing
    const root = document.createElement('div');
    const clock = { now: () => t.now() + 30_000, today: () => TODAY };
    const { router } = bootApp({ root, kv: t.kv, native: null, now: 2, clock, audioDeps: { fetchIndex: async () => null } });
    expect(router.current()).toBe('map');
    const next = root.querySelector('.node-next') as HTMLElement;
    expect(next.classList.contains('on-break')).toBe(true);
    next.click();
    await tick();
    expect(router.current()).toBe('map');
  });

  it('a long absence counts as the break', async () => {
    // 9.5 minutes played, then the app was closed for 5 minutes
    const kv = seedKV({ playedSinceBreakSec: 570, breakUntil: null, lastPlayAt: T0 - 5 * MIN });
    const t = harness({ kv, stepMs: [MIN] });
    t.start();
    await t.settle();
    expect(t.router.current()).toBe('station');
    expect(t.stepsStarted).toBeGreaterThan(1);
    const s = loadSave(kv, null, 0).data.children[0];
    expect(s.playedSinceBreakSec).toBe(60);
    // the pure rule: a gap of at least the break length resets the count
    expect(settle({ playedSec: 590, breakUntil: null, lastPlayAt: T0 }, T0 + 2 * MIN, 2).playedSec).toBe(0);
    expect(settle({ playedSec: 590, breakUntil: null, lastPlayAt: T0 }, T0 + 2 * MIN - 1, 2).playedSec).toBe(590);
  });

  it('parent skip ends the break', () => {
    vi.useFakeTimers();
    const kv = seedKV({ breakUntil: T0 + 2 * MIN, playedSinceBreakSec: 0, lastPlayAt: T0 });
    const root = document.createElement('div');
    const clock = { now: () => T0, today: () => TODAY };
    const { router } = bootApp({ root, kv, native: null, now: 2, clock, audioDeps: { fetchIndex: async () => null } });
    expect((root.querySelector('.node-next') as HTMLElement).classList.contains('on-break')).toBe(true);
    // long press the photo, solve the gate
    (root.querySelector('[aria-label="לחיצה ארוכה: עמוד ההורים"]') as HTMLElement).dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(3000);
    const [a, b] = (root.querySelector('h1')!.textContent as string).match(/\d+/g)!.map(Number);
    (Array.from(root.querySelectorAll('[data-choice]')) as HTMLElement[]).find(x => x.textContent === String(a + b))!.click();
    expect(router.current()).toBe('parent');
    const skipBtn = root.querySelector('[data-skip-break]') as HTMLElement;
    expect(skipBtn).not.toBeNull();
    skipBtn.click();
    expect(root.querySelector('[data-skip-break]')).toBeNull();
    expect(loadSave(kv, null, 0).data.children[0].breakUntil).toBeNull();
    (root.querySelector('[data-parent=close]') as HTMLElement).click();
    expect(router.current()).toBe('map');
    const next = root.querySelector('.node-next') as HTMLElement;
    expect(next.classList.contains('alfi-glow')).toBe(true);
    expect(next.classList.contains('on-break')).toBe(false);
  });
});

describe('break screen', () => {
  it('speaks break.start, fills the circle, then speaks break.end and returns to the map', async () => {
    vi.useFakeTimers();
    let now = T0;
    const root = document.createElement('div');
    const audio = fakeAudio();
    let done = 0;
    mountBreak(root, { audio, content: CONTENT, now: () => now, until: T0 + 2 * MIN, totalMs: 2 * MIN, onDone: () => { done++; }, reducedMotion: false });
    expect(root.querySelector('[data-screen=break]')).not.toBeNull();
    expect(root.querySelectorAll('button').length).toBe(0);
    expect(audio.said).toEqual([line(CONTENT, 'break.start')]);
    const ring = root.querySelector('[data-break-ring]') as HTMLElement;
    expect(Number(ring.getAttribute('data-fill'))).toBe(0);
    now += MIN;
    await vi.advanceTimersByTimeAsync(MIN);
    expect(Number(ring.getAttribute('data-fill'))).toBeCloseTo(0.5, 2);
    expect(done).toBe(0);
    now += MIN;
    await vi.advanceTimersByTimeAsync(MIN);
    expect(audio.said).toEqual([line(CONTENT, 'break.start'), line(CONTENT, 'break.end')]);
    expect(done).toBe(1);
  });

  it('reduced motion: the fill steps instead of animating', () => {
    expect(fillFraction(0.9 * MIN, 2 * MIN, true)).toBe(Math.floor(0.55 * REDUCED_STEPS) / REDUCED_STEPS);
    expect(fillFraction(0.9 * MIN, 2 * MIN, false)).toBeCloseTo(0.55, 5);
    const root = document.createElement('div');
    mountBreak(root, { audio: fakeAudio(), content: CONTENT, now: () => T0 + 0.9 * MIN, until: T0 + 2 * MIN, totalMs: 2 * MIN, onDone: () => undefined, reducedMotion: true });
    expect(root.querySelector('.break-arc.break-steps')).not.toBeNull();
    expect(Number((root.querySelector('[data-break-ring]') as HTMLElement).getAttribute('data-fill'))).toBe(0.375);
  });

  it('leaving the break screen stops its speech and never returns by itself', async () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    const audio = fakeAudio();
    let done = 0;
    let now = T0;
    const off = mountBreak(root, { audio, content: CONTENT, now: () => now, until: T0 + MIN, totalMs: MIN, onDone: () => { done++; } });
    off();
    expect(audio.stopped).toBe(1);
    now += 2 * MIN;
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(done).toBe(0);
  });
});
