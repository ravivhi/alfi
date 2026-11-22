// The step modules by step id; an id without a module runs the placeholder.
import type { StepResult, StepTypeId } from '../engine/types.ts';
import type { StepModule } from './contract.ts';
import { h } from '../util/dom.ts';
import { meetStep } from './meet.ts';
import { findStep } from './find.ts';
import { soundPickStep } from './soundPick.ts';
import { firstSoundStep } from './firstSound.ts';
import { checkpointStep } from './checkpoint.ts';
import { driveStep } from './drive.ts';
import { paintStep } from './paint.ts';
import { planeStep } from './plane.ts';
import { raceStep } from './race.ts';
import { moleStep } from './mole.ts';
import { matchStep } from './match.ts';
import { jumpStep } from './jump.ts';

export const REGISTRY: Record<StepTypeId, StepModule> = {
  meet: meetStep,
  find: findStep,
  soundPick: soundPickStep,
  firstSound: firstSoundStep,
  checkpoint: checkpointStep,
  drive: driveStep,
  paint: paintStep,
  plane: planeStep,
  race: raceStep,
  mole: moleStep,
  match: matchStep,
  jump: jumpStep,
};

/** A stand-in that completes at once with no answers (no mastery evidence), so the path can still move on. */
export function placeholderStep(id: StepTypeId): StepModule {
  return {
    id,
    run: async (ctx): Promise<StepResult> => {
      if (ctx.signal.aborted) return { outcome: 'aborted', answers: [], slips: 0, ms: 0 };
      ctx.stage.appendChild(h('div', {
        'data-placeholder': id,
        style: 'margin:auto;padding:24px 32px;border-radius:24px;background:#FFFFFF;color:#1D2742;font:800 32px Rubik,sans-serif;direction:ltr',
      }, id));
      return { outcome: 'done', answers: [], slips: 0, ms: 0 };
    },
  };
}

export function stepModule(registry: Record<StepTypeId, StepModule>, id: StepTypeId): StepModule {
  return Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : placeholderStep(id);
}
