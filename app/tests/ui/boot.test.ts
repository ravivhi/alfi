// @vitest-environment happy-dom
import { samplePath } from '../../src/steps/drive.ts';
import { describe, it, expect, vi } from 'vitest';
import { bootApp } from '../../src/ui/boot.ts';
import { memoryKV } from '../../src/store/kv.ts';
import { loadSave, saveNow } from '../../src/store/save.ts';
import { freshSave, newChild } from '../../src/store/schema.ts';
import { CONTENT } from '../../src/content/index.ts';
import { LANES } from '../../src/steps/race.ts';
import { createDinoBot } from '../steps/jumpBot.ts';

const buttons = (root: HTMLElement) => Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];

function kvWith(n: number) {
  const kv = memoryKV();
  const save = freshSave();
  for (let i = 0; i < n; i++) save.children.push(newChild('ילד' + i, 4, null, '2026-11-21', 'c' + i));
  saveNow(kv, save, 0, 1);
  return kv;
}

// a fake finger along every stroke (the test DOM has no layout, so client coordinates are board units)
function driveAlong(board: Element | null, unit: string): void {
  if (!board) return;
  const fire = (type: string, p: { x: number; y: number }) => {
    const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
    ev.pointerId = 1; ev.clientX = p.x; ev.clientY = p.y;
    board.dispatchEvent(ev);
  };
  for (const d of CONTENT.letters[unit].strokes) {
    const pts = samplePath(d);
    fire('pointerdown', pts[0]);
    for (const p of pts.slice(1)) fire('pointermove', p);
    fire('pointerup', pts[pts.length - 1]);
  }
}

// a child who flies the plane to the row of the oldest balloon with the named letter
function steerPlane(root: HTMLElement, unit: string): void {
  const plane = root.querySelector('[data-plane]') as HTMLElement | null;
  if (!plane) return;
  const goal = (Array.from(root.querySelectorAll('[data-balloon]')) as HTMLElement[])
    .filter(b => b.textContent === unit && !b.classList.contains('is-popped'))
    .sort((a, b) => Number(a.dataset.seq) - Number(b.dataset.seq))[0];
  if (!goal) return;
  const cur = Number(plane.dataset.lane), want = Number(goal.dataset.lane);
  if (cur !== want) document.dispatchEvent(new KeyboardEvent('keydown', { key: cur > want ? 'ArrowUp' : 'ArrowDown', bubbles: true }));
}

// a child who keeps a finger on the race and slides it to the lane of the next letter with the named letter
const racing = new WeakSet<Element>();
function steerRace(root: HTMLElement, unit: string): void {
  const arena = root.querySelector('[data-step="race"]') as HTMLElement | null;
  if (!arena) return;
  const seg = Number(arena.dataset.seg);
  const goal = (Array.from(arena.querySelectorAll('[data-disc]')) as HTMLElement[])
    .filter(d => d.textContent === unit && !d.dataset.leaving && Number(d.dataset.seg) > seg)
    .sort((a, b) => Number(a.dataset.seg) - Number(b.dataset.seg))[0];
  const off = goal ? LANES[Number(goal.dataset.lane)] : 0;
  const type = racing.has(arena) ? 'pointermove' : 'pointerdown';
  racing.add(arena);
  arena.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: 195 + (off / 0.8) * 195, clientY: 300, pointerId: 1 }));
}

// a child who taps every mole that shows the named letter
function whackMoles(root: HTMLElement, unit: string): void {
  for (const hole of Array.from(root.querySelectorAll('[data-hole][data-up]:not([data-answered])'))) {
    if (hole.textContent === unit) hole.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  }
}

// a child who turns the first open card and then its pair
function matchPair(root: HTMLElement): void {
  const cards = Array.from(root.querySelectorAll('[data-card]:not([data-matched])')) as HTMLElement[];
  const a = cards[0];
  const b = a ? cards.slice(1).find(x => x.dataset.letter === a.dataset.letter && x.dataset.texture === a.dataset.texture) : undefined;
  if (!a || !b) return;
  a.click();
  b.click();
}

