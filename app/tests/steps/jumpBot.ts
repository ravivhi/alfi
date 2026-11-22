// Shared by the dino tests: reads the course from the DOM and taps where a hop clears the thing ahead or catches a
// target. The hop is about airSpeed * 2 * jumpVel / gravity = 172 units long and 192 high; call tick every frame (16 ms).
import { JUMP } from '../../src/steps/jump.ts';

const GY = JUMP.groundY;

export type Kind = 'target' | 'wrong' | 'pit' | 'step' | 'rock';
export interface Thing { kind: Kind; x: number; x1?: number; y?: number; seq?: string; dead?: boolean }

const els = (root: ParentNode, sel: string) => Array.from(root.querySelectorAll(sel)) as HTMLElement[];
const num = (el: HTMLElement, k: string) => Number(el.dataset[k]);

/** The course as drawn: letters, rocks, and the pits / step-ups read from the ground pieces, sorted by x. */
export function readCourse(root: ParentNode, target: string): Thing[] {
  const grounds = els(root, '[data-ground]').map(g => ({ x0: num(g, 'x0'), x1: num(g, 'x1'), y: num(g, 'y') })).sort((a, b) => a.x0 - b.x0);
  const out: Thing[] = [];
  for (let i = 0; i + 1 < grounds.length; i++) if (grounds[i + 1].x0 > grounds[i].x1 + 0.5) out.push({ kind: 'pit', x: grounds[i].x1, x1: grounds[i + 1].x0 });
  for (const g of grounds) if (g.y < GY) out.push({ kind: 'step', x: g.x0, x1: g.x1 });
  for (const r of els(root, '[data-rock]')) out.push({ kind: 'rock', x: num(r, 'x') });
  for (const s of els(root, '[data-sign]')) {
    out.push({ kind: s.textContent === target ? 'target' : 'wrong', x: num(s, 'x'), y: num(s, 'y'), seq: s.dataset.seq, dead: s.hasAttribute('data-dead') });
  }
  return out.sort((a, b) => a.x - b.x);
}

/** The dino's feet in world units, read from its transform. */
export function dinoAt(root: ParentNode): { x: number; y: number } {
  const el = root.querySelector('[data-dino]') as HTMLElement;
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]) };
}

/** A player that hops once per thing (and per heart left, so it hops again after a restart). */
export function createDinoBot(root: ParentNode, target: string): { tick(only?: (t: Thing) => boolean): void } {
  const done = new Set<string>();
  return {
    tick(only) {
      const dino = root.querySelector('[data-dino]') as HTMLElement | null;
      const arena = root.querySelector('[data-step="jump"]');
      if (!dino || !arena || dino.dataset.on !== '1') return;
      const me = dinoAt(root);
      const lives = els(root, '[data-heart][data-full]').length;
      for (const t of readCourse(root, target)) {
        if (t.dead || (only && !only(t))) continue;
        let at: number;
        if (t.kind === 'pit' || t.kind === 'step') at = t.x - 30;
        else if (t.kind === 'rock') at = t.x - 50;
        else if (t.kind === 'wrong') at = t.x - 46;
        else {
          const hgt = GY - t.y!;
          at = hgt <= 60 ? t.x - 45 : hgt < 150 ? t.x - 60 : t.x - 70;
        }
        const key = `${t.kind}:${t.seq ?? t.x}:${lives}`;
        if (!done.has(key) && me.x >= at && me.x < at + 25) {
          done.add(key);
          arena.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          return;
        }
      }
    },
  };
}
