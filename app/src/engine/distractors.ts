import type { Rng } from '../util/rng.ts';
import type { UnitId } from './types.ts';

export type Pool = 'confusions' | 'lookAlikes' | 'taught';

export interface DistractorInput {
  target: UnitId;
  n: number;
  mode: 'look' | 'sound';
  alphabet: UnitId[];
  lookAlikes: Record<UnitId, UnitId[]>;
  sameSound: UnitId[][];
  taught: UnitId[];
  confusions: UnitId[];
  prefer: Pool[];
  rng: Rng;
}

export function chooseDistractors(i: DistractorInput): UnitId[] {
  const groupsOf = (u: UnitId): number[] => {
    const g: number[] = [];
    i.sameSound.forEach((grp, idx) => {
      if (grp.includes(u)) g.push(idx);
    });
    return g;
  };
  const shares = (a: UnitId, b: UnitId): boolean => {
    const gb = groupsOf(b);
    return groupsOf(a).some((g) => gb.includes(g));
  };

  const chosen: UnitId[] = [];
  const consider = (c: UnitId): void => {
    if (chosen.length >= i.n || c === i.target || chosen.includes(c)) return;
    if (i.mode === 'sound' && (shares(c, i.target) || chosen.some((o) => shares(c, o)))) return;
    chosen.push(c);
  };

  for (const pool of i.prefer) {
    const src = pool === 'confusions' ? i.confusions : pool === 'taught' ? i.taught : (i.lookAlikes[i.target] ?? []);
    for (const c of i.rng.shuffle(src)) consider(c);
  }
  for (const c of i.rng.shuffle(i.alphabet)) consider(c);
  return chosen;
}
