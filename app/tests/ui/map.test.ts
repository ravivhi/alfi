// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { mapLayout, mountMap } from '../../src/ui/screens/map.ts';
import { CURRICULUM, endPending, plannerInputFor } from '../../src/ui/runner.ts';
import { expandPath } from '../../src/engine/curriculum.ts';
import { nextStep, sittingStatus, upcomingStep } from '../../src/engine/planner.ts';
import { applyStepResult, markStickersShown, startParentSitting } from '../../src/engine/progress.ts';
import { isPathComplete } from '../../src/engine/pathRules.ts';
import { addDays } from '../../src/util/day.ts';
import { newChild } from '../../src/store/schema.ts';
import type { ChildRecord } from '../../src/store/schema.ts';
import { line } from '../../src/audio/lines.ts';
import { CONTENT } from '../../src/content/index.ts';
import { buildVersion } from '../../src/platform/native.ts';

const TODAY = '2026-11-21';

function fakeAudio() {
  const a = {
    said: [] as { text: string; queue: boolean }[],
    stopped: 0,
    say: async (text: string, opt: { queue?: boolean } = {}) => { a.said.push({ text, queue: !!opt.queue }); },
    stop() { a.stopped++; },
  };
  return a;
}

const freshChild = () => newChild('נועה', 4, null, TODAY, 'c0');

// Plays one day's sitting to its end (check-points answered right, other steps answer nothing).
function playDay(c: ChildRecord, day: string, showEnd = true): void {
  for (let i = 0; i < 40; i++) {
    const input = plannerInputFor(c, day, 1);
    const n = nextStep(input);
    if (n.type === 'end') break;
    const answers = n.step.kind === 'checkpoint' ? n.step.items.map((item, k) => ({ item, ok: true, kind: 'recall' as const, t: k })) : [];
    const out = applyStepResult(input, n.step, { outcome: 'done', answers, slips: 0, ms: 0 }, 0);
    c.progress = out.progress;
    c.mastery = out.mastery;
  }
  if (showEnd) c.progress = markStickersShown(c.progress);
}

// Today's sitting played to its end; showEnd false = the end screen was lost (back on the last result window).
function childDoneToday(showEnd = true): ChildRecord {
  const c = freshChild();
  playDay(c, TODAY, showEnd);
  return c;
}

// The whole path played, one sitting a day; returns the child and the day whose sitting completed it
// (the map says map.complete, and review sittings stay open without limit).
function childComplete(): { child: ChildRecord; day: string } {
  const c = freshChild();
  let day = TODAY;
  for (let i = 0; i < 40; i++) {
    playDay(c, day);
    if (isPathComplete(c.progress, expandPath(CURRICULUM, plannerInputFor(c, day, 1).band))) return { child: c, day };
    day = addDays(day, 1);
  }
  throw new Error('path never completed');
}

function mount(child: ChildRecord, today = TODAY) {
  const root = document.createElement('div');
  const audio = fakeAudio();
  const calls = { start: 0, parent: 0 };
  const input = plannerInputFor(child, today, 1);
  const cleanup = mountMap(root, {
    child,
    path: expandPath(CURRICULUM, input.band),
    status: sittingStatus(input),
    pendingEnd: endPending(input),
    upcoming: upcomingStep(input),
    audio,
    content: CONTENT,
    onStart: () => { calls.start++; },
    onParent: () => { calls.parent++; },
    width: 390,
  });
  return { root, audio, calls, cleanup };
}
const mountedMap = (child: ChildRecord) => mount(child).root;

