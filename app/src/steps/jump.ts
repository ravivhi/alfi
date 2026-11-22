// Dino jumper: the old app's dino in the volcano valley (web/index.html, dino). The dino runs on its own, a tap anywhere
// on the stage makes it hop. Three levels, each a little harder (old LV): collect the letter the voice named, hop over
// pits of lava, rocks and the other letters, hop up the steps; when a level's letters are in, the door opens and the
// level card leads to the next level. Five hearts for the whole game (old): a fall, a rock or touching another letter
// costs one and restarts the dino on its trail 2 s back; at none the step fails (owner 2026-11-21: "like the old app").
// Every loss is a motor slip, never an answer. A letter is evidence only when the child tapped within ACTIVE_SEC.
// "Try again" from the failed window starts the level where the hearts ran out (ctx.resume, owner 2026-11-21).
import type { StepContext, StepModule } from './contract.ts';
import type { AnswerEvent, StepResult } from '../engine/types.ts';
import type { JumpLevel } from '../engine/profiles.ts';
import type { Rng } from '../util/rng.ts';
import { stepUnit } from './find.ts';
import { line } from '../audio/lines.ts';
import { h } from '../util/dom.ts';
import { faceAttrs, faceColors, faceCorrect, faceLook, faceSize } from './faces.ts';
import type { FaceLook } from './faces.ts';
import { activity, combo, createGame, instruct, measure, otherLetters, prefersReducedMotion, recallOk, starHud } from './gameKit.ts';
import { CONFETTI_KEYFRAMES, CONFETTI_MS, confettiShower } from '../ui/resultWindow.ts';

/** The old stage geometry in stage units (the stage is viewH units tall). Exported for the tests' bot. */
export const JUMP = {
  groundY: 320,
  viewH: 420,
  /** A portrait phone still sees this many units across (old: only the height set the scale). */
  minViewW: 300,
  /** Letters are caught by the dino's body, this far above its feet. */
  body: 32,
  stepUp: 60,
  /** The platforms' top above the ground. */
  platTop: 118,
  rockW: 46,
  rockH: 40,
  coyote: 0.12,
  buffer: 0.2,
} as const;

const GY: number = JUMP.groundY;
const START_X = 160;
const R = 27;                      // letter sign radius (old)
const LOW = 48, HIGH = 130;        // a target's centre above the ground: caught running / needs a hop
const WRONG_Y = 40;
const PLAT_W = 124, PLAT_TOP: number = JUMP.platTop, PLAT_TARGET = 160;
const CATCH_X = 38, CATCH_Y = 50;  // old
const BUMP_X = 26, BUMP_Y = 34;    // old
const FALL = 70;                   // old: below GY + 70 a fall is a fall
const STEP_SEC = 1 / 60;
const INK = '#0D2A5C';

// ---- the pure level

export type CourseKind = 'target' | 'wrong' | 'platform' | 'rock' | 'pit' | 'step';
export interface GroundPiece { x0: number; x1: number; y: number }
export interface Span { x0: number; x1: number }
export interface Platform { x: number; w: number; y: number }
export interface Rock { x: number; y: number; w: number; h: number }
export interface LevelItem { x: number; y: number; target: boolean; onPlatform: boolean; moved: boolean; seq: number }
export interface Level {
  /** The course elements in order (the first is always a target). */
  kinds: CourseKind[];
  ground: GroundPiece[];
  pits: Span[];
  steps: Span[];
  plats: Platform[];
  rocks: Rock[];
  items: LevelItem[];
  door: { x: number; open: boolean };
  /** Targets moved ahead so far. */
  moved: number;
}

const isTarget = (k: CourseKind): boolean => k === 'target' || k === 'platform';

/**
 * The course order (old: ['g', ...shuffle(rest)]), with the scatter rule: the other elements are shuffled and the
 * targets after the first go into separate gaps between them, so no two targets are next to each other.
 */
function courseOrder(lv: JumpLevel, rng: Rng): CourseKind[] {
  const fill = (k: CourseKind, n: number): CourseKind[] => Array.from({ length: Math.max(0, n) }, () => k);
  const others = rng.shuffle([...fill('wrong', lv.wrong), ...fill('pit', lv.pits), ...fill('step', lv.steps), ...fill('rock', lv.rocks)]);
  const rest = lv.targets - 1;
  const plats = Math.min(lv.platforms, rest);
  const kinds = rng.shuffle([...fill('platform', plats), ...fill('target', rest - plats)]);
  const gaps = new Set(rng.shuffle(others.map((_, i) => i)).slice(0, rest));
  const order: CourseKind[] = ['target'];
  others.forEach((o, i) => {
    order.push(o);
    if (gaps.has(i)) order.push(kinds.shift()!);
  });
  order.push(...kinds); // only when there are more targets than gaps (not in the old table)
  return order;
}

