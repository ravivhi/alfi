// @vitest-environment happy-dom
// The paint-the-letter station on a small fake canvas: it rasterises strokes, the mask clip and the downsample, so the
// whole path from finger to coverage to win runs in happy-dom.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StepContext } from '../../src/steps/contract.ts';
import type { StepResult } from '../../src/engine/types.ts';
import { paintStep, paintCoverage, boardSize, PAINT_COLOURS, WIN_COVERAGE } from '../../src/steps/paint.ts';
import { samplePath } from '../../src/steps/drive.ts';
import { REGISTRY } from '../../src/steps/registry.ts';
import { profileFor, SLICE_STEPS } from '../../src/engine/profiles.ts';
import type { PlannedStep } from '../../src/engine/planner.ts';
import { CONTENT } from '../../src/content/index.ts';
import { line } from '../../src/audio/lines.ts';
import { createRng } from '../../src/util/rng.ts';
import type { AudioApi } from '../../src/audio/audio.ts';

const T = 'ב';

// ---- a fake 2D canvas: alpha only, enough drawing calls for the station -------------------------

class FakePath2D { constructor(public d: string) { /* keeps the path text */ } }

class Fake2D {
  data: Uint8ClampedArray;
  lineWidth = 1; lineCap = ''; lineJoin = ''; strokeStyle = ''; fillStyle = ''; globalCompositeOperation = 'source-over';
  shadowColor = ''; shadowOffsetY = 0;
  fills: string[] = [];
  private scale = 1;
  private stack: { scale: number; gco: string }[] = [];
  private segs: [number, number, number, number][] = [];
  private cur: [number, number] = [0, 0];
  constructor(readonly canvas: HTMLCanvasElement) { this.data = new Uint8ClampedArray(canvas.width * canvas.height * 4); }
  get w() { return this.canvas.width; }
  get h() { return this.canvas.height; }
  save() { this.stack.push({ scale: this.scale, gco: this.globalCompositeOperation }); }
  restore() { const s = this.stack.pop(); if (s) { this.scale = s.scale; this.globalCompositeOperation = s.gco; } }
  setTransform(a: number) { this.scale = a; }
  beginPath() { this.segs = []; }
  moveTo(x: number, y: number) { this.cur = [x, y]; }
  lineTo(x: number, y: number) { this.segs.push([this.cur[0], this.cur[1], x, y]); this.cur = [x, y]; }
  rect() { /* the board background is not simulated */ }
  roundRect() { /* ditto */ }
  fill() { /* ditto */ }
  private put(x: number, y: number, a: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[(y * this.w + x) * 4 + 3] = a;
  }
  private stamp(cx: number, cy: number, r: number, a: number) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.put(x, y, a);
    }
  }
  private strokeSegs(segs: [number, number, number, number][]) {
    const r = (this.lineWidth * this.scale) / 2;
    const a = this.globalCompositeOperation === 'destination-out' ? 0 : 255;
    for (const [x0, y0, x1, y1] of segs) {
      const len = Math.hypot(x1 - x0, y1 - y0) * this.scale;
      const n = Math.max(1, Math.ceil(len / Math.max(1, r / 2)));
      for (let i = 0; i <= n; i++) this.stamp((x0 + ((x1 - x0) * i) / n) * this.scale, (y0 + ((y1 - y0) * i) / n) * this.scale, r, a);
    }
  }
  stroke(p?: FakePath2D) {
    if (p) {
      const pts = samplePath(p.d);
      this.strokeSegs(pts.slice(1).map((q, i) => [pts[i].x, pts[i].y, q.x, q.y] as [number, number, number, number]));
    } else this.strokeSegs(this.segs);
  }
  clearRect() { this.data.fill(0); }
  fillRect() {
    this.fills.push(this.fillStyle);
    for (let i = 3; i < this.data.length; i += 4) {
      if (this.globalCompositeOperation === 'destination-over' ? this.data[i] === 0 : true) this.data[i] = 255;
    }
  }
  drawImage(src: HTMLCanvasElement, _dx: number, _dy: number, dw = src.width, dh = src.height) {
    const s = fakeOf(src).data, sw = src.width, sh = src.height;
    if (dw === sw && dh === sh && sw === this.w) { // same size: no resampling
      const dIn = this.globalCompositeOperation === 'destination-in';
      for (let i = 3; i < s.length; i += 4) {
        if (dIn) { if (s[i] === 0) this.data[i] = 0; } else if (s[i] > this.data[i]) this.data[i] = s[i];
      }
      return;
    }
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const sa = s[((Math.floor((y * sh) / dh) * sw) + Math.floor((x * sw) / dw)) * 4 + 3];
      const i = (y * this.w + x) * 4 + 3;
      if (this.globalCompositeOperation === 'destination-in') this.data[i] = sa === 0 ? 0 : this.data[i];
      else this.data[i] = Math.max(this.data[i], sa);
    }
  }
  getImageData() { return { data: this.data }; }
}

