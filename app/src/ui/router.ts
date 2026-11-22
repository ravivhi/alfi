export type Screen = 'setup' | 'children' | 'map' | 'station' | 'end' | 'break' | 'gate' | 'parent';

export interface Router {
  show(s: Screen, mount: (root: HTMLElement) => () => void): void;
  current(): Screen;
  dialogOpen(): boolean;
  openDialog(close: () => void): void;
  closeDialog(): void;
  back(): 'handled' | 'exit';
}

// Back never leaves the app by itself: on the top screens it asks first (leave dialog).
// onBack[s] lets the app run the real navigation; without a handler the router only moves its own state.
export function createRouter(root: HTMLElement, onBack: Partial<Record<Screen, () => void>>): Router {
  let cur: Screen | null = null;
  let cleanup: (() => void) | null = null;
  let dialogClose: (() => void) | null = null;
  let base: 'map' | 'children' = 'map'; // the screen the gate / parent page was opened from

  const closeDialog = () => {
    const c = dialogClose;
    dialogClose = null;
    try { c?.(); } catch { /* ignore */ }
  };

  const router: Router = {
    show(s, mount) {
      closeDialog();
      const old = cleanup;
      cleanup = null;
      try { old?.(); } catch { /* ignore */ }
      if (s === 'map' || s === 'children') base = s;
      cur = s;
      root.textContent = '';
      cleanup = mount(root);
    },
    current() { return (cur ?? 'setup'); },
    dialogOpen() { return dialogClose !== null; },
    openDialog(close) { closeDialog(); dialogClose = close; },
    closeDialog,
    back() {
      if (dialogClose) { closeDialog(); return 'handled'; }
      const s = router.current();
      const handler = onBack[s];
      if (handler) { handler(); return 'handled'; }
      if (s === 'station' || s === 'end' || s === 'break') cur = 'map';
      else if (s === 'gate' || s === 'parent') cur = base;
      else router.openDialog(() => undefined);
      return 'handled';
    },
  };
  return router;
}
