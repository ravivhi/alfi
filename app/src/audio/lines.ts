import { LINE_IDS, type LettersContent } from '../content/schema.ts';

export const DEFAULT_RATE = 0.9;
export const SOUND_RATE = 0.75;

export const audioKey = (text: string, rate = DEFAULT_RATE): string => text + '|' + String(rate);

export interface LineVars { name?: string; sound?: string; word?: string }

const PLACEHOLDER = /\{(name|sound|word)\}/g;

/** The spoken text of a content line with its placeholders filled. Throws on an unknown id or an unfilled placeholder. */
export function line(c: LettersContent, id: string, vars: LineVars = {}): string {
  const t = c.lines[id];
  if (t === undefined) throw new Error(`unknown line id: ${id}`);
  const out = t.replace(PLACEHOLDER, (_m, k: keyof LineVars) => {
    const v = vars[k];
    if (v === undefined) throw new Error(`line ${id}: no value for {${k}}`);
    return v;
  });
  if (/[{}]/.test(out)) throw new Error(`line ${id}: unfilled placeholder in "${out}"`);
  return out.normalize('NFC');
}

/**
 * The on-screen caption of a recall question: the line with its placeholder values left out ('...'), so the caption
 * never shows the answer's shape (the letter in a name or a sound). The voice still says the full line.
 */
export function captionLine(c: LettersContent, id: string): string {
  const t = c.lines[id];
  if (t === undefined) throw new Error(`unknown line id: ${id}`);
  return t.replace(PLACEHOLDER, '...').normalize('NFC');
}

export interface SpokenLine { file: string; text: string; rate: number; category: string; pitch: 1.05 }

/** Every concrete line the app can speak, in the shape of the audio pipeline manifest. */
export function allSpokenLines(c: LettersContent): SpokenLine[] {
  const out: SpokenLine[] = [];
  const seen = new Set<string>();
  const add = (file: string, text: string, rate: number, category: string) => {
    const t = text.normalize('NFC');
    const key = audioKey(t, rate);
    if (!t || seen.has(key)) return;
    seen.add(key);
    out.push({ file, text: t, rate, category, pitch: 1.05 });
  };
  const six = c.order.filter(L => c.letters[L]);
  const latin = (L: string) => c.alphabet[L].latin;

  for (const id of LINE_IDS) {
    const tpl = c.lines[id];
    if (tpl === undefined) continue;
    const uses = new Set([...tpl.matchAll(PLACEHOLDER)].map(m => m[1]));
    if (!uses.size) { add(`lines/${id}.mp3`, line(c, id), DEFAULT_RATE, 'lines'); continue; }
    // find.wrong names any letter; match.ask2 names the look-alike of a path letter
    const letters = id === 'find.wrong' ? Object.keys(c.alphabet)
      : id === 'match.ask2' ? [...new Set(six.map(L => c.lookAlikes[L]?.[0]).filter((x): x is string => !!x))]
      : six;
    for (const L of letters) {
      const base: LineVars = { name: c.alphabet[L]?.name, sound: c.letters[L]?.soundSay };
      if (uses.has('word')) {
        (c.letters[L]?.words ?? []).forEach((w, i) => add(`lines/${id}__${latin(L)}__${i}.mp3`, line(c, id, { ...base, word: w.word }), DEFAULT_RATE, 'lines'));
      } else {
        add(`lines/${id}__${latin(L)}.mp3`, line(c, id, base), id === 'soundPick.ask' ? SOUND_RATE : DEFAULT_RATE, 'lines');
      }
    }
  }
  for (const L of Object.keys(c.alphabet)) add(`letters/name_${latin(L)}.mp3`, c.alphabet[L].name, DEFAULT_RATE, 'letters');
  for (const L of six) add(`letters/sound_${latin(L)}.mp3`, c.letters[L].soundSay, SOUND_RATE, 'letters');
  for (const L of six) c.letters[L].words.forEach((w, i) => add(`words/${latin(L)}_${i}.mp3`, w.word, DEFAULT_RATE, 'words'));
  c.distractorWords.forEach((w, i) => add(`words/distractor_${i}.mp3`, w.word, DEFAULT_RATE, 'words'));
  c.praise.forEach((p, i) => add(`praise/praise_${i}.mp3`, p, DEFAULT_RATE, 'praise'));
  return out;
}
