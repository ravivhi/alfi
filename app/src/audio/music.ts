import { tone } from './engine.ts';
import type { SoundEngine } from './engine.ts';

// The old app's only background music: the dino's melody (index.html 1640, `step`), one note every 0.3 s, looping.
export const MN = [523, 587, 659, 784, 880];
export const MP = [0, 2, 4, 2, 1, 3, 2, 0, 2, 4, 3, 1, 0, 1, 2, -1, 3, 4, 3, 2, 1, 2, 0, -1];
export const NOTE_SEC = 0.3;
export const DUCKED = 0.35;
const AHEAD_SEC = 0.4;
const TICK_MS = 100;

export interface Music {
  start(): void;
  stop(): void;
  /** Lower the music while speech plays. */
  duck(on: boolean): void;
  setEnabled(on: boolean): void;
}

export function createMusic(engine: SoundEngine): Music {
  let enabled = true;
  let wanted = false;
  let ducked = false;
  let gain: GainNode | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unsub: (() => void) | null = null;
  let nextAt = 0;
  let step = 0;
  let live: { o: OscillatorNode; end: number }[] = [];

  const target = (): number => (ducked ? DUCKED : 1);

  function gainNode(a: AudioContext, m: GainNode): GainNode {
    if (!gain) { gain = a.createGain(); gain.gain.value = target(); gain.connect(m); }
    return gain;
  }

  function schedule(a: AudioContext, g: GainNode): void {
    nextAt = Math.max(nextAt, a.currentTime);
    live = live.filter(x => x.end > a.currentTime);
    while (nextAt < a.currentTime + AHEAD_SEC) {
      const n = MP[step % MP.length];
      step++;
      if (n >= 0) {
        const at = nextAt - a.currentTime;
        live.push({ o: tone(a, g, MN[n] / 2, 0.25, 'triangle', 0.025, at), end: nextAt + 0.28 });
      }
      nextAt += NOTE_SEC;
    }
  }

  function begin(): void {
    const a = engine.ac(), m = engine.master();
    if (!a || !m) return;
    const g = gainNode(a, m);
    g.gain.cancelScheduledValues(a.currentTime);
    g.gain.setValueAtTime(target(), a.currentTime);
    nextAt = a.currentTime;
    step = 0;
    const loop = (): void => {
      schedule(a, g);
      timer = setTimeout(loop, TICK_MS);
    };
    loop();
  }

  function silence(): void {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    for (const x of live) { try { x.o.stop(); } catch { /* not started */ } }
    live = [];
    const a = engine.ac();
    if (gain && a) { gain.gain.cancelScheduledValues(a.currentTime); gain.gain.setValueAtTime(0, a.currentTime); }
  }

  const self: Music = {
    start() {
      if (!enabled || wanted) return;
      wanted = true;
      if (engine.unlocked()) begin();
      else unsub = engine.onUnlock(() => { unsub = null; if (wanted && enabled) begin(); });
    },
    stop() {
      wanted = false;
      if (unsub) { unsub(); unsub = null; }
      silence();
    },
    duck(on) {
      ducked = on;
      const a = engine.ac();
      if (gain && a && timer !== null) gain.gain.setTargetAtTime(target(), a.currentTime, 0.08);
    },
    setEnabled(on) {
      enabled = on;
      if (!on) self.stop();
    },
  };
  return self;
}
