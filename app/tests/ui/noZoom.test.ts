/// <reference types="vite/client" />
// @vitest-environment happy-dom
// Owner 2026-11-22 (preview 0.7): "the entire application can be zoomed in, thats bad, i dont want it, kids zoom in
// accidentally and it ruining the experiance". No pinch, double-tap or ctrl+wheel zoom anywhere.
import { afterEach, describe, expect, it } from 'vitest';
import { blockZoom, NO_ZOOM_VIEWPORT } from '../../src/ui/noZoom.ts';
import indexHtml from '../../index.html?raw';
import mainTs from '../../src/main.ts?raw';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// the stylesheet as written (a ?raw import of a .css file goes through the test CSS pipeline, which empties it)
const APP_DIR = fileURLToPath(import.meta.url).replace(/[\\/]tests[\\/]ui[\\/][^\\/]+$/, '');
const baseCss = readFileSync(`${APP_DIR}/src/styles/base.css`, 'utf8');

let undo: (() => void) | null = null;
afterEach(() => { undo?.(); undo = null; });

const fire = (target: EventTarget, ev: Event): boolean => { target.dispatchEvent(ev); return ev.defaultPrevented; };
// happy-dom's WheelEvent ignores the modifier keys in its init, so they are set on the event itself
const wheel = (deltaY: number, mods: { ctrlKey?: boolean; metaKey?: boolean } = {}): Event => {
  const ev = new WheelEvent('wheel', { deltaY, cancelable: true });
  Object.defineProperty(ev, 'ctrlKey', { value: !!mods.ctrlKey });
  Object.defineProperty(ev, 'metaKey', { value: !!mods.metaKey });
  return ev;
};
const touch = (type: string, fingers: number): Event => {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'touches', { value: Array.from({ length: fingers }, (_, i) => ({ identifier: i })) });
  return ev;
};

describe('no zoom', () => {
  it('the page viewport cannot be scaled: width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no', () => {
    expect(NO_ZOOM_VIEWPORT).toBe('width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
    const html = indexHtml;
    const meta = /<meta name="viewport" content="([^"]*)">/.exec(html);
    expect(meta).not.toBeNull();
    expect(meta![1].startsWith(NO_ZOOM_VIEWPORT)).toBe(true);
    expect(meta![1]).toContain('viewport-fit=cover'); // the full-bleed layout keeps its safe-area handling
  });

  it('the stylesheet takes double-tap zoom away from every element (touch-action: manipulation on html and body)', () => {
    const css = baseCss.replace(/\s/g, '');
    expect(css).toMatch(/html,body\{[^}]*touch-action:manipulation/);
    expect(css).toMatch(/-webkit-text-size-adjust:100%/);
  });

  it('pinch (iOS gesture events and two-finger moves), ctrl+wheel and ctrl+plus / minus / 0 are prevented', () => {
    undo = blockZoom(document, window);
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) expect(fire(document, new Event(t, { bubbles: true, cancelable: true })), t).toBe(true);
    expect(fire(document.body, touch('touchmove', 2))).toBe(true);
    expect(fire(window, wheel(-100, { ctrlKey: true }))).toBe(true);
    expect(fire(window, wheel(-100, { metaKey: true }))).toBe(true);
    for (const key of ['+', '=', '-', '_', '0']) {
      expect(fire(document, new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true })), key).toBe(true);
      expect(fire(document, new KeyboardEvent('keydown', { key, metaKey: true, bubbles: true, cancelable: true })), key).toBe(true);
    }
  });

  it('normal input is left alone: one-finger moves, plain wheel, plain keys and the game keys', () => {
    undo = blockZoom(document, window);
    expect(fire(document.body, touch('touchmove', 1))).toBe(false);
    expect(fire(document.body, touch('touchstart', 1))).toBe(false);
    expect(fire(window, wheel(100))).toBe(false);
    for (const key of ['+', '0', ' ', 'ArrowUp', 'ArrowLeft', 'Escape', 'a']) expect(fire(document, new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })), key).toBe(false);
    expect(fire(document, new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }))).toBe(false);
    // pointer events (the drags and holds) are never touched
    expect(fire(document.body, new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))).toBe(false);
    expect(fire(document.body, new PointerEvent('pointermove', { bubbles: true, cancelable: true }))).toBe(false);
  });

  it('undo removes every listener; the app installs it at start', () => {
    blockZoom(document, window)();
    expect(fire(window, wheel(-100, { ctrlKey: true }))).toBe(false);
    expect(fire(document, new Event('gesturestart', { bubbles: true, cancelable: true }))).toBe(false);
    expect(mainTs).toMatch(/blockZoom\(document, window\)/);
  });
});
