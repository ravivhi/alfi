// The one look every letter face draws from (owner 2026-11-21): a target is drawn exactly like any other letter, so
// nothing about its colour or size singles it out. Feedback colour appears only after a pick.
import type { Rng } from '../util/rng.ts';
import { contrastRatio } from '../util/contrast.ts';

/** The old plane's balloon colours. */
export const FACE_PALETTE: readonly string[] = ['#FFC928', '#E53935', '#1E6FD9', '#2EB85C', '#FB8C00', '#AB47BC', '#00ACC1'];
/** Uniform size multipliers (font and box). */
export const FACE_SCALES: readonly number[] = [0.9, 1, 1.1];

const INK = '#1D2742';
const WHITE = '#FFFFFF';

export interface FaceLook { bg: string; ink: string; scale: number }

/** Ink or white, whichever reads better on bg. */
export function faceInk(bg: string): string {
  return contrastRatio(INK, bg) >= contrastRatio(WHITE, bg) ? INK : WHITE;
}

/** Uniform over palette and scales; the same call for a target and a distractor. */
export function faceLook(rng: Rng): FaceLook {
  const bg = rng.pick(FACE_PALETTE);
  return { bg, ink: faceInk(bg), scale: rng.pick(FACE_SCALES) };
}

/** n looks with distinct colours (a shuffled palette slice), scales uniform. */
export function faceLooks(rng: Rng, n: number): FaceLook[] {
  return rng.shuffle(FACE_PALETTE).slice(0, n).map(bg => ({ bg, ink: faceInk(bg), scale: rng.pick(FACE_SCALES) }));
}

/** Attributes every letter face carries (class for the style, data for the tests). */
export function faceAttrs(look: FaceLook): Record<string, string> {
  return { class: 'pick-face', 'data-bg': look.bg, 'data-scale': String(look.scale) };
}

/** Colour part of a face's style. */
export const faceColors = (look: FaceLook): string => `background:${look.bg};color:${look.ink}`;

/** A base pixel size times the look's scale. */
export const faceSize = (px: number, look: FaceLook): number => Math.round(px * look.scale * 10) / 10;

/** What a collected / correct face turns into (white ring and the green). */
export function faceCorrect(el: HTMLElement): void {
  el.style.background = '#2E9E5B';
  el.style.color = '#FFFFFF';
  el.style.boxShadow = '0 0 0 4px #FFFFFF';
}
