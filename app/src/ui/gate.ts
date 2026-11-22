import { h } from '../util/dom.ts';
import type { Rng } from '../util/rng.ts';
import { REDUCED_STEPS, breakRing, fillFraction } from './screens/break.ts';

export const HOLD_MS = 3000;

export interface GateQuestion { a: number; b: number; answer: number; choices: number[] }

export function makeGateQuestion(rng: Rng): GateQuestion {
  const a = rng.int(6, 19);
  const b = rng.int(6, 19);
  const answer = a + b;
  const offsets = rng.shuffle([-10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const wrong: number[] = [];
  for (const o of offsets) {
    if (answer + o > 0 && wrong.length < 3) wrong.push(answer + o);
  }
  return { a, b, answer, choices: rng.shuffle([answer, ...wrong]) };
}

/** How far (px) a finger may drift from where it went down before the hold is given up. */
export const MOVE_SLOP = 24;

export interface HoldRing { el: HTMLElement; start(ms: number): void; reset(): void }

/** A ring that fills over a hold (CSS transition; in steps for reduced motion) and empties on reset. The caller places it. */
export function holdRing(size: number, stroke: number, stepped: boolean): HoldRing {
  const ring = breakRing(size, stroke, { track: 'rgba(30,58,122,.18)', fill: '#1E4FBF' }, stepped);
  const arc = ring.el.querySelector('.break-arc') as SVGElement | null;
  let ticker: ReturnType<typeof setInterval> | null = null;
  const stop = () => { if (ticker !== null) { clearInterval(ticker); ticker = null; } };
  ring.set(0);
  return {
    el: ring.el,
    start(ms) {
      stop();
      if (stepped) {
        let i = 0;
        ring.set(0);
        ticker = setInterval(() => { i++; ring.set(fillFraction(ms - (ms * i) / REDUCED_STEPS, ms, true)); if (i >= REDUCED_STEPS) stop(); }, ms / REDUCED_STEPS);
      } else {
        arc?.setAttribute('style', `transition:stroke-dashoffset ${ms}ms linear`);
        ring.set(1);
      }
    },
    reset() {
      stop();
      arc?.setAttribute('style', 'transition:none');
      ring.set(0);
    },
  };
}

// Calls fn when a finger stays down for ms; returns a function that detaches the listeners. The finger is captured so
// sliding off the target does not end the hold; it ends on release, cancel, lost capture or a drift beyond MOVE_SLOP.
export function longPress(el: HTMLElement, ms: number, fn: () => void, opts: { ring?: HoldRing } = {}): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let captured = false;
  let x0 = 0;
  let y0 = 0;
  const cancel = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    opts.ring?.reset();
  };
  const start = (e: Event) => {
    cancel();
    const p = e as PointerEvent;
    x0 = p.clientX || 0;
    y0 = p.clientY || 0;
    captured = false;
    try {
      if (typeof el.setPointerCapture === 'function' && p.pointerId !== undefined) { el.setPointerCapture(p.pointerId); captured = true; }
    } catch { /* no capture: pointerleave ends the hold instead */ }
    opts.ring?.start(ms);
    timer = setTimeout(() => { timer = null; fn(); }, ms);
  };
  const move = (e: Event) => {
    if (timer === null) return;
    const p = e as PointerEvent;
    if (Math.hypot((p.clientX || 0) - x0, (p.clientY || 0) - y0) > MOVE_SLOP) cancel();
  };
  const leave = () => { if (!captured) cancel(); };
  const noMenu = (e: Event) => e.preventDefault(); // also used for dragstart: a touch-drag would end the pointer with pointercancel
  el.style.touchAction = 'none';
  el.style.userSelect = 'none';
  el.style.setProperty('-webkit-touch-callout', 'none');
  const ends = ['pointerup', 'pointercancel', 'lostpointercapture'];
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('contextmenu', noMenu);
  el.addEventListener('dragstart', noMenu);
  ends.forEach(e => el.addEventListener(e, cancel));
  return () => {
    cancel();
    el.removeEventListener('pointerdown', start);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerleave', leave);
    el.removeEventListener('contextmenu', noMenu);
    el.removeEventListener('dragstart', noMenu);
    ends.forEach(e => el.removeEventListener(e, cancel));
  };
}

// Adult question (shown text only, never spoken).
export function mountGate(root: HTMLElement, opts: { rng: Rng; onPass(): void; onFail(): void }): void {
  const q = makeGateQuestion(opts.rng);
  const choice = (n: number) => h('button', {
    'data-choice': '1',
    style: 'min-height:64px;border-radius:16px;border:2px solid #B9CDE6;background:#FFFFFF;color:#1D2742;font:700 26px Rubik,sans-serif',
    onClick: () => (n === q.answer ? opts.onPass() : opts.onFail()),
  }, String(n));
  root.appendChild(h('div', { 'data-screen': 'gate', style: 'box-sizing:border-box;min-height:100vh;padding:40px 28px 32px;display:flex;flex-direction:column;align-items:center;gap:28px;background:#EAF5FF;color:#1D2742;direction:rtl' },
    h('p', { style: 'margin:0;font-size:17px;color:#4A5878' }, 'להורים בלבד: פתרו כדי להמשיך'),
    h('h1', { style: 'margin:0;font-size:40px;font-weight:800;direction:ltr' }, `${q.a} + ${q.b} = ?`),
    h('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-self:stretch' }, ...q.choices.map(choice)),
  ));
}
