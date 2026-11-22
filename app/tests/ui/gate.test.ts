// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HOLD_MS, MOVE_SLOP, holdRing, makeGateQuestion, longPress, mountGate } from '../../src/ui/gate.ts';
import { createRng } from '../../src/util/rng.ts';

afterEach(() => { vi.useRealTimers(); });

describe('parent gate', () => {
  it('question has 4 distinct positive choices including the answer', () => {
    for (let s = 0; s < 100; s++) {
      const q = makeGateQuestion(createRng(s));
      expect(q.answer).toBe(q.a + q.b);
      expect(new Set(q.choices).size).toBe(4);
      expect(q.choices).toContain(q.answer);
      expect(q.choices.every(c => c > 0)).toBe(true);
      expect(q.a).toBeGreaterThanOrEqual(6);
      expect(q.b).toBeLessThanOrEqual(19);
    }
  });
  it('long press fires only after 3000 ms', () => { vi.useFakeTimers(); const fn = vi.fn(); const el = document.createElement('button'); longPress(el, HOLD_MS, fn); el.dispatchEvent(new Event('pointerdown')); vi.advanceTimersByTime(2999); expect(fn).not.toHaveBeenCalled(); vi.advanceTimersByTime(1); expect(fn).toHaveBeenCalled(); });
  it('releasing early cancels', () => { vi.useFakeTimers(); const fn = vi.fn(); const el = document.createElement('button'); longPress(el, HOLD_MS, fn); el.dispatchEvent(new Event('pointerdown')); vi.advanceTimersByTime(1000); el.dispatchEvent(new Event('pointerup')); vi.advanceTimersByTime(5000); expect(fn).not.toHaveBeenCalled(); });
  it('the right button passes, a wrong one fails', () => {
    const root = document.createElement('div');
    const onPass = vi.fn(); const onFail = vi.fn();
    mountGate(root, { rng: createRng(1), onPass, onFail });
    const q = makeGateQuestion(createRng(1));
    const buttons = Array.from(root.querySelectorAll('button[data-choice]')) as HTMLButtonElement[];
    expect(buttons).toHaveLength(4);
    buttons.find(b => b.textContent !== String(q.answer))!.click();
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(onPass).not.toHaveBeenCalled();
    buttons.find(b => b.textContent === String(q.answer))!.click();
    expect(onPass).toHaveBeenCalledTimes(1);
  });
});

// a pointer event with coordinates (the test DOM has no layout: client coordinates are plain numbers)
const ptr = (el: HTMLElement, type: string, x = 0, y = 0) => el.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true }));

describe('long press (parent triggers)', () => {
  const setup = () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const el = document.createElement('button');
    const captured: number[] = [];
    el.setPointerCapture = (id: number) => { captured.push(id); };
    const ring = holdRing(64, 5, false);
    const detach = longPress(el, HOLD_MS, fn, { ring });
    return { fn, el, ring, captured, detach };
  };
  it('the movement limit is 24 px', () => expect(MOVE_SLOP).toBe(24));
  it('a hold with 10 px of wobble still opens after 3 s', () => {
    const { fn, el } = setup();
    ptr(el, 'pointerdown', 100, 100);
    vi.advanceTimersByTime(1000); ptr(el, 'pointermove', 108, 104);
    vi.advanceTimersByTime(1000); ptr(el, 'pointermove', 95, 92);
    vi.advanceTimersByTime(999); expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(fn).toHaveBeenCalledTimes(1);
  });
  it('moving more than 24 px from the start cancels', () => {
    const { fn, el } = setup();
    ptr(el, 'pointerdown', 100, 100);
    vi.advanceTimersByTime(500); ptr(el, 'pointermove', 100, 125);
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });
  it('pointerdown captures the pointer', () => {
    const { el, captured } = setup();
    ptr(el, 'pointerdown');
    expect(captured).toEqual([1]);
  });
  it('pointerleave during a captured hold does not cancel', () => {
    const { fn, el } = setup();
    ptr(el, 'pointerdown');
    vi.advanceTimersByTime(1000); ptr(el, 'pointerleave');
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('without pointer capture a pointerleave still cancels', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const el = document.createElement('button');
    el.setPointerCapture = () => { throw new Error('no capture'); };
    longPress(el, HOLD_MS, fn);
    ptr(el, 'pointerdown'); vi.advanceTimersByTime(1000); ptr(el, 'pointerleave'); vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });
  it('pointerup, pointercancel and lostpointercapture each cancel', () => {
    for (const end of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      const { fn, el, detach } = setup();
      ptr(el, 'pointerdown'); vi.advanceTimersByTime(1000); ptr(el, end); vi.advanceTimersByTime(5000);
      expect(fn, end).not.toHaveBeenCalled();
      detach();
    }
  });
  it('the target cannot scroll, select text or open a callout, and a context menu is prevented', () => {
    const { el } = setup();
    expect(el.style.touchAction).toBe('none');
    expect(el.style.userSelect).toBe('none');
    expect(el.style.getPropertyValue('-webkit-touch-callout')).toBe('none');
    const e = new Event('contextmenu', { cancelable: true });
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
  it('the ring fills over the hold and resets on an early release', () => {
    const { el, ring } = setup();
    expect(ring.el.getAttribute('data-fill')).toBe('0.000');
    ptr(el, 'pointerdown');
    expect(ring.el.getAttribute('data-fill')).toBe('1.000');
    expect(ring.el.querySelector('.break-arc')!.getAttribute('style')).toContain(`${HOLD_MS}ms`);
    vi.advanceTimersByTime(1000); ptr(el, 'pointerup');
    expect(ring.el.getAttribute('data-fill')).toBe('0.000');
  });
  it('reduced motion fills the ring in steps', () => {
    vi.useFakeTimers();
    const el = document.createElement('button');
    const ring = holdRing(64, 5, true);
    longPress(el, HOLD_MS, () => undefined, { ring });
    ptr(el, 'pointerdown');
    expect(ring.el.getAttribute('data-fill')).toBe('0.000');
    vi.advanceTimersByTime(HOLD_MS / 2);
    expect(Number(ring.el.getAttribute('data-fill'))).toBeCloseTo(0.5, 5);
    vi.advanceTimersByTime(HOLD_MS / 2);
    expect(ring.el.getAttribute('data-fill')).toBe('1.000');
  });
  it('detach removes the listeners', () => {
    const { fn, el, detach } = setup();
    detach();
    ptr(el, 'pointerdown'); vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });
  it('a dragstart on the hold target is prevented', () => {
    const el = document.createElement('button');
    longPress(el, HOLD_MS, () => undefined);
    const e = new Event('dragstart', { cancelable: true });
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
