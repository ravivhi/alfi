import { describe, it, expect } from 'vitest';
import { recordAnswer, isWeak, isKnown, recallDays, topConfusions, unitStatus, letterLevel, unitCard, knownSince, MASTERY } from '../../src/engine/mastery.ts';
import type { Attempt, MasteryRecord } from '../../src/engine/mastery.ts';

const A = (day: string, ok: boolean, kind: 'recall' | 'match' = 'recall', chose?: string): Attempt => ({ day, t: 0, ok, kind, chose });
const fold = (...as: Attempt[]) => as.reduce<MasteryRecord | undefined>((r, a) => recordAnswer(r, a), undefined)!;

describe('mastery', () => {
  it('one correct answer is not known', () => expect(isKnown(fold(A('2026-11-21', true)))).toBe(false));
  it('many correct answers on one day are not known', () => expect(isKnown(fold(A('d1', true), A('d1', true), A('d1', true)))).toBe(false));
  it('correct on two days with a recall is known', () => expect(isKnown(fold(A('2026-11-21', true, 'match'), A('2026-11-22', true)))).toBe(true));
  it('two days of match only are not known', () => expect(isKnown(fold(A('2026-11-21', true, 'match'), A('2026-11-22', true, 'match')))).toBe(false));
  it('an error is cleared only by a correct answer on a later day', () => {
    expect(isWeak(fold(A('2026-11-21', false), A('2026-11-21', true)))).toBe(true);
    expect(isWeak(fold(A('2026-11-21', false), A('2026-11-22', true)))).toBe(false);
  });
  it('a known item that fails becomes weak and not known', () => expect(isKnown(fold(A('2026-11-21', true), A('2026-11-22', true), A('2026-11-25', false)))).toBe(false));
  it('confusions count the chosen unit', () => expect(topConfusions(fold(A('d', false, 'recall', 'כ'), A('d', false, 'recall', 'כ'), A('d', false, 'recall', 'ר')))).toEqual(['כ']));
  it('attempts are capped at 40', () => expect(fold(...Array.from({ length: 50 }, () => A('d', true))).attempts.length).toBe(MASTERY.MAX_ATTEMPTS));
  it('the cap never drops an uncleared error: correct answers go first, oldest first', () => {
    // a mistake, then 50 correct answers the same day: the mistake is still there (not cleared), the item still weak
    const r = fold(A('d1', false, 'recall', 'כ'), ...Array.from({ length: 50 }, () => A('d1', true)));
    expect(r.attempts.length).toBe(MASTERY.MAX_ATTEMPTS);
    expect(r.attempts[0]).toMatchObject({ day: 'd1', ok: false });
    expect(isWeak(r)).toBe(true);
    // correct answers go before a cleared error, and the newest correct answer (the one that clears it) stays
    const later = fold(A('d1', false), A('d2', true), ...Array.from({ length: 45 }, () => A('d3', true)));
    expect(later.attempts.length).toBe(MASTERY.MAX_ATTEMPTS);
    expect(later.attempts[0]).toMatchObject({ day: 'd1', ok: false });
    expect(later.attempts.some(a => a.day === 'd2')).toBe(false);
    expect(isWeak(later)).toBe(false);
    // with only errors and one correct answer left, cleared errors go oldest first and the clearing answer stays
    const mixed = fold(...Array.from({ length: 40 }, () => A('d1', false)), A('d2', true), A('d2', false));
    expect(mixed.attempts.length).toBe(MASTERY.MAX_ATTEMPTS);
    expect(mixed.attempts.filter(a => a.ok)).toHaveLength(1);
    expect(mixed.attempts[mixed.attempts.length - 1]).toMatchObject({ day: 'd2', ok: false });
    expect(isWeak(mixed)).toBe(true);
    // only uncleared errors left: the cap gives way rather than drop one
    const errors = fold(...Array.from({ length: 45 }, () => A('d1', false)));
    expect(errors.attempts.length).toBe(45);
    expect(isWeak(errors)).toBe(true);
  });
  it('unit status', () => {
    expect(unitStatus([undefined, undefined], false)).toBe('notYet');
    expect(unitStatus([undefined, undefined], true)).toBe('learning');
  });
  it('recordAnswer is pure and recallDays counts distinct recall days', () => {
    const r1 = fold(A('d1', true));
    const r2 = recordAnswer(r1, A('d2', true));
    expect(r1.attempts.length).toBe(1);
    expect(r2.attempts.length).toBe(2);
    expect(recallDays(fold(A('d1', true), A('d1', true), A('d2', true, 'match'), A('d3', false)))).toBe(1);
  });
  it('unit status known only when every item is known; any attempt means learning', () => {
    const k = fold(A('d1', true), A('d2', true));
    expect(unitStatus([k, k], false)).toBe('known');
    expect(unitStatus([k, undefined], false)).toBe('learning');
  });
  it('four letter levels: notYet, met, practising, known', () => {
    const k = fold(A('2026-11-19', true), A('2026-11-20', true));
    expect(letterLevel([undefined, undefined], false)).toBe('notYet');
    expect(letterLevel([undefined, undefined], true)).toBe('met');
    // a recent mistake, or correct on one day only, is practising
    expect(letterLevel([fold(A('2026-11-20', false)), undefined], true)).toBe('practising');
    expect(letterLevel([fold(A('2026-11-20', true)), fold(A('2026-11-20', true))], true)).toBe('practising');
    expect(letterLevel([k, undefined], true)).toBe('practising');
    expect(letterLevel([k, k], true)).toBe('known');
    expect(letterLevel([], false)).toBe('notYet');
  });
  it('unit card: recall days, first-answer success rate, confusions, last day', () => {
    const name = fold(A('2026-11-18', true), A('2026-11-18', false, 'recall', 'כ'), A('2026-11-19', false, 'recall', 'כ'), A('2026-11-20', true, 'match'));
    const sound = fold(A('2026-11-19', true), A('2026-11-21', false, 'recall', 'ר'), A('2026-11-21', false, 'recall', 'ר'), A('2026-11-21', false, 'recall', 'כ'));
    const card = unitCard([name, sound]);
    // correct recall on 18 (name) and 19 (sound); the match on 20 does not count
    expect(card.recallDays).toBe(2);
    expect(card.answers).toBe(8);
    expect(card.firstTryRate).toBeCloseTo(3 / 8);
    // כ 3 times over both items, ר twice
    expect(card.confusions).toEqual(['כ', 'ר']);
    expect(card.lastDay).toBe('2026-11-21');
    expect(unitCard([undefined, undefined])).toEqual({ recallDays: 0, answers: 0, firstTryRate: null, confusions: [], lastDay: null });
  });
  it('knownSince is the day the unit last became known', () => {
    const k = fold(A('2026-11-19', true), A('2026-11-20', true));
    expect(knownSince([k, fold(A('2026-11-18', true), A('2026-11-22', true))])).toBe('2026-11-22');
    expect(knownSince([k, undefined])).toBeNull();
    // known, lost by a mistake, known again: the later day counts
    const again = fold(A('2026-11-10', true), A('2026-11-11', true), A('2026-11-12', false), A('2026-11-14', true));
    expect(knownSince([again])).toBe('2026-11-14');
  });
});
