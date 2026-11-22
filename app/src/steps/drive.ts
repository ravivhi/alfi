// Drive the letter: a car on a road shaped like the letter. Tracing as a game; it gives practice, never mastery evidence.
import type { StepModule } from './contract.ts';
import type { StepResult } from '../engine/types.ts';
import { stepUnit } from './find.ts';
import { line } from '../audio/lines.ts';
import { createRoad, roadDown, roadMove, roadUp, ROAD } from './road.ts';
import type { Pt, RoadState } from './road.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BOARD = 300;
const BACK_GAP_MS = 4000;
const CURVE_STEPS = 24;
/* owner 2026-11-21 (preview 0.6): "the letters are too thick, they clip into themselves" - the road is 25% thinner. */
export const ROAD_WIDTH_FACTOR = 0.75;
/** The car and the trail shrink with the road, so the car still fits it. */
const CAR_SCALE = 0.75;
/** Half the car's drawn width across the road (wheels at +-22 before the scale). */
export const CAR_HALF_WIDTH = 22 * CAR_SCALE;
/** The on-road tolerance (the road's half width) from the old one: in proportion to the new width, never below the car's half width. */
export const driveTol = (oldTol: number): number => Math.max(oldTol * ROAD_WIDTH_FACTOR, CAR_HALF_WIDTH);

// ---- sampling -----------------------------------------------------------------

/** Flattens M/L/H/V/Q/C/Z (absolute and relative) into a polyline. Used when the platform has no SVG geometry. */
function flatten(d: string): Pt[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out: Pt[] = [];
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let cmd = '';
  let i = 0;
  const num = (): number => Number(tokens[i++]);
  const isCmd = (t: string | undefined): boolean => t !== undefined && /^[a-zA-Z]$/.test(t);
  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    else if (cmd === '' || cmd.toUpperCase() === 'Z') break; // a number with no command to take it
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cur.x : 0;
    const oy = rel ? cur.y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': { cur = { x: ox + num(), y: oy + num() }; start = cur; out.push(cur); break; }
      case 'L': { cur = { x: ox + num(), y: oy + num() }; out.push(cur); break; }
      case 'H': { cur = { x: ox + num(), y: cur.y }; out.push(cur); break; }
      case 'V': { cur = { x: cur.x, y: oy + num() }; out.push(cur); break; }
      case 'Q': {
        const c = { x: ox + num(), y: oy + num() };
        const e = { x: ox + num(), y: oy + num() };
        for (let k = 1; k <= CURVE_STEPS; k++) {
          const t = k / CURVE_STEPS; const u = 1 - t;
          out.push({ x: u * u * cur.x + 2 * u * t * c.x + t * t * e.x, y: u * u * cur.y + 2 * u * t * c.y + t * t * e.y });
        }
        cur = e; break;
      }
      case 'C': {
        const c1 = { x: ox + num(), y: oy + num() };
        const c2 = { x: ox + num(), y: oy + num() };
        const e = { x: ox + num(), y: oy + num() };
        for (let k = 1; k <= CURVE_STEPS; k++) {
          const t = k / CURVE_STEPS; const u = 1 - t;
          out.push({
            x: u * u * u * cur.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * e.x,
            y: u * u * u * cur.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * e.y,
          });
        }
        cur = e; break;
      }
      case 'Z': { cur = start; out.push(cur); break; }
      default: i = tokens.length; // unknown command: stop with what we have
    }
  }
  const bad = out.findIndex(p => !Number.isFinite(p.x) || !Number.isFinite(p.y));
  return bad < 0 ? out : out.slice(0, bad); // a truncated command stops the parse
}

/** Equal arc-length resampling of a polyline into n points (first and last are exact). */
function resample(poly: Pt[], n: number): Pt[] {
  if (poly.length === 0) return Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
  const total = cum[cum.length - 1];
  const out: Pt[] = [];
  let seg = 1;
  for (let k = 0; k < n; k++) {
    if (k === 0 || total === 0) { out.push({ ...poly[0] }); continue; }
    if (k === n - 1) { out.push({ ...poly[poly.length - 1] }); continue; }
    const target = (total * k) / (n - 1);
    while (seg < poly.length - 1 && cum[seg] < target) seg++;
    const span = cum[seg] - cum[seg - 1];
    const f = span === 0 ? 0 : (target - cum[seg - 1]) / span;
    out.push({ x: poly[seg - 1].x + (poly[seg].x - poly[seg - 1].x) * f, y: poly[seg - 1].y + (poly[seg].y - poly[seg - 1].y) * f });
  }
  return out;
}

