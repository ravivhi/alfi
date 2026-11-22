export type Rng = {
  next(): number;
  int(lo: number, hi: number): number;
  pick<T>(a: readonly T[]): T;
  shuffle<T>(a: readonly T[]): T[];
};

// mulberry32
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number): number => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(a: readonly T[]): T => a[int(0, a.length - 1)];
  const shuffle = <T>(a: readonly T[]): T[] => {
    const out = a.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      const t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  };
  return { next, int, pick, shuffle };
}
