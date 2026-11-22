// Letter race: the old app's pseudo-3D road (web/index.html, race), the car seen from behind at the bottom of the stage.
// The road curves and climbs; the camera follows the car and the road slides under it. The child steers continuously
// (drag anywhere on the stage, or arrow keys) and collects the letter the voice named before the old 60 s timer runs
// out (owner 2026-11-21: "like the old app"). A wrong letter or a cone slows the car: a motor slip, never an answer.
// A pick-up is evidence only when the child steered within ACTIVE_SEC before it.
// Drawn with one SVG of merged paths (no canvas) and DOM items; the pure road model below is tested on its own.
import type { StepContext, StepModule } from './contract.ts';
import type { AnswerEvent, StepResult } from '../engine/types.ts';
import type { Spawn } from '../engine/scatter.ts';
import { createRng } from '../util/rng.ts';
import type { Rng } from '../util/rng.ts';
import { stepUnit } from './find.ts';
import { line } from '../audio/lines.ts';
import { h } from '../util/dom.ts';
import { faceAttrs, faceColors, faceCorrect, faceLook, faceSize } from './faces.ts';
import type { FaceLook } from './faces.ts';
import { activity, combo, createGame, createSpawner, instruct, measure, otherLetters, prefersReducedMotion, recallOk, starHud } from './gameKit.ts';

// ---- the old renderer's constants (index.html race)
export const SEG = 200;
export const RW = 2000;
export const LANES: readonly number[] = [-0.62, 0, 0.62];
export const CAMH = 1000;
export const DEPTH = 1 / Math.tan(50 * Math.PI / 180);
export const DRAW = 110;
/** The car's distance ahead of the camera: at this depth the road's half width is the stage width. */
export const PZ = CAMH * DEPTH;
export const ROAD_CURVES: readonly number[] = [0, 1.6, -1.6, 2.4, -2.4, 0, 3, -3];
export const ROAD_HILLS: readonly number[] = [0, 0, 8, -8, 14, -14];
const STEER_MAX = 0.8;    // carPos range in road units
const FINISH_AHEAD = 40;  // segments from the last pick-up to the finish line
const ITEM_SIZE = 380;    // item size in world units (old sz = s * W/2 * 380)
/** The car's bottom (where its wheels meet the road) stands this share of the stage height above the stage bottom: a free zone for the finger. */
/* owner 2026-11-21 (preview 0.6): "the car is still too low" - 0.25 -> 0.33 (owner: "no more than 33%"), measured on the visible screen */
export const CAR_BOTTOM_FRAC = 0.33;
/** The horizon's height from the stage top; raised from 0.5 with the car so the road from the car to the horizon stays at least 30% of the stage. */
export const HORIZON_FRAC = 0.34;
// the road's vertical scale: the road point at the car's depth lands on the car's line, the horizon on HORIZON_FRAC
const V_SCALE = 1 - CAR_BOTTOM_FRAC - HORIZON_FRAC;

export interface RoadItem {
  kind: 'letter' | 'cone';
  target: boolean;
  lane: number;
  off: number;
  seq: number;
  /** Hit, collected or cleared: no longer drawn or tested. */
  dead: boolean;
  letter?: string;
  look?: FaceLook;
}

/** One road segment; piece is the index of the addRoad call that made it. */
export interface Segment { i: number; curve: number; y1: number; y2: number; stripe: number; piece: number; items: RoadItem[] }

const eIn = (a: number, b: number, p: number): number => a + (b - a) * p * p;
const eIO = (a: number, b: number, p: number): number => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);

/**
 * The old addRoad: a curve eases in over `enter` segments, holds, and eases out over `leave`; the hill rises hill * SEG
 * over the whole piece (eased in and out). Departure: the height uses (n + 1) / total, so a piece ends exactly at its
 * hill height (the old one stopped one segment short of it).
 */
export function addRoad(segs: Segment[], enter: number, hold: number, leave: number, curve: number, hill: number): void {
  const last = segs.length ? segs[segs.length - 1] : null;
  const piece = last ? last.piece + 1 : 0;
  const sy = last ? last.y2 : 0;
  const ey = sy + hill * SEG;
  const tot = enter + hold + leave;
  const add = (c: number, k: number): void => {
    const i = segs.length;
    segs.push({ i, curve: c, y1: i ? segs[i - 1].y2 : 0, y2: hill ? eIO(sy, ey, (k + 1) / tot) : sy, stripe: Math.floor(i / 3) % 2, piece, items: [] });
  };
  for (let n = 0; n < enter; n++) add(eIn(0, curve, n / enter), n);
  for (let n = 0; n < hold; n++) add(curve, enter + n);
  for (let n = 0; n < leave; n++) add(eIO(curve, 0, n / leave), enter + hold + n);
}

/** The old road: a flat start, random curved and hilly pieces up to 2100 segments, a long flat end. */
export function buildRoad(rng: Rng): Segment[] {
  const segs: Segment[] = [];
  addRoad(segs, 10, 30, 10, 0, 0);
  while (segs.length < 2100) addRoad(segs, rng.int(15, 25), rng.int(25, 50), rng.int(15, 25), rng.pick(ROAD_CURVES), rng.pick(ROAD_HILLS));
  addRoad(segs, 20, 140, 20, 0, 0);
  return segs;
}

