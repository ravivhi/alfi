// Parent-facing text for the parent page: pure functions over a child record. Gender-neutral Hebrew.
import type { ChildRecord } from '../store/schema.ts';
import type { LettersContent } from '../content/schema.ts';
import type { Curriculum } from '../engine/types.ts';
import { expandPath, itemId, parseItem } from '../engine/curriculum.ts';
import { activeFocus, isStarted, unitNode } from '../engine/pathRules.ts';
import { isWeak, letterLevel, topConfusions, unitCard } from '../engine/mastery.ts';
import type { LetterLevel, UnitCard } from '../engine/mastery.ts';
import { ageNow, bandForAge } from '../engine/age.ts';
import { addDays } from '../util/day.ts';
import curriculumJson from '../../content/curriculum-letters.json';

const CURRICULUM = curriculumJson as unknown as Curriculum;
const ALEFBET = 'אבגדהוזחטיכלמנסעפצקרשת';

const glyph = (c: LettersContent, unit: string): string => c.letters[unit]?.glyph ?? unit;

export const NO_WEAK = 'אין כרגע נקודות חלשות';

export function weakLines(child: ChildRecord, c: LettersContent, cur: Curriculum = CURRICULUM): string[] {
  const weak: string[] = [];
  const conf: string[] = [];
  for (const u of cur.units) {
    for (const k of cur.itemKinds) {
      const rec = child.mastery[itemId(u.id, k)];
      if (isWeak(rec)) weak.push(`${k === 'sound' ? 'הצליל' : 'השם'} של ${glyph(c, u.id)} עוד לא יציב`);
      for (const other of topConfusions(rec)) {
        const t = `יש בלבול בין ${glyph(c, u.id)} ל-${glyph(c, other)}`;
        if (!conf.includes(t)) conf.push(t);
      }
    }
  }
  const out = [...weak, ...conf];
  return out.length ? out : [NO_WEAK];
}

function unitsOf(items: string[], c: LettersContent): string {
  const seen: string[] = [];
  for (const it of items) {
    const g = glyph(c, parseItem(it).unit);
    if (!seen.includes(g)) seen.push(g);
  }
  return seen.join(', ');
}

export function checkpointLine(cp: ChildRecord['checkpoints'][number], c: LettersContent): string {
  const all = [...cp.passed, ...cp.failed];
  if (cp.failed.length === 0) return `${unitsOf(all, c)} - עברה (${cp.passed.length} מתוך ${all.length})`;
  return `${unitsOf(all, c)} - לא עברה, מתרגלים ${unitsOf(cp.failed, c)}`;
}

export function lastCheckpointLine(child: ChildRecord, c: LettersContent = emptyContent()): string | null {
  const cp = child.checkpoints[child.checkpoints.length - 1];
  return cp ? 'נקודת בדיקה אחרונה: ' + checkpointLine(cp, c) : null;
}

// Only the glyph lookup is needed; the unit id is the letter itself, so a missing content falls back to it.
function emptyContent(): LettersContent {
  return { letters: {} } as unknown as LettersContent;
}

export const LEVEL_WORD: Record<LetterLevel, string> = { known: 'יודע/ת', practising: 'בלימוד', met: 'הכיר/ה', notYet: 'עוד לא' };

export interface GridLetter {
  ch: string;
  status: LetterLevel;
  /** A "practise more" mark is on it. */
  focus: boolean;
  /** The letter is in the child's path (a sitting can start on it). */
  inPath: boolean;
}

function viewOf(child: ChildRecord, cur: Curriculum, today?: string) {
  const day = today ?? child.age.setOn;
  const band = bandForAge(ageNow(child.age, day));
  const path = expandPath(cur, band);
  const focus = activeFocus({ curriculum: cur, band, progress: child.progress, mastery: child.mastery, today: day });
  return { path, focus };
}

function gridLetter(child: ChildRecord, cur: Curriculum, view: ReturnType<typeof viewOf>, ch: string): GridLetter {
  const node = unitNode(view.path, ch);
  const recs = node ? cur.itemKinds.map(k => child.mastery[itemId(ch, k)]) : [];
  return { ch, status: letterLevel(recs, node ? isStarted(child.progress, node) : false), focus: view.focus.includes(ch), inPath: !!node };
}

export function letterGrid(child: ChildRecord, _c: LettersContent, cur: Curriculum = CURRICULUM, today?: string): GridLetter[] {
  const view = viewOf(child, cur, today);
  return [...ALEFBET].map(ch => gridLetter(child, cur, view, ch));
}

export interface LetterCard extends GridLetter {
  /** Marks are only for letters already met. */
  canMark: boolean;
  /** The marks in force (at most 3). */
  marks: string[];
  stats: UnitCard;
}

export function letterCard(child: ChildRecord, ch: string, _c: LettersContent, cur: Curriculum = CURRICULUM, today?: string): LetterCard {
  const view = viewOf(child, cur, today);
  const g = gridLetter(child, cur, view, ch);
  const node = unitNode(view.path, ch);
  const recs = node ? cur.itemKinds.map(k => child.mastery[itemId(ch, k)]) : [];
  return { ...g, canMark: !!node && isStarted(child.progress, node), marks: view.focus, stats: unitCard(recs) };
}

// The card's numbers as parent-facing lines.
export function cardLines(card: LetterCard, c: LettersContent): string[] {
  const s = card.stats;
  const out = [`ימים עם זיהוי נכון: ${s.recallDays}`];
  out.push(s.firstTryRate === null ? 'עוד אין תשובות' : `הצלחה בתשובה הראשונה: ${Math.round(s.firstTryRate * 100)}%`);
  if (s.confusions.length) out.push(`מתבלבל/ת עם ${s.confusions.map(u => glyph(c, u)).join(', ')}`);
  if (s.lastDay) out.push(`תרגול אחרון: ${shortDay(s.lastDay)}`);
  return out;
}

// 'YYYY-MM-DD' -> 'DD.MM'
export const shortDay = (day: string): string => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

export function playMinutes(child: ChildRecord, today: string): { today: number; last7: { day: string; min: number }[] } {
  const min = (day: string) => Math.floor((child.playSeconds[day] ?? 0) / 60);
  const last7: { day: string; min: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    last7.push({ day, min: min(day) });
  }
  return { today: min(today), last7 };
}
