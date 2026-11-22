// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createRouter } from '../../src/ui/router.ts';
import type { Screen } from '../../src/ui/router.ts';

function routerAt(s: Screen) {
  const r = createRouter(document.createElement('div'), {});
  r.show(s, () => () => undefined);
  return r;
}

describe('router back', () => {
  it('back from a station goes to the map', () => { const r = routerAt('station'); expect(r.back()).toBe('handled'); expect(r.current()).toBe('map'); });
  it('back on the map opens the leave dialog, a second back closes it', () => { const r = routerAt('map'); r.back(); expect(r.dialogOpen()).toBe(true); r.back(); expect(r.dialogOpen()).toBe(false); expect(r.current()).toBe('map'); });
  it('back never returns exit', () => (['setup', 'children', 'map', 'station', 'end', 'gate', 'parent'] as Screen[]).forEach(s => expect(routerAt(s).back()).toBe('handled')));
  it('back from the gate returns to the picker when it came from there', () => {
    const r = createRouter(document.createElement('div'), {});
    r.show('children', () => () => undefined);
    r.show('gate', () => () => undefined);
    r.back();
    expect(r.current()).toBe('children');
  });
  it('showing a screen runs the previous cleanup and closes a dialog', () => {
    const r = routerAt('map');
    let cleaned = 0;
    r.show('end', () => () => { cleaned++; });
    r.openDialog(() => undefined);
    r.show('map', () => () => undefined);
    expect(cleaned).toBe(1);
    expect(r.dialogOpen()).toBe(false);
  });
});