export interface ItemPlan { targets: number; slotSegs: readonly [number, number]; coneChance: number; secondChance: number }

/**
 * The old item slots: from segment 45 to length - 220, every slotSegs segments. A slot holds a cone (coneChance) or the
 * spawner's next letter (its order keeps the scatter rules); with secondChance a cone joins it in another lane.
 */
export function placeItems(road: Segment[], rng: Rng, cfg: ItemPlan, spawner: { next(remaining: number): Spawn }): void {
  let seq = 0;
  const cone = (lane: number): RoadItem => ({ kind: 'cone', target: false, lane, off: LANES[lane], seq: seq++, dead: false });
  for (let i = 45; i < road.length - 220; i += rng.int(cfg.slotSegs[0], cfg.slotSegs[1])) {
    const items = road[i].items;
    let lane: number;
    if (rng.next() < cfg.coneChance) {
      lane = rng.int(0, 2);
      items.push(cone(lane));
    } else {
      const s = spawner.next(cfg.targets);
      lane = s.lane;
      items.push({ kind: 'letter', target: s.target, lane, off: LANES[lane], seq: seq++, dead: false });
    }
    if (rng.next() < cfg.secondChance) items.push(cone((lane + rng.int(1, 2)) % 3));
  }
}

// ---- the collider: what the child sees (owner 2026-11-22, preview 0.7: "the car collider is a bit too wide, i dont want
// to collect or hit obstacles the car did not actually touch visually"). It was a lane band, |item.off - carPos| < 0.3
// road units at the car's segment: at the car's depth one road unit is W px, so the band reached 0.3 W from the car's
// centre, while the drawn car body reaches 0.13 W and an item's drawn half only adds about 0.08 W (0.21 W in all).
// Now an item counts only when its drawn shape overlaps the drawn car body: no padding, no lane band.

/** The car's drawn width in px on a stage W px wide (its body spans this width; the drawing's box is 1.14 x it). */
export const carWidth = (W: number): number => Math.min(W * 0.26, 230);
/** Half the car's body as a share of carWidth: the wheels and the roof bar span -50..50 of the 100-unit drawing (the shadow is not body). */
export const CAR_BODY_HALF = 0.5;
/** Half the cone's drawn width in its 100-unit item box: its base, x 10..90. */
const CONE_HALF = 40;
/** A letter's face disc in the 100-unit item box before its look's scale (faceStyle, border included). */
const FACE_BOX = 84;
const itemHalfUnits = (it: RoadItem): number => (it.kind === 'cone' ? CONE_HALF : (it.look ? faceSize(FACE_BOX, it.look) : FACE_BOX) / 2);

/**
 * The gap in px between an item's drawn edge and the car body's drawn edge (negative: they overlap). The item on
 * segment seg is projected exactly as roadFrame draws it this frame (its depth, the road's curve); the car stands at
 * the stage centre. A segment the car went past within one long frame is taken as it stood on the car's line (at the
 * car's depth, where the item is drawn largest; the small curve shift there is left out).
 */
export function carGap(road: Segment[], pos: number, carPos: number, seg: number, it: RoadItem, W: number): number {
  const n0 = Math.floor(pos / SEG);
  const bs = road[n0];
  let z = seg * SEG - pos;
  let x = 0;
  if (bs && z > PZ - SEG) {
    // the curve shift roadFrame has accumulated when it reaches segment seg
    let dx = -(bs.curve * ((pos % SEG) / SEG));
    for (let n = n0; n < seg && road[n]; n++) { x += dx; dx += road[n].curve; }
  } else {
    z = PZ;
  }
  const k = DEPTH / z * W / 2;
  return Math.abs(k * ((it.off - carPos) * RW + x)) - k * ITEM_SIZE / 100 * itemHalfUnits(it) - carWidth(W) * CAR_BODY_HALF;
}

/** True when the item visibly overlaps the car body (it is collected, or it hits the car). */
export const touchesCar = (road: Segment[], pos: number, carPos: number, seg: number, it: RoadItem, W: number): boolean =>
  carGap(road, pos, carPos, seg, it, W) < 0;

export type QuadKind = 'grass' | 'rumble' | 'road' | 'lane' | 'finish';
/** A screen trapezoid: bottom edge centred at x1 on y1 with half width w1, top edge at x2 / y2 / w2. */
export interface Quad { seg: number; kind: QuadKind; fill: string; x1: number; y1: number; w1: number; x2: number; y2: number; w2: number }
/** An item's base point on the road, its size in px, and the crest line below which it is cut off. */
export interface ItemDraw { item: RoadItem; seg: number; x: number; y: number; size: number; clip: number; visible: boolean; depth: number }
export interface RoadFrame { quads: Quad[]; items: ItemDraw[]; bgShift: number }

interface Proj { x: number; y: number; w: number; s: number; z: number }
interface ItemSlot extends Proj { seg: Segment; clip: number; n: number }
/** Scratch objects roadFrame reuses from one call to the next (a frame builds hundreds of quads). */
export interface FrameBuf { frame: RoadFrame; quadPool: Quad[]; itemPool: ItemDraw[]; slotPool: ItemSlot[]; a: Proj; b: Proj }
export function createFrameBuf(): FrameBuf {
  return { frame: { quads: [], items: [], bgShift: 0 }, quadPool: [], itemPool: [], slotPool: [], a: { x: 0, y: 0, w: 0, s: 0, z: 0 }, b: { x: 0, y: 0, w: 0, s: 0, z: 0 } };
}

