import { describe, expect, it } from 'vitest';
import { freshSave, isChildRecord, isSaveData, newChild } from '../../src/store/schema.ts';
import { checksum, parseEnvelope } from '../../src/store/save.ts';

const oldSettings = { voiceVolume: 0.5, effectsVolume: 0.4, lastChildId: null };
const envelope = (data: unknown) => JSON.stringify({ v: 1, seq: 1, savedAt: 1, sum: checksum(JSON.stringify(data)), data });

describe('break settings', () => {
  it('default to a break every 10 minutes lasting 2', () => {
    expect(freshSave().settings.breakEveryMin).toBe(10);
    expect(freshSave().settings.breakLengthMin).toBe(2);
  });
  it('a save without the fields is accepted and loads with the defaults', () => {
    const old = { schema: 1, children: [], settings: oldSettings };
    expect(isSaveData(old)).toBe(true);
    const r = parseEnvelope(envelope(old));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.settings).toEqual({ ...oldSettings, breakEveryMin: 10, breakLengthMin: 2, musicOn: true, sfxOn: true });
  });
  it('stored values persist through a round trip', () => {
    const d = freshSave();
    d.settings.breakEveryMin = 15;
    d.settings.breakLengthMin = 5;
    const r = parseEnvelope(envelope(d));
    expect(r.ok && r.data.settings.breakEveryMin).toBe(15);
    expect(r.ok && r.data.settings.breakLengthMin).toBe(5);
  });
  it('a wrong-typed value is rejected', () => {
    expect(isSaveData({ schema: 1, children: [], settings: { ...oldSettings, breakEveryMin: 'x' } })).toBe(false);
  });
});

describe('music and game sound settings', () => {
  it('an older save without musicOn / sfxOn loads with both on', () => {
    const old = { schema: 1, children: [], settings: { ...oldSettings, breakEveryMin: 10, breakLengthMin: 2 } };
    expect(isSaveData(old)).toBe(true);
    const r = parseEnvelope(envelope(old));
    expect(r.ok && r.data.settings.musicOn).toBe(true);
    expect(r.ok && r.data.settings.sfxOn).toBe(true);
    expect(freshSave().settings.musicOn).toBe(true);
    expect(freshSave().settings.sfxOn).toBe(true);
  });
  it('stored off values survive, and a non-boolean musicOn is rejected', () => {
    const d = freshSave();
    d.settings.musicOn = false;
    const r = parseEnvelope(envelope(d));
    expect(r.ok && r.data.settings.musicOn).toBe(false);
    expect(isSaveData({ schema: 1, children: [], settings: { ...oldSettings, musicOn: 'yes' } })).toBe(false);
    expect(isSaveData({ schema: 1, children: [], settings: { ...oldSettings, sfxOn: 1 } })).toBe(false);
  });
});

describe('per-child break clock', () => {
  const child = () => newChild('נועה', 4, null, '2026-11-21', 'c0');
  it('a child record without the clock fields (older saves) is valid', () => {
    const c = child();
    expect('breakUntil' in c).toBe(false);
    expect(isChildRecord(c)).toBe(true);
  });
  it('stored clock values are accepted and survive a round trip', () => {
    const d = freshSave();
    d.children.push({ ...child(), breakUntil: 123, playedSinceBreakSec: 45.5, lastPlayAt: null });
    const r = parseEnvelope(envelope(d));
    expect(r.ok && r.data.children[0].breakUntil).toBe(123);
    expect(r.ok && r.data.children[0].playedSinceBreakSec).toBe(45.5);
  });
  it('wrong-typed clock values are rejected', () => {
    expect(isChildRecord({ ...child(), breakUntil: 'soon' })).toBe(false);
    expect(isChildRecord({ ...child(), playedSinceBreakSec: null })).toBe(false);
    expect(isChildRecord({ ...child(), lastPlayAt: 'x' })).toBe(false);
  });
});
