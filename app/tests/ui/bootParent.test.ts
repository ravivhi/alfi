// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootApp } from '../../src/ui/boot.ts';
import { memoryKV } from '../../src/store/kv.ts';
import { loadSave, saveNow } from '../../src/store/save.ts';
import { freshSave, newChild } from '../../src/store/schema.ts';
import type { StepModule } from '../../src/steps/contract.ts';
import type { StepResult } from '../../src/engine/types.ts';
import { SLICE_STEPS } from '../../src/engine/profiles.ts';

function boot(n: number, registry?: Record<string, StepModule>) {
  const kv = memoryKV();
  const save = freshSave();
  for (let i = 0; i < n; i++) save.children.push(newChild('ילד' + i, 4, null, '2026-11-21', 'c' + i));
  saveNow(kv, save, 0, 1);
  const root = document.createElement('div');
  const clock = { now: () => Date.UTC(2026, 10, 21, 9), today: () => '2026-11-21' };
  const b = bootApp({ root, kv, native: null, now: 2, clock, audioDeps: { fetchIndex: async () => null }, ...(registry ? { registry } : {}) });
  return { ...b, root, kv };
}

// Long press the map photo, solve the gate.
function openParent(root: HTMLElement): void {
  const photo = root.querySelector('[aria-label="לחיצה ארוכה: עמוד ההורים"]') as HTMLElement;
  photo.dispatchEvent(new Event('pointerdown'));
  vi.advanceTimersByTime(3000);
  const [a, b] = (root.querySelector('h1')!.textContent as string).match(/\d+/g)!.map(Number);
  const right = (Array.from(root.querySelectorAll('[data-choice]')) as HTMLElement[]).find(x => x.textContent === String(a + b))!;
  right.click();
}

afterEach(() => { vi.useRealTimers(); });

describe('parent page in the app', () => {
  it('map photo hold, gate, parent page; close and back return to the map', () => {
    vi.useFakeTimers();
    const { router, root } = boot(1);
    openParent(root);
    expect(router.current()).toBe('parent');
    expect(root.textContent).toContain('ילד0, גיל 4');
    (root.querySelector('[data-parent=close]') as HTMLElement).click();
    expect(router.current()).toBe('map');
    openParent(root);
    router.back();
    expect(router.current()).toBe('map');
  });
  it('practise now on a letter card closes the parent page and runs that letter; back returns to the map', async () => {
    vi.useFakeTimers();
    const started: string[] = [];
    // steps that never finish: the test only looks at which step the letter sitting opened with
    const registry = Object.fromEntries(SLICE_STEPS.map(id => [id, { id, run: () => { started.push(id); return new Promise<StepResult>(() => undefined); } }]));
    const { router, root, kv } = boot(1, registry);
    openParent(root);
    (root.querySelector('[data-letter="ב"]') as HTMLElement).click();
    (root.querySelector('[data-start-letter]') as HTMLElement).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(router.current()).toBe('station');
    expect(started).toEqual(['meet']);
    const sitting = loadSave(kv, null, 0).data.children[0].progress.sitting;
    expect(sitting?.parent).toEqual({ unit: 'ב', mode: 'unit', queue: [] });
    router.back();
    expect(router.current()).toBe('map');
  });
  it('deleting the only child lands on setup, and the save no longer holds it', () => {
    vi.useFakeTimers();
    const { router, root, kv } = boot(1);
    openParent(root);
    (Array.from(root.querySelectorAll('button')).find(b => b.textContent === 'מחיקת ילד') as HTMLElement).click();
    (root.querySelector('[data-hold-confirm]') as HTMLElement).dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(3000);
    expect(router.current()).toBe('setup');
    expect(loadSave(kv, null, 0).data.children).toEqual([]);
  });
  it('deleting one of two children lands on the remaining child map', () => {
    vi.useFakeTimers();
    const { router, root } = boot(2);
    (root.querySelector('[data-child]') as HTMLElement).click();
    openParent(root);
    (Array.from(root.querySelectorAll('button')).find(b => b.textContent === 'מחיקת ילד') as HTMLElement).click();
    (root.querySelector('[data-hold-confirm]') as HTMLElement).dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(3000);
    expect(router.current()).toBe('map'); // one child left: straight to its map
  });
});
