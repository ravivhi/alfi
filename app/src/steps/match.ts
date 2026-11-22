// Matching pairs: face-up cards; find two identical letters. Round 1 holds the target among distant letters,
// round 2 adds the target's look-alike on purpose. Only pairs and mismatches involving the target are evidence.
import type { StepContext, StepModule } from './contract.ts';
import type { AnswerEvent, StepResult, UnitId } from '../engine/types.ts';
import type { Rng } from '../util/rng.ts';
import { stepUnit } from './find.ts';
import { itemId } from '../engine/curriculum.ts';
import { line } from '../audio/lines.ts';
import { h } from '../util/dom.ts';
import { faceAttrs, faceLook } from './faces.ts';
import { combo, createGame, instruct, measure, speakCapped } from './gameKit.ts';

export type Texture = 'color' | 'plain' | 'stripe' | 'wave' | 'dot' | 'outline';
export const TEXTURES: readonly Texture[] = ['color', 'plain', 'stripe', 'wave', 'dot', 'outline'];
export interface MatchCard { letter: UnitId; tex: Texture }

/**
 * Two rounds of pairs/2 letters x 2 textures (old: 6 pairs). Three textures per round in a cycle (A: t1 t2, B: t2 t3,
 * C: t3 t1), so neither the letter nor the texture alone finds a pair. Round 1: target + distant letters; round 2:
 * target + look-alike + distant. Cards are shuffled.
 */
export function buildMatchRounds(target: UnitId, lookAlike: UnitId, distant: UnitId[], pairs: number, rng: Rng): MatchCard[][] {
  const pool = distant.filter((x) => x !== target && x !== lookAlike);
  const n = Math.max(3, Math.round(pairs / 2));
  const deal = (letters: UnitId[]): MatchCard[] => {
    const tex = rng.shuffle(TEXTURES).slice(0, n);
    const order = rng.shuffle(letters);
    return rng.shuffle(order.flatMap((letter, i) => [tex[i], tex[(i + 1) % n]].flatMap((t) => [{ letter, tex: t }, { letter, tex: t }])));
  };
  return [
    deal([target, ...rng.shuffle(pool).slice(0, n - 1)]),
    deal([target, lookAlike, ...rng.shuffle(pool).slice(0, n - 2)]),
  ];
}

const GAP = 10;
const SIDE = 16;
/** Old grid formula; 4 columns unless the area is narrower than 300px. */
export function gridLayout(w: number, hh: number, count: number): { cols: number; cell: number } {
  const cols = w < 300 ? 3 : 4;
  const rows = Math.ceil(count / cols);
  const cell = Math.max(60, Math.min((w - (cols - 1) * GAP) / cols, (hh - (rows - 1) * GAP) / rows, 170));
  return { cols, cell: Math.floor(cell) };
}

const INK = '#0D2A5C';
/** The selected card: a thick navy and white double ring and the 1.07 scale; no palette colour, so a red card reads as selected too. */
export const SELECTED_STYLE = { transform: 'scale(1.07)', borderColor: INK, boxShadow: `0 0 0 3px #FFFFFF, 0 0 0 8px ${INK}` } as const;
const TEXTURE_DEFS = (p: string): string => `<defs>
<linearGradient id="${p}color" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E53935"/><stop offset=".25" stop-color="#FB8C00"/><stop offset=".5" stop-color="#FFC928"/><stop offset=".75" stop-color="#2EB85C"/><stop offset="1" stop-color="#1E6FD9"/></linearGradient>
<pattern id="${p}stripe" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="#FFFFFF"/><rect width="7" height="14" fill="#1E6FD9"/></pattern>
<pattern id="${p}wave" width="24" height="12" patternUnits="userSpaceOnUse"><rect width="24" height="12" fill="#FFF3CD"/><path d="M0 6 Q6 0 12 6 T24 6" fill="none" stroke="#E53935" stroke-width="3"/></pattern>
<pattern id="${p}dot" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#E8F5E9"/><circle cx="6" cy="6" r="3.2" fill="#2EB85C"/></pattern>
</defs>`;
const textureFill = (p: string, t: Texture): string => (t === 'plain' ? INK : t === 'outline' ? '#FFFFFF' : `url(#${p}${t})`);
const faceSvg = (p: string, letter: string, t: Texture, scale: number): string =>
  `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style="display:block"><text x="50" y="80" text-anchor="middle" font-family="Rubik,sans-serif" font-weight="900" font-size="${Math.round(86 * scale)}" data-fill="${t}" fill="${textureFill(p, t)}"${t === 'plain' ? '' : ` stroke="${INK}" stroke-width="${t === 'outline' ? 5 : 2.5}" paint-order="stroke" stroke-linejoin="round" stroke-linecap="round"`}>${letter}</text></svg>`;

