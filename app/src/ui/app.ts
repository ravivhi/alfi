import type { KV } from '../store/kv.ts';
import type { NativeBackup } from '../platform/native.ts';
import { loadSave, saveNow, scheduleNativeBackup, makeEnvelope } from '../store/save.ts';
import type { SaveData } from '../store/schema.ts';
import { createAudio } from '../audio/audio.ts';
import type { AudioApi, AudioDeps } from '../audio/audio.ts';
import { createSfx } from '../audio/sfx.ts';
import type { Sfx } from '../audio/sfx.ts';
import { createSoundEngine } from '../audio/engine.ts';
import { createMusic } from '../audio/music.ts';
import type { Music } from '../audio/music.ts';

export interface AppState {
  save: SaveData;
  seq: number;
  childId: string | null;
  audio: AudioApi;
  sfx: Sfx;
  music: Music;
  storageWarning: boolean;
  /** saveNow + a delayed native backup; false (and storageWarning) when the write failed. */
  persist(): boolean;
}

function browserAudioDeps(): AudioDeps {
  const g = globalThis as { speechSynthesis?: SpeechSynthesis; SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance };
  return {
    fetchIndex: async () => {
      try {
        const r = await fetch('audio/index.json');
        return r.ok ? ((await r.json()) as Record<string, string>) : null;
      } catch {
        return null;
      }
    },
    makeAudio: (src) => new Audio(src),
    synth: g.speechSynthesis ?? null,
    Utterance: g.SpeechSynthesisUtterance ?? null,
    voiceFolder: 'hila',
  };
}

export function createAppState(kv: KV, native: NativeBackup | null, now: number, audioDeps: Partial<AudioDeps> = {}): AppState {
  const loaded = loadSave(kv, native, now);
  const audio = createAudio({ ...browserAudioDeps(), ...audioDeps });
  const engine = createSoundEngine();
  const sfx = createSfx(engine);
  const music = createMusic(engine);
  audio.setVoiceVolume(loaded.data.settings.voiceVolume);
  sfx.setVolume(loaded.data.settings.effectsVolume);
  sfx.setEnabled(loaded.data.settings.sfxOn !== false);
  music.setEnabled(loaded.data.settings.musicOn !== false);
  audio.onSpeakingChange(s => music.duck(s));
  const lastId = loaded.data.settings.lastChildId;
  const state: AppState = {
    save: loaded.data,
    seq: loaded.seq,
    childId: lastId !== null && loaded.data.children.some(c => c.id === lastId) ? lastId : null,
    audio,
    sfx,
    music,
    storageWarning: false,
    persist() {
      const t = Date.now();
      const r = saveNow(kv, state.save, state.seq, t);
      state.storageWarning = !r.ok;
      if (!r.ok) return false;
      state.seq = r.seq;
      scheduleNativeBackup(native, () => makeEnvelope(state.save, state.seq, t));
      return true;
    },
  };
  return state;
}
