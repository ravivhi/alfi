import type { Rng } from '../util/rng.ts';

export interface Spawn {
  lane: number;
  target: boolean;
}

interface ScatterOptions {
  targets: number;
  others: number;
  lanes: number;
  rng: Rng;
  sameGroup?: (a: number, b: number) => boolean;
}

export function scatterSequence(o: ScatterOptions): Spawn[] {
  const { targets, others, lanes, rng } = o;
  if (lanes < 2) throw new Error('scatterSequence needs at least 2 lanes');
  if (targets > 0 && others < targets - 1) throw new Error('scatterSequence needs others >= targets - 1');
  const same = o.sameGroup ?? ((a: number, b: number) => a === b);

  // Target lanes: whole rounds over all lanes (keeps counts within 1), no two consecutive in one group.
  const tl: number[] = [];
  while (tl.length < targets) {
    const need = Math.min(lanes, targets - tl.length);
    let round: number[] | null = null;
    for (let attempt = 0; attempt < 500 && !round; attempt++) {
      const left = rng.shuffle(Array.from({ length: lanes }, (_, k) => k));
      const r: number[] = [];
      while (r.length < need) {
        const prev = r.length ? r[r.length - 1] : tl.length ? tl[tl.length - 1] : -1;
        const l = left.find((c) => prev < 0 || !same(c, prev));
        if (l === undefined) break;
        left.splice(left.indexOf(l), 1);
        r.push(l);
      }
      if (r.length === need) round = r;
    }
    if (!round) throw new Error('scatterSequence cannot separate targets with these lanes');
    tl.push(...round);
  }

  // Gaps around targets: one other between neighbours, the rest spread randomly (ends included).
  const gaps: number[] = new Array(targets + 1).fill(0);
  for (let g = 1; g < targets; g++) gaps[g] = 1;
  let rest = others - Math.max(0, targets - 1);
  while (rest-- > 0) gaps[rng.int(0, gaps.length - 1)]++;

  const out: Spawn[] = [];
  const pushOthers = (n: number): void => {
    for (let k = 0; k < n; k++) out.push({ lane: rng.int(0, lanes - 1), target: false });
  };
  pushOthers(gaps[0]);
  for (let t = 0; t < targets; t++) {
    out.push({ lane: tl[t], target: true });
    pushOthers(gaps[t + 1]);
  }
  return out;
}
