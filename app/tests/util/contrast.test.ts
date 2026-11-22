import { it, expect } from 'vitest';
import { contrastRatio } from '../../src/util/contrast.ts';
import { TOKENS, TOKEN_PAIRS } from '../../src/styles/tokens.ts';
import { FACE_PALETTE, faceInk } from '../../src/steps/faces.ts';

it('white on black is 21', () => expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0));
it('every theme pair meets its threshold', () => { for (const p of TOKEN_PAIRS) expect(contrastRatio(TOKENS[p.fg], TOKENS[p.bg]), p.where).toBeGreaterThanOrEqual(p.large || p.icon ? 3 : 4.5); });
it('the face colour tokens are the face palette, each paired with the ink faceInk picks', () => {
  const tokens = Object.entries(TOKENS).filter(([k]) => k.startsWith('face')).map(([, v]) => v);
  expect(tokens).toEqual([...FACE_PALETTE]);
  for (const bg of FACE_PALETTE) {
    const pair = TOKEN_PAIRS.find(p => TOKENS[p.bg] === bg && p.where.startsWith('letter face'))!;
    expect(TOKENS[pair.fg], bg).toBe(faceInk(bg));
  }
});
