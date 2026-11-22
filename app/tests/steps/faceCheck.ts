// Shared by the game face tests: targets must be drawn like the other letters (colour and scale frequencies).
import { expect } from 'vitest';
import { FACE_PALETTE, FACE_SCALES } from '../../src/steps/faces.ts';

export interface FaceSeen { target: boolean; bg: string; scale: number }
export interface FaceSplit { target: FaceSeen[]; other: FaceSeen[] }

// chi-square critical values at p = 0.001 for df 6 (7 colours) and df 2 (3 scales)
const CHI_COLOUR = 22.46;
const CHI_SCALE = 13.82;

function chi2(target: FaceSeen[], other: FaceSeen[], keys: readonly (string | number)[], pick: (f: FaceSeen) => string | number): number {
  let x = 0;
  for (const k of keys) {
    const t = target.filter(f => pick(f) === k).length / target.length;
    const o = other.filter(f => pick(f) === k).length / other.length;
    x += target.length * (t - o) ** 2 / o;
  }
  return x;
}

export function expectSameLook(s: FaceSplit): void {
  expect(s.target.length).toBeGreaterThanOrEqual(300);
  expect(s.other.length).toBeGreaterThanOrEqual(300);
  for (const bg of FACE_PALETTE) {
    const t = s.target.filter(f => f.bg === bg).length / s.target.length;
    const o = s.other.filter(f => f.bg === bg).length / s.other.length;
    expect(Math.abs(t - o), bg).toBeLessThanOrEqual(0.06);
  }
  for (const sc of FACE_SCALES) {
    const t = s.target.filter(f => f.scale === sc).length / s.target.length;
    const o = s.other.filter(f => f.scale === sc).length / s.other.length;
    expect(Math.abs(t - o), 'scale ' + sc).toBeLessThanOrEqual(0.06);
  }
  expect(chi2(s.target, s.other, FACE_PALETTE, f => f.bg), 'colour chi-square').toBeLessThanOrEqual(CHI_COLOUR);
  expect(chi2(s.target, s.other, FACE_SCALES, f => f.scale), 'scale chi-square').toBeLessThanOrEqual(CHI_SCALE);
}
