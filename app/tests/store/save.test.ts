import { describe, expect, it, vi } from 'vitest';
import { memoryKV } from '../../src/store/kv.ts';
import type { KV } from '../../src/store/kv.ts';
import { freshSave, isSaveData, newChild } from '../../src/store/schema.ts';
import type { SaveData } from '../../src/store/schema.ts';
import { checksum, loadSave, parseEnvelope, saveNow, scheduleNativeBackup } from '../../src/store/save.ts';
import type { NativeBackup } from '../../src/platform/native.ts';
import { exportChild, parseImport } from '../../src/store/exportImport.ts';
import { c as curriculum, fresh, run, scriptedResult, msOf } from '../engine/pathHarness.ts';
import type { PlannerInput } from '../../src/engine/planner.ts';
import type { ChildRecord } from '../../src/store/schema.ts';

const data1: SaveData = { ...freshSave(), settings: { ...freshSave().settings, voiceVolume: 0.5 } };
const data2: SaveData = { ...freshSave(), settings: { ...freshSave().settings, voiceVolume: 0.9 } };

function envelope(data: SaveData, seq: number): string {
  return JSON.stringify({ v: 1, seq, savedAt: 1, sum: checksum(JSON.stringify(data)), data });
}
const kvWith = (raw: string) => memoryKV({ 'alfi.app.save': raw });
const fakeNative = (raw: string | null): NativeBackup => ({ read: () => raw, write: () => true });
function withPrimaryAndPrev(o: { corruptPrimary: boolean }): KV {
  const primary = envelope(data2, 2);
  return memoryKV({
    'alfi.app.save': o.corruptPrimary ? primary.replace('0.9', '0.1') : primary,
    'alfi.app.save.prev': envelope(data1, 1),
  });
}
function throwingKV(primary: string): KV {
  const kv = memoryKV({ 'alfi.app.save': primary });
  return { ...kv, set: () => { throw new Error('quota'); } };
}

describe('save', () => {
  it('fresh when nothing is stored', () => expect(loadSave(memoryKV(), null, 1).source).toBe('fresh'));
  it('falls back to prev when the primary checksum fails and quarantines the primary', () => {
    const kv = withPrimaryAndPrev({ corruptPrimary: true });
    const r = loadSave(kv, null, 99);
    expect(r.source).toBe('prev');
    expect(kv.get('alfi.app.save.bad.99')).not.toBeNull();
  });
  it('uses the native backup when web storage is empty', () => expect(loadSave(memoryKV(), fakeNative(envelope(data1, 5)), 1).source).toBe('native'));
  it('picks the highest seq among valid copies', () => expect(loadSave(kvWith(envelope(data1, 3)), fakeNative(envelope(data2, 7)), 1).seq).toBe(7));
  it('save never overwrites an unreadable primary without quarantining it', () => {
    const kv = memoryKV({ 'alfi.app.save': '{broken' });
    saveNow(kv, freshSave(), 0, 42);
    expect(kv.get('alfi.app.save.bad.42')).toBe('{broken');
  });
  it('save rotates a valid primary to prev', () => {
    const kv = kvWith(envelope(data1, 1));
    saveNow(kv, data2, 1, 2);
    expect(parseEnvelope(kv.get('alfi.app.save.prev'))).toMatchObject({ ok: true, seq: 1 });
    expect(parseEnvelope(kv.get('alfi.app.save'))).toMatchObject({ ok: true, seq: 2 });
  });
  it('keeps at most 3 bad copies', () => {
    const kv = memoryKV();
    for (let i = 0; i < 5; i++) { kv.set('alfi.app.save', 'x' + i); loadSave(kv, null, i); }
    expect(kv.keys().filter((k) => k.startsWith('alfi.app.save.bad.')).length).toBe(3);
  });
  it('write failure reports ok:false and leaves the previous primary intact', () => {
    const kv = throwingKV(envelope(data1, 4));
    expect(saveNow(kv, data2, 4, 5).ok).toBe(false);
    expect(parseEnvelope(kv.get('alfi.app.save'))).toMatchObject({ ok: true, seq: 4 });
  });
  it('a future schema is not overwritten', () => {
    const kv = kvWith(envelope({ ...data1, schema: 2 } as any, 9));
    loadSave(kv, null, 7);
    expect(kv.get('alfi.app.save.bad.7')).not.toBeNull();
  });
  it('reasons: empty, json, checksum, schema', () => {
    expect(parseEnvelope(null)).toEqual({ ok: false, reason: 'empty' });
    expect(parseEnvelope('{x')).toEqual({ ok: false, reason: 'json' });
    expect(parseEnvelope(envelope(data1, 1).replace('0.5', '0.6'))).toEqual({ ok: false, reason: 'checksum' });
    expect(parseEnvelope(envelope({ schema: 1 } as any, 1))).toEqual({ ok: false, reason: 'schema' });
  });
  it('fresh load writes nothing; the first saveNow writes seq 1', () => {
    const kv = memoryKV();
    const r = loadSave(kv, null, 1);
    expect(kv.keys()).toEqual([]);
    expect(saveNow(kv, r.data, r.seq, 2)).toEqual({ ok: true, seq: 1 });
  });
  it('the debounced native backup writes the latest save once, after the delay', () => {
    vi.useFakeTimers();
    try {
      const written: string[] = [];
      const native: NativeBackup = { read: () => null, write: (s) => { written.push(s); return true; } };
      scheduleNativeBackup(native, () => 'a');
      scheduleNativeBackup(native, () => 'b');
      expect(written).toEqual([]);
      vi.advanceTimersByTime(2000);
      expect(written).toEqual(['b']);
    } finally {
      vi.useRealTimers();
    }
  });
  it('scheduleNativeBackup is a no-op without a native side', () => expect(() => scheduleNativeBackup(null, () => '')).not.toThrow());
});

