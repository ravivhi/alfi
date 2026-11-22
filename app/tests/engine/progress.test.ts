import { describe, it, expect } from 'vitest';
import { applyStepResult, markStickersShown, recordAnswers, startParentSitting } from '../../src/engine/progress.ts';
import { nextStep } from '../../src/engine/planner.ts';
import { fresh, firstStep, ans, ok, afterUnits, finishUnit, partway } from './pathHarness.ts';
import type { StepResult } from '../../src/engine/types.ts';
import type { PlannedStep } from '../../src/engine/planner.ts';

describe('progress', () => {
  it('aborted result changes nothing', () => {
    const s = fresh('d');
    const r = applyStepResult(s, firstStep(s), { outcome: 'aborted', answers: [ans('מ/name', false)], slips: 0, ms: 5 }, 0);
    expect(r.progress).toEqual(s.progress);
    expect(r.mastery).toEqual(s.mastery);
  });
  it('aborted mid-unit changes nothing either', () => {
    const s = { ...afterUnits(1, '2026-11-21'), today: '2026-11-22' };
    const r = applyStepResult(s, firstStep(s), { outcome: 'aborted', answers: [ans('מ/name', true), ans('מ/sound', false)], slips: 2, ms: 5 }, 0);
    expect(r.progress).toEqual(s.progress);
    expect(r.mastery).toEqual(s.mastery);
  });
  it('slips alone leave mastery unchanged', () => {
    const s = { ...afterUnits(1, '2026-11-21'), today: '2026-11-22' };
    const step = firstStep(s);
    expect(applyStepResult(s, step, { outcome: 'done', answers: [], slips: 4, ms: 9 }, 0).mastery).toEqual(s.mastery);
  });
  it('completing a unit adds an unshown sticker; markStickersShown flips it', () => {
    const p = finishUnit('מ');
    expect(p.stickers).toEqual([{ id: 'u:מ', day: 'd', shown: false }]);
    expect(markStickersShown(p).stickers[0].shown).toBe(true);
  });
  it('the first station sets the unit start day and answers are recorded with today', () => {
    const s = fresh('2026-11-21');
    const r = applyStepResult(s, firstStep(s), ok(['מ/name']), 7);
    expect(r.progress.unitStartDay).toEqual({ 'מ': '2026-11-21' });
    expect(r.progress.sitting).toEqual({ day: '2026-11-21', done: 1, warmupDone: false, closed: false, endShown: false, unitsStarted: 1 });
    expect(r.mastery['מ/name'].attempts).toEqual([{ day: '2026-11-21', t: 0, ok: true, kind: 'recall' }]);
  });
  it('does not mutate its input', () => {
    const s = fresh('2026-11-21');
    const before = JSON.stringify({ p: s.progress, m: s.mastery });
    const step = firstStep(s);
    applyStepResult(s, step, ok(['מ/name']), 0);
    expect(JSON.stringify({ p: s.progress, m: s.mastery })).toBe(before);
  });
  it('a passed checkpoint is recorded with its sticker and reported', () => {
    const s = { ...afterUnits(3, '2026-11-23'), today: '2026-11-24' };
    const w = firstStep(s);
    const a = applyStepResult(s, w, ok(w.items), 0);
    const s2 = { ...s, progress: a.progress, mastery: a.mastery };
    const n = nextStep(s2);
    if (n.type !== 'step' || n.step.kind !== 'checkpoint') throw new Error('expected the checkpoint');
    const r = applyStepResult(s2, n.step, ok(n.step.items), 0);
    expect(r.checkpoint).toEqual({ cpId: 'cp1', passed: n.step.items, failed: [] });
    expect(r.progress.checkpointsPassed).toEqual(['cp1']);
    expect(r.progress.stickers.filter(x => !x.shown)).toEqual([{ id: 'cp1', day: '2026-11-24', shown: false }]);
  });
  it('a failed result records its answers and leaves stationsDone, pending, the parent queue and sitting.done unchanged', () => {
    const failed = (items: string[]): StepResult => ({ outcome: 'failed', answers: items.map((x, k) => ans(x, k > 0, 'recall', k)), slips: 3, ms: 9, failLine: 'result.fail' });
    // a path station mid-sitting: the same station comes back next
    const s = partway('2026-11-21', 4);
    const step = firstStep(s);
    expect(step.kind).toBe('station');
    const r = applyStepResult(s, step, failed(['מ/name', 'מ/name']), 0);
    expect(r.progress).toEqual(s.progress);
    expect(r.mastery['מ/name'].attempts.length).toBe((s.mastery['מ/name']?.attempts.length ?? 0) + 2);
    expect(firstStep({ ...s, progress: r.progress, mastery: r.mastery })).toEqual(step);
    // a practice step: the pending head stays
    const practice: PlannedStep = { kind: 'practice', step: 'mole', unitId: 'מ', items: ['מ/name'] };
    const sp = { ...s, progress: { ...s.progress, pending: [practice] } };
    const rp = applyStepResult(sp, practice, failed(['מ/name']), 0);
    expect(rp.progress.pending).toEqual([practice]);
    expect(rp.progress.sitting).toEqual(sp.progress.sitting);
    // a parent-started practice sitting: the queue head stays
    const met = afterUnits(1, '2026-11-21');
    const sq = { ...met, progress: startParentSitting(met, 'מ') };
    const head = firstStep(sq);
    expect(head.kind).toBe('parent');
    const rq = applyStepResult(sq, head, failed(['מ/name']), 0);
    expect(rq.progress.sitting).toEqual(sq.progress.sitting);
    expect(rq.progress.stationsDone).toEqual(sq.progress.stationsDone);
  });
  it('recordAnswers changes mastery only', () => {
    const s = partway('2026-11-21', 4);
    const step = firstStep(s);
    const r = recordAnswers(s, ok(['מ/name', 'מ/sound']), 0);
    expect(r.progress).toBe(s.progress);
    expect(r.mastery['מ/name'].attempts.length).toBe((s.mastery['מ/name']?.attempts.length ?? 0) + 1);
    expect(r.mastery['מ/sound'].attempts.length).toBe((s.mastery['מ/sound']?.attempts.length ?? 0) + 1);
    expect(r.checkpoint).toBeUndefined();
    expect(firstStep({ ...s, mastery: r.mastery })).toEqual(step);
    // slips alone are no evidence
    expect(recordAnswers(s, { outcome: 'done', answers: [], slips: 5, ms: 1 }, 0).mastery).toBe(s.mastery);
  });
});
