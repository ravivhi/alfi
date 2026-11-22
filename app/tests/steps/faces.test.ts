import { describe, it, expect } from 'vitest';
import { FACE_PALETTE, FACE_SCALES, faceInk, faceLook, faceLooks } from '../../src/steps/faces.ts';
import { contrastRatio } from '../../src/util/contrast.ts';
import { createRng } from '../../src/util/rng.ts';

describe('faces', () => {
  it('every palette colour has >= 3:1 with its ink', () => {
    expect(FACE_PALETTE).toHaveLength(7);
    for (const bg of FACE_PALETTE) {
      const ink = faceInk(bg);
      expect(['#1D2742', '#FFFFFF']).toContain(ink);
      expect(contrastRatio(ink, bg), bg).toBeGreaterThanOrEqual(3);
    }
  });
  it('faceInk is the ink for the light colours and white for the dark ones', () => {
    for (const bg of ['#FFC928', '#2EB85C', '#FB8C00', '#00ACC1']) expect(faceInk(bg), bg).toBe('#1D2742');
    for (const bg of ['#E53935', '#1E6FD9', '#AB47BC']) expect(faceInk(bg), bg).toBe('#FFFFFF');
  });
  it('faceLook is uniform: over 7000 draws each colour is 1/7 +- 0.02 and each scale 1/3 +- 0.02', () => {
    const rng = createRng(11);
    const colours = new Map<string, number>(), scales = new Map<number, number>();
    const N = 7000;
    for (let i = 0; i < N; i++) {
      const l = faceLook(rng);
      expect(l.ink).toBe(faceInk(l.bg));
      colours.set(l.bg, (colours.get(l.bg) ?? 0) + 1);
      scales.set(l.scale, (scales.get(l.scale) ?? 0) + 1);
    }
    expect(colours.size).toBe(FACE_PALETTE.length);
    for (const n of colours.values()) expect(Math.abs(n / N - 1 / 7)).toBeLessThanOrEqual(0.02);
    expect([...scales.keys()].sort()).toEqual([...FACE_SCALES].sort());
    for (const n of scales.values()) expect(Math.abs(n / N - 1 / 3)).toBeLessThanOrEqual(0.02);
  });
  it('faceLooks gives distinct colours', () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      const n = 2 + (i % 4);
      const looks = faceLooks(rng, n);
      expect(looks).toHaveLength(n);
      expect(new Set(looks.map(l => l.bg)).size).toBe(n);
      for (const l of looks) expect(FACE_SCALES).toContain(l.scale);
    }
  });
});