const fakes = new WeakMap<HTMLCanvasElement, Fake2D>();
let allFakes: Fake2D[] = [];
function fakeOf(c: HTMLCanvasElement): Fake2D {
  let f = fakes.get(c);
  if (!f) { f = new Fake2D(c); fakes.set(c, f); allFakes.push(f); }
  return f;
}
const last = <T,>(a: T[]): T => a[a.length - 1];
const alphaSum = (f: Fake2D) => { let n = 0; for (let i = 3; i < f.data.length; i += 4) if (f.data[i]) n++; return n; };

// ---- harness --------------------------------------------------------------------------------------

let said: string[];
let sfx: string[];
let stage: HTMLElement;

function makeCtx(signal?: AbortSignal): StepContext {
  const audio = {
    ready: Promise.resolve(),
    say: (t: string) => { said.push(t); return Promise.resolve(); },
    stop() { /* not used */ },
    setVoiceVolume() { /* not used */ },
    status: () => 'live' as const,
    onStatusChange: () => () => undefined,
  };
  return {
    step: { kind: 'station', step: 'paint', unitId: T, items: [] } as unknown as PlannedStep,
    profile: profileFor('3-5'),
    content: CONTENT,
    rng: createRng(3),
    stage,
    signal: signal ?? new AbortController().signal,
    audio: audio as unknown as AudioApi,
    sfx: {
      play: (n: string, arg?: number) => { sfx.push(arg === undefined ? n : `${n}:${arg}`); },
      setVolume() { /* not used */ },
      engineHum() { /* not used */ },
      engineStop() { /* not used */ },
      crayon: (on: boolean) => { sfx.push(on ? 'crayon:on' : 'crayon:off'); },
      crayonStop: () => { sfx.push('crayonStop'); },
    } as unknown as StepContext['sfx'],
    taught: [],
    confusions: () => [],
    setInstruction: (text) => { said.push(text); return Promise.resolve(); },
    progress: () => undefined,
  };
}

let result: StepResult | null;
function start(ctx = makeCtx()) {
  result = null;
  const p = paintStep.run(ctx);
  void p.then(r => { result = r; });
  return p;
}

const one = <E extends HTMLElement = HTMLElement>(sel: string) => stage.querySelector(sel) as E;
const canvases = () => Array.from(stage.querySelectorAll('canvas')) as HTMLCanvasElement[];
const paintCanvas = () => one<HTMLCanvasElement>('[data-paint-canvas]');
const barWidth = () => one('[data-paint-fill]').style.width;
const SZ = () => boardSize(390, 600);

const ptr = (type: string, x: number, y: number, id = 1) =>
  paintCanvas().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id }));
/** One finger run over board-unit points (300 x 300), shifted by (dx, dy) board units. */
function drag(pts: { x: number; y: number }[], dx = 0, dy = 0) {
  const k = SZ() / 300;
  pts.forEach((p, i) => ptr(i === 0 ? 'pointerdown' : 'pointermove', (p.x + dx) * k, (p.y + dy) * k));
  const q = pts[pts.length - 1];
  ptr('pointerup', (q.x + dx) * k, (q.y + dy) * k);
}
const strokes = () => CONTENT.letters[T].strokes.map(samplePath);
/** Passes over the whole letter, offset on a grid, so the brush covers every part of the stroke. */
function paintAll() {
  for (const dx of [-16, 0, 16]) for (const dy of [-16, 0, 16]) for (const s of strokes()) drag(s, dx, dy);
}