describe('map', () => {
  it('layout keeps nodes inside the screen', () => mapLayout(8, 390).forEach(p => {
    expect(p.x).toBeGreaterThanOrEqual(16);
    expect(p.x).toBeLessThanOrEqual(390 - 16 - 92);
  }));

  it('layout zigzags from the bottom up', () => {
    const l = mapLayout(8, 390);
    for (let i = 1; i < l.length; i++) {
      expect(l[i].y).toBeLessThan(l[i - 1].y);
      expect(Math.sign(l[i].x - l[i - 1].x)).not.toBe(0);
      if (i > 1) expect(Math.sign(l[i].x - l[i - 1].x)).toBe(-Math.sign(l[i - 1].x - l[i - 2].x));
    }
  });

  it('next node is labelled with its letter', () => expect(mountedMap(freshChild()).querySelector('[aria-label="התחנה הבאה: האות מ"]')).not.toBeNull());

  it('after a closed sitting the next station glows again (no daily limit)', () => {
    const root = mountedMap(childDoneToday());
    expect(root.querySelector('.node-next.sleeping')).toBeNull();
    expect(root.querySelector('.node-next.alfi-glow')?.getAttribute('aria-label')).toBe('התחנה הבאה: האות ל');
  });

  it('shows every path node: done with a star, the next one, future ones and the check-points', () => {
    const root = mountedMap(childDoneToday());
    expect(root.querySelectorAll('.node').length).toBe(29); // 22 letters + 7 check-points
    expect(root.querySelector('[aria-label="מ - הושלם"]')).not.toBeNull();
    expect(root.querySelectorAll('.node-done .star-badge').length).toBe(1);
    expect(root.querySelector('[aria-label="התחנה הבאה: האות ל"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="ב - עוד לא"]')).not.toBeNull();
    expect(root.querySelectorAll('.node-checkpoint').length).toBe(7);
    expect(root.querySelector('[aria-label="1 מדבקות"]')).not.toBeNull();
  });

  it('a letter moved into the path by the parent shows done where it sits; its check-point glows once the block is finished', () => {
    const c = freshChild();
    playDay(c, '2026-11-19');
    playDay(c, '2026-11-20');
    c.progress = startParentSitting(plannerInputFor(c, TODAY, 1), 'י');
    playDay(c, TODAY);
    const root = mountedMap(c);
    expect(root.querySelectorAll('.node').length).toBe(29); // 22 letters + 7 check-points
    expect(root.querySelector('[aria-label="מ - הושלם"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="ל - הושלם"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="י - הושלם"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="ב - עוד לא"]')).not.toBeNull();
    // the block מ ל י is full: its check-point is the next station (the curriculum layout is kept)
    expect(root.querySelector('.node-next')?.getAttribute('aria-label')).toBe('התחנה הבאה: נקודת בדיקה');
    expect(root.querySelector('[aria-label="3 מדבקות"]')).not.toBeNull();
  });

  // the parent moved י into the path today: the block is full, but its check-point opens on a later day
  function blockFullToday(): ChildRecord {
    const c = freshChild();
    playDay(c, '2026-11-19');
    playDay(c, '2026-11-20');
    c.progress = startParentSitting(plannerInputFor(c, TODAY, 1), 'י');
    playDay(c, TODAY);
    return c;
  }

  it('a check-point not due today rests (no glow, not a button); the photo bubble glows for the practice game and the map says practice.intro', () => {
    const m = mount(blockFullToday());
    const flag = m.root.querySelector('.node-next') as HTMLElement;
    expect(flag.getAttribute('aria-label')).toBe('התחנה הבאה: נקודת בדיקה');
    expect(flag.classList.contains('alfi-glow')).toBe(false);
    expect(flag.tagName).not.toBe('BUTTON');
    expect(m.root.querySelectorAll('.alfi-glow')).toHaveLength(1);
    const bubble = m.root.querySelector('button.review-bubble.alfi-glow') as HTMLElement;
    expect(bubble.getAttribute('aria-label')).toBe('התחנה הבאה: תרגול');
    expect(m.audio.said.map(s => s.text)).toEqual(['נועה', line(CONTENT, 'practice.intro')]);
    flag.click();
    expect(m.calls.start).toBe(0);
    bubble.click();
    expect(m.calls.start).toBe(1);
  });

  it('on the day the check-point is due its flag glows and the map says checkpoint.intro, not map.next', () => {
    const m = mount(blockFullToday(), addDays(TODAY, 1));
    const flag = m.root.querySelector('button.node-next.alfi-glow') as HTMLElement;
    expect(flag.getAttribute('aria-label')).toBe('התחנה הבאה: נקודת בדיקה');
    expect(m.root.querySelectorAll('.alfi-glow')).toHaveLength(1);
    expect(m.audio.said.map(s => s.text)).toEqual(['נועה', line(CONTENT, 'checkpoint.intro')]);
  });

  it('back from a parent practice sitting: the photo bubble glows (the tap resumes that game), not the next letter', () => {
    const c = childDoneToday();
    c.progress = startParentSitting(plannerInputFor(c, TODAY, 1), 'מ');
    const m = mount(c);
    expect(m.root.querySelector('.node-next')?.getAttribute('aria-label')).toBe('התחנה הבאה: האות ל');
    expect(m.root.querySelector('.node-next')?.classList.contains('alfi-glow')).toBe(false);
    expect(m.root.querySelector('button.review-bubble.alfi-glow')).not.toBeNull();
    expect(m.audio.said.map(s => s.text)).toEqual(['נועה', line(CONTENT, 'practice.intro')]);
  });

  it('a ready node glows and starts the runner once on a double tap', () => {
    const m = mount(freshChild());
    const next = m.root.querySelector('.node-next') as HTMLElement;
    expect(next.classList.contains('alfi-glow')).toBe(true);
    next.click();
    next.click();
    expect(m.calls.start).toBe(1);
  });

  it('opens with the name as its own line, then map.next queued', () => {
    const m = mount(freshChild());
    expect(m.audio.said).toEqual([{ text: 'נועה', queue: false }, { text: line(CONTENT, 'map.next'), queue: true }]);
    expect(m.root.textContent).toContain(line(CONTENT, 'map.next'));
  });

  it('after a closed sitting the map says map.next, never map.tomorrow, and a tap starts the next sitting', () => {
    const m = mount(childDoneToday());
    expect(m.audio.said.map(s => s.text)).toEqual(['נועה', line(CONTENT, 'map.next')]);
    (m.root.querySelector('.node-next') as HTMLElement).click();
    expect(m.calls.start).toBe(1);
    expect(m.audio.said.map(s => s.text)).not.toContain(line(CONTENT, 'map.tomorrow'));
  });

  it('leaving the map stops its speech', () => {
    const m = mount(freshChild());
    m.cleanup();
    expect(m.audio.stopped).toBe(1);
  });

  it('a complete path says map.complete on open while its photo bubble glows for more review, the same day too', () => {
    const { child, day } = childComplete();
    const m = mount(child, day);
    expect(m.root.querySelector('.node-next')).toBeNull();
    expect(m.audio.said).toEqual([{ text: 'נועה', queue: false }, { text: line(CONTENT, 'map.complete'), queue: true }]);
    expect(m.root.textContent).toContain(line(CONTENT, 'map.complete'));
    const bubble = m.root.querySelector('button.review-bubble.alfi-glow') as HTMLElement;
    expect(bubble).not.toBeNull();
    bubble.click();
    expect(m.calls.start).toBe(1);
  });

  it('a lost end screen opens on a tap of the next station', () => {
    const m = mount(childDoneToday(false));
    expect(endPending(plannerInputFor(childDoneToday(false), TODAY, 1))).toBe(true);
    const next = m.root.querySelector('.node-next.alfi-glow') as HTMLElement;
    next.click();
    next.click();
    expect(m.calls.start).toBe(1);
    expect(m.audio.said.map(s => s.text)).not.toContain(line(CONTENT, 'map.tomorrow'));
  });

  it('a complete path still starts a review sitting from the glowing photo bubble', () => {
    const { child, day } = childComplete();
    const m = mount(child, addDays(day, 1));
    const bubble = m.root.querySelector('button.review-bubble') as HTMLElement;
    expect(bubble).not.toBeNull();
    bubble.click();
    bubble.click();
    expect(m.calls.start).toBe(1);
  });

  describe('parent trigger and build label', () => {
    const photoBtn = (root: HTMLElement) => root.querySelector('button[aria-label="לחיצה ארוכה: עמוד ההורים"]') as HTMLElement;
    const ptr = (el: HTMLElement, type: string, x = 0, y = 0) => el.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true }));
    it('the photo hit area is at least 72 x 72 px and the photo keeps its 52 px size', () => {
      const b = photoBtn(mountedMap(freshChild()));
      const num = (v: string) => parseFloat(v);
      expect(num(b.style.width)).toBeGreaterThanOrEqual(72);
      expect(num(b.style.height)).toBeGreaterThanOrEqual(72);
      expect(b.querySelector('[data-break-ring]')).not.toBeNull();
    });
    it('a 3 s hold on the photo with a little wobble opens the parent page; the ring fills and resets on an early release', () => {
      vi.useFakeTimers();
      try {
        const m = mount(freshChild());
        const b = photoBtn(m.root);
        const ring = b.querySelector('[data-break-ring]') as HTMLElement;
        b.setPointerCapture = () => undefined;
        ptr(b, 'pointerdown', 50, 50);
        expect(ring.getAttribute('data-fill')).toBe('1.000');
        vi.advanceTimersByTime(1500); ptr(b, 'pointermove', 58, 44); ptr(b, 'pointerleave');
        vi.advanceTimersByTime(1500);
        expect(m.calls.parent).toBe(1);
        ptr(b, 'pointerup');
        ptr(b, 'pointerdown', 50, 50); vi.advanceTimersByTime(1000); ptr(b, 'pointerup');
        expect(ring.getAttribute('data-fill')).toBe('0.000');
        vi.advanceTimersByTime(5000);
        expect(m.calls.parent).toBe(1);
      } finally { vi.useRealTimers(); }
    });
    it('the photo is not draggable and lets every pointer event reach the hold button', () => {
      const b = photoBtn(mountedMap({ ...freshChild(), photo: 'data:image/png;base64,AAA' }));
      const img = b.querySelector('img') as HTMLElement;
      expect(img).not.toBeNull();
      expect(img.getAttribute('draggable')).toBe('false');
      expect(img.style.pointerEvents).toBe('none');
      expect(img.getAttribute('style')).toContain('-webkit-user-drag:none');
      expect(img.style.userSelect).toBe('none');
    });
    it('shows a small build label in a corner that is not a button', () => {
      const root = mountedMap(freshChild());
      const label = root.querySelector('[data-version]') as HTMLElement;
      expect(label).not.toBeNull();
      expect(label.textContent).toBe(buildVersion());
      expect(label.textContent).not.toBe('');
      expect(label.closest('button')).toBeNull();
      expect(label.style.pointerEvents).toBe('none');
    });
    it('the label shows the bridge value when the app provides one', () => {
      (window as unknown as { AlfiNative: unknown }).AlfiNative = { appVersion: () => '9.9-preview' };
      try {
        expect(mountedMap(freshChild()).querySelector('[data-version]')!.textContent).toBe('9.9-preview');
      } finally { delete (window as unknown as { AlfiNative?: unknown }).AlfiNative; }
    });
  });
});
