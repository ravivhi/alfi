import type { AgeBand } from './types.ts';

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const pad = (n: number): string => (n < 10 ? '0' : '') + n;

// The day the anniversary falls on in year y (02-29 moves to 03-01 in non-leap years).
function anniversary(setOn: string, y: number): string {
  const [, m, d] = setOn.split('-').map(Number);
  if (m === 2 && d === 29 && !isLeap(y)) return y + '-03-01';
  return y + '-' + pad(m) + '-' + pad(d);
}

export function ageNow(age: { years: number; setOn: string }, today: string): number {
  if (today <= age.setOn) return age.years;
  const setYear = Number(age.setOn.slice(0, 4));
  const todayYear = Number(today.slice(0, 4));
  let n = todayYear - setYear;
  if (today < anniversary(age.setOn, todayYear)) n--;
  return age.years + Math.max(0, n);
}

export function bandForAge(n: number): AgeBand {
  return n <= 5 ? '3-5' : '6-8';
}