const LANE_MARKS: readonly number[] = [-0.31, 0.31];

/**
 * The old render pass as data: the drawn segments (near to far) as screen quads and the items on them. A segment is
 * skipped when behind the camera, back facing or hidden by a nearer crest; the part of a segment below the nearer road
 * is cut off. bgShift is the curve under the camera (the hills move by bgShift * speed / maxSpeed * dt * 60).
 * The road point at the car's depth lands CAR_BOTTOM_FRAC of H above the stage bottom; nearer road runs on below it.
 * Pass a buf to reuse the result objects: the returned frame is then overwritten by the next call with the same buf.
 */
export function roadFrame(road: Segment[], pos: number, carPos: number, W: number, H: number, finishSeg = -1, buf: FrameBuf = createFrameBuf()): RoadFrame {
  const frame = buf.frame;
  const quads = frame.quads, items = frame.items;
  quads.length = 0;
  items.length = 0;
  frame.bgShift = 0;
  const n0 = Math.floor(pos / SEG);
  const bs = road[n0];
  if (!bs) return frame;
  const bp = (pos % SEG) / SEG;
  const ps = road[Math.floor((pos + PZ) / SEG)] ?? road[road.length - 1];
  const pp = ((pos + PZ) % SEG) / SEG;
  const camY = ps.y1 + (ps.y2 - ps.y1) * pp + CAMH;
  const vk = V_SCALE * H;
  const proj = (o: Proj, wy: number, wz: number, camX: number): Proj => {
    const z = wz - pos, s = DEPTH / z;
    o.x = W / 2 - s * camX * W / 2; o.y = H * HORIZON_FRAC - s * (wy - camY) * vk; o.w = s * RW * W / 2; o.s = s; o.z = z;
    return o;
  };
  let nq = 0;
  const q = (seg: number, kind: QuadKind, fill: string, x1: number, y1: number, w1: number, x2: number, y2: number, w2: number): void => {
    const o = buf.quadPool[nq] ?? (buf.quadPool[nq] = { seg, kind, fill, x1, y1, w1, x2, y2, w2 });
    nq++;
    o.seg = seg; o.kind = kind; o.fill = fill; o.x1 = x1; o.y1 = y1; o.w1 = w1; o.x2 = x2; o.y2 = y2; o.w2 = w2;
    quads.push(o);
  };
  let maxy = H, x = 0, dx = -(bs.curve * bp);
  let ns = 0;
  const a = buf.a, b = buf.b;
  for (let n = 0; n < DRAW; n++) {
    const s = road[n0 + n];
    if (!s) break;
    proj(a, s.y1, s.i * SEG, carPos * RW - x);
    proj(b, s.y2, (s.i + 1) * SEG, carPos * RW - x - dx);
    x += dx;
    dx += s.curve;
    if (s.items.length) {
      const o = buf.slotPool[ns] ?? (buf.slotPool[ns] = { x: 0, y: 0, w: 0, s: 0, z: 0, seg: s, clip: 0, n: 0 });
      ns++;
      o.x = a.x; o.y = a.y; o.w = a.w; o.s = a.s; o.z = a.z; o.seg = s; o.clip = maxy; o.n = n;
    }
    if (a.z <= DEPTH || b.y >= a.y || b.y >= maxy) continue;
    let ax = a.x, ay = a.y, aw = a.w;
    if (ay > maxy) {
      const f = (ay - maxy) / (ay - b.y);
      ax += (b.x - a.x) * f; aw += (b.w - a.w) * f; ay = maxy;
    }
    const st = s.stripe;
    q(s.i, 'grass', st ? '#8BC34A' : '#7CB342', W / 2, ay, W / 2, W / 2, b.y, W / 2);
    q(s.i, 'rumble', st ? '#E53935' : '#FFFFFF', ax, ay, aw * 1.18, b.x, b.y, b.w * 1.18);
    q(s.i, 'road', st ? '#90A4AE' : '#9AA9B3', ax, ay, aw, b.x, b.y, b.w);
    if (finishSeg >= 0 && (s.i === finishSeg || s.i === finishSeg + 1)) {
      for (let j = 0; j < 8; j++) {
        const c = -1 + (2 * j + 1) / 8;
        q(s.i, 'finish', (j + s.i) % 2 ? '#000000' : '#FFFFFF', ax + aw * c, ay, aw / 8, b.x + b.w * c, b.y, b.w / 8);
      }
    } else if (st) {
      for (let k = 0; k < LANE_MARKS.length; k++) q(s.i, 'lane', '#FFFFFF', ax + aw * LANE_MARKS[k], ay, aw / 45, b.x + b.w * LANE_MARKS[k], b.y, b.w / 45);
    }
    maxy = b.y;
  }
  let ni = 0;
  for (let k = ns - 1; k >= 0; k--) {
    const sl = buf.slotPool[k];
    if (sl.z <= DEPTH) continue;
    for (const it of sl.seg.items) {
      if (it.dead) continue;
      const size = sl.s * W / 2 * ITEM_SIZE;
      const ix = sl.x + sl.s * it.off * RW * W / 2;
      const visible = size >= 4 && sl.y - 1.6 * size < sl.clip;
      const o = buf.itemPool[ni] ?? (buf.itemPool[ni] = { item: it, seg: 0, x: 0, y: 0, size: 0, clip: 0, visible: false, depth: 0 });
      ni++;
      o.item = it; o.seg = sl.seg.i; o.x = ix; o.y = sl.y; o.size = size; o.clip = sl.clip; o.visible = visible; o.depth = sl.n;
      items.push(o);
    }
  }
  frame.bgShift = bs.curve;
  return frame;
}

