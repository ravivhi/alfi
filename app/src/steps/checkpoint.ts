// Check-point: a mix of name and sound questions over the items the planner picked; every first try is evidence.
import type { StepModule } from './contract.ts';
import { askName } from './find.ts';
import { askSound } from './soundPick.ts';
import { parseItem } from '../engine/curriculum.ts';
import type { Pool } from '../engine/distractors.ts';
import type { AnswerEvent, StepResult } from '../engine/types.ts';
import { h } from '../util/dom.ts';

const FLAG = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#E8641B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"></path><path d="M5 4h11l-2 4 2 4H5"></path></svg>';
const DONE = '#2E9E5B';
const NOW = '#E8641B';
const LATER = '#F0D2BF';
const PREFER: Pool[] = ['confusions', 'taught', 'lookAlikes'];

export const checkpointStep: StepModule = {
  id: 'checkpoint',
  async run(ctx): Promise<StepResult> {
    const t0 = Date.now();
    const items = ctx.step.items;
    const flag = h('span', { 'aria-hidden': 'true', style: 'display:flex' });
    flag.innerHTML = FLAG;
    const dots = items.map(() => h('span', { style: `width:14px;height:14px;border-radius:50%;background:${LATER}` }));
    const dotsEl = h('div', { role: 'img', style: 'display:flex;gap:6px' }, ...dots);
    const body = h('div', { style: 'display:flex;flex-direction:column;align-items:center;align-self:stretch' });
    ctx.stage.appendChild(h('div', { 'data-step': 'checkpoint', style: 'display:flex;flex-direction:column;align-items:center;gap:20px;align-self:stretch' },
      h('div', { style: 'display:flex;align-items:center;justify-content:center;gap:10px' }, flag, h('span', { style: 'font-size:22px;font-weight:800' }, 'נקודת בדיקה'), dotsEl),
      body));

    const answers: AnswerEvent[] = [];
    for (let i = 0; i < items.length; i++) {
      dotsEl.setAttribute('aria-label', `שאלה ${i + 1} מתוך ${items.length}`);
      dots.forEach((d, k) => { d.style.background = k < i ? DONE : k === i ? NOW : LATER; });
      body.replaceChildren();
      const { unit, kind } = parseItem(items[i]);
      const o = { choices: ctx.profile.checkpointChoices, prefer: PREFER, layout: 'grid2' as const, host: body };
      const a = kind === 'sound' ? await askSound(ctx, unit, o) : await askName(ctx, unit, o);
      if (a === null) return { outcome: 'aborted', answers: [], slips: 0, ms: Date.now() - t0 };
      answers.push(a);
      ctx.progress((i + 1) / items.length);
    }
    dots.forEach((d) => { d.style.background = DONE; });
    return { outcome: 'done', answers, slips: 0, ms: Date.now() - t0 };
  },
};
