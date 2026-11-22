// Plane and balloons: the plane follows the finger's height (press and hold or drag anywhere); pop only the balloons of the letter the voice named.
// A wrong balloon touched while steering is a motor slip (it bumps away), never a knowledge error. A pop is evidence
// only when the child steered within ACTIVE_SEC before it (a plane left alone still pops, with no answer).
import type { StepContext, StepModule } from './contract.ts';
import type { AnswerEvent, StepResult } from '../engine/types.ts';
import { stepUnit } from './find.ts';
import { line } from '../audio/lines.ts';
import { h } from '../util/dom.ts';
import { faceAttrs, faceColors, faceCorrect, faceLook, faceSize } from './faces.ts';
import type { FaceLook } from './faces.ts';
import { activity, combo, createGame, createSpawner, instruct, measure, otherLetters, prefersReducedMotion, recallOk, speakCapped, starHud } from './gameKit.ts';

const TOP = 70;          // below the star row
const FINGER_FRAC = 0.25; // the bottom share of the stage stays free of the plane, so a finger dragging there never covers it
const PLANE_HALF_H = 35;
const BALLOON_W = 58;
const BALLOON_H = 72;
const JITTER = 0.16;     // of a row: balloons never sit on one exact line, so targets never form a trail

const PLANE_SVG = '<svg width="120" height="70" viewBox="0 0 120 70" aria-hidden="true"><path d="M10 38 Q 60 20 108 34 L 112 42 Q 60 52 14 46 z" fill="#E8641B" stroke="#9E3F0B" stroke-width="2"></path><path d="M54 34 L 40 6 L 62 6 L 74 34z" fill="#FF9A52" stroke="#9E3F0B" stroke-width="2"></path><path d="M54 44 L 44 64 L 64 64 L 72 44z" fill="#FF9A52" stroke="#9E3F0B" stroke-width="2"></path><circle cx="96" cy="37" r="5" fill="#BFE3FF" stroke="#9E3F0B" stroke-width="2"></circle><path d="M110 30 v18" stroke="#1D2742" stroke-width="3" stroke-linecap="round"></path></svg>';
const SKY_SVG = '<svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none" style="position:absolute;inset:0" aria-hidden="true"><ellipse cx="80" cy="190" rx="60" ry="20" fill="#FFFFFF" opacity="0.8"></ellipse><ellipse cx="300" cy="300" rx="70" ry="22" fill="#FFFFFF" opacity="0.7"></ellipse><ellipse cx="150" cy="560" rx="80" ry="24" fill="#FFFFFF" opacity="0.6"></ellipse><path d="M0 760 Q 100 720 200 750 T 390 740 V 844 H 0z" fill="#8ED19B"></path></svg>';
// the face's size follows its look; the wrapper keeps the base width, so a bigger face overhangs it evenly
const faceStyle = (look: FaceLook): string => `box-sizing:border-box;width:${faceSize(BALLOON_W, look)}px;height:${faceSize(BALLOON_H, look)}px;margin:0 ${(BALLOON_W - faceSize(BALLOON_W, look)) / 2}px;border-radius:50% 50% 46% 46%;${faceColors(look)};box-shadow:inset -8px -10px 0 rgba(0,0,0,.08);display:flex;align-items:center;justify-content:center;font-size:${faceSize(32, look)}px;line-height:1;font-family:Rubik,sans-serif;font-weight:800`;

interface Balloon { el: HTMLElement; face: HTMLElement; letter: string; target: boolean; x: number; y: number; state: 'fly' | 'popped' | 'bumped'; vx: number; vy: number; life: number }