// ---- view

const SVG_NS = 'http://www.w3.org/2000/svg';
const KEY_DIR: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
// paint order of the merged road paths; the view pads the quads a little so neighbours never show a seam
const LAYERS: readonly [QuadKind, string, number][] = [
  ['grass', '#8BC34A', 1], ['grass', '#7CB342', 1], ['rumble', '#E53935', 0.5], ['rumble', '#FFFFFF', 0.5],
  ['road', '#90A4AE', 0.5], ['road', '#9AA9B3', 0.5], ['lane', '#FFFFFF', 0], ['finish', '#000000', 0], ['finish', '#FFFFFF', 0],
];
const LEAF_COLORS = ['#FB8C00', '#FFC928', '#8BC34A', '#E53935'];
const BURST_COLORS = ['#FFC928', '#E53935', '#1E6FD9', '#2EB85C'];
const INK = '#0D2A5C';

// The old drawCar at w = 100 (h = 55), origin at the bottom centre; the plate stays blank (the target is only spoken).
const CAR_SVG = `<svg width="100%" height="100%" viewBox="-57 -67 114 75" aria-hidden="true" style="display:block;overflow:visible"><ellipse cx="0" cy="0" rx="56" ry="7.15" fill="rgba(0,0,0,.25)"></ellipse><rect x="-50" y="-22" width="20" height="22" rx="4" fill="#212121"></rect><rect x="30" y="-22" width="20" height="22" rx="4" fill="#212121"></rect><rect x="-30" y="-59.4" width="60" height="24.75" rx="10" fill="#E53935" stroke="${INK}" stroke-width="2"></rect><rect x="-24" y="-55" width="48" height="15.4" rx="6" fill="#B3E5FC"></rect><rect x="-47" y="-39.6" width="94" height="28.6" rx="9" fill="#E53935" stroke="${INK}" stroke-width="2"></rect><rect x="-42" y="-33" width="15" height="6.05" fill="#FF1744"></rect><rect x="27" y="-33" width="15" height="6.05" fill="#FF1744"></rect><rect x="-13" y="-28.6" width="26" height="11" rx="3" fill="#FFFFFF" stroke="${INK}" stroke-width="2"></rect><rect x="-50" y="-66" width="100" height="4.4" fill="${INK}"></rect><rect x="-4" y="-62.15" width="8" height="5.5" fill="${INK}"></rect></svg>`;
// The old cone at sz = 100 in a 100 x 160 item box (base at the bottom centre).
const CONE_SVG = '<svg width="100" height="160" viewBox="0 0 100 160" aria-hidden="true" style="display:block"><path d="M50 70 L82 160 L18 160z" fill="#FF6D00"></path><rect x="33" y="110" width="34" height="12" fill="#FFFFFF"></rect><rect x="10" y="152" width="80" height="8" fill="#E65100"></rect></svg>';
const CLOCK_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="9" fill="#FFFFFF" stroke="${INK}" stroke-width="2.5"></circle><path d="M12 8v5l3 2M9 2h6" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"></path></svg>`;

// layer index by kind and fill, so a quad finds its path without a search or a key string
const LAYER_OF: Record<string, Record<string, number>> = {};
LAYERS.forEach(([kind, fill], k) => { (LAYER_OF[kind] ??= {})[fill] = k; });

const r1 = (v: number): number => Math.round(v * 10) / 10;

const attrCache = new WeakMap<Element, Record<string, string>>();
/** Writes an attribute only when it changed. */
function setAttr(el: Element, name: string, value: string): void {
  let c = attrCache.get(el);
  if (!c) { c = {}; attrCache.set(el, c); }
  if (c[name] === value) return;
  c[name] = value;
  el.setAttribute(name, value);
}

/** Writes a style property only when it changed (a frame touches dozens of items; most of them keep their values). */
const styleCache = new WeakMap<HTMLElement, Record<string, string>>();
function setStyle(el: HTMLElement, prop: 'display' | 'transform' | 'zIndex' | 'clipPath' | 'opacity', value: string): void {
  let c = styleCache.get(el);
  if (!c) { c = {}; styleCache.set(el, c); }
  if (c[prop] === value) return;
  c[prop] = value;
  el.style[prop] = value;
}
let gradientSeq = 0;

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) el.setAttribute(k, String(val));
  return el;
}

/** The old hills band: a sine skyline from x = 0 to W, closed along the bottom. */
function hillsPath(W: number, H: number, off: number, base: number, amp: number, waves: number): string {
  let d = `M0 ${r1(H)}`;
  for (let x = 0; x <= W + 20; x += 20) d += `L${x} ${r1(base - amp * (0.5 + 0.5 * Math.sin((x + off) / W * Math.PI * waves)))}`;
  return d + `L${r1(W)} ${r1(H)}Z`;
}

