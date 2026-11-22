import { describe, it, expect } from 'vitest';
import { audioKey, line, allSpokenLines, SOUND_RATE } from '../../src/audio/lines.ts';
import { CONTENT as C } from '../../src/content/index.ts';

describe('lines', () => {
  it('key matches the pipeline rule', () => { expect(audioKey('שלום')).toBe('שלום|0.9'); expect(audioKey('בָּה', 0.75)).toBe('בָּה|0.75'); });
  it('fills placeholders and rejects unknown ids', () => { expect(line(C, 'find.ask', { name: 'בֵּית' })).toBe('איפה האות בֵּית?'); expect(() => line(C, 'nope')).toThrow(); });
  it('throws on an unfilled placeholder', () => expect(() => line(C, 'find.ask')).toThrow());
  it('spoken lines are unique by key, NFC and never contain a child name placeholder', () => { const all = allSpokenLines(C); expect(new Set(all.map(l => audioKey(l.text, l.rate))).size).toBe(all.length); all.forEach(l => { expect(l.text).toBe(l.text.normalize('NFC')); expect(l.text).not.toMatch(/[{}]/); }); });
  it('covers find.wrong for all 22 letters', () => expect(allSpokenLines(C).filter(l => l.file.startsWith('lines/find.wrong__')).length).toBe(22));
  it('sound lines are at 0.75 and files are unique', () => { const all = allSpokenLines(C); expect(all.some(l => l.rate === 0.75)).toBe(true); expect(new Set(all.map(l => l.file)).size).toBe(all.length); });
  it('every (text, rate) the choice steps and meet speak has a clip in the manifest', () => {
    const keys = new Set(allSpokenLines(C).map(l => audioKey(l.text, l.rate)));
    for (const L of C.order) {
      const name = C.alphabet[L].name, sound = C.letters[L].soundSay;
      expect(keys.has(audioKey(line(C, 'soundPick.ask', { sound }), SOUND_RATE))).toBe(true);
      expect(keys.has(audioKey(line(C, 'find.ask', { name })))).toBe(true);
      expect(keys.has(audioKey(line(C, 'find.right', { name })))).toBe(true);
      expect(keys.has(audioKey(line(C, 'firstSound.ask', { sound })))).toBe(true);
      expect(keys.has(audioKey(line(C, 'meet.line', { name, sound, word: C.letters[L].words[0].word })))).toBe(true);
      C.letters[L].words.forEach(w => expect(keys.has(audioKey(line(C, 'firstSound.right', { sound, word: w.word })))).toBe(true));
    }
    for (const L of Object.keys(C.alphabet)) expect(keys.has(audioKey(line(C, 'find.wrong', { name: C.alphabet[L].name })))).toBe(true);
    expect(keys.has(audioKey(line(C, 'firstSound.wrong')))).toBe(true);
  });
  it('every game instruction (plane, race, mole, jump) has a clip for every path letter', () => {
    const keys = new Set(allSpokenLines(C).map(l => audioKey(l.text, l.rate)));
    for (const L of C.order) for (const id of ['plane.ask', 'race.ask', 'mole.ask', 'jump.ask']) expect(keys.has(audioKey(line(C, id, { name: C.alphabet[L].name }))), id + ' ' + L).toBe(true);
  });
  it('match.ask2 has a clip for the look-alike of every path letter (round 2 names the look-alike)', () => {
    const keys = new Set(allSpokenLines(C).map(l => audioKey(l.text, l.rate)));
    for (const L of C.order) expect(keys.has(audioKey(line(C, 'match.ask2', { name: C.alphabet[C.lookAlikes[L][0]].name })))).toBe(true);
  });
});
