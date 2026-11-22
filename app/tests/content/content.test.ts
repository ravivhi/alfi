/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';
import { validateContent, LINE_IDS, type LettersContent } from '../../src/content/schema.ts';
import { CONTENT } from '../../src/content/index.ts';
import draft from '../../content/letters-3-5.json';
import fixture from '../../content/dev-fixture.json';
import table from '../../content/letters-3-5.md?raw';

const FILES: Record<string, unknown> = { 'letters-3-5.json': draft, 'dev-fixture.json': fixture };
// A fresh deep copy each time, so a test may mutate it.
const load = (file: string): LettersContent => JSON.parse(JSON.stringify(FILES[file]));

// Every string anywhere in the content (keys included), for the NFC check.
const allTexts = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach(x => allTexts(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); allTexts(x, out); }
  return out;
};

for (const file of ['letters-3-5.json', 'dev-fixture.json']) describe(file, () => {
  const c = load(file);
  it('is valid', () => expect(validateContent(c)).toEqual([]));
  it('has six letters in the proposed order', () => expect(c.order).toEqual(['מ','ל','ב','ת','י','צ']));
  it('no two of the six are look-alikes or sound-alikes', () => { for (const a of c.order) for (const b of c.order) if (a !== b) { expect(c.lookAlikes[a]).not.toContain(b); expect(c.sameSound.some(g => g.includes(a) && g.includes(b))).toBe(false); } });
  it('picture words: no final letters, emoji <= Unicode 9, first letter matches', () => { for (const L of c.order) { expect(c.letters[L].words.length).toBeGreaterThanOrEqual(3); for (const w of c.letters[L].words) { expect(w.word).not.toMatch(/[ךםןףץ]/); expect(w.emojiUnicode).toBeLessThanOrEqual(9); expect(w.first).toBe(L); } } });
  it('all texts are NFC', () => allTexts(c).forEach(t => expect(t).toBe(t.normalize('NFC'))));
  it('lines are gender-neutral (no masculine singular imperatives)', () => Object.values(c.lines).forEach(t => expect(t).not.toMatch(/(^|\s)(בוא|לחץ|מצא|שים|קום|תלחץ)(\s|$|[.!?,])/)));
  it('every line id the app uses exists', () => LINE_IDS.forEach(id => expect(c.lines[id], id).toBeTruthy()));
});

describe('fixture flags', () => {
  it('draft is unreviewed and not a fixture', () => { const c = load('letters-3-5.json'); expect(c.reviewed).toBe(false); expect(c.fixture).toBeUndefined(); });
  it('dev fixture equals the draft plus fixture: true', () => { const { fixture, ...rest } = load('dev-fixture.json'); expect(fixture).toBe(true); expect(rest).toEqual(load('letters-3-5.json')); });
  it('the app runs on the dev fixture until the owner check', () => expect(CONTENT.fixture).toBe(true));
});

describe('letters-3-5.md (the owner table) equals the JSON', () => {
  const c = load('letters-3-5.json');
  const md = table.normalize('NFC');
  const rows = (ws: LettersContent['distractorWords']) => ws.map(w => `| ${w.word} | ${w.plain} | ${w.emoji} | ${w.emojiUnicode.toFixed(1)} | ${w.first} | ${w.letters.join(' ')} |`);
  it('every picture word and distractor row', () => [...c.order.flatMap(L => rows(c.letters[L].words)), ...rows(c.distractorWords)].forEach(r => expect(md, r).toContain(r)));
  it('every sound, name, stroke and look-alike list', () => {
    for (const L of c.order) { expect(md).toContain(`צליל שהקול אומר: **${c.letters[L].soundSay}**`); c.letters[L].strokes.forEach(s => expect(md).toContain('`' + s + '`')); }
    for (const [L, a] of Object.entries(c.alphabet)) expect(md).toContain(`| ${L} | ${a.name} | ${a.plain} | ${a.latin} | ${c.lookAlikes[L].join(' ')} |`);
  });
  it('every line and praise', () => { for (const [id, t] of Object.entries(c.lines)) expect(md).toMatch(new RegExp(`\\| ${id.replace('.', '\\.')} \\|[^|]*\\| ${t.replace(/[.?!{}]/g, '\\$&')} \\|`)); c.praise.forEach(p => expect(md).toContain(p)); });
  it('the order', () => expect(md).toContain(`**${c.order.join(' ')}**`));
});

describe('validateContent catches errors', () => {
  const base = () => load('letters-3-5.json');
  it('a word whose plain spelling does not match', () => { const c = base(); c.letters['מ'].words[0].plain = 'xx'; expect(validateContent(c).length).toBeGreaterThan(0); });
  it('a final letter in a distractor', () => { const c = base(); c.distractorWords[0].word = 'דָּם'; expect(validateContent(c).length).toBeGreaterThan(0); });
  it('an unknown placeholder', () => { const c = base(); c.lines['find.ask'] = 'איפה {letter}?'; expect(validateContent(c).length).toBeGreaterThan(0); });
  it('a stroke not starting with M', () => { const c = base(); c.letters['ל'].strokes = ['L 1 2']; expect(validateContent(c).length).toBeGreaterThan(0); });
  it('a same-sound letter listed as a look-alike', () => { const c = base(); c.lookAlikes['א'].push('ע'); expect(validateContent(c).length).toBeGreaterThan(0); });
  it('wrong vowels for a word', () => { const c = base(); c.letters['ב'].words[0].vowels = ['hiriq']; expect(validateContent(c).length).toBeGreaterThan(0); });
});
