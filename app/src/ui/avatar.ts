import { h } from '../util/dom.ts';
import type { ChildRecord } from '../store/schema.ts';

const COLORS = ['#FFD9A8', '#CFE8D5', '#D6E4FF', '#F6D3E4', '#EADCF8', '#FFF0A8'];

// The child's photo, or a coloured circle with the name's first letter.
export function avatar(c: Pick<ChildRecord, 'name' | 'photo'>, size: number): HTMLElement {
  const base = `width:${size}px;height:${size}px;border-radius:50%;border:6px solid #FFFFFF;box-sizing:border-box;box-shadow:0 4px 0 #C9DAEE;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none;`;
  if (c.photo) {
    return h('div', { style: base }, h('img', { src: c.photo, alt: '', draggable: 'false', style: 'width:100%;height:100%;object-fit:cover;-webkit-user-drag:none;user-select:none;pointer-events:none' }));
  }
  let sum = 0;
  for (const ch of c.name) sum += ch.codePointAt(0) ?? 0;
  const first = [...c.name][0] ?? '';
  return h('div', { 'aria-hidden': 'true', style: `${base}background:${COLORS[sum % COLORS.length]};color:#1D2742;font:800 ${Math.round(size * 0.45)}px Rubik,sans-serif` }, first);
}
