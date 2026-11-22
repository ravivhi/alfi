import { h } from '../../util/dom.ts';
import { newChild } from '../../store/schema.ts';
import type { ChildRecord } from '../../store/schema.ts';
import { dayKey } from '../../util/day.ts';
import { readPhoto } from '../../platform/photo.ts';
import { avatar } from '../avatar.ts';

export type SetupCheck = { ok: true; name: string } | { ok: false; field: 'name' | 'age' };

export function validateSetup(name: string, years: number | null): SetupCheck {
  const n = name.trim().replace(/\s+/g, ' ');
  const len = [...n].length;
  if (len < 1 || len > 16) return { ok: false, field: 'name' };
  if (years === null || !Number.isInteger(years) || years < 3 || years > 8) return { ok: false, field: 'age' };
  return { ok: true, name: n };
}

export interface SetupDeps {
  onDone(child: ChildRecord): void;
  voiceStatus?: () => 'clips' | 'live' | 'none';
  /** Resolves when the audio has finished loading; the no-voice notice is not shown before that. */
  ready?: Promise<void>;
  /** Subscribes to status changes (late voice, index loaded). */
  onStatusChange?: (cb: () => void) => (() => void) | void;
  today?: string;
  id?: string;
}

const NO_VOICE = 'לא נמצא קול עברי במכשיר - הילד/ה לא ישמעו את ההנחיות';

export function mountSetup(root: HTMLElement, deps: SetupDeps): void {
  let name = '';
  let years: number | null = null;
  let photo: string | null = null;

  const photoBox = h('div', { style: 'width:156px;height:156px;display:flex;align-items:center;justify-content:center' });
  const camera = () => h('div', { style: 'width:156px;height:156px;border-radius:50%;background:#FFFFFF;border:4px dashed #1E4FBF;box-sizing:border-box;display:flex;align-items:center;justify-content:center' });
  const cameraIcon = '<svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#1D2742" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h3l2-3h8l2 3h3v11H3z"></path><circle cx="12" cy="13" r="4"></circle></svg>';
  const drawPhoto = () => {
    photoBox.textContent = '';
    if (photo) photoBox.appendChild(avatar({ name, photo }, 156));
    else { const c = camera(); c.innerHTML = cameraIcon; photoBox.appendChild(c); }
  };
  drawPhoto();

  const file = h('input', { type: 'file', accept: 'image/*', style: 'display:none', 'aria-label': 'תמונה' }) as HTMLInputElement;
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (!f) return;
    readPhoto(f).then(p => { photo = p; drawPhoto(); }, () => { photo = null; drawPhoto(); });
  });
  const photoBtn = h('button', {
    type: 'button',
    style: 'min-height:48px;padding:0 22px;border-radius:24px;border:0;background:#FFFFFF;color:#1D2742;font:500 17px Rubik,sans-serif;box-shadow:0 2px 0 #C9DAEE',
    onClick: () => file.click(),
  }, 'צלמו את הילד/ה');

  const nameInput = h('input', {
    id: 'kidName', type: 'text', autocomplete: 'off',
    style: 'height:54px;border-radius:14px;border:2px solid #B9CDE6;padding:0 16px;font:500 20px Rubik,sans-serif;color:#1D2742;background:#FFFFFF;direction:rtl',
  }) as HTMLInputElement;
  const hint = h('span', { style: 'font-size:13px;color:#4A5878;min-height:16px' });

  const ageButtons = [3, 4, 5, 6, 7, 8].map(n => h('button', {
    type: 'button', 'aria-label': `גיל ${n}`, 'aria-pressed': 'false',
    onClick: () => { years = n; refresh(); },
  }, String(n)));

  const start = h('button', {
    type: 'button',
    style: 'min-height:64px;border-radius:32px;border:0;font:700 22px Rubik,sans-serif;box-shadow:0 4px 0 #163C91',
    onClick: () => {
      const v = validateSetup(name, years);
      if (!v.ok || years === null) return;
      deps.onDone(newChild(v.name, years, photo, deps.today ?? dayKey(new Date()), deps.id ?? 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)));
    },
  }, 'בואו נתחיל') as HTMLButtonElement;

  function refresh() {
    ageButtons.forEach((b, i) => {
      const on = years === i + 3;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('style', `min-height:52px;min-width:44px;border-radius:14px;border:2px solid ${on ? '#1E4FBF' : '#B9CDE6'};background:${on ? '#1E4FBF' : '#FFFFFF'};color:${on ? '#FFFFFF' : '#1D2742'};font:700 22px Rubik,sans-serif`);
    });
    const v = validateSetup(name, years);
    const tooLong = [...name.trim()].length > 16;
    hint.textContent = tooLong ? 'עד 16 תווים' : '';
    start.disabled = !v.ok;
    start.style.background = v.ok ? '#1E4FBF' : '#7C93C4';
    start.style.color = '#FFFFFF';
    start.style.opacity = v.ok ? '1' : '0.75';
    if (!photo) drawPhoto();
  }
  nameInput.addEventListener('input', () => { name = nameInput.value; refresh(); });

  const noticeBox = h('div');
  let loaded = !deps.ready;
  const updateNotice = () => {
    const show = loaded && !!deps.voiceStatus && deps.voiceStatus() === 'none';
    noticeBox.textContent = '';
    if (show) noticeBox.appendChild(h('p', { role: 'alert', style: 'margin:0;padding:10px 14px;border-radius:12px;background:#FFF4F4;color:#A12A2A;font-size:15px;font-weight:500' }, NO_VOICE));
  };
  updateNotice();
  if (deps.ready) deps.ready.then(() => { loaded = true; updateNotice(); }, () => { loaded = true; updateNotice(); });
  deps.onStatusChange?.(updateNotice);

  root.appendChild(h('div', { 'data-screen': 'setup', style: 'box-sizing:border-box;min-height:100vh;min-height:100dvh;padding:40px 28px 32px;display:flex;flex-direction:column;gap:26px;background:#EAF5FF;color:#1D2742;direction:rtl;max-width:560px;margin:0 auto' },
    h('div', { style: 'display:flex;flex-direction:column;gap:6px' },
      h('p', { style: 'margin:0;font-size:15px;font-weight:500;color:#4A5878' }, 'הגדרה חד-פעמית להורה'),
      h('h1', { style: 'margin:0;font-size:30px;font-weight:800' }, 'מי הולך ללמוד?')),
    h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:12px' },
      photoBox, photoBtn, file,
      h('p', { style: 'margin:0;font-size:13px;color:#4A5878' }, 'התמונה נשמרת רק בטלפון הזה')),
    h('div', { style: 'display:flex;flex-direction:column;gap:8px' },
      h('label', { for: 'kidName', style: 'font-size:17px;font-weight:500' }, 'שם'), nameInput, hint),
    h('div', { style: 'display:flex;flex-direction:column;gap:10px' },
      h('span', { style: 'font-size:17px;font-weight:500' }, 'גיל'),
      h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(44px,1fr));gap:8px' }, ...ageButtons)),
    h('div', { style: 'flex-grow:1' }),
    noticeBox,
    start,
  ));
  refresh();
}
