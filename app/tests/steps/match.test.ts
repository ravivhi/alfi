import { describe, it, expect } from 'vitest';
import { buildMatchRounds, TEXTURES, SELECTED_STYLE } from '../../src/steps/match.ts';
import { FACE_PALETTE } from '../../src/steps/faces.ts';
import { createRng } from '../../src/util/rng.ts';

const DISTANT = ['מ', 'ל', 'ש', 'ד', 'פ'];
const deal = (seed: number) => buildMatchRounds('ב', 'כ', DISTANT, 6, createRng(seed));
const key = (c: { letter: string; tex: string }) => c.letter + '|' + c.tex;

describe('buildMatchRounds', () => {
  it('each round has 12 cards: 3 letters x 2 textures, every card twice', () => {
    for (let s = 0; s < 50; s++) for (const r of deal(s)) {
      expect(r).toHaveLength(12);
      expect(new Set(r.map(c => c.letter)).size).toBe(3);
      const kinds = new Set(r.map(key));
      expect(kinds.size).toBe(6);
      for (const k of kinds) expect(r.filter(c => key(c) === k)).toHaveLength(2);
    }
  });
  it('each texture in a round is on exactly two letters and each letter on two textures', () => {
    for (let s = 0; s < 50; s++) for (const r of deal(s)) {
      const kinds = [...new Set(r.map(key))].map(k => k.split('|'));
      for (const t of new Set(kinds.map(k => k[1]))) expect(kinds.filter(k => k[1] === t)).toHaveLength(2);
      for (const l of new Set(kinds.map(k => k[0]))) expect(kinds.filter(k => k[0] === l)).toHaveLength(2);
    }
  });
  it('round 1 is the target + 2 distant letters with no look-alike; round 2 holds the target, its look-alike and 1 distant letter', () => {
    for (let s = 0; s < 50; s++) {
      const [r1, r2] = deal(s);
      const l1 = new Set(r1.map(c => c.letter)), l2 = new Set(r2.map(c => c.letter));
      expect(l1.has('ב')).toBe(true);
      expect(l1.has('כ')).toBe(false);
      expect([...l1].filter(l => DISTANT.includes(l))).toHaveLength(2);
      expect(l2.has('ב') && l2.has('כ')).toBe(true);
      expect([...l2].filter(l => DISTANT.includes(l))).toHaveLength(1);
    }
  });
  it('a look-alike that is also in distant is still kept out of round 1', () => {
    for (let s = 0; s < 30; s++) expect(buildMatchRounds('ב', 'כ', ['כ', 'מ', 'ל', 'ש'], 6, createRng(s))[0].map(c => c.letter)).not.toContain('כ');
  });
  it("the target's textures are uniform over the six across 600 rounds (1/6 +- 0.03)", () => {
    const n = new Map<string, number>();
    let total = 0;
    for (let s = 0; s < 300; s++) for (const r of deal(s)) for (const c of r) if (c.letter === 'ב') { n.set(c.tex, (n.get(c.tex) ?? 0) + 1); total++; }
    expect(total).toBe(2400);
    for (const t of TEXTURES) expect(Math.abs((n.get(t) ?? 0) / total - 1 / 6)).toBeLessThanOrEqual(0.03);
  });
});

describe('selected pair card', () => {
  it('its style differs from every look colour: the border colour and every ring colour are outside the palette', () => {
    const palette = FACE_PALETTE.map(c => c.toLowerCase());
    expect(palette).not.toContain(SELECTED_STYLE.borderColor.toLowerCase());
    for (const c of SELECTED_STYLE.boxShadow.match(/#[0-9a-fA-F]{6}/g) ?? []) expect(palette).not.toContain(c.toLowerCase());
    expect(SELECTED_STYLE.transform).toBe('scale(1.07)');
    // a double ring: white inside, navy outside
    expect(SELECTED_STYLE.boxShadow).toMatch(/#FFFFFF/i);
  });
});
