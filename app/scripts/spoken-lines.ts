// Writes content/spoken-lines.json: every line the app can speak for letters-3-5.json (manifest shape of the audio pipeline).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { allSpokenLines } from '../src/audio/lines.ts';
import type { LettersContent } from '../src/content/schema.ts';

const src = fileURLToPath(new URL('../content/letters-3-5.json', import.meta.url));
const dst = fileURLToPath(new URL('../content/spoken-lines.json', import.meta.url));
const content = JSON.parse(readFileSync(src, 'utf8')) as LettersContent;
const lines = allSpokenLines(content);
writeFileSync(dst, JSON.stringify(lines, null, 1) + '\n');
console.log(`wrote ${lines.length} spoken lines to ${dst}`);
