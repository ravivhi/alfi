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
  it('starts with the six and lists all 22 letters once', () => { expect(c.order.slice(0, 6)).toEqual(['מ','ל','ב','ת','י','צ']); expect([...c.order].sort()).toEqual([...'אבגדהוזחטיכלמנסעפצקרשת'].sort()); });
  it('no look-alike or sound-alike pair in one group of three', () => { for (let i = 0; i < c.order.length; i += 3) { const g = c.order.slice(i, i + 3); for (const a of g) for (const b of g) if (a !== b) { expect(c.lookAlikes[a], `${a} ${b}`).not.toContain(b); expect(c.sameSound.some(s => s.includes(a) && s.includes(b)), `${a} ${b}`).toBe(false); } } });
  it('picture words: no final letters, emoji <= Unicode 9, first letter matches', () => { for (const L of c.order) { expect(c.letters[L].words.length).toBeGreaterThanOrEqual(3); for (const w of c.letters[L].words) { expect(w.word).not.toMatch(/[ךםןףץ]/); expect(w.emojiUnicode).toBeLessThanOrEqual(9); expect(w.first).toBe(L); } } });
  it('first letter carries the taught sound mark', () => {
    for (const L of c.order) for (const w of c.letters[L].words) {
      const lead = (w.word.normalize('NFC').match(/^[א-ת][֑-ׇ]*/) ?? [''])[0];
      if ('בכפ'.includes(L)) expect(lead, w.word).toContain('ּ');
      if (L === 'ש') expect(lead, w.word).toContain('ׁ');
      if (L === 'ו') expect(lead, w.word).not.toMatch(/[ֹּ]/);
    }
  });
  it('all texts are NFC', () => allTexts(c).forEach(t => expect(t).toBe(t.normalize('NFC'))));
  it('lines are gender-neutral (no masculine singular imperatives)', () => Object.values(c.lines).forEach(t => expect(t).not.toMatch(/(^|\s)(בוא|לחץ|מצא|שים|קום|תלחץ)(\s|$|[.!?,])/)));
  it('every line id the app uses exists', () => LINE_IDS.forEach(id => expect(c.lines[id], id).toBeTruthy()));
});

describe('fixture flags', () => {
  it('draft is reviewed and not a fixture', () => { const c = load('letters-3-5.json'); expect(c.reviewed).toBe(true); expect(c.fixture).toBeUndefined(); });
  it('dev fixture equals the draft plus fixture: true', () => { const { fixture, ...rest } = load('dev-fixture.json'); expect(fixture).toBe(true); expect(rest).toEqual(load('letters-3-5.json')); });
  it('the app runs on the reviewed content', () => { expect(CONTENT.reviewed).toBe(true); expect(CONTENT.fixture).toBeUndefined(); });
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
  it('a look-alike pair in one group of three', () => { const c = base(); c.order[1] = 'כ'; expect(validateContent(c).some(x => x.includes('group'))).toBe(true); });
  it('a stroke point outside the board', () => { const c = base(); c.letters['ל'].strokes = ['M 10 10 L 320 10']; expect(validateContent(c).some(x => x.includes('outside the board'))).toBe(true); });
  it('wrong vowels for a word', () => { const c = base(); c.letters['ב'].words[0].vowels = ['hiriq']; expect(validateContent(c).length).toBeGreaterThan(0); });
});
