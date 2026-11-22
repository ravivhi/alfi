// The parent page (Parent.dc.html): progress, what is being practised, time played, settings, backup and data actions.
// Reached only through the gate.
import { h } from '../../util/dom.ts';
import type { LettersContent } from '../../content/schema.ts';
import type { AudioApi } from '../../audio/audio.ts';
import type { Sfx } from '../../audio/sfx.ts';
import type { Music } from '../../audio/music.ts';
import { BREAK_EVERY_OPTIONS, BREAK_LENGTH_OPTIONS } from '../../store/schema.ts';
import type { ChildRecord, SaveData } from '../../store/schema.ts';
import { applyImport, exportChild, parseImport } from '../../store/exportImport.ts';
import type { ImportResult } from '../../store/exportImport.ts';
import { exportFile as defaultExportFile } from '../../platform/native.ts';
import type { ExportStart } from '../../platform/native.ts';
import { readPhoto as defaultReadPhoto } from '../../platform/photo.ts';
import { emptyProgress } from '../../engine/planner.ts';
import { expandPath } from '../../engine/curriculum.ts';
import { ageNow, bandForAge } from '../../engine/age.ts';
import { toggleFocus } from '../../engine/progress.ts';
import type { LetterLevel } from '../../engine/mastery.ts';
import { CURRICULUM, plannerInputFor } from '../runner.ts';
import { nodeStates } from './map.ts';
import { avatar } from '../avatar.ts';
import { HOLD_MS, longPress } from '../gate.ts';
import { versionLabel } from '../versionLabel.ts';
import { LEVEL_WORD, cardLines, checkpointLine, letterCard, letterGrid, lastCheckpointLine, playMinutes, shortDay, weakLines } from '../parentText.ts';

export const NO_VOICE_BANNER = 'לא נמצא קול עברי במכשיר. אפשר להתקין קול בעברית ב: הגדרות > נגישות > המרת טקסט לדיבור';
export const STORAGE_BANNER = 'השמירה נכשלה - כדאי לגבות לקובץ';
export const EXPORT_CHOOSE = 'בחרו איפה לשמור את קובץ הגיבוי';
export const EXPORT_SAVED = 'קובץ הגיבוי נשמר';
export const EXPORT_NOT_SAVED = 'קובץ הגיבוי לא נשמר';
export const EXPORT_FAILED = 'שמירת הקובץ נכשלה';
export const PHOTO_CHANGED = 'התמונה הוחלפה';
export const PHOTO_NOT_READ = 'התמונה לא נקראה - התמונה הקודמת נשארה';

export interface ParentApp {
  save: SaveData;
  childId: string | null;
  storageWarning: boolean;
  persist(): boolean;
  audio: Pick<AudioApi, 'setVoiceVolume' | 'status' | 'onStatusChange'>;
  sfx: Pick<Sfx, 'setVolume' | 'setEnabled'>;
  music: Pick<Music, 'setEnabled'>;
}

export interface ParentDeps {
  app: ParentApp;
  childId: string;
  content: LettersContent;
  today: string;
  /** Resolves when the audio has finished loading; the no-voice banner is not shown before that. */
  ready?: Promise<void>;
  onClose(): void;
  onAddChild(): void;
  /** After a delete: the child no longer exists. */
  onChildGone(): void;
  /** After a restore from file: the child now in the save. */
  onImported(id: string): void;
  /** true / false: the file was saved / failed at once; 'choosing': the APK opened a save window, onDone tells later. */
  exportFile?: (name: string, text: string, onDone?: (ok: boolean) => void) => ExportStart;
  readFile?: (f: File) => Promise<string>;
  /** A picked image as the stored photo (setup's square JPEG data URL); rejects when it cannot be read. */
  readPhoto?: (f: File) => Promise<string>;
  /** True while a break is running (boot.ts reads the break clock); without it the skip button stays hidden. */
  breakActive?: () => boolean;
  onSkipBreak?: () => void;
  /** "Practise this letter now" on a letter card: the parent page closes and a sitting on that letter runs. */
  onStartLetter?: (unit: string) => void;
}

