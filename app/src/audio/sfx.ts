import { noise, sweep, tone } from './engine.ts';
import type { SoundEngine } from './engine.ts';

// The old app's game sounds (index.html SFX, 797-806) under the new app's names.
export type SfxName =
  | 'pick' | 'good' | 'bad' | 'boing' | 'pop' | 'chime' | 'fanfare' | 'jump' | 'bump' | 'ouch' | 'door' | 'bonk'
  | 'tick' | 'go' | 'combo' | 'lane' | 'pot';

export interface Sfx {
  /** arg: the streak for 'combo', the lane 0..2 for 'lane', the pot index 0..8 for 'pot'. */
  play(name: SfxName, arg?: number): void;
  setVolume(v: number): void;
  setEnabled(on: boolean): void;
  /** The race engine hum; ratio 0..1 is the speed. */
  engineHum(on: boolean, ratio: number): void;
  engineStop(): void;
  /** The crayon of the paint station: looping filtered noise, on while the finger draws. */
  crayon(on: boolean): void;
  /** Stops the crayon source for good (the station ends or is left). */
  crayonStop(): void;
}

export function createSfx(engine: SoundEngine): Sfx {
  let enabled = true;
  let hum: { o: OscillatorNode; o2: OscillatorNode; g: GainNode } | null = null;
  let crayon: { s: AudioBufferSourceNode; g: GainNode } | null = null;

  const recipes: Record<SfxName, (a: AudioContext, d: AudioNode, arg: number) => void> = {
    pick: (a, d) => { tone(a, d, 520, 0.1, 'triangle', 0.07); },
    good: (a, d) => { [784, 988, 1175, 1568].forEach((f, i) => tone(a, d, f, 0.16, 'sine', 0.09, i * 0.06)); },
    bad: (a, d) => { tone(a, d, 300, 0.18, 'sine', 0.1); tone(a, d, 240, 0.22, 'sine', 0.08, 0.1); },
    boing: (a, d) => { tone(a, d, 330, 0.12, 'triangle', 0.11); tone(a, d, 247, 0.2, 'triangle', 0.11, 0.11); },
    pop: (a, d) => noise(a, d, 0.18, 0.3, 1800, 300),
    chime: (a, d) => { tone(a, d, 784, 0.28, 'sine', 0.11); tone(a, d, 1047, 0.34, 'sine', 0.1, 0.11); tone(a, d, 1319, 0.4, 'sine', 0.07, 0.22); },
    fanfare: (a, d) => {
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(a, d, f, 0.3, 'triangle', 0.1, i * 0.1));
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(a, d, f, 0.45, 'sine', 0.06, 0.75 + i * 0.08));
    },
    jump: (a, d) => sweep(a, d, 420, 760, 0.18, 'sine', 0.1),
    bump: (a, d) => sweep(a, d, 220, 80, 0.3, 'sawtooth', 0.08),
    ouch: (a, d) => sweep(a, d, 600, 150, 0.4, 'sawtooth', 0.08),
    door: (a, d) => { [523, 659, 784, 1047].forEach((f, i) => tone(a, d, f, 0.22, 'triangle', 0.1, i * 0.09)); },
    bonk: (a, d) => { tone(a, d, 160, 0.12, 'square', 0.08); noise(a, d, 0.1, 0.4, 900, 200); },
    tick: (a, d) => { tone(a, d, 1200, 0.05, 'square', 0.03); },
    go: (a, d) => { tone(a, d, 880, 0.3, 'square', 0.06); },
    combo: (a, d, n) => { tone(a, d, 440 + Math.min(n, 20) * 30, 0.09, 'square', 0.035); },
    lane: (a, d, n) => { tone(a, d, 500 + n * 80, 0.06, 'triangle', 0.05); },
    pot: (a, d, n) => { tone(a, d, 520 + n * 40, 0.12, 'triangle', 0.08); },
  };

  const self: Sfx = {
    play(name, arg = 0) {
      if (!enabled) return;
      try {
        const a = engine.ac(), m = engine.master();
        if (a && m) recipes[name](a, m, arg);
      } catch { /* sound effects are optional */ }
    },
    setVolume(v) { engine.setLevel(v); },
    setEnabled(on) {
      enabled = on;
      if (!on) {
        self.engineStop();
        self.crayon(false);
      }
    },
    engineHum(on, ratio) {
      if (!enabled) return;
      try {
        const a = engine.ac(), m = engine.master();
        if (!a || !m) return;
        if (!hum) {
          const o = a.createOscillator(), o2 = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
          o.type = 'sawtooth'; o2.type = 'triangle';
          f.type = 'lowpass'; f.frequency.value = 600;
          g.gain.value = 0;
          o.connect(f); o2.connect(f); f.connect(g); g.connect(m);
          o.start(); o2.start();
          hum = { o, o2, g };
        }
        const r = Math.max(0, Math.min(1, ratio)), t = a.currentTime;
        hum.o.frequency.setTargetAtTime(48 + 70 * r, t, 0.15);
        hum.o2.frequency.setTargetAtTime(96 + 140 * r, t, 0.15);
        hum.g.gain.setTargetAtTime(on ? 0.03 + 0.035 * r : 0, t, 0.12);
      } catch { /* optional */ }
    },
    crayon(on) {
      if (!enabled && on) return;
      if (!on && !crayon) return;
      try {
        const a = engine.ac(), m = engine.master();
        if (!a || !m) return;
        if (!crayon) {
          // the old cray(): two seconds of smoothed noise looped through a wide band around 1100 Hz
          const n = a.sampleRate * 2, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
          let l = 0;
          for (let i = 0; i < n; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5 + (Math.random() * 2 - 1) * 0.25; }
          const s = a.createBufferSource();
          s.buffer = buf; s.loop = true;
          const f = a.createBiquadFilter();
          f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.35;
          const g = a.createGain();
          g.gain.value = 0;
          s.connect(f); f.connect(g); g.connect(m);
          s.start();
          crayon = { s, g };
        }
        crayon.g.gain.setTargetAtTime(on ? 0.09 : 0, a.currentTime, on ? 0.03 : 0.08);
      } catch { /* optional */ }
    },
    crayonStop() {
      const c = crayon;
      crayon = null;
      if (!c) return;
      try { c.s.stop(); } catch { /* ignore */ }
    },
    engineStop() {
      const h = hum;
      hum = null;
      if (!h) return;
      try { h.o.stop(); h.o2.stop(); } catch { /* ignore */ }
    },
  };
  return self;
}
