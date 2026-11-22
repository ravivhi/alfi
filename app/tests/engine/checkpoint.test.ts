import { describe, it, expect } from 'vitest';
import { buildCheckpoint, gradeCheckpoint } from '../../src/engine/checkpoint.ts';
import { createRng } from '../../src/util/rng.ts';
import { ans, cpWith } from './pathHarness.ts';

describe('checkpoint', () => {
  it('one item per block unit, least established first kind', () => expect(buildCheckpoint({ blockUnits: ['מ', 'ל', 'ב'], taughtUnits: ['מ', 'ל', 'ב'], itemKinds: ['name', 'sound'], mastery: {}, extraReview: 0, today: 'd', rng: createRng(1) })).toEqual(['מ/name', 'ל/name', 'ב/name']));
  it('extra review prefers a weak old item over a fresh known one', () => expect(buildCheckpoint(cpWith({ weakOld: 'מ/sound', knownFresh: 'ת/sound' })).slice(-1)[0]).toBe('מ/sound'));
  it('block pick takes the kind with the fewest recall days', () => {
    const rec = { attempts: [{ day: '2026-11-20', t: 0, ok: true, kind: 'recall' as const }], confusions: {}, lastSeen: 0 };
    expect(buildCheckpoint({ blockUnits: ['מ'], taughtUnits: ['מ'], itemKinds: ['name', 'sound'], mastery: { 'מ/name': rec }, extraReview: 0, today: '2026-11-21', rng: createRng(1) })).toEqual(['מ/sound']);
  });
  it('extra review never repeats a block item and stops when items run out', () => expect(buildCheckpoint({ blockUnits: ['מ'], taughtUnits: ['מ'], itemKinds: ['name', 'sound'], mastery: {}, extraReview: 5, today: '2026-11-21', rng: createRng(1) })).toEqual(['מ/name', 'מ/sound']));
  it('grading uses the first answer per item', () => expect(gradeCheckpoint(['מ/name', 'ל/name'], [ans('מ/name', false), ans('מ/name', true), ans('ל/name', true)])).toEqual({ passed: ['ל/name'], failed: ['מ/name'] }));
  it('an unanswered item fails', () => expect(gradeCheckpoint(['מ/name', 'ל/name'], [ans('מ/name', true)])).toEqual({ passed: ['מ/name'], failed: ['ל/name'] }));
});
