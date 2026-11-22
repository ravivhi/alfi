// The path map (Map.dc.html): header with the child photo and stickers, the path from the bottom up, one next station.
import { h } from '../../util/dom.ts';
import { line } from '../../audio/lines.ts';
import type { AudioApi } from '../../audio/audio.ts';
import type { LettersContent } from '../../content/schema.ts';
import type { PathNode } from '../../engine/types.ts';
import type { PathProgress, PlannedStep } from '../../engine/planner.ts';
import { isFinished, nextPathNode } from '../../engine/pathRules.ts';
import type { ChildRecord } from '../../store/schema.ts';
import { avatar } from '../avatar.ts';
import { HOLD_MS, holdRing, longPress } from '../gate.ts';
import { versionLabel } from '../versionLabel.ts';
import { RING_CSS, breakRing, fillFraction, prefersReducedMotion } from './break.ts';

export type MapStatus = 'ready' | 'tomorrow' | 'limit' | 'complete';

export const NODE = 76;
export const NEXT_NODE = 92;
const EDGE = 16;
const GAP = 118;     // vertical distance between stations
const TOP = 100;     // below the header
const BOTTOM = 120;  // above the caption box
const ZIG = [0.78, 0.2, 0.7, 0.12];

/** Slot top-left corners (each slot is NEXT_NODE square), zigzag from the bottom up, inside EDGE..width-EDGE-NEXT_NODE. */
export function mapLayout(count: number, width: number): { x: number; y: number }[] {
  const span = Math.max(0, width - 2 * EDGE - NEXT_NODE);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ x: Math.round(EDGE + span * ZIG[i % ZIG.length]), y: TOP + (count - 1 - i) * GAP });
  }
  return out;
}

export type NodeState = 'done' | 'next' | 'future';

/** Done nodes, the node the path goes to next, the rest future. The map keeps the curriculum layout: a letter the
 *  parent moved into the path shows done where it sits, and a check-point whose block (by introduction order) is
 *  finished is next even when an earlier letter on the map is not started. */
export function nodeStates(path: PathNode[], p: PathProgress): NodeState[] {
  const next = nextPathNode(p, path);
  return path.map((n) => {
    const done = n.type === 'unit' ? isFinished(p, n) : p.checkpointsPassed.includes(n.id);
    if (done) return 'done';
    return n === next ? 'next' : 'future';
  });
}

export interface MapDeps {
  child: ChildRecord;
  path: PathNode[];
  status: MapStatus;
  audio: Pick<AudioApi, 'say' | 'stop'>;
  content: LettersContent;
  onStart(): void;
  onParent(): void;
  /** Today's sitting closed but its end screen was lost: a tap on the sleeping station starts the runner, which shows it. */
  pendingEnd?: boolean;
  /** Speak the status line on open (the runner came back without playing a step). */
  speakStatus?: boolean;
  /** True when the browser already allows audio; otherwise the opening speech waits for the first touch. */
  audioAllowed?: () => boolean;
  width?: number;
  /** Epoch ms when a running break ends: until then the next station rests (filling ring, not tappable). */
  breakUntil?: number | null;
  /** The whole break length in ms, for the ring. */
  breakTotalMs?: number;
  now?: () => number;
  reducedMotion?: boolean;
  /** The step a tap leads to (planner upcomingStep). It picks what glows and the opening line: a path station glows
   *  its letter (map.next), a check-point its flag (checkpoint.intro), a game (practice, review, a parent's practice
   *  sitting) the photo bubble (practice.intro). Without it the path's next node glows with map.next. */
  upcoming?: PlannedStep | null;
}

const STYLE = '@keyframes alfiGlow{0%,100%{box-shadow:0 0 0 0 rgba(255,170,40,.75),0 5px 0 #C76A10}50%{box-shadow:0 0 0 16px rgba(255,170,40,0),0 5px 0 #C76A10}}'
  + '.alfi-glow{animation:alfiGlow 1.6s ease-in-out infinite}'
  + '@media (prefers-reduced-motion: reduce){.alfi-glow{animation:none!important}}' + RING_CSS;