let runs = 0;

/** Letters far from the target: not the target, not a look-alike, not a same-sound letter. */
export function distantLetters(ctx: StepContext, target: UnitId): UnitId[] {
  const c = ctx.content;
  const look = c.lookAlikes[target] ?? [];
  const sound = c.sameSound.filter((g) => g.includes(target)).flat();
  return Object.keys(c.alphabet).filter((u) => u !== target && !look.includes(u) && !sound.includes(u));
}

const MATCH_MS = 650;
const MISS_MS = 450;
// The textures were drawn against white cards: the card stays white and its colour look is the border.
const cardStyle = (cell: number, edge: string): string => `box-sizing:border-box;width:${cell}px;height:${cell}px;background:#FFFFFF;border:4px solid ${edge};border-radius:18px;padding:4px;box-shadow:0 5px 0 ${INK};cursor:pointer;touch-action:manipulation;transition:transform .15s,opacity .3s,background .15s`;
const KEYFRAMES = '@keyframes mtshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}@keyframes mtpop{0%{transform:scale(1)}50%{transform:scale(1.18)}100%{transform:scale(1)}}';

export const matchStep: StepModule = {
  id: 'match',
  async run(ctx: StepContext): Promise<StepResult> {
    if (ctx.signal.aborted) return { outcome: 'aborted', answers: [], slips: 0, ms: 0 };
    const c = ctx.content;
    const unit = stepUnit(ctx);
    const nameOf = (u: string): string => c.alphabet[u]?.name ?? u;
    const distant = distantLetters(ctx, unit);
    const lookAlike = (c.lookAlikes[unit] ?? [])[0] ?? distant[0];
    // the cycle deal needs pairs = 6 (three letters x two textures); the rounds count comes from the profile
    const rounds = buildMatchRounds(unit, lookAlike, distant, ctx.profile.match.pairs, ctx.rng).slice(0, ctx.profile.match.rounds);
    const game = createGame(ctx);
    const answers: AnswerEvent[] = [];
    const sfx = (n: Parameters<StepContext['sfx']['play']>[0]): void => { try { ctx.sfx.play(n); } catch { /* no audio */ } };
    const streak = combo(ctx.sfx);

    const prefix = `mt${++runs}-`;
    const root = h('div', { 'data-step': 'match', style: `align-self:stretch;flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:0 ${SIDE}px;box-sizing:border-box` });
    root.insertAdjacentHTML('beforeend', `<style>${KEYFRAMES}</style><svg width="0" height="0" aria-hidden="true" style="position:absolute" data-defs="1">${TEXTURE_DEFS(prefix)}</svg>`);
    const dots = h('div', { 'data-dots': '1', style: 'display:flex;gap:8px' });
    for (let i = 0; i < rounds.length; i++) dots.appendChild(h('span', { 'data-dot': String(i), style: `width:18px;height:18px;border-radius:50%;box-sizing:border-box;background:${i === 0 ? '#FFC928' : '#FFFFFF'};border:3px solid ${INK}` }));
    const holder = h('div', { style: 'display:flex;align-items:center;justify-content:center' });
    root.append(dots, holder);
    ctx.stage.appendChild(root);

    const playRound = (ri: number): void => {
      const cards = rounds[ri];
      const m = measure(root);
      const { cols, cell } = gridLayout(m.w - 2 * SIDE, m.h - 60, cards.length);
      const grid = h('div', { 'data-round': String(ri + 1), 'data-cols': String(cols), 'data-cell': String(cell), style: `display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:${GAP}px;justify-content:center` });
      holder.replaceChildren(grid);
      dots.querySelectorAll<HTMLElement>('[data-dot]').forEach((d, i) => { d.style.background = i < ri ? '#FFC928' : '#FFFFFF'; });
      let sel: HTMLElement | null = null;
      let busy = false;
      let left = cards.length;

      const unselect = (el: HTMLElement): void => { el.style.transform = ''; el.style.borderColor = el.dataset.bg ?? INK; el.style.boxShadow = `0 5px 0 ${INK}`; };
      const onCard = (el: HTMLElement): void => {
        if (busy || el.hasAttribute('data-matched')) return;
        if (!sel) {
          sel = el; sfx('pick');
          el.style.transform = SELECTED_STYLE.transform; el.style.borderColor = SELECTED_STYLE.borderColor; el.style.boxShadow = SELECTED_STYLE.boxShadow;
          return;
        }
        if (sel === el) { unselect(el); sel = null; return; }
        const a = sel, b = el;
        sel = null;
        const la = a.dataset.letter!, lb = b.dataset.letter!;
        busy = true;
        if (la === lb && a.dataset.texture === b.dataset.texture) {
          for (const x of [a, b]) {
            x.setAttribute('data-matched', '');
            x.style.background = '#C8F7D4';
            x.style.borderColor = '#2EB85C';
            x.style.boxShadow = '0 5px 0 #2EB85C';
            x.style.transform = '';
            x.style.animation = 'mtpop .35s';
          }
          if (la === unit) answers.push({ item: itemId(unit, 'name'), ok: true, kind: 'match', t: Date.now() });
          sfx('good'); streak.hit();
          void speakCapped(game, nameOf(la));
          game.later(MATCH_MS, () => {
            for (const x of [a, b]) { x.style.animation = ''; x.style.transform = 'scale(.2)'; x.style.opacity = '0'; x.style.visibility = 'hidden'; }
            busy = false;
            left -= 2;
            ctx.progress((ri + 1 - left / cards.length) / rounds.length);
            if (left > 0) return;
            sfx('chime');
            game.later(700, () => {
              if (ri + 1 < rounds.length) playRound(ri + 1);
              else game.done(answers, 0);
            });
          });
        } else {
          // the same letter in two textures, or two non-target letters, is nothing (old m:false)
          if (la !== lb && (la === unit || lb === unit)) {
            answers.push({ item: itemId(unit, 'name'), ok: false, kind: 'match', chose: la === unit ? lb : la, t: Date.now() });
          }
          sfx('bad'); streak.miss();
          for (const x of [a, b]) { unselect(x); x.style.borderColor = '#E53935'; x.style.animation = 'mtshake .4s'; }
          game.later(MISS_MS, () => { for (const x of [a, b]) { unselect(x); x.style.animation = ''; } busy = false; });
        }
      };

      // texture is the matching attribute; colour and size are drawn per card, independent of the pair
      for (const card of cards) {
        const look = { ...faceLook(ctx.rng), scale: 1 }; // colour is drawn per card; the glyph size is fixed
        const el = h('button', { type: 'button', ...faceAttrs(look), 'data-card': '1', 'data-letter': card.letter, 'data-texture': card.tex, 'aria-label': card.letter, style: cardStyle(cell, look.bg) });
        el.innerHTML = faceSvg(prefix, card.letter, card.tex, look.scale);
        game.listen(el, 'click', () => onCard(el));
        grid.appendChild(el);
      }
      void instruct(ctx, game, ri === 0 ? line(c, 'match.ask1') : line(c, 'match.ask2', { name: nameOf(lookAlike) }));
    };

    playRound(0);
    return game.result;
  },
};
