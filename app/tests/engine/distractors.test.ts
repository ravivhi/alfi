import { describe, it, expect } from 'vitest';
import { chooseDistractors, type Pool } from '../../src/engine/distractors.ts';
import { createRng } from '../../src/util/rng.ts';
import { ALEF_BET_22, SIM_FIXTURE } from '../fixtures/letters.ts';

const base = { alphabet: ALEF_BET_22, lookAlikes: SIM_FIXTURE, sameSound: [['א','ע'],['ט','ת'],['כ','ק'],['ס','שׂ']], taught: [] as string[], confusions: [] as string[], prefer: ['confusions','lookAlikes','taught'] as Pool[] };

describe('chooseDistractors', () => {
  it('returns n unique options without the target', () => { const d = chooseDistractors({ ...base, target: 'ב', n: 3, mode: 'look', rng: createRng(1) }); expect(new Set(d).size).toBe(3); expect(d).not.toContain('ב'); });
  it('look mode prefers the child confusions, then look-alikes', () => { const d = chooseDistractors({ ...base, target: 'ב', n: 2, mode: 'look', confusions: ['ד'], rng: createRng(2) }); expect(d[0]).toBe('ד'); expect(SIM_FIXTURE['ב']).toContain(d[1]); });
  it('sound mode never offers a letter that sounds like the target (200 seeds)', () => { for (let s = 0; s < 200; s++) { expect(chooseDistractors({ ...base, target: 'א', n: 3, mode: 'sound', lookAlikes: { ...SIM_FIXTURE, 'א': ['ע','צ','ש'] }, rng: createRng(s) })).not.toContain('ע'); } });
  it('sound mode never offers two options that sound alike', () => { for (let s = 0; s < 200; s++) { const d = chooseDistractors({ ...base, target: 'מ', n: 3, mode: 'sound', taught: ['ט','ת','כ','ק'], prefer: ['taught'], rng: createRng(s) }); expect(d.includes('ט') && d.includes('ת')).toBe(false); expect(d.includes('כ') && d.includes('ק')).toBe(false); } });
  it('falls back to the alphabet when pools are short', () => expect(chooseDistractors({ ...base, target: 'ל', n: 3, mode: 'look', lookAlikes: { 'ל': [] }, prefer: ['lookAlikes'], rng: createRng(4) }).length).toBe(3));
});
