// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { mountSetup, validateSetup } from '../../src/ui/screens/setup.ts';

const buttons = (root: HTMLElement) => Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
const btn = (root: HTMLElement, text: string) => buttons(root).find(b => b.textContent?.trim() === text)!;
const ageBtn = (root: HTMLElement, n: number) => buttons(root).find(b => b.getAttribute('aria-label') === `גיל ${n}`)!;
function type(root: HTMLElement, v: string) { const i = root.querySelector('input[type=text]') as HTMLInputElement; i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }
function mount(opts: { voice?: 'clips' | 'live' | 'none'; onDone?: (c: unknown) => void; ready?: Promise<void>; status?: () => 'clips' | 'live' | 'none'; onStatusChange?: (cb: () => void) => void } = {}) {
  const root = document.createElement('div');
  mountSetup(root, { onDone: (opts.onDone ?? (() => undefined)) as never, voiceStatus: opts.status ?? (() => opts.voice ?? 'live'), ready: opts.ready, onStatusChange: opts.onStatusChange, today: '2026-11-21', id: 'c1' });
  return root;
}

describe('setup', () => {
  it('validates name and age', () => {
    expect(validateSetup('   ', 4)).toEqual({ ok: false, field: 'name' });
    expect(validateSetup(' נועה  כהן ', 4)).toEqual({ ok: true, name: 'נועה כהן' });
    expect(validateSetup('נועה', null)).toEqual({ ok: false, field: 'age' });
    expect(validateSetup('א'.repeat(17), 4)).toEqual({ ok: false, field: 'name' });
    expect(validateSetup('נועה', 2)).toEqual({ ok: false, field: 'age' });
    expect(validateSetup('נועה', 9)).toEqual({ ok: false, field: 'age' });
  });
  it('start button is disabled until name and age are set', () => {
    const root = mount();
    expect(btn(root, 'בואו נתחיל').disabled).toBe(true);
    type(root, 'נועה');
    expect(btn(root, 'בואו נתחיל').disabled).toBe(true);
    ageBtn(root, 4).click();
    expect(btn(root, 'בואו נתחיל').disabled).toBe(false);
  });
  it('the photo input offers camera and gallery (no capture attribute)', () => {
    const f = mount().querySelector('input[type=file]') as HTMLInputElement;
    expect(f.getAttribute('accept')).toBe('image/*');
    expect(f.hasAttribute('capture')).toBe(false);
  });
  it('shows the no-voice notice only when no voice exists', () => {
    expect(mount({ voice: 'none' }).textContent).toContain('לא נמצא קול עברי');
    expect(mount({ voice: 'live' }).textContent).not.toContain('לא נמצא קול עברי');
  });
  it('does not show the no-voice notice while the audio is still loading, then follows the status', async () => {
    let status: 'clips' | 'live' | 'none' = 'none';
    let fire: () => void = () => undefined;
    let done: () => void = () => undefined;
    const ready = new Promise<void>(r => { done = r; });
    const root = mount({ ready, status: () => status, onStatusChange: cb => { fire = cb; } });
    expect(root.textContent).not.toContain('לא נמצא קול עברי');
    status = 'clips'; done(); await ready; await Promise.resolve();
    expect(root.textContent).not.toContain('לא נמצא קול עברי');
    status = 'none'; fire();
    expect(root.textContent).toContain('לא נמצא קול עברי');
    status = 'live'; fire();
    expect(root.textContent).not.toContain('לא נמצא קול עברי');
  });
  it('shows the notice after loading when there is truly no voice', async () => {
    const ready = Promise.resolve();
    const root = mount({ ready, status: () => 'none' });
    await ready; await Promise.resolve();
    expect(root.textContent).toContain('לא נמצא קול עברי');
  });
  it('age buttons stay at least 44px wide', () => {
    const root = mount();
    for (const n of [3, 4, 5, 6, 7, 8]) expect(ageBtn(root, n).getAttribute('style')).toContain('min-width:44px');
    expect(ageBtn(root, 3).parentElement!.getAttribute('style')).toContain('minmax(44px');
  });
  it('finishing creates a child without a photo', () => {
    const onDone = vi.fn();
    const root = mount({ onDone });
    type(root, ' נועה ');
    ageBtn(root, 5).click();
    btn(root, 'בואו נתחיל').click();
    expect(onDone).toHaveBeenCalledTimes(1);
    const c = onDone.mock.calls[0][0];
    expect(c.name).toBe('נועה'); expect(c.age.years).toBe(5); expect(c.photo).toBeNull(); expect(c.id).toBe('c1');
  });
});
