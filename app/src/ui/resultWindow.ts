// The window after a game, in the old app's look (index.html showOverlay + gameWin / gameLose): success offers "המשך"
// or "עוד פעם", failed offers only "נסו שוב". Nothing happens until the child taps; the runner acts on the choice.
import { h } from '../util/dom.ts';
import { line } from '../audio/lines.ts';
import type { AudioApi } from '../audio/audio.ts';
import type { Sfx } from '../audio/sfx.ts';
import type { LettersContent } from '../content/schema.ts';
import type { AnswerEvent } from '../engine/types.ts';
import type { Rng } from '../util/rng.ts';

export type ResultChoice = 'again' | 'continue';

export interface ResultOpts {
  kind: 'success' | 'failed';
  stars: 1 | 2 | 3;
  /** A content line id shown and said in the failed window (e.g. the time ran out). */
  failLine?: string;
  audio: Pick<AudioApi, 'say' | 'stop'>;
  sfx: Pick<Sfx, 'play'>;
  content: LettersContent;
  rng: Rng;
  reducedMotion: boolean;
}

export interface ResultWindow {
  /** Resolves once, on the first button tap. */
  choice: Promise<ResultChoice>;
  /** Removes the window and stops its timers and speech. */
  dispose(): void;
}

/** The single reminder after this long without a tap. */
export const RESULT_IDLE_MS = 6000;
/** The old gameWin says its praise this long after the fanfare. */
export const PRAISE_DELAY_MS = 350;
/** The idle wait starts when the opening speech ends, or after this long if the voice never reports an end. */
const OPENING_CAP_MS = 10_000;
/** The old app threw 180 canvas particles; 40 DOM ones keep the frame budget on a phone. */
export const CONFETTI_COUNT = 40;
export const CONFETTI_MS = 2600;
const CONFETTI_COLOURS = ['#E53935', '#FFC928', '#1E6FD9', '#2EB85C', '#FB8C00', '#FFFFFF', '#A50044', '#004D98'];

const INK = '#0D2A5C';

/** Old gameWin: every wrong pick and every slip is one error; none gives 3 stars, up to 2 give 2, more give 1. */
export function starsFor(answers: readonly AnswerEvent[], slips: number): 1 | 2 | 3 {
  const wrong = answers.filter((x) => !x.ok).length + Math.max(0, slips);
  return wrong === 0 ? 3 : wrong <= 2 ? 2 : 1;
}

/** The confetti fall; a page that shows confettiShower carries it once. */
export const CONFETTI_KEYFRAMES = '@keyframes alfiConfetti{0%{transform:translate(0,0) rotate(0)}100%{transform:translate(var(--dx),115vh) rotate(var(--rot))}}';

const STYLE = '@keyframes alfiPopin{from{transform:scale(.4);opacity:0}}'
  + '@keyframes alfiBnc{30%{transform:scale(1.18) rotate(-4deg)}60%{transform:scale(.95) rotate(3deg)}}'
  + CONFETTI_KEYFRAMES
  + '@media (prefers-reduced-motion: reduce){[data-result] *{animation:none!important}[data-confetti]{display:none}}';

const POPIN = 'alfiPopin .45s cubic-bezier(.2,1.6,.4,1)';

const STAR_PATH = 'M12 1.5l3.1 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.3l-6.4 3.6 1.5-7.1L1.7 8.9l7.2-.8z';
const TROPHY = `<svg width="96" height="96" viewBox="0 0 64 64" aria-hidden="true"><g stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">`
  + '<path d="M14 12H6c0 10 4 16 12 17M50 12h8c0 10-4 16-12 17" fill="none"></path>'
  + '<path d="M14 8h36v12c0 12-8 20-18 20S14 32 14 20z" fill="#FFC928"></path>'
  + '<path d="M28 40h8v8h-8z" fill="#FFC928"></path>'
  + '<path d="M18 48h28v8H18z" fill="#FFC928"></path></g></svg>';
const HEART = `<svg width="96" height="96" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 56S6 40 6 22c0-8 6-14 13-14 6 0 10 3 13 8 3-5 7-8 13-8 7 0 13 6 13 14 0 18-26 34-26 34z" fill="#E53935" stroke="${INK}" stroke-width="3" stroke-linejoin="round"></path></svg>`;
const ARROW = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>`;
const AGAIN = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"></path><path d="M20 4v5h-5"></path></svg>`;

