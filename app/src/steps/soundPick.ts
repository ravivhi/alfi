// "Which letter says this sound?": recall of the sound, options never sound alike.
import type { StepContext, StepModule } from './contract.ts';
import { runChoiceRound } from './choice.ts';
import { letterOptions, stepUnit } from './find.ts';
import type { AskOpts } from './find.ts';
import { itemId } from '../engine/curriculum.ts';
import type { AnswerEvent, StepResult, UnitId } from '../engine/types.ts';
import { SOUND_RATE, captionLine, line } from '../audio/lines.ts';
import { h } from '../util/dom.ts';

/** One "which letter says <sound>" question. The right / wrong lines name the letter, as in find. */
export function askSound(ctx: StepContext, unit: UnitId, o: AskOpts): Promise<AnswerEvent | null> {
  const c = ctx.content;
  const name = (u: UnitId) => c.alphabet[u]?.name ?? u;
  return runChoiceRound(ctx, {
    item: itemId(unit, 'sound'),
    options: letterOptions(ctx, unit, 'sound', o.choices - 1, o.prefer),
    correct: unit,
    ask: line(c, 'soundPick.ask', { sound: c.letters[unit]?.soundSay ?? name(unit) }),
    caption: captionLine(c, 'soundPick.ask'),
    askRate: SOUND_RATE,
    right: () => line(c, 'find.right', { name: name(unit) }),
    wrong: (id) => line(c, 'find.wrong', { name: name(id) }),
    kind: 'recall',
    layout: o.layout,
    faces: true,
    ...(o.host ? { host: o.host } : {}),
  });
}

export const soundPickStep: StepModule = {
  id: 'soundPick',
  async run(ctx): Promise<StepResult> {
    const t0 = Date.now();
    const unit = stepUnit(ctx);
    const rounds = typeof ctx.step.params?.rounds === 'number' ? ctx.step.params.rounds : ctx.profile.soundPickRounds;
    const root = h('div', { 'data-step': 'soundPick', style: 'display:flex;flex-direction:column;align-items:center;align-self:stretch' });
    ctx.stage.appendChild(root);
    const answers: AnswerEvent[] = [];
    for (let r = 0; r < rounds; r++) {
      root.replaceChildren();
      const a = await askSound(ctx, unit, { choices: ctx.profile.soundPickChoices, prefer: ['confusions', 'lookAlikes', 'taught'], layout: 'row', host: root });
      if (a === null) return { outcome: 'aborted', answers: [], slips: 0, ms: Date.now() - t0 };
      answers.push(a);
      ctx.progress((r + 1) / rounds);
    }
    return { outcome: 'done', answers, slips: 0, ms: Date.now() - t0 };
  },
};
