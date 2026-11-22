import { describe, it, expect } from 'vitest';
import { nextStep, sittingStatus, previewSitting } from '../../src/engine/planner.ts';
import { applyStepResult, markStickersShown, startParentSitting, toggleFocus } from '../../src/engine/progress.ts';
import type { PathProgress, PlannedStep, PlannerInput } from '../../src/engine/planner.ts';
import type { MasteryRecord } from '../../src/engine/mastery.ts';
import { activeFocus, introOrder, isFinished, isPathComplete } from '../../src/engine/pathRules.ts';
import { expandPath, parseItem } from '../../src/engine/curriculum.ts';
import { addDays } from '../../src/util/day.ts';
import { c, fresh, steps, kinds, stepOf, afterUnits, afterRetryPassed, allDone, partway, withSittingDay, runDay, firstStep, ok } from './pathHarness.ts';

describe('planner', () => {
  it('fresh child: unit 1 stations in order (5 teaching stations, paint right after drive, then all 5 games), then sittingDone', () => expect(steps(fresh('2026-11-21'))).toEqual(['meet', 'find', 'drive', 'paint', 'firstSound', 'plane', 'race', 'mole', 'match', 'jump', 'end:sittingDone']));
  it('same day after a unit, the next sitting starts the next unit', () => {
    const s = afterUnits(1, '2026-11-21');
    const r = runDay(s);
    const content = r.trace.filter(n => n.type === 'step' && n.step.kind !== 'warmup');
    expect(content.length).toBeGreaterThan(0);
    const first = content[0];
    expect(first.type === 'step' && first.step.step).toBe('meet');
    expect(first.type === 'step' && first.step.unitId).toBe('ל');
    expect(r.trace[r.trace.length - 1]).toEqual({ type: 'end', reason: 'sittingDone' });
  });
  it('after unit 3 the same day, the next sitting is a practice sitting', () => {
    const s = afterUnits(3, '2026-11-23');
    const r = runDay(s);
    const played = r.trace.flatMap(n => (n.type === 'step' ? [n.step] : []));
    expect(played.map(p => p.kind)).toEqual(['warmup', 'station']);
    const game = played[1];
    expect(c.gameRotation).toContain(game.step);
    expect(['מ', 'ל', 'ב']).toContain(game.unitId);
    expect(played.map(p => p.step)).not.toContain('meet');
    expect(r.trace[r.trace.length - 1]).toEqual({ type: 'end', reason: 'sittingDone' });
    // practice sittings repeat without limit, and none of them moves the path
    expect(kinds(r.state).filter(k => !k.startsWith('end:')).slice(-1)[0]).toBe('station');
    expect(r.state.progress.stationsDone).toEqual(s.progress.stationsDone);
  });
  it('cp1 is due the next day', () => {
    let s = fresh('2026-11-21');
    for (let k = 0; k < 3; k++) s = runDay(s).state; // three letters in three sittings on one day
    expect(s.progress.checkpointsPassed).toEqual([]);
    expect(kinds(s)).not.toContain('checkpoint');
    expect(kinds(s, '2026-11-22').slice(0, 2)).toEqual(['warmup', 'checkpoint']);
  });
  it('a sitting never introduces more than one new unit (3-5)', () => {
    let s = fresh('2026-11-21');
    for (let d = 0; d < 4; d++) {
      const day = addDays('2026-11-21', d);
      for (let k = 0; k < 4; k++) {
        const r = runDay(s, day);
        expect(r.trace.filter(n => n.type === 'step' && n.step.step === 'meet').length).toBeLessThanOrEqual(1);
        s = r.state;
      }
    }
    expect(s.progress.checkpointsPassed).toContain('cp1');
  });
  it('no limit: sittingStatus is ready after any number of closed sittings the same day', () => {
    let s: PlannerInput = { ...fresh('2026-11-21'), minutesToday: 999, dailyLimitMin: 20 };
    for (let k = 0; k < 10; k++) {
      const r = runDay(s);
      expect(r.trace[0].type).toBe('step');
      s = r.state;
      expect(sittingStatus(s)).toBe('ready');
    }
  });
  it('extraSittingDay is ignored', () => {
    const s = afterUnits(1, '2026-11-21');
    const unlocked = { ...s, progress: { ...s.progress, extraSittingDay: '2026-11-21' } };
    expect(runDay(unlocked).trace.map(stepOf)).toEqual(runDay(s).trace.map(stepOf));
  });
  it('next day starts with a warm-up on the item with an uncleared error', () => {
    const s = afterUnits(1, '2026-11-21', { wrong: 'מ/name' });
    const n = nextStep({ ...s, today: '2026-11-22' });
    expect(n.type === 'step' && n.step.kind).toBe('warmup');
    expect(n.type === 'step' && n.step.items).toEqual(['מ/name']);
    expect(n.type === 'step' && n.step.params).toEqual({ rounds: 2 });
  });
  it('after 3 units the next sitting is warm-up, checkpoint cp1, then unit 4', () => {
    const k = kinds(afterUnits(3, '2026-11-23'), '2026-11-24');
    expect(k.slice(0, 3)).toEqual(['warmup', 'checkpoint', 'station']);
    expect(steps(afterUnits(3, '2026-11-23'), '2026-11-24')[2]).toBe('meet');
  });
  it('failed checkpoint inserts practice for failed items then a retry, and unit 4 does not start', () => {
    const opts = { failCheckpointItem: 'ל/name' };
    expect(kinds(afterUnits(3, '2026-11-23'), '2026-11-24', opts).slice(1)).toEqual(['checkpoint', 'practice', 'practice', 'checkpoint', 'end:sittingDone']);
    expect(steps(afterUnits(3, '2026-11-23'), '2026-11-24', opts).slice(2, 4)).toEqual(['find', 'mole']);
  });
  it('passing the retry moves on to unit 4 in the next sitting', () => {
    const s = afterRetryPassed(afterUnits(3, '2026-11-23'), '2026-11-24');
    expect(kinds(s, '2026-11-25')).not.toContain('checkpoint');
    expect(kinds(s, '2026-11-25')[1]).toBe('station');
    expect(steps(s, '2026-11-25')[1]).toBe('meet');
  });
  it('a failed retry closes the sitting; the practice and retry wait for the next sitting', () => {
    const r = runDay(afterUnits(3, '2026-11-23'), '2026-11-24', { failAlways: 'ל/name' });
    const k = r.trace.map(n => (n.type === 'end' ? 'end:' + n.reason : n.step.kind));
    expect(k.slice(1)).toEqual(['checkpoint', 'practice', 'practice', 'checkpoint', 'end:sittingDone']);
    expect(r.state.progress.pending.map(p => p.kind)).toEqual(['practice', 'practice', 'checkpoint']);
    expect(r.state.progress.checkpointsPassed).toEqual([]);
    expect(kinds(r.state).filter(k => k !== 'warmup')[0]).toBe('practice');
    expect(kinds(r.state, '2026-11-25').slice(1, 5)).toEqual(['practice', 'practice', 'checkpoint', 'end:sittingDone']);
  });
  it('a retry that fails again in a later sitting the same day closes that sitting: no practice / retry loop', () => {
    const first = runDay(afterUnits(3, '2026-11-23'), '2026-11-24', { failAlways: 'ל/name' }).state;
    const r = runDay(first, undefined, { failAlways: 'ל/name' });
    expect(r.trace.map(n => (n.type === 'end' ? 'end:' + n.reason : n.step.kind)).filter(k => k !== 'warmup')).toEqual(['practice', 'practice', 'checkpoint', 'end:sittingDone']);
    expect(r.state.progress.pending.map(p => p.kind)).toEqual(['practice', 'practice', 'checkpoint']);
    expect(r.state.progress.sitting?.closed).toBe(true);
  });
  it('the end reason follows the sitting, not leftover unshown stickers', () => {
    const s = afterUnits(1, '2026-11-21');
    const stale = { ...s, progress: { ...s.progress, stickers: [...s.progress.stickers, { id: 'old', day: '2026-11-01', shown: false }] } };
    expect(stepOf(nextStep(stale))).toBe('meet');
  });
  it('an end screen before the sitting closes does not mark its later close as shown', () => {
    const s = partway('2026-11-21', 2);
    const afterLimitScreen = { ...s, progress: markStickersShown(s.progress) };
    expect(afterLimitScreen.progress.sitting?.endShown).toBe(false);
    expect(steps(afterLimitScreen).slice(-1)[0]).toBe('end:sittingDone');
  });
  it('no daily limit: dailyLimitMin is ignored', () => expect(stepOf(nextStep({ ...fresh('2026-11-21'), minutesToday: 60, dailyLimitMin: 20 }))).toBe('meet'));
  it('6-8 runs two units per sitting', () => expect(steps({ ...fresh('2026-11-21'), band: '6-8' }).filter(s => s === 'meet').length).toBe(2));
  it('an interrupted unit resumes at the next undone station the same day', () => expect(stepOf(nextStep(partway('2026-11-21', 2)))).toBe('drive'));
  it('an aborted station resumes the same station the same day', () => {
    const s = partway('2026-11-21', 2);
    const n = nextStep(s);
    if (n.type !== 'step') throw new Error('expected a step');
    const r = applyStepResult(s, n.step, { outcome: 'aborted', answers: [], slips: 1, ms: 3 }, 0);
    expect(stepOf(nextStep({ ...s, progress: r.progress, mastery: r.mastery }))).toBe('drive');
  });
  it('a future day stored by a moved-back clock does not block the path', () => expect(sittingStatus(withSittingDay(fresh('2026-11-21'), '2027-01-01', { closed: true }))).toBe('ready'));
  it('a unit start day in the future does not count as started today', () => {
    const s = afterUnits(1, '2027-01-01');
    expect(sittingStatus({ ...s, today: '2026-11-21' })).toBe('ready');
    expect(steps(s, '2026-11-21')).toContain('meet');
  });
  it('everything done: a review sitting closes like any sitting, and review sittings repeat without limit', () => {
    const done = allDone('2026-12-01');
    // the sitting that completed the path closed too: more review the same day
    expect(done.progress.sitting?.closed).toBe(true);
    expect(kinds(done)).toContain('review');
    let s = { ...done, today: '2026-12-02' };
    for (let k = 0; k < 3; k++) {
      const r = runDay(s);
      const ks = r.trace.map(n => (n.type === 'end' ? 'end:' + n.reason : n.step.kind));
      expect(ks.filter(x => x !== 'warmup')).toEqual(['review', 'end:sittingDone']);
      s = r.state;
      expect(sittingStatus(s)).toBe('ready');
    }
  });
  it('an older save without unitsStarted: the open sitting that already started a unit today starts no second one', () => {
    const s = afterUnits(1, '2026-11-21');
    const old = withSittingDay(s, '2026-11-21', { done: 5 }); // open, no unitsStarted field
    expect(old.progress.sitting && 'unitsStarted' in old.progress.sitting).toBe(false);
    expect(stepOf(nextStep(old))).toBe('end:sittingDone');
  });
  it('preview of a fresh child lists the 10 unit stations', () => expect(previewSitting(fresh('2026-11-21')).length).toBe(10));
  it('sitting status: ready after a closed sitting, also when its end screen is still to be shown', () => {
    expect(sittingStatus(afterUnits(1, '2026-11-21'))).toBe('ready');
    const s = partway('2026-11-21', 9);
    const n = nextStep(s);
    if (n.type !== 'step') throw new Error('expected the last station');
    const r = applyStepResult(s, n.step, { outcome: 'done', answers: [], slips: 0, ms: 0 }, 0);
    const closed = { ...s, progress: r.progress, mastery: r.mastery };
    expect(stepOf(nextStep(closed))).toBe('end:sittingDone');
    expect(sittingStatus(closed)).toBe('ready');
  });
  it('a warm-up opens each sitting, not only the first of the day', () => {
    const s = afterUnits(3, '2026-11-23');
    expect(s.progress.sitting?.warmupDone).toBe(true); // the day's first sitting had one
    expect(kinds(s)[0]).toBe('warmup');
  });
});

