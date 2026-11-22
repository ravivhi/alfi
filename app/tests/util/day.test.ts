import { it, expect } from 'vitest';
import { dayKey, daysBetween, addDays } from '../../src/util/day.ts';

it('dayKey uses local date', () => expect(dayKey(new Date(2026, 10, 21, 23, 59))).toBe('2026-11-21'));
it('daysBetween across a DST change is whole days', () => expect(daysBetween('2027-03-25', '2027-03-27')).toBe(2));
it('addDays crosses month end', () => expect(addDays('2026-11-30', 1)).toBe('2026-12-01'));