/** ROAD.SAMPLES points along an SVG path: the platform's getPointAtLength when it works, else our own parser. */
export function samplePath(d: string): Pt[] {
  const n = ROAD.SAMPLES;
  try {
    const el = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
    el.setAttribute('d', d);
    if (typeof el.getTotalLength === 'function' && typeof el.getPointAtLength === 'function') {
      const total = el.getTotalLength();
      if (Number.isFinite(total) && total > 0) {
        const pts: Pt[] = [];
        for (let k = 0; k < n; k++) {
          const p = el.getPointAtLength((total * k) / (n - 1));
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('bad point');
          pts.push({ x: p.x, y: p.y });
        }
        return pts;
      }
    }
  } catch { /* fall through to the parser */ }
  return resample(flatten(d), n);
}

// ---- view ---------------------------------------------------------------------

function svg(tag: string, attrs: Record<string, string | number>, ...kids: Element[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of kids) el.appendChild(c);
  return el;
}
const pathD = (pts: Pt[]): string => pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');

function flag(kind: 'start' | 'finish'): SVGElement {
  const g = svg('g', {});
  g.appendChild(svg('rect', { x: 0, y: 0, width: 4, height: 40, fill: '#1D2742' }));
  if (kind === 'start') {
    g.appendChild(svg('path', { d: 'M4 0h24l-6 8 6 8H4z', fill: '#2E9E5B' }));
  } else {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      g.appendChild(svg('rect', { x: 4 + c * 8, y: r * 8, width: 8, height: 8, fill: (r + c) % 2 === 0 ? '#1D2742' : '#FFFFFF' }));
    }
  }
  return g;
}

function carShape(): SVGElement {
  const g = svg('g', { transform: `scale(${CAR_SCALE})` });
  g.appendChild(svg('rect', { x: -24, y: -15, width: 48, height: 30, rx: 9, fill: '#E8641B' }));
  g.appendChild(svg('rect', { x: -8, y: -12, width: 16, height: 24, rx: 4, fill: '#BFE3FF' }));
  for (const [cx, cy] of [[-14, -17], [14, -17], [-14, 17], [14, 17]]) g.appendChild(svg('circle', { cx, cy, r: 5, fill: '#1D2742' }));
  return g;
}

// ---- step ---------------------------------------------------------------------