/** The old build: start x 520, ground from -600, each element then its spacing; the door 640 after the last element. */
export function buildLevel(lv: JumpLevel, rng: Rng): Level {
  const kinds = courseOrder(lv, rng);
  // target heights (48 / 130, 50/50; a platform's target is 160), then no three targets in a row at one height
  const tk = kinds.filter(isTarget);
  const heights = tk.map(k => (k === 'platform' ? PLAT_TARGET : rng.next() < 0.5 ? LOW : HIGH));
  for (let i = 2; i < heights.length; i++) {
    if (heights[i] === heights[i - 1] && heights[i] === heights[i - 2] && tk[i] === 'target') heights[i] = heights[i] === LOW ? HIGH : LOW;
  }
  const L: Level = { kinds, ground: [], pits: [], steps: [], plats: [], rocks: [], items: [], door: { x: 0, open: false }, moved: 0 };
  let x = 520, gx0 = -600, y = GY, ti = 0, seq = 0;
  const close = (x1: number): void => { L.ground.push({ x0: gx0, x1, y }); };
  for (const k of kinds) {
    if (k === 'target') {
      L.items.push({ x, y: y - heights[ti++], target: true, onPlatform: false, moved: false, seq: seq++ });
      x += rng.int(190, 240);
    } else if (k === 'wrong') {
      L.items.push({ x, y: y - WRONG_Y, target: false, onPlatform: false, moved: false, seq: seq++ });
      x += rng.int(230, 270);
    } else if (k === 'platform') {
      ti++;
      L.plats.push({ x: x - PLAT_W / 2, w: PLAT_W, y: y - PLAT_TOP });
      L.items.push({ x, y: y - PLAT_TARGET, target: true, onPlatform: true, moved: false, seq: seq++ });
      x += rng.int(240, 280);
    } else if (k === 'rock') {
      L.rocks.push({ x, y, w: JUMP.rockW, h: JUMP.rockH });
      x += rng.int(230, 270);
    } else if (k === 'pit') {
      close(x);
      const w = rng.int(80, 105);
      L.pits.push({ x0: x, x1: x + w });
      x += w;
      gx0 = x;
      x += rng.int(170, 210);
    } else {
      close(x);
      gx0 = x;
      y -= JUMP.stepUp;
      x += rng.int(260, 320);
      close(x);
      L.steps.push({ x0: gx0, x1: x });
      gx0 = x;
      y += JUMP.stepUp;
      x += rng.int(160, 200);
    }
  }
  L.door.x = x + 640;
  close(L.door.x + 900);
  return L;
}

/** The ground height under x (a pit has none). */
export function groundAt(L: Level, x: number): number | null {
  for (const g of L.ground) if (x >= g.x0 && x < g.x1) return g.y;
  return null;
}

/**
 * A target the dino ran past moves ahead (old): to door - 110 - moved * 200 when that is more than 250 ahead, else
 * 260 ahead of the dino (the door and the ground move on to stay 140 / 900 beyond it); heights alternate 48 / 130.
 */
export function moveAhead(L: Level, item: LevelItem, heroX: number): void {
  const zone = L.door.x - 110 - L.moved * 200;
  if (zone > heroX + 250) {
    item.x = zone;
  } else {
    item.x = heroX + 260;
    L.door.x = Math.max(L.door.x, item.x + 140);
    const last = L.ground[L.ground.length - 1];
    last.x1 = Math.max(last.x1, L.door.x + 900);
  }
  item.y = GY - (L.moved % 2 === 0 ? LOW : HIGH);
  item.moved = true;
  item.onPlatform = false;
  L.moved++;
}

// ---- the look (the old colours; the old emoji as inline SVG)

