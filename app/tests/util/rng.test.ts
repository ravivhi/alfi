import { it, expect } from 'vitest';
import { createRng } from '../../src/util/rng.ts';

it('same seed gives the same sequence', () => { const a = createRng(7), b = createRng(7); expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]); });
it('int stays inclusive in range', () => { const r = createRng(1); for (let i = 0; i < 1000; i++) { const v = r.int(2, 4); expect(v >= 2 && v <= 4).toBe(true); } });
it('shuffle keeps elements', () => expect(createRng(3).shuffle([1,2,3,4]).sort()).toEqual([1,2,3,4]));
