// Owner 2026-11-22 (preview 0.7): "the entire application can be zoomed in, thats bad, i dont want it, kids zoom in
// accidentally and it ruining the experiance". The viewport meta (index.html) forbids scaling and base.css sets
// touch-action: manipulation (no double-tap zoom); these listeners stop what browsers still allow despite them: iOS
// Safari's pinch (gesture events, two-finger moves), ctrl / cmd + wheel and ctrl / cmd + plus, minus or 0.
// Pointer events, one-finger touches and plain keys are never touched, so taps, drags and holds work as before.

/** The viewport meta's content (index.html starts with it; viewport-fit=cover follows for the full-bleed layout). */
export const NO_ZOOM_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

const ZOOM_KEYS = new Set(['+', '=', '-', '_', '0']);

/** Installs the zoom blockers; returns a function that removes them. */
export function blockZoom(doc: Document, win: Window): () => void {
  const stop = (e: Event): void => { if (e.cancelable) e.preventDefault(); };
  const pinch = (e: Event): void => {
    const touches = (e as TouchEvent).touches;
    if (touches && touches.length > 1) stop(e);
  };
  const wheel = (e: Event): void => {
    const w = e as WheelEvent;
    if (w.ctrlKey || w.metaKey) stop(e);
  };
  const key = (e: Event): void => {
    const k = e as KeyboardEvent;
    if ((k.ctrlKey || k.metaKey) && ZOOM_KEYS.has(k.key)) stop(e);
  };
  const active: AddEventListenerOptions = { passive: false };
  const on: [EventTarget, string, (e: Event) => void][] = [
    [doc, 'gesturestart', stop], [doc, 'gesturechange', stop], [doc, 'gestureend', stop],
    [doc, 'touchmove', pinch],
    [win, 'wheel', wheel],
    [doc, 'keydown', key],
  ];
  for (const [t, type, fn] of on) t.addEventListener(type, fn, active);
  return () => { for (const [t, type, fn] of on) t.removeEventListener(type, fn, active); };
}
