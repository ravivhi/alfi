// Content model for the 3-5 letters path, and the checks every content file must pass.

export type Band = '3-5';

export interface PictureWord {
  word: string;          // with niqqud
  plain: string;         // the same word without niqqud
  emoji: string;
  emojiUnicode: number;  // Unicode version that introduced the emoji (Android 7 shows up to 9)
  first: string;         // first letter
  letters: string[];     // distinct letters, in reading order
  vowels: string[];      // distinct vowel ids (see VOWEL_IDS), in reading order
  band: Band;
}

export interface LetterEntry {
  glyph: string;
  soundSay: string;      // what the voice says for the letter's sound
  words: PictureWord[];
  strokes: string[];     // SVG paths on a 300x300 board, in writing order and direction
}

export interface LettersContent {
  id: string;
  reviewed: boolean;
  fixture?: boolean;
  band: Band;
  order: string[];
  alphabet: Record<string, { name: string; plain: string; latin: string }>;
  letters: Record<string, LetterEntry>;
  lookAlikes: Record<string, string[]>;
  sameSound: string[][];
  distractorWords: PictureWord[];
  lines: Record<string, string>;
  praise: string[];
}

export const LINE_IDS = [
  'children.who', 'map.next', 'map.tomorrow', 'map.limit', 'map.complete', 'leave.ask',
  'meet.line', 'find.ask', 'find.right', 'find.wrong', 'soundPick.ask',
  'firstSound.ask', 'firstSound.right', 'firstSound.wrong',
  'drive.ask', 'drive.back', 'drive.next', 'drive.done',
  'paint.ask',
  'colour.red', 'colour.blue', 'colour.green', 'colour.yellow', 'colour.orange', 'colour.purple', 'colour.turquoise', 'colour.brown', 'colour.burgundy',
  'plane.ask', 'race.ask', 'race.go', 'race.finish', 'race.timeUp', 'mole.ask', 'match.ask1', 'match.ask2', 'jump.ask', 'jump.door', 'jump.level', 'jump.noLives',
  'checkpoint.intro', 'warmup.intro', 'practice.intro', 'step.next', 'end.great', 'end.sticker', 'end.bye',
  'break.start', 'break.end',
  'result.stars3', 'result.choose', 'result.fail',
] as const;

export const PLACEHOLDERS = ['{name}', '{sound}', '{word}'];

export const VOWEL_IDS = ['shva', 'hataf-segol', 'hataf-patach', 'hataf-kamatz', 'hiriq', 'tzere', 'segol', 'patach', 'kamatz', 'holam', 'kubutz', 'shuruk'] as const;

const ALEFBET = 'אבגדהוזחטיכלמנסעפצקרשת';
const FINALS = /[ךםןףץ]/;
const LETTER = /[א-ת]/;
const MARK_VOWEL: Record<string, string> = {
  'ְ': 'shva', 'ֱ': 'hataf-segol', 'ֲ': 'hataf-patach', 'ֳ': 'hataf-kamatz',
  'ִ': 'hiriq', 'ֵ': 'tzere', 'ֶ': 'segol', 'ַ': 'patach', 'ָ': 'kamatz',
  'ֹ': 'holam', 'ֻ': 'kubutz',
};
const DAGESH = 'ּ';

const uniq = (xs: string[]) => [...new Set(xs)];

/** Splits pointed Hebrew into letters with their marks. */
function clusters(word: string): { letter: string; marks: string[] }[] {
  const out: { letter: string; marks: string[] }[] = [];
  for (const ch of word.normalize('NFC')) {
    if (LETTER.test(ch)) out.push({ letter: ch, marks: [] });
    else if (out.length && /[֑-ׇ]/.test(ch)) out[out.length - 1].marks.push(ch);
  }
  return out;
}

export const plainOf = (word: string) => word.normalize('NFC').replace(/[֑-ׇ]/g, '');

/** Distinct vowels a reader meets in the word: a vav with only a dagesh after an unvowelled letter is a shuruk. */
export function deriveVowels(word: string): string[] {
  const cs = clusters(word), out: string[] = [];
  cs.forEach((c, i) => {
    const vs = c.marks.filter(m => MARK_VOWEL[m]).map(m => MARK_VOWEL[m]);
    if (c.letter === 'ו' && !vs.length && c.marks.includes(DAGESH) && i > 0 && !cs[i - 1].marks.some(m => MARK_VOWEL[m])) out.push('shuruk');
    else out.push(...vs);
  });
  return uniq(out);
}

