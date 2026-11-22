// End of the sitting (End.dc.html): night sky, the new sticker, goodbye, and the button back to the map.
import { h } from '../../util/dom.ts';
import { line } from '../../audio/lines.ts';
import type { AudioApi } from '../../audio/audio.ts';
import type { LettersContent } from '../../content/schema.ts';

/** A sticker entry that stands for a passed check-point (drawn as a flag); any other entry is a letter. */
export const END_FLAG = '#flag';

export interface EndDeps {
  childName: string;
  /** The stickers earned and not shown yet: a letter, or END_FLAG. */
  stickers: string[];
  onMap(): void;
  audio: Pick<AudioApi, 'say' | 'stop'>;
  content: LettersContent;
  /** False when the path is complete: map.complete is said instead of end.bye. (Name kept from the once-a-day path.) */
  nextTomorrow?: boolean;
  /** The child's photo or initial avatar, shown beside the spoken goodbye. */
  photo?: Node;
}

const STYLE = '@keyframes alfiPop{0%{transform:scale(.6) rotate(-12deg)}70%{transform:scale(1.08) rotate(4deg)}100%{transform:scale(1) rotate(0)}}'
  + '.alfi-pop{animation:alfiPop .7s ease-out both}'
  + '@media (prefers-reduced-motion: reduce){.alfi-pop{animation:none!important}}';

const STAR = 'M12 1.5l3.1 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.3l-6.4 3.6 1.5-7.1L1.7 8.9l7.2-.8z';
const FLAG = '<path d="M5 21V4" fill="none" stroke="#1E3A7A" stroke-width="2.4" stroke-linecap="round"></path><path d="M5 4h11l-2 4 2 4H5" fill="none" stroke="#1E3A7A" stroke-width="2.4" stroke-linejoin="round"></path>';

function sticker(entry: string, size: number, pop: boolean): HTMLElement {
  const isFlag = entry === END_FLAG;
  const label = isFlag ? 'מדבקה של נקודת בדיקה' : `מדבקה של האות ${entry}`;
  const box = h('div', { class: pop ? 'alfi-pop' : null, role: 'img', 'aria-label': label, style: `position:relative;width:${size}px;height:${size}px;flex:none` });
  box.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" fill="#FFC531" stroke="#FFFFFF" stroke-width=".9" stroke-linejoin="round"></path></svg>`;
  if (isFlag) {
    const s = Math.round(size * 0.36);
    const f = h('div', { 'aria-hidden': 'true', style: `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding-top:${Math.round(size * 0.08)}px` });
    f.innerHTML = `<svg width="${s}" height="${s}" viewBox="0 0 24 24">${FLAG}</svg>`;
    box.appendChild(f);
  } else {
    box.appendChild(h('span', { 'aria-hidden': 'true', style: `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding-top:${Math.round(size * 0.08)}px;font-size:${Math.round(size * 0.33)}px;font-weight:800;color:#1E3A7A` }, entry));
  }
  return box;
}

export function mountEnd(root: HTMLElement, deps: EndDeps): () => void {
  const c = deps.content;
  // a complete path says map.complete; the sticker line only when a sticker was earned
  const bye = deps.nextTomorrow === false ? line(c, 'map.complete') : line(c, 'end.bye');
  const stickerLine = deps.stickers.length ? line(c, 'end.sticker') : null;
  const [first, ...rest] = deps.stickers;

  const sky = h('div', { 'aria-hidden': 'true', style: 'position:absolute;top:0;left:0;right:0;height:120px;pointer-events:none' });
  sky.innerHTML = '<svg width="100%" height="120" viewBox="0 0 390 120" preserveAspectRatio="xMidYMin slice"><circle cx="40" cy="40" r="3" fill="#FFE08A"></circle><circle cx="120" cy="80" r="2" fill="#FFFFFF"></circle><circle cx="300" cy="30" r="3" fill="#FFE08A"></circle><circle cx="350" cy="90" r="2" fill="#FFFFFF"></circle><path d="M330 60a22 22 0 1 0 14 34 18 18 0 1 1-14-34z" fill="#FFE08A"></path></svg>';

  const mapBtn = h('button', {
    type: 'button', 'data-end': 'map',
    style: 'display:flex;align-items:center;justify-content:center;gap:10px;height:64px;padding:0 30px;border-radius:32px;border:0;background:#FFFFFF;color:#1E3A7A;font:700 21px Rubik,sans-serif;box-shadow:0 4px 0 #0F2556',
    onClick: () => deps.onMap(),
  });
  mapBtn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1E3A7A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z"></path><path d="M9 4v13M15 7v13"></path></svg>';
  mapBtn.appendChild(document.createTextNode('למפה'));

  const style = h('style');
  style.textContent = STYLE;

  root.appendChild(h('div', {
    'data-screen': 'end',
    style: 'position:relative;box-sizing:border-box;min-height:100vh;min-height:100dvh;padding:48px 26px 32px;display:flex;flex-direction:column;align-items:center;gap:22px;background:#1E3A7A;color:#FFFFFF;font-family:Rubik,sans-serif;direction:rtl;overflow:hidden',
  },
  style,
  sky,
  h('h1', { style: 'position:relative;margin:0;font-size:32px;font-weight:800;text-align:center' }, `כל הכבוד, ${deps.childName}!`),
  first !== undefined ? sticker(first, 230, true) : null,
  rest.length ? h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center' }, ...rest.map(s => sticker(s, 96, true))) : null,
  stickerLine !== null ? h('p', { style: 'margin:0;font-size:20px;font-weight:500;text-align:center' }, stickerLine) : null,
  h('div', { style: 'display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:20px;background:rgba(255,255,255,.12)' },
    deps.photo ?? null,
    h('span', { 'aria-live': 'polite', style: 'font-size:17px' }, bye)),
  h('div', { style: 'flex-grow:1' }),
  mapBtn,
  ));

  // the name is always its own line (live voice), never joined to a fixed line
  void deps.audio.say(line(c, 'end.great'));
  void deps.audio.say(deps.childName, { queue: true });
  if (stickerLine !== null) void deps.audio.say(stickerLine, { queue: true });
  void deps.audio.say(bye, { queue: true });

  return () => { deps.audio.stop(); };
}
