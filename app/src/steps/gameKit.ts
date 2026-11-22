// Shared plumbing for the short games: one rAF loop, tracked timers and listeners, the star HUD and the spawn queue.
import type { StepContext } from './contract.ts';
import type { AnswerEvent, StepResult, UnitId } from '../engine/types.ts';
import { scatterSequence } from '../engine/scatter.ts';
import type { Spawn } from '../engine/scatter.ts';
import { chooseDistractors } from '../engine/distractors.ts';
import { itemId } from '../engine/curriculum.ts';
import { h } from '../util/dom.ts';
import { voiceless } from './choice.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface Game {
  /** Runs fn every frame with the step since the last frame in seconds (capped, so a paused tab does not jump). */
  loop(fn: (dt: number) => void): void;
  later(ms: number, fn: () => void): void;
  listen(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
  speak(text: string): Promise<void>;
  /** Resolves the step 'done' once, stopping everything. */
  done(answers: AnswerEvent[], slips: number): void;
  /**
   * Resolves the step 'failed' once (the game's old timer or lives ran out), stopping everything like done. The
   * answers given before the fail still count; failLine is a content line id the failed window shows and says;
   * resume is where "try again" starts (handed back as ctx.resume).
   */
  fail(answers: AnswerEvent[], slips: number, failLine?: string, resume?: number): void;
  readonly over: boolean;
  readonly result: Promise<StepResult>;
}

/** Owns every loop, timer and listener of a game, and tears them all down on done, fail or ctx.signal abort. */
export function createGame(ctx: StepContext): Game {
  const t0 = Date.now();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const offs: (() => void)[] = [];
  let raf: number | null = null;
  let tick: ((dt: number) => void) | null = null;
  let last = -1;
  let over = false;
  let resolve: (r: StepResult) => void = () => undefined;
  const result = new Promise<StepResult>((r) => { resolve = r; });

  const stopAll = (): void => {
    over = true;
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const off of offs.splice(0)) off();
    ctx.signal.removeEventListener('abort', onAbort);
  };
  function onAbort(): void {
    if (over) return;
    stopAll();
    resolve({ outcome: 'aborted', answers: [], slips: 0, ms: Date.now() - t0 });
  }
  ctx.signal.addEventListener('abort', onAbort);

  const frame = (ts: number): void => {
    raf = null;
    if (over) return;
    const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, (ts - last) / 1000));
    last = ts;
    tick?.(dt);
    if (!over) raf = requestAnimationFrame(frame);
  };

  return {
    loop(fn) {
      tick = fn;
      if (raf === null && !over) raf = requestAnimationFrame(frame);
    },
    later(ms, fn) {
      if (over) return;
      const t = setTimeout(() => { timers.delete(t); if (!over) fn(); }, ms);
      timers.add(t);
    },
    listen(target, type, fn, opts) {
      if (over) return;
      target.addEventListener(type, fn, opts);
      offs.push(() => target.removeEventListener(type, fn, opts));
    },
    speak(text) {
      try { return ctx.audio.say(text).catch(() => undefined); } catch { return Promise.resolve(); }
    },
    done(answers, slips) {
      if (over) return;
      stopAll();
      resolve({ outcome: 'done', answers, slips, ms: Date.now() - t0 });
    },
    fail(answers, slips, failLine, resume) {
      if (over) return;
      stopAll();
      resolve({
        outcome: 'failed', answers, slips, ms: Date.now() - t0,
        ...(failLine !== undefined ? { failLine } : {}), ...(resume !== undefined ? { resume } : {}),
      });
    },
    get over() { return over; },
    result,
  };
}

/**
 * The game's ask on screen: shown (in full) only while no voice and no clips can say it, so a reading adult can help.
 * With a voice the games show no ask at all, so the letter's name never sits on the screen.
 */
const askText = new WeakMap<HTMLElement, string>();
function noVoiceCaption(ctx: StepContext, game: Game, text: string): void {
  let el = ctx.stage.querySelector<HTMLElement>(':scope > [data-ask]');
  const show = (cap: HTMLElement): void => {
    const on = voiceless(ctx);
    cap.textContent = on ? (askText.get(cap) ?? '') : '';
    cap.hidden = !on;
  };
  if (!el) {
    el = h('p', { 'data-ask': '1', style: 'margin:0 0 10px;font-size:17px;color:#4A5878;text-align:center;align-self:stretch' });
    ctx.stage.prepend(el);
    const cap = el;
    let off: () => void = () => undefined;
    try { off = ctx.audio.onStatusChange(() => show(cap)); } catch { /* no status events */ }
    void game.result.then(off);
  }
  askText.set(el, text);
  show(el);
}

/** Says the instruction and resolves when it ends, or after maxMs if the voice never reports an end. */
export function instruct(ctx: StepContext, game: Game, text: string, maxMs = 6000): Promise<void> {
  noVoiceCaption(ctx, game, text);
  return new Promise<void>((res) => {
    let settled = false;
    const go = (): void => { if (!settled) { settled = true; res(); } };
    game.later(maxMs, go);
    let said: Promise<void>;
    try { said = ctx.setInstruction(text); } catch { said = Promise.resolve(); }
    void Promise.resolve(said).catch(() => undefined).then(go);
  });
}