const rec = (...a: [string, boolean][]): MasteryRecord => ({ attempts: a.map(([day, okv], k) => ({ day, t: 5 + k, ok: okv, kind: 'recall' as const })), confusions: {}, lastSeen: 5 + a.length });
const playedOf = (r: ReturnType<typeof runDay>): PlannedStep[] => r.trace.flatMap(n => (n.type === 'step' ? [n.step] : []));
const withFocus = (s: PlannerInput, focus: string[]): PlannerInput => ({ ...s, progress: { ...s.progress, focus } });

describe('practise-more marks', () => {
  it('a marked letter wins the warm-up over an equally weak unmarked one; weak items still come first', () => {
    const s0 = afterUnits(2, '2026-11-21');
    const s = { ...s0, today: '2026-11-22', mastery: { ...s0.mastery, 'מ/name': rec(['2026-11-21', false]), 'ל/name': rec(['2026-11-21', false]) } };
    expect(firstStep(s).items).toEqual(['מ/name']);
    expect(firstStep(withFocus(s, ['ל']))).toMatchObject({ kind: 'warmup', items: ['ל/name'] });
    // only מ is weak: the mark on ל does not beat a weak item
    const one = { ...s, mastery: { ...s0.mastery, 'מ/name': rec(['2026-11-21', false]) } };
    expect(firstStep(withFocus(one, ['ל'])).items).toEqual(['מ/name']);
  });
  it('a marked letter is the game unit of a practice sitting', () => {
    const s = afterUnits(3, '2026-11-23');
    const gameUnit = (x: PlannerInput) => playedOf(runDay(x)).filter(p => p.kind === 'station').map(p => p.unitId);
    const plain = gameUnit(s);
    expect(plain).toHaveLength(1);
    const other = ['מ', 'ל', 'ב'].find(u => u !== plain[0]) as string;
    expect(gameUnit(withFocus(s, [other]))).toEqual([other]);
  });
  it('marks are only for met letters, at most 3; a 4th is refused until one is removed', () => {
    const s = afterUnits(4, '2026-11-24');
    expect(s.progress.unitStartDay['ת']).toBe('2026-11-24');
    expect(toggleFocus(s, 'י')).toEqual({ progress: s.progress, result: 'notMet' });
    let p: PathProgress = s.progress;
    for (const u of ['מ', 'ל', 'ב']) {
      const r = toggleFocus({ ...s, progress: p }, u);
      expect(r.result).toBe('added');
      p = r.progress;
    }
    expect(p.focus).toEqual(['מ', 'ל', 'ב']);
    const full = toggleFocus({ ...s, progress: p }, 'ת');
    expect(full.result).toBe('full');
    expect(full.progress).toBe(p);
    const off = toggleFocus({ ...s, progress: p }, 'ל');
    expect(off.result).toBe('removed');
    expect(off.progress.focus).toEqual(['מ', 'ב']);
    expect(toggleFocus({ ...s, progress: off.progress }, 'ת').progress.focus).toEqual(['מ', 'ב', 'ת']);
  });
  it('a mark clears 3 days after the letter becomes known', () => {
    const s0 = afterUnits(2, '2026-11-22');
    const known = rec(['2026-11-25', true], ['2026-11-26', true]);
    const s = withFocus({ ...s0, mastery: { ...s0.mastery, 'מ/name': known, 'מ/sound': known } }, ['מ', 'ל']);
    expect(activeFocus({ ...s, today: '2026-11-28' })).toEqual(['מ', 'ל']);
    expect(activeFocus({ ...s, today: '2026-11-29' })).toEqual(['ל']);
    // the next played step drops the cleared mark from the save
    const later = { ...s, today: '2026-11-29' };
    const w = firstStep(later);
    expect(applyStepResult(later, w, ok(w.items), 0).progress.focus).toEqual(['ל']);
  });
  it('marks never change the path order or the check-point rules', () => {
    const s = afterUnits(3, '2026-11-23');
    const marked = withFocus(s, ['ב']);
    const path = (x: PlannerInput) => playedOf(runDay(x, '2026-11-24')).filter(p => p.kind !== 'warmup').map(p => p.kind + ':' + (p.kind === 'station' ? p.stationId : p.cpId));
    expect(path(marked)).toEqual(path(s));
    expect(path(s).slice(0, 2)).toEqual(['checkpoint:cp1', 'station:u:ת#0']);
  });
});

