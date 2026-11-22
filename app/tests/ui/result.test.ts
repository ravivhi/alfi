// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFETTI_COUNT, CONFETTI_MS, RESULT_IDLE_MS, mountResult, starsFor } from '../../src/ui/resultWindow.ts';
import type { ResultOpts } from '../../src/ui/resultWindow.ts';
import type { AnswerEvent } from '../../src/engine/types.ts';
import { CONTENT } from '../../src/content/index.ts';
import { line } from '../../src/audio/lines.ts';
import { createRng } from '../../src/util/rng.ts';
import { contrastRatio } from '../../src/util/contrast.ts';

let said: { text: string; queue: boolean }[];
let sfx: string[];
let stops: number;
let host: HTMLElement;

const a = (ok: boolean): AnswerEvent => ({ item: 'מ/name', ok, kind: 'recall', t: 0 });
const texts = () => said.map(s => s.text);

function opts(o: Partial<ResultOpts> = {}): ResultOpts {
  return {
    kind: 'success',
    stars: 3,
    audio: {
      say: (text: string, opt?: { queue?: boolean }) => { said.push({ text, queue: !!opt?.queue }); return Promise.resolve(); },
      stop: () => { stops++; },
    },
    sfx: { play: (n: string) => { sfx.push(n); } },
    content: CONTENT,
    rng: createRng(5),
    reducedMotion: false,
    ...o,
  };
}

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const btn = (choice: string) => q(`[data-result-choice="${choice}"]`) as HTMLButtonElement;

