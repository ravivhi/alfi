// The contract between the sitting runner and a step (station) module.
import type { PlannedStep } from '../engine/planner.ts';
import type { AgeProfile } from '../engine/profiles.ts';
import type { StepResult, StepTypeId, UnitId } from '../engine/types.ts';
import type { LettersContent } from '../content/schema.ts';
import type { Rng } from '../util/rng.ts';
import type { AudioApi } from '../audio/audio.ts';
import type { Sfx } from '../audio/sfx.ts';

export interface StepContext {
  step: PlannedStep;
  profile: AgeProfile;
  content: LettersContent;
  rng: Rng;
  /** The area below the shell's top row; the step owns its contents. */
  stage: HTMLElement;
  /** Aborts on back / leaving the screen: the step must remove its listeners, timers and rAF loops and resolve 'aborted'. */
  signal: AbortSignal;
  audio: AudioApi;
  sfx: Sfx;
  taught: UnitId[];
  confusions(unit: UnitId): UnitId[];
  /** Spoken now and again on the replay button. Resolves when this speech ends (or is cut off). */
  setInstruction(text: string, rate?: number): Promise<void>;
  /** Optional inner progress of the step, 0..1. */
  progress(fraction: number): void;
  /** Set only on "try again" after a failed run that reported a resume point (StepResult.resume): start there. */
  resume?: number;
}

/** Resolves 'done' with the first-try answers, or 'aborted' when ctx.signal aborts. */
export interface StepModule {
  id: StepTypeId;
  run(ctx: StepContext): Promise<StepResult>;
}
