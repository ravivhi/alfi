// Dev helper: turns hand-written picture words into full PictureWord objects for the content files.
// Input: a JSON file holding [{ word, emoji, emojiUnicode }] or { "<letter>": [{ word, emoji, emojiUnicode }] }.
// Output (stdout): the same shape with plain / first / letters / vowels / band derived by the schema helpers.
// Run from app/: node scripts/word-meta.ts <file>
import { readFileSync } from 'node:fs';
import { plainOf, deriveLetters, deriveVowels, type PictureWord } from '../src/content/schema.ts';

interface WordIn { word: string; emoji: string; emojiUnicode: number }

function meta(w: WordIn): PictureWord {
  const word = w.word.normalize('NFC');
  const letters = deriveLetters(word);
  return { word, plain: plainOf(word), emoji: w.emoji, emojiUnicode: w.emojiUnicode, first: letters[0], letters, vowels: deriveVowels(word), band: '3-5' };
}

const file = process.argv[2];
if (!file) throw new Error('usage: node scripts/word-meta.ts <words.json>');
const input = JSON.parse(readFileSync(file, 'utf8')) as WordIn[] | Record<string, WordIn[]>;
const output = Array.isArray(input)
  ? input.map(meta)
  : Object.fromEntries(Object.entries(input).map(([L, ws]) => [L, ws.map(meta)]));
console.log(JSON.stringify(output, null, 2));