beforeEach(() => {
  said = []; sfx = []; stops = 0;
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.appendChild(host);
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

describe('result window', () => {
  it('stars follow the old formula (0 errors 3, up to 2 errors 2, more 1; slips count)', () => {
    expect(starsFor([a(true), a(true)], 0)).toBe(3);
    expect(starsFor([a(true), a(false)], 0)).toBe(2);
    expect(starsFor([a(false), a(false)], 0)).toBe(2);
    expect(starsFor([a(true)], 2)).toBe(2);
    expect(starsFor([a(false)], 1)).toBe(2);
    expect(starsFor([a(false), a(false), a(false)], 0)).toBe(1);
    expect(starsFor([a(false)], 2)).toBe(1);
    expect(starsFor([], 3)).toBe(1);
    expect(starsFor([], 0)).toBe(3);
  });

  it('success shows trophy, stars, praise and the two buttons', async () => {
    mountResult(host, opts({ stars: 2 }));
    await vi.advanceTimersByTimeAsync(400);
    const ov = q('[data-result="success"]')!;
    expect(ov).not.toBeNull();
    expect(ov.getAttribute('style')).toContain('background:rgba(6,24,60,.55)');
    const card = q('[data-card]')!.getAttribute('style')!;
    for (const v of ['background:#FFFFFF', 'border:5px solid #0D2A5C', 'border-radius:30px', 'box-shadow:0 10px 0 #0D2A5C', 'padding:22px 26px', 'max-width:620px']) expect(card).toContain(v);
    expect(q('[data-trophy] svg')).not.toBeNull();
    const stars = Array.from(host.querySelectorAll('[data-star]')) as HTMLElement[];
    expect(stars).toHaveLength(3);
    expect(stars.map(s => s.hasAttribute('data-on'))).toEqual([true, true, false]);
    expect(stars[2].style.filter).toBe('grayscale(1)');
    expect(Number(stars[2].style.opacity)).toBe(0.3);
    const h2 = q('h2')!;
    expect(CONTENT.praise).toContain(h2.textContent);
    expect(texts()[0]).toBe(h2.textContent);
    const buttons = Array.from(host.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.map(b => b.dataset.resultChoice)).toEqual(['continue', 'again']);
    expect(btn('continue').textContent).toContain('המשך');
    expect(btn('again').textContent).toContain('עוד פעם');
    for (const b of buttons) {
      expect(b.querySelector('svg')).not.toBeNull();
      expect(b.style.minHeight).toBe('96px');
    }
    expect(btn('continue').style.background).toMatch(/#2EB85C|rgb\(46, 184, 92\)/i);
    expect(btn('again').style.background).toMatch(/#FFC928|rgb\(255, 201, 40\)/i);
    // button text is readable (bold >= 19px: 3:1) on both buttons
    expect(contrastRatio('#0D2A5C', '#2EB85C')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio('#0D2A5C', '#FFC928')).toBeGreaterThanOrEqual(3);
    expect(sfx).toEqual(['fanfare']);
    expect(host.querySelectorAll('[data-confetti] > *')).toHaveLength(CONFETTI_COUNT);
    await vi.advanceTimersByTimeAsync(CONFETTI_MS);
    expect(q('[data-confetti]')).toBeNull();
  });

  it('failed shows only "נסו שוב" and the failLine text', async () => {
    mountResult(host, opts({ kind: 'failed', stars: 1, failLine: 'result.stars3' }));
    await vi.advanceTimersByTimeAsync(10);
    expect(q('[data-result="failed"]')).not.toBeNull();
    expect(q('[data-trophy] svg')).not.toBeNull();
    expect(host.querySelectorAll('[data-star]')).toHaveLength(0);
    expect(q('h2')!.textContent).toBe('כמעט!');
    expect(q('[data-fail-line]')!.textContent).toBe(line(CONTENT, 'result.stars3'));
    const buttons = Array.from(host.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons).toHaveLength(1);
    expect(buttons[0].dataset.resultChoice).toBe('again');
    expect(buttons[0].textContent).toContain('נסו שוב');
    expect(buttons[0].style.background).toMatch(/#2EB85C|rgb\(46, 184, 92\)/i);
    expect(host.querySelectorAll('[data-confetti]')).toHaveLength(0);
    // without a failLine no text line shows
    host.replaceChildren();
    mountResult(host, opts({ kind: 'failed', stars: 1 }));
    expect(q('[data-fail-line]')).toBeNull();
    // an unknown line id never breaks the window: no text line, the button is still there
    host.replaceChildren();
    mountResult(host, opts({ kind: 'failed', stars: 1, failLine: 'no.such.line' }));
    expect(q('[data-fail-line]')).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(1);
  });

  it('success says a praise, result.stars3 only with 3 stars, then result.choose', async () => {
    mountResult(host, opts({ stars: 3 }));
    await vi.advanceTimersByTimeAsync(300);
    expect(said).toEqual([]);
    await vi.advanceTimersByTimeAsync(60);
    expect(CONTENT.praise).toContain(said[0].text);
    expect(said.slice(1)).toEqual([{ text: line(CONTENT, 'result.stars3'), queue: true }, { text: line(CONTENT, 'result.choose'), queue: true }]);
    said = [];
    host.replaceChildren();
    mountResult(host, opts({ stars: 2 }));
    await vi.advanceTimersByTimeAsync(400);
    expect(texts()).toHaveLength(2);
    expect(CONTENT.praise).toContain(said[0].text);
    expect(texts()).not.toContain(line(CONTENT, 'result.stars3'));
    expect(said[1]).toEqual({ text: line(CONTENT, 'result.choose'), queue: true });
  });

  it('failed plays boing and says the failLine then result.fail', async () => {
    mountResult(host, opts({ kind: 'failed', stars: 1, failLine: 'result.stars3' }));
    await vi.advanceTimersByTimeAsync(10);
    expect(sfx).toEqual(['boing']);
    expect(said).toEqual([{ text: line(CONTENT, 'result.stars3'), queue: false }, { text: line(CONTENT, 'result.fail'), queue: true }]);
    said = []; sfx = [];
    host.replaceChildren();
    mountResult(host, opts({ kind: 'failed', stars: 1 }));
    await vi.advanceTimersByTimeAsync(10);
    expect(sfx).toEqual(['boing']);
    expect(texts()).toEqual([line(CONTENT, 'result.fail')]);
  });

  it('after 6 s idle the prompt is said once, never twice', async () => {
    mountResult(host, opts({ stars: 2 }));
    await vi.advanceTimersByTimeAsync(400);
    const n = said.length;
    await vi.advanceTimersByTimeAsync(RESULT_IDLE_MS);
    expect(texts().slice(n)).toEqual([line(CONTENT, 'result.choose')]);
    await vi.advanceTimersByTimeAsync(RESULT_IDLE_MS * 10);
    expect(said.length).toBe(n + 1);
    said = [];
    host.replaceChildren();
    mountResult(host, opts({ kind: 'failed', stars: 1 }));
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(RESULT_IDLE_MS * 10);
    expect(texts()).toEqual([line(CONTENT, 'result.fail'), line(CONTENT, 'result.fail')]);
  });

  it('a double tap fires the choice once', async () => {
    const r = mountResult(host, opts({ stars: 2 }));
    const got: string[] = [];
    void r.choice.then(c => { got.push(c); });
    btn('again').click();
    btn('again').click();
    btn('continue').click();
    await vi.advanceTimersByTimeAsync(10);
    expect(got).toEqual(['again']);
    expect(sfx.filter(s => s === 'pick')).toHaveLength(1);
    // no idle prompt after the tap
    const n = said.length;
    await vi.advanceTimersByTimeAsync(RESULT_IDLE_MS * 2);
    expect(said.length).toBe(n);
  });

  it('reduced motion: no confetti nodes and no animation', async () => {
    mountResult(host, opts({ stars: 3, reducedMotion: true }));
    await vi.advanceTimersByTimeAsync(10);
    expect(q('[data-confetti]')).toBeNull();
    for (const el of Array.from(host.querySelectorAll('*')) as HTMLElement[]) expect(el.style.animation ?? '').toBe('');
    // the animated version does animate
    host.replaceChildren();
    mountResult(host, opts({ stars: 3 }));
    const animated = (Array.from(host.querySelectorAll('*')) as HTMLElement[]).filter(el => el.style.animation);
    expect(animated.length).toBeGreaterThanOrEqual(5); // card, trophy, three stars (plus confetti)
  });

  it('dispose stops speech and the idle timer', async () => {
    const r = mountResult(host, opts({ stars: 3 }));
    r.dispose();
    expect(stops).toBeGreaterThanOrEqual(1);
    await vi.advanceTimersByTimeAsync(RESULT_IDLE_MS * 3);
    expect(said).toEqual([]);
    expect(q('[data-result]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