export const driveStep: StepModule = {
  id: 'drive',
  async run(ctx): Promise<StepResult> {
    const t0 = Date.now();
    const aborted = (): StepResult => ({ outcome: 'aborted', answers: [], slips: 0, ms: Date.now() - t0 });
    if (ctx.signal.aborted) return aborted();

    const c = ctx.content;
    const unit = stepUnit(ctx);
    const name = c.alphabet[unit].name;
    const tol = driveTol(ctx.profile.traceTolerance);
    const strokes = c.letters[unit].strokes.map(samplePath);
    const speak = (text: string): Promise<void> => {
      try { return ctx.audio.say(text).catch(() => undefined); } catch { return Promise.resolve(); }
    };

    // board
    const roadD = strokes.map(pathD).join(' ');
    const trail = svg('path', { d: '', fill: 'none', stroke: '#FFC531', 'stroke-width': 10 * CAR_SCALE, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.9 });
    const startFlag = flag('start');
    const lastStroke = strokes[strokes.length - 1];
    const finishFlag = flag('finish');
    finishFlag.setAttribute('transform', `translate(${lastStroke[lastStroke.length - 1].x + 10} ${lastStroke[lastStroke.length - 1].y - 20})`);
    const car = svg('g', {}, carShape());
    const arrow = svg('g', {}, svg('path', { d: 'M0 0 h-34', stroke: '#1D2742', 'stroke-width': 5, 'stroke-linecap': 'round' }),
      svg('path', { d: 'M-24 -10 l-12 10 12 10', fill: 'none', stroke: '#1D2742', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    const board = svg('svg', {
      viewBox: `0 0 ${BOARD} ${BOARD}`, role: 'img', 'aria-label': 'כביש בצורת האות ' + unit,
      'data-drive-board': '1',
    },
      svg('rect', { x: 0, y: 0, width: BOARD, height: BOARD, fill: '#9BD7A8' }),
      svg('path', { d: roadD, fill: 'none', stroke: '#5C6577', 'stroke-width': 2 * tol, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      svg('path', { d: roadD, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 3, 'stroke-dasharray': '10 9', 'stroke-linecap': 'round' }),
      trail, startFlag, finishFlag, arrow, car);
    board.setAttribute('style', 'width:100%;max-width:min(100%,560px);aspect-ratio:1;border-radius:32px;touch-action:none;user-select:none;-webkit-user-select:none;align-self:center');
    const caption = document.createElement('p');
    caption.setAttribute('aria-live', 'polite');
    caption.setAttribute('style', 'margin:0;min-height:24px;font-size:17px;color:#4A5878;text-align:center');
    const root = document.createElement('div');
    root.setAttribute('data-step', 'drive');
    root.setAttribute('style', 'display:flex;flex-direction:column;align-items:center;gap:14px;align-self:stretch');
    root.append(board, caption);
    ctx.stage.appendChild(root);

    let s: RoadState = createRoad();
    let activeId: number | null = null;
    let lastBack = -Infinity;
    let finish: (r: StepResult) => void = () => undefined;

    const tangent = (): number => {
      const pts = strokes[s.stroke];
      const a = pts[Math.max(0, Math.min(s.idx, pts.length - 2))];
      const b = pts[Math.max(1, Math.min(s.idx + 1, pts.length - 1))];
      return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    };
    const draw = (): void => {
      const pts = strokes[s.stroke];
      const p = pts[s.idx];
      const ang = tangent();
      car.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
      arrow.setAttribute('transform', s.done ? 'translate(-999 -999)' : `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${ang.toFixed(1)}) translate(70 0) scale(-1 1)`);
      startFlag.setAttribute('transform', `translate(${pts[0].x - 4} ${pts[0].y - 40})`);
      let d = '';
      for (let k = 0; k < s.stroke; k++) d += pathD(strokes[k]) + ' ';
      d += pathD(pts.slice(0, s.idx + 1));
      trail.setAttribute('d', d);
      ctx.progress(s.done ? 1 : (s.stroke + s.idx / ROAD.SAMPLES) / strokes.length);
    };
    draw();

    // client coordinates -> board units (a zero-size rect, as in a test DOM, maps 1:1)
    const toBoard = (e: PointerEvent): Pt => {
      const r = board.getBoundingClientRect();
      if (!r.width || !r.height) return { x: e.clientX, y: e.clientY };
      return { x: ((e.clientX - r.left) / r.width) * BOARD, y: ((e.clientY - r.top) / r.height) * BOARD };
    };
    const apply = (next: RoadState): void => {
      const prev = s;
      s = next;
      draw();
      if (s.offRoad && !prev.offRoad) {
        const now = Date.now();
        caption.textContent = line(c, 'drive.back');
        if (now - lastBack >= BACK_GAP_MS) { lastBack = now; void speak(line(c, 'drive.back')); }
      } else if (!s.offRoad && prev.offRoad) {
        caption.textContent = '';
      }
      if (s.done) {
        caption.textContent = line(c, 'drive.done', { name });
        const said = speak(caption.textContent);
        removePointer();
        void said.then(() => {
          ctx.signal.removeEventListener('abort', onAbort);
          finish({ outcome: ctx.signal.aborted ? 'aborted' : 'done', answers: [], slips: ctx.signal.aborted ? 0 : s.slips, ms: Date.now() - t0 });
        });
      } else if (s.stroke !== prev.stroke) {
        const text = line(c, 'drive.next');
        caption.textContent = text;
        void speak(text);
      }
    };

    const onDown = (e: PointerEvent): void => {
      if (activeId !== null) return;
      e.preventDefault();
      const next = roadDown(s, strokes, toBoard(e), tol);
      if (next.holding) {
        activeId = e.pointerId;
        try { board.setPointerCapture(e.pointerId); } catch { /* not supported */ }
        apply(next);
      }
    };
    const onMove = (e: PointerEvent): void => {
      if (e.pointerId !== activeId) return;
      e.preventDefault();
      apply(roadMove(s, strokes, toBoard(e), tol));
    };
    const onUp = (e: PointerEvent): void => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      try { board.releasePointerCapture(e.pointerId); } catch { /* not held */ }
      apply(roadUp(s));
    };
    const onAbort = (): void => { removePointer(); ctx.signal.removeEventListener('abort', onAbort); finish(aborted()); };

    function removePointer(): void {
      board.removeEventListener('pointerdown', onDown);
      board.removeEventListener('pointermove', onMove);
      board.removeEventListener('pointerup', onUp);
      board.removeEventListener('pointercancel', onUp);
    }

    board.addEventListener('pointerdown', onDown);
    board.addEventListener('pointermove', onMove);
    board.addEventListener('pointerup', onUp);
    board.addEventListener('pointercancel', onUp);
    ctx.signal.addEventListener('abort', onAbort);

    void ctx.setInstruction(line(c, 'drive.ask', { name })).catch(() => undefined);
    return new Promise<StepResult>((resolve) => { finish = resolve; });
  },
};
