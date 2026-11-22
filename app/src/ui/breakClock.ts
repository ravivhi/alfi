// The break clock: after breakEveryMin minutes of active play the child rests breakLengthMin minutes. Pure state
// logic (no timers, no DOM); the state lives on each child's record in the save, so closing the app never skips a
// break and one child's play never sends a sibling on a break.
import type { ChildRecord, Settings } from '../store/schema.ts';

export interface BreakState {
  /** Active play seconds since the last break. */
  playedSec: number;
  /** Epoch ms when the running break ends; null when no break runs. */
  breakUntil: number | null;
  /** Epoch ms of the end of the last counted play, to spot a long absence. */
  lastPlayAt: number | null;
}

const MIN = 60_000;

export const idle = (): BreakState => ({ playedSec: 0, breakUntil: null, lastPlayAt: null });

export function active(b: BreakState, now: number): boolean {
  return b.breakUntil !== null && now < b.breakUntil;
}

/** Milliseconds left of the running break (0 when none runs). */
export function remaining(b: BreakState, now: number): number {
  return b.breakUntil === null ? 0 : Math.max(0, b.breakUntil - now);
}

export function due(b: BreakState, now: number, everyMin: number): boolean {
  return !active(b, now) && b.playedSec >= everyMin * 60;
}

export function start(b: BreakState, now: number, lengthMin: number): BreakState {
  return { ...b, playedSec: 0, breakUntil: now + lengthMin * MIN };
}

export function skip(b: BreakState): BreakState {
  return { ...b, playedSec: 0, breakUntil: null };
}

/**
 * Brings the clock up to `now`: an ended break is cleared, a break end further away than lengthMin (the device clock
 * moved back) is pulled in so a break never lasts longer than set, and a gap of at least lengthMin minutes without
 * play (app closed, hidden, or resting on the map) counts as the break.
 */
export function settle(b: BreakState, now: number, lengthMin: number): BreakState {
  let out = b;
  if (out.breakUntil !== null) {
    if (now >= out.breakUntil) out = { ...out, breakUntil: null };
    else if (out.breakUntil - now > lengthMin * MIN) out = { ...out, breakUntil: now + lengthMin * MIN };
  }
  if (out.breakUntil === null && out.lastPlayAt !== null && now - out.lastPlayAt >= lengthMin * MIN && out.playedSec > 0) {
    out = { ...out, playedSec: 0 };
  }
  return out;
}

/** Adds `sec` seconds of play that ended at `now`; a long gap before that play counts as a break first. */
export function addPlay(b: BreakState, sec: number, now: number, lengthMin: number): BreakState {
  const s = Math.max(0, sec);
  let out = b;
  if (out.lastPlayAt !== null && now - s * 1000 - out.lastPlayAt >= lengthMin * MIN) out = { ...out, playedSec: 0 };
  return { ...out, playedSec: out.playedSec + s, lastPlayAt: now };
}

/** The clock is per child (the child takes the break); the break lengths are device settings. */
type ClockFields = Pick<ChildRecord, 'breakUntil' | 'playedSinceBreakSec' | 'lastPlayAt'>;

export function fromChild(c: ClockFields): BreakState {
  return { playedSec: c.playedSinceBreakSec ?? 0, breakUntil: c.breakUntil ?? null, lastPlayAt: c.lastPlayAt ?? null };
}

export function toChild(c: ClockFields, b: BreakState): void {
  c.playedSinceBreakSec = b.playedSec;
  c.breakUntil = b.breakUntil;
  c.lastPlayAt = b.lastPlayAt;
}

/** The child's settled clock (writes the settled state back into the record, not to storage). */
export function breakNow(c: ClockFields, s: Pick<Settings, 'breakLengthMin'>, now: number): BreakState {
  const b = settle(fromChild(c), now, s.breakLengthMin);
  toChild(c, b);
  return b;
}

/** Starts the child's break when one is due (in memory); true when it started. */
export function startIfDue(c: ClockFields, s: Pick<Settings, 'breakEveryMin' | 'breakLengthMin'>, now: number): boolean {
  const b = breakNow(c, s, now);
  if (!due(b, now, s.breakEveryMin)) return false;
  toChild(c, start(b, now, s.breakLengthMin));
  return true;
}
