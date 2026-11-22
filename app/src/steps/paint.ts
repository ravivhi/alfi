// Paint the letter: the old app's colouring game (IMPL.color) as a station. The child paints inside the letter with a
// finger; at 93% coverage the letter fills and the station ends. Exposure and fine motor only: it records no answers
// and cannot fail.
import type { StepContext, StepModule } from './contract.ts';
import type { StepResult } from '../engine/types.ts';
import { stepUnit } from './find.ts';
import { line } from '../audio/lines.ts';
import { createGame, instruct, measure, prefersReducedMotion } from './gameKit.ts';
import { samplePath } from './drive.ts';
import type { Pt } from './road.ts';
import { h } from '../util/dom.ts';

/** The nine paint pots, in the old order (index.html COLS); the name is the content line `colour.<id>`. */
export const PAINT_COLOURS = [
  { id: 'red', hex: '#E53935' }, { id: 'blue', hex: '#1E6FD9' }, { id: 'green', hex: '#2EB85C' },
  { id: 'yellow', hex: '#FFC928' }, { id: 'orange', hex: '#FB8C00' }, { id: 'purple', hex: '#8E24AA' },
  { id: 'turquoise', hex: '#00ACC1' }, { id: 'brown', hex: '#6D4C41' }, { id: 'burgundy', hex: '#A50044' },
] as const;

/** Coverage of the letter at which it fills and the station wins. */
export const WIN_COVERAGE = 0.93;
export const WIN_DELAY_MS = 900;
/** While drawing, the coverage is measured at most this often (and on every pointer up). */
export const CHECK_GAP_MS = 350;

const BOARD = 300;
/** The letter's thickness in board units, and the width of the navy outline beyond it. */
const BW = 46;
const OUTLINE = 7;
/** The coverage is measured on this many pixels square. */
const GRID = 100;
const INK = '#0D2A5C';

/** The old board size: max(220, min(stage width * .9, stage height - 170, 540)). */
export const boardSize = (w: number, hgt: number): number => Math.max(220, Math.min(w * 0.9, hgt - 170, 540));

/**
 * The share of the letter (mask alpha above 200) that carries paint (paint alpha above 110). Both are RGBA pixel arrays
 * of the same size; paint outside the letter adds nothing.
 */
export function paintCoverage(mask: ArrayLike<number>, paint: ArrayLike<number>): number {
  let total = 0, got = 0;
  for (let i = 3; i < mask.length; i += 4) {
    if (mask[i] > 200) {
      total++;
      if (paint[i] > 110) got++;
    }
  }
  return total ? got / total : 0;
}

const done = (ms: number): StepResult => ({ outcome: 'done', answers: [], slips: 0, ms });

