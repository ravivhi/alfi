// Whack-a-mole: moles pop up holding letter signs; tap only the letter the voice named.
// A tap on a wrong letter is a deliberate pick (knowledge error); a tap on an empty hole does nothing.
import type { StepContext, StepModule } from './contract.ts';
import type { AnswerEvent, StepResult } from '../engine/types.ts';
import { stepUnit } from './find.ts';
import { itemId } from '../engine/curriculum.ts';
import { line } from '../audio/lines.ts';
import { h } from '../util/dom.ts';
import { faceAttrs, faceColors, faceCorrect, faceLook, faceSize } from './faces.ts';
import type { FaceLook } from './faces.ts';
import { combo, createGame, createSpawner, instruct, otherLetters, recallOk, speakCapped, starHud } from './gameKit.ts';

const MIN_DOWN_SEC = 0.5;  // a hole stays down this long before it can pop again
const AFTER_TAP_MS = 450;
const WRONG_LOCK_MS = 400; // a second wrong tap this soon after a wrong pick is mashing, not a new pick
const faceStyle = (look: FaceLook): string => `box-sizing:border-box;width:${faceSize(58, look)}px;height:${faceSize(58, look)}px;border-radius:14px;border:3px solid #0D2A5C;${faceColors(look)};display:flex;align-items:center;justify-content:center;font-size:${faceSize(40, look)}px;line-height:1;margin:0 auto;font-family:Rubik,sans-serif;font-weight:800`;
const MOLE_SVG = '<svg width="84" height="60" viewBox="0 0 84 60" aria-hidden="true" style="display:block;margin:0 auto"><ellipse cx="42" cy="60" rx="38" ry="52" fill="#8D6E63"></ellipse><ellipse cx="42" cy="62" rx="22" ry="28" fill="#D7CCC8"></ellipse><circle cx="29" cy="26" r="5" fill="#1D2742"></circle><circle cx="55" cy="26" r="5" fill="#1D2742"></circle><ellipse cx="42" cy="38" rx="8" ry="5.5" fill="#F48FB1"></ellipse></svg>';

interface Hole { el: HTMLElement; mole: HTMLElement; face: HTMLElement; up: boolean; letter: string; target: boolean; answered: boolean; left: number; down: number; pop: number }

const between = (rng: StepContext['rng'], [lo, hi]: [number, number]): number => (lo + rng.next() * (hi - lo)) / 1000;

