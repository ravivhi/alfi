import type { ItemId } from '../engine/types.ts';
import type { MasteryRecord } from '../engine/mastery.ts';
import type { PathProgress } from '../engine/planner.ts';
import { emptyProgress } from '../engine/planner.ts';

export interface ChildRecord {
  id: string;
  name: string;
  photo: string | null;
  age: { years: number; setOn: string };
  gender: null;
  curriculumId: string;
  createdOn: string;
  mastery: Record<ItemId, MasteryRecord>;
  progress: PathProgress;
  playSeconds: Record<string, number>;
  dailyLimitMin: number | null; // ignored: there is no daily limit
  checkpoints: { cpId: string; day: string; passed: ItemId[]; failed: ItemId[] }[];
  // The child's break clock (ui/breakClock.ts), kept in the save so closing the app does not skip a break. Missing in
  // older saves and new children: no break running, nothing played yet.
  breakUntil?: number | null;
  playedSinceBreakSec?: number;
  lastPlayAt?: number | null;
}

export const BREAK_EVERY_OPTIONS = [5, 10, 15, 20];
export const BREAK_LENGTH_OPTIONS = [1, 2, 3, 5];
export const DEFAULT_BREAK_EVERY_MIN = 10;
export const DEFAULT_BREAK_LENGTH_MIN = 2;

export interface Settings {
  voiceVolume: number;
  effectsVolume: number;
  lastChildId: string | null;
  breakEveryMin: number;
  breakLengthMin: number;
  /** Background music in the games; absent in older saves (on). */
  musicOn?: boolean;
  /** Game sound effects; absent in older saves (on). */
  sfxOn?: boolean;
}

export interface SaveData {
  schema: 1;
  children: ChildRecord[];
  settings: Settings;
}

export function freshSave(): SaveData {
  return {
    schema: 1,
    children: [],
    settings: { voiceVolume: 0.8, effectsVolume: 0.4, lastChildId: null, breakEveryMin: DEFAULT_BREAK_EVERY_MIN, breakLengthMin: DEFAULT_BREAK_LENGTH_MIN, musicOn: true, sfxOn: true },
  };
}

// Older saves lack the break settings: fill them in with the defaults.
export function withSettingDefaults(d: SaveData): SaveData {
  const s: Partial<Settings> = d.settings;
  if (s.breakEveryMin !== undefined && s.breakLengthMin !== undefined && s.musicOn !== undefined && s.sfxOn !== undefined) return d;
  return { ...d, settings: { ...d.settings, breakEveryMin: s.breakEveryMin ?? DEFAULT_BREAK_EVERY_MIN, breakLengthMin: s.breakLengthMin ?? DEFAULT_BREAK_LENGTH_MIN, musicOn: s.musicOn ?? true, sfxOn: s.sfxOn ?? true } };
}

export function newChild(name: string, years: number, photo: string | null, today: string, id: string): ChildRecord {
  return {
    id,
    name,
    photo,
    age: { years, setOn: today },
    gender: null,
    curriculumId: 'letters-he',
    createdOn: today,
    mastery: {},
    progress: emptyProgress(),
    playSeconds: {},
    dailyLimitMin: 20,
    checkpoints: [],
  };
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);

export function isDay(x: unknown): x is string {
  if (!isStr(x) || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const m = Number(x.slice(5, 7));
  const d = Number(x.slice(8, 10));
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

function isMastery(x: unknown): boolean {
  if (!isObj(x) || !Array.isArray(x.attempts) || !isObj(x.confusions) || !isNum(x.lastSeen)) return false;
  return x.attempts.every((a) => isObj(a) && isDay(a.day) && isNum(a.t) && typeof a.ok === 'boolean' && (a.kind === 'recall' || a.kind === 'match'));
}

function isProgress(x: unknown): boolean {
  if (!isObj(x)) return false;
  if (!isStrArr(x.stationsDone) || !isStrArr(x.checkpointsPassed) || !Array.isArray(x.pending)) return false;
  if (!isObj(x.unitStartDay) || !Object.values(x.unitStartDay).every(isDay)) return false;
  if (x.extraSittingDay !== null && !isDay(x.extraSittingDay)) return false;
  if (x.sitting !== null) {
    const s = x.sitting;
    if (!isObj(s) || !isDay(s.day) || !isNum(s.done) || typeof s.warmupDone !== 'boolean' || typeof s.closed !== 'boolean' || typeof s.endShown !== 'boolean') return false;
    // a parent-started sitting (missing in older saves and in every other sitting)
    const ps = s.parent;
    if (ps !== undefined && !(isObj(ps) && isStr(ps.unit) && (ps.mode === 'practice' || ps.mode === 'unit') && Array.isArray(ps.queue))) return false;
  }
  // "practise more" marks and the introduction order: missing in older saves
  if (x.focus !== undefined && !isStrArr(x.focus)) return false;
  if (x.introOrder !== undefined && !isStrArr(x.introOrder)) return false;
  return Array.isArray(x.stickers) && x.stickers.every((s) => isObj(s) && isStr(s.id) && isDay(s.day) && typeof s.shown === 'boolean');
}

export function isChildRecord(x: unknown): x is ChildRecord {
  if (!isObj(x)) return false;
  if (!isStr(x.id) || !isStr(x.name) || !(x.photo === null || isStr(x.photo)) || x.gender !== null) return false;
  if (!isObj(x.age) || !isNum(x.age.years) || !isDay(x.age.setOn)) return false;
  if (!isStr(x.curriculumId) || !isDay(x.createdOn)) return false;
  if (!isObj(x.mastery) || !Object.values(x.mastery).every(isMastery)) return false;
  if (!isProgress(x.progress)) return false;
  if (!isObj(x.playSeconds) || !Object.values(x.playSeconds).every(isNum)) return false;
  if (!(x.dailyLimitMin === null || isNum(x.dailyLimitMin))) return false;
  if (x.breakUntil !== undefined && !(x.breakUntil === null || isNum(x.breakUntil))) return false;
  if (x.playedSinceBreakSec !== undefined && !isNum(x.playedSinceBreakSec)) return false;
  if (x.lastPlayAt !== undefined && !(x.lastPlayAt === null || isNum(x.lastPlayAt))) return false;
  return Array.isArray(x.checkpoints) && x.checkpoints.every((c) => isObj(c) && isStr(c.cpId) && isDay(c.day) && isStrArr(c.passed) && isStrArr(c.failed));
}

export function isSaveData(x: unknown): x is SaveData {
  if (!isObj(x) || x.schema !== 1 || !Array.isArray(x.children)) return false;
  const s = x.settings;
  if (!isObj(s) || !isNum(s.voiceVolume) || !isNum(s.effectsVolume) || !(s.lastChildId === null || isStr(s.lastChildId))) return false;
  if (s.breakEveryMin !== undefined && !isNum(s.breakEveryMin)) return false;
  if (s.breakLengthMin !== undefined && !isNum(s.breakLengthMin)) return false;
  if (s.musicOn !== undefined && typeof s.musicOn !== 'boolean') return false;
  if (s.sfxOn !== undefined && typeof s.sfxOn !== 'boolean') return false;
  return x.children.every(isChildRecord);
}
