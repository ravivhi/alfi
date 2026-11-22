// The shared choice round: letter options drawn from the shared face palette, the first pick is the evidence, wrong picks get a spoken retry.
import type { StepContext } from './contract.ts';
import type { AnswerEvent, ItemId, UnitId } from '../engine/types.ts';
import { h } from '../util/dom.ts';
import { faceAttrs, faceLooks } from './faces.ts';

export interface ChoiceOption { id: UnitId; label: Node | string; aria: string }

export interface ChoiceRoundOpts {
  item: ItemId;
  options: ChoiceOption[];
  correct: UnitId;
  ask: string;
  /**
   * Recall rounds: the caption shown instead of the spoken ask, without the answer's shape in it. The full ask is
   * shown only while no voice can say it (audio status 'none'), so a reading adult can help.
   */
  caption?: string;
  askRate?: number;
  right(): string;
  wrong(id: UnitId): string;
  kind: 'recall' | 'match';
  layout: 'row' | 'grid2' | 'list';
  /** Letter options: one size and one white-card, navy-glyph style; only the border colour comes from the palette (never singling the correct one out). */
  faces?: boolean;
  /** Where the round is drawn; defaults to the stage. */
  host?: HTMLElement;
}

const CONTAINER: Record<ChoiceRoundOpts['layout'], string> = {
  row: 'display:flex;gap:16px;justify-content:center;align-self:stretch',
  grid2: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-self:stretch',
  list: 'display:flex;flex-direction:column;gap:14px;align-self:stretch',
};
const BUTTON: Record<ChoiceRoundOpts['layout'], () => string> = {
  row: () => 'width:100px;height:130px;font-size:72px;box-shadow:0 5px 0 #C9DAEE',
  grid2: () => 'height:120px;font-size:70px;box-shadow:0 5px 0 #F0D2BF',
  list: () => 'display:flex;align-items:center;gap:18px;min-height:104px;padding:8px 18px;font-size:30px;border:4px solid #FFFFFF;box-shadow:0 4px 0 #C3E3CE;direction:rtl;background:#FFFFFF;color:#1D2742;font-family:Rubik,sans-serif;font-weight:800',
};
/** Every letter card: the same white card and navy glyph (the pairs cards' style); the border colour is the look. */
const CARD_FACE = 'background:#FFFFFF;color:#1D2742;font-family:Rubik,sans-serif;font-weight:800';
const BASE_BUTTON = 'box-sizing:border-box;border:0;border-radius:24px;padding:0;cursor:pointer;line-height:1';
const SPEAKER = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E4FBF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path></svg>';

/** True while no voice and no clips can speak (the full ask may then be shown). */
export function voiceless(ctx: StepContext): boolean {
  try {
    return ctx.audio.status() === 'none';
  } catch {
    return false;
  }
}

/** Runs one question. Resolves with the first pick as evidence, or null when ctx.signal aborts. */
export function runChoiceRound(ctx: StepContext, o: ChoiceRoundOpts): Promise<AnswerEvent | null> {
  if (ctx.signal.aborted) return Promise.resolve(null);
  return new Promise<AnswerEvent | null>((resolve) => {
    const host = o.host ?? ctx.stage;
    const caption = h('p', { 'data-ask': '1', style: 'margin:0;font-size:17px;color:#4A5878;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px' });
    const showCaption = (): void => {
      if (o.caption === undefined || voiceless(ctx)) { caption.replaceChildren(o.ask); return; }
      const icon = h('span', { 'aria-hidden': 'true', style: 'display:flex;flex:none' });
      icon.innerHTML = SPEAKER;
      caption.replaceChildren(icon, o.caption);
    };
    showCaption();
    // a voice that appears (or goes) while the question is up changes what the caption may show
    let offStatus: () => void = () => undefined;
    try { offStatus = ctx.audio.onStatusChange(showCaption); } catch { /* no status events */ }
    const msg = h('p', { 'aria-live': 'polite', style: 'margin:0;min-height:26px;font-size:18px;font-weight:500;color:#4A5878;text-align:center' });
    const list = h('div', { 'data-choices': o.layout, style: CONTAINER[o.layout] });
    const root = h('div', { 'data-round': '1', style: 'display:flex;flex-direction:column;align-items:center;gap:22px;align-self:stretch' }, caption, list, msg);

    const handlers = new Map<UnitId, { el: HTMLButtonElement; fn: () => void }>();
    const greyed = new Set<UnitId>();
    let locked = false;
    let finished = false;
    let wrongCount = 0;
    let first: AnswerEvent | null = null;

    const finish = (r: AnswerEvent | null): void => {
      if (finished) return;
      finished = true;
      offStatus();
      ctx.signal.removeEventListener('abort', onAbort);
      for (const { el, fn } of handlers.values()) el.removeEventListener('click', fn);
      resolve(r);
    };
    function onAbort(): void { finish(null); }

    const speak = (text: string): Promise<void> => {
      try {
        return ctx.audio.say(text).catch(() => undefined);
      } catch {
        return Promise.resolve();
      }
    };

    // locked from the first tap until the feedback speech ends, so a mashing child records one answer
    const onPick = (id: UnitId): void => {
      if (locked || finished || greyed.has(id)) return;
      locked = true;
      const ok = id === o.correct;
      if (first === null) first = { item: o.item, ok, kind: o.kind, ...(ok ? {} : { chose: id }), t: Date.now() };
      const el = handlers.get(id)!.el;
      if (ok) {
        const inList = o.layout === 'list';
        el.style.background = inList ? '#D4F2DE' : '#2E9E5B';
        el.style.color = inList ? '#1D2742' : '#FFFFFF';
        if (inList) el.style.borderColor = '#2E9E5B';
        else { el.style.boxShadow = '0 0 0 4px #FFFFFF'; el.style.borderColor = '#2E9E5B'; }
        el.classList.remove('pulse');
        const text = o.right();
        msg.textContent = text;
        msg.style.color = '#1E7442';
        const evidence = first;
        void speak(text).then(() => finish(evidence));
      } else {
        greyed.add(id);
        wrongCount++;
        el.style.background = '#E3E8F1';
        el.style.color = '#8A97B2';
        if (o.layout !== 'list') el.style.borderColor = '#E3E8F1';
        el.style.boxShadow = 'none';
        el.classList.add('is-wrong');
        el.setAttribute('aria-disabled', 'true');
        const text = o.wrong(id);
        msg.textContent = text;
        if (wrongCount >= 2) handlers.get(o.correct)?.el.classList.add('pulse');
        void speak(text).then(() => { if (!finished) locked = false; });
      }
    };

    const looks = o.faces && o.layout !== 'list' ? faceLooks(ctx.rng, o.options.length).map(l => ({ ...l, scale: 1 })) : null;
    o.options.forEach((opt, i) => {
      const look = looks ? looks[i] : null;
      const el = h('button', {
        type: 'button', 'data-choice': opt.id, 'aria-label': opt.aria,
        ...(look ? faceAttrs(look) : {}),
        style: BASE_BUTTON + ';' + BUTTON[o.layout]() + (look ? ';' + CARD_FACE + `;border:4px solid ${look.bg}` : ''),
      }, opt.label) as HTMLButtonElement;
      const fn = () => onPick(opt.id);
      el.addEventListener('click', fn);
      handlers.set(opt.id, { el, fn });
      list.appendChild(el);
    });

    ctx.signal.addEventListener('abort', onAbort);
    host.appendChild(root);
    ctx.setInstruction(o.ask, o.askRate);
  });
}
