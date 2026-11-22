import { describe, expect, it } from 'vitest';
import { cardLines, lastCheckpointLine, letterCard, letterGrid, playMinutes, weakLines } from '../../src/ui/parentText.ts';
import { newChild } from '../../src/store/schema.ts';
import type { ChildRecord } from '../../src/store/schema.ts';
import { CONTENT } from '../../src/content/index.ts';

const C = CONTENT;
const fresh = () => newChild('נועה', 4, null, '2026-11-21', 'c0');
const att = (day: string, ok: boolean, kind: 'recall' | 'match' = 'recall') => ({ day, t: 1, ok, kind });

function childWith(o: { wrong?: string; confusions?: Record<string, Record<string, number>> }): ChildRecord {
  const c = fresh();
  if (o.wrong) c.mastery[o.wrong] = { attempts: [att('2026-11-20', false)], confusions: {}, lastSeen: 1 };
  for (const [item, conf] of Object.entries(o.confusions ?? {})) {
    c.mastery[item] = { attempts: c.mastery[item]?.attempts ?? [], confusions: conf, lastSeen: 1 };
  }
  return c;
}

describe('parentText', () => {
  it('weak lines name the item and the confusion', () => {
    expect(weakLines(childWith({ wrong: 'ב/name', confusions: { 'ב/name': { 'כ': 2 } } }), C)).toEqual(['השם של ב עוד לא יציב', 'יש בלבול בין ב ל-כ']);
  });
  it('a weak sound says sound', () => {
    expect(weakLines(childWith({ wrong: 'מ/sound' }), C)).toEqual(['הצליל של מ עוד לא יציב']);
  });
  it('a confusion of one is not listed', () => {
    expect(weakLines(childWith({ confusions: { 'ב/name': { 'כ': 1 } } }), C)).toEqual(['אין כרגע נקודות חלשות']);
  });
  it('no weak items', () => expect(weakLines(fresh(), C)).toEqual(['אין כרגע נקודות חלשות']));

  it('grid lists 22 letters, untaught ones notYet', () => {
    const g = letterGrid(fresh(), C);
    expect(g.length).toBe(22);
    expect(g.map(x => x.ch).join('')).toBe('אבגדהוזחטיכלמנסעפצקרשת');
    expect(g.every(x => x.status === 'notYet')).toBe(true);
  });
  it('taught means the meet station is done (met); an answer makes it practising; known needs both items known', () => {
    const c = fresh();
    c.progress.stationsDone = ['u:מ#0'];
    expect(letterGrid(c, C).find(x => x.ch === 'מ')!.status).toBe('met');
    c.mastery['מ/sound'] = { attempts: [att('2026-11-19', true)], confusions: {}, lastSeen: 1 };
    expect(letterGrid(c, C).find(x => x.ch === 'מ')!.status).toBe('practising');
    const ok = { attempts: [att('2026-11-19', true), att('2026-11-20', true)], confusions: {}, lastSeen: 1 };
    c.mastery['מ/name'] = ok;
    c.mastery['מ/sound'] = ok;
    expect(letterGrid(c, C).find(x => x.ch === 'מ')!.status).toBe('known');
  });

  it('the grid tells which letters are in the path and which carry a practise-more mark', () => {
    const c = fresh();
    c.progress.stationsDone = ['u:מ#0', 'u:ל#0'];
    c.progress.focus = ['ל'];
    const g = letterGrid(c, C, undefined, '2026-11-21');
    expect(g.filter(x => x.inPath).map(x => x.ch).join('')).toBe('בילמצת');
    expect(g.filter(x => x.focus).map(x => x.ch)).toEqual(['ל']);
  });
  it('letter card lines: level, recall days, success, confusions, last practised', () => {
    const c = fresh();
    c.progress.stationsDone = ['u:ב#0'];
    c.mastery['ב/name'] = { attempts: [att('2026-11-18', true), att('2026-11-19', false), att('2026-11-20', false)], confusions: { 'כ': 2 }, lastSeen: 1 };
    const card = letterCard(c, 'ב', C, undefined, '2026-11-21');
    expect(card).toMatchObject({ ch: 'ב', status: 'practising', inPath: true, focus: false, canMark: true });
    expect(cardLines(card, C)).toEqual(['ימים עם זיהוי נכון: 1', 'הצלחה בתשובה הראשונה: 33%', 'מתבלבל/ת עם כ', 'תרגול אחרון: 20.11']);
    expect(cardLines(letterCard(fresh(), 'א', C, undefined, '2026-11-21'), C)).toEqual(['ימים עם זיהוי נכון: 0', 'עוד אין תשובות']);
  });

  it('play minutes for today and the last 7 days', () => {
    const c = fresh();
    c.playSeconds = { '2026-11-21': 600, '2026-11-18': 125, '2026-11-01': 900 };
    const p = playMinutes(c, '2026-11-21');
    expect(p.today).toBe(10);
    expect(p.last7).toHaveLength(7);
    expect(p.last7[0]).toEqual({ day: '2026-11-15', min: 0 });
    expect(p.last7[3]).toEqual({ day: '2026-11-18', min: 2 });
    expect(p.last7[6]).toEqual({ day: '2026-11-21', min: 10 });
  });

  it('last check-point line, none yet, passed, failed', () => {
    const c = fresh();
    expect(lastCheckpointLine(c)).toBeNull();
    c.checkpoints.push({ cpId: 'cp1', day: '2026-11-20', passed: ['מ/name', 'מ/sound', 'ל/name'], failed: [] });
    expect(lastCheckpointLine(c)).toBe('נקודת בדיקה אחרונה: מ, ל - עברה (3 מתוך 3)');
    c.checkpoints.push({ cpId: 'cp1', day: '2026-11-21', passed: ['מ/name'], failed: ['ל/name'] });
    expect(lastCheckpointLine(c)).toBe('נקודת בדיקה אחרונה: מ, ל - לא עברה, מתרגלים ל');
  });
});