describe('boot smoke', () => {
  it('first run shows setup, finishing setup lands on the map and saves', () => {
    const kv = memoryKV();
    const root = document.createElement('div');
    const { router, app } = bootApp({ root, kv, native: null, now: 1_700_000_000_000, audioDeps: { fetchIndex: async () => null } });
    expect(router.current()).toBe('setup');
    expect(root.textContent).toContain('מי הולך ללמוד');
    const input = root.querySelector('input[type=text]') as HTMLInputElement;
    input.value = 'נועה'; input.dispatchEvent(new Event('input', { bubbles: true }));
    buttons(root).find(b => b.getAttribute('aria-label') === 'גיל 4')!.click();
    buttons(root).find(b => b.textContent?.trim() === 'בואו נתחיל')!.click();
    expect(router.current()).toBe('map');
    expect(root.querySelector('[data-screen=map]')).not.toBeNull();
    expect(app.save.children).toHaveLength(1);
    expect(loadSave(kv, null, 0).data.children[0].name).toBe('נועה');
  });
  it('one saved child goes straight to the map', () => {
    const { router, app } = bootApp({ root: document.createElement('div'), kv: kvWith(1), native: null, now: 2, audioDeps: { fetchIndex: async () => null } });
    expect(router.current()).toBe('map');
    expect(app.childId).toBe('c0');
  });
  it('two saved children show the picker, picking one opens the map', () => {
    const root = document.createElement('div');
    const { router, app } = bootApp({ root, kv: kvWith(2), native: null, now: 2, audioDeps: { fetchIndex: async () => null } });
    expect(router.current()).toBe('children');
    (root.querySelectorAll('[data-child]')[1] as HTMLElement).click();
    expect(router.current()).toBe('map');
    expect(app.childId).toBe('c1');
  });
  // Stands in for the manual `npm run dev` check: meet, find, drive, first sound, all five games, end screen and back.
  it('the next node runs its steps to the end screen and back to the map, where the next letter already glows', async () => {
    // the plane game runs on rAF and timers: fake them so the child can play it to the end
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    const step = () => vi.advanceTimersByTimeAsync(50);
    try {
      const root = document.createElement('div');
      const clock = { now: () => Date.UTC(2026, 10, 21, 9), today: () => '2026-11-21' };
      const kv = kvWith(1);
      const { router } = bootApp({ root, kv, native: null, now: 2, clock, audioDeps: { fetchIndex: async () => null } });
      expect(root.querySelectorAll('.node').length).toBe(8);
      const next = root.querySelector('[aria-label="התחנה הבאה: האות מ"]') as HTMLElement;
      expect(next.classList.contains('sleeping')).toBe(false);
      // teaching steps flow on by themselves, so a step can come and go within one poll: record each as it mounts
      const seen: string[] = [];
      const mo = new MutationObserver(recs => {
        for (const r of recs) for (const n of Array.from(r.addedNodes)) {
          if (!(n instanceof HTMLElement)) continue;
          const el = n.matches('[data-step],[data-placeholder]') ? n : n.querySelector('[data-step],[data-placeholder]');
          const sid = el?.getAttribute('data-step') ?? el?.getAttribute('data-placeholder');
          if (sid && seen[seen.length - 1] !== sid) seen.push(sid);
        }
      });
      mo.observe(root, { childList: true, subtree: true });
      next.click();
      let findCards: HTMLElement[] = [];
      const fsWords = new Set(CONTENT.letters['מ'].words.map(w => w.plain));
      // the dino needs a player that hops in time: frame by frame while it runs
      let id: string | null | undefined = null;
      const dino = createDinoBot(root, 'מ');
      for (let i = 0; i < 40000 && router.current() !== 'end'; i++) {
        await (id === 'jump' ? vi.advanceTimersByTimeAsync(16) : step());
        const cur = root.querySelector('[data-step],[data-placeholder]');
        id = cur?.getAttribute('data-step') ?? cur?.getAttribute('data-placeholder');
        // a child who always picks right: the letter card in find, the word that starts with the letter in firstSound
        const cards = Array.from(root.querySelectorAll('[data-choice]')) as HTMLElement[];
        if (id === 'find' && cards.length) findCards = cards;
        const right = id === 'find' ? cards.find(b => b.getAttribute('aria-label') === 'מ') : cards.find(b => fsWords.has(b.getAttribute('aria-label') ?? ''));
        if (id === 'find' || id === 'firstSound') right?.click();
        if (id === 'drive') driveAlong(root.querySelector('[data-drive-board]'), 'מ');
        if (id === 'plane') steerPlane(root, 'מ');
        if (id === 'race') steerRace(root, 'מ');
        if (id === 'mole') whackMoles(root, 'מ');
        if (id === 'match' && i % 25 === 0) matchPair(root);
        if (id === 'jump') { dino.tick(); (root.querySelector('[data-level-next]') as HTMLElement | null)?.click(); }
        // a game ends on its result window: continue
        (root.querySelector('[data-result-choice="continue"]') as HTMLElement | null)?.click();
      }
      mo.disconnect();
      // the find step showed 3 face cards
      expect(findCards).toHaveLength(3);
      expect(new Set(findCards.map(b => b.className))).toEqual(new Set(['pick-face']));
      expect(seen).toEqual(['meet', 'find', 'drive', 'firstSound', 'plane', 'race', 'mole', 'match', 'jump']);
      expect(router.current()).toBe('end');
      expect(root.querySelector('[aria-label="מדבקה של האות מ"]')).not.toBeNull();
      (root.querySelector('[data-end=map]') as HTMLElement).click();
      expect(router.current()).toBe('map');
      // no daily limit: the next sitting (the next letter) is ready at once
      expect(root.querySelector('.node-next.sleeping')).toBeNull();
      expect(root.querySelector('.node-next.alfi-glow')?.getAttribute('aria-label')).toBe('התחנה הבאה: האות ל');
      expect(root.querySelector('[aria-label="מ - הושלם"]')).not.toBeNull();
      const saved = loadSave(kv, null, 0).data.children[0].progress;
      expect(saved.stickers).toEqual([{ id: 'u:מ', day: '2026-11-21', shown: true }]);
      expect(saved.sitting?.endShown).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  }, 60000);
  it('back on the "add child" setup returns to the picker, not the leave dialog', () => {
    vi.useFakeTimers();
    try {
      const root = document.createElement('div');
      const { router } = bootApp({ root, kv: kvWith(2), native: null, now: 2, audioDeps: { fetchIndex: async () => null } });
      expect(router.current()).toBe('children');
      const add = root.querySelector('[aria-label^="הוספת ילד"]') as HTMLElement;
      add.dispatchEvent(new Event('pointerdown'));
      vi.advanceTimersByTime(3000);
      expect(router.current()).toBe('gate');
      const [a, b] = (root.querySelector('h1')!.textContent ?? '').match(/\d+/g)!.map(Number);
      buttons(root).find(x => x.textContent === String(a + b))!.click();
      expect(router.current()).toBe('setup');
      router.back();
      expect(router.dialogOpen()).toBe(false);
      expect(router.current()).toBe('children');
      // first-run setup (no child yet) still asks before leaving
      const first = bootApp({ root: document.createElement('div'), kv: memoryKV(), native: null, now: 2, audioDeps: { fetchIndex: async () => null } });
      first.router.back();
      expect(first.router.dialogOpen()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it('a save writes the native backup only once, debounced (not also at once in saveNow)', () => {
    vi.useFakeTimers();
    try {
      const writes: string[] = [];
      const native = { read: () => null, write: (s: string) => { writes.push(s); return true; } };
      const { app } = bootApp({ root: document.createElement('div'), kv: kvWith(1), native, now: 2, audioDeps: { fetchIndex: async () => null } });
      const before = writes.length;
      expect(app.persist()).toBe(true);
      expect(app.persist()).toBe(true);
      expect(writes.length).toBe(before);
      vi.advanceTimersByTime(2000);
      expect(writes.length).toBe(before + 1);
      expect(loadSave(memoryKV(), { read: () => writes[writes.length - 1], write: () => true }, 0).seq).toBe(app.seq);
    } finally {
      vi.useRealTimers();
    }
  });
  it('"no" in the leave dialog stops its question', () => {
    const root = document.createElement('div');
    const { router, app } = bootApp({ root, kv: kvWith(1), native: null, now: 2, audioDeps: { fetchIndex: async () => null } });
    router.back();
    const stop = vi.spyOn(app.audio, 'stop');
    (root.querySelector('[data-leave=no]') as HTMLElement).click();
    expect(stop).toHaveBeenCalled();
    expect(router.dialogOpen()).toBe(false);
  });
  it('back on the map opens the leave dialog with two buttons, the cross closes it', () => {
    const root = document.createElement('div');
    const { router } = bootApp({ root, kv: kvWith(1), native: null, now: 2, audioDeps: { fetchIndex: async () => null } });
    router.back();
    expect(router.dialogOpen()).toBe(true);
    (root.querySelector('[data-leave=no]') as HTMLElement).click();
    expect(router.dialogOpen()).toBe(false);
    expect(router.current()).toBe('map');
  });
  it('a ?v= query on the start URL does not break boot', () => {
    history.replaceState(null, '', '/assets/web/index.html?v=0.7-preview');
    try {
      const root = document.createElement('div');
      bootApp({ root, kv: kvWith(2), native: null, now: 2, audioDeps: { fetchIndex: async () => null } });
      expect(root.querySelector('[data-screen="children"]')).not.toBeNull();
    } finally { history.replaceState(null, '', '/'); }
  });
});