export const moleStep: StepModule = {
  id: 'mole',
  async run(ctx: StepContext): Promise<StepResult> {
    if (ctx.signal.aborted) return { outcome: 'aborted', answers: [], slips: 0, ms: 0 };
    const c = ctx.content;
    const unit = stepUnit(ctx);
    const nameOf = (u: string): string => c.alphabet[u]?.name ?? u;
    const cfg = ctx.profile.mole;
    const need = cfg.targets;
    const count = cfg.rows * cfg.cols;
    const others = otherLetters(ctx, unit, 3);
    const game = createGame(ctx);

    // ---- view
    const hud = starHud(need);
    const grid = h('div', { style: `display:grid;grid-template-columns:repeat(${cfg.cols},minmax(0,1fr));gap:14px;width:100%;max-width:420px;margin:auto` });
    const holes: Hole[] = [];
    for (let i = 0; i < count; i++) {
      const face = h('div', { class: 'pick-face', style: faceStyle({ bg: '#FFFFFF', ink: '#1D2742', scale: 1 }) });
      const mole = h('div', { style: 'position:absolute;left:0;right:0;bottom:22px;transform:translateY(130%);transition:transform .22s ease-out;will-change:transform' }, face);
      mole.insertAdjacentHTML('beforeend', MOLE_SVG);
      const el = h('button', {
        type: 'button', 'data-hole': String(i), 'aria-label': 'גומה',
        style: 'position:relative;height:132px;min-width:88px;border:0;padding:0;border-radius:24px;background:transparent;overflow:hidden;cursor:pointer;touch-action:manipulation',
      },
      h('div', { style: 'position:absolute;left:8%;right:8%;bottom:8px;height:40px;border-radius:50%;background:#5D4037' }),
      mole,
      h('div', { style: 'position:absolute;left:4%;right:4%;bottom:0;height:24px;border-radius:0 0 50% 50%;background:#8BC34A' }));
      holes.push({ el, mole, face, up: false, letter: '', target: false, answered: false, left: 0, down: MIN_DOWN_SEC, pop: 0 });
      grid.appendChild(el);
    }
    const root = h('div', {
      'data-step': 'mole',
      style: 'position:relative;align-self:stretch;flex-grow:1;display:flex;flex-direction:column;padding:62px 14px 16px;box-sizing:border-box;user-select:none;-webkit-user-select:none',
    }, hud.el, grid);
    ctx.stage.appendChild(root);

    // ---- play
    const spawner = createSpawner({ lanes: count, rng: ctx.rng, sameGroup: (a, b) => a % cfg.cols === b % cfg.cols });
    const answers: AnswerEvent[] = [];
    let got = 0, inFlight = 0;
    let spawning = false, finishing = false, wrongLockUntil = 0;
    let nextIn = 0;
    let pending: { lane: number; target: boolean } | null = null;
    const sfx = (n: Parameters<StepContext['sfx']['play']>[0]): void => { try { ctx.sfx.play(n); } catch { /* no audio */ } };
    // targets still needed that are neither up nor already drawn and waiting for their hole
    const remaining = (): number => need - got - inFlight - (pending?.target ? 1 : 0);

    const raise = (hole: Hole, target: boolean): void => {
      hole.up = true;
      hole.target = target;
      hole.letter = target ? unit : ctx.rng.pick(others);
      hole.answered = false;
      hole.left = between(ctx.rng, cfg.upMs);
      hole.pop++;
      const look = faceLook(ctx.rng);
      hole.face.setAttribute('style', faceStyle(look));
      for (const [k, v] of Object.entries(faceAttrs(look))) hole.face.setAttribute(k, v);
      hole.face.textContent = hole.letter;
      hole.el.setAttribute('aria-label', hole.letter);
      hole.el.setAttribute('data-pop', String(hole.pop));
      hole.el.removeAttribute('data-answered');
      hole.el.setAttribute('data-up', '');
      hole.mole.style.transform = 'translateY(0)';
      if (target) inFlight++;
    };
    const lower = (hole: Hole, pop: number): void => {
      if (!hole.up || hole.pop !== pop) return;
      hole.up = false;
      hole.down = 0;
      hole.el.removeAttribute('data-up');
      hole.el.setAttribute('aria-label', 'גומה');
      hole.mole.style.transform = 'translateY(130%)';
      if (hole.target && !hole.answered) { inFlight--; spawner.redraw(remaining()); }
    };

    const streak = combo(ctx.sfx);
    const onTap = (hole: Hole): void => {
      if (!hole.up || hole.answered || finishing) return;
      sfx('bonk');
      if (hole.target) {
        hole.answered = true;
        hole.el.setAttribute('data-answered', '');
        inFlight--;
        got++;
        answers.push(recallOk(unit));
        faceCorrect(hole.face);
        hole.face.style.borderColor = '#FFFFFF';
        sfx('good'); streak.hit();
        hud.fill(got);
        ctx.progress(got / need);
        const pop = hole.pop;
        game.later(AFTER_TAP_MS, () => lower(hole, pop));
        const said = speakCapped(game, nameOf(unit));
        if (got >= need) {
          finishing = true;
          void said.then(() => game.later(800, () => game.done(answers, 0)));
        }
        return;
      }
      // two fingers on two wrong signs at once: only the first is a pick; the other just sounds bad
      streak.miss();
      if (Date.now() < wrongLockUntil) { sfx('bad'); return; }
      hole.answered = true;
      hole.el.setAttribute('data-answered', '');
      answers.push({ item: itemId(unit, 'name'), ok: false, kind: 'recall', chose: hole.letter, t: Date.now() });
      hole.face.style.background = '#E3E8F1';
      hole.face.style.color = '#8A97B2';
      sfx('bad');
      const pop = hole.pop;
      game.later(AFTER_TAP_MS, () => lower(hole, pop));
      wrongLockUntil = Date.now() + WRONG_LOCK_MS;
      void game.speak(line(c, 'find.wrong', { name: nameOf(hole.letter) }));
    };
    holes.forEach((hole) => game.listen(hole.el, 'pointerdown', (e) => { e.preventDefault(); onTap(hole); }));

    game.loop((dt) => {
      let upCount = 0;
      for (const hole of holes) {
        if (hole.up) {
          upCount++;
          if (!hole.answered) {
            hole.left -= dt;
            if (hole.left <= 0) { lower(hole, hole.pop); upCount--; }
          }
        } else {
          hole.down += dt;
        }
      }
      if (!spawning || finishing) return;
      nextIn -= dt;
      if (nextIn > 0 || upCount >= cfg.maxUp) return;
      if (!pending) pending = spawner.next(remaining());
      const hole = holes[pending.lane];
      if (hole.up || hole.down < MIN_DOWN_SEC) return; // wait for that hole; the scattered order is kept
      // a target also waits while an untapped target is up in its column, so no two targets show in one column
      if (pending.target && holes.some((o, k) => o.up && o.target && !o.answered && k % cfg.cols === pending!.lane % cfg.cols)) return;
      raise(hole, pending.target);
      pending = null;
      nextIn = between(ctx.rng, cfg.downMs);
    });

    void instruct(ctx, game, line(c, 'mole.ask', { name: nameOf(unit) })).then(() => { spawning = true; });
    return game.result;
  },
};
