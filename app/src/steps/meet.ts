// Meet the letter: card, name, picture word; the voice says the line, no answers.
import type { StepModule } from './contract.ts';
import { stepUnit } from './find.ts';
import type { StepResult } from '../engine/types.ts';
import { line } from '../audio/lines.ts';
import { h } from '../util/dom.ts';

const FIRST_CLUSTER = /^([א-ת][֑-ׇ]*)([\s\S]*)$/;

export const meetStep: StepModule = {
  id: 'meet',
  async run(ctx): Promise<StepResult> {
    const t0 = Date.now();
    const c = ctx.content;
    const unit = stepUnit(ctx);
    const letter = c.letters[unit];
    const w = letter.words[0];
    const name = c.alphabet[unit].name;
    const text = line(c, 'meet.line', { name, sound: letter.soundSay, word: w.word });

    const m = FIRST_CLUSTER.exec(w.word.normalize('NFC'));
    const wordEl = h('span', { style: 'font-size:38px;font-weight:800' },
      m ? h('span', { style: 'color:#1E4FBF' }, m[1]) : null, m ? m[2] : w.word);
    const card = h('button', {
      type: 'button', 'aria-label': name,
      style: 'width:250px;height:250px;border-radius:40px;border:0;padding:0;background:#FFFFFF;box-shadow:0 6px 0 #EBD9B6;display:flex;align-items:center;justify-content:center;font:800 200px/1 Rubik,sans-serif;color:#1E4FBF;cursor:pointer',
    }, unit);
    ctx.stage.appendChild(h('div', { 'data-step': 'meet', style: 'display:flex;flex-direction:column;align-items:center;gap:20px;align-self:stretch' },
      card,
      h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:4px' },
        h('span', { style: 'font-size:40px;font-weight:800' }, name),
        h('span', { style: 'font-size:17px;color:#4A5878' }, letter.soundSay)),
      h('div', { style: 'display:flex;align-items:center;gap:16px;padding:14px 20px;border-radius:24px;background:#FFFFFF' },
        h('span', { 'aria-label': w.plain, role: 'img', style: 'font-size:92px;line-height:1' }, w.emoji), wordEl),
      h('p', { style: 'margin:0;font-size:15px;color:#4A5878;text-align:center' }, text)));

    // the speech that is playing now; a tap on the letter replaces it, and the step ends with the last one
    let latest: Promise<void> = ctx.setInstruction(text).catch(() => undefined);
    const repeat = () => {
      try { latest = ctx.audio.say(text).catch(() => undefined); } catch { /* no voice */ }
    };
    card.addEventListener('click', repeat);

    let off: () => void = () => undefined;
    const aborted = new Promise<'aborted'>((res) => {
      if (ctx.signal.aborted) res('aborted');
      const fn = () => res('aborted');
      ctx.signal.addEventListener('abort', fn);
      off = () => ctx.signal.removeEventListener('abort', fn);
    });
    let r: 'ended' | 'aborted';
    for (;;) {
      const cur = latest;
      r = await Promise.race([cur.then(() => 'ended' as const), aborted]);
      if (r === 'aborted' || cur === latest) break;
    }
    off();
    card.removeEventListener('click', repeat);
    return { outcome: r === 'aborted' ? 'aborted' : 'done', answers: [], slips: 0, ms: Date.now() - t0 };
  },
};
