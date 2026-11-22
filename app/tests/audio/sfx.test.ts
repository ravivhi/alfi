// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSoundEngine } from '../../src/audio/engine.ts';
import type { SoundEngine } from '../../src/audio/engine.ts';
import { createSfx } from '../../src/audio/sfx.ts';
import type { SfxName } from '../../src/audio/sfx.ts';
import { FakeCtx, FakeGain, noiseInfo, oscInfo } from './fakeAudio.ts';

const last = <T,>(a: T[]): T => a[a.length - 1];
let engines: SoundEngine[] = [];
const make = () => { const e = createSoundEngine(document); engines.push(e); return e; };
const gesture = (type = 'pointerdown') => document.dispatchEvent(new Event(type, { bubbles: true }));
const ctx = () => FakeCtx.instances[FakeCtx.instances.length - 1];

beforeEach(() => { FakeCtx.instances = []; vi.stubGlobal('AudioContext', FakeCtx); });
afterEach(() => {
  engines.forEach(e => e.dispose()); engines = [];
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

const t = (f: number, d: number, type: string, v: number, at = 0) => ({ f, d, type, v, at });
const s = (f0: number, f1: number, d: number, type: string, v: number) => ({ f0, f1, d, type, v, at: 0 });
const n = (d: number, v: number, f0: number, f1: number, at = 0) => ({ d, v, f0, f1, at });
const row = (fs: number[], d: number, type: string, v: number, gap: number, start = 0) => fs.map((f, i) => t(f, d, type, v, Math.round((start + i * gap) * 1000) / 1000));

const RECIPES: [SfxName, number | undefined, { osc: object[]; noise: object[] }][] = [
  ['pick', undefined, { osc: [t(520, 0.1, 'triangle', 0.07)], noise: [] }],
  ['good', undefined, { osc: row([784, 988, 1175, 1568], 0.16, 'sine', 0.09, 0.06), noise: [] }],
  ['bad', undefined, { osc: [t(300, 0.18, 'sine', 0.1), t(240, 0.22, 'sine', 0.08, 0.1)], noise: [] }],
  ['boing', undefined, { osc: [t(330, 0.12, 'triangle', 0.11), t(247, 0.2, 'triangle', 0.11, 0.11)], noise: [] }],
  ['pop', undefined, { osc: [], noise: [n(0.18, 0.3, 1800, 300)] }],
  ['chime', undefined, { osc: [t(784, 0.28, 'sine', 0.11), t(1047, 0.34, 'sine', 0.1, 0.11), t(1319, 0.4, 'sine', 0.07, 0.22)], noise: [] }],
  ['fanfare', undefined, { osc: [...row([523, 659, 784, 1047, 1319, 1568], 0.3, 'triangle', 0.1, 0.1), ...row([1047, 1319, 1568, 2093], 0.45, 'sine', 0.06, 0.08, 0.75)], noise: [] }],
  ['jump', undefined, { osc: [s(420, 760, 0.18, 'sine', 0.1)], noise: [] }],
  ['bump', undefined, { osc: [s(220, 80, 0.3, 'sawtooth', 0.08)], noise: [] }],
  ['ouch', undefined, { osc: [s(600, 150, 0.4, 'sawtooth', 0.08)], noise: [] }],
  ['door', undefined, { osc: row([523, 659, 784, 1047], 0.22, 'triangle', 0.1, 0.09), noise: [] }],
  ['bonk', undefined, { osc: [t(160, 0.12, 'square', 0.08)], noise: [n(0.1, 0.4, 900, 200)] }],
  ['tick', undefined, { osc: [t(1200, 0.05, 'square', 0.03)], noise: [] }],
  ['go', undefined, { osc: [t(880, 0.3, 'square', 0.06)], noise: [] }],
  ['combo', 3, { osc: [t(530, 0.09, 'square', 0.035)], noise: [] }],
  ['combo', 50, { osc: [t(1040, 0.09, 'square', 0.035)], noise: [] }],
  ['lane', 0, { osc: [t(500, 0.06, 'triangle', 0.05)], noise: [] }],
  ['lane', 2, { osc: [t(660, 0.06, 'triangle', 0.05)], noise: [] }],
  ['pot', 0, { osc: [t(520, 0.12, 'triangle', 0.08)], noise: [] }],
  ['pot', 8, { osc: [t(840, 0.12, 'triangle', 0.08)], noise: [] }],
];

describe('sfx', () => {
  it('every sound plays the old recipe', () => {
    const e = make(); const sfx = createSfx(e);
    gesture();
    const c = ctx();
    for (const [name, arg, want] of RECIPES) {
      c.oscillators.length = 0; c.sources.length = 0; c.currentTime = 5;
      sfx.play(name, arg);
      expect({ name, osc: c.oscillators.map(o => oscInfo(o, 5)), noise: c.sources.map(x => noiseInfo(x, 5)) }).toEqual({ name, ...want });
    }
  });

  it('nothing plays before the first gesture, then the context is created on pointerdown', () => {
    const e = make(); const sfx = createSfx(e);
    sfx.play('good');
    expect(FakeCtx.instances).toHaveLength(0);
    expect(e.ac()).toBeNull();
    expect(e.unlocked()).toBe(false);
    gesture('pointerdown');
    expect(FakeCtx.instances).toHaveLength(1);
    expect(e.unlocked()).toBe(true);
    expect(ctx().oscillators).toHaveLength(0); // the dropped sound was not queued
    sfx.play('good');
    expect(ctx().oscillators).toHaveLength(4);
  });

  it('keydown and touchstart unlock too', () => {
    const e = make();
    gesture('touchstart');
    expect(e.unlocked()).toBe(true);
  });

  it('a suspended context is resumed on a gesture', () => {
    make();
    gesture();
    const c = ctx();
    expect(c.resumed).toBe(1);
    c.state = 'suspended';
    gesture('keydown');
    expect(c.resumed).toBe(2);
  });

  it('a hidden page suspends the context and a visible one resumes it', () => {
    make();
    gesture();
    const c = ctx();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(c.suspendCalls).toBe(1);
    const before = c.resumed;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(c.resumed).toBe(before + 1);
  });

  it('nothing resumes the context while the page is hidden; the visible handler does', () => {
    const e = make(); const sfx = createSfx(e);
    gesture();
    const c = ctx();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const before = c.resumed;
    expect(e.ac()).toBe(c);
    sfx.play('pick');
    gesture();
    expect(c.resumed).toBe(before);
    expect(c.state).toBe('suspended');
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(c.resumed).toBe(before + 1);
  });

  it('the default effects volume plays the old gains (master 1.0) and 0 is silent', () => {
    const e = make();
    e.setLevel(0.2); // before the unlock: applied when the context is created
    gesture();
    const master = ctx().gains[0] as FakeGain;
    expect(e.master()).toBe(master);
    expect(master.gain.value).toBeCloseTo(0.5, 6);
    e.setLevel(0.4);
    expect(master.gain.value).toBeCloseTo(1, 6);
    e.setLevel(0);
    expect(master.gain.value).toBe(0);
    e.setLevel(5);
    expect(master.gain.value).toBe(2.5);
  });

  it('game sounds off: play and engineHum do nothing', () => {
    const e = make(); const sfx = createSfx(e);
    gesture();
    sfx.setEnabled(false);
    sfx.play('good'); sfx.play('pop'); sfx.engineHum(true, 0.5);
    expect(ctx().oscillators).toHaveLength(0);
    expect(ctx().sources).toHaveLength(0);
    sfx.setEnabled(true);
    sfx.play('pick');
    expect(ctx().oscillators).toHaveLength(1);
  });

  it('engineHum follows the speed ratio and engineStop stops both oscillators', () => {
    const e = make(); const sfx = createSfx(e);
    sfx.engineHum(true, 0); // before the unlock: nothing
    gesture();
    expect(ctx().oscillators).toHaveLength(0);
    sfx.engineHum(true, 0);
    const [o, o2] = ctx().oscillators;
    expect(ctx().oscillators).toHaveLength(2);
    expect([o.type, o2.type]).toEqual(['sawtooth', 'triangle']);
    const hum = o.out[0].out[0] as FakeGain; // lowpass -> gain
    expect(last(o.frequency.calls)).toMatchObject({ v: 48, tau: 0.15 });
    expect(last(o2.frequency.calls)).toMatchObject({ v: 96, tau: 0.15 });
    expect(last(hum.gain.calls)).toMatchObject({ v: 0.03, tau: 0.12 });
    sfx.engineHum(true, 1);
    expect(ctx().oscillators).toHaveLength(2);
    expect(last(o.frequency.calls).v).toBe(118);
    expect(last(o2.frequency.calls).v).toBe(236);
    expect(last(hum.gain.calls).v).toBeCloseTo(0.065, 6);
    sfx.engineHum(false, 1);
    expect(last(hum.gain.calls).v).toBe(0);
    sfx.engineStop();
    expect(o.stopped).not.toBeNull();
    expect(o2.stopped).not.toBeNull();
  });
});

describe('crayon sound (paint the letter)', () => {
  it('loops filtered noise: bandpass 1100 Hz Q 0.35, gain 0.09 on and 0 off with the old time constants', () => {
    const e = make(); const sfx = createSfx(e);
    sfx.crayon(true); // before the unlock: nothing
    gesture();
    expect(ctx().sources).toHaveLength(0);
    sfx.crayon(true);
    const src = ctx().sources[0] as unknown as { loop: boolean; started: number | null; out: { type: string; frequency: { value: number }; Q?: { value: number }; out: FakeGain[] }[] };
    expect(ctx().sources).toHaveLength(1);
    expect(src.loop).toBe(true);
    const f = ctx().filters[0] as unknown as { type: string; frequency: { value: number }; Q: { value: number } };
    expect([f.type, f.frequency.value, f.Q.value]).toEqual(['bandpass', 1100, 0.35]);
    const g = ctx().gains.find(x => x.gain.calls.some(c => c.op === 'target'))!;
    expect(last(g.gain.calls)).toMatchObject({ op: 'target', v: 0.09, tau: 0.03 });
    sfx.crayon(true);
    expect(ctx().sources).toHaveLength(1); // one looping source
    sfx.crayon(false);
    expect(last(g.gain.calls)).toMatchObject({ v: 0, tau: 0.08 });
    sfx.crayonStop();
    expect(ctx().sources[0].stopped).not.toBeNull();
  });

  it('game sounds off: no crayon, and turning them off silences a running one', () => {
    const e = make(); const sfx = createSfx(e);
    gesture();
    sfx.setEnabled(false);
    sfx.crayon(true);
    expect(ctx().sources).toHaveLength(0);
    sfx.setEnabled(true);
    sfx.crayon(true);
    const g = ctx().gains.find(x => x.gain.calls.some(c => c.op === 'target'))!;
    expect(last(g.gain.calls).v).toBe(0.09);
    sfx.setEnabled(false);
    expect(last(g.gain.calls).v).toBe(0);
  });
});