describe('parent-started sitting on a letter', () => {
  it('a met letter: find, sound pick, drive and one game on that letter; answers are recorded; the path does not move', () => {
    const s0 = { ...afterUnits(2, '2026-11-22'), today: '2026-11-23' };
    const s = { ...s0, progress: startParentSitting(s0, 'מ') };
    expect(previewSitting(s)).toHaveLength(4);
    const r = runDay(s);
    const played = playedOf(r);
    expect(played.map(p => p.kind)).toEqual(['parent', 'parent', 'parent', 'parent']);
    expect(played.slice(0, 3).map(p => p.step)).toEqual(['find', 'soundPick', 'drive']);
    expect(c.gameRotation).toContain(played[3].step);
    expect(played.every(p => p.unitId === 'מ')).toBe(true);
    expect(r.trace[r.trace.length - 1]).toEqual({ type: 'end', reason: 'sittingDone' });
    expect(r.state.mastery['מ/name'].attempts.some(a => a.day === '2026-11-23')).toBe(true);
    expect(r.state.mastery['מ/sound'].attempts.some(a => a.day === '2026-11-23')).toBe(true);
    expect(r.state.progress.stationsDone).toEqual(s0.progress.stationsDone);
    expect(r.state.progress.unitStartDay).toEqual(s0.progress.unitStartDay);
    // the next sitting goes on with the path: the next letter
    const next = playedOf(runDay(r.state)).filter(p => p.kind !== 'warmup');
    expect(next[0]).toMatchObject({ kind: 'station', step: 'meet', unitId: 'ב' });
  });
  it('a letter not met yet moves into the path now; the path continues in curriculum order; check-point blocks follow introduction order', () => {
    const s0 = { ...afterUnits(2, '2026-11-22'), today: '2026-11-23' };
    const s = { ...s0, progress: startParentSitting(s0, 'י') };
    const r = runDay(s);
    const played = playedOf(r);
    expect(played.map(p => p.stationId)).toEqual(Array.from({ length: 10 }, (_, k) => 'u:י#' + k));
    expect(played[0]).toMatchObject({ kind: 'station', step: 'meet', unitId: 'י' });
    const p = r.state.progress;
    expect(p.unitStartDay['י']).toBe('2026-11-23');
    expect(p.introOrder).toEqual(['מ', 'ל', 'י']);
    expect(p.stickers.map(x => x.id)).toContain('u:י');
    // the same day: the block מ ל י waits for its check-point on a later day, so only a practice sitting
    expect(kinds(r.state).filter(k => k !== 'warmup')).toEqual(['station', 'end:sittingDone']);
    expect(steps(r.state)).not.toContain('meet');
    // the next day: check-point 1 on מ ל י, then the next unstarted letter in curriculum order (ב)
    const d24 = runDay(r.state, '2026-11-24');
    const cp1 = playedOf(d24).find(x => x.kind === 'checkpoint') as PlannedStep;
    expect(cp1.cpId).toBe('cp1');
    expect(cp1.items.slice(0, 3).map(i => parseItem(i).unit)).toEqual(['מ', 'ל', 'י']);
    expect(playedOf(d24).find(x => x.step === 'meet')?.unitId).toBe('ב');
    // then ת and צ: check-point 2 covers the next 3 by introduction order (ב ת צ)
    const d25 = runDay(d24.state, '2026-11-25');
    expect(playedOf(d25).find(x => x.step === 'meet')?.unitId).toBe('ת');
    const d26 = runDay(d25.state, '2026-11-26');
    expect(playedOf(d26).find(x => x.step === 'meet')?.unitId).toBe('צ');
    const d27 = runDay(d26.state, '2026-11-27');
    const cp2 = playedOf(d27).find(x => x.kind === 'checkpoint') as PlannedStep;
    expect(cp2.cpId).toBe('cp2');
    expect(cp2.items.slice(0, 3).map(i => parseItem(i).unit)).toEqual(['ב', 'ת', 'צ']);
    expect(isPathComplete(d27.state.progress, expandPath(c, '3-5'))).toBe(true);
  });
  it('a parent sitting left halfway resumes on the next start the same day, without a warm-up; the next day it is gone', () => {
    const s0 = { ...afterUnits(2, '2026-11-22'), today: '2026-11-23' };
    let s: PlannerInput = { ...s0, progress: startParentSitting(s0, 'מ') };
    const find = firstStep(s);
    expect(find).toMatchObject({ kind: 'parent', step: 'find' });
    const r = applyStepResult(s, find, ok(['מ/name']), 0);
    s = { ...s, progress: r.progress, mastery: r.mastery };
    expect(firstStep(s)).toMatchObject({ kind: 'parent', step: 'soundPick' });
    expect(firstStep({ ...s, today: '2026-11-24' }).kind).toBe('warmup');
  });
  it('a letter outside the path cannot start a sitting', () => {
    const s0 = afterUnits(1, '2026-11-21');
    expect(startParentSitting(s0, 'א')).toBe(s0.progress);
  });
});

