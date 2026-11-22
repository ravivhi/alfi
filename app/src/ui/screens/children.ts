import { h } from '../../util/dom.ts';
import type { ChildRecord } from '../../store/schema.ts';
import { avatar } from '../avatar.ts';
import { HOLD_MS, longPress } from '../gate.ts';

export interface ChildrenDeps {
  children: ChildRecord[];
  onPick(id: string): void;
  onAddChild(): void;
  /** Speaks children.who; called once, as soon as audio is allowed (first tap). */
  speak?: () => void;
  /** True when the browser already let audio start (a tap happened before this screen). */
  audioAllowed?: () => boolean;
}

export function mountChildren(root: HTMLElement, deps: ChildrenDeps): () => void {
  let spoken = false;
  const speakOnce = () => { if (spoken) return; spoken = true; deps.speak?.(); };

  const cards = deps.children.map(c => h('button', {
    type: 'button', 'data-child': c.id, 'aria-label': c.name,
    style: 'display:flex;flex-direction:column;align-items:center;gap:10px;background:transparent;border:0;padding:0;color:#1D2742;font-family:Rubik,sans-serif',
    onClick: () => deps.onPick(c.id),
  }, avatar(c, 140), h('span', { style: 'font-size:24px;font-weight:700' }, c.name)));

  const add = h('button', {
    type: 'button', 'aria-label': 'הוספת ילד - להורים בלבד, לחיצה ארוכה',
    style: 'min-height:48px;padding:0 18px;border-radius:24px;border:2px solid #B9CDE6;background:transparent;color:#4A5878;font:500 15px Rubik,sans-serif;display:flex;align-items:center;gap:8px;touch-action:none',
  }, 'הוספת ילד (הורים)');
  const detach = longPress(add, HOLD_MS, deps.onAddChild);

  root.appendChild(h('div', { 'data-screen': 'children', style: 'box-sizing:border-box;min-height:100vh;min-height:100dvh;padding:48px 28px 32px;display:flex;flex-direction:column;align-items:center;gap:36px;background:#EAF5FF;color:#1D2742;direction:rtl;max-width:560px;margin:0 auto' },
    h('h1', { style: 'margin:0;font-size:28px;font-weight:800;text-align:center' }, 'מי משחק עכשיו?'),
    h('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;align-self:stretch;justify-items:center' }, ...cards),
    h('div', { style: 'flex-grow:1' }),
    h('span', { style: 'font-size:13px;color:#4A5878' }, 'לחיצה ארוכה של 3 שניות'),
    add,
  ));

  root.addEventListener('pointerdown', speakOnce, { once: true });
  if (deps.audioAllowed?.()) speakOnce();
  return () => { detach(); root.removeEventListener('pointerdown', speakOnce); };
}
