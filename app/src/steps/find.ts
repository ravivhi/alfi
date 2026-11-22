// "Where is the letter X?": the child picks the named letter out of face cards.
import type { StepContext, StepModule } from './contract.ts';
import { runChoiceRound } from './choice.ts';
import type { ChoiceOption } from './choice.ts';
import { chooseDistractors } from '../engine/distractors.ts';
import type { Pool } from '../engine/distractors.ts';
import { itemId, parseItem } from '../engine/curriculum.ts';
import type { AnswerEvent, StepResult, UnitId } from '../engine/types.ts';
import { captionLine, line } from '../audio/lines.ts';
import { h } from '../util/dom.ts';

export function stepUnit(ctx: StepContext): UnitId {
  return ctx.step.unitId ?? parseItem(ctx.step.items[0]).unit;
}

/** The target and n distractors as letter options, shuffled. */
export function letterOptions(ctx: StepContext, unit: UnitId, mode: 'look' | 'sound', n: number, prefer: Pool[]): ChoiceOption[] {
  const c = ctx.content;
  const ds = chooseDistractors({
    target: unit, n, mode, alphabet: Object.keys(c.alphabet), lookAlikes: c.lookAlikes, sameSound: c.sameSound,
    taught: ctx.taught, confusions: ctx.confusions(unit), prefer, rng: ctx.rng,
  });
  return ctx.rng.shuffle([unit, ...ds]).map((id) => ({ id, label: id, aria: id }));
}

export interface AskOpts { choices: number; prefer: Pool[]; layout: 'row' | 'grid2'; host?: HTMLElement }

/** One "where is letter X" question. */
export function askName(ctx: StepContext, unit: UnitId, o: AskOpts): Promise<AnswerEvent | null> {
  const c = ctx.content;
  const name = (u: UnitId) => c.alphabet[u]?.name ?? u;
  return runChoiceRound(ctx, {
    item: itemId(unit, 'name'),
    options: letterOptions(ctx, unit, 'look', o.choices - 1, o.prefer),
    correct: unit,
    ask: line(c, 'find.ask', { name: name(unit) }),
    caption: captionLine(c, 'find.ask'),
    right: () => line(c, 'find.right', { name: name(unit) }),
    wrong: (id) => line(c, 'find.wrong', { name: name(id) }),
    kind: 'recall',
    layout: o.layout,
    faces: true,
    ...(o.host ? { host: o.host } : {}),
  });
}

export const findStep: StepModule = {
  id: 'find',
  async run(ctx): Promise<StepResult> {
    const t0 = Date.now();
    const unit = stepUnit(ctx);
    const rounds = typeof ctx.step.params?.rounds === 'number' ? ctx.step.params.rounds : ctx.profile.findRounds;
    const root = h('div', { 'data-step': 'find', style: 'display:flex;flex-direction:column;align-items:center;align-self:stretch' });
    ctx.stage.appendChild(root);
    const answers: AnswerEvent[] = [];
    for (let r = 0; r < rounds; r++) {
      root.replaceChildren();
      const a = await askName(ctx, unit, { choices: ctx.profile.findChoices, prefer: ['confusions', 'lookAlikes', 'taught'], layout: 'row', host: root });
      if (a === null) return { outcome: 'aborted', answers: [], slips: 0, ms: Date.now() - t0 };
      answers.push(a);
      ctx.progress((r + 1) / rounds);
    }
    return { outcome: 'done', answers, slips: 0, ms: Date.now() - t0 };
  },
};
