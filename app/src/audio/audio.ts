import { audioKey } from './lines.ts';
import { pickHebrewVoice, voiceStatus } from './voice.ts';

export interface AudioDeps {
  fetchIndex(): Promise<Record<string, string> | null>;
  makeAudio(src: string): HTMLAudioElement;
  synth: SpeechSynthesis | null;
  Utterance: typeof SpeechSynthesisUtterance | null;
  voiceFolder: string;
}

export interface AudioApi {
  ready: Promise<void>;
  say(text: string, opt?: { rate?: number; queue?: boolean }): Promise<void>;
  stop(): void;
  setVoiceVolume(v: number): void;
  status(): 'clips' | 'live' | 'none';
  /** Calls cb whenever status() changes (index loaded, voice appeared). Returns an unsubscribe function. */
  onStatusChange(cb: () => void): () => void;
  /** true when a line starts (clip or live), false when the last line ends, is stopped or times out. */
  onSpeakingChange(cb: (speaking: boolean) => void): () => void;
}

interface Playing { stop(): void; setVolume(v: number): void }

export function createAudio(d: AudioDeps): AudioApi {
  let index: Record<string, string> | null = null;
  let volume = 1;
  let current: Playing | null = null;
  let tail: Promise<void> = Promise.resolve();
  let gen = 0;
  let voice: SpeechSynthesisVoice | null = null;

  const listeners = new Set<() => void>();
  const status = () => voiceStatus(!!voice, index);
  let last: 'clips' | 'live' | 'none' = 'none';
  const notify = () => {
    const s = status();
    if (s === last) return;
    last = s;
    for (const cb of [...listeners]) { try { cb(); } catch { /* ignore */ } }
  };
  const repick = () => { try { voice = d.synth ? pickHebrewVoice(d.synth.getVoices()) : null; } catch { voice = null; } notify(); };
  repick();
  if (d.synth) { try { d.synth.onvoiceschanged = repick; } catch { /* read-only in some engines */ } }

  const speakers = new Set<(s: boolean) => void>();
  let lines = 0;
  let speaking = false;
  const emit = (s: boolean) => { for (const cb of [...speakers]) { try { cb(s); } catch { /* ignore */ } } };
  const ready = d.fetchIndex().catch(() => null).then(i => { index = i; notify(); });

  // Live speech with a local Hebrew voice only. The line ends on onend / onerror (the Android bridge reports both);
  // the timeout ends it when an engine never reports.
  function live(text: string, rate: number): { done: Promise<void>; handle: Playing } {
    let finish = () => {};
    const done = new Promise<void>(r => { finish = r; });
    const none = { done: Promise.resolve(), handle: { stop() {}, setVolume() {} } };
    if (!d.synth || !d.Utterance) return none;
    if (!voice) repick();
    if (!voice) return none;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; finish(); };
    try {
      const u = new d.Utterance(text);
      u.lang = 'he-IL'; u.voice = voice; u.rate = rate; u.pitch = 1.05; u.volume = volume;
      u.onend = end; u.onerror = end;
      timer = setTimeout(end, 400 + 90 * text.length / rate);
      d.synth.speak(u);
    } catch { end(); }
    return { done, handle: { stop: end, setVolume() {} } };
  }

  function clip(file: string, text: string, rate: number): Promise<void> {
    return new Promise<void>(resolve => {
      let settled = false;
      let a: HTMLAudioElement | null = null;
      const detach = () => { if (a) { a.onended = null; a.onerror = null; } };
      const handle: Playing = {
        stop() { if (settled) return; settled = true; detach(); try { a?.pause(); } catch { /* ignore */ } resolve(); },
        setVolume(v) { if (a) a.volume = v; },
      };
      const fallback = () => {
        if (settled) return;
        settled = true; detach();
        if (current !== handle) { resolve(); return; }
        const l = live(text, rate);
        current = l.handle;
        void l.done.then(() => { if (current === l.handle) current = null; resolve(); });
      };
      current = handle;
      try {
        a = d.makeAudio(`audio/${d.voiceFolder}/${file}`);
        a.volume = volume;
        a.onended = () => { if (settled) return; settled = true; detach(); if (current === handle) current = null; resolve(); };
        a.onerror = fallback;
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(fallback);
      } catch { fallback(); }
    });
  }

  function play(text: string, rate: number): Promise<void> {
    lines++;
    if (!speaking) { speaking = true; emit(true); }
    // the end is reported a tick late, so two queued lines do not flicker "not speaking" between them
    return playLine(text, rate).then(() => {
      if (--lines === 0) setTimeout(() => { if (lines === 0 && speaking) { speaking = false; emit(false); } }, 0);
    });
  }

  function playLine(text: string, rate: number): Promise<void> {
    const file = index?.[audioKey(text, rate)];
    if (file) return clip(file, text, rate);
    const l = live(text, rate);
    current = l.handle;
    return l.done.then(() => { if (current === l.handle) current = null; });
  }

  function halt() {
    gen++;
    const c = current;
    current = null;
    c?.stop();
    try { d.synth?.cancel(); } catch { /* ignore */ }
  }

  return {
    ready,
    say(text, opt = {}) {
      if (!text || volume <= 0) return Promise.resolve();
      const rate = opt.rate ?? 0.9;
      if (opt.queue) {
        const my = gen;
        tail = tail.then(() => (my === gen ? play(text, rate) : undefined));
        return tail;
      }
      halt();
      tail = play(text, rate);
      return tail;
    },
    stop: halt,
    setVoiceVolume(v) { volume = Math.max(0, Math.min(1, v)); current?.setVolume(volume); },
    status,
    onStatusChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    onSpeakingChange(cb) { speakers.add(cb); return () => { speakers.delete(cb); }; },
  };
}