export const paintStep: StepModule = {
  id: 'paint',
  async run(ctx: StepContext): Promise<StepResult> {
    const t0 = Date.now();
    if (ctx.signal.aborted) return { outcome: 'aborted', answers: [], slips: 0, ms: 0 };
    const c = ctx.content;
    const unit = stepUnit(ctx);
    const name = c.alphabet[unit].name;

    const size = Math.round(boardSize(measure(ctx.stage).w, measure(ctx.stage).h));
    const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    const PX = Math.round(size * dpr);
    const sc = PX / BOARD;

    const mk = (px: number): HTMLCanvasElement => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = px;
      return cv;
    };
    const cBase = mk(PX), cPaint = mk(PX), cLine = mk(PX), mask = mk(PX), tm = mk(GRID), tp = mk(GRID);
    for (const cv of [cBase, cPaint, cLine]) cv.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size}px;touch-action:none`;
    cLine.style.pointerEvents = 'none';
    cPaint.setAttribute('data-paint-canvas', '1');
    const bx = cBase.getContext('2d'), px = cPaint.getContext('2d'), lx = cLine.getContext('2d'), mx = mask.getContext('2d');
    const tmx = tm.getContext('2d'), tpx = tp.getContext('2d', { willReadFrequently: true });
    // no canvas on this device: the station must not trap the child, it just passes (no evidence either way)
    if (!bx || !px || !lx || !mx || !tmx || !tpx) return done(Date.now() - t0);

    // the letter: the drive / road stroke paths, as smooth paths where the platform has Path2D, else as the road's polyline
    const strokeD = c.letters[unit].strokes;
    const paths: Path2D[] | null = typeof Path2D === 'function' ? strokeD.map((d) => new Path2D(d)) : null;
    const polys: Pt[][] = paths ? [] : strokeD.map(samplePath);
    function shape(g: CanvasRenderingContext2D, w: number, col: string): void {
      g.save();
      g.setTransform(sc, 0, 0, sc, 0, 0);
      g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = col;
      if (paths) paths.forEach((p) => g.stroke(p));
      else for (const poly of polys) {
        g.beginPath();
        poly.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
        g.stroke();
      }
      g.restore();
    }

    // board: light blue rounded card with a navy border; the letter as a thick white stroke with a soft shadow
    bx.fillStyle = '#E3F2FD';
    bx.beginPath();
    if (typeof bx.roundRect === 'function') bx.roundRect(0, 0, PX, PX, 26 * dpr); else bx.rect(0, 0, PX, PX);
    bx.fill();
    bx.strokeStyle = INK; bx.lineWidth = 5 * dpr;
    bx.stroke();
    bx.save();
    bx.shadowColor = 'rgba(13,42,92,.3)'; bx.shadowOffsetY = 4 * dpr;
    shape(bx, BW, '#fff');
    bx.restore();
    // the mask the paint is clipped to, and the navy outline on top (the letter's inside cut out of it)
    shape(mx, BW, '#000');
    shape(lx, BW + OUTLINE, INK);
    lx.globalCompositeOperation = 'destination-out';
    shape(lx, BW, '#000');
    lx.globalCompositeOperation = 'source-over';
    tmx.drawImage(mask, 0, 0, GRID, GRID);
    const maskPixels = tmx.getImageData(0, 0, GRID, GRID).data;

    const game = createGame(ctx);
    const reduce = prefersReducedMotion();

    // ---- view ----
    const board = h('div', {
      'data-paint-board': '1', role: 'img', 'aria-label': 'צביעת האות ' + unit,
      style: `position:relative;width:${size}px;height:${size}px;border-radius:26px;filter:drop-shadow(0 6px 0 rgba(13,42,92,.35));flex:none`,
    }, cBase, cPaint, cLine);
    const fill = h('i', { 'data-paint-fill': '1', style: `display:block;height:100%;width:0%;background:linear-gradient(90deg,#2EB85C,#FFC928);${reduce ? '' : 'transition:width .3s'}` });
    const bar = h('div', {
      'data-paint-bar': '1', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0',
      style: `width:min(420px,80%);height:18px;background:#fff;border:3px solid ${INK};border-radius:999px;overflow:hidden;margin-top:10px;flex:none`,
    }, fill);

    let col: string = PAINT_COLOURS[0].hex;
    const potEls: HTMLElement[] = PAINT_COLOURS.map((pc, i) => {
      const b = h('button', {
        type: 'button', 'data-pot': String(i), 'aria-label': line(c, 'colour.' + pc.id), 'aria-pressed': i === 0 ? 'true' : 'false',
        style: `width:52px;height:52px;border-radius:50%;border:4px solid ${INK};background:${pc.hex};padding:0;cursor:pointer;`
          + 'box-shadow:inset -6px -6px 0 rgba(0,0,0,.18),inset 6px 6px 0 rgba(255,255,255,.35),0 4px 0 ' + INK + ';'
          + (reduce ? '' : 'transition:transform .15s;'),
      });
      return b;
    });
    const markSelected = (sel: number): void => {
      potEls.forEach((b, i) => {
        b.setAttribute('aria-pressed', i === sel ? 'true' : 'false');
        b.style.transform = i === sel ? 'translateY(-8px) scale(1.12)' : '';
        b.style.outline = i === sel ? '5px solid #FFC928' : '';
      });
    };
    markSelected(0);
    const pots = h('div', { 'data-paint-pots': '1', style: 'display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;justify-content:center;flex:none' }, ...potEls);
    const restart = h('button', {
      type: 'button', 'data-paint-restart': '1',
      style: `font:800 20px Rubik,Arial,sans-serif;min-height:56px;border:3px solid ${INK};border-radius:18px;padding:10px 20px;background:#fff;color:${INK};cursor:pointer;box-shadow:0 5px 0 ${INK}`,
    }, '↺ מתחילים מחדש');
    const root = h('div', {
      'data-step': 'paint',
      style: 'display:flex;flex-direction:column;align-items:center;align-self:stretch;max-height:100%;overflow-y:auto;padding:4px 0',
    }, board, bar, pots, h('div', { style: 'display:flex;justify-content:center;margin-top:10px;flex:none' }, restart));
    ctx.stage.appendChild(root);

    // ---- painting ----
    let drawing = false, finished = false, activeId: number | null = null, lastChk = -Infinity, winGen = 0;
    let last: { x: number; y: number } = { x: 0, y: 0 };
    const brush = size * 0.065 * dpr;
    const sfxSafe = (fn: () => void): void => { try { fn(); } catch { /* sound is optional */ } };
    const crayon = (on: boolean): void => sfxSafe(() => ctx.sfx.crayon(on));
    // a pointer up, a cancel, a win, a leave: the crayon is silent unless a finger is down
    const lift = (): void => {
      if (!drawing) return;
      drawing = false;
      crayon(false);
    };

    const setBar = (frac: number): void => {
      const pct = Math.max(0, Math.min(100, frac * 100));
      fill.style.width = pct + '%';
      bar.setAttribute('aria-valuenow', String(Math.round(pct)));
      ctx.progress(Math.max(0, Math.min(1, frac)));
    };
    const coverage = (): number => {
      tpx.clearRect(0, 0, GRID, GRID);
      tpx.drawImage(cPaint, 0, 0, GRID, GRID);
      return paintCoverage(maskPixels, tpx.getImageData(0, 0, GRID, GRID).data);
    };
    const check = (): void => {
      const cov = coverage();
      setBar(cov / WIN_COVERAGE);
      if (cov < WIN_COVERAGE || finished) return;
      finished = true;
      lift();
      activeId = null;
      // the whole letter takes the current colour (the paint canvas keeps only what lies inside the mask)
      px.save();
      px.globalCompositeOperation = 'destination-over';
      px.fillStyle = col;
      px.fillRect(0, 0, PX, PX);
      px.globalCompositeOperation = 'destination-in';
      px.drawImage(mask, 0, 0);
      px.restore();
      setBar(1);
      const gen = ++winGen;
      game.later(WIN_DELAY_MS, () => { if (finished && gen === winGen) game.done([], 0); });
    };

    const pos = (e: PointerEvent): { x: number; y: number } => {
      const r = cPaint.getBoundingClientRect();
      // a zero-size box (a test DOM) maps client pixels 1:1 to the board's css pixels
      return r.width && r.height ? { x: ((e.clientX - r.left) * PX) / r.width, y: ((e.clientY - r.top) * PX) / r.height } : { x: (e.clientX * PX) / size, y: (e.clientY * PX) / size };
    };
    // one segment of paint, clipped to the letter
    const seg = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
      px.strokeStyle = col; px.lineWidth = brush; px.lineCap = 'round'; px.lineJoin = 'round';
      px.beginPath();
      px.moveTo(a.x, a.y);
      px.lineTo(b.x + 0.01, b.y);
      px.stroke();
      px.save();
      px.globalCompositeOperation = 'destination-in';
      px.drawImage(mask, 0, 0);
      px.restore();
    };

    game.listen(cPaint, 'pointerdown', (ev) => {
      const e = ev as PointerEvent;
      if (finished || activeId !== null) return;
      e.preventDefault();
      activeId = e.pointerId;
      try { cPaint.setPointerCapture(e.pointerId); } catch { /* not supported */ }
      drawing = true;
      last = pos(e);
      seg(last, last);
      crayon(true);
    });
    game.listen(cPaint, 'pointermove', (ev) => {
      const e = ev as PointerEvent;
      if (!drawing || e.pointerId !== activeId) return;
      e.preventDefault();
      const p = pos(e);
      seg(last, p);
      last = p;
      const now = Date.now();
      if (now - lastChk > CHECK_GAP_MS) { lastChk = now; check(); }
    });
    const up = (ev: Event): void => {
      const e = ev as PointerEvent;
      if (!drawing || e.pointerId !== activeId) return;
      activeId = null;
      try { cPaint.releasePointerCapture(e.pointerId); } catch { /* not held */ }
      lift();
      check();
    };
    game.listen(cPaint, 'pointerup', up);
    game.listen(cPaint, 'pointercancel', up);

    potEls.forEach((b, i) => game.listen(b, 'click', () => {
      col = PAINT_COLOURS[i].hex;
      markSelected(i);
      sfxSafe(() => ctx.sfx.play('pot', i));
      void game.speak(line(c, 'colour.' + PAINT_COLOURS[i].id));
    }));
    game.listen(restart, 'click', () => {
      sfxSafe(() => ctx.sfx.play('pick'));
      winGen++; // a win that was about to come is cancelled
      finished = false;
      px.clearRect(0, 0, PX, PX);
      check();
    });

    // the crayon ends with the station, however it ends
    void game.result.then(() => { crayon(false); sfxSafe(() => ctx.sfx.crayonStop()); });

    void instruct(ctx, game, line(c, 'paint.ask', { name })).catch(() => undefined);
    return game.result;
  },
};
