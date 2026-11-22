import { describe, it, expect } from 'vitest';
import { pickFirstSoundOptions } from '../../src/steps/firstSound.ts';
import { createRng } from '../../src/util/rng.ts';
import type { PictureWord } from '../../src/content/schema.ts';

const SAME = [['א', 'ע'], ['ט', 'ת'], ['כ', 'ק'], ['ס', 'שׂ']];
const w = (first: string): PictureWord => ({ word: first + 'x', plain: first + 'x', emoji: '*', emojiUnicode: 1, first, letters: [first], vowels: [], band: '3-5' });
const POOL_WITH_TET_AND_KAF_QOF = ['ט', 'ת', 'כ', 'ק', 'ר', 'ש', 'ד', 'ג', 'נ', 'מ', 'ב'].map(w);

describe('pickFirstSoundOptions', () => {
  it('distractor words never start with a same-sound letter', () => {
    for (let s = 0; s < 100; s++) pickFirstSoundOptions('ת', POOL_WITH_TET_AND_KAF_QOF, 2, SAME, createRng(s)).forEach(x => expect(['ט', 'ת']).not.toContain(x.first));
  });
  it('two distractor words never share a first sound', () => {
    for (let s = 0; s < 100; s++) {
      const [a, b] = pickFirstSoundOptions('מ', POOL_WITH_TET_AND_KAF_QOF, 2, SAME, createRng(s));
      expect(SAME.some(g => g.includes(a.first) && g.includes(b.first))).toBe(false);
      expect(a.first).not.toBe(b.first);
    }
  });
  it('never returns the target letter and returns fewer when the pool is short', () => {
    expect(pickFirstSoundOptions('מ', POOL_WITH_TET_AND_KAF_QOF, 20, SAME, createRng(1)).map(x => x.first)).not.toContain('מ');
    expect(pickFirstSoundOptions('מ', [w('כ'), w('ק')], 2, SAME, createRng(1))).toHaveLength(1);
  });
});
