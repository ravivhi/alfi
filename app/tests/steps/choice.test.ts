// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { runChoiceRound } from '../../src/steps/choice.ts';
import type { ChoiceRoundOpts } from '../../src/steps/choice.ts';
import type { StepContext } from '../../src/steps/contract.ts';
import { findStep } from '../../src/steps/find.ts';
import { soundPickStep } from '../../src/steps/soundPick.ts';
import { firstSoundStep } from '../../src/steps/firstSound.ts';
import { meetStep } from '../../src/steps/meet.ts';
import { checkpointStep } from '../../src/steps/checkpoint.ts';
import { REGISTRY } from '../../src/steps/registry.ts';
import { profileFor } from '../../src/engine/profiles.ts';
import type { PlannedStep } from '../../src/engine/planner.ts';
import { CONTENT } from '../../src/content/index.ts';
import { createRng } from '../../src/util/rng.ts';
import type { AudioApi } from '../../src/audio/audio.ts';
import { FACE_PALETTE } from '../../src/steps/faces.ts';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

let said: string[];
let holding: boolean;
let held: (() => void)[];
let stage: HTMLElement;
let instructions: { text: string; rate?: number }[];
let voice: 'clips' | 'live' | 'none';
let statusListeners: (() => void)[];

function makeCtx(step: Partial<PlannedStep>, signal?: AbortSignal, seed = 7): StepContext {
  const audio = {
    ready: Promise.resolve(),
    say: (t: string) => { said.push(t); return holding ? new Promise<void>(r => held.push(r)) : Promise.resolve(); },
    stop() { /* not used */ },
    setVoiceVolume() { /* not used */ },
    status: () => voice,
    onStatusChange: (cb: () => void) => { statusListeners.push(cb); return () => { statusListeners = statusListeners.filter(f => f !== cb); }; },
  };
  return {
    step: { kind: 'station', step: 'find', items: [], ...step } as PlannedStep,
    profile: profileFor('3-5'),
    content: CONTENT,
    rng: createRng(seed),
    stage,
    signal: signal ?? new AbortController().signal,
    audio: audio as unknown as AudioApi,
    sfx: {} as StepContext['sfx'],
    taught: ['מ', 'ל'],
    confusions: () => [],
    setInstruction: (text, rate) => { instructions.push(rate === undefined ? { text } : { text, rate }); return audio.say(text); },
    progress: () => undefined,
  };
}

function round(o: { correct: string; options: string[]; holdSpeech?: boolean; signal?: AbortSignal; layout?: ChoiceRoundOpts['layout']; faces?: boolean; seed?: number }) {
  holding = !!o.holdSpeech;
  const ctx = makeCtx({}, o.signal, o.seed);
  return runChoiceRound(ctx, {
    item: 'ב/name',
    options: o.options.map(id => ({ id, label: id, aria: id })),
    correct: o.correct,
    ask: 'ASK',
    right: () => 'RIGHT',
    wrong: id => 'W:' + id,
    kind: 'recall',
    layout: o.layout ?? 'row',
    faces: o.faces ?? true,
  });
}
const tap = (id: string) => (stage.querySelector(`[data-choice="${id}"]`) as HTMLElement).click();
const optionButtons = () => Array.from(stage.querySelectorAll('[data-choice]')) as HTMLElement[];
const spokenWrong = () => said.filter(s => s.startsWith('W:')).map(s => s.slice(2));
const releaseSpeech = () => { holding = false; held.splice(0).forEach(r => r()); };

beforeEach(() => {
  said = []; holding = false; held = []; instructions = []; voice = 'live'; statusListeners = [];
  document.body.replaceChildren();
  stage = document.createElement('div');
  document.body.appendChild(stage);
});

