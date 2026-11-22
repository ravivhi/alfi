import { describe, it, expect } from 'vitest';
import { ageNow, bandForAge } from '../../src/engine/age.ts';

describe('age', () => {
  it('counts up on the anniversary', () => { expect(ageNow({ years: 4, setOn: '2026-11-21' }, '2027-11-20')).toBe(4); expect(ageNow({ years: 4, setOn: '2026-11-21' }, '2027-11-21')).toBe(5); });
  it('leap-day anniversary counts on 1 March', () => { expect(ageNow({ years: 3, setOn: '2028-02-29' }, '2029-02-28')).toBe(3); expect(ageNow({ years: 3, setOn: '2028-02-29' }, '2029-03-01')).toBe(4); });
  it('setOn in the future keeps the set age', () => expect(ageNow({ years: 5, setOn: '2030-01-01' }, '2026-11-21')).toBe(5));
  it('bands', () => { expect(bandForAge(3)).toBe('3-5'); expect(bandForAge(5)).toBe('3-5'); expect(bandForAge(6)).toBe('6-8'); expect(bandForAge(9)).toBe('6-8'); });
});