export const deriveLetters = (word: string) => uniq(clusters(word).map(c => c.letter));

const nfcProblems = (where: string, s: string) => (s === s.normalize('NFC') ? [] : [`${where}: not NFC`]);

function checkWord(where: string, w: PictureWord): string[] {
  const e: string[] = [];
  if (FINALS.test(w.word)) e.push(`${where}: final letter in "${w.plain}"`);
  if (!(w.emojiUnicode <= 9)) e.push(`${where}: emoji newer than Unicode 9`);
  if (!w.emoji) e.push(`${where}: no emoji`);
  if (plainOf(w.word) !== w.plain) e.push(`${where}: plain "${w.plain}" != "${plainOf(w.word)}"`);
  if (w.first !== clusters(w.word)[0]?.letter) e.push(`${where}: first letter`);
  if (JSON.stringify(w.letters) !== JSON.stringify(deriveLetters(w.word))) e.push(`${where}: letters should be ${deriveLetters(w.word).join(',')}`);
  if (JSON.stringify(w.vowels) !== JSON.stringify(deriveVowels(w.word))) e.push(`${where}: vowels should be ${deriveVowels(w.word).join(',')}`);
  if (w.band !== '3-5') e.push(`${where}: band`);
  e.push(...nfcProblems(where, w.word));
  return e;
}

/** Returns the problems found; empty means the content is usable. */
export function validateContent(c: LettersContent): string[] {
  const e: string[] = [];
  if (c.band !== '3-5') e.push('band must be 3-5');

  const alpha = Object.keys(c.alphabet ?? {});
  if (alpha.length !== 22 || ![...ALEFBET].every(L => alpha.includes(L))) e.push('alphabet must have the 22 letters');
  for (const [L, a] of Object.entries(c.alphabet ?? {})) {
    if (!a.name || !a.latin || plainOf(a.name) !== a.plain) e.push(`alphabet ${L}: name / plain / latin`);
  }

  const look = Object.keys(c.lookAlikes ?? {});
  if (look.length !== 22 || ![...ALEFBET].every(L => look.includes(L))) e.push('lookAlikes must have the 22 letters');
  for (const [L, list] of Object.entries(c.lookAlikes ?? {})) {
    for (const x of list) {
      if (x === L) e.push(`lookAlikes ${L}: lists itself`);
      if (c.sameSound.some(g => g.includes(L) && g.includes(x))) e.push(`lookAlikes ${L}: ${x} has the same sound`);
    }
  }

  if (c.order?.length !== 6 || new Set(c.order).size !== 6) e.push('order must list six different letters');
  for (const L of c.order ?? []) {
    const le = c.letters?.[L];
    if (!le) { e.push(`letters ${L}: missing`); continue; }
    if (le.glyph !== L) e.push(`letters ${L}: glyph`);
    if (!le.soundSay) e.push(`letters ${L}: soundSay`);
    if (le.words.length < 3 || le.words.length > 5) e.push(`letters ${L}: needs 3-5 picture words`);
    le.words.forEach((w, i) => { e.push(...checkWord(`letters ${L} word ${i}`, w)); if (w.first !== L) e.push(`letters ${L} word ${i}: starts with ${w.first}`); });
    if (le.strokes.length < 1 || le.strokes.length > 3 || le.strokes.some(s => !/^M\s/.test(s))) e.push(`letters ${L}: 1-3 strokes starting with M`);
  }
  if (Object.keys(c.letters ?? {}).length !== (c.order ?? []).length) e.push('letters must hold exactly the letters in order');

  // A distractor must not start with one of the six letters, nor with a letter that sounds like one of them.
  const taken = new Set((c.order ?? []).flatMap(L => [L, ...c.sameSound.filter(g => g.includes(L)).flat()]));
  if ((c.distractorWords ?? []).length < 10) e.push('distractorWords needs at least 10 words');
  (c.distractorWords ?? []).forEach((w, i) => { e.push(...checkWord(`distractor ${i}`, w)); if (taken.has(w.first)) e.push(`distractor ${i}: starts with a path sound (${w.first})`); });

  for (const [id, t] of Object.entries(c.lines ?? {})) {
    for (const p of t.match(/\{[^}]*\}/g) ?? []) if (!PLACEHOLDERS.includes(p)) e.push(`line ${id}: unknown placeholder ${p}`);
    e.push(...nfcProblems(`line ${id}`, t));
  }
  if (!(c.praise ?? []).length) e.push('praise is empty');
  return e;
}
