// "Which word starts with this sound?": the letter and the written words are on screen, so answers count as match.
import type { StepModule } from './contract.ts';
import { runChoiceRound } from './choice.ts';
import { stepUnit } from './find.ts';
import { itemId } from '../engine/curriculum.ts';
import type { AnswerEvent, StepResult } from '../engine/types.ts';
import type { PictureWord } from '../content/schema.ts';
import type { Rng } from '../util/rng.ts';
import { line } from '../audio/lines.ts';
import { h } from '../util/dom.ts';

/** Up to n words whose first letter is not the target, does not share a sound group with it, and shares none with the other picks. */
export function pickFirstSoundOptions(target: string, pool: PictureWord[], n: number, sameSound: string[][], rng: Rng): PictureWord[] {
  const alike = (a: string, b: string): boolean => a === b || sameSound.some((g) => g.includes(a) && g.includes(b));
  const out: PictureWord[] = [];
  for (const w of rng.shuffle(pool)) {
    if (out.length >= n) break;
    if (alike(w.first, target) || out.some((o) => alike(o.first, w.first))) continue;
    out.push(w);
  }
  return out;
}

const wordLabel = (w: PictureWord): Node => h('span', { style: 'display:flex;align-items:center;gap:18px' },
  h('span', { 'aria-hidden': 'true', style: 'font-size:64px;line-height:1' }, w.emoji),
  h('span', { style: 'font-size:30px;font-weight:800' }, w.word));

export const firstSoundStep: StepModule = {
  id: 'firstSound',
  async run(ctx): Promise<StepResult> {
    const t0 = Date.now();
    const c = ctx.content;
    const unit = stepUnit(ctx);
    const letter = c.letters[unit];
    const sound = letter.soundSay;
    const rounds = typeof ctx.step.params?.rounds === 'number' ? ctx.step.params.rounds : ctx.profile.firstSoundRounds;
    const n = ctx.profile.firstSoundChoices - 1;

    const card = h('div', {
      'aria-label': c.alphabet[unit]?.name ?? unit,
      style: 'width:84px;height:84px;border-radius:22px;background:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:60px;font-weight:800;color:#1E4FBF;flex:none',
    }, unit);
    const body = h('div', { style: 'display:flex;flex-direction:column;align-items:center;align-self:stretch' });
    ctx.stage.appendChild(h('div', { 'data-step': 'firstSound', style: 'display:flex;flex-direction:column;align-items:center;gap:20px;align-self:stretch' }, card, body));

    const targets = ctx.rng.shuffle(letter.words);
    const answers: AnswerEvent[] = [];
    for (let r = 0; r < rounds; r++) {
      body.replaceChildren();
      const target = targets[r % targets.length];
      // an option's id is its first letter: unique, and the unit a wrong pick confuses with
      const words = ctx.rng.shuffle([target, ...pickFirstSoundOptions(unit, c.distractorWords, n, c.sameSound, ctx.rng)]);
      const a = await runChoiceRound(ctx, {
        item: itemId(unit, 'sound'),
        options: words.map((w) => ({ id: w.first, label: wordLabel(w), aria: w.plain })),
        correct: unit,
        ask: line(c, 'firstSound.ask', { sound }),
        right: () => line(c, 'firstSound.right', { sound, word: target.word }),
        wrong: () => line(c, 'firstSound.wrong'),
        kind: 'match',
        layout: 'list',
        host: body,
      });
      if (a === null) return { outcome: 'aborted', answers: [], slips: 0, ms: Date.now() - t0 };
      answers.push(a);
      ctx.progress((r + 1) / rounds);
    }
    return { outcome: 'done', answers, slips: 0, ms: Date.now() - t0 };
  },
};