/** Speaks text and resolves when it ends, but never waits longer than maxMs. */
export function speakCapped(game: Game, text: string, maxMs = 2500): Promise<void> {
  return new Promise<void>((res) => {
    let settled = false;
    const go = (): void => { if (!settled) { settled = true; res(); } };
    game.later(maxMs, go);
    void game.speak(text).then(go);
  });
}

export const recallOk = (unit: UnitId): AnswerEvent => ({ item: itemId(unit, 'name'), ok: true, kind: 'recall', t: Date.now() });

/** A collection is evidence only when the child steered or hopped within this many seconds before it. */
export const ACTIVE_SEC = 1.5;

/** The old app's streak sound: each target collected adds one, any wrong pick or slip resets; from the 3rd in a row `combo` plays. */
export function combo(sfx: Pick<StepContext['sfx'], 'play'>): { hit(): void; miss(): void } {
  let streak = 0;
  return {
    hit() {
      streak++;
      if (streak >= 3) { try { sfx.play('combo', streak); } catch { /* no audio */ } }
    },
    miss() { streak = 0; },
  };
}

/**
 * The child's own input on the game clock (seconds). A collection without recent input still plays (star, praise)
 * but records no answer: a child who never touches the screen must not pile up recall evidence.
 */
export function activity(): { mark(now: number): void; recent(now: number): boolean } {
  let last = -Infinity;
  return {
    mark(now) { last = now; },
    recent(now) { return now - last <= ACTIVE_SEC; },
  };
}

/** The letters shown beside the target: look-alikes and known confusions first, all drawn like the target. */
export function otherLetters(ctx: StepContext, unit: UnitId, n: number): UnitId[] {
  const c = ctx.content;
  return chooseDistractors({
    target: unit, n, mode: 'look', alphabet: Object.keys(c.alphabet), lookAlikes: c.lookAlikes, sameSound: c.sameSound,
    taught: ctx.taught, confusions: ctx.confusions(unit), prefer: ['confusions', 'lookAlikes', 'taught'], rng: ctx.rng,
  });
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The arena size; a zero-size box (a test DOM, or before layout) falls back to a phone portrait size. */
export function measure(el: HTMLElement): { w: number; h: number } {
  const r = el.getBoundingClientRect();
  let h = r.height;
  // a stage taller than the window must not put bottom-anchored things (the race car, the plane's finger zone) below the screen edge
  const screenH = (typeof window !== 'undefined' && (window.visualViewport?.height || window.innerHeight)) || 0;
  if (h > 0 && screenH > 0 && r.bottom > screenH && screenH - r.top > 1) h = screenH - r.top;
  return { w: r.width || 390, h: h || 600 };
}

/** The progress row: one empty slot per target (smaller when there are more than 8); a slot fills with a star, never with the letter. */
export function starHud(n: number): { el: HTMLElement; fill(count: number): void } {
  const slots: HTMLElement[] = [];
  const px = n > 8 ? 24 : 30;
  const el = h('div', {
    'data-hud': '1', role: 'img', 'aria-label': `0 / ${n}`,
    style: 'position:absolute;top:10px;left:50%;transform:translateX(-50%);display:flex;gap:6px;padding:8px 10px;border-radius:20px;background:rgba(255,255,255,.85);z-index:5;pointer-events:none',
  });
  for (let i = 0; i < n; i++) {
    const s = h('span', {
      'data-slot': String(i),
      style: `width:${px}px;height:${px}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#E3E8F1`,
    });
    slots.push(s);
    el.appendChild(s);
  }
  return {
    el,
    fill(count) {
      el.setAttribute('aria-label', `${count} / ${n}`);
      slots.forEach((s, i) => {
        if (i < count && !s.hasAttribute('data-full')) {
          s.setAttribute('data-full', '');
          s.style.background = '#FFC531';
          s.appendChild(star(px - 10));
        }
      });
    },
  };
}

function star(size: number): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6z');
  p.setAttribute('fill', '#1D2742');
  svg.appendChild(p);
  return svg;
}

/**
 * Spawn order for a game, from scatterSequence. A new sequence is drawn when the old one runs out or a target
 * is missed; across that seam the same rules hold (no two targets back to back, no two in one lane / group).
 */
export function createSpawner(o: { lanes: number; rng: StepContext['rng']; sameGroup?: (a: number, b: number) => boolean }) {
  const same = o.sameGroup ?? ((a: number, b: number) => a === b);
  let queue: Spawn[] = [];
  let lastTargetLane = -1;
  let lastWasTarget = false;

  const draw = (remaining: number): void => {
    const targets = Math.max(0, remaining);
    let q: Spawn[] = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      q = scatterSequence({ targets, others: Math.max(targets, 3), lanes: o.lanes, rng: o.rng, ...(o.sameGroup ? { sameGroup: o.sameGroup } : {}) });
      const first = q.find((s) => s.target);
      if (!first || lastTargetLane < 0 || !same(first.lane, lastTargetLane)) break;
    }
    if (lastWasTarget && q.length && q[0].target) q.unshift({ lane: o.rng.int(0, o.lanes - 1), target: false });
    queue = q;
  };

  return {
    /** The next spawn; remaining = targets still needed that are not already on screen. */
    next(remaining: number): Spawn {
      if (!queue.length) draw(remaining);
      const s = queue.shift()!;
      lastWasTarget = s.target;
      if (s.target) lastTargetLane = s.lane;
      return s;
    },
    /** A target was missed: draw a fresh sequence for what is still needed. */
    redraw(remaining: number): void { draw(remaining); },
  };
}