describe('introduction order and older saves', () => {
  it('an older save without introOrder derives it from the unit start days and plays as before', () => {
    const s = afterUnits(3, '2026-11-23');
    const old: PathProgress = { ...s.progress };
    delete old.introOrder;
    expect(introOrder({ ...old, unitStartDay: { 'מ': '2026-11-23', 'ל': '2026-11-21', 'ב': '2026-11-22' } }, expandPath(c, '3-5'))).toEqual(['ל', 'ב', 'מ']);
    expect(introOrder(old, expandPath(c, '3-5'))).toEqual(['מ', 'ל', 'ב']);
    expect(kinds({ ...s, progress: old }, '2026-11-24').slice(0, 3)).toEqual(['warmup', 'checkpoint', 'station']);
  });
  it('a unit finished under the one-game layout (its sticker is there) stays finished', () => {
    const s = afterUnits(1, '2026-11-21');
    const old = { ...s, progress: { ...s.progress, stationsDone: s.progress.stationsDone.filter(id => !/#[5-9]$/.test(id)) } };
    expect(old.progress.stationsDone).toHaveLength(5);
    expect(isFinished(old.progress, expandPath(c, '3-5')[0])).toBe(true);
    expect(playedOf(runDay(old, '2026-11-22')).find(p => p.kind === 'station')).toMatchObject({ step: 'meet', unitId: 'ל' });
  });
});