const svgUrl = (w: number, hh: number, inner: string): string =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none">${inner}</svg>`)}")`;
const HILL_P = Math.round(2 * Math.PI * 170 * 100) / 100; // one period of the old hills' sine
const VOLCANO_BG = svgUrl(600, 130, '<path d="M120 130 L182 34 Q200 22 218 34 L280 130Z" fill="#8D6E63"/><path d="M182 34 Q200 22 218 34 L210 46 Q200 40 190 46Z" fill="#FF7043"/><circle cx="196" cy="12" r="9" fill="#BCAAA4" opacity="0.8"/><circle cx="210" cy="4" r="6" fill="#BCAAA4" opacity="0.6"/>');
const HILLS_BG = (() => {
  let d = 'M0 100';
  for (let x = 0; x <= HILL_P + 10; x += 10) d += `L${Math.min(x, HILL_P).toFixed(1)} ${(26 - 26 * (0.5 + 0.5 * Math.sin(Math.min(x, HILL_P) / 170))).toFixed(1)}`;
  return svgUrl(HILL_P, 100, `<path d="${d}L${HILL_P} 100Z" fill="#A1887F"/>`);
})();
const PLANTS_BG = svgUrl(760, 70,
  // a fern at 120, a palm at 500 (the old alternating fern / palm emoji, 380 apart)
  '<g fill="#43A047" stroke="#2E7D32" stroke-width="2"><path d="M120 70 Q96 40 84 22 Q108 38 120 70Z"/><path d="M120 70 Q144 40 156 22 Q132 38 120 70Z"/><path d="M120 70 Q112 34 120 8 Q128 34 120 70Z"/><path d="M120 70 Q90 56 72 52 Q100 50 120 70Z"/><path d="M120 70 Q150 56 168 52 Q140 50 120 70Z"/></g>'
  + '<path d="M496 70 Q492 40 502 18 L508 18 Q500 42 506 70Z" fill="#8D6E63" stroke="#5D4037" stroke-width="2"/>'
  + '<g fill="#66BB6A" stroke="#2E7D32" stroke-width="2"><path d="M505 18 Q480 6 462 20 Q484 14 505 18Z"/><path d="M505 18 Q530 6 548 20 Q526 14 505 18Z"/><path d="M505 18 Q486 22 474 40 Q492 26 505 18Z"/><path d="M505 18 Q524 22 536 40 Q518 26 505 18Z"/></g>');

const DINO_SVG = '<svg width="76" height="66" viewBox="0 0 76 66" aria-hidden="true" style="position:absolute;left:-38px;top:-66px;overflow:visible">'
  + '<path d="M16 40 Q 2 40 1 26 Q 8 34 20 32z" fill="#5CB85C" stroke="#2E6B30" stroke-width="2" stroke-linejoin="round"></path>'
  + '<path d="M22 22 L 26 14 L 30 21 L 34 12 L 38 20 L 42 12 L 45 21z" fill="#3E8E41" stroke="#2E6B30" stroke-width="2" stroke-linejoin="round"></path>'
  + '<rect x="24" y="46" width="9" height="18" rx="4" fill="#4CA64C" stroke="#2E6B30" stroke-width="2"></rect>'
  + '<rect x="40" y="46" width="9" height="18" rx="4" fill="#4CA64C" stroke="#2E6B30" stroke-width="2"></rect>'
  + '<ellipse cx="35" cy="37" rx="20" ry="15" fill="#5CB85C" stroke="#2E6B30" stroke-width="2"></ellipse>'
  + '<ellipse cx="38" cy="41" rx="11" ry="8" fill="#BDE5A8"></ellipse>'
  + '<path d="M44 30 Q 46 18 52 12 L 60 12 Q 74 12 74 22 Q 74 30 64 30 L 54 30 Q 52 36 48 38z" fill="#5CB85C" stroke="#2E6B30" stroke-width="2" stroke-linejoin="round"></path>'
  + '<circle cx="60" cy="18" r="3.4" fill="#1D2742"></circle><circle cx="61" cy="17" r="1.1" fill="#FFFFFF"></circle>'
  + '<path d="M64 25 Q 68 27 72 24" fill="none" stroke="#2E6B30" stroke-width="2" stroke-linecap="round"></path>'
  + '<path d="M50 38 Q 56 40 58 36" fill="none" stroke="#2E6B30" stroke-width="2.4" stroke-linecap="round"></path>'
  + '</svg>';
const HEART_PATH = 'M32 56S6 40 6 22c0-8 6-14 13-14 6 0 10 3 13 8 3-5 7-8 13-8 7 0 13 6 13 14 0 18-26 34-26 34z';
const ARROW = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>`;
const SPARK_COLORS = ['#FFC928', '#E53935', '#1E6FD9', '#2EB85C'];
const STYLE = '@keyframes alfiJumpShake{0%,100%{transform:translate(0,0)}20%{transform:translate(-8px,3px)}40%{transform:translate(7px,-3px)}60%{transform:translate(-5px,2px)}80%{transform:translate(4px,-1px)}}'
  + CONFETTI_KEYFRAMES
  + '@media (prefers-reduced-motion: reduce){[data-step="jump"] [data-confetti]{display:none}}';

const r1 = (v: number): number => Math.round(v * 10) / 10;
const faceStyle = (look: FaceLook): string => `box-sizing:border-box;flex:none;width:${faceSize(R * 2, look)}px;height:${faceSize(R * 2, look)}px;border-radius:50%;border:4px solid ${INK};${faceColors(look)};display:flex;align-items:center;justify-content:center;font-size:${faceSize(34, look)}px;line-height:1;font-family:Rubik,sans-serif;font-weight:800`;

