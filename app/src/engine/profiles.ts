import type { AgeBand, StepTypeId } from './types.ts';

export const SLICE_STEPS: StepTypeId[] = ['meet', 'find', 'soundPick', 'firstSound', 'drive', 'paint', 'checkpoint', 'plane', 'race', 'mole', 'match', 'jump'];

export interface LaneGame { targets: number; lanes: number; travelSec: number; spawnGapSec: number }

/**
 * Race, the old app's values (owner 2026-11-21: "like the old app", the same for every age): collect `targets` letters
 * in `timeSec` seconds. maxSpeed in road units per second; an item slot every slotSegs segments, a cone with coneChance,
 * a second item (a cone) with secondChance; a cone slows the car for coneSlowSec, a wrong letter for wrongSlowSec;
 * steerPerSec is the car's top sideways speed in road units per second (the lanes are 0.62 apart).
 */
/**
 * Owner 2026-11-22 (preview 0.7): "the race is still a bit too fast ... make it 10% slower" - forward speed x 0.9 again
 * (preview 0.6: 3200, preview 0.7: 2880). Cruising speed is maxSpeed; the engine hum still uses speed / maxSpeed.
 */
export const RACE_MAX_SPEED = 2592;
/**
 * The item spacing along the road scales with the speed, so items reach the car at the same rate per second (the
 * Task 30 rule): 13-20 segments (mean 16.5) -> 12-18 (mean 15, x 0.91 against the speed's x 0.9; whole segments).
 */
export const RACE_SLOT_SEGS: readonly [number, number] = [12, 18];

export interface RaceGame {
  targets: number; timeSec: number; maxSpeed: number; slotSegs: [number, number]; coneChance: number; secondChance: number;
  coneSlowSec: number; wrongSlowSec: number; steerPerSec: number;
}

/** One dino level: targets to collect (platforms of them on a platform), wrong letters, pits, step-ups and rocks. */
export interface JumpLevel { targets: number; wrong: number; pits: number; steps: number; platforms: number; rocks: number }
export interface JumpGame { lives: number; speed: number; airSpeed: number; gravity: number; jumpVel: number; levels: JumpLevel[] }

/**
 * The old dino (index.html LV and its physics constants). Owner 2026-11-21 (preview 0.6): the hop is 15% lower with the
 * same air time and reach - jumpVel and gravity both x 0.85 (old 760 / 1500): apex v^2/2g x 0.85, air time 2v/g unchanged.
 */
const JUMP_OLD: JumpGame = {
  lives: 5, speed: 140, airSpeed: 170, gravity: 1275, jumpVel: 646,
  levels: [
    { targets: 5, wrong: 3, pits: 1, steps: 1, platforms: 0, rocks: 0 },
    { targets: 5, wrong: 4, pits: 2, steps: 1, platforms: 1, rocks: 1 },
    { targets: 6, wrong: 5, pits: 2, steps: 2, platforms: 2, rocks: 2 },
  ],
};

export interface AgeProfile {
  unitsPerSitting: number;
  sittingMinutes: number;
  /** Games keep the old app's own timers (owner 2026-11-21). */
  timers: boolean;
  findChoices: number;
  findRounds: number;
  soundPickChoices: number;
  soundPickRounds: number;
  firstSoundChoices: number;
  firstSoundRounds: number;
  checkpointChoices: number;
  checkpointExtraReview: number;
  traceTolerance: number;
  plane: LaneGame;
  race: RaceGame;
  mole: { targets: number; rows: number; cols: number; upMs: [number, number]; downMs: [number, number]; maxUp: number };
  match: { pairs: number; rounds: number };
  /** Dino jumper, the old app's values for every age (owner 2026-11-21: "like the old app"): lives for the whole game;
   *  speed / airSpeed in stage units per second (the stage is 420 units tall), gravity in units/s^2, jumpVel the hop's
   *  launch speed; one entry per level, each a little harder. */
  jump: JumpGame;
  allowedSteps: StepTypeId[];
}

const PROFILES: Record<AgeBand, AgeProfile> = {
  '3-5': {
    unitsPerSitting: 1, sittingMinutes: 10, timers: true,
    findChoices: 3, findRounds: 3,
    soundPickChoices: 3, soundPickRounds: 2,
    firstSoundChoices: 3, firstSoundRounds: 2,
    checkpointChoices: 4, checkpointExtraReview: 1,
    traceTolerance: 40,
    plane: { targets: 5, lanes: 3, travelSec: 7, spawnGapSec: 2.4 },
    race: { targets: 10, timeSec: 60, maxSpeed: RACE_MAX_SPEED, slotSegs: [RACE_SLOT_SEGS[0], RACE_SLOT_SEGS[1]], coneChance: 0.2, secondChance: 0.3, coneSlowSec: 1.6, wrongSlowSec: 0.9, steerPerSec: 2.2 },
    mole: { targets: 4, rows: 3, cols: 3, upMs: [2600, 3600], downMs: [800, 1600], maxUp: 2 },
    match: { pairs: 6, rounds: 2 },
    jump: JUMP_OLD,
    allowedSteps: SLICE_STEPS,
  },
  '6-8': {
    unitsPerSitting: 2, sittingMinutes: 10, timers: true,
    findChoices: 4, findRounds: 2,
    soundPickChoices: 4, soundPickRounds: 2,
    firstSoundChoices: 4, firstSoundRounds: 2,
    checkpointChoices: 4, checkpointExtraReview: 2,
    traceTolerance: 30,
    plane: { targets: 6, lanes: 4, travelSec: 4.5, spawnGapSec: 1.5 },
    race: { targets: 10, timeSec: 60, maxSpeed: RACE_MAX_SPEED, slotSegs: [RACE_SLOT_SEGS[0], RACE_SLOT_SEGS[1]], coneChance: 0.2, secondChance: 0.3, coneSlowSec: 1.6, wrongSlowSec: 0.9, steerPerSec: 3.7 },
    mole: { targets: 5, rows: 3, cols: 3, upMs: [1600, 2600], downMs: [500, 1300], maxUp: 3 },
    match: { pairs: 6, rounds: 2 },
    jump: JUMP_OLD,
    allowedSteps: SLICE_STEPS,
  },
};

export function profileFor(band: AgeBand): AgeProfile {
  return PROFILES[band];
}
