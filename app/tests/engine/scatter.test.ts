import { describe, it, expect } from 'vitest';
import { scatterSequence, type Spawn } from '../../src/engine/scatter.ts';
import { createRng } from '../../src/util/rng.ts';

const check = (seq: Spawn[], same = (a: number, b: number) => a === b) => { const t = seq.filter(s => s.target); seq.forEach((s, i) => i && expect(s.target && seq[i - 1].target).toBe(false)); t.forEach((s, i) => i && expect(same(s.lane, t[i - 1].lane)).toBe(false)); };

describe('scatterSequence', () => {
  it('S1-S3 hold over 500 seeds', () => { for (let s = 0; s < 500; s++) { const seq = scatterSequence({ targets: 6, others: 8, lanes: 3, rng: createRng(s) }); expect(seq.filter(x => x.target).length).toBe(6); expect(seq.length).toBe(14); check(seq); const per = [0,1,2].map(l => seq.filter(x => x.target && x.lane === l).length); expect(Math.max(...per) - Math.min(...per)).toBeLessThanOrEqual(1); } });
  it('sameGroup keeps consecutive mole targets out of one column', () => { const col = (a: number, b: number) => a % 3 === b % 3; for (let s = 0; s < 200; s++) check(scatterSequence({ targets: 4, others: 5, lanes: 9, rng: createRng(s), sameGroup: col }), col); });
  it('throws when there are too few others to separate targets', () => expect(() => scatterSequence({ targets: 5, others: 3, lanes: 3, rng: createRng(1) })).toThrow());
});
