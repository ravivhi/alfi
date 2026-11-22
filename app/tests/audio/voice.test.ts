import { describe, it, expect } from 'vitest';
import { pickHebrewVoice, voiceStatus } from '../../src/audio/voice.ts';

const v = (lang: string, localService: boolean, name = 'x', def = false) => ({ lang, localService, name, default: def, voiceURI: name }) as SpeechSynthesisVoice;

describe('voice', () => {
  it('never picks an online voice', () => expect(pickHebrewVoice([v('he-IL', false, 'Microsoft Hila Online (Natural)')])).toBeNull());
  it('picks a local Hebrew voice', () => expect(pickHebrewVoice([v('en-US', true), v('he-IL', true, 'Android Hebrew')])?.name).toBe('Android Hebrew'));
  it('prefers the default local voice and accepts iw', () => expect(pickHebrewVoice([v('he-IL', true, 'a'), v('iw-IL', true, 'b', true)])?.name).toBe('b'));
  it('voiceStatus is none with no local voice and no clips', () => expect(voiceStatus(false, null)).toBe('none'));
  it('voiceStatus live / clips', () => { expect(voiceStatus(true, null)).toBe('live'); expect(voiceStatus(false, {})).toBe('clips'); });
});