describe('isSaveData', () => {
  const kid = newChild('Dana', 4, null, '2026-01-02', 'c1');
  it('accepts fresh and a child', () => {
    expect(isSaveData(freshSave())).toBe(true);
    expect(isSaveData({ ...freshSave(), children: [kid] })).toBe(true);
  });
  it('rejects malformed day fields and shapes', () => {
    expect(isSaveData({ ...freshSave(), children: [{ ...kid, createdOn: 'yesterday' }] })).toBe(false);
    expect(isSaveData({ ...freshSave(), children: [{ ...kid, age: { years: 4, setOn: '2026-1-2' } }] })).toBe(false);
    expect(isSaveData({ ...freshSave(), children: [{ ...kid, progress: null }] })).toBe(false);
    expect(isSaveData({ schema: 1, children: [] })).toBe(false);
    expect(isSaveData(null)).toBe(false);
  });
  it('older saves without focus, introOrder or a parent sitting load; malformed new fields are rejected', () => {
    expect('focus' in kid.progress || 'introOrder' in kid.progress).toBe(false);
    expect(isSaveData({ ...freshSave(), children: [kid] })).toBe(true);
    const sitting = { day: '2026-01-02', done: 1, warmupDone: false, closed: false, endShown: false, unitsStarted: 0 };
    const withNew = (p: Record<string, unknown>) => ({ ...freshSave(), children: [{ ...kid, progress: { ...kid.progress, ...p } }] });
    expect(isSaveData(withNew({ focus: ['u1'], introOrder: ['u1', 'u2'], sitting: { ...sitting, parent: { unit: 'u1', mode: 'practice', queue: [] } } }))).toBe(true);
    expect(isSaveData(withNew({ sitting: { ...sitting, parent: { unit: 'u1', mode: 'unit', queue: [] } } }))).toBe(true);
    expect(isSaveData(withNew({ focus: 'u1' }))).toBe(false);
    expect(isSaveData(withNew({ introOrder: [1] }))).toBe(false);
    expect(isSaveData(withNew({ sitting: { ...sitting, parent: { unit: 3, mode: 'unit', queue: [] } } }))).toBe(false);
    expect(isSaveData(withNew({ sitting: { ...sitting, parent: { unit: 'u1', mode: 'other', queue: [] } } }))).toBe(false);
    expect(isSaveData(withNew({ sitting: { ...sitting, parent: { unit: 'u1', mode: 'practice' } } }))).toBe(false);
  });
});

