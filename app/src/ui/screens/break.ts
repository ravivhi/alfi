// The break screen (style of End.dc.html, calm night colours): break.start, a large circle that fills while the
// break runs (no digits, no buttons for the child), then break.end and back to the map.
import { h } from '../../util/dom.ts';
import { line } from '../../audio/lines.ts';
import type { AudioApi } from '../../audio/audio.ts';
import type { LettersContent } from '../../content/schema.ts';

/** Fill steps used when the device asks for reduced motion (the circle jumps instead of growing smoothly). */
export const REDUCED_STEPS = 8;
/** The longest wait for break.end to finish before returning anyway (a voice that never reports its end). */
const END_SPEECH_CAP_MS = 8000;

export interface BreakDeps {
  audio: Pick<AudioApi, 'say' | 'stop'>;
  content: LettersContent;
  now(): number;
  /** Epoch ms when the break ends. */
  until: number;
  /** The whole break length in ms (for the fill). */
  totalMs: number;
  /** After break.end was spoken: back to the map. */
  onDone(): void;
  /** Defaults to the prefers-reduced-motion media query. */
  reducedMotion?: boolean;
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The filled share of the break, 0..1; stepped into REDUCED_STEPS jumps for reduced motion. */
export function fillFraction(remainingMs: number, totalMs: number, stepped: boolean): number {
  if (totalMs <= 0) return 1;
  const f = Math.min(1, Math.max(0, 1 - remainingMs / totalMs));
  return stepped ? Math.floor(f * REDUCED_STEPS) / REDUCED_STEPS : f;
}

export const RING_CSS = '.break-arc{transition:stroke-dashoffset 1s linear}'
  + '@media (prefers-reduced-motion: reduce){.break-arc{transition:none!important}}';

/** A ring that fills clockwise; set(f) moves it. Used by the break screen and the map's resting station. */
export function breakRing(size: number, stroke: number, colors: { track: string; fill: string }, stepped: boolean): { el: HTMLElement; set(f: number): void } {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const el = h('div', { 'aria-hidden': 'true', 'data-break-ring': '1', style: `width:${size}px;height:${size}px;pointer-events:none` });
  el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">`
    + `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${colors.track}" stroke-width="${stroke}"></circle>`
    + `<circle class="break-arc${stepped ? ' break-steps' : ''}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${colors.fill}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${len.toFixed(2)}" stroke-dashoffset="${len.toFixed(2)}"></circle>`
    + '</svg>';
  const arc = el.querySelector('.break-arc') as SVGElement | null;
  return {
    el,
    set(f: number) {
      el.setAttribute('data-fill', f.toFixed(3));
      arc?.setAttribute('stroke-dashoffset', (len * (1 - f)).toFixed(2));
    },
  };
}

const MOON = '<svg width="110" height="110" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3a9 9 0 1 0 6 13A7.5 7.5 0 1 1 15 3z" fill="#FFE08A"></path></svg>';

export function mountBreak(root: HTMLElement, d: BreakDeps): () => void {
  const c = d.content;
  const stepped = d.reducedMotion ?? prefersReducedMotion();
  const startText = line(c, 'break.start');
  const endText = line(c, 'break.end');
  let disposed = false;
  let finished = false;
  let tick: ReturnType<typeof setInterval> | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let capTimer: ReturnType<typeof setTimeout> | undefined;

  const sky = h('div', { 'aria-hidden': 'true', style: 'position:absolute;top:0;left:0;right:0;height:120px;pointer-events:none' });
  sky.innerHTML = '<svg width="100%" height="120" viewBox="0 0 390 120" preserveAspectRatio="xMidYMin slice"><circle cx="40" cy="40" r="3" fill="#FFE08A"></circle><circle cx="120" cy="80" r="2" fill="#FFFFFF"></circle><circle cx="300" cy="30" r="3" fill="#FFE08A"></circle><circle cx="350" cy="90" r="2" fill="#FFFFFF"></circle><circle cx="210" cy="50" r="2" fill="#FFFFFF"></circle></svg>';

  const ring = breakRing(260, 22, { track: 'rgba(255,255,255,.18)', fill: '#FFE08A' }, stepped);
  const moon = h('div', { 'aria-hidden': 'true', style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center' });
  moon.innerHTML = MOON;
  const dial = h('div', { role: 'img', 'aria-label': 'הפסקה', 'data-break-dial': '1', style: 'position:relative;width:260px;height:260px' }, ring.el, moon);
  const caption = h('span', { 'aria-live': 'polite', style: 'font-size:19px;font-weight:500;text-align:center' }, startText);
  const style = h('style');
  style.textContent = RING_CSS;

  root.appendChild(h('div', {
    'data-screen': 'break',
    style: 'position:relative;box-sizing:border-box;min-height:100vh;min-height:100dvh;padding:64px 26px 32px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;background:#1E3A7A;color:#FFFFFF;font-family:Rubik,sans-serif;direction:rtl;overflow:hidden',
  }, style, sky, dial, h('div', { style: 'padding:12px 18px;border-radius:20px;background:rgba(255,255,255,.12);max-width:340px' }, caption)));

  const update = () => ring.set(fillFraction(Math.max(0, d.until - d.now()), d.totalMs, stepped));

  const done = () => {
    if (capTimer !== undefined) clearTimeout(capTimer);
    if (disposed) return;
    disposed = true;
    d.onDone();
  };
  const finish = () => {
    if (finished || disposed) return;
    finished = true;
    if (tick !== undefined) clearInterval(tick);
    ring.set(1);
    caption.textContent = endText;
    capTimer = setTimeout(done, END_SPEECH_CAP_MS);
    let p: Promise<void>;
    try { p = d.audio.say(endText); } catch { p = Promise.resolve(); }
    void p.then(done, done);
  };
  const check = () => {
    update();
    if (d.now() >= d.until) finish();
  };

  void d.audio.say(startText);
  update();
  tick = setInterval(check, 1000);
  endTimer = setTimeout(check, Math.max(0, d.until - d.now()));
  if (d.now() >= d.until) finish();

  return () => {
    disposed = true;
    if (tick !== undefined) clearInterval(tick);
    if (endTimer !== undefined) clearTimeout(endTimer);
    if (capTimer !== undefined) clearTimeout(capTimer);
    d.audio.stop();
  };
}