const faceStyle = (look: FaceLook): string => {
  const box = faceSize(84, look);
  return `position:absolute;box-sizing:border-box;left:${r1(50 - box / 2)}px;top:${r1(55 - box / 2)}px;width:${box}px;height:${box}px;border-radius:50%;border:6px solid ${INK};${faceColors(look)};display:flex;align-items:center;justify-content:center;font-size:${faceSize(56, look)}px;line-height:1;font-family:Rubik,sans-serif;font-weight:900`;
};

type State = 'ask' | 'count' | 'play' | 'finish' | 'end';

export const raceStep: StepModule = {
  id: 'race',
  async run(ctx: StepContext): Promise<StepResult> {
    if (ctx.signal.aborted) return { outcome: 'aborted', answers: [], slips: 0, ms: 0 };
    const c = ctx.content;
    const unit = stepUnit(ctx);
    const name = c.alphabet[unit]?.name ?? unit;
    const cfg = ctx.profile.race;
    const need = cfg.targets;
    const MAXS = cfg.maxSpeed;
    const others = otherLetters(ctx, unit, 3);
    const reduced = prefersReducedMotion();
    const game = createGame(ctx);

    // ---- the road and its items (the target's look is drawn exactly like the other letters')
    const road = buildRoad(ctx.rng);
    placeItems(road, ctx.rng, cfg, createSpawner({ lanes: 3, rng: ctx.rng }));
    for (const s of road) {
      for (const it of s.items) {
        if (it.kind !== 'letter') continue;
        it.letter = it.target ? unit : ctx.rng.pick(others);
        it.look = faceLook(ctx.rng);
      }
    }

    // decoration and fallbacks draw from their own stream: ctx.rng is used only while the road is dealt
    const fx = createRng(ctx.rng.int(1, 0x7fffffff));

    // ---- view
    const gid = `race-sky-${++gradientSeq}`;
    const scenery = svgEl('svg', { width: '100%', height: '100%', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
    scenery.setAttribute('style', 'position:absolute;inset:0;display:block');
    const grad = svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1, gradientUnits: 'userSpaceOnUse' });
    grad.append(svgEl('stop', { offset: 0, 'stop-color': '#1E88E5' }), svgEl('stop', { offset: 1, 'stop-color': '#B3E5FC' }));
    const defs = svgEl('defs', {});
    defs.appendChild(grad);
    const sky = svgEl('rect', { x: 0, y: 0, width: 1, height: 1, fill: `url(#${gid})` });
    const sun = svgEl('circle', { cx: 0, cy: 0, r: 1, fill: '#FFE082' });
    const hillFar = svgEl('path', { d: '', fill: '#A5D6A7' });
    const hillNear = svgEl('path', { d: '', fill: '#81C784' });
    const roadPaths = LAYERS.map(([kind, fill]) => svgEl('path', { d: '', fill, 'data-layer': `${kind}${fill}`, ...(kind === 'finish' ? { 'data-finish': '1' } : {}) }));
    scenery.append(defs, sky, sun, hillFar, hillNear, ...roadPaths);
    const layer = h('div', { style: 'position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden' });
    const decor = h('div', { style: 'position:absolute;inset:0;z-index:4;pointer-events:none;overflow:hidden' });
    const car = h('div', { 'data-car': '1', 'data-x': '0', 'aria-hidden': 'true', style: 'position:absolute;left:0;top:0;z-index:3;will-change:transform' });
    car.innerHTML = CAR_SVG;
    const count = h('div', { 'data-count': '1', 'aria-hidden': 'true', hidden: '', style: `position:absolute;left:0;right:0;z-index:6;text-align:center;line-height:1;font-family:Rubik,sans-serif;font-weight:900;color:#FFC928;-webkit-text-stroke:5px ${INK};pointer-events:none` });
    const hud = starHud(need);
    const timeText = h('b', {}, String(cfg.timeSec));
    const timer = h('div', {
      'data-timer': '1', role: 'timer', 'aria-label': String(cfg.timeSec),
      style: `position:absolute;top:60px;inset-inline-start:10px;z-index:5;display:flex;align-items:center;gap:6px;padding:4px 12px;background:#FFFFFF;border:3px solid ${INK};border-radius:16px;box-shadow:0 4px 0 ${INK};font-family:Rubik,sans-serif;font-weight:900;font-size:22px;color:${INK};pointer-events:none`,
    });
    timer.innerHTML = CLOCK_SVG;
    timer.appendChild(timeText);
    const arena = h('div', {
      'data-step': 'race', 'data-state': 'ask',
      style: 'position:absolute;inset:0;overflow:hidden;background:#B3E5FC;touch-action:none;user-select:none;-webkit-user-select:none',
    }, scenery, layer, car, decor, count, hud.el, timer);
    ctx.stage.appendChild(arena);

    // ---- geometry
    let W = 390, H = 600, carW = 100, left = 0;
    const layout = (): void => {
      const rc = arena.getBoundingClientRect();
      const m = measure(arena); // H is the VISIBLE height: the stage may run below the screen edge
      W = m.w; H = m.h; left = rc.left;
      carW = carWidth(W);
      scenery.setAttribute('viewBox', `0 0 ${W} ${H}`);
      grad.setAttribute('y2', String(H * 0.6));
      sky.setAttribute('width', String(W));
      sky.setAttribute('height', String(H));
      sun.setAttribute('cx', String(r1(W * 0.82)));
      sun.setAttribute('cy', String(r1(H * 0.13)));
      sun.setAttribute('r', String(r1(Math.min(W, H) * 0.07)));
      car.style.width = `${r1(carW * 1.14)}px`;
      car.style.height = `${r1(carW * 0.75)}px`;
      car.style.transformOrigin = `${r1(carW * 0.57)}px ${r1(carW * 0.67)}px`;
      count.style.top = `${r1(H * 0.42 - Math.min(W, H) * 0.16)}px`;
      count.style.fontSize = `${r1(Math.min(W, H) * 0.32)}px`;
    };
    layout();

    // ---- input: a finger anywhere steers toward its x; arrow keys steer while held
    let carPos = 0, steerTarget = 0, clock = 0;
    let drag: { id: number; target: number } | null = null;
    let keyDir = 0;
    const act = activity();
    const steerAt = (clientX: number): number => {
      const x = clientX - left;
      return Math.max(-1, Math.min(1, (x - W / 2) / (W / 2))) * STEER_MAX;
    };
    game.listen(window, 'resize', layout);
    game.listen(window, 'orientationchange', layout);
    game.listen(document, 'keydown', (e) => {
      const d = KEY_DIR[(e as KeyboardEvent).key];
      if (d) { keyDir = d; e.preventDefault(); }
    });
    game.listen(document, 'keyup', (e) => { if (KEY_DIR[(e as KeyboardEvent).key] === keyDir) keyDir = 0; });
    // a hidden page or a lost window focus never delivers the key-up / pointer-up: let go of the held steering
    const letGo = (): void => { keyDir = 0; drag = null; };
    game.listen(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') letGo(); });
    game.listen(window, 'blur', letGo);
    game.listen(arena, 'pointerdown', (ev) => {
      const e = ev as PointerEvent;
      if (drag) return;
      left = arena.getBoundingClientRect().left; // the stage may have moved since the last resize
      drag = { id: e.pointerId, target: steerAt(e.clientX) };
      act.mark(clock);
      try { arena.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    });
    game.listen(arena, 'pointermove', (ev) => {
      const e = ev as PointerEvent;
      if (drag && e.pointerId === drag.id) { drag.target = steerAt(e.clientX); act.mark(clock); }
    });
    const endDrag = (ev: Event): void => { if (drag && (ev as PointerEvent).pointerId === drag.id) drag = null; };
    game.listen(arena, 'pointerup', endDrag);
    game.listen(arena, 'pointercancel', endDrag);
    game.listen(arena, 'lostpointercapture', endDrag);

    // ---- sound
    const sfx = (n: Parameters<StepContext['sfx']['play']>[0], arg?: number): void => {
      try { if (arg === undefined) ctx.sfx.play(n); else ctx.sfx.play(n, arg); } catch { /* no audio */ }
    };
    const hum = (on: boolean, ratio: number): void => { try { ctx.sfx.engineHum(on, ratio); } catch { /* no audio */ } };
    let engineOff = false;
    const stopEngine = (): void => {
      if (engineOff) return;
      engineOff = true;
      try { ctx.sfx.engineStop(); } catch { /* no audio */ }
    };
    void game.result.then(stopEngine); // done, fail, and abort (back / leaving the screen)
    const streak = combo(ctx.sfx);

    // ---- items on screen
    const els = new Map<RoadItem, HTMLElement>();
    const faces = new Map<RoadItem, HTMLElement>();
    const itemEl = (it: RoadItem, seg: number): HTMLElement => {
      const el = h('div', {
        [it.kind === 'cone' ? 'data-cone' : 'data-disc']: '1', 'data-seq': String(it.seq), 'data-lane': String(it.lane), 'data-seg': String(seg), 'aria-hidden': 'true',
        style: 'position:absolute;left:0;top:0;width:100px;height:160px;transform-origin:50% 100%;will-change:transform;transition:opacity .3s',
      });
      if (it.kind === 'cone') {
        el.innerHTML = CONE_SVG;
      } else {
        const look = it.look ?? faceLook(fx);
        const face = h('div', { ...faceAttrs(look), style: faceStyle(look) }, it.letter ?? '');
        el.append(h('div', { style: `position:absolute;left:48.5px;top:90px;width:3px;height:70px;background:${INK}` }), face);
        faces.set(it, face);
      }
      layer.appendChild(el);
      els.set(it, el);
      return el;
    };
    /** A hit, collected or cleared item fades where it is, then goes. */
    const leave = (it: RoadItem, cls: string, grow = 1): void => {
      const el = els.get(it);
      if (!el) return;
      el.dataset.leaving = '1';
      el.classList.add(cls);
      if (grow !== 1 && !reduced) el.style.transform = `${styleCache.get(el)?.transform ?? ''} scale(${grow})`;
      el.style.opacity = '0';
      game.later(300, () => { el.remove(); els.delete(it); faces.delete(it); });
    };

    // ---- decoration (none when motion is reduced)
    const leaves = reduced ? [] : Array.from({ length: 12 }, () => {
      const el = h('div', { 'data-leaf': '1', style: `position:absolute;left:0;top:0;width:14px;height:7px;margin:-3.5px 0 0 -7px;border-radius:50%;background:${fx.pick(LEAF_COLORS)};will-change:transform` });
      decor.appendChild(el);
      return { el, x: fx.next(), y: fx.next(), v: 0.05 + fx.next() * 0.07, r: fx.next() * 6 };
    });
    let bursts: { el: HTMLElement; x: number; y: number; vx: number; vy: number; l: number }[] = [];
    const burst = (): void => {
      if (reduced) return;
      for (let i = 0; i < 18; i++) {
        const el = h('div', { 'data-burst': '1', style: `position:absolute;left:0;top:0;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:${fx.pick(BURST_COLORS)};will-change:transform` });
        decor.appendChild(el);
        bursts.push({ el, x: W / 2, y: H * (1 - CAR_BOTTOM_FRAC) - carW * 0.3, vx: -6 + fx.next() * 12, vy: -9 + fx.next() * 7, l: 1 });
      }
    };

    // ---- play
    const answers: AnswerEvent[] = [];
    let state: State = 'ask';
    let pos = 0, speed = 0, slow = 0, got = 0, slips = 0, finishSeg = -1, bgX = 0, engT = 0, tMs = 0;
    let tLeft = cfg.timeSec, lastTick = -1, shownSec = cfg.timeSec, cd = 0;
    let lastSeg = Math.floor(PZ / SEG);
    const endPos = (road.length - DRAW - 4) * SEG;
    const failPos = (road.length - DRAW - 5) * SEG;
    const setState = (s: State): void => { state = s; arena.setAttribute('data-state', s); };

    const showTime = (): void => {
      const s = Math.max(0, Math.ceil(tLeft));
      if (s === shownSec) return;
      shownSec = s;
      timeText.textContent = String(s);
      timer.setAttribute('aria-label', String(s));
      timer.style.background = s <= 10 ? '#FFCDD2' : s <= 25 ? '#FFF3CD' : '#FFFFFF';
    };

    const collect = (it: RoadItem, seg: number): void => {
      got++;
      if (act.recent(clock)) answers.push(recallOk(unit));
      const face = faces.get(it);
      if (face) { faceCorrect(face); face.style.borderColor = '#FFFFFF'; }
      leave(it, 'is-collected', 1.3);
      sfx('good');
      streak.hit();
      burst();
      void game.speak(name);
      hud.fill(got);
      ctx.progress(got / need);
      if (got >= need) {
        // the timer stops at the last letter; the road ahead clears for the finish line
        setState('finish');
        finishSeg = seg + FINISH_AHEAD;
        for (let i = seg; i < Math.min(road.length, seg + FINISH_AHEAD + DRAW); i++) {
          for (const x of road[i].items) if (!x.dead) { x.dead = true; leave(x, 'is-cleared'); }
        }
        game.later(700, () => { void game.speak(line(c, 'race.finish')); });
      }
    };
    const hitSegment = (i: number): void => {
      const s = road[i];
      if (!s) return;
      for (const it of s.items) {
        if (it.dead || state !== 'play' || !touchesCar(road, pos, carPos, i, it, W)) continue;
        it.dead = true;
        if (it.target) { collect(it, i); continue; }
        slow = it.kind === 'cone' ? cfg.coneSlowSec : cfg.wrongSlowSec;
        slips++;
        sfx('bump');
        streak.miss();
        leave(it, 'is-hit');
      }
    };
    const finish = (ok: boolean): void => {
      setState('end');
      stopEngine();
      if (ok) game.done(answers, slips); else game.fail(answers, slips, 'race.timeUp');
    };

    const steer = (dt: number): void => {
      const before = carPos;
      const maxStep = cfg.steerPerSec * dt;
      if (drag) {
        steerTarget = drag.target;
        const gap = steerTarget - carPos;
        carPos += Math.max(-maxStep, Math.min(maxStep, gap * Math.min(1, dt * 10)));
      } else if (keyDir) {
        carPos += keyDir * maxStep;
        steerTarget = Math.max(-STEER_MAX, Math.min(STEER_MAX, carPos + keyDir * 0.3));
      } else {
        steerTarget = carPos;
      }
      carPos = Math.max(-STEER_MAX, Math.min(STEER_MAX, carPos));
      // crossing a lane centre plays the old lane-change tone
      LANES.forEach((l, k) => { if ((before < l && carPos >= l) || (before > l && carPos <= l)) sfx('lane', k); });
    };

    const frameBuf = createFrameBuf();
    const ds: string[][] = LAYERS.map(() => []);
    const seen = new Set<RoadItem>();
    const render = (): void => {
      const f = roadFrame(road, pos, carPos, W, H, finishSeg, frameBuf);
      for (const d of ds) d.length = 0;
      for (const q of f.quads) {
        const k = LAYER_OF[q.kind][q.fill];
        const pad = LAYERS[k][2];
        const y1 = r1(q.y1 + pad), y2 = r1(q.y2 - pad);
        ds[k].push(`M${r1(q.x1 - q.w1)} ${y1}L${r1(q.x1 + q.w1)} ${y1}L${r1(q.x2 + q.w2)} ${y2}L${r1(q.x2 - q.w2)} ${y2}Z`);
      }
      roadPaths.forEach((p, k) => setAttr(p, 'd', ds[k].join('')));
      setAttr(hillFar, 'd', hillsPath(W, H, bgX * 0.4, H * (HORIZON_FRAC - 0.06), H * 0.14, 3));
      setAttr(hillNear, 'd', hillsPath(W, H, bgX * 0.8 + 300, H * HORIZON_FRAC, H * 0.09, 5));

      seen.clear();
      for (const d of f.items) {
        if (!d.visible) continue;
        seen.add(d.item);
        const el = els.get(d.item) ?? itemEl(d.item, d.seg);
        const k = d.size / 100;
        setStyle(el, 'display', '');
        setStyle(el, 'transform', `translate(${r1(d.x - 50)}px,${r1(d.y - 160)}px) scale(${k.toFixed(4)})`);
        setStyle(el, 'zIndex', String(DRAW - d.depth));
        const cut = (d.y - d.clip) / k;
        setStyle(el, 'clipPath', cut > 0 ? `inset(0 0 ${cut.toFixed(1)}px 0)` : '');
        const face = faces.get(d.item);
        if (face && !reduced) setStyle(face, 'transform', `translateY(${r1(Math.sin(tMs / 300 + d.x) * 4)}px)`);
      }
      const n0 = Math.floor(pos / SEG);
      for (const [it, el] of els) {
        if (seen.has(it) || el.dataset.leaving) continue;
        if (Number(el.dataset.seg) < n0) { el.remove(); els.delete(it); faces.delete(it); } else setStyle(el, 'display', 'none');
      }

      const moving = state === 'play' || state === 'finish';
      const bounce = moving ? Math.sin(tMs / 60) * (speed / MAXS) * 1.5 : 0;
      setStyle(car, 'transform', `translate(${r1(W / 2 - carW * 0.57)}px,${r1(H * (1 - CAR_BOTTOM_FRAC) + bounce - carW * 0.67)}px) rotate(${((steerTarget - carPos) * 0.35).toFixed(3)}rad)`);
      setAttr(car, 'data-x', carPos.toFixed(3));

      for (const l of leaves) {
        if (moving) {
          l.y += l.v * 0.016 * (1 + speed / MAXS);
          l.x += Math.sin(tMs / 900 + l.r) * 0.0015;
          if (l.y > 1.05) { l.y = -0.05; l.x = fx.next(); }
        }
        setStyle(l.el, 'transform', `translate(${r1(l.x * W)}px,${r1(l.y * H)}px) rotate(${r1(tMs / 600 + l.r)}rad)`);
      }
      if (bursts.length) {
        bursts = bursts.filter((p) => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.l -= 0.025;
          if (p.l <= 0) { p.el.remove(); return false; }
          p.el.style.opacity = String(r1(p.l));
          p.el.style.transform = `translate(${r1(p.x)}px,${r1(p.y)}px)`;
          return true;
        });
      }
      setAttr(arena, 'data-seg', String(Math.floor((pos + PZ) / SEG)));
      setAttr(arena, 'data-speed', String(Math.round(speed)));
      setAttr(arena, 'data-slow', slow.toFixed(2));
    };

    game.loop((dt) => {
      clock += dt;
      tMs += dt * 1000;
      // a finger on the stage or a held key is steering, also while the car already sits where it should
      if (drag || keyDir) act.mark(clock);
      if (state === 'count') {
        const before = Math.ceil(cd);
        cd -= dt;
        if (cd <= 0) {
          count.hidden = true;
          setState('play');
          sfx('go');
          void game.speak(line(c, 'race.go'));
        } else if (Math.ceil(cd) !== before) {
          count.textContent = String(Math.ceil(cd));
          sfx('tick');
        }
      }
      if (state === 'count' || state === 'play' || state === 'finish') steer(dt);
      if (state === 'play' || state === 'finish') {
        slow = Math.max(0, slow - dt);
        const goal = slow > 0 ? MAXS * 0.45 : MAXS;
        speed += (goal - speed) * Math.min(1, dt * (slow > 0 ? 4 : 1.2));
        pos = Math.min(pos + speed * dt, endPos);
        bgX -= (road[Math.floor(pos / SEG)]?.curve ?? 0) * (speed / MAXS) * dt * 60;
        if (state === 'play') {
          tLeft -= dt;
          const s = Math.ceil(tLeft);
          if (tLeft <= 10 && s > 0 && s !== lastTick) { lastTick = s; sfx('tick'); }
          showTime();
        }
        const carSeg = Math.floor((pos + PZ) / SEG);
        // every segment the car reached since the last frame, and the one it is on (it may steer onto an item there)
        for (let i = Math.min(lastSeg + 1, carSeg); i <= carSeg; i++) hitSegment(i);
        lastSeg = carSeg;
        if (state === 'finish' && (carSeg >= finishSeg || pos >= failPos)) finish(true);
        else if (state === 'play' && (tLeft <= 0 || pos >= failPos)) finish(false);
      }
      engT += dt;
      if (engT >= 0.1) {
        engT = 0;
        if (state !== 'end') hum(state === 'play' || state === 'finish', speed / MAXS);
      }
      if (!game.over) render();
    });

    // the ask, then the old 3-2-1 countdown; the timer runs only while playing
    void instruct(ctx, game, line(c, 'race.ask', { name })).then(() => {
      if (game.over) return;
      cd = 3;
      count.textContent = '3';
      count.hidden = false;
      setState('count');
      sfx('tick');
    });
    return game.result;
  },
};
