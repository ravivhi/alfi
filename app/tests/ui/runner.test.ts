// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { createRunner, MUSIC_GAMES } from '../../src/ui/runner.ts';
import type { MapStatus } from '../../src/ui/runner.ts';
import { mountEnd, END_FLAG } from '../../src/ui/screens/end.ts';
import { createRouter } from '../../src/ui/router.ts';
import { createAppState } from '../../src/ui/app.ts';
import { memoryKV } from '../../src/store/kv.ts';
import type { KV } from '../../src/store/kv.ts';
import { KEYS, parseEnvelope, saveNow } from '../../src/store/save.ts';
import { freshSave, newChild } from '../../src/store/schema.ts';
import type { SaveData } from '../../src/store/schema.ts';
import type { StepModule } from '../../src/steps/contract.ts';
import type { StepResult } from '../../src/engine/types.ts';
import type { PlannedStep } from '../../src/engine/planner.ts';
import { SLICE_STEPS } from '../../src/engine/profiles.ts';
import type { AudioApi } from '../../src/audio/audio.ts';
import { line } from '../../src/audio/lines.ts';
import { CONTENT } from '../../src/content/index.ts';
import { allDone } from '../engine/pathHarness.ts';

const TODAY = '2026-11-21';
// works with real and fake timers (the 60 s window test runs on fake timers)
const tick = (): Promise<unknown> => (vi.isFakeTimers() ? vi.advanceTimersByTimeAsync(1) : new Promise<void>(r => setTimeout(r, 0)));
const ok = (): StepResult => ({ outcome: 'done', answers: [], slips: 0, ms: 0 });
const okAnswers = (items: string[]): StepResult => ({ outcome: 'done', answers: items.map(item => ({ item, ok: true, kind: 'recall' as const, t: Date.now() })), slips: 0, ms: 0 });

function fakeAudio() {
  const a = {
    stopped: false,
    said: [] as string[],
    ready: Promise.resolve(),
    say: async (t: string) => { a.said.push(t); },
    stop() { a.stopped = true; },
    setVoiceVolume() { /* not used */ },
    status: () => 'live' as const,
    onStatusChange: () => () => undefined,
  };
  return a;
}

