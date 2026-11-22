import { h } from '../util/dom.ts';

export interface LeaveOpts {
  /** The spoken question (content line leave.ask), also shown as the label. */
  ask: string;
  speak(text: string): void;
  onYes(): void;
  onNo(): void;
}

// Overlay with two 96px buttons, check = leave, cross = stay. Returns a function that removes it.
export function showLeaveDialog(host: HTMLElement, o: LeaveOpts): () => void {
  const circle = (key: 'yes' | 'no', label: string, bg: string, svg: string, fn: () => void) => {
    const b = h('button', {
      type: 'button', 'data-leave': key, 'aria-label': label,
      style: `width:96px;height:96px;border-radius:50%;border:0;background:${bg};display:flex;align-items:center;justify-content:center;box-shadow:0 4px 0 rgba(0,0,0,.25)`,
      onClick: fn,
    });
    b.innerHTML = svg;
    return b;
  };
  const check = '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>';
  const cross = '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
  const el = h('div', {
    role: 'dialog', 'aria-label': o.ask, 'data-dialog': 'leave',
    style: 'position:fixed;inset:0;z-index:50;background:rgba(29,39,66,.72);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;direction:rtl',
  },
    h('p', { style: 'margin:0;color:#FFFFFF;font-size:30px;font-weight:800;text-align:center;padding:0 24px' }, o.ask),
    h('div', { style: 'display:flex;gap:40px' },
      circle('yes', 'כן', '#1E7442', check, o.onYes),
      circle('no', 'לא', '#A12A2A', cross, o.onNo)));
  host.appendChild(el);
  o.speak(o.ask);
  return () => el.remove();
}