const STAR_PATH = 'M12 2l2.9 6.3 6.9.7-5.1 4.7 1.4 6.8L12 17l-6.1 3.5 1.4-6.8L2.2 9l6.9-.7z';
const flagSvg = (size: number, color: string) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"></path><path d="M5 4h11l-2 4 2 4H5"></path></svg>`;
const MOON = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3a9 9 0 1 0 6 13A7.5 7.5 0 1 1 15 3z" fill="#FFE08A"></path></svg>';
// #7D8AA6 on white is 3.5:1 (the mockup's #8A97B2 is 2.9:1, below the 3:1 floor for large text)
const FUTURE_INK = '#7D8AA6';

function svgEl(markup: string, style: string): HTMLElement {
  const d = h('div', { 'aria-hidden': 'true', style });
  d.innerHTML = markup;
  return d;
}

// A smooth curve through the slot centres, bottom node first.
function pathD(pts: { x: number; y: number }[]): string {
  if (!pts.length) return '';
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], my = (a.y + b.y) / 2;
    d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
  }
  return d;
}

export function mountMap(root: HTMLElement, d: MapDeps): () => void {
  const c = d.content;
  const child = d.child;
  const avail = d.width ?? (root.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0) || 390);
  const width = Math.max(280, Math.min(560, avail));
  const slots = mapLayout(d.path.length, width);
  const states = nodeStates(d.path, child.progress);
  const nextIdx = states.indexOf('next');
  const height = TOP + Math.max(0, d.path.length - 1) * GAP + NEXT_NODE + BOTTOM;
  const centres = slots.map((s) => ({ x: s.x + NEXT_NODE / 2, y: s.y + NEXT_NODE / 2 }));
  const ready = d.status === 'ready';
  // the node a tap runs: -1 = the photo bubble (a game on the weakest letter, review, a parent's practice sitting).
  // The path's next node keeps its place on the map, but glows only when the tap really runs it (a check-point whose
  // day has not come rests while a practice game is offered).
  const up = d.upcoming;
  const glowIdx = !ready || !up ? nextIdx
    : up.kind === 'checkpoint' ? d.path.findIndex((n) => n.id === up.cpId)
    : up.stationId !== undefined ? d.path.findIndex((n) => n.type === 'unit' && n.unitId === up.unitId)
    : -1;
  // a complete path still says so while its photo bubble glows for more review play
  const readyLine = nextIdx < 0 && glowIdx < 0 ? 'map.complete'
    : !up ? 'map.next'
    : up.kind === 'checkpoint' ? 'checkpoint.intro'
    : up.stationId !== undefined ? 'map.next'
    : 'practice.intro';
  const statusLine = d.status !== 'ready' ? line(c, `map.${d.status}`) : line(c, readyLine);
  const RESTING_LABEL = 'הפסקה - עוד מעט ממשיכים';
  const now = d.now ?? (() => Date.now());
  const breakUntil = d.breakUntil ?? null;
  // a running break: the station that would glow rests until the break ends
  let resting = ready && breakUntil !== null && now() < breakUntil;
  const breakLine = line(c, 'break.start');

  const caption = h('span', { 'aria-live': 'polite', style: 'font-size:15px;color:#1D2742' }, child.name);
  const say = (text: string, queue: boolean) => {
    void d.audio.say(text, queue ? { queue: true } : {});
  };

  // background, path and progress dashes
  const doneUpTo = nextIdx >= 0 ? nextIdx : centres.length - 1;
  const bg = h('div', { 'aria-hidden': 'true', style: `position:absolute;top:0;left:0;width:${width}px;height:${height}px;pointer-events:none` });
  bg.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<circle cx="${Math.round(width * 0.1)}" cy="${Math.round(height * 0.36)}" r="46" fill="#C6E8CF"></circle>`
    + `<circle cx="${Math.round(width * 0.92)}" cy="${Math.round(height * 0.66)}" r="60" fill="#C6E8CF"></circle>`
    + `<circle cx="${Math.round(width * 0.85)}" cy="${Math.round(height * 0.17)}" r="36" fill="#C6E8CF"></circle>`
    + `<path d="${pathD(centres)}" stroke="#FFFFFF" stroke-width="34" fill="none" stroke-linecap="round"></path>`
    + (doneUpTo > 0 ? `<path d="${pathD(centres.slice(0, doneUpTo + 1))}" stroke="#F4C566" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="2 18"></path>` : '')
    + '</svg>';

  // A ready station starts the runner (once); so does a sleeping one whose end screen was lost (the runner shows
  // it). Otherwise a sleeping station speaks the status line.
  let started = false;
  const tap = () => {
    if (resting) {
      caption.textContent = breakLine;
      say(breakLine, false);
      return;
    }
    if (ready || d.pendingEnd) {
      if (started) return;
      started = true;
      d.onStart();
    } else {
      caption.textContent = statusLine;
      say(statusLine, false);
    }
  };
  const nodes: HTMLElement[] = [];
  let station: HTMLElement | null = null; // the element a tap starts the sitting from (next node or review bubble)
  d.path.forEach((n, i) => {
    const st = states[i];
    const cp = n.type === 'checkpoint';
    const letter = n.unitId !== undefined ? (c.letters[n.unitId]?.glyph ?? n.unitId) : '';
    const name = cp ? 'נקודת בדיקה' : letter;
    const size = st === 'next' ? NEXT_NODE : NODE;
    const off = (NEXT_NODE - size) / 2;
    const pos = `position:absolute;left:${slots[i].x + off}px;top:${slots[i].y + off}px;width:${size}px;height:${size}px;box-sizing:border-box;border-radius:${cp ? '22px' : '50%'};display:flex;align-items:center;justify-content:center;`;
    const cls = `node node-${st}${cp ? ' node-checkpoint' : ''}`;

    if (st === 'next' || i === glowIdx) {
      const label = cp ? 'התחנה הבאה: נקודת בדיקה' : `התחנה הבאה: האות ${letter}`;
      // ready but not what the tap runs (a check-point due on a later day): it rests, with the moon, and is no button
      const isStation = ready && i === glowIdx;
      const glow = isStation && !resting;
      const btn = h(ready && !isStation ? 'div' : 'button', {
        ...(ready && !isStation ? { role: 'img' } : { type: 'button' }),
        class: `node node-next${cp ? ' node-checkpoint' : ''}${glow ? ' alfi-glow' : resting && isStation ? ' on-break' : ' sleeping'}`, 'aria-label': label,
        style: `${pos}padding:0;border:5px solid #FFFFFF;background:${glow ? '#FFA928' : '#F6DDB0'};color:#1D2742;font:800 50px Rubik,sans-serif;box-shadow:0 5px 0 #C76A10`,
      }, cp ? svgEl(flagSvg(48, '#1D2742'), 'display:flex') : letter);
      if (!isStation) btn.appendChild(svgEl(MOON, 'position:absolute;top:-16px;left:-10px;width:36px;height:36px;border-radius:50%;background:#1E3A7A;display:flex;align-items:center;justify-content:center;border:3px solid #FFFFFF'));
      if (!ready || isStation) btn.addEventListener('click', tap);
      if (isStation) station = btn;
      nodes.push(btn);
      return;
    }

    const done = st === 'done';
    const label = `${name} - ${done ? 'הושלם' : 'עוד לא'}`;
    const style = done
      ? `${pos}background:#2E9E5B;color:#FFFFFF;font:800 40px Rubik,sans-serif;box-shadow:0 5px 0 #1E7442`
      : `${pos}background:#FFFFFF;color:${FUTURE_INK};font:700 38px Rubik,sans-serif;border:3px solid #C9D6E8`;
    const el = h('div', { class: cls, role: 'img', 'aria-label': label, style }, cp ? svgEl(flagSvg(44, done ? '#FFFFFF' : FUTURE_INK), 'display:flex') : letter);
    if (done) {
      el.appendChild(svgEl(`<svg width="22" height="22" viewBox="0 0 24 24"><path d="${STAR_PATH}" fill="#F4B400"></path></svg>`,
        'position:absolute;top:-14px;left:34px;width:34px;height:34px;border-radius:50%;background:#FFFFFF;display:flex;align-items:center;justify-content:center'));
      (el.lastChild as HTMLElement).classList.add('star-badge');
    }
    nodes.push(el);
  });

  // the child's photo beside the station the tap runs, else the path's next one (or the last one when the path is
  // complete)
  const nearIdx = glowIdx >= 0 ? glowIdx : nextIdx >= 0 ? nextIdx : d.path.length - 1;
  let bubble: HTMLElement | null = null;
  if (nearIdx >= 0) {
    const s = slots[nearIdx];
    const right = s.x + NEXT_NODE + 4 + 62 <= width - 4;
    const left = right ? s.x + NEXT_NODE - 14 : s.x - 62 + 14;
    const pos = `position:absolute;left:${Math.max(4, left)}px;top:${s.y - 26}px;`;
    if (glowIdx >= 0) {
      bubble = h('div', { 'aria-hidden': 'true', style: `${pos}pointer-events:none` }, avatar(child, 62));
    } else {
      // no path station to run: the photo is the station (a practice or review game, or the status line)
      bubble = h('button', {
        type: 'button', class: ready ? (resting ? 'review-bubble on-break' : 'review-bubble alfi-glow') : 'sleeping-bubble',
        'aria-label': ready ? (nextIdx < 0 ? 'התחנה הבאה: חזרה' : 'התחנה הבאה: תרגול') : statusLine,
        style: `${pos}width:62px;height:62px;padding:0;border:0;border-radius:50%;background:transparent`,
        onClick: tap,
      }, avatar(child, 62));
      if (ready) station = bubble;
    }
    if (!ready) bubble.appendChild(svgEl(MOON, 'position:absolute;bottom:-6px;right:-6px;width:30px;height:30px;border-radius:50%;background:#1E3A7A;display:flex;align-items:center;justify-content:center'));
  }

  const canvas = h('div', { style: `position:relative;width:${width}px;height:${height}px;margin:0 auto` }, bg, ...nodes, bubble);
  const scroller = h('div', { style: 'position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch' }, canvas);

  // header: photo (3 s hold -> gate -> parent page) and the sticker count
  // a 76 px hit area around the 52 px photo (negative margin keeps the header layout), with a ring that fills over the hold
  const photoRing = holdRing(64, 5, d.reducedMotion ?? prefersReducedMotion());
  photoRing.el.style.cssText += ';position:absolute;top:6px;left:6px';
  const photo = h('button', {
    type: 'button', 'aria-label': 'לחיצה ארוכה: עמוד ההורים',
    style: 'position:relative;box-sizing:border-box;width:76px;height:76px;margin:-12px;padding:12px;border-radius:50%;border:0;background:transparent',
  }, avatar(child, 52), photoRing.el);
  const detachHold = longPress(photo, HOLD_MS, d.onParent, { ring: photoRing });
  const count = child.progress.stickers.length;
  const chip = h('div', { role: 'img', 'aria-label': `${count} מדבקות`, style: 'display:flex;align-items:center;gap:8px;height:44px;padding:0 14px;border-radius:22px;background:#FFF3D6' },
    svgEl(`<svg width="26" height="26" viewBox="0 0 24 24"><path d="${STAR_PATH}" fill="#F4B400" stroke="#C78A00" stroke-width="1"></path></svg>`, 'display:flex'),
    h('span', { 'aria-hidden': 'true', style: 'font-size:22px;font-weight:800' }, String(count)));
  const header = h('div', { style: 'position:absolute;top:0;left:0;right:0;height:76px;padding:12px 18px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.85);z-index:2' }, photo, chip);

  const speaker = svgEl('<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1E4FBF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path></svg>', 'display:flex;flex:none');
  const captionBox = h('div', { style: 'position:absolute;bottom:18px;left:18px;right:18px;padding:12px 16px;border-radius:16px;background:rgba(255,255,255,.92);display:flex;align-items:center;gap:10px;z-index:2' }, speaker, caption);

  const style = h('style');
  style.textContent = STYLE;
  const screen = h('div', {
    'data-screen': 'map',
    style: 'position:relative;height:100vh;height:100dvh;overflow:hidden;background:#DDF2E2;font-family:Rubik,sans-serif;color:#1D2742;direction:rtl',
  }, style, scroller, header, captionBox, versionLabel('position:absolute;bottom:2px;right:8px;z-index:3'));
  root.appendChild(screen);

  // keep the next station in view
  if (nearIdx >= 0) {
    const view = scroller.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 0) || 844;
    scroller.scrollTop = Math.max(0, centres[nearIdx].y - view / 2);
  }

  // opening speech: the name on its own line, then the next-station line when a sitting is ready, or the status
  // line when there is no station to tap or the runner came back
  let spoken = false;
  const speakOpen = () => {
    if (spoken) return;
    spoken = true;
    say(child.name, false);
    if (resting) {
      say(breakLine, true);
      caption.textContent = `${child.name}! ${breakLine}`;
    } else if (ready || d.speakStatus || nextIdx < 0) {
      say(statusLine, true);
      caption.textContent = `${child.name}! ${statusLine}`;
    }
  };

  // the break countdown on the resting station; when it ends the station glows and break.end is said
  let breakTick: ReturnType<typeof setInterval> | undefined;
  let breakEnd: ReturnType<typeof setTimeout> | undefined;
  if (resting && station && breakUntil !== null) {
    const st = station;
    const stepped = d.reducedMotion ?? prefersReducedMotion();
    const total = d.breakTotalMs ?? Math.max(1, breakUntil - now());
    const inner = st.classList.contains('node-next') ? NEXT_NODE - 10 : 62; // inside the 5px border / the bubble
    const ring = breakRing(inner + 24, 8, { track: 'rgba(30,58,122,.18)', fill: '#1E3A7A' }, stepped);
    ring.el.style.cssText += ';position:absolute;top:-12px;left:-12px';
    st.appendChild(ring.el);
    // screen readers hear that the station rests, not where it leads
    const awakeLabel = st.getAttribute('aria-label') ?? '';
    st.setAttribute('aria-disabled', 'true');
    st.setAttribute('aria-label', RESTING_LABEL);
    const update = () => ring.set(fillFraction(Math.max(0, breakUntil - now()), total, stepped));
    const wake = () => {
      if (!resting) return;
      if (now() < breakUntil) { breakEnd = setTimeout(wake, Math.max(50, breakUntil - now())); return; }
      resting = false;
      if (breakTick !== undefined) clearInterval(breakTick);
      ring.el.remove();
      st.classList.remove('on-break');
      st.removeAttribute('aria-disabled');
      st.setAttribute('aria-label', awakeLabel);
      st.classList.add('alfi-glow');
      if (st.classList.contains('node-next')) st.style.background = '#FFA928';
      const endLine = line(c, 'break.end');
      caption.textContent = endLine;
      say(endLine, false);
    };
    update();
    breakTick = setInterval(() => { update(); if (now() >= breakUntil) wake(); }, 1000);
    breakEnd = setTimeout(wake, Math.max(0, breakUntil - now()));
  }
  const onFirstTouch = () => speakOpen();
  if (!d.audioAllowed || d.audioAllowed()) speakOpen();
  else root.addEventListener('pointerdown', onFirstTouch, { once: true, capture: true });

  return () => {
    detachHold();
    if (breakTick !== undefined) clearInterval(breakTick);
    if (breakEnd !== undefined) clearTimeout(breakEnd);
    root.removeEventListener('pointerdown', onFirstTouch, { capture: true });
    d.audio.stop();
  };
}
