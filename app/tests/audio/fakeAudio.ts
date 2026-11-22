// A recording AudioContext for the sound tests: oscillators, gains, filters and sources with their parameter calls.
export interface Call { op: 'set' | 'exp' | 'target' | 'cancel'; v: number; t: number; tau?: number }

export class FakeParam {
  value = 0;
  calls: Call[] = [];
  setValueAtTime(v: number, t: number) { this.calls.push({ op: 'set', v, t }); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.calls.push({ op: 'exp', v, t }); return this; }
  setTargetAtTime(v: number, t: number, tau: number) { this.calls.push({ op: 'target', v, t, tau }); return this; }
  cancelScheduledValues(t: number) { this.calls.push({ op: 'cancel', v: 0, t }); return this; }
}

export class FakeNode {
  out: FakeNode[] = [];
  connect(n: FakeNode) { this.out.push(n); return n; }
}
export class FakeGain extends FakeNode { gain = new FakeParam(); }
export class FakeOsc extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  started: number | null = null;
  stopped: number | null = null;
  start(t = 0) { this.started = t; }
  stop(t = 0) { this.stopped = t; }
}
export class FakeFilter extends FakeNode { type = ''; frequency = new FakeParam(); Q = new FakeParam(); }
export class FakeSource extends FakeNode {
  buffer: { duration: number } | null = null;
  started: number | null = null;
  stopped: number | null = null;
  loop = false;
  start(t = 0) { this.started = t; }
  stop(t = 0) { this.stopped = t; }
}

export class FakeCtx {
  static instances: FakeCtx[] = [];
  state = 'suspended';
  currentTime = 0;
  sampleRate = 44100;
  destination = new FakeNode();
  oscillators: FakeOsc[] = [];
  gains: FakeGain[] = [];
  filters: FakeFilter[] = [];
  sources: FakeSource[] = [];
  resumed = 0;
  suspendCalls = 0;
  constructor() { FakeCtx.instances.push(this); }
  createOscillator() { const o = new FakeOsc(); this.oscillators.push(o); return o; }
  createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
  createBiquadFilter() { const f = new FakeFilter(); this.filters.push(f); return f; }
  createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
  createBuffer(_ch: number, n: number, rate: number) { return { duration: n / rate, getChannelData: () => new Float32Array(n) }; }
  resume() { this.resumed++; this.state = 'running'; return Promise.resolve(); }
  suspend() { this.suspendCalls++; this.state = 'suspended'; return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** What one oscillator did, in the old recipe's terms: frequency (or glide), type, peak gain, start offset, length. */
export function oscInfo(o: FakeOsc, origin = 0) {
  const g = o.out[0] as FakeGain;
  const peak = g.gain.calls.find(c => c.op === 'exp')!.v;
  const glide = o.frequency.calls.find(c => c.op === 'exp');
  const base = {
    type: o.type, v: r3(peak), at: r3((o.started ?? 0) - origin), d: r3((o.stopped ?? 0) - (o.started ?? 0) - 0.03),
  };
  return glide ? { f0: o.frequency.calls[0].v, f1: glide.v, ...base } : { f: o.frequency.value, ...base };
}

/** A noise burst: length, start gain, band glide. */
export function noiseInfo(s: FakeSource, origin = 0) {
  const f = s.out[0] as FakeFilter, g = f.out[0] as FakeGain;
  return {
    d: r3(s.buffer!.duration), v: g.gain.calls[0].v, f0: f.frequency.calls[0].v, f1: f.frequency.calls[1].v, at: r3((s.started ?? 0) - origin),
  };
}