function starEl(on: boolean, i: number, motion: boolean): HTMLElement {
  const s = h('span', {
    'data-star': String(i),
    'data-on': on,
    style: 'display:inline-block;width:60px;height:60px;margin:0 3px'
      + (motion ? `;animation:alfiPopin .5s ${(i + 1) * 0.25}s backwards` : '')
      + (on ? '' : ';filter:grayscale(1);opacity:.3'),
  });
  s.innerHTML = `<svg width="60" height="60" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}" fill="#FFC928" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"></path></svg>`;
  return s;
}

// Old .btn (border 3px ink, radius 18px, shadow 0 5px 0 ink, Rubik 800) at a pre-reader size: icon plus word. The text
// is ink, not the old white: white on the old green is below the 3:1 large-text contrast the app keeps.
function button(choice: ResultChoice, label: string, bg: string, icon: string): HTMLButtonElement {
  const b = h('button', {
    type: 'button', 'data-result-choice': choice, 'aria-label': label,
    style: `display:flex;align-items:center;justify-content:center;gap:12px;min-height:96px;min-width:150px;padding:10px 26px;box-sizing:border-box;border:3px solid ${INK};border-radius:18px;background:${bg};color:${INK};font:800 clamp(24px,4vw,30px) Rubik,Arial,sans-serif;box-shadow:0 5px 0 ${INK};cursor:pointer;touch-action:manipulation`,
  }) as HTMLButtonElement;
  b.innerHTML = icon;
  b.appendChild(document.createTextNode(label));
  return b;
}

/** The shower of DOM confetti (old app: canvas particles); the host page needs CONFETTI_KEYFRAMES once. Also the dino's level end. */
export function confettiShower(rng: Rng): HTMLElement {
  const o = { rng };
  const box = h('div', { 'data-confetti': '1', 'aria-hidden': 'true', style: 'position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:2' });
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const shape = i % 3; // rect, circle, star (old)
    const size = 8 + o.rng.int(0, 8);
    const colour = CONFETTI_COLOURS[o.rng.int(0, CONFETTI_COLOURS.length - 1)];
    const dur = 1.6 + o.rng.next() * 0.8; // with the delay, every piece lands before CONFETTI_MS
    const delay = o.rng.next() * 0.15;
    const form = shape === 0 ? `width:${size}px;height:${Math.round(size * 0.6)}px`
      : shape === 1 ? `width:${size}px;height:${size}px;border-radius:50%`
        : `width:${size + 4}px;height:${size + 4}px;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)`;
    box.appendChild(h('i', {
      style: `position:absolute;top:-24px;left:${o.rng.int(0, 100)}%;${form};background:${colour};--dx:${o.rng.int(-80, 80)}px;--rot:${o.rng.int(-540, 540)}deg;animation:alfiConfetti ${dur.toFixed(2)}s ${delay.toFixed(2)}s ease-in forwards`,
    }));
  }
  return box;
}

export function mountResult(host: HTMLElement, o: ResultOpts): ResultWindow {
  const motion = !o.reducedMotion;
  const success = o.kind === 'success';
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void): ReturnType<typeof setTimeout> => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
    return t;
  };
  let disposed = false;
  let fired = false;
  let praiseTimer: ReturnType<typeof setTimeout> | null = null;
  let resolve: (c: ResultChoice) => void = () => undefined;
  const choice = new Promise<ResultChoice>((r) => { resolve = r; });

  const say = (text: string, queue: boolean): Promise<void> => {
    if (disposed) return Promise.resolve();
    try { return o.audio.say(text, queue ? { queue: true } : {}).catch(() => undefined); } catch { return Promise.resolve(); }
  };
  const play = (name: 'fanfare' | 'boing' | 'pick'): void => { try { o.sfx.play(name); } catch { /* sounds are optional */ } };

  const praise = success && o.content.praise.length ? o.rng.pick(o.content.praise) : '';
  const prompt = line(o.content, success ? 'result.choose' : 'result.fail');
  let failText: string | null = null;
  if (!success && o.failLine !== undefined) {
    // an unknown id (a game's typo) shows and says nothing rather than breaking the window
    try { failText = line(o.content, o.failLine); } catch { failText = null; }
  }

  const style = h('style');
  style.textContent = STYLE;

  const pick = (c: ResultChoice) => (): void => {
    if (fired || disposed) return;
    fired = true;
    clearIdle();
    // a tap before the praise: the child has chosen, the opening speech is not started
    if (praiseTimer !== null) { clearTimeout(praiseTimer); timers.delete(praiseTimer); praiseTimer = null; }
    play('pick');
    for (const b of buttons) b.disabled = true;
    resolve(c);
  };
  const buttons: HTMLButtonElement[] = success
    ? [button('continue', 'המשך', '#2EB85C', ARROW), button('again', 'עוד פעם', '#FFC928', AGAIN)]
    : [button('again', 'נסו שוב', '#2EB85C', AGAIN)];
  for (const b of buttons) b.addEventListener('click', pick(b.dataset.resultChoice as ResultChoice));

  const trophy = h('div', { 'data-trophy': success ? 'trophy' : 'heart', style: 'display:inline-block' + (motion ? ';animation:alfiBnc 1s infinite' : '') });
  trophy.innerHTML = success ? TROPHY : HEART;

  const card = h('div', {
    'data-card': '1', role: 'dialog', 'aria-modal': 'true',
    style: `position:relative;z-index:1;box-sizing:border-box;background:#FFFFFF;border:5px solid ${INK};border-radius:30px;box-shadow:0 10px 0 ${INK};padding:22px 26px;text-align:center;max-width:620px;width:100%;color:${INK};font-family:Rubik,Arial,sans-serif;direction:rtl`
      + (motion ? `;animation:${POPIN}` : ''),
  },
  trophy,
  success ? h('div', { style: 'margin:4px 0' }, ...[0, 1, 2].map((i) => starEl(i < o.stars, i, motion))) : null,
  h('h2', { style: 'font-size:clamp(32px,6vw,52px);margin:4px 0;color:#E53935;text-shadow:3px 3px 0 #FFC928;font-weight:800' }, success ? praise : 'כמעט!'),
  failText !== null ? h('p', { 'data-fail-line': '1', style: 'font-size:22px;font-weight:700;margin:6px 0' }, failText) : null,
  h('div', { style: 'display:flex;flex-wrap:wrap;gap:16px;justify-content:center;margin-top:16px' }, ...buttons));

  const overlay = h('div', {
    'data-result': o.kind,
    style: 'position:fixed;inset:0;background:rgba(6,24,60,.55);display:flex;align-items:center;justify-content:center;z-index:20;padding:14px;box-sizing:border-box',
  }, style, card);
  let shower: HTMLElement | null = null;
  if (success && motion) {
    shower = confettiShower(o.rng);
    overlay.appendChild(shower);
    later(CONFETTI_MS, () => { shower?.remove(); shower = null; });
  }
  host.appendChild(overlay);

  // one reminder after RESULT_IDLE_MS without a tap; a touch on the backdrop restarts the wait
  let idle: ReturnType<typeof setTimeout> | null = null;
  let idleArmed = false;
  let idleDone = false;
  function clearIdle(): void {
    if (idle !== null) { clearTimeout(idle); timers.delete(idle); idle = null; }
  }
  const startIdle = (): void => {
    clearIdle();
    if (!idleArmed || idleDone || fired || disposed) return;
    idle = later(RESULT_IDLE_MS, () => { idle = null; idleDone = true; void say(prompt, false); });
  };
  const arm = (): void => { if (!idleArmed) { idleArmed = true; startIdle(); } };
  overlay.addEventListener('pointerdown', startIdle);

  let opening: Promise<void>;
  if (success) {
    play('fanfare');
    opening = new Promise<void>((res) => {
      praiseTimer = later(PRAISE_DELAY_MS, () => {
        praiseTimer = null;
        const said: Promise<void>[] = [];
        if (praise) said.push(say(praise, false));
        if (o.stars === 3) said.push(say(line(o.content, 'result.stars3'), true));
        said.push(say(prompt, true));
        void Promise.all(said).then(() => res());
      });
    });
  } else {
    play('boing');
    const said: Promise<void>[] = [];
    if (failText !== null) said.push(say(failText, false));
    said.push(say(prompt, failText !== null));
    opening = Promise.all(said).then(() => undefined);
  }
  void opening.then(arm);
  later(OPENING_CAP_MS, arm);

  return {
    choice,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      idle = null;
      overlay.removeEventListener('pointerdown', startIdle);
      try { o.audio.stop(); } catch { /* ignore */ }
      overlay.remove();
    },
  };
}
