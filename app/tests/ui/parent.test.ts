// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountParent, PHOTO_CHANGED, PHOTO_NOT_READ } from '../../src/ui/screens/parent.ts';
import type { ParentApp, ParentDeps } from '../../src/ui/screens/parent.ts';
import { freshSave, newChild } from '../../src/store/schema.ts';
import type { ChildRecord } from '../../src/store/schema.ts';
import { contrastRatio } from '../../src/util/contrast.ts';
import { exportChild } from '../../src/store/exportImport.ts';
import { CONTENT } from '../../src/content/index.ts';
import { buildVersion } from '../../src/platform/native.ts';

const TODAY = '2026-11-21';

interface Mounted { root: HTMLElement; app: ParentApp; exports: { name: string; text: string }[]; persisted: number; calls: string[]; setVoice(s: 'clips' | 'live' | 'none'): void; vol: { voice: number[]; sfx: number[] }; sound: { sfxOn: boolean[]; musicOn: boolean[] } }

function mounted(o: { voice?: 'clips' | 'live' | 'none'; storageWarning?: boolean; breakActive?: () => boolean; children?: number; photo?: string | null; ready?: Promise<void>; setup?: (c: ChildRecord) => void } = {}, extra: Partial<ParentDeps> = {}): Mounted {
  const save = freshSave();
  for (let i = 0; i < (o.children ?? 1); i++) save.children.push(newChild(i === 0 ? 'נועה' : 'דנה', 4, o.photo ?? null, TODAY, 'c' + i));
  o.setup?.(save.children[0]);
  let voice = o.voice ?? 'live';
  const listeners: (() => void)[] = [];
  const vol = { voice: [] as number[], sfx: [] as number[] };
  const sound = { sfxOn: [] as boolean[], musicOn: [] as boolean[] };
  const m: Mounted = {
    root: document.createElement('div'),
    exports: [],
    persisted: 0,
    calls: [],
    vol,
    sound,
    setVoice(s) { voice = s; listeners.forEach(f => f()); },
    app: {
      save,
      childId: 'c0',
      storageWarning: o.storageWarning ?? false,
      persist() { m.persisted++; return true; },
      audio: { setVoiceVolume: v => { vol.voice.push(v); }, status: () => voice, onStatusChange: cb => { listeners.push(cb); return () => undefined; } },
      sfx: { setVolume: v => { vol.sfx.push(v); }, setEnabled: v => { sound.sfxOn.push(v); } },
      music: { setEnabled: v => { sound.musicOn.push(v); } },
    },
  };
  mountParent(m.root, {
    app: m.app, childId: 'c0', content: CONTENT, today: TODAY, ready: o.ready,
    onClose: () => m.calls.push('close'), onAddChild: () => m.calls.push('add'), onChildGone: () => m.calls.push('gone'), onImported: id => m.calls.push('imported:' + id),
    onStartLetter: unit => m.calls.push('start:' + unit),
    exportFile: (name, text) => { m.exports.push({ name, text }); return true; },
    breakActive: o.breakActive, onSkipBreak: () => m.calls.push('skip'),
    ...extra,
  });
  return m;
}

const buttons = (r: HTMLElement) => Array.from(r.querySelectorAll('button')) as HTMLButtonElement[];
const btn = (r: HTMLElement, text: string) => buttons(r).find(b => b.textContent?.trim() === text)!;
const click = (r: HTMLElement, text: string) => btn(r, text).click();
const hold = (r: HTMLElement) => { (r.querySelector('[data-hold-confirm]') as HTMLElement).dispatchEvent(new Event('pointerdown')); };
const release = (r: HTMLElement) => { (r.querySelector('[data-hold-confirm]') as HTMLElement).dispatchEvent(new Event('pointerup')); };
const lastExport = (m: Mounted) => m.exports[m.exports.length - 1];

afterEach(() => { vi.useRealTimers(); });