/** A ground piece's height in world units: from 6 above its top down past the world's bottom (420). */
const groundH = (g: GroundPiece): number => JUMP.viewH + 10 - g.y + 6;
function groundSvg(g: GroundPiece): string {
  const w = g.x1 - g.x0, hh = groundH(g);
  let pebbles = '';
  for (let xx = g.x0 + 20; xx < g.x1 - 10; xx += 70) pebbles += `<circle cx="${r1(xx - g.x0)}" cy="${r1(46 + (Math.abs(Math.round(xx)) % 3) * 14)}" r="6" fill="#6D4C41"></circle>`;
  return `<svg width="100%" height="100%" viewBox="0 0 ${r1(w)} ${r1(hh)}" preserveAspectRatio="none" aria-hidden="true" style="display:block;overflow:visible">`
    + `<rect x="0" y="6" width="${r1(w)}" height="${r1(hh - 6)}" fill="#795548"></rect>${pebbles}`
    + `<rect x="0" y="0" width="${r1(w)}" height="16" rx="6" fill="#7CB342" stroke="#33691E" stroke-width="3"></rect></svg>`;
}
const PLAT_SVG = `<svg width="${PLAT_W}" height="29" viewBox="0 0 ${PLAT_W} 29" aria-hidden="true" style="display:block;overflow:visible"><rect x="0" y="5" width="${PLAT_W}" height="24" rx="8" fill="#8D6E63" stroke="#4E342E" stroke-width="3"></rect><rect x="0" y="0" width="${PLAT_W}" height="10" rx="5" fill="#7CB342"></rect></svg>`;
const ROCK_SVG = '<svg width="52" height="46" viewBox="-26 -44 52 46" aria-hidden="true" style="display:block;overflow:visible"><ellipse cx="0" cy="-20" rx="23" ry="22" fill="#78909C" stroke="#37474F" stroke-width="3"></ellipse><ellipse cx="-8" cy="-28" rx="7" ry="4" fill="#B0BEC5"></ellipse></svg>';
function doorSvg(open: boolean): string {
  // origin at the door's foot: the glow (open), the frame, the inside, the knob (closed) and the chequered flag on top
  return '<svg width="160" height="200" viewBox="-80 -190 160 200" aria-hidden="true" style="display:block;overflow:visible">'
    + (open ? '<circle cx="0" cy="-55" r="72" fill="rgba(255,235,59,.35)"></circle>' : '')
    + '<rect x="-40" y="-118" width="80" height="118" rx="12" fill="#5D4037"></rect>'
    + `<rect x="-30" y="-106" width="60" height="106" rx="8" fill="${open ? '#FFF59D' : '#3E2723'}"></rect>`
    + (open ? '<rect x="-30" y="-106" width="10" height="106" fill="#8D6E63"></rect>' : '<circle cx="18" cy="-52" r="5" fill="#FFC928"></circle>')
    + '<rect x="-2" y="-160" width="4" height="42" fill="#37474F"></rect>'
    + '<rect x="2" y="-160" width="30" height="20" fill="#FFFFFF" stroke="#37474F" stroke-width="1.5"></rect>'
    + '<rect x="2" y="-160" width="7.5" height="10" fill="#212121"></rect><rect x="17" y="-160" width="7.5" height="10" fill="#212121"></rect>'
    + '<rect x="9.5" y="-150" width="7.5" height="10" fill="#212121"></rect><rect x="24.5" y="-150" width="7.5" height="10" fill="#212121"></rect>'
    + '</svg>';
}
const heartSvg = (full: boolean): string => `<svg width="24" height="24" viewBox="0 0 64 64" aria-hidden="true"><path d="${HEART_PATH}" fill="${full ? '#E53935' : '#FFFFFF'}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"></path></svg>`;

const HUD_BOX = 'position:absolute;top:60px;z-index:5;display:flex;align-items:center;gap:4px;padding:6px 10px;border-radius:18px;background:rgba(255,255,255,.85);pointer-events:none';

interface Sign { item: LevelItem; el: HTMLElement; face: HTMLElement; dead: boolean }
interface Spark { el: HTMLElement; x: number; y: number; vx: number; vy: number; l: number }
type Mode = 'intro' | 'play' | 'ouch' | 'card' | 'end';