// A child record produced by the real engine: three units, then a failed check-point with a wrong answer carrying
// `chose`, so sitting, stickers, pending practice + retry (with params) and mastery attempts are all populated.
function populatedChild(): ChildRecord {
  const failItem = curriculum.units[1].id + '/name';
  const wrongItem = curriculum.units[0].id + '/name';
  const used = { wrong: false };
  let s: PlannerInput = fresh('2026-03-01');
  for (let k = 0; k < 4; k++) {
    const day = '2026-03-0' + (k + 1);
    s = run({ ...s, today: day }, (step, n) => {
      const r = scriptedResult(step, msOf(day) + n * 1000, { wrong: wrongItem, failAlways: failItem }, used);
      return { ...r, answers: r.answers.map((a) => (a.ok ? a : { ...a, chose: curriculum.units[2].id })) };
    }).state;
  }
  const kid = newChild('Dana', 4, 'data:image/png;base64,AAA', '2026-03-01', 'c1');
  const retry = s.progress.pending[s.progress.pending.length - 1];
  return {
    ...kid,
    mastery: s.mastery,
    progress: s.progress,
    playSeconds: { '2026-03-01': 300, '2026-03-02': 280.5 },
    checkpoints: [{ cpId: retry.cpId as string, day: '2026-03-04', passed: [], failed: retry.items }],
  };
}

describe('populated record', () => {
  const kid = populatedChild();
  it('the engine really produced the interesting parts', () => {
    expect(kid.progress.sitting).not.toBeNull();
    expect(kid.progress.stickers.length).toBeGreaterThan(0);
    expect(kid.progress.pending.some((p) => p.params !== undefined)).toBe(true);
    expect(Object.values(kid.mastery).some((m) => m.attempts.some((a) => a.chose !== undefined))).toBe(true);
  });
  it('passes isSaveData and survives saveNow -> loadSave as the primary', () => {
    const data: SaveData = { ...freshSave(), children: [kid] };
    expect(isSaveData(data)).toBe(true);
    const kv = memoryKV();
    expect(saveNow(kv, data, 0, 1).ok).toBe(true);
    const r = loadSave(kv, null, 2);
    expect(r.source).toBe('primary');
    expect(r.data).toEqual(data);
  });
  it('round-trips through export / import', () => {
    expect(parseImport(exportChild(kid, true, '2026-03-05').text)).toEqual({ ok: true, child: kid });
  });
});

describe('recovery paths', () => {
  it('corrupt primary + corrupt prev + valid native -> native, primary quarantined', () => {
    const kv = memoryKV({ 'alfi.app.save': '{bad', 'alfi.app.save.prev': envelope(data1, 1).replace('0.5', '0.6') });
    const r = loadSave(kv, fakeNative(envelope(data2, 4)), 50);
    expect(r.source).toBe('native');
    expect(r.seq).toBe(4);
    expect(r.quarantined).toEqual(['alfi.app.save.bad.50']);
  });
  it('saveNow after a loadSave that quarantined writes the next seq and no second bad copy', () => {
    const kv = withPrimaryAndPrev({ corruptPrimary: true });
    const r = loadSave(kv, null, 99);
    expect(saveNow(kv, r.data, r.seq, 100)).toEqual({ ok: true, seq: 2 });
    expect(parseEnvelope(kv.get('alfi.app.save'))).toMatchObject({ ok: true, seq: 2 });
    expect(kv.keys().filter((k) => k.startsWith('alfi.app.save.bad.'))).toEqual(['alfi.app.save.bad.99']);
  });
  it('keeps the newest 3 bad copies by numeric time, across digit counts', () => {
    const kv = memoryKV();
    for (const now of [998, 999, 1000, 1001, 1002]) { kv.set('alfi.app.save', 'x' + now); loadSave(kv, null, now); }
    expect(kv.keys().filter((k) => k.startsWith('alfi.app.save.bad.')).sort()).toEqual(['alfi.app.save.bad.1000', 'alfi.app.save.bad.1001', 'alfi.app.save.bad.1002']);
  });
  it('refuses to write a save that would not load back (NaN) and keeps primary and prev', () => {
    const kv = withPrimaryAndPrev({ corruptPrimary: false });
    const bad: SaveData = { ...freshSave(), children: [{ ...newChild('Dana', 4, null, '2026-03-01', 'c1'), playSeconds: { '2026-03-01': NaN } }] };
    const primary = kv.get('alfi.app.save');
    const prev = kv.get('alfi.app.save.prev');
    expect(saveNow(kv, bad, 2, 3)).toEqual({ ok: false, seq: 2 });
    expect(kv.get('alfi.app.save')).toBe(primary);
    expect(kv.get('alfi.app.save.prev')).toBe(prev);
  });
});