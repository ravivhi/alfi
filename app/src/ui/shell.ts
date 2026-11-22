// The station frame: replay button and progress bar on top, then the step's stage. A game's result window opens over
// the frame (resultWindow.ts); other steps flow on by themselves.
import { h } from '../util/dom.ts';

export interface ShellOpts {
  bg: string;
  /** 0-based position of this step in the sitting. */
  stepIndex: number;
  stepCount: number;
  onReplay(): void;
  /** A game's stage: the whole width, down to the bottom edge, no padding or rounded corners. */
  fullBleed?: boolean;
}

export interface Shell {
  /** The whole station screen (the result window opens over it). */
  screen: HTMLElement;
  stage: HTMLElement;
  /** Inner progress of the current step, 0..1. */
  progress(fraction: number): void;
  dispose(): void;
}

const SPEAKER = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1E4FBF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M19 5a10 10 0 0 1 0 14"></path></svg>';

export function mountShell(root: HTMLElement, opts: ShellOpts): Shell {
  const count = Math.max(1, opts.stepCount);
  const index = Math.min(Math.max(0, opts.stepIndex), count - 1);

  const replay = h('button', {
    type: 'button', 'aria-label': 'להשמיע שוב',
    style: 'width:56px;height:56px;flex:none;border-radius:50%;border:0;background:#FFFFFF;box-shadow:0 3px 0 rgba(29,39,66,.15);display:flex;align-items:center;justify-content:center;padding:0',
    onClick: () => opts.onReplay(),
  });
  replay.innerHTML = SPEAKER;

  const fill = h('div', { style: 'height:14px;border-radius:7px;background:#2E9E5B;transition:width .3s' });
  const setFill = (f: number) => { fill.style.width = `${Math.round(((index + Math.min(1, Math.max(0, f))) / count) * 100)}%`; };
  setFill(0);
  const bar = h('div', {
    role: 'img', 'aria-label': `שלב ${index + 1} מתוך ${count}`,
    style: 'flex-grow:1;height:14px;border-radius:7px;background:rgba(29,39,66,.12);overflow:hidden',
  }, fill);

  const bleed = opts.fullBleed === true;
  const stage = h('div', { 'data-stage': '1', ...(bleed ? { 'data-fullbleed': '1' } : {}), style: 'flex-grow:1;align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;min-height:0' });

  const screen = h('div', {
    'data-screen': 'station',
    style: `box-sizing:border-box;min-height:100vh;min-height:100dvh;padding:${bleed ? '20px 0 0' : '20px 22px 28px'};display:flex;flex-direction:column;align-items:center;gap:${bleed ? 12 : 20}px;background:${opts.bg};color:#1D2742;font-family:Rubik,sans-serif;direction:rtl`,
  }, h('div', { style: `align-self:stretch;display:flex;align-items:center;gap:12px;${bleed ? 'padding:0 22px;' : ''}` }, replay, bar), stage);
  root.appendChild(screen);

  return {
    screen,
    stage,
    progress: setFill,
    dispose() { /* nothing to stop: the frame owns no timers or listeners */ },
  };
}