export const jumpStep: StepModule = {
  id: 'jump',
  async run(ctx: StepContext): Promise<StepResult> {
    if (ctx.signal.aborted) return { outcome: 'aborted', answers: [], slips: 0, ms: 0 };
    const c = ctx.content;
    const unit = stepUnit(ctx);
    const name = c.alphabet[unit]?.name ?? unit;
    const cfg = ctx.profile.jump;
    const levels = cfg.levels;
    const others = otherLetters(ctx, unit, 3);
    const reduced = prefersReducedMotion();
    const game = createGame(ctx);
    const startLevel = Math.max(0, Math.min(levels.length - 1, Math.floor(ctx.resume ?? 0)));
    const totalTargets = levels.slice(startLevel).reduce((s, l) => s + l.targets, 0);

    // ---- view: the sky fills the arena; scenery layers in arena pixels; the world in stage units, scaled by k
    const layer = (style: string, attrs: Record<string, string> = {}): HTMLElement =>
      h('div', { 'aria-hidden': 'true', ...attrs, style: `position:absolute;left:0;right:0;pointer-events:none;${style}` });
    const sun = layer('right:auto;border-radius:50%;background:#FFF59D');
    const volcanoes = layer(`background:${VOLCANO_BG} repeat-x`);
    const hills = layer(`background:${HILLS_BG} repeat-x`);
    const plants = layer(`background:${PLANTS_BG} repeat-x`);
    const lava = layer('bottom:0;overflow:hidden;background:linear-gradient(#FFEB3B,#FF5722 30%,#B71C1C)', { 'data-lava': '1' });
    const bubbles = Array.from({ length: 10 }, () => {
      const b = h('div', { style: 'position:absolute;left:0;top:0;border-radius:50%;background:#FFEB3B' });
      lava.appendChild(b);
      return b;
    });
    const groundLayer = h('div', { style: 'position:absolute;left:0;top:0' });
    const thingLayer = h('div', { style: 'position:absolute;left:0;top:0' });
    const signLayer = h('div', { style: 'position:absolute;left:0;top:0' });
    const sparkLayer = h('div', { style: 'position:absolute;left:0;top:0' });
    const doorEl = h('div', { 'data-door': '1', 'data-open': '0', style: 'position:absolute;left:0;top:0;width:160px;height:200px' });
    const body = h('div', { style: 'position:absolute;left:0;top:0;transform-origin:0 0' });
    body.innerHTML = DINO_SVG;
    const dino = h('div', { 'data-dino': '1', 'data-on': '1', 'aria-hidden': 'true', style: 'position:absolute;left:0;top:0;width:0;height:0;will-change:transform' }, body);
    const world = h('div', { 'data-world': '1', style: 'position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;will-change:transform;pointer-events:none' },
      groundLayer, thingLayer, doorEl, signLayer, dino, sparkLayer);
    const scene = h('div', { style: 'position:absolute;inset:0;pointer-events:none' }, sun, volcanoes, hills, plants, lava, world);
    const style = h('style');
    style.textContent = STYLE;
    const heartsBox = h('div', { 'data-hearts': '1', role: 'img', style: `${HUD_BOX};inset-inline-start:10px` });
    const heartEls = Array.from({ length: cfg.lives }, (_, i) => {
      const s = h('span', { 'data-heart': String(i), style: 'display:flex' });
      heartsBox.appendChild(s);
      return s;
    });
    const dotsBox = h('div', { 'data-levels': '1', role: 'img', style: `${HUD_BOX};inset-inline-end:10px;gap:8px` });
    const dotEls = levels.map((_, i) => {
      const d = h('span', { 'data-level-dot': String(i), style: `width:16px;height:16px;border-radius:50%;border:3px solid ${INK};box-sizing:border-box;background:#FFFFFF` });
      dotsBox.appendChild(d);
      return d;
    });
    let hud = starHud(levels[startLevel].targets);
    const arena = h('div', {
      'data-step': 'jump', 'data-level': String(startLevel),
      style: 'position:absolute;inset:0;overflow:hidden;background:linear-gradient(#FF8A65,#FFCC80 45%,#FFF3E0);touch-action:none;user-select:none;-webkit-user-select:none',
    }, style, scene, hud.el, heartsBox, dotsBox);
    ctx.stage.appendChild(arena);

    // ---- geometry: k = min(H / 420, W / 300); the world's bottom (420) is the arena's bottom edge
    let k = 1, VW = JUMP.minViewW, offY = 0;
    const px = (u: number): string => `${r1(u * k)}px`;
    const layout = (): void => {
      const m = measure(arena);
      k = Math.min(m.h / JUMP.viewH, m.w / JUMP.minViewW);
      VW = m.w / k;
      offY = m.h - JUMP.viewH * k;
      const top = (u: number): string => `${r1(offY + u * k)}px`;
      Object.assign(sun.style, { left: `${r1(0.8 * m.w - 34 * k)}px`, top: top(36), width: px(68), height: px(68) });
      Object.assign(volcanoes.style, { top: top(GY - 10 - 130), height: px(130), backgroundSize: `${px(600)} ${px(130)}` });
      Object.assign(hills.style, { top: top(GY - 66), height: px(100), backgroundSize: `${px(HILL_P)} ${px(100)}` });
      Object.assign(plants.style, { top: top(GY + 6 - 70), height: px(70), backgroundSize: `${px(760)} ${px(70)}` });
      lava.style.top = top(GY + 24);
      for (const b of bubbles) Object.assign(b.style, { width: px(8), height: px(8), margin: `${r1(-4 * k)}px 0 0 ${r1(-4 * k)}px` });
    };
    layout();
    game.listen(window, 'resize', layout);

    // ---- state
    const answers: AnswerEvent[] = [];
    const streak = combo(ctx.sfx);
    const act = activity();
    let mode: Mode = 'intro';
    let lvl = startLevel, lives = cfg.lives, slips = 0, got = 0, need = 0, totalGot = 0;
    let L: Level = buildLevel(levels[lvl], ctx.rng);
    let signs: Sign[] = [];
    let groundEls: HTMLElement[] = [];
    const hero = { x: START_X, y: GY, vy: 0, on: true, wait: 0.8, sq: 1, run: 0, coyote: 0 };
    let cam = 0, clock = 0, anim = 0, want = 0, lastTrail = -1, loseT = 0, seq = 0;
    let trail: { t: number; x: number; y: number }[] = [];
    let sparks: Spark[] = [];
    const sfx = (n: Parameters<StepContext['sfx']['play']>[0]): void => { try { ctx.sfx.play(n); } catch { /* no audio */ } };
    const at = (el: HTMLElement, x: number, y: number): void => { el.style.transform = `translate(${r1(x)}px,${r1(y)}px)`; };

    const showHearts = (): void => {
      heartEls.forEach((s, i) => {
        const full = i < lives;
        if (s.hasAttribute('data-full') === full && s.innerHTML) return;
        if (full) s.setAttribute('data-full', ''); else s.removeAttribute('data-full');
        s.innerHTML = heartSvg(full);
      });
      heartsBox.setAttribute('aria-label', `${Math.max(0, lives)} / ${cfg.lives}`);
    };
    const showLevel = (): void => {
      arena.setAttribute('data-level', String(lvl));
      dotsBox.setAttribute('aria-label', `${Math.min(lvl + 1, levels.length)} / ${levels.length}`);
      dotEls.forEach((d, i) => {
        if (i < lvl) d.setAttribute('data-on', ''); else d.removeAttribute('data-on');
        d.style.background = i < lvl ? '#2EB85C' : i === lvl ? '#FFC928' : '#FFFFFF';
      });
    };
    const groundEl = (g: GroundPiece): HTMLElement => {
      const el = h('div', {
        'data-ground': '1', 'data-x0': String(g.x0), 'data-x1': String(g.x1), 'data-y': String(g.y),
        style: `position:absolute;left:0;top:0;width:${r1(g.x1 - g.x0)}px;height:${r1(groundH(g))}px`,
      });
      el.innerHTML = groundSvg(g);
      at(el, g.x0, g.y - 6);
      return el;
    };
    const placeDoor = (): void => {
      doorEl.setAttribute('data-x', String(L.door.x));
      doorEl.setAttribute('data-open', L.door.open ? '1' : '0');
      doorEl.innerHTML = doorSvg(L.door.open);
      at(doorEl, L.door.x - 80, GY - 190);
    };
    const placeSign = (s: Sign): void => {
      s.el.setAttribute('data-x', String(s.item.x));
      s.el.setAttribute('data-y', String(s.item.y));
      at(s.el, s.item.x, s.item.y);
    };

    // ---- a level: the course in the DOM, the dino at the start, the star slots refilled
    const enterLevel = (): void => {
      groundLayer.replaceChildren();
      thingLayer.replaceChildren();
      signLayer.replaceChildren();
      groundEls = L.ground.map(groundEl);
      groundLayer.append(...groundEls);
      for (const p of L.plats) {
        const el = h('div', { 'data-plat': '1', 'data-x': String(p.x), 'data-w': String(p.w), 'data-y': String(p.y), style: `position:absolute;left:0;top:0;width:${p.w}px;height:29px` });
        el.innerHTML = PLAT_SVG;
        at(el, p.x, p.y - 5);
        thingLayer.appendChild(el);
      }
      for (const r of L.rocks) {
        const el = h('div', { 'data-rock': '1', 'data-x': String(r.x), style: 'position:absolute;left:0;top:0;width:52px;height:46px' });
        el.innerHTML = ROCK_SVG;
        at(el, r.x - 26, r.y - 44);
        thingLayer.appendChild(el);
      }
      signs = L.items.map((item) => {
        // the target is drawn exactly like the other letters
        const look = faceLook(ctx.rng);
        const face = h('div', { ...faceAttrs(look), style: faceStyle(look) }, item.target ? unit : ctx.rng.pick(others));
        const el = h('div', {
          'data-sign': '1', 'data-seq': String(seq++), 'aria-hidden': 'true',
          style: `position:absolute;left:0;top:0;width:${R * 2}px;height:${R * 2}px;margin:${-R}px 0 0 ${-R}px;display:flex;align-items:center;justify-content:center;transition:opacity .35s`,
        }, face);
        const s: Sign = { item, el, face, dead: false };
        placeSign(s);
        signLayer.appendChild(el);
        return s;
      });
      placeDoor();
      got = 0;
      need = levels[lvl].targets;
      const next = starHud(need);
      hud.el.replaceWith(next.el);
      hud = next;
      Object.assign(hero, { x: START_X, y: GY, vy: 0, on: true, wait: 0.8, sq: 1, coyote: 0 });
      trail = [];
      lastTrail = -1;
      want = 0;
      cam = hero.x - VW * 0.3;
      at(dino, hero.x, hero.y);
      showLevel();
      showHearts();
    };
    enterLevel();

    // ---- input: every tap asks for a hop (old: from the ground only; a short buffer and coyote time forgive timing)
    const ask = (): void => {
      if (mode !== 'play') return;
      act.mark(clock);
      want = JUMP.buffer;
      hero.wait = 0;
    };
    game.listen(arena, 'pointerdown', ask);
    game.listen(document, 'keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === ' ' || key === 'ArrowUp') { ask(); e.preventDefault(); }
    });

    // ---- outcomes
    const shake = (): void => {
      if (reduced) return;
      scene.style.animation = 'none';
      void scene.offsetWidth;
      scene.style.animation = 'alfiJumpShake .4s';
    };
    const burst = (x: number, y: number): void => {
      if (reduced) return;
      for (let i = 0; i < 16; i++) {
        const el = h('div', { 'data-spark': '1', style: `position:absolute;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;background:${ctx.rng.pick(SPARK_COLORS)};clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)` });
        sparkLayer.appendChild(el);
        sparks.push({ el, x, y, vx: -220 + ctx.rng.next() * 440, vy: -380 + ctx.rng.next() * 320, l: 1 });
      }
    };
    const collect = (s: Sign): void => {
      s.dead = true;
      got++;
      totalGot++;
      if (act.recent(clock)) answers.push(recallOk(unit));
      s.el.classList.add('is-collected');
      faceCorrect(s.face);
      s.face.style.borderColor = '#FFFFFF';
      s.el.style.opacity = '0';
      game.later(400, () => s.el.remove());
      sfx('good');
      streak.hit();
      burst(s.item.x, s.item.y);
      void game.speak(name);
      hud.fill(got);
      ctx.progress(totalGot / totalTargets);
      if (got >= need && !L.door.open) {
        L.door.open = true;
        placeDoor();
        game.later(500, () => { sfx('door'); void game.speak(line(c, 'jump.door')); });
      }
    };
    const restart = (): void => {
      const t = loseT - 2;
      let b: { t: number; x: number; y: number } | null = null;
      for (let i = trail.length - 1; i >= 0; i--) if (trail[i].t <= t) { b = trail[i]; break; }
      const back = b ?? trail[0] ?? { t: 0, x: START_X, y: GY };
      Object.assign(hero, { x: back.x, y: back.y, vy: 0, on: true, wait: 1, sq: 1, coyote: 0 });
      trail = trail.filter(q => q.t <= back.t);
      cam = hero.x - VW * 0.3;
      dino.removeAttribute('data-ouch');
      mode = 'play';
    };
    // a fall, a rock or a touched letter: a heart goes, the dino blinks for 1 s, then restarts 2 s back on its trail
    const lose = (touched?: Sign): void => {
      if (mode !== 'play') return;
      lives--;
      slips++;
      streak.miss();
      mode = 'ouch';
      loseT = clock;
      want = 0;
      dino.setAttribute('data-ouch', '');
      sfx('ouch');
      showHearts();
      shake();
      if (touched) {
        touched.dead = true;
        touched.el.setAttribute('data-dead', '');
        touched.el.style.opacity = '0';
        game.later(1200, () => {
          touched.dead = false;
          touched.el.removeAttribute('data-dead');
          touched.el.style.opacity = '';
        });
      }
      game.later(1000, () => {
        if (lives > 0) { restart(); return; }
        mode = 'end';
        game.fail(answers, slips, 'jump.noLives', lvl);
      });
    };
    // the old level card: the level dots, the dino walking from the done dot to the next, one big green button
    const showCard = (text: string): void => {
      showLevel();
      const STEP_PX = 46;
      const who = h('div', {
        'data-map-dino': '1', 'data-at': String(lvl - 1), 'aria-hidden': 'true',
        style: `position:absolute;top:-40px;right:${(lvl - 1) * STEP_PX - 8}px;width:44px;height:38px${reduced ? '' : ';transition:right .35s'}`,
      });
      who.innerHTML = DINO_SVG.replace('width="76" height="66"', 'width="44" height="38"').replace('left:-38px;top:-66px;', 'left:0;top:0;');
      const map = h('div', { style: 'position:relative;display:flex;flex-direction:row-reverse;gap:18px;justify-content:center;margin:48px auto 18px;width:120px;direction:ltr' },
        ...levels.map((_, i) => h('i', { style: `display:block;width:28px;height:28px;border-radius:50%;border:4px solid ${INK};box-sizing:border-box;background:${i < lvl ? '#2EB85C' : '#FFFFFF'}` })),
        who);
      const btn = h('button', {
        type: 'button', 'data-level-next': '1', 'aria-label': 'ממשיכים',
        style: `display:flex;align-items:center;justify-content:center;gap:12px;margin:0 auto;min-height:96px;min-width:150px;padding:10px 26px;box-sizing:border-box;border:3px solid ${INK};border-radius:18px;background:#2EB85C;color:${INK};font:800 clamp(24px,4vw,30px) Rubik,Arial,sans-serif;box-shadow:0 5px 0 ${INK};cursor:pointer;touch-action:manipulation`,
      });
      btn.innerHTML = ARROW;
      btn.appendChild(document.createTextNode('ממשיכים'));
      const card = h('div', {
        'data-level-card': String(lvl),
        style: 'position:absolute;inset:0;z-index:8;display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;background:rgba(6,24,60,.35)',
      }, h('div', {
        role: 'dialog', 'aria-modal': 'true',
        style: `box-sizing:border-box;background:#FFFFFF;border:5px solid ${INK};border-radius:30px;box-shadow:0 10px 0 ${INK};padding:20px 24px;text-align:center;max-width:520px;width:100%;color:${INK};font-family:Rubik,Arial,sans-serif;direction:rtl`,
      }, h('h3', { style: 'margin:0;font-size:clamp(24px,5vw,34px);font-weight:800' }, text), map, btn));
      arena.appendChild(card);
      const moveOn = (): void => { who.setAttribute('data-at', String(lvl)); who.style.right = `${lvl * STEP_PX - 8}px`; };
      if (reduced) moveOn(); else game.later(350, moveOn);
      let used = false;
      game.listen(btn, 'click', () => {
        if (used) return;
        used = true;
        card.remove();
        sfx('pick');
        L = buildLevel(levels[lvl], ctx.rng);
        enterLevel();
        mode = 'play';
        void instruct(ctx, game, line(c, 'jump.ask', { name }));
      });
    };
    const levelDone = (): void => {
      mode = 'card';
      want = 0;
      lvl++;
      if (lvl >= levels.length) {
        mode = 'end';
        game.done(answers, slips);
        return;
      }
      sfx('fanfare');
      if (!reduced) {
        const shower = confettiShower(ctx.rng);
        arena.appendChild(shower);
        game.later(CONFETTI_MS, () => shower.remove());
      }
      const text = line(c, 'jump.level');
      void game.speak(text);
      showCard(text);
    };

    // ---- physics (the old step), in small steps so a slow frame never tunnels through a rock or a letter
    const physics = (d: number): void => {
      clock += d;
      if (want > 0) want -= d;
      if (hero.coyote > 0) hero.coyote -= d;
      if (want > 0 && (hero.on || hero.coyote > 0)) {
        hero.vy = -cfg.jumpVel; hero.on = false; hero.coyote = 0; hero.wait = 0; want = 0;
        sfx('jump');
      }
      if (hero.wait > 0) hero.wait -= d;
      const vx = hero.wait > 0 ? 0 : hero.on ? cfg.speed : cfg.airSpeed;
      let nx = hero.x + vx * d;
      // a step up (or a pit's far wall) more than 6 units above the feet blocks walking: the dino must hop
      const ahead = groundAt(L, nx + 16);
      if (ahead !== null && ahead < hero.y - 6) nx = hero.x;
      if (!L.door.open && nx > L.door.x - 10) nx = Math.min(nx, L.door.x - 10);
      hero.run += nx - hero.x;
      hero.x = nx;
      const py = hero.y;
      hero.vy += cfg.gravity * d;
      hero.y += hero.vy * d;
      let sup = groundAt(L, hero.x);
      for (const p of L.plats) {
        if (hero.x >= p.x - 8 && hero.x <= p.x + p.w + 8 && py <= p.y + 1 && hero.y >= p.y && hero.vy >= 0) sup = p.y;
      }
      if (sup !== null && hero.vy >= 0 && hero.y >= sup && py <= sup + 12) {
        if (!hero.on) hero.sq = 0.72;
        hero.y = sup; hero.vy = 0; hero.on = true;
      } else {
        if (hero.on) hero.coyote = JUMP.coyote; // walked off an edge
        hero.on = false;
      }
      if (hero.on && clock - lastTrail > 0.1) {
        lastTrail = clock;
        trail.push({ t: clock, x: hero.x, y: hero.y });
        if (trail.length > 400) trail.shift();
      }
      if (hero.y > GY + FALL) { lose(); return; }
      for (const r of L.rocks) {
        if (Math.abs(hero.x - r.x) < r.w / 2 + 12 && hero.y > r.y - r.h + 8) { lose(); return; }
      }
      const by = hero.y - JUMP.body;
      for (const s of signs) {
        if (s.dead) continue;
        const it = s.item;
        const dx = Math.abs(hero.x - it.x), dy = Math.abs(by - it.y);
        if (it.target && dx < CATCH_X && dy < CATCH_Y) collect(s);
        else if (!it.target && dx < BUMP_X && dy < BUMP_Y) { lose(s); return; }
        else if (it.target && hero.x > it.x + 70) {
          const doorX = L.door.x, end = L.ground[L.ground.length - 1].x1;
          moveAhead(L, it, hero.x);
          placeSign(s);
          if (L.door.x !== doorX) placeDoor();
          if (L.ground[L.ground.length - 1].x1 !== end) {
            const fresh = groundEl(L.ground[L.ground.length - 1]);
            groundEls[groundEls.length - 1].replaceWith(fresh);
            groundEls[groundEls.length - 1] = fresh;
          }
        }
      }
      if (L.door.open && hero.x >= L.door.x - 12) levelDone();
    };

    let onShown = true;
    const render = (dt: number): void => {
      world.style.transform = `translate(${r1(-cam * k)}px,${r1(offY)}px) scale(${k.toFixed(4)})`;
      if (!reduced) {
        volcanoes.style.backgroundPosition = `${r1(-((cam * 0.15) % 600) * k)}px 0`;
        hills.style.backgroundPosition = `${r1(-((cam * 0.4) % HILL_P) * k)}px 0`;
        plants.style.backgroundPosition = `${r1(-((cam * 0.55) % 760) * k)}px 0`;
        bubbles.forEach((b, i) => {
          const bx = ((i * 137 + anim * 30) % VW) * k;
          const bb = (6 + Math.abs(Math.sin(anim * 2 + i)) * 10) * k;
          b.style.transform = `translate(${r1(bx)}px,${r1(bb)}px)`;
        });
        for (const s of signs) if (!s.dead) at(s.el, s.item.x, s.item.y + Math.sin(anim * 3 + s.item.x) * 4);
      }
      at(dino, hero.x, hero.y);
      if (hero.on !== onShown) { onShown = hero.on; dino.setAttribute('data-on', hero.on ? '1' : '0'); }
      const bob = !reduced && hero.on && hero.wait <= 0 && mode === 'play' ? Math.abs(Math.sin(hero.run / 18)) * 4 : 0;
      const tilt = hero.on ? 0 : Math.max(-0.3, Math.min(0.3, hero.vy / 2400)) * 180 / Math.PI;
      body.style.transform = `translateY(${r1(-bob)}px) rotate(${tilt.toFixed(1)}deg) scale(${(1 / hero.sq).toFixed(3)},${hero.sq.toFixed(3)})`;
      // the old blink: alpha .35 every 90 ms while a heart is lost
      dino.style.opacity = mode === 'ouch' && Math.floor(anim * 1000 / 90) % 2 ? '0.35' : '';
      if (sparks.length) {
        sparks = sparks.filter((p) => {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.l -= dt * 1.4;
          if (p.l <= 0) { p.el.remove(); return false; }
          p.el.style.opacity = String(r1(p.l));
          at(p.el, p.x, p.y);
          return true;
        });
      }
    };

    game.loop((dt) => {
      anim += dt;
      for (let left = dt; left > 1e-6 && mode === 'play' && !game.over; left -= STEP_SEC) physics(Math.min(STEP_SEC, left));
      if (game.over) return;
      if (mode === 'play') {
        cam += (hero.x - VW * 0.3 - cam) * Math.min(1, dt * 5);
        hero.sq += (1 - hero.sq) * Math.min(1, dt * 10);
      }
      render(dt);
    });

    void instruct(ctx, game, line(c, 'jump.ask', { name })).then(() => { if (mode === 'intro') mode = 'play'; });
    return game.result;
  },
};
