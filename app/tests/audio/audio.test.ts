import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAudio } from '../../src/audio/audio.ts';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

function fakes(o: { index: Record<string, string> | null; rejectPlay?: boolean; voice?: boolean }) {
  const els: any[] = [];
  const spoken: string[] = [];
  const state = { cancelled: false };
  const synth: any = {
    getVoices: () => (o.voice === false ? [] : [{ lang: 'he-IL', localService: true, name: 'Android Hebrew', default: true }]),
    speak: (u: any) => { spoken.push(u.text); },
    cancel: () => { state.cancelled = true; },
    onvoiceschanged: null,
  };
  class U { text: string; lang = ''; voice: any = null; rate = 1; pitch = 1; volume = 1; onend: any = null; onerror: any = null; constructor(t: string) { this.text = t; } }
  const deps = {
    fetchIndex: async () => o.index,
    makeAudio: (src: string) => {
      const el: any = { src, volume: 1, onended: null, onerror: null, pause() {}, play: () => (o.rejectPlay ? Promise.reject(new Error('no')) : Promise.resolve()) };
      els.push(el);
      return el;
    },
    synth, Utterance: U as any, voiceFolder: 'hila',
  };
  return {
    deps, spoken, synth,
    get clips() { return els.map(e => ({ src: e.src, volume: e.volume })); },
    get cancelled() { return state.cancelled; },
    endClip: () => els[els.length - 1].onended?.(),
    failClip: () => els[els.length - 1].onerror?.(),
  };
}

afterEach(() => vi.useRealTimers());

describe('audio', () => {
  it('plays the clip when the key is indexed, at the voice volume', async () => { const f = fakes({ index: { 'שלום|0.9': 'a.mp3' } }); const a = createAudio(f.deps); await a.ready; a.setVoiceVolume(0.5); const p = a.say('שלום'); f.endClip(); await p; expect(f.clips[0]).toEqual({ src: 'audio/hila/a.mp3', volume: 0.5 }); expect(f.spoken).toEqual([]); expect(a.status()).toBe('clips'); });
  it('falls back to the live voice when play() rejects or the clip is missing', async () => { const f = fakes({ index: { 'x|0.9': 'x.mp3' }, rejectPlay: true }); const a = createAudio(f.deps); await a.ready; a.say('x'); await tick(); a.say('y'); await tick(); expect(f.spoken).toEqual(['x', 'y']); });
  it('falls back to the live voice on a clip load error', async () => { const f = fakes({ index: { 'x|0.9': 'x.mp3' } }); const a = createAudio(f.deps); await a.ready; a.say('x'); f.failClip(); expect(f.spoken).toEqual(['x']); });
  it('no index -> live voice', async () => { const f = fakes({ index: null }); const a = createAudio(f.deps); await a.ready; a.say('z'); expect(f.spoken).toEqual(['z']); expect(a.status()).toBe('live'); });
  it('queued line waits for the current one', async () => { const f = fakes({ index: { 'a|0.9': 'a.mp3', 'b|0.9': 'b.mp3' } }); const a = createAudio(f.deps); await a.ready; a.say('a'); a.say('b', { queue: true }); expect(f.clips.length).toBe(1); f.endClip(); await tick(); expect(f.clips.length).toBe(2); });
  it('stop cancels clip and live speech', async () => { const f = fakes({ index: null }); const a = createAudio(f.deps); await a.ready; a.say('z'); a.stop(); expect(f.cancelled).toBe(true); });
  it('a live line resolves by the fallback timeout when no onend arrives', async () => { vi.useFakeTimers(); const f = fakes({ index: null }); const a = createAudio(f.deps); await a.ready; let done = false; void a.say('שלום', { rate: 0.9 }).then(() => { done = true; }); await vi.advanceTimersByTimeAsync(399); expect(done).toBe(false); await vi.advanceTimersByTimeAsync(400 + 90 * 4 / 0.9); expect(done).toBe(true); });
  it('no local voice and no clips: say resolves at once and speaks nothing', async () => { const f = fakes({ index: null, voice: false }); const a = createAudio(f.deps); await a.ready; await a.say('z'); expect(f.spoken).toEqual([]); expect(a.status()).toBe('none'); });
  it('re-picks the voice when voices change', async () => { const f = fakes({ index: null, voice: false }); const a = createAudio(f.deps); await a.ready; expect(a.status()).toBe('none'); f.synth.getVoices = () => [{ lang: 'he-IL', localService: true, name: 'late', default: true }]; f.synth.onvoiceschanged(); expect(a.status()).toBe('live'); });
  it('onStatusChange fires when the clip index loads and stops after unsubscribe', async () => { let res: (i: Record<string, string> | null) => void = () => {}; const f = fakes({ index: null, voice: false }); f.deps.fetchIndex = () => new Promise(r => { res = r; }); const a = createAudio(f.deps); let n = 0; const off = a.onStatusChange(() => { n++; }); expect(a.status()).toBe('none'); res({ 'x|0.9': 'x.mp3' }); await a.ready; expect(a.status()).toBe('clips'); expect(n).toBe(1); off(); f.synth.getVoices = () => [{ lang: 'he-IL', localService: true, name: 'late', default: true }]; f.synth.onvoiceschanged(); expect(n).toBe(1); });
  it('onStatusChange fires on a late voice', async () => { const f = fakes({ index: null, voice: false }); const a = createAudio(f.deps); await a.ready; let n = 0; a.onStatusChange(() => { n++; }); f.synth.getVoices = () => [{ lang: 'he-IL', localService: true, name: 'late', default: true }]; f.synth.onvoiceschanged(); expect(n).toBe(1); });
  it('onSpeakingChange reports true at a line start and false at its end, on stop and on the live timeout', async () => {
    const settle = async () => { await tick(); await tick(); };
    const f = fakes({ index: { 'a|0.9': 'a.mp3' } });
    const a = createAudio(f.deps);
    await a.ready;
    const ev: boolean[] = [];
    const off = a.onSpeakingChange(s => { ev.push(s); });
    const p = a.say('a');
    expect(ev).toEqual([true]);
    f.endClip(); await p; await settle();
    expect(ev).toEqual([true, false]);
    // stopped
    ev.length = 0;
    void a.say('a'); a.stop(); await settle();
    expect(ev).toEqual([true, false]);
    // two queued lines are one stretch of speech
    ev.length = 0;
    void a.say('a'); void a.say('a', { queue: true });
    f.endClip(); await settle(); f.endClip(); await settle();
    expect(ev).toEqual([true, false]);
    off();
    // a live line ends by the timeout
    vi.useFakeTimers();
    const g = fakes({ index: null });
    const b = createAudio(g.deps);
    await b.ready;
    const ev2: boolean[] = [];
    b.onSpeakingChange(s => { ev2.push(s); });
    void b.say('שלום', { rate: 0.9 });
    expect(ev2).toEqual([true]);
    await vi.advanceTimersByTimeAsync(400 + 90 * 4 / 0.9 + 10);
    expect(ev2).toEqual([true, false]);
  });
  it('empty text and a failing index fetch are harmless', async () => { const d = fakes({ index: null }).deps; d.fetchIndex = () => Promise.reject(new Error('x')); const a = createAudio(d); await a.ready; await a.say(''); expect(a.status()).toBe('live'); });
});