export const planeStep: StepModule = {
  id: 'plane',
  async run(ctx: StepContext): Promise<StepResult> {
    if (ctx.signal.aborted) return { outcome: 'aborted', answers: [], slips: 0, ms: 0 };
    const c = ctx.content;
    const unit = stepUnit(ctx);
    const name = c.alphabet[unit]?.name ?? unit;
    const cfg = ctx.profile.plane;
    const need = cfg.targets;
    const lanes = cfg.lanes;
    const others = otherLetters(ctx, unit, 3);
    const reduced = prefersReducedMotion();
    const game = createGame(ctx);

    // ---- view
    const hud = starHud(need);
    const plane = h('div', { 'data-plane': '1', 'data-lane': String(Math.floor(lanes / 2)), 'aria-hidden': 'true', style: 'position:absolute;left:0;top:0;width:120px;height:70px;z-index:3;will-change:transform' });
    plane.innerHTML = PLANE_SVG;
    const layer = h('div', { style: 'position:absolute;inset:0;z-index:2' });
    const sky = h('div', { style: 'position:absolute;inset:0;pointer-events:none' });
    sky.innerHTML = SKY_SVG;
    const arena = h('div', {
      'data-step': 'plane',
      style: 'position:absolute;inset:0;overflow:hidden;background:#BFE3FF;touch-action:none;user-select:none;-webkit-user-select:none',
    }, sky, layer, plane, hud.el);
    ctx.stage.appendChild(arena);

    // ---- geometry (re-measured on resize)
    let W = 390, H = 600, rowGap = 100;
    const rowY = (i: number): number => TOP + rowGap * (i + 0.5);
    const layout = (): void => {
      const m = measure(arena);
      W = m.w; H = m.h;
      rowGap = Math.max(60, (H * (1 - FINGER_FRAC) - TOP) / lanes);
    };
    layout();
    const planeX = (): number => Math.max(70, W * 0.18);
    let ty = rowY(Math.floor(lanes / 2));
    let py = ty;
    const nearestRow = (y: number): number => Math.max(0, Math.min(lanes - 1, Math.round((y - TOP) / rowGap - 0.5)));
    const setTy = (y: number): void => {
      ty = Math.max(TOP, Math.min(H * (1 - FINGER_FRAC) - PLANE_HALF_H, y));
      plane.setAttribute('data-lane', String(nearestRow(ty)));
    };
    let clock = 0;
    const act = activity();
    const step = (d: number): void => { act.mark(clock); setTy(rowY(Math.max(0, Math.min(lanes - 1, nearestRow(ty) + d)))); };

    game.listen(window, 'resize', () => { layout(); setTy(rowY(nearestRow(ty))); });
    game.listen(document, 'keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'ArrowUp') { step(-1); e.preventDefault(); } else if (k === 'ArrowDown') { step(1); e.preventDefault(); }
    });
    // a press anywhere on the stage, held or dragged, moves the plane to the finger's height
    let dragId: number | null = null;
    let arenaTop = 0; // measured once per drag, so a move never forces a layout read
    const yOf = (e: PointerEvent): number => e.clientY - arenaTop;
    game.listen(arena, 'pointerdown', (ev) => {
      const e = ev as PointerEvent;
      if (dragId !== null) return;
      dragId = e.pointerId;
      arenaTop = arena.getBoundingClientRect().top;
      try { arena.setPointerCapture(e.pointerId); } catch { /* not supported */ }
      act.mark(clock);
      setTy(yOf(e));
    });
    game.listen(arena, 'pointermove', (ev) => { const e = ev as PointerEvent; if (e.pointerId === dragId) { act.mark(clock); setTy(yOf(e)); } });
    const release = (ev: Event): void => { if ((ev as PointerEvent).pointerId === dragId) dragId = null; };
    game.listen(arena, 'pointerup', release);
    game.listen(arena, 'pointercancel', release);
    game.listen(arena, 'lostpointercapture', release);

    // ---- play
    const spawner = createSpawner({ lanes, rng: ctx.rng });
    const balloons: Balloon[] = [];
    const answers: AnswerEvent[] = [];
    let slips = 0, got = 0, seq = 0, inFlight = 0;
    let spawning = false, finishing = false;
    let spawnIn = 0;

    const spawn = (): void => {
      const s = spawner.next(need - got - inFlight);
      const letter = s.target ? unit : ctx.rng.pick(others);
      const look = faceLook(ctx.rng);
      const face = h('div', { ...faceAttrs(look), style: faceStyle(look) }, letter);
      const el = h('div', {
        'data-balloon': '1', 'data-lane': String(s.lane), 'data-seq': String(seq++), 'aria-hidden': 'true',
        style: `position:absolute;left:0;top:0;width:${BALLOON_W}px;will-change:transform;transition:opacity .3s`,
      }, face, h('div', { style: 'width:2px;height:26px;margin:0 auto;background:#7A8AA8' }));
      const y = rowY(s.lane) + (ctx.rng.next() * 2 - 1) * JITTER * rowGap;
      const b: Balloon = { el, face, letter, target: s.target, x: W + 40, y, state: 'fly', vx: 0, vy: 0, life: 0 };
      if (s.target) inFlight++;
      balloons.push(b);
      layer.appendChild(el);
      place(b, 1);
    };
    const place = (b: Balloon, scale: number): void => {
      b.el.style.transform = `translate(${(b.x - BALLOON_W / 2).toFixed(1)}px,${(b.y - BALLOON_H / 2).toFixed(1)}px)${scale !== 1 ? ` scale(${scale.toFixed(2)})` : ''}`;
    };
    const sfx = (n: Parameters<StepContext['sfx']['play']>[0]): void => { try { ctx.sfx.play(n); } catch { /* no audio */ } };

    const streak = combo(ctx.sfx);
    const pop = (b: Balloon): void => {
      b.state = 'popped';
      inFlight--;
      got++;
      if (act.recent(clock)) answers.push(recallOk(unit));
      b.el.classList.add('is-popped');
      faceCorrect(b.face);
      b.el.style.opacity = '0';
      place(b, reduced ? 1 : 1.4);
      sfx('pop'); sfx('good'); streak.hit();
      hud.fill(got);
      ctx.progress(got / need);
      game.later(350, () => drop(b));
      const said = speakCapped(game, name);
      if (got >= need) {
        finishing = true;
        void said.then(() => game.later(700, () => game.done(answers, slips)));
      }
    };
    const bump = (b: Balloon): void => {
      b.state = 'bumped';
      slips++;
      b.el.classList.add('is-bumped');
      b.vx = 160; b.vy = b.y < py ? -260 : 260; b.life = 0.5;
      b.el.style.opacity = '0';
      sfx('bad'); streak.miss();
    };
    const drop = (b: Balloon): void => {
      const i = balloons.indexOf(b);
      if (i >= 0) balloons.splice(i, 1);
      b.el.remove();
    };

    game.loop((dt) => {
      clock += dt;
      if (dragId !== null) act.mark(clock); // a finger held on the sky keeps the plane at its height: steering
      py += (ty - py) * Math.min(1, dt * 9);
      const bob = reduced ? 0 : Math.sin(clock * 2.2) * 4;
      const px = planeX();
      const tilt = Math.max(-12, Math.min(12, (ty - py) * 0.15));
      plane.style.transform = `translate(${(px - 60).toFixed(1)}px,${(py - 35 + bob).toFixed(1)}px) rotate(${tilt.toFixed(1)}deg)`;

      if (spawning && !finishing) {
        spawnIn -= dt;
        if (spawnIn <= 0) { spawn(); spawnIn = cfg.spawnGapSec; }
      }
      const speed = (W + 100) / cfg.travelSec;
      const reach = Math.min(48, rowGap * 0.42);
      for (const b of balloons.slice()) {
        if (b.state === 'fly') {
          b.x -= speed * dt;
          place(b, 1);
          if (!finishing && b.x - px > -40 && b.x - px < 60 && Math.abs(b.y - py) < reach) {
            if (b.target) pop(b); else bump(b);
          } else if (b.x < -BALLOON_W) {
            drop(b);
            if (b.target) { inFlight--; spawner.redraw(need - got - inFlight); }
          }
        } else if (b.state === 'bumped') {
          b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
          place(b, 1);
          if (b.life <= 0) drop(b);
        }
      }
    });

    void instruct(ctx, game, line(c, 'plane.ask', { name })).then(() => { spawning = true; });
    return game.result;
  },
};