beforeEach(() => {
  vi.useFakeTimers();
  said = []; sfx = []; allFakes = [];
  document.body.replaceChildren();
  stage = document.createElement('div');
  document.body.appendChild(stage);
  vi.stubGlobal('Path2D', FakePath2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) { return fakeOf(this) as unknown as CanvasRenderingContext2D; });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// ---- tests ------------------------------------------------------------------------------------------

describe('paint the letter', () => {
  it('paint covers only inside the letter', async () => {
    // the pure rule: only pixels under the letter count, and a paint pixel outside the letter adds nothing
    const px = (alphas: number[]) => { const a = new Uint8ClampedArray(alphas.length * 4); alphas.forEach((v, i) => { a[i * 4 + 3] = v; }); return a; };
    const mask = px([255, 255, 255, 255, 0, 0, 0, 0]);
    expect(paintCoverage(mask, px([0, 0, 0, 0, 255, 255, 255, 255]))).toBe(0);
    expect(paintCoverage(mask, px([255, 255, 0, 0, 255, 255, 255, 255]))).toBe(0.5);
    expect(paintCoverage(mask, px([255, 255, 255, 255, 0, 0, 0, 0]))).toBe(1);
    expect(paintCoverage(mask, px([111, 255, 110, 255, 0, 0, 0, 0]))).toBe(0.75); // paint alpha above 110 counts
    expect(paintCoverage(px([200, 201, 0, 0]), px([255, 255, 255, 255]))).toBe(1); // mask alpha above 200 is the letter: only the 201 pixel
    expect(paintCoverage(px([200, 201, 0, 0]), px([255, 0, 255, 255]))).toBe(0);
    expect(paintCoverage(px([0, 0]), px([255, 255]))).toBe(0); // no letter, no coverage (no divide by zero)

    // the station: a stroke in the corner of the board, outside the letter, leaves the paint empty and the bar at 0
    void start();
    await vi.advanceTimersByTimeAsync(1);
    drag([{ x: 4, y: 4 }, { x: 40, y: 6 }, { x: 80, y: 4 }]);
    expect(alphaSum(fakeOf(paintCanvas()))).toBe(0);
    expect(barWidth()).toBe('0%');
    // a stroke along the letter does paint, and the bar moves
    drag(strokes()[0]);
    expect(alphaSum(fakeOf(paintCanvas()))).toBeGreaterThan(0);
    expect(parseFloat(barWidth())).toBeGreaterThan(0);
  });

  it('93% coverage wins after 0.9 s and fills the letter', async () => {
    expect(WIN_COVERAGE).toBe(0.93);
    void start();
    await vi.advanceTimersByTimeAsync(1);
    (stage.querySelectorAll('[data-pot]')[1] as HTMLElement).click(); // blue
    paintAll();
    expect(barWidth()).toBe('100%');
    await vi.advanceTimersByTimeAsync(899);
    expect(result).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('done');
    // the letter is filled completely with the current colour
    const paint = fakeOf(paintCanvas());
    expect(last(paint.fills)).toBe(PAINT_COLOURS[1].hex);
    const maskF = allFakes.find(f => !f.canvas.isConnected && f.w === paint.w)!; // the off-screen mask canvas
    let outside = 0, missing = 0;
    for (let i = 3; i < paint.data.length; i += 4) {
      if (maskF.data[i] > 200 && paint.data[i] < 255) missing++;
      if (maskF.data[i] === 0 && paint.data[i] > 0) outside++;
    }
    expect(missing).toBe(0);
    expect(outside).toBe(0);
  });

  it('restart clears the paint and the progress bar', async () => {
    void start();
    await vi.advanceTimersByTimeAsync(1);
    drag(strokes()[0]);
    expect(alphaSum(fakeOf(paintCanvas()))).toBeGreaterThan(0);
    expect(parseFloat(barWidth())).toBeGreaterThan(0);
    sfx.length = 0;
    one('[data-paint-restart]').click();
    expect(alphaSum(fakeOf(paintCanvas()))).toBe(0);
    expect(barWidth()).toBe('0%');
    expect(sfx).toContain('pick');
    // a restart in the 0.9 s before the win cancels it
    paintAll();
    expect(barWidth()).toBe('100%');
    await vi.advanceTimersByTimeAsync(500);
    one('[data-paint-restart]').click();
    await vi.advanceTimersByTimeAsync(2000);
    expect(result).toBeNull();
    expect(barWidth()).toBe('0%');
    drag(strokes()[0]); // painting goes on after the restart
    expect(alphaSum(fakeOf(paintCanvas()))).toBeGreaterThan(0);
  });

  it('tapping a pot selects it, plays its tone and speaks its name', async () => {
    void start();
    await vi.advanceTimersByTimeAsync(1);
    const pots = Array.from(stage.querySelectorAll('[data-pot]')) as HTMLElement[];
    expect(pots).toHaveLength(9);
    expect(PAINT_COLOURS.map(c => c.hex)).toEqual(['#E53935', '#1E6FD9', '#2EB85C', '#FFC928', '#FB8C00', '#8E24AA', '#00ACC1', '#6D4C41', '#A50044']);
    const names = ['אדום', 'כחול', 'ירוק', 'צהוב', 'כתום', 'סגול', 'טורקיז', 'חום', 'בורדו'];
    expect(pots.map(p => p.getAttribute('aria-label'))).toEqual(names);
    expect(pots.map(p => p.getAttribute('aria-pressed'))).toEqual(['true', ...Array(8).fill('false')]); // the first is selected
    for (const p of pots) expect(parseFloat(p.style.width)).toBeGreaterThanOrEqual(44);
    said.length = 0; sfx.length = 0;
    pots[2].click();
    expect(pots.map(p => p.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', ...Array(6).fill('false')]);
    expect(sfx).toEqual(['pot:2']);
    expect(said).toEqual([line(CONTENT, 'colour.green')]);
    expect(said).toEqual(['ירוק']);
    pots[8].click();
    expect(sfx).toEqual(['pot:2', 'pot:8']);
    expect(last(said)).toBe('בורדו');
    // the chosen colour is the one that fills the letter
    paintAll();
    await vi.advanceTimersByTimeAsync(900);
    expect(last(fakeOf(paintCanvas()).fills)).toBe('#A50044');
  });

  it('the crayon sound runs only while drawing and stops on abort', async () => {
    const ac = new AbortController();
    void start(makeCtx(ac.signal));
    await vi.advanceTimersByTimeAsync(1);
    expect(sfx).toEqual([]); // silent before a finger touches
    const k = SZ() / 300;
    const s = strokes()[0];
    ptr('pointerdown', s[0].x * k, s[0].y * k);
    expect(sfx).toEqual(['crayon:on']);
    ptr('pointermove', s[3].x * k, s[3].y * k);
    expect(sfx).toEqual(['crayon:on']);
    ptr('pointerup', s[3].x * k, s[3].y * k);
    expect(sfx).toEqual(['crayon:on', 'crayon:off']);
    ptr('pointermove', s[5].x * k, s[5].y * k); // a move with no finger down makes no sound
    expect(sfx).toEqual(['crayon:on', 'crayon:off']);
    ptr('pointerdown', s[0].x * k, s[0].y * k);
    expect(last(sfx)).toBe('crayon:on');
    ac.abort();
    await vi.advanceTimersByTimeAsync(1);
    expect(sfx.slice(-2)).toEqual(['crayon:off', 'crayonStop']);
    expect(result!.outcome).toBe('aborted');
    // after the abort nothing more reacts
    const n = sfx.length;
    ptr('pointerdown', s[0].x * k, s[0].y * k);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sfx).toHaveLength(n);
  });

  it('the crayon stops when the letter fills, and the win does not come after an abort', async () => {
    const ac = new AbortController();
    void start(makeCtx(ac.signal));
    await vi.advanceTimersByTimeAsync(1);
    paintAll();
    expect(last(sfx)).not.toBe('crayon:on');
    expect(sfx.filter(x => x === 'crayon:on').length).toBe(sfx.filter(x => x === 'crayon:off').length);
    await vi.advanceTimersByTimeAsync(300);
    ac.abort();
    await vi.advanceTimersByTimeAsync(2000);
    expect(result!.outcome).toBe('aborted');
    expect(result!.answers).toEqual([]);
  });

  it('paint records no answers', async () => {
    void start();
    await vi.advanceTimersByTimeAsync(1);
    expect(said[0]).toBe(line(CONTENT, 'paint.ask', { name: CONTENT.alphabet[T].name }));
    paintAll();
    await vi.advanceTimersByTimeAsync(900);
    expect(result).toEqual({ outcome: 'done', answers: [], slips: 0, ms: expect.any(Number) });
  });

  it('is a registered slice step; a canvas that cannot be made does not trap the child', async () => {
    expect(REGISTRY.paint).toBe(paintStep);
    expect(SLICE_STEPS).toContain('paint');
    expect(profileFor('3-5').allowedSteps).toContain('paint');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await start();
    expect(result).toMatchObject({ outcome: 'done', answers: [], slips: 0 });
  });

  it('the board is the old size: max(220, min(w * .9, h - 170, 540))', () => {
    expect(boardSize(390, 600)).toBe(351);
    expect(boardSize(1000, 900)).toBe(540);
    expect(boardSize(1000, 300)).toBe(220);
    expect(boardSize(200, 900)).toBe(220);
  });
});
