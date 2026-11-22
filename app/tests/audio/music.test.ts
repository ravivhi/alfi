// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSoundEngine } from '../../src/audio/engine.ts';
import type { SoundEngine } from '../../src/audio/engine.ts';
import { createMusic, MN, MP } from '../../src/audio/music.ts';
import { FakeCtx, FakeGain, oscInfo } from './fakeAudio.ts';

const last = <T,>(a: T[]): T => a[a.length - 1];
let engines: SoundEngine[] = [];
const ctx = () => FakeCtx.instances[FakeCtx.instances.length - 1];
const unlock = () => document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
// advances the audio clock and the 100 ms scheduler together
const run = (sec: number) => { for (let i = 0; i < Math.round(sec * 10); i++) { ctx().currentTime += 0.1; vi.advanceTimersByTime(100); } };
const setup = () => { const e = createSoundEngine(document); engines.push(e); return { e, m: createMusic(e) }; };
const notes = () => ctx().oscillators.map(o => oscInfo(o));

beforeEach(() => { FakeCtx.instances = []; vi.stubGlobal('AudioContext', FakeCtx); vi.useFakeTimers(); });
afterEach(() => { engines.forEach(e => e.dispose()); engines = []; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('music', () => {
  it('plays the old dino melody: 24 steps of 0.3 s, notes MN/2, rests at -1, triangle .25 s at .025', () => {
    const { m } = setup();
    unlock();
    m.start();
    run(7.1);
    const first = notes().filter(x => x.at < 7.19);
    const want = MP.map((n, i) => ({ n, i })).filter(x => x.n >= 0);
    expect(first).toHaveLength(want.length);
    first.forEach((x, k) => {
      expect((x as { f: number }).f).toBe(MN[want[k].n] / 2);
      expect(x.at).toBeCloseTo(want[k].i * 0.3, 2);
      expect(x).toMatchObject({ type: 'triangle', v: 0.025, d: 0.25 });
    });
    expect(MP).toHaveLength(24);
    expect(MP.filter(n => n < 0)).toHaveLength(2);
  });

  it('loops after 7.2 s', () => {
    const { m } = setup();
    unlock();
    m.start();
    run(7.5);
    const again = notes().filter(x => x.at >= 7.19) as { f: number; at: number }[];
    expect(again[0].f).toBe(MN[MP[0]] / 2);
    expect(again[0].at).toBeCloseTo(7.2, 2);
    expect(again[1].f).toBe(MN[MP[1]] / 2);
    expect(again[1].at).toBeCloseTo(7.5, 2);
  });

  it('duck lowers the music to 0.35 while speech plays and restores it', () => {
    const { m } = setup();
    unlock();
    m.start();
    const g = ctx().gains[1] as FakeGain; // [0] is the master
    expect(last(g.gain.calls)).toMatchObject({ op: 'set', v: 1 });
    m.duck(true);
    expect(last(g.gain.calls)).toMatchObject({ op: 'target', v: 0.35, tau: 0.08 });
    m.duck(false);
    expect(last(g.gain.calls)).toMatchObject({ op: 'target', v: 1, tau: 0.08 });
  });

  it('start before the unlock waits for the first gesture', () => {
    const { m } = setup();
    m.start();
    vi.advanceTimersByTime(1000);
    expect(FakeCtx.instances).toHaveLength(0);
    unlock();
    expect(ctx().oscillators.length).toBeGreaterThan(0);
    run(1);
    expect(notes().filter(x => x.at < 0.1)).toHaveLength(1);
  });

  it('stop silences at once and start twice plays one melody', () => {
    const { m } = setup();
    unlock();
    m.start(); m.start();
    expect(ctx().oscillators).toHaveLength(2); // steps 0 and 1 inside the 0.4 s look-ahead, once
    run(1);
    const g = ctx().gains[1] as FakeGain;
    m.stop();
    expect(last(g.gain.calls)).toMatchObject({ op: 'set', v: 0 });
    ctx().oscillators.forEach(o => expect(o.stopped).not.toBeNull());
    const count = ctx().oscillators.length;
    run(2);
    expect(ctx().oscillators).toHaveLength(count);
  });

  it('music off: start does nothing', () => {
    const { m } = setup();
    unlock();
    m.setEnabled(false);
    m.start();
    run(1);
    expect(ctx().oscillators).toHaveLength(0);
    m.setEnabled(true);
    m.start();
    expect(ctx().oscillators.length).toBeGreaterThan(0);
  });
});