// Darkest (known) to lightest (not yet): the levels differ in lightness too, not only in hue.
const COLORS: Record<LetterLevel, string> = { known: '#2E9E5B', practising: '#F0901A', met: '#A9C9F0', notYet: '#E3E8F1' };
const LEVELS: LetterLevel[] = ['known', 'practising', 'met', 'notYet'];
// #12306F stays at least 3:1 on every level colour a marked letter can have (the orange one is 5.2:1)
const FLAG = (size: number) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="#12306F" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M5 22V3h12l-2.5 4.5L17 12H7v10z"></path></svg>`;
const CARD = 'background:#FFFFFF;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px';
const BTN = 'min-height:44px;border-radius:12px;border:1px solid #B9CDE6;background:#F4F6FA;font:500 14px Rubik,sans-serif;color:#1D2742;padding:0 10px';
const DANGER = 'min-height:44px;border-radius:12px;border:1px solid #E7B3B3;background:#FFF4F4;font:500 14px Rubik,sans-serif;color:#A12A2A;padding:0 10px';
const SELECT = 'min-height:44px;border-radius:10px;border:1px solid #B9CDE6;font:500 15px Rubik,sans-serif;padding:0 8px;background:#FFFFFF;color:#1D2742';
const ROW = 'display:flex;align-items:center;justify-content:space-between;gap:12px';
const H2 = 'margin:0;font-size:16px;font-weight:700';

const importError = (r: Extract<ImportResult, { ok: false }>): string =>
  r.reason === 'version' ? 'הקובץ נוצר בגרסה חדשה יותר של האפליקציה' : r.reason === 'json' ? 'הקובץ לא נקרא - לא קובץ גיבוי' : 'הקובץ אינו גיבוי תקין של האפליקציה';

