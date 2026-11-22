// One AudioContext and one master gain for the whole app: sound effects and music share them. The context is created
// on the first gesture (like the old app), because a context made from a timer or a frame starts suspended on a phone.
export const SFX_REF = 0.4;
export const MAX_LEVEL = 2.5;

export interface SoundEngine {
  /** The context once a gesture has unlocked it, else null (a sound asked before that is dropped). */
  ac(): AudioContext | null;
  master(): GainNode | null;
  unlocked(): boolean;
  /** Calls cb once, when the first gesture creates the context. Returns an unsubscribe function. */
  onUnlock(cb: () => void): () => void;
  /** The effects-volume setting (0..1); SFX_REF plays the old app's exact gains. */
  setLevel(effectsVolume: number): void;
  dispose(): void;
}

type Ctor = typeof AudioContext;

export const levelGain = (effectsVolume: number): number => Math.max(0, Math.min(MAX_LEVEL, effectsVolume / SFX_REF));

export function createSoundEngine(doc: Document = document): SoundEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let level = SFX_REF;
  const waiting = new Set<() => void>();

  // Never while the page is hidden (a sound asked from a late timer must not wake audio in the background): the
  // visibilitychange handler resumes it when the page shows again.
  const resume = (): void => {
    if (doc.visibilityState === 'hidden') return;
    if (ctx && ctx.state === 'suspended') { try { void ctx.resume(); } catch { /* ignore */ } }
  };

  function create(): void {
    try {
      const g = globalThis as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
      const C = g.AudioContext ?? g.webkitAudioContext;
      if (!C) return;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = levelGain(level);
      master.connect(ctx.destination);
    } catch { ctx = null; master = null; return; }
    for (const cb of [...waiting]) { waiting.delete(cb); try { cb(); } catch { /* ignore */ } }
  }

  const onGesture = (): void => {
    if (!ctx) create();
    resume();
  };
  const onVisibility = (): void => {
    if (!ctx) return;
    if (doc.visibilityState === 'hidden') { try { void ctx.suspend(); } catch { /* ignore */ } }
    else resume();
  };

  const opts = { capture: true, passive: true } as const;
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  for (const e of events) doc.addEventListener(e, onGesture, opts);
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    ac() { resume(); return ctx; },
    master: () => master,
    unlocked: () => ctx !== null,
    onUnlock(cb) { waiting.add(cb); return () => { waiting.delete(cb); }; },
    setLevel(v) {
      level = Number.isFinite(v) ? v : SFX_REF;
      if (master) master.gain.value = levelGain(level);
    },
    dispose() {
      for (const e of events) doc.removeEventListener(e, onGesture, opts);
      doc.removeEventListener('visibilitychange', onVisibility);
      waiting.clear();
      try { void ctx?.close(); } catch { /* ignore */ }
      ctx = null; master = null;
    },
  };
}

// The old app's synth helpers (index.html 788-790). dest is the node the sound feeds (the master gain, or music's gain).
export function tone(a: AudioContext, dest: AudioNode, f: number, d: number, type: OscillatorType, v: number, at = 0): OscillatorNode {
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + d + 0.03);
  return o;
}

export function sweep(a: AudioContext, dest: AudioNode, f0: number, f1: number, d: number, type: OscillatorType, v: number, at = 0): void {
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + d + 0.03);
}

export function noise(a: AudioContext, dest: AudioNode, d: number, v: number, f0: number, f1: number, at = 0): void {
  const t = a.currentTime + at, n = Math.floor(a.sampleRate * d);
  const buf = a.createBuffer(1, n, a.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass';
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + d);
  const g = a.createGain();
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t);
}