function setVisible(v: boolean) {
  Object.defineProperty(document, 'visibilityState', { value: v ? 'visible' : 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

interface HarnessOpts {
  results?: StepResult[];
  hangStep?: boolean;
  /** Only this step id never finishes. */
  hangOn?: string;
  /** The child has played long enough that a break is due before the next step. */
  breakDue?: boolean;
  throwingKV?: boolean;
  finishUnit?: boolean;
  /** Runs inside each scripted step; adv moves the fake clock. */
  body?: (adv: (ms: number) => void, step: PlannedStep) => void;
  /** The result for a step; undefined falls back to results / ok(). */
  result?: (step: PlannedStep) => StepResult | undefined;
}

function harness(o: HarnessOpts = {}) {
  const base = memoryKV();
  const save = freshSave();
  save.children.push(newChild('נועה', 4, null, TODAY, 'c0'));
  if (o.breakDue) { save.children[0].playedSinceBreakSec = 99999; save.children[0].lastPlayAt = Date.UTC(2026, 10, 21, 9); }
  saveNow(base, save, 0, 1);

  const saves: SaveData[] = [];
  const saveScreens: string[] = [];
  let failing = false;
  let day = TODAY;
  let now = Date.UTC(2026, 10, 21, 9);
  const root = document.createElement('div');
  const mapCalls: (MapStatus | undefined)[] = [];

  const showMap = (s?: MapStatus) => {
    mapCalls.push(s);
    router.show('map', r => { const d = document.createElement('div'); d.setAttribute('data-screen', 'map'); r.appendChild(d); return () => undefined; });
  };
  const router = createRouter(root, { station: () => showMap(), end: () => showMap() });

  const kv: KV = {
    get: k => base.get(k),
    remove: k => base.remove(k),
    keys: () => base.keys(),
    set: (k, v) => {
      if (failing) throw new Error('quota');
      base.set(k, v);
      if (k === KEYS.primary) {
        const p = parseEnvelope(v);
        if (p.ok) { saves.push(p.data); saveScreens.push(router.current()); }
      }
    },
  };
  failing = !!o.throwingKV;
  const app = createAppState(kv, null, 1, { fetchIndex: async () => null });
  const audio = fakeAudio();
  app.audio = audio as unknown as AudioApi;
  const events: string[] = [];
  app.music = { start: () => { events.push('music:start'); }, stop: () => { events.push('music:stop'); }, duck() { /* not used */ }, setEnabled() { /* not used */ } };

  const results = [...(o.results ?? [])];
  const t = {
    app, audio, events, router, root, mapCalls, saves, saveScreens,
    stepsStarted: 0,
    stepsRun: 0,
    stageFlags: [] as { step: string; fullBleed: string | null }[],
    kinds: [] as string[],
    /** Window taps so far, and per step start: the step, its kind, the taps before it and its run. */
    taps: 0,
    runs: 0,
    starts: [] as { step: string; kind: string; taps: number; run: number; resume?: number }[],
    windowShown: () => root.querySelector('[data-result]') !== null,
    windowKind: () => root.querySelector('[data-result]')?.getAttribute('data-result') ?? null,
    saved: () => saves[saves.length - 1],
    saveCount: () => saves.length,
    setDay: (d: string) => { day = d; },
    /** The next runOneStep starts a new run (as a tap on the map would). */
    newRun: () => { started = false; },
    startStep: () => { started = true; t.runs++; void runner.start('c0'); },
    /** The parent page's "practise this letter now": starts a sitting on the letter and plays its first step. */
    async startLetter(unit: string) {
      started = true;
      t.runs++;
      void runner.startLetter('c0', unit);
      await waitFor(() => router.current() !== 'station' || (t.stepsRun > 0 && t.windowShown()));
    },
    /** Taps a window button ('continue', or 'again' for the two try-again buttons). */
    tap: (choice: 'continue' | 'again' = 'continue') => {
      const b = root.querySelector(`[data-result-choice="${choice}"]`) as HTMLButtonElement | null;
      if (b) { t.taps++; b.click(); }
    },
    tapNext: () => { t.tap('continue'); },
    /** Plays on until the run waits again: a game's window, or another screen. Teaching steps flow on by themselves. */
    async runOneStep(choice: 'continue' | 'again' = 'continue') {
      const before = t.stepsRun;
      if (!started) t.startStep(); else t.tap(choice);
      await waitFor(() => router.current() !== 'station' || (t.stepsRun > before && t.windowShown()));
    },
    /** Plays through the paint window to the first game's window. */
    async toFirstGame() {
      await t.runOneStep();
      await t.runOneStep('continue');
    },
    async runToEnd() {
      for (let i = 0; i < 30 && router.current() !== 'end'; i++) await t.runOneStep();
    },
  };
  const mod = (id: string): StepModule => ({
    id,
    run: async (ctx) => {
      t.stepsStarted++;
      t.kinds.push(ctx.step.kind);
      t.starts.push({ step: id, kind: ctx.step.kind, taps: t.taps, run: t.runs, ...(ctx.resume !== undefined ? { resume: ctx.resume } : {}) });
      t.stageFlags.push({ step: id, fullBleed: root.querySelector('[data-stage]')?.getAttribute('data-fullbleed') ?? null });
      audio.said.push('<' + id + '>');
      events.push('run:' + id);
      if (o.hangStep || o.hangOn === id) return new Promise<StepResult>(() => undefined);
      o.body?.(ms => { now += ms; }, ctx.step);
      const r = o.result?.(ctx.step) ?? results.shift() ?? ok();
      t.stepsRun++;
      return r;
    },
  });
  const registry = Object.fromEntries(SLICE_STEPS.map(id => [id, mod(id)]));
  const runner = createRunner({ app, registry, router, clock: { now: () => now, today: () => day }, showMap });
  let started = false;
  async function waitFor(cond: () => boolean, n = 80) {
    for (let i = 0; i < n && !cond(); i++) await tick();
  }
  return t;
}

describe('runner', () => {
  it('records evidence and saves after each step', async () => {
    const t = harness({ results: [okAnswers(['מ/name'])] });
    await t.runOneStep();
    expect(t.saved().children[0].mastery['מ/name'].attempts.length).toBe(1);
    expect(t.saveCount()).toBe(t.stepsRun);
  });

  it('back during a step stops audio and saves nothing', async () => {
    const t = harness({ hangStep: true });
    t.startStep();
    t.router.back();
    await tick();
    expect(t.audio.stopped).toBe(true);
    expect(t.saveCount()).toBe(0);
    expect(t.router.current()).toBe('map');
  });

  it('save failure sets storageWarning and play continues', async () => {
    const t = harness({ throwingKV: true, results: [ok(), ok()] });
    await t.runOneStep();
    expect(t.app.storageWarning).toBe(true);
    const run = t.stepsRun;
    await t.runOneStep();
    expect(t.stepsRun).toBeGreaterThan(run);
  });

  it("the window's continue fires once on a double tap", async () => {
    const t = harness();
    await t.toFirstGame();
    const started = t.stepsStarted;
    const b = t.root.querySelector('[data-result-choice="continue"]') as HTMLButtonElement;
    b.click();
    b.click();
    for (let i = 0; i < 20; i++) await tick();
    expect(t.stepsStarted).toBe(started + 1);
  });

  it('end screen marks stickers shown only after it is displayed', async () => {
    const t = harness({ finishUnit: true });
    await t.runToEnd();
    expect(t.router.current()).toBe('end');
    expect(t.saved().children[0].progress.stickers.length).toBeGreaterThan(0);
    expect(t.saved().children[0].progress.stickers.every(s => s.shown)).toBe(true);
    // the save before the end screen still had the sticker unshown; the marking save happened on the end screen
    expect(t.saves[t.saves.length - 2].children[0].progress.stickers.every(s => !s.shown)).toBe(true);
    expect(t.saveScreens[t.saveScreens.length - 1]).toBe('end');
    expect(t.root.querySelector('[data-screen=end]')).not.toBeNull();
  });

  it('back on the window returns to the map without another save', async () => {
    const t = harness();
    await t.runOneStep();
    expect(t.windowShown()).toBe(true);
    const saves = t.saveCount();
    const started = t.stepsStarted;
    t.router.back();
    await tick();
    await tick();
    expect(t.router.current()).toBe('map');
    expect(t.windowShown()).toBe(false);
    expect(t.saveCount()).toBe(saves);
    expect(t.stepsStarted).toBe(started);
  });

  it('a complete path: the review sitting ends on map.complete, and the next start opens another review sitting', async () => {
    // the whole path done yesterday: today's review sitting closes like any sitting; review play is unlimited
    const t = harness();
    const done = allDone('2026-11-20');
    t.app.save.children[0].progress = done.progress;
    t.app.save.children[0].mastery = done.mastery;
    await t.runToEnd();
    expect(t.kinds).toContain('review');
    expect(t.audio.said).toContain(line(CONTENT, 'map.complete'));
    expect(t.audio.said).not.toContain(line(CONTENT, 'end.bye'));
    (t.root.querySelector('[data-end=map]') as HTMLElement).click();
    expect(t.router.current()).toBe('map');
    const reviews = t.kinds.filter(k => k === 'review').length;
    t.newRun();
    await t.runToEnd();
    expect(t.kinds.filter(k => k === 'review').length).toBe(reviews + 1);
    expect(t.router.current()).toBe('end');
  });

  it('a practice sitting (a game with no station) is preceded by practice.intro', async () => {
    const t = harness();
    // three letters in three sittings today; the fourth sitting can only be a practice sitting
    for (let k = 0; k < 3; k++) {
      t.newRun();
      await t.runToEnd();
      (t.root.querySelector('[data-end=map]') as HTMLElement).click();
    }
    t.audio.said.length = 0;
    t.newRun();
    await t.runToEnd();
    const games = ['<plane>', '<race>', '<mole>', '<match>', '<jump>'];
    const at = t.audio.said.findIndex(s => games.includes(s));
    expect(at).toBeGreaterThan(0);
    expect(t.audio.said[at - 1]).toBe(line(CONTENT, 'practice.intro'));
  });

  it('after an end screen the next start opens a new sitting the same day', async () => {
    const t = harness();
    await t.runToEnd();
    (t.root.querySelector('[data-end=map]') as HTMLElement).click();
    const started = t.stepsStarted;
    t.newRun();
    await t.runOneStep(); // a warm-up (if any) and the teaching stations flow on to the first game's window
    expect(t.router.current()).toBe('station');
    expect(t.stepsStarted).toBeGreaterThan(started);
    expect(t.kinds[t.kinds.length - 1]).toBe('station');
    expect(t.saved().children[0].progress.unitStartDay['ל']).toBe(TODAY);
  });

  it('a warm-up is preceded by warmup.intro', async () => {
    const t = harness({ finishUnit: true });
    await t.runToEnd();
    t.setDay('2026-11-22');
    t.audio.said.length = 0;
    t.newRun();
    await t.runOneStep();
    const intro = t.audio.said.indexOf(line(CONTENT, 'warmup.intro'));
    expect(intro).toBeGreaterThanOrEqual(0);
    expect(intro).toBeLessThan(t.audio.said.indexOf('<find>'));
  });

  it('adds only visible seconds to today\'s play time', async () => {
    let once = false;
    const t = harness({
      body: adv => { if (once) return; once = true; adv(20_000); setVisible(false); adv(600_000); setVisible(true); adv(10_000); },
    });
    await t.runOneStep();
    setVisible(true);
    expect(t.saved().children[0].playSeconds[TODAY]).toBe(30);
  });

  it('shows the step position on the progress bar', async () => {
    const t = harness({ hangOn: 'meet' });
    t.startStep();
    for (let i = 0; i < 20 && t.stepsStarted === 0; i++) await tick();
    expect(t.root.querySelector('[aria-label="שלב 1 מתוך 10"]')).not.toBeNull();
    // the teaching stations flow on: the paint window is step 4, the first game step 6
    const t2 = harness();
    await t2.runOneStep();
    expect(t2.root.querySelector('[aria-label="שלב 4 מתוך 10"]')).not.toBeNull();
    await t2.runOneStep();
    expect(t2.root.querySelector('[aria-label="שלב 6 מתוך 10"]')).not.toBeNull();
  });
});

describe('runner: result windows', () => {
  const games = ['plane', 'race', 'mole', 'match', 'jump'];
  const failedOnce = (step: string, items: string[]) => {
    let failed = false;
    return (s: PlannedStep): StepResult | undefined => {
      if (s.step !== step) return undefined;
      if (!failed) {
        failed = true;
        return { outcome: 'failed', answers: items.map(item => ({ item, ok: true, kind: 'recall' as const, t: Date.now() })), slips: 0, ms: 0, failLine: 'result.fail' };
      }
      return okAnswers(items);
    };
  };

  it('a finished step shows the success window and nothing advances without a tap', async () => {
    vi.useFakeTimers();
    try {
      const t = harness();
      await t.toFirstGame();
      expect(t.windowKind()).toBe('success');
      expect(t.starts[t.starts.length - 1].step).toBe('plane');
      const started = t.stepsStarted;
      const saves = t.saveCount();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(t.stepsStarted).toBe(started);
      expect(t.saveCount()).toBe(saves);
      expect(t.router.current()).toBe('station');
      expect(t.windowKind()).toBe('success');
      // the idle reminder came once
      expect(t.audio.said.filter(x => x === line(CONTENT, 'result.choose'))).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("runner: a game step's stage is full-bleed, a teaching step's is not", async () => {
    const t = harness();
    await t.runToEnd();
    const game = t.stageFlags.filter(f => ['plane', 'race', 'mole', 'match', 'jump'].includes(f.step));
    const teach = t.stageFlags.filter(f => !['plane', 'race', 'mole', 'match', 'jump'].includes(f.step));
    expect(game.length).toBeGreaterThan(0);
    expect(teach.length).toBeGreaterThan(0);
    game.forEach(f => expect(f.fullBleed).toBe('1'));
    teach.forEach(f => expect(f.fullBleed).toBeNull());
  });

  it('continue goes to the next step', async () => {
    const t = harness();
    await t.runOneStep();
    expect(t.starts.map(s => s.step)).toEqual(['meet', 'find', 'drive', 'paint']);
    await t.runOneStep('continue');
    expect(t.starts.map(s => s.step)).toEqual(['meet', 'find', 'drive', 'paint', 'firstSound', 'plane']);
    await t.runOneStep('continue');
    expect(t.starts.map(s => s.step)).toEqual(['meet', 'find', 'drive', 'paint', 'firstSound', 'plane', 'race']);
    expect(t.windowKind()).toBe('success');
  });

  it('try again after a success replays the same step; its answers reach mastery; the replay adds nothing to stationsDone or sitting.done', async () => {
    const t = harness({ result: s => (s.step === 'plane' ? okAnswers(['מ/name']) : undefined) });
    await t.toFirstGame();
    const p0 = t.saved().children[0].progress;
    const tries = t.saved().children[0].mastery['מ/name'].attempts.length;
    const saves = t.saveCount();
    await t.runOneStep('again');
    expect(t.starts.map(s => s.step).slice(-2)).toEqual(['plane', 'plane']);
    expect(t.windowKind()).toBe('success');
    const child = t.saved().children[0];
    expect(t.saveCount()).toBe(saves + 1);
    expect(child.mastery['מ/name'].attempts.length).toBe(tries + 1);
    expect(child.progress.stationsDone).toEqual(p0.stationsDone);
    expect(child.progress.sitting?.done).toBe(p0.sitting?.done);
    // the replay keeps its place on the progress bar; continue then moves on
    expect(t.root.querySelector('[aria-label="שלב 6 מתוך 10"]')).not.toBeNull();
    await t.runOneStep('continue');
    expect(t.starts[t.starts.length - 1].step).toBe('race');
  });

  it('a failed game keeps the station next, saves the answers given before the fail, and try again replays it', async () => {
    const t = harness({ result: failedOnce('plane', ['מ/name']) });
    await t.toFirstGame();
    expect(t.windowKind()).toBe('failed');
    expect(t.root.querySelectorAll('[data-result-choice]')).toHaveLength(1);
    let child = t.saved().children[0];
    expect(child.progress.stationsDone).toHaveLength(5);
    expect(child.progress.sitting?.done).toBe(5);
    expect(child.mastery['מ/name'].attempts.filter(a => a.ok)).toHaveLength(1);
    expect(t.audio.said).toContain(line(CONTENT, 'result.fail'));
    await t.runOneStep('again');
    expect(t.starts.map(s => s.step).slice(-2)).toEqual(['plane', 'plane']);
    expect(t.windowKind()).toBe('success');
    child = t.saved().children[0];
    expect(child.progress.stationsDone).toHaveLength(6);
    expect(child.progress.sitting?.done).toBe(6);
    expect(child.mastery['מ/name'].attempts.filter(a => a.ok)).toHaveLength(2);
    // back on a failed window: the next start offers the same game again
    const t2 = harness({ result: failedOnce('plane', ['מ/name']) });
    await t2.toFirstGame();
    t2.router.back();
    await tick();
    t2.newRun();
    await t2.runOneStep();
    expect(t2.starts.map(s => s.step).slice(-2)).toEqual(['plane', 'plane']);
  });

  it('try again after a failed game passes its resume point to the step (the dino resumes at its level); a success replay starts fresh', async () => {
    let fails = 0;
    const t = harness({
      result: s => {
        if (s.step !== 'jump') return undefined;
        fails++;
        return fails <= 2 ? { outcome: 'failed', answers: [], slips: 5, ms: 0, failLine: 'jump.noLives', resume: fails } : ok();
      },
    });
    for (let i = 0; i < 12 && !t.starts.some(s => s.step === 'jump'); i++) await t.runOneStep();
    expect(t.windowKind()).toBe('failed');
    await t.runOneStep('again');
    await t.runOneStep('again');
    expect(t.windowKind()).toBe('success');
    await t.runOneStep('again');
    const jumps = t.starts.filter(s => s.step === 'jump');
    expect(jumps.map(s => s.resume)).toEqual([undefined, 1, 2, undefined]);
  });

  it('teaching stations, warm-ups and check-points flow on with no window (owner 2026-11-21: windows only after the five games and the paint station)', async () => {
    const t = harness();
    for (let d = 21; d <= 30 && !t.kinds.includes('checkpoint'); d++) {
      t.setDay(`2026-11-${d}`);
      t.newRun();
      await t.runToEnd();
      if (t.router.current() === 'end') (t.root.querySelector('[data-end=map]') as HTMLElement).click();
    }
    expect(t.kinds).toContain('checkpoint');
    expect(t.kinds).toContain('warmup');
    for (let i = 0; i + 1 < t.starts.length; i++) {
      const a = t.starts[i], b = t.starts[i + 1];
      if (a.run !== b.run) continue;
      // a game waits for a tap on its window; every other step goes straight on
      expect({ step: a.step, kind: a.kind, tapped: b.taps > a.taps }).toEqual({ step: a.step, kind: a.kind, tapped: games.includes(a.step) || a.step === 'paint' });
    }
  });

  it('paint shows the success window and cannot fail', async () => {
    const t = harness();
    await t.runOneStep(); // meet, find and drive flow on; paint ends with the window
    expect(t.starts.map(s => s.step)).toEqual(['meet', 'find', 'drive', 'paint']);
    expect(t.windowKind()).toBe('success');
    expect(t.root.querySelectorAll('[data-result-choice]')).toHaveLength(2); // continue and again, no failed window
    expect(t.events).not.toContain('music:start'); // no background music
    const child = t.saved().children[0];
    expect(child.progress.stationsDone).toEqual(['u:מ#0', 'u:מ#1', 'u:מ#2', 'u:מ#3']); // the station counts as done
    expect(Object.keys(child.mastery)).toEqual([]); // no evidence
    // again paints once more, and still shows the success window; continue goes on to the next station
    await t.runOneStep('again');
    expect(t.starts.map(s => s.step).slice(-2)).toEqual(['paint', 'paint']);
    expect(t.windowKind()).toBe('success');
    expect(t.saved().children[0].progress.stationsDone).toHaveLength(4); // a replay adds nothing
    await t.runOneStep('continue');
    expect(t.starts.map(s => s.step).slice(-2)).toEqual(['firstSound', 'plane']);
    // paint is a window station, not one of the rotated games (it is not full-bleed)
    expect(t.stageFlags.find(f => f.step === 'paint')!.fullBleed).toBeNull();
  });

  it('a break due when the window closes shows the break screen instead of the next step', async () => {
    const t = harness({ body: (adv, step) => { if (step.step === 'plane') adv(40 * 60_000); } });
    await t.toFirstGame();
    expect(t.windowKind()).toBe('success');
    const started = t.stepsStarted;
    t.tap('continue');
    for (let i = 0; i < 20 && t.router.current() === 'station'; i++) await tick();
    expect(t.router.current()).toBe('break');
    expect(t.stepsStarted).toBe(started);
    // the same for "again": the break screen instead of the replay
    const t2 = harness({ body: (adv, step) => { if (step.step === 'plane') adv(40 * 60_000); } });
    await t2.toFirstGame();
    const started2 = t2.stepsStarted;
    t2.tap('again');
    for (let i = 0; i < 20 && t2.router.current() === 'station'; i++) await tick();
    expect(t2.router.current()).toBe('break');
    expect(t2.stepsStarted).toBe(started2);
  });

  it('music stops when the window opens', async () => {
    const t = harness();
    const at: string[] = [];
    t.app.music = { ...t.app.music, start: () => { at.push('start'); }, stop: () => { at.push(t.windowShown() ? 'stop:window' : 'stop'); } };
    await t.startLetter('י'); // meet, find, drive, then the paint window: no melody under it
    expect(t.windowKind()).toBe('success');
    expect(at).not.toContain('start');
    for (let i = 0; i < 6 && !at.includes('start'); i++) await t.runOneStep(); // firstSound, the games, the dino and its window
    expect(t.windowKind()).toBe('success');
    const s = at.lastIndexOf('start');
    expect(s).toBeGreaterThanOrEqual(0);
    expect(at[s + 1]).toBe('stop'); // stopped before the window opened
  });
});

describe('runner: a sitting the parent started on a letter', () => {
  it('a letter not met yet runs its 10 stations as its real stations, then the end screen; the path goes on in order', async () => {
    const t = harness();
    await t.startLetter('י');
    expect(t.root.querySelector('[aria-label="שלב 4 מתוך 10"]')).not.toBeNull(); // meet, find, drive flowed on to the paint window
    await t.runToEnd();
    expect(t.router.current()).toBe('end');
    expect(t.kinds).toEqual(Array(10).fill('station'));
    expect(t.audio.said.filter(s => s.startsWith('<'))).toEqual(['<meet>', '<find>', '<drive>', '<paint>', '<firstSound>', '<jump>', '<plane>', '<race>', '<mole>', '<match>']);
    const p = t.saved().children[0].progress;
    expect(p.unitStartDay).toEqual({ 'י': TODAY });
    expect(p.introOrder).toEqual(['י']);
    expect(p.stickers.map(s => s.id)).toEqual(['u:י']);
    expect(t.root.querySelector('[aria-label="מדבקה של האות י"]')).not.toBeNull();
    (t.root.querySelector('[data-end=map]') as HTMLElement).click();
    expect(t.router.current()).toBe('map');
    // the next sitting continues the path where it was: מ
    t.newRun();
    await t.runOneStep();
    expect(t.saved().children[0].progress.unitStartDay['מ']).toBe(TODAY);
    expect(t.saved().children[0].progress.introOrder).toEqual(['י', 'מ']);
  });

  it('a met letter: find, sound pick, drive and one game, practice.intro once, then the end screen', async () => {
    const t = harness();
    await t.runToEnd(); // מ met in a normal sitting
    (t.root.querySelector('[data-end=map]') as HTMLElement).click();
    const before = t.saved().children[0].progress.stationsDone;
    t.audio.said.length = 0;
    t.kinds.length = 0;
    await t.startLetter('מ');
    await t.runToEnd();
    expect(t.router.current()).toBe('end');
    expect(t.kinds).toEqual(['parent', 'parent', 'parent', 'parent']);
    const played = t.audio.said.filter(s => s.startsWith('<'));
    expect(played.slice(0, 3)).toEqual(['<find>', '<soundPick>', '<drive>']);
    expect(['<plane>', '<race>', '<mole>', '<match>', '<jump>']).toContain(played[3]);
    expect(t.audio.said.filter(s => s === line(CONTENT, 'practice.intro'))).toHaveLength(1);
    expect(t.audio.said.indexOf(line(CONTENT, 'practice.intro'))).toBeLessThan(t.audio.said.indexOf('<find>'));
    expect(t.saved().children[0].progress.stationsDone).toEqual(before);
  });
});

describe('runner: background music', () => {
  const startsBeforeRun = (events: string[]) => events.forEach((e, i) => {
    if (e.startsWith('run:')) expect(events[i - 1] === 'music:start').toBe(MUSIC_GAMES.includes(e.slice(4)));
  });

  it('music starts when a game step starts and stops on back; a teaching step plays no music', async () => {
    expect(MUSIC_GAMES).toContain('jump');
    expect(MUSIC_GAMES).not.toContain('plane');
    const t = harness({ hangOn: 'jump' });
    await t.startLetter('י'); // meet, find, drive, firstSound, then the dino
    for (let i = 0; i < 8 && !t.events.includes('run:jump'); i++) await t.runOneStep();
    expect(t.events).toContain('run:jump');
    startsBeforeRun(t.events);
    expect(t.events.filter(e => e === 'music:start')).toHaveLength(1);
    expect(t.events.indexOf('music:start')).toBe(t.events.indexOf('run:jump') - 1);
    t.router.back();
    await tick();
    expect(t.events[t.events.length - 1]).toBe('music:stop');
    expect(t.router.current()).toBe('map');
  });

  it('a finished game stops the music before its result, and a game outside MUSIC_GAMES never starts it', async () => {
    const t = harness();
    await t.startLetter('י');
    await t.runToEnd();
    startsBeforeRun(t.events);
    expect(t.events.filter(e => e === 'music:start')).toHaveLength(MUSIC_GAMES.length);
    const run = t.events.indexOf('run:jump');
    expect(t.events[run + 1]).toBe('music:stop');
    expect(t.events.includes('run:plane')).toBe(true);
  });

  it('the break screen plays no music', async () => {
    const t = harness({ breakDue: true });
    t.startStep();
    for (let i = 0; i < 30 && t.router.current() !== 'break'; i++) await tick();
    expect(t.router.current()).toBe('break');
    expect(t.events).not.toContain('music:start');
  });
});

describe('runner: check-points and a lost end screen', () => {
  it('a due check-point records its result with the day it ran on; a failure leaves practice pending; intros are spoken', async () => {
    const FAIL = 'מ/name';
    const t = harness({
      result: step => (step.kind === 'checkpoint'
        ? { outcome: 'done', answers: step.items.map((item, k) => ({ item, ok: item !== FAIL, kind: 'recall' as const, t: Date.now() + k })), slips: 0, ms: 0 }
        : undefined),
    });
    let cpDay = '';
    for (let d = 21; d <= 30 && !cpDay; d++) {
      const day = `2026-11-${d}`;
      t.setDay(day);
      t.newRun();
      for (let i = 0; i < 30; i++) {
        await t.runOneStep();
        if (t.kinds.includes('checkpoint')) { cpDay = day; break; }
        if (t.router.current() !== 'station') break;
      }
    }
    expect(cpDay).not.toBe('');
    const child = t.saved().children[0];
    expect(child.checkpoints).toHaveLength(1);
    expect(child.checkpoints[0]).toMatchObject({ cpId: 'cp1', day: cpDay, failed: [FAIL] });
    // the check-point flows on (no window) into its practice; the retry check-point is still pending
    expect(child.progress.pending.some(p => p.kind === 'checkpoint' && p.params?.retry === true)).toBe(true);
    const said = t.audio.said;
    const cpAt = said.lastIndexOf('<checkpoint>');
    expect(said.lastIndexOf(line(CONTENT, 'checkpoint.intro'), cpAt)).toBe(cpAt - 1);
    expect(t.kinds[t.kinds.lastIndexOf('checkpoint') + 1]).toBe('practice');
    expect(said.indexOf(line(CONTENT, 'practice.intro'), cpAt)).toBeGreaterThan(cpAt);
  });

  it('back at the last window keeps the end screen for the next tap', async () => {
    const t = harness();
    for (let i = 0; i < 10 && t.stepsRun < 10; i++) await t.runOneStep();
    expect(t.stepsRun).toBe(10);
    expect(t.windowShown()).toBe(true);
    t.router.back();
    await tick();
    expect(t.router.current()).toBe('map');
    expect(t.saved().children[0].progress.stickers.every(s => !s.shown)).toBe(true);
    const started = t.stepsStarted;
    t.newRun();
    t.startStep();
    await tick();
    expect(t.router.current()).toBe('end');
    expect(t.stepsStarted).toBe(started);
    expect(t.root.querySelector('[aria-label="מדבקה של האות מ"]')).not.toBeNull();
    expect(t.saved().children[0].progress.stickers.every(s => s.shown)).toBe(true);
    expect(t.saved().children[0].progress.sitting?.endShown).toBe(true);
  });
});

describe('end screen', () => {
  it('speaks great, the name, the sticker line and bye as separate lines; the map button leaves', async () => {
    const root = document.createElement('div');
    const audio = fakeAudio();
    let toMap = 0;
    mountEnd(root, { childName: 'נועה', stickers: ['מ', END_FLAG], onMap: () => { toMap++; }, audio, content: CONTENT });
    await tick();
    expect(audio.said).toEqual([line(CONTENT, 'end.great'), 'נועה', line(CONTENT, 'end.sticker'), line(CONTENT, 'end.bye')]);
    expect(root.textContent!.split(line(CONTENT, 'end.sticker')).length).toBe(2);
    expect(root.querySelector('[aria-label="מדבקה של האות מ"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="מדבקה של נקודת בדיקה"]')).not.toBeNull();
    (root.querySelector('[data-end=map]') as HTMLElement).click();
    expect(toMap).toBe(1);
  });

  it('never promises "tomorrow": another sitting can start right away', async () => {
    const root = document.createElement('div');
    const audio = fakeAudio();
    mountEnd(root, { childName: 'נועה', stickers: ['מ'], onMap: () => undefined, audio, content: CONTENT });
    await tick();
    expect(root.textContent).not.toContain('מחר');
    expect(audio.said.join(' ')).not.toContain('מחר');
    expect(audio.said[audio.said.length - 1]).toBe(line(CONTENT, 'end.bye'));
  });

  it('without a sticker shows no star and never mentions one', async () => {
    const root = document.createElement('div');
    const audio = fakeAudio();
    mountEnd(root, { childName: 'נועה', stickers: [], onMap: () => undefined, audio, content: CONTENT });
    await tick();
    expect(root.querySelector('[aria-label^="מדבקה"]')).toBeNull();
    expect(root.textContent).not.toContain('מדבקה');
    expect(audio.said).toEqual([line(CONTENT, 'end.great'), 'נועה', line(CONTENT, 'end.bye')]);
  });

  it('when the path is complete says map.complete instead of "tomorrow"', async () => {
    const root = document.createElement('div');
    const audio = fakeAudio();
    mountEnd(root, { childName: 'נועה', stickers: ['צ'], onMap: () => undefined, audio, content: CONTENT, nextTomorrow: false });
    await tick();
    expect(audio.said).toEqual([line(CONTENT, 'end.great'), 'נועה', line(CONTENT, 'end.sticker'), line(CONTENT, 'map.complete')]);
    expect(audio.said).not.toContain(line(CONTENT, 'end.bye'));
    expect(root.textContent).not.toContain('מחר');
  });
});