describe('parent page', () => {
  it('shows the header, 22 letters in up to 8 columns of at least 44px and the legend', () => {
    const m = mounted();
    expect(m.root.textContent).toContain('נועה, גיל 4');
    expect(m.root.textContent).toContain('בדרך לאות מ');
    expect(m.root.querySelectorAll('[data-status]').length).toBe(22);
    // 8 columns where they fit; on a narrow phone fewer, so every letter stays a 44px target
    expect(m.root.innerHTML).toContain('repeat(auto-fill,minmax(max(44px,calc((100% - 42px) / 8)),1fr))');
    expect(m.root.textContent).toContain('יודע/ת');
    expect(m.root.textContent).toContain('בלימוד');
    expect(m.root.textContent).toContain('הכיר/ה');
    expect(m.root.textContent).toContain('עוד לא');
  });
  it('shows what is being practised and the time played', () => {
    const m = mounted();
    expect(m.root.textContent).toContain('אין כרגע נקודות חלשות');
    expect(m.root.querySelectorAll('[data-last7] li').length).toBe(7);
  });
  it('the close button calls onClose and is at least 44px', () => {
    const m = mounted();
    const x = m.root.querySelector('[data-parent=close]') as HTMLElement;
    expect(x.getAttribute('style')).toContain('width:44px;height:44px');
    x.click();
    expect(m.calls).toEqual(['close']);
  });

  it('shows the no-voice notice', () => expect(mounted({ voice: 'none' }).root.textContent).toContain('לא נמצא קול עברי'));
  it('no notice when a voice exists', () => expect(mounted({ voice: 'live' }).root.textContent).not.toContain('לא נמצא קול עברי'));
  it('the no-voice notice follows status changes and waits for the audio to load', async () => {
    let done: () => void = () => undefined;
    const ready = new Promise<void>(r => { done = r; });
    const m = mounted({ voice: 'none', ready });
    expect(m.root.textContent).not.toContain('לא נמצא קול עברי');
    done(); await ready; await Promise.resolve();
    expect(m.root.textContent).toContain('לא נמצא קול עברי');
    m.setVoice('clips');
    expect(m.root.textContent).not.toContain('לא נמצא קול עברי');
    m.setVoice('none');
    expect(m.root.textContent).toContain('לא נמצא קול עברי');
  });
  it('shows the storage warning', () => {
    expect(mounted({ storageWarning: true }).root.textContent).toContain('השמירה נכשלה - כדאי לגבות לקובץ');
    expect(mounted().root.textContent).not.toContain('השמירה נכשלה');
  });

  it('export leaves the photo out by default', () => {
    const m = mounted({ photo: 'data:image/png;base64,AAA' });
    click(m.root, 'גיבוי לקובץ');
    expect(JSON.parse(lastExport(m).text).child.photo).toBeNull();
    expect(lastExport(m).name).toBe('alfi-נועה-2026-11-21.json');
  });
  it('export keeps the photo when "include photo" is ticked', () => {
    const m = mounted({ photo: 'data:image/png;base64,AAA' });
    const box = m.root.querySelector('#incphoto') as HTMLInputElement;
    expect(box.checked).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    click(m.root, 'גיבוי לקובץ');
    expect(JSON.parse(lastExport(m).text).child.photo).toBe('data:image/png;base64,AAA');
  });
  it('export in the app: a save window opened, then the written file or the failure', () => {
    let done: ((ok: boolean) => void) | undefined;
    const m = mounted({}, { exportFile: (_n, _t, onDone) => { done = onDone; return 'choosing'; } });
    const msg = () => (m.root.querySelector('[data-message]') as HTMLElement | null)?.textContent;
    click(m.root, 'גיבוי לקובץ');
    expect(msg()).toBe('בחרו איפה לשמור את קובץ הגיבוי');
    done!(true);
    expect(msg()).toBe('קובץ הגיבוי נשמר');
    click(m.root, 'גיבוי לקובץ');
    done!(false);
    expect(msg()).toBe('קובץ הגיבוי לא נשמר');
  });
  it('export in the browser: the download started; a failure says so', () => {
    const ok = mounted();
    click(ok.root, 'גיבוי לקובץ');
    expect(ok.root.querySelector('[data-message]')?.textContent).toBe('קובץ הגיבוי נשמר');
    const bad = mounted({}, { exportFile: () => false });
    click(bad.root, 'גיבוי לקובץ');
    expect(bad.root.querySelector('[data-message]')?.textContent).toBe('שמירת הקובץ נכשלה');
  });
  it('the native export bridge reports the written file through window.__alfiExportDone', async () => {
    const { exportFile } = await import('../../src/platform/native.ts');
    const w = window as unknown as Record<string, unknown>;
    const calls: string[] = [];
    w.AlfiNative = { exportFile: (name: string) => { calls.push(name); } };
    try {
      const seen: boolean[] = [];
      expect(exportFile('a.json', '{}', ok => seen.push(ok))).toBe('choosing');
      expect(calls).toEqual(['a.json']);
      (w.__alfiExportDone as (ok: boolean) => void)(true);
      expect(seen).toEqual([true]);
      expect(w.__alfiExportDone).toBeUndefined();
      exportFile('b.json', '{}', ok => seen.push(ok));
      (w.__alfiExportDone as (ok: boolean) => void)(false);
      expect(seen).toEqual([true, false]);
    } finally {
      delete w.AlfiNative;
    }
  });

  describe('restore from file', () => {
    const pickFile = async (m: Mounted) => {
      const input = m.root.querySelector('[data-restore-file]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [{ name: 'x.json' }], configurable: true });
      input.dispatchEvent(new Event('change'));
      await Promise.resolve(); await Promise.resolve();
    };
    const mountWithFile = (text: string) => mounted({}, { readFile: async () => text });

    it('shows the child name and applies nothing until confirmed', async () => {
      const other = newChild('דנה', 5, null, TODAY, 'c9');
      const m = mountWithFile(exportChild(other, false, TODAY).text);
      await pickFile(m);
      expect(m.root.querySelector('[data-import-confirm]')!.textContent).toContain('דנה');
      expect(m.app.save.children.length).toBe(1);
      expect(m.persisted).toBe(0);
      (m.root.querySelector('[data-import-yes]') as HTMLElement).click();
      expect(m.app.save.children.map(c => c.id)).toEqual(['c0', 'c9']);
      expect(m.persisted).toBe(1);
      expect(m.calls).toEqual(['imported:c9']);
    });
    it('cancel leaves the data unchanged', async () => {
      const m = mountWithFile(exportChild(newChild('דנה', 5, null, TODAY, 'c9'), false, TODAY).text);
      await pickFile(m);
      (m.root.querySelector('[data-import-no]') as HTMLElement).click();
      expect(m.root.querySelector('[data-import-confirm]')).toBeNull();
      expect(m.app.save.children.length).toBe(1);
    });
    it('warns that the same child is replaced', async () => {
      const m = mountWithFile(exportChild(newChild('נועה', 5, null, TODAY, 'c0'), false, TODAY).text);
      await pickFile(m);
      expect(m.root.querySelector('[data-import-confirm]')!.textContent).toContain('יוחלפו');
    });
    it('a bad file shows a message and changes nothing', async () => {
      const m = mountWithFile('not json');
      await pickFile(m);
      expect(m.root.querySelector('[data-message]')).not.toBeNull();
      expect(m.root.querySelector('[data-import-confirm]')).toBeNull();
      expect(m.app.save.children.length).toBe(1);
    });
  });

  it('volume sliders apply live and are saved', () => {
    const m = mounted();
    const v1 = m.root.querySelector('#v1') as HTMLInputElement;
    v1.value = '30'; v1.dispatchEvent(new Event('input'));
    expect(m.vol.voice).toEqual([0.3]);
    expect(m.persisted).toBe(0);
    v1.dispatchEvent(new Event('change'));
    expect(m.app.save.settings.voiceVolume).toBe(0.3);
    expect(m.persisted).toBe(1);
    const v2 = m.root.querySelector('#v2') as HTMLInputElement;
    v2.value = '0'; v2.dispatchEvent(new Event('input')); v2.dispatchEvent(new Event('change'));
    expect(m.vol.sfx[0]).toBe(0);
    expect(m.app.save.settings.effectsVolume).toBe(0);
  });

  it('the music and game sounds switches save and apply at once', () => {
    const m = mounted();
    expect(m.root.textContent).toContain('עוצמת צלילים ומוזיקה');
    const music = m.root.querySelector('#music') as HTMLInputElement;
    const sfx = m.root.querySelector('#sfx') as HTMLInputElement;
    expect(music.checked).toBe(true);
    expect(sfx.checked).toBe(true);
    expect(m.root.textContent).toContain('מוזיקה במשחקים');
    expect(m.root.textContent).toContain('צלילי משחק');
    const persisted = m.persisted;
    music.checked = false; music.dispatchEvent(new Event('change'));
    expect(m.sound.musicOn).toEqual([false]);
    expect(m.app.save.settings.musicOn).toBe(false);
    expect(m.persisted).toBe(persisted + 1);
    sfx.checked = false; sfx.dispatchEvent(new Event('change'));
    expect(m.sound.sfxOn).toEqual([false]);
    expect(m.app.save.settings.sfxOn).toBe(false);
    expect(m.persisted).toBe(persisted + 2);
    expect(m.app.save.settings.musicOn).toBe(false);
  });

  describe('break settings', () => {
    const opts = (r: HTMLElement, id: string) => Array.from((r.querySelector(id) as HTMLSelectElement).options).map(o => o.value);
    it('show the defaults 10 and 2 with the offered choices', () => {
      const m = mounted();
      expect((m.root.querySelector('#brk1') as HTMLSelectElement).value).toBe('10');
      expect((m.root.querySelector('#brk2') as HTMLSelectElement).value).toBe('2');
      expect(opts(m.root, '#brk1')).toEqual(['5', '10', '15', '20']);
      expect(opts(m.root, '#brk2')).toEqual(['1', '2', '3', '5']);
      expect(m.root.textContent).toContain('הפסקות');
    });
    it('changing them stores the new value and saves', () => {
      const m = mounted();
      const a = m.root.querySelector('#brk1') as HTMLSelectElement;
      a.value = '15'; a.dispatchEvent(new Event('change'));
      const b = m.root.querySelector('#brk2') as HTMLSelectElement;
      b.value = '5'; b.dispatchEvent(new Event('change'));
      expect(m.app.save.settings.breakEveryMin).toBe(15);
      expect(m.app.save.settings.breakLengthMin).toBe(5);
      expect(m.persisted).toBe(2);
    });
    it('the daily-limit select and the extra sitting button are gone', () => {
      const m = mounted();
      expect(m.root.textContent).not.toContain('זמן משחק ביום');
      expect(m.root.textContent).not.toContain('פתיחת ישיבה נוספת');
    });
    it('the skip button shows only while a break is running and calls onSkipBreak', () => {
      expect(mounted().root.textContent).not.toContain('דילוג על ההפסקה הנוכחית');
      expect(mounted({ breakActive: () => false }).root.textContent).not.toContain('דילוג על ההפסקה הנוכחית');
      const m = mounted({ breakActive: () => true });
      expect(btn(m.root, 'דילוג על ההפסקה הנוכחית')).toBeDefined();
      click(m.root, 'דילוג על ההפסקה הנוכחית');
      expect(m.calls).toEqual(['skip']);
    });
    it('the skip button appears when a break starts while the page is open', () => {
      vi.useFakeTimers();
      let active = false;
      const m = mounted({ breakActive: () => active });
      expect(m.root.textContent).not.toContain('דילוג על ההפסקה הנוכחית');
      active = true;
      vi.advanceTimersByTime(1100);
      expect(m.root.textContent).toContain('דילוג על ההפסקה הנוכחית');
    });
  });

  it('age fix sets the age as of today', () => {
    const m = mounted();
    click(m.root, 'תיקון גיל');
    const six = buttons(m.root).find(b => b.getAttribute('aria-label') === 'גיל 6')!;
    expect(buttons(m.root).filter(b => /^גיל [3-8]$/.test(b.getAttribute('aria-label') ?? '')).length).toBe(6);
    six.click();
    expect(m.app.save.children[0].age).toEqual({ years: 6, setOn: TODAY });
    expect(m.persisted).toBe(1);
    expect(m.root.textContent).toContain('נועה, גיל 6');
  });
  it('add child calls onAddChild', () => {
    const m = mounted();
    click(m.root, 'הוספת ילד');
    expect(m.calls).toEqual(['add']);
  });

  it('delete needs the second hold', () => {
    vi.useFakeTimers();
    const m = mounted();
    click(m.root, 'מחיקת ילד');
    expect(m.app.save.children.length).toBe(1);
    hold(m.root);
    vi.advanceTimersByTime(2000);
    expect(m.app.save.children.length).toBe(1);
    release(m.root);
    vi.advanceTimersByTime(2000);
    expect(m.app.save.children.length).toBe(1);
    hold(m.root);
    vi.advanceTimersByTime(3000);
    expect(m.app.save.children.length).toBe(0);
    expect(m.app.childId).toBeNull();
    expect(m.persisted).toBe(1);
    expect(m.calls).toEqual(['gone']);
  });
  it('reset needs the second hold and clears progress but keeps the child', () => {
    vi.useFakeTimers();
    const m = mounted();
    const c = m.app.save.children[0];
    c.progress.stationsDone = ['u:מ#0'];
    c.mastery['מ/name'] = { attempts: [{ day: TODAY, t: 1, ok: true, kind: 'recall' }], confusions: {}, lastSeen: 1 };
    click(m.root, 'איפוס התקדמות');
    hold(m.root);
    vi.advanceTimersByTime(2999);
    expect(c.progress.stationsDone.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(m.app.save.children.length).toBe(1);
    expect(m.app.save.children[0].progress.stationsDone).toEqual([]);
    expect(m.app.save.children[0].mastery).toEqual({});
    expect(m.persisted).toBe(1);
  });
  it('a persist failure shows the storage warning', () => {
    const m = mounted();
    m.app.persist = () => { m.app.storageWarning = true; return false; };
    click(m.root, 'תיקון גיל');
    buttons(m.root).find(b => b.getAttribute('aria-label') === 'גיל 5')!.click();
    expect(m.root.textContent).toContain('השמירה נכשלה');
  });

  it('every parent control is at least 44px tall', () => {
    const m = mounted();
    for (const b of buttons(m.root)) expect(b.getAttribute('style') ?? '').toMatch(/min-height:44px|height:44px/);
    for (const s of Array.from(m.root.querySelectorAll('select,input[type=range]'))) expect(s.getAttribute('style')).toContain('min-height:44px');
  });
  it('the include-photo checkbox sits in a 44px row whose whole label is the target', () => {
    const m = mounted();
    const box = m.root.querySelector('#incphoto') as HTMLInputElement;
    const row = box.parentElement as HTMLElement;
    expect(row.getAttribute('style')).toContain('min-height:44px');
    expect(row.querySelector('label[for=incphoto]')!.getAttribute('style')).toContain('flex-grow:1');
    for (const i of Array.from(m.root.querySelectorAll('input:not([type=file])'))) {
      const own = i.getAttribute('style') ?? '';
      const rowStyle = i.parentElement!.getAttribute('style') ?? '';
      expect(own + rowStyle).toMatch(/min-height:44px/);
    }
  });
  it('a stored break value outside the options snaps to the nearest option', () => {
    const m = mounted();
    m.app.save.settings.breakEveryMin = 7;
    m.app.save.settings.breakLengthMin = 4;
    const root = document.createElement('div');
    mountParent(root, { app: m.app, childId: 'c0', content: CONTENT, today: TODAY, onClose: () => undefined, onAddChild: () => undefined, onChildGone: () => undefined, onImported: () => undefined });
    expect((root.querySelector('#brk1') as HTMLSelectElement).value).toBe('5');
    expect((root.querySelector('#brk2') as HTMLSelectElement).value).toBe('3');
    expect(m.app.save.settings.breakEveryMin).toBe(7);
  });
  it('dates in the lists are short and isolated for RTL', () => {
    const m = mounted();
    m.app.save.children[0].checkpoints.push({ cpId: 'cp1', day: '2026-11-20', passed: ['מ/name'], failed: [] }, { cpId: 'cp1', day: '2026-11-21', passed: ['מ/name'], failed: [] });
    const root = document.createElement('div');
    mountParent(root, { app: m.app, childId: 'c0', content: CONTENT, today: TODAY, onClose: () => undefined, onAddChild: () => undefined, onChildGone: () => undefined, onImported: () => undefined });
    expect(root.querySelector('[data-last7] li bdi')!.textContent).toBe('21.11');
    expect(root.querySelector('[data-checkpoints] li bdi')!.textContent).toBe('21.11');
    expect(root.textContent).not.toContain('2026-11');
  });
});

// מ known, ל practising (one answer), ב met (meet done, no answers), ת met; the rest not yet
function withLevels(c: ChildRecord): void {
  const at = (day: string, ok: boolean, chose?: string) => ({ day, t: 1, ok, kind: 'recall' as const, ...(chose ? { chose } : {}) });
  const known = { attempts: [at('2026-11-18', true), at('2026-11-19', true)], confusions: {}, lastSeen: 1 };
  c.progress.stationsDone = ['u:מ#0', 'u:ל#0', 'u:ב#0', 'u:ת#0'];
  c.mastery['מ/name'] = known;
  c.mastery['מ/sound'] = known;
  c.mastery['ל/name'] = { attempts: [at('2026-11-18', true), at('2026-11-19', false, 'כ'), at('2026-11-20', false, 'כ'), at('2026-11-20', true)], confusions: { 'כ': 2 }, lastSeen: 1 };
  c.mastery['ל/sound'] = { attempts: [at('2026-11-19', true)], confusions: {}, lastSeen: 1 };
}
const cell = (r: HTMLElement, ch: string) => r.querySelector(`[data-letter="${ch}"]`) as HTMLButtonElement;
const card = (r: HTMLElement) => r.querySelector('[data-letter-card]') as HTMLElement | null;
const focusBtn = (r: HTMLElement) => r.querySelector('[data-focus-toggle]') as HTMLButtonElement;
const startBtn = (r: HTMLElement) => r.querySelector('[data-start-letter]') as HTMLButtonElement;

describe('letters: levels, card, marks, practise now', () => {
  it('the grid shows four levels with a legend whose colours also differ in lightness', () => {
    const m = mounted({ setup: withLevels });
    expect(cell(m.root, 'מ').dataset.status).toBe('known');
    expect(cell(m.root, 'ל').dataset.status).toBe('practising');
    expect(cell(m.root, 'ב').dataset.status).toBe('met');
    expect(cell(m.root, 'צ').dataset.status).toBe('notYet');
    expect(cell(m.root, 'א').dataset.status).toBe('notYet');
    const legend = Array.from(m.root.querySelectorAll('[data-legend]')) as HTMLElement[];
    expect(legend.map(l => l.dataset.legend)).toEqual(['known', 'practising', 'met', 'notYet']);
    // each colour against the next lighter one: clearly apart in lightness, not only in hue
    const colours = legend.map(l => (l.querySelector('span') as HTMLElement).style.background).map(toHex);
    for (let k = 1; k < colours.length; k++) expect(contrastRatio(colours[k - 1], colours[k])).toBeGreaterThanOrEqual(1.3);
    for (const g of ['מ', 'ל', 'ב', 'צ']) {
      const st = cell(m.root, g).getAttribute('style') ?? '';
      expect(st).toContain('height:44px');
    }
  });
  it('tapping a letter opens its card: level, days with correct recall, first-answer success, confusions, last practised', () => {
    const m = mounted({ setup: withLevels });
    expect(card(m.root)).toBeNull();
    cell(m.root, 'ל').click();
    const t = card(m.root)!.textContent!;
    expect(t).toContain('ל');
    expect(t).toContain('בלימוד');
    expect(t).toContain('ימים עם זיהוי נכון: 3');
    expect(t).toContain('הצלחה בתשובה הראשונה: 60%');
    expect(t).toContain('מתבלבל/ת עם כ');
    expect(t).toContain('תרגול אחרון: 20.11');
    expect(cell(m.root, 'ל').getAttribute('aria-expanded')).toBe('true');
    // a letter never met says so
    cell(m.root, 'צ').click();
    expect(card(m.root)!.textContent).toContain('עוד לא');
    expect(card(m.root)!.textContent).not.toContain('מתבלבל');
  });
  it('practise more: only for met letters; it marks the letter, flags it in the grid and saves', () => {
    const m = mounted({ setup: withLevels });
    cell(m.root, 'צ').click();
    expect(focusBtn(m.root).disabled).toBe(true);
    focusBtn(m.root).click();
    expect(m.app.save.children[0].progress.focus ?? []).toEqual([]);
    cell(m.root, 'ב').click();
    expect(focusBtn(m.root).disabled).toBe(false);
    expect(focusBtn(m.root).getAttribute('aria-pressed')).toBe('false');
    focusBtn(m.root).click();
    expect(m.app.save.children[0].progress.focus).toEqual(['ב']);
    expect(m.persisted).toBe(1);
    expect(focusBtn(m.root).getAttribute('aria-pressed')).toBe('true');
    expect(cell(m.root, 'ב').querySelector('[data-flag]')).not.toBeNull();
    expect(cell(m.root, 'ל').querySelector('[data-flag]')).toBeNull();
    // a second tap removes the mark
    focusBtn(m.root).click();
    expect(m.app.save.children[0].progress.focus).toEqual([]);
    expect(cell(m.root, 'ב').querySelector('[data-flag]')).toBeNull();
  });
  it('the practise-more flag stands out (>= 3:1) on every cell it can sit on, the orange one too', () => {
    const m = mounted({ setup: withLevels });
    for (const g of ['מ', 'ל', 'ב']) { cell(m.root, g).click(); focusBtn(m.root).click(); }
    for (const g of ['מ', 'ל', 'ב']) {
      const fill = cell(m.root, g).querySelector('[data-flag] svg')!.getAttribute('fill')!;
      expect(contrastRatio(fill, toHex(cell(m.root, g).style.background))).toBeGreaterThanOrEqual(3);
    }
  });
  it('at most 3 marks: the 4th asks which mark to remove', () => {
    const m = mounted({ setup: withLevels });
    for (const g of ['מ', 'ל', 'ב']) { cell(m.root, g).click(); focusBtn(m.root).click(); }
    expect(m.app.save.children[0].progress.focus).toEqual(['מ', 'ל', 'ב']);
    cell(m.root, 'ת').click();
    focusBtn(m.root).click();
    const ask = m.root.querySelector('[data-focus-full]') as HTMLElement;
    expect(ask.textContent).toContain('אפשר לסמן עד 3 אותיות');
    expect(m.app.save.children[0].progress.focus).toEqual(['מ', 'ל', 'ב']);
    const swaps = Array.from(ask.querySelectorAll('[data-focus-replace]')) as HTMLButtonElement[];
    expect(swaps.map(b => b.dataset.focusReplace)).toEqual(['מ', 'ל', 'ב']);
    for (const b of swaps) expect(b.getAttribute('style')).toContain('min-height:44px');
    swaps[1].click();
    expect(m.app.save.children[0].progress.focus).toEqual(['מ', 'ב', 'ת']);
    expect(m.root.querySelector('[data-focus-full]')).toBeNull();
  });
  it('practise now starts a sitting on any letter of the path, met or not; a letter outside the path cannot', () => {
    const m = mounted({ setup: withLevels });
    cell(m.root, 'ב').click();
    startBtn(m.root).click();
    cell(m.root, 'צ').click();
    startBtn(m.root).click();
    expect(m.calls).toEqual(['start:ב', 'start:צ']);
    cell(m.root, 'א').click();
    expect(startBtn(m.root).disabled).toBe(true);
    startBtn(m.root).click();
    expect(m.calls).toEqual(['start:ב', 'start:צ']);
    expect(card(m.root)!.textContent).toContain('האות עוד לא במסלול');
  });
});

function toHex(css: string): string {
  if (css.startsWith('#')) return css;
  const n = css.match(/\d+/g)!.slice(0, 3).map(Number);
  return '#' + n.map(v => v.toString(16).padStart(2, '0')).join('');
}

describe('parent page footer', () => {
  it('shows the build version: the bridge value when present, else the build value', () => {
    const label = (r: HTMLElement) => r.querySelector('[data-version]') as HTMLElement;
    expect(label(mounted().root).textContent).toBe(buildVersion());
    (window as unknown as { AlfiNative: unknown }).AlfiNative = { appVersion: () => '9.9-preview' };
    try {
      const m = mounted();
      expect(label(m.root).textContent).toBe('9.9-preview');
      expect(label(m.root).closest('button')).toBeNull();
    } finally { delete (window as unknown as { AlfiNative?: unknown }).AlfiNative; }
  });
});

describe('change a child\'s picture (owner 2026-11-22: "allow changing the picture of a player. remove the old add the new")', () => {
  const OLD = 'data:image/jpeg;base64,T0xE';
  const NEW = 'data:image/jpeg;base64,TkVX';
  const changeBtn = (r: HTMLElement) => r.querySelector('[data-change-photo]') as HTMLButtonElement;
  const picker = (r: HTMLElement) => r.querySelector('input[type=file][data-photo-file]') as HTMLInputElement;
  /** The file input reports a picked file (files given) or a closed picker (no files), as the browser and the APK do. */
  const pick = (r: HTMLElement, files: File[]) => {
    const input = picker(r);
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change'));
  };
  const headerPhoto = (r: HTMLElement) => (r.querySelector('h1')!.parentElement!.parentElement!.querySelector('img') as HTMLImageElement | null)?.getAttribute('src');
  const flush = () => new Promise(res => setTimeout(res, 0));

  it('the button opens the same image picker as setup (a file input for images; the APK answers it with its chooser)', () => {
    const m = mounted({ photo: OLD });
    const b = changeBtn(m.root);
    expect(b).not.toBeNull();
    expect(b.textContent).toBe('החלפת תמונה');
    expect(b.getAttribute('style')).toBe(btn(m.root, 'תיקון גיל').getAttribute('style')); // looks like its neighbours
    expect(picker(m.root).accept).toBe('image/*');
    let opened = 0;
    picker(m.root).click = () => { opened++; };
    b.click();
    expect(opened).toBe(1);
  });

  it('a picked photo replaces the stored one: the old is gone from the save, the new is saved and shown', async () => {
    const read: File[] = [];
    const m = mounted({ photo: OLD, children: 2 }, { readPhoto: async (f: File) => { read.push(f); return NEW; } });
    expect(headerPhoto(m.root)).toBe(OLD);
    const before = m.persisted;
    const file = new File(['x'], 'kid.jpg', { type: 'image/jpeg' });
    pick(m.root, [file]);
    await flush();
    expect(read).toEqual([file]);
    expect(m.app.save.children[0].photo).toBe(NEW);
    expect(JSON.stringify(m.app.save.children[0])).not.toContain(OLD);
    expect(m.persisted).toBe(before + 2); // the second save rolls the old photo out of the recovery copy
    expect(headerPhoto(m.root)).toBe(NEW);
    expect(m.root.querySelector('[data-message]')!.textContent).toBe(PHOTO_CHANGED);
    // only this child's photo changed
    expect(m.app.save.children[1].photo).toBe(OLD);
  });

  it('a child without a photo gets one the same way', async () => {
    const m = mounted({ photo: null }, { readPhoto: async () => NEW });
    expect(headerPhoto(m.root)).toBeUndefined();
    pick(m.root, [new File(['x'], 'kid.jpg', { type: 'image/jpeg' })]);
    await flush();
    expect(m.app.save.children[0].photo).toBe(NEW);
    expect(headerPhoto(m.root)).toBe(NEW);
  });

  it('cancel (the picker closed without a photo) and an unreadable file keep the old photo', async () => {
    const m = mounted({ photo: OLD }, { readPhoto: async () => { throw new Error('decode'); } });
    const before = m.persisted;
    pick(m.root, []);
    await flush();
    expect(m.app.save.children[0].photo).toBe(OLD);
    expect(m.persisted).toBe(before);
    expect(m.root.querySelector('[data-message]')).toBeNull();
    pick(m.root, [new File(['x'], 'broken.jpg', { type: 'image/jpeg' })]);
    await flush();
    expect(m.app.save.children[0].photo).toBe(OLD);
    expect(m.persisted).toBe(before);
    expect(headerPhoto(m.root)).toBe(OLD);
    expect(m.root.querySelector('[data-message]')!.textContent).toBe(PHOTO_NOT_READ);
  });
});
