/** A local Hebrew voice, or null. Online voices are never picked: nothing leaves the device. */
export function pickHebrewVoice(vs: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const local = vs.filter(v => /^(he|iw)/i.test(v.lang) && v.localService === true);
  return local.find(v => v.default) ?? local[0] ?? null;
}

export function voiceStatus(hasLocalVoice: boolean, clipIndex: Record<string, string> | null): 'clips' | 'live' | 'none' {
  if (clipIndex) return 'clips';
  return hasLocalVoice ? 'live' : 'none';
}