describe('runChoiceRound', () => {
  it('first wrong pick is the evidence, with the chosen unit', async () => {
    const p = round({ correct: 'ב', options: ['כ', 'ב', 'ר'] });
    tap('כ'); await tick(); tap('ב');
    expect(await p).toMatchObject({ item: 'ב/name', ok: false, chose: 'כ', kind: 'recall' });
  });
  it('taps during feedback are ignored', async () => {
    const p = round({ correct: 'ב', options: ['כ', 'ב', 'ר'], holdSpeech: true });
    tap('כ'); tap('ר'); tap('ר');
    releaseSpeech(); await tick(); tap('ב');
    expect(spokenWrong()).toEqual(['כ']);
    expect((await p)!.chose).toBe('כ');
  });
  it('a correct first pick is ok, has no chose, and later taps change nothing', async () => {
    const p = round({ correct: 'ב', options: ['כ', 'ב', 'ר'], holdSpeech: true });
    tap('ב'); tap('כ'); tap('ב');
    releaseSpeech();
    const r = await p;
    expect(r).toMatchObject({ ok: true });
    expect(r).not.toHaveProperty('chose');
    expect(said).toEqual(['ASK', 'RIGHT']);
  });
  it('t is epoch milliseconds', async () => {
    const before = Date.now();
    const p = round({ correct: 'ב', options: ['ב', 'ר'] });
    tap('ב');
    expect((await p)!.t).toBeGreaterThanOrEqual(before);
  });
  it('every card in a round has the same size and the same white card, navy glyph and 4px look-colour border', () => {
    for (const layout of ['row', 'grid2'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        document.body.replaceChildren();
        stage = document.createElement('div');
        document.body.appendChild(stage);
        round({ correct: 'ב', options: ['כ', 'ב', 'ר'], seed, layout });
        const bs = optionButtons();
        expect(new Set(bs.map(b => b.className))).toEqual(new Set(['pick-face']));
        expect(new Set(bs.map(b => b.style.width)).size).toBe(1);
        expect(new Set(bs.map(b => b.style.height)).size).toBe(1);
        expect(new Set(bs.map(b => b.style.fontSize)).size).toBe(1);
        expect(new Set(bs.map(b => b.dataset.scale))).toEqual(new Set(['1']));
        for (const b of bs) {
          expect(FACE_PALETTE).toContain(b.dataset.bg);
          expect(b.style.color).toMatch(/^(#1D2742|rgb\(29, 39, 66\))$/i);
          expect(b.style.background).toMatch(/^(#FFFFFF|rgb\(255, 255, 255\))$/i);
        }
      }
    }
  });
  it('the card border is 4px in the look colour and comes after the base border:0', () => {
    round({ correct: 'ב', options: ['כ', 'ב', 'ר'] });
    for (const b of optionButtons()) {
      const style = b.getAttribute('style') ?? '';
      expect(style.lastIndexOf(`border:4px solid ${b.dataset.bg}`)).toBeGreaterThan(style.lastIndexOf('border:0'));
      expect(b.style.borderWidth).toBe('4px');
    }
  });
  it("the correct option's border colour is drawn like the others' (uniform over the palette)", async () => {
    const target: Record<string, number> = {};
    const other: Record<string, number> = {};
    let nt = 0, no = 0;
    for (let seed = 1; seed <= 2100; seed++) {
      document.body.replaceChildren();
      stage = document.createElement('div');
      document.body.appendChild(stage);
      const ac = new AbortController();
      const p = round({ correct: 'ב', options: ['כ', 'ב', 'ר'], seed, signal: ac.signal });
      for (const b of optionButtons()) {
        const colour = b.style.borderColor.toLowerCase();
        if (b.dataset.choice === 'ב') { target[colour] = (target[colour] ?? 0) + 1; nt++; } else { other[colour] = (other[colour] ?? 0) + 1; no++; }
      }
      ac.abort();
      await p;
    }
    expect(Object.keys(target).length).toBe(FACE_PALETTE.length);
    for (const k of Object.keys(target)) expect(Math.abs(target[k] / nt - (other[k] ?? 0) / no)).toBeLessThanOrEqual(0.06);
  });
  it("the correct option's colour is uniform over the palette across rounds", async () => {
    const counts = new Map<string, number>();
    const N = 2100;
    for (let seed = 1; seed <= N; seed++) {
      document.body.replaceChildren();
      stage = document.createElement('div');
      document.body.appendChild(stage);
      const ac = new AbortController();
      const p = round({ correct: 'ב', options: ['כ', 'ב', 'ר'], seed, signal: ac.signal });
      const bg = (stage.querySelector('[data-choice="ב"]') as HTMLElement).dataset.bg!;
      counts.set(bg, (counts.get(bg) ?? 0) + 1);
      ac.abort();
      await p;
    }
    expect(counts.size).toBe(FACE_PALETTE.length);
    for (const n of counts.values()) expect(Math.abs(n / N - 1 / FACE_PALETTE.length)).toBeLessThanOrEqual(0.04);
  });
  it('options in one round have distinct colours', () => {
    for (let seed = 1; seed <= 100; seed++) {
      document.body.replaceChildren();
      stage = document.createElement('div');
      document.body.appendChild(stage);
      round({ correct: 'ב', options: ['כ', 'ב', 'ר', 'ת'], seed, layout: 'grid2' });
      expect(new Set(optionButtons().map(b => b.dataset.bg)).size).toBe(4);
    }
  });
  it('a correct pick turns the option green with white ink and a white ring', async () => {
    const p = round({ correct: 'ב', options: ['כ', 'ב', 'ר'] });
    tap('ב');
    const el = stage.querySelector('[data-choice="ב"]') as HTMLElement;
    expect(el.style.background).toBe('#2E9E5B');
    expect(el.style.boxShadow).toContain('4px');
    await p;
  });
  it('a wrong pick greys only that option', () => {
    round({ correct: 'ב', options: ['כ', 'ב', 'ר'] });
    tap('כ');
    expect(optionButtons().filter(b => b.classList.contains('is-wrong')).map(b => b.dataset.choice)).toEqual(['כ']);
  });
  it('a grey option cannot be picked again, and a second wrong pick makes the correct one pulse', async () => {
    round({ correct: 'ב', options: ['כ', 'ב', 'ר'] });
    tap('כ'); await tick();
    expect(stage.querySelector('.pulse')).toBeNull();
    tap('כ'); await tick();
    expect(spokenWrong()).toEqual(['כ']);
    tap('ר'); await tick();
    expect(stage.querySelector('.pulse')?.getAttribute('data-choice')).toBe('ב');
  });
  it('speaks the ask through setInstruction with its rate', () => {
    const ctx = makeCtx({});
    void runChoiceRound(ctx, { item: 'ב/sound', options: [{ id: 'ב', label: 'ב', aria: 'ב' }], correct: 'ב', ask: 'ASK', askRate: 0.75, right: () => 'R', wrong: () => 'W', kind: 'recall', layout: 'row' });
    expect(instructions).toEqual([{ text: 'ASK', rate: 0.75 }]);
  });
  it('taps outside the options are not evidence', async () => {
    const p = round({ correct: 'ב', options: ['כ', 'ב'] });
    stage.click(); (stage.querySelector('p') as HTMLElement).click();
    expect(said).toEqual(['ASK']);
    tap('ב');
    expect(await p).toMatchObject({ ok: true });
  });
  it('abort returns null and removes listeners', async () => {
    const ac = new AbortController();
    const p = round({ correct: 'ב', options: ['כ', 'ב'], signal: ac.signal });
    ac.abort();
    expect(await p).toBeNull();
    tap('כ');
    expect(said).toEqual(['ASK']);
  });
  it('an already aborted signal returns null without drawing', async () => {
    const ac = new AbortController(); ac.abort();
    expect(await round({ correct: 'ב', options: ['כ', 'ב'], signal: ac.signal })).toBeNull();
    expect(optionButtons()).toHaveLength(0);
  });
});

// Answers every question correctly until the step ends.
async function solve<T>(run: Promise<T>, correct: (root: HTMLElement) => HTMLElement | null, seen?: (root: HTMLElement) => void): Promise<T> {
  let done = false;
  const p = run.then(r => { done = true; return r; });
  for (let i = 0; i < 400 && !done; i++) {
    await tick();
    seen?.(stage);
    correct(stage)?.click();
  }
  return p;
}
const bySel = (sel: string) => (root: HTMLElement) => root.querySelector(sel) as HTMLElement | null;

describe('step modules', () => {
  it('the registry holds the five real steps', () => {
    for (const id of ['meet', 'find', 'soundPick', 'firstSound', 'checkpoint']) expect(REGISTRY[id]?.id).toBe(id);
  });
  it('find: profile rounds, 3 face cards each, item name, kind recall', async () => {
    const ctx = makeCtx({ step: 'find', unitId: 'מ' });
    const shapes: number[] = [];
    const classes = new Set<string>();
    const r = await solve(findStep.run(ctx), bySel('[data-choice="מ"]'), root => {
      const bs = Array.from(root.querySelectorAll('[data-choice]'));
      if (bs.length && shapes[shapes.length - 1] !== bs.length) shapes.push(bs.length);
      bs.forEach(b => classes.add(b.className));
    });
    expect(r.outcome).toBe('done');
    expect(r.answers).toHaveLength(3);
    expect(r.answers.every(a => a.item === 'מ/name' && a.ok && a.kind === 'recall')).toBe(true);
    expect(shapes).toEqual([3]);
    expect([...classes]).toEqual(['pick-face']);
    expect(instructions.map(i => i.text)).toEqual(Array(3).fill(CONTENT.lines['find.ask'].replace('{name}', CONTENT.alphabet['מ'].name)));
  });
  it('find: params.rounds overrides the profile', async () => {
    const ctx = makeCtx({ step: 'find', unitId: 'מ', params: { rounds: 2 } });
    expect((await solve(findStep.run(ctx), bySel('[data-choice="מ"]'))).answers).toHaveLength(2);
  });
  it('soundPick: asks at rate 0.75, item sound, kind recall', async () => {
    const ctx = makeCtx({ step: 'soundPick', unitId: 'ל' });
    const r = await solve(soundPickStep.run(ctx), bySel('[data-choice="ל"]'));
    expect(r.answers).toHaveLength(2);
    expect(r.answers.every(a => a.item === 'ל/sound' && a.kind === 'recall')).toBe(true);
    expect(instructions.every(i => i.rate === 0.75)).toBe(true);
  });
  it('firstSound: a list of 3 words, kind match, item sound, chose is the picked word first letter', async () => {
    const ctx = makeCtx({ step: 'firstSound', unitId: 'מ' });
    const run = firstSoundStep.run(ctx);
    await tick();
    const opts = optionButtons();
    expect(opts).toHaveLength(3);
    expect(stage.querySelector('[data-choices=list]')).not.toBeNull();
    const wrong = opts.find(b => b.dataset.choice !== 'מ')!;
    const wrongFirst = wrong.dataset.choice;
    wrong.click(); await tick();
    const r = await solve(run, bySel('[data-choice="מ"]'));
    expect(r.answers).toHaveLength(2);
    expect(r.answers[0]).toMatchObject({ item: 'מ/sound', ok: false, kind: 'match', chose: wrongFirst });
    expect(r.answers[1]).toMatchObject({ ok: true, kind: 'match' });
  });
  it('checkpoint: one first-try answer per item, 4 options in a 2-column grid', async () => {
    const ctx = makeCtx({ step: 'checkpoint', kind: 'checkpoint', items: ['מ/name', 'ל/sound'] });
    const counts: number[] = [];
    const r = await solve(checkpointStep.run(ctx), root => root.querySelector(`[data-choice="${(instructions[instructions.length - 1]?.text ?? '').includes(CONTENT.alphabet['מ'].name) ? 'מ' : 'ל'}"]`) as HTMLElement | null,
      root => { if (root.querySelector('[data-choices=grid2]')) counts.push(root.querySelectorAll('[data-choice]').length); });
    expect(r.outcome).toBe('done');
    expect(r.answers.map(a => a.item)).toEqual(['מ/name', 'ל/sound']);
    expect(new Set(counts)).toEqual(new Set([4]));
    expect(stage.textContent).toContain('נקודת בדיקה');
  });
  it('meet: speaks the line once, no answers', async () => {
    const ctx = makeCtx({ step: 'meet', unitId: 'מ' });
    const r = await meetStep.run(ctx);
    expect(r).toMatchObject({ outcome: 'done', answers: [] });
    expect(instructions).toHaveLength(1);
    expect(said).toEqual([instructions[0].text]);
    expect(stage.textContent).toContain(CONTENT.alphabet['מ'].name);
  });
  it('meet: tapping the letter repeats the line', async () => {
    const ctx = makeCtx({ step: 'meet', unitId: 'מ' });
    holding = true;
    const p = meetStep.run(ctx);
    (stage.querySelector('button') as HTMLElement).click();
    expect(said).toHaveLength(2);
    releaseSpeech();
    await p;
  });
  it('meet: tapping the letter during the line does not finish the step until the repeat ends', async () => {
    holding = true;
    const p = meetStep.run(makeCtx({ step: 'meet', unitId: 'מ' }));
    let done = false;
    void p.then(() => { done = true; });
    (stage.querySelector('button') as HTMLElement).click();
    holding = false;
    held.splice(0, 1).forEach(r => r()); // the halted first line ends
    await tick();
    expect(done).toBe(false);
    held.splice(0).forEach(r => r()); // the repeat ends
    await p;
    expect(done).toBe(true);
    expect(said).toHaveLength(2);
  });
  it('meet: abort resolves aborted', async () => {
    const ac = new AbortController();
    holding = true;
    const p = meetStep.run(makeCtx({ step: 'meet', unitId: 'מ' }, ac.signal));
    await tick();
    ac.abort();
    expect((await p).outcome).toBe('aborted');
  });
  describe('recall captions never show the answer', () => {
    const caption = () => (stage.querySelector('[data-ask]') as HTMLElement).textContent ?? '';
    const NAME_M = CONTENT.alphabet['מ'].name;
    const SOUND_L = CONTENT.letters['ל'].soundSay;
    it('find: the caption leaves the letter name out, the voice says it', async () => {
      const p = findStep.run(makeCtx({ step: 'find', unitId: 'מ' }));
      await tick();
      expect(caption()).toBe(CONTENT.lines['find.ask'].replace('{name}', '...'));
      expect(caption()).not.toContain(NAME_M);
      expect(stage.querySelector('[data-ask] svg')).not.toBeNull();
      expect(instructions[0].text).toContain(NAME_M);
      await solve(p, bySel('[data-choice="מ"]'));
    });
    it('soundPick: the caption leaves the sound out', async () => {
      const p = soundPickStep.run(makeCtx({ step: 'soundPick', unitId: 'ל' }));
      await tick();
      expect(caption()).toBe(CONTENT.lines['soundPick.ask'].replace('{sound}', '...'));
      expect(caption()).not.toContain(SOUND_L);
      expect(instructions[0].text).toContain(SOUND_L);
      await solve(p, bySel('[data-choice="ל"]'));
    });
    it('checkpoint: name and sound questions both hide the value', async () => {
      const p = checkpointStep.run(makeCtx({ step: 'checkpoint', kind: 'checkpoint', items: ['מ/name', 'ל/sound'] }));
      const seen: string[] = [];
      await solve(p, root => root.querySelector(`[data-choice="${(instructions[instructions.length - 1]?.text ?? '').includes(NAME_M) ? 'מ' : 'ל'}"]`) as HTMLElement | null,
        root => { const c = root.querySelector('[data-ask]'); if (c && seen[seen.length - 1] !== c.textContent) seen.push(c.textContent ?? ''); });
      expect(seen).toEqual([CONTENT.lines['find.ask'].replace('{name}', '...'), CONTENT.lines['soundPick.ask'].replace('{sound}', '...')]);
    });
    it('no voice and no clips: the full ask is shown so a reading adult can help; a voice that appears hides it', async () => {
      voice = 'none';
      const p = findStep.run(makeCtx({ step: 'find', unitId: 'מ' }));
      await tick();
      expect(caption()).toBe(CONTENT.lines['find.ask'].replace('{name}', NAME_M));
      voice = 'live';
      statusListeners.forEach(f => f());
      expect(caption()).not.toContain(NAME_M);
      await solve(p, bySel('[data-choice="מ"]'));
      expect(statusListeners).toEqual([]);
    });
  });
  it('find: abort mid-round resolves aborted with no answers', async () => {
    const ac = new AbortController();
    const p = findStep.run(makeCtx({ step: 'find', unitId: 'מ' }, ac.signal));
    await tick();
    ac.abort();
    expect(await p).toMatchObject({ outcome: 'aborted', answers: [] });
  });
});