export function mountParent(root: HTMLElement, d: ParentDeps): () => void {
  const app = d.app;
  const exportFile = d.exportFile ?? defaultExportFile;
  const readFile = d.readFile ?? ((f: File) => f.text());
  const readPhoto = d.readPhoto ?? defaultReadPhoto;
  const getChild = (): ChildRecord | undefined => app.save.children.find(c => c.id === d.childId);

  let includePhoto = false;
  let selected: string | null = null; // the letter whose card is open
  let fullAsk: string | null = null; // a 4th mark waits for the parent to remove one
  let panel: 'none' | 'age' | 'reset' | 'delete' = 'none';
  let message = '';
  let pendingImport: ChildRecord | null = null;
  let loaded = !d.ready;
  const holds: (() => void)[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  const screen = h('div', { 'data-screen': 'parent', style: 'box-sizing:border-box;min-height:100vh;min-height:100dvh;padding:22px 20px;display:flex;flex-direction:column;gap:16px;background:#F4F6FA;font-family:Rubik,sans-serif;color:#1D2742;direction:rtl;max-width:560px;margin:0 auto' });
  const bannerBox = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:16px' });
  screen.append(bannerBox, body, versionLabel('align-self:center'));
  root.appendChild(screen);

  const save = () => { app.persist(); updateBanners(); };

  function banner(text: string): HTMLElement {
    return h('p', { role: 'alert', style: 'margin:0;padding:10px 14px;border-radius:12px;background:#FFF4F4;color:#A12A2A;font-size:15px;font-weight:500' }, text);
  }
  function updateBanners() {
    bannerBox.textContent = '';
    if (app.storageWarning) bannerBox.appendChild(banner(STORAGE_BANNER));
    if (loaded && app.audio.status() === 'none') bannerBox.appendChild(banner(NO_VOICE_BANNER));
  }

  // A button that acts only after a 3 s hold (the second confirmation of a destructive action).
  function holdButton(label: string, fn: () => void): HTMLElement {
    const b = h('button', { type: 'button', 'data-hold-confirm': '1', style: DANGER + ';touch-action:none;user-select:none' }, label);
    b.addEventListener('contextmenu', e => e.preventDefault());
    holds.push(longPress(b, HOLD_MS, fn));
    return b;
  }
  function slider(id: string, label: string, value: number, apply: (v: number) => void): HTMLElement {
    const input = h('input', { id, type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(value * 100)), style: 'width:160px;min-height:44px' }) as HTMLInputElement;
    input.addEventListener('input', () => apply(Number(input.value) / 100));
    input.addEventListener('change', () => { apply(Number(input.value) / 100); save(); });
    return h('div', { style: ROW }, h('label', { for: id, style: 'font-size:15px' }, label), input);
  }
  // An on / off switch (a 44px checkbox row); applied and saved at once.
  function toggle(id: string, label: string, on: boolean, apply: (v: boolean) => void): HTMLElement {
    const box = h('input', { id, type: 'checkbox', role: 'switch', style: 'width:44px;height:44px;margin:0' }) as HTMLInputElement;
    box.checked = on;
    box.addEventListener('change', () => { apply(box.checked); save(); });
    return h('div', { style: ROW + ';min-height:44px' }, h('label', { for: id, style: 'font-size:15px;flex-grow:1;min-height:44px;display:flex;align-items:center' }, label), box);
  }
  function select(id: string, label: string, options: number[], value: number, apply: (v: number) => void): HTMLElement {
    const s = h('select', { id, style: SELECT }, ...options.map(o => h('option', { value: String(o) }, `${o} דקות`))) as HTMLSelectElement;
    // a stored value outside the options shows the nearest one (the stored value is kept until changed)
    s.value = String(options.reduce((best, o) => (Math.abs(o - value) < Math.abs(best - value) ? o : best), options[0]));
    s.addEventListener('change', () => { apply(Number(s.value)); save(); });
    return h('div', { style: ROW }, h('label', { for: id, style: 'font-size:15px' }, label), s);
  }

  function render() {
    holds.splice(0).forEach(f => f());
    body.textContent = '';
    updateBanners();
    const child = getChild();
    if (!child) return;
    const c = d.content;

    // header
    const path = expandPath(CURRICULUM, bandForAge(ageNow(child.age, d.today)));
    const states = nodeStates(path, child.progress);
    const next = path[states.indexOf('next')];
    const where = !next ? 'המסלול הושלם' : next.type === 'unit' ? `בדרך לאות ${c.letters[next.unitId as string]?.glyph ?? next.unitId}` : 'בדרך לנקודת בדיקה';
    const pm = playMinutes(child, d.today);
    const header = h('div', { style: 'display:flex;align-items:center;gap:12px' },
      avatar(child, 52),
      h('div', { style: 'display:flex;flex-direction:column;gap:2px;flex-grow:1' },
        h('h1', { style: 'margin:0;font-size:22px;font-weight:800' }, `${child.name}, גיל ${ageNow(child.age, d.today)}`),
        h('span', { style: 'font-size:14px;color:#4A5878' }, `${where} · ${pm.today} דקות היום`)),
      h('button', { type: 'button', 'aria-label': 'סגירה', 'data-parent': 'close', style: 'width:44px;height:44px;border-radius:50%;border:0;background:#FFFFFF;color:#1D2742;font:700 20px Rubik,sans-serif', onClick: d.onClose }, '×'));

    // letters: four levels, a flag on marked letters; a tap opens the letter card
    const grid = letterGrid(child, c, CURRICULUM, d.today);
    const cells = grid.map(g => {
      const b = h('button', {
        type: 'button', 'data-letter': g.ch, 'data-status': g.status, 'aria-expanded': String(selected === g.ch),
        'aria-label': `${g.ch} - ${LEVEL_WORD[g.status]}${g.focus ? ' - תרגול נוסף' : ''}`,
        style: `position:relative;height:44px;min-width:0;padding:0;border-radius:9px;border:${selected === g.ch ? '3px solid #1E4FBF' : '0'};display:flex;align-items:center;justify-content:center;font:700 19px Rubik,sans-serif;background:${COLORS[g.status]};color:${g.status === 'known' ? '#FFFFFF' : '#1D2742'}`,
        onClick: () => { selected = selected === g.ch ? null : g.ch; fullAsk = null; render(); },
      }, g.ch);
      if (g.focus) {
        const f = h('span', { 'data-flag': '1', 'aria-hidden': 'true', style: 'position:absolute;top:2px;left:2px;width:14px;height:14px;display:flex' });
        f.innerHTML = FLAG(14);
        b.appendChild(f);
      }
      return b;
    });
    const legend = (k: LetterLevel) => h('span', { 'data-legend': k, style: 'display:flex;align-items:center;gap:5px' }, h('span', { style: `width:12px;height:12px;border-radius:4px;background:${COLORS[k]}` }), LEVEL_WORD[k]);
    const flagKey = h('span', { style: 'display:flex;align-items:center;gap:5px' });
    flagKey.innerHTML = FLAG(14);
    flagKey.append('תרגול נוסף');
    const letters = h('section', { style: CARD },
      h('h2', { style: H2 }, 'האותיות'),
      // 8 columns where they fit; on a narrow phone fewer, so every letter stays a 44px target
      h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(max(44px,calc((100% - 42px) / 8)),1fr));gap:6px;direction:rtl' }, ...cells),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:#4A5878' }, ...LEVELS.map(legend), flagKey),
      selected ? letterCardBox(child, selected) : null);

    // practising now
    const last = lastCheckpointLine(child, c);
    const hist = child.checkpoints.slice().reverse().slice(0, 5);
    const practising = h('section', { style: CARD.replace('gap:10px', 'gap:8px') },
      h('h2', { style: H2 }, 'מתרגלים עכשיו'),
      ...weakLines(child, c).map(t => h('p', { 'data-weak': '1', style: 'margin:0;font-size:15px' }, t)),
      last ? h('p', { style: 'margin:0;font-size:13px;color:#4A5878' }, last) : null,
      hist.length > 1 ? h('ul', { 'data-checkpoints': '1', style: 'margin:0;padding:0 18px 0 0;font-size:13px;color:#4A5878' }, ...hist.map(cp => h('li', {}, h('bdi', {}, shortDay(cp.day)), `: ${checkpointLine(cp, c)}`))) : null);

    // time played
    const time = h('section', { style: CARD },
      h('h2', { style: H2 }, 'זמן משחק'),
      h('p', { style: 'margin:0;font-size:15px' }, `היום: ${pm.today} דקות`),
      h('ul', { 'data-last7': '1', style: 'margin:0;padding:0 18px 0 0;font-size:13px;color:#4A5878' }, ...pm.last7.slice().reverse().map(x => h('li', {}, h('bdi', {}, shortDay(x.day)), `: ${x.min} דקות`))));

    // settings
    const s = app.save.settings;
    const skip = d.breakActive?.() ? h('button', { type: 'button', 'data-skip-break': '1', style: BTN, onClick: () => { d.onSkipBreak?.(); render(); } }, 'דילוג על ההפסקה הנוכחית') : null;
    const settings = h('section', { style: CARD.replace('gap:10px', 'gap:12px') },
      h('h2', { style: H2 }, 'הגדרות'),
      slider('v1', 'קול המדריך', s.voiceVolume, v => { s.voiceVolume = v; app.audio.setVoiceVolume(v); }),
      slider('v2', 'עוצמת צלילים ומוזיקה', s.effectsVolume, v => { s.effectsVolume = v; app.sfx.setVolume(v); }),
      toggle('music', 'מוזיקה במשחקים', s.musicOn !== false, v => { s.musicOn = v; app.music.setEnabled(v); }),
      toggle('sfx', 'צלילי משחק', s.sfxOn !== false, v => { s.sfxOn = v; app.sfx.setEnabled(v); }),
      h('h3', { style: 'margin:4px 0 0;font-size:15px;font-weight:700' }, 'הפסקות'),
      select('brk1', 'הפסקה כל', BREAK_EVERY_OPTIONS, s.breakEveryMin, v => { s.breakEveryMin = v; }),
      select('brk2', 'אורך ההפסקה', BREAK_LENGTH_OPTIONS, s.breakLengthMin, v => { s.breakLengthMin = v; }),
      skip);

    // backup and data
    const photoBox = h('input', { id: 'incphoto', type: 'checkbox', style: 'width:24px;height:24px' }) as HTMLInputElement;
    photoBox.checked = includePhoto;
    photoBox.addEventListener('change', () => { includePhoto = photoBox.checked; });
    const fileIn = h('input', { type: 'file', accept: '.json,application/json', 'data-restore-file': '1', style: 'display:none' }) as HTMLInputElement;
    fileIn.addEventListener('change', () => {
      const f = fileIn.files?.[0];
      if (!f) return;
      void readFile(f).then(text => {
        const r = parseImport(text);
        if (r.ok) { pendingImport = r.child; message = ''; } else { pendingImport = null; message = importError(r); }
        render();
      }, () => { pendingImport = null; message = 'הקובץ לא נקרא'; render(); });
    });
    // owner 2026-11-22 (preview 0.7): "allow changing the picture of a player. remove the old add the new". The same
    // picker as setup: an image file input (the APK answers it with its own chooser). A read photo replaces the
    // stored one in the child's record and in storage; a closed picker or an unreadable file keeps the old one.
    const photoIn = h('input', { type: 'file', accept: 'image/*', 'data-photo-file': '1', 'aria-label': 'תמונה', style: 'display:none' }) as HTMLInputElement;
    photoIn.addEventListener('change', () => {
      const f = photoIn.files?.[0];
      photoIn.value = '';
      if (!f) return;
      readPhoto(f).then(photo => {
        const ch = getChild();
        if (disposed || !ch) return;
        ch.photo = photo;
        message = PHOTO_CHANGED;
        // the save keeps the save before it as a recovery copy (save.ts KEYS.prev); a second save rolls the old
        // photo out of that copy too, so it is gone from storage
        if (app.persist()) app.persist();
        render();
      }, () => {
        if (disposed) return;
        message = PHOTO_NOT_READ;
        render();
      });
    });
    const status = message ? h('p', { role: 'status', 'data-message': '1', style: 'margin:0;font-size:14px' }, message) : null;

    let confirmBox: HTMLElement | null = null;
    if (pendingImport) {
      const pi = pendingImport;
      const exists = app.save.children.some(x => x.id === pi.id);
      confirmBox = h('div', { 'data-import-confirm': '1', style: 'display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:12px;background:#F4F6FA' },
        h('p', { style: 'margin:0;font-size:15px' }, `לשחזר את ${pi.name}?${exists ? ' הנתונים הקיימים של הילד/ה יוחלפו.' : ''}`),
        h('div', { style: 'display:flex;gap:8px' },
          h('button', { type: 'button', 'data-import-yes': '1', style: BTN, onClick: () => {
            const r = applyImport(app.save, pi);
            app.save = r.data;
            pendingImport = null;
            save();
            d.onImported(pi.id);
          } }, 'לשחזר'),
          h('button', { type: 'button', 'data-import-no': '1', style: BTN, onClick: () => { pendingImport = null; render(); } }, 'ביטול')));
    }

    let ageBox: HTMLElement | null = null;
    if (panel === 'age') {
      ageBox = h('div', { 'data-age-panel': '1', style: 'display:flex;gap:8px;flex-wrap:wrap' }, ...[3, 4, 5, 6, 7, 8].map(n =>
        h('button', { type: 'button', 'aria-label': `גיל ${n}`, style: `${BTN};min-width:44px;font-weight:700;font-size:18px`, onClick: () => {
          child.age = { years: n, setOn: d.today };
          panel = 'none';
          save();
          render();
        } }, String(n))));
    }

    const confirmPanel = (kind: 'reset' | 'delete', text: string, label: string, fn: () => void): HTMLElement =>
      h('div', { 'data-confirm': kind, style: 'display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:12px;background:#FFF4F4' },
        h('p', { style: 'margin:0;font-size:15px' }, text),
        holdButton(label, fn),
        h('button', { type: 'button', style: BTN, onClick: () => { panel = 'none'; render(); } }, 'ביטול'));

    const data = h('section', { style: CARD.replace('gap:10px', 'gap:12px') },
      h('h2', { style: H2 }, 'גיבוי ונתונים'),
      h('div', { style: ROW + ';min-height:44px' }, h('label', { for: 'incphoto', style: 'font-size:15px;flex-grow:1;min-height:44px;display:flex;align-items:center' }, 'לכלול תמונה בגיבוי'), photoBox),
      h('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px' },
        h('button', { type: 'button', style: BTN, onClick: () => {
          const out = exportChild(child, includePhoto, d.today);
          const started = exportFile(out.name, out.text, ok => {
            if (disposed) return;
            message = ok ? EXPORT_SAVED : EXPORT_NOT_SAVED;
            render();
          });
          message = started === 'choosing' ? EXPORT_CHOOSE : started ? EXPORT_SAVED : EXPORT_FAILED;
          render();
        } }, 'גיבוי לקובץ'),
        h('button', { type: 'button', style: BTN, onClick: () => fileIn.click() }, 'שחזור מקובץ'),
        h('button', { type: 'button', style: BTN, onClick: () => { panel = panel === 'age' ? 'none' : 'age'; render(); } }, 'תיקון גיל'),
        h('button', { type: 'button', 'data-change-photo': '1', style: BTN, onClick: () => photoIn.click() }, 'החלפת תמונה'),
        h('button', { type: 'button', style: BTN, onClick: d.onAddChild }, 'הוספת ילד'),
        h('button', { type: 'button', style: DANGER, onClick: () => { panel = 'reset'; render(); } }, 'איפוס התקדמות'),
        h('button', { type: 'button', style: DANGER, onClick: () => { panel = 'delete'; render(); } }, 'מחיקת ילד')),
      fileIn, photoIn, status, confirmBox, ageBox,
      panel === 'reset' ? confirmPanel('reset', `לאפס את ההתקדמות של ${child.name}? האותיות והמדבקות יחזרו להתחלה.`, 'החזיקו 3 שניות לאיפוס', () => {
        child.progress = emptyProgress();
        child.mastery = {};
        child.checkpoints = [];
        panel = 'none';
        message = 'ההתקדמות אופסה';
        save();
        render();
      }) : null,
      panel === 'delete' ? confirmPanel('delete', `למחוק את ${child.name} לגמרי? אי אפשר לבטל.`, 'החזיקו 3 שניות למחיקה', () => {
        app.save.children = app.save.children.filter(x => x.id !== child.id);
        if (app.save.settings.lastChildId === child.id) app.save.settings.lastChildId = null;
        if (app.childId === child.id) app.childId = null;
        save();
        d.onChildGone();
      }) : null);

    body.append(header, letters, practising, time, settings, data);
  }

  // The mark toggles; a 4th mark asks which one to remove first.
  function toggleMark(unit: string) {
    const child = getChild();
    if (!child) return;
    const r = toggleFocus(plannerInputFor(child, d.today, 0), unit);
    if (r.result === 'notMet') return;
    if (r.result === 'full') { fullAsk = unit; render(); return; }
    child.progress = r.progress;
    fullAsk = null;
    save();
    render();
  }
  function replaceMark(old: string, unit: string) {
    const child = getChild();
    if (!child) return;
    child.progress = toggleFocus(plannerInputFor(child, d.today, 0), old).progress;
    child.progress = toggleFocus(plannerInputFor(child, d.today, 0), unit).progress;
    fullAsk = null;
    save();
    render();
  }

  // The letter card: level, days with correct recall, first-answer success, confusions, last practised; "practise
  // more" (met letters only, at most 3) and "practise now" (any letter of the path).
  function letterCardBox(child: ChildRecord, ch: string): HTMLElement {
    const c = d.content;
    const lc = letterCard(child, ch, c, CURRICULUM, d.today);
    const glyph = (u: string) => c.letters[u]?.glyph ?? u;
    const note = (t: string) => h('p', { style: 'margin:0;font-size:13px;color:#4A5878' }, t);
    const ask = fullAsk === ch ? h('div', { 'data-focus-full': '1', role: 'alert', style: 'display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:12px;background:#F4F6FA' },
      h('p', { style: 'margin:0;font-size:15px' }, `אפשר לסמן עד 3 אותיות לתרגול נוסף. איזה סימון להסיר במקום ${glyph(ch)}?`),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        ...lc.marks.map(u => h('button', { type: 'button', 'data-focus-replace': u, style: BTN, onClick: () => replaceMark(u, ch) }, `להסיר את ${glyph(u)}`)),
        h('button', { type: 'button', style: BTN, onClick: () => { fullAsk = null; render(); } }, 'ביטול'))) : null;
    return h('div', { 'data-letter-card': ch, style: 'display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;background:#F4F6FA' },
      h('h3', { style: 'margin:0;font-size:16px;font-weight:700' }, `האות ${glyph(ch)} - ${LEVEL_WORD[lc.status]}`),
      ...cardLines(lc, c).map(t => h('p', { style: 'margin:0;font-size:15px' }, t)),
      !lc.inPath ? note('האות עוד לא במסלול') : !lc.canMark ? note('סימון לתרגול נוסף אפשרי אחרי שהאות הוצגה') : null,
      h('div', { style: 'display:flex;flex-direction:column;gap:8px' },
        h('button', {
          type: 'button', 'data-focus-toggle': '1', 'aria-pressed': String(lc.focus), disabled: !lc.canMark,
          style: BTN + (lc.focus ? ';background:#E3ECFB;border-color:#1E4FBF;font-weight:700' : '') + (lc.canMark ? '' : ';opacity:.55'),
          onClick: () => { if (lc.canMark) toggleMark(ch); },
        }, 'תרגול נוסף לאות הזו'),
        h('button', {
          type: 'button', 'data-start-letter': '1', disabled: !lc.inPath,
          style: BTN + (lc.inPath ? '' : ';opacity:.55'),
          onClick: () => { if (lc.inPath) d.onStartLetter?.(ch); },
        }, 'בואו נתרגל את האות הזו עכשיו')),
      ask);
  }

  render();
  const off = app.audio.onStatusChange(updateBanners);
  if (d.ready) d.ready.then(() => { loaded = true; updateBanners(); }, () => { loaded = true; updateBanners(); });
  if (d.breakActive) {
    // the skip button follows the break clock
    let shown = d.breakActive();
    timer = setInterval(() => { const now = d.breakActive!(); if (now !== shown) { shown = now; render(); } }, 1000);
  }
  return () => {
    disposed = true;
    holds.splice(0).forEach(f => f());
    if (timer !== undefined) clearInterval(timer);
    off();
  };
}
