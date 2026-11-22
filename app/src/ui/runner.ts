// The sitting runner: asks the planner for the next step, plays it inside the station shell, saves, and repeats
// until the sitting ends (end screen) or the child goes back (nothing saved for the step in progress). Between steps,
// a break that is due (or still running) shows the break screen instead of the next step. A game ends on its result
// window (success: continue / again; failed: try again) and waits for a tap; every other step flows on by itself.
import type { AppState } from './app.ts';
import { mountBreak } from './screens/break.ts';
import { active, addPlay, breakNow, fromChild, startIfDue, toChild } from './breakClock.ts';
import type { Router } from './router.ts';
import { mountShell } from './shell.ts';
import { mountEnd, END_FLAG } from './screens/end.ts';
import type { MapStatus } from './screens/map.ts';
import { avatar } from './avatar.ts';
import type { StepContext, StepModule } from '../steps/contract.ts';
import { stepModule } from '../steps/registry.ts';
import type { Curriculum, StepResult, StepTypeId, UnitId } from '../engine/types.ts';
import { nextStep, previewSitting } from '../engine/planner.ts';
import type { NextResult, PlannedStep, PlannerInput } from '../engine/planner.ts';
import { applyStepResult, markStickersShown, recordAnswers, startParentSitting } from '../engine/progress.ts';
import { expandPath, itemId } from '../engine/curriculum.ts';
import { isPathComplete, taughtUnits } from '../engine/pathRules.ts';
import { topConfusions } from '../engine/mastery.ts';
import { ageNow, bandForAge } from '../engine/age.ts';
import { profileFor } from '../engine/profiles.ts';
import type { ChildRecord } from '../store/schema.ts';
import { line } from '../audio/lines.ts';
import { CONTENT } from '../content/index.ts';
import type { LettersContent } from '../content/schema.ts';
import { createRng } from '../util/rng.ts';
import { mountResult, starsFor } from './resultWindow.ts';
import type { ResultChoice } from './resultWindow.ts';
import { prefersReducedMotion } from './screens/break.ts';
import curriculumJson from '../../content/curriculum-letters.json';

export type { MapStatus } from './screens/map.ts';

export const CURRICULUM = curriculumJson as unknown as Curriculum;

/** The games that play background music. Owner 2026-11-21: only the dino, as in the old app; to widen it, change this line
 *  (e.g. `CURRICULUM.gameRotation` for every game). */
export const MUSIC_GAMES: readonly StepTypeId[] = ['jump'];

/** Stations that end with the result window ("again" / "continue") without being one of the rotated games. */
export const WINDOW_STATIONS: readonly StepTypeId[] = ['paint'];

export interface Clock { now(): number; today(): string }

export interface RunnerDeps {
  app: AppState;
  registry: Record<StepTypeId, StepModule>;
  router: Router;
  clock: Clock;
  /** Shows the map. With a status, the map speaks that status line (the run ended before any step). */
  showMap(status?: MapStatus): void;
  content?: LettersContent;
  curriculum?: Curriculum;
}

export function plannerInputFor(child: ChildRecord, today: string, seed: number, curriculum: Curriculum = CURRICULUM): PlannerInput {
  return {
    curriculum,
    band: bandForAge(ageNow(child.age, today)),
    progress: child.progress,
    mastery: child.mastery,
    today,
    minutesToday: Math.floor((child.playSeconds[today] ?? 0) / 60),
    dailyLimitMin: child.dailyLimitMin,
    rng: createRng(seed),
  };
}

export function endStatus(reason: Extract<NextResult, { type: 'end' }>['reason']): MapStatus {
  if (reason === 'limit') return 'limit';
  if (reason === 'pathComplete') return 'complete';
  return 'tomorrow';
}

/** True when today's sitting has closed but its end screen was never shown (back or app closed on the last result
 *  window): the next start shows that end screen instead of going back to the map. */
export function endPending(input: PlannerInput): boolean {
  const n = nextStep({ ...input, rng: createRng(0) });
  return n.type === 'end' && n.reason === 'sittingDone';
}

/** Stage background by step (mockup colours); unknown steps use the sky. */
export const STEP_BG: Record<string, string> = {
  meet: '#FFF6E5', find: '#EAF5FF', soundPick: '#EAF5FF', firstSound: '#E8F7EE', drive: '#CFEFD6', paint: '#FFF6E5',
  checkpoint: '#FFF1E8', plane: '#BFE3FF', race: '#8FD0FF', mole: '#DDF2E2', match: '#EAF5FF', jump: '#FFF3E0',
};

const INTRO: Partial<Record<PlannedStep['kind'], string>> = { warmup: 'warmup.intro', practice: 'practice.intro', checkpoint: 'checkpoint.intro' };

const visible = (): boolean => typeof document === 'undefined' || document.visibilityState === undefined || document.visibilityState === 'visible';

// Milliseconds the page was visible between start and stop.
function activeTimer(clock: Clock): { stop(): number } {
  let acc = 0;
  let since: number | null = visible() ? clock.now() : null;
  let stopped = false;
  const on = () => {
    if (visible()) { if (since === null) since = clock.now(); }
    else if (since !== null) { acc += clock.now() - since; since = null; }
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', on);
  return {
    stop() {
      if (!stopped) {
        stopped = true;
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', on);
        if (since !== null) { acc += clock.now() - since; since = null; }
      }
      return Math.max(0, acc);
    },
  };
}

export interface Runner {
  start(childId: string): Promise<void>;
  /** The parent page's "practise this letter now": opens a sitting on that letter (replacing today's open sitting) and
   *  runs it at once; breaks still apply, and the end screen leads back to the map. */
  startLetter(childId: string, unit: UnitId): Promise<void>;
}

export function createRunner(deps: RunnerDeps): Runner {
  const content = deps.content ?? CONTENT;
  const curriculum = deps.curriculum ?? CURRICULUM;
  let gen = 0;

  // A failed write never stops play: the parent sees storageWarning.
  const persist = () => {
    try {
      if (!deps.app.persist()) deps.app.storageWarning = true;
    } catch {
      deps.app.storageWarning = true;
    }
  };
  const speak = (text: string, opt: { rate?: number; queue?: boolean } = {}): Promise<void> => {
    try {
      return deps.app.audio.say(text, opt).catch(() => undefined);
    } catch {
      return Promise.resolve();
    }
  };
  const findChild = (id: string) => deps.app.save.children.find((c) => c.id === id);

  function stickerLabels(child: ChildRecord, input: PlannerInput): string[] {
    const path = expandPath(curriculum, input.band);
    return child.progress.stickers.filter((s) => !s.shown).map((s) => {
      const node = path.find((n) => n.id === s.id);
      return node && node.type === 'unit' && node.unitId !== undefined ? (content.letters[node.unitId]?.glyph ?? node.unitId) : END_FLAG;
    });
  }

  function showEnd(child: ChildRecord, input: PlannerInput, reason: Extract<NextResult, { type: 'end' }>['reason']) {
    const stickers = stickerLabels(child, input);
    // a sitting on a complete path (its last check-point, or review play) says map.complete instead of end.bye
    const complete = reason === 'pathComplete' || isPathComplete(child.progress, expandPath(curriculum, input.band));
    deps.router.show('end', (root) => {
      const off = mountEnd(root, {
        childName: child.name,
        stickers,
        onMap: () => deps.showMap(),
        audio: deps.app.audio,
        content,
        nextTomorrow: !complete,
        photo: avatar(child, 56),
      });
      // leaving the end screen (map button or back): a break that fell due in this sitting starts now, so the map
      // already rests when it opens
      return () => {
        off();
        if (startIfDue(child, deps.app.save.settings, deps.clock.now())) persist();
      };
    });
    // only now that the end screen is up
    child.progress = markStickersShown(child.progress);
    persist();
  }

  // A break that is due starts now; a running one (app reopened, back during the break) continues. Either shows the
  // break screen, which returns to the map when the break ends. False when no break is due.
  function breakInstead(child: ChildRecord): boolean {
    const s = deps.app.save.settings;
    const now = deps.clock.now();
    if (!active(breakNow(child, s, now), now)) {
      if (!startIfDue(child, s, now)) return false;
      persist();
    }
    const until = child.breakUntil as number;
    deps.router.show('break', (root) => mountBreak(root, {
      audio: deps.app.audio,
      content,
      now: () => deps.clock.now(),
      until,
      totalMs: Math.max(s.breakLengthMin * 60_000, until - now),
      onDone: () => deps.showMap(),
    }));
    return true;
  }

  // Plays one step until the child moves on: a game's success window offers "again" (the same step once more, as a
  // replay that moves nothing on the path) and a failed game "try again" (the same step, still to be done). True when
  // the run goes on to the next planner step; false when it is over (back, left, a break). "Try again" after a failed
  // run that reported a resume point starts the step there (the dino: the level where the hearts ran out); "again"
  // after a success starts it fresh.
  async function playStep(child: ChildRecord, input: PlannerInput, step: PlannedStep, position: { index: number; count: number }, my: number): Promise<boolean> {
    let replay = false;
    let resume: number | undefined;
    for (let attempt = 0; ; attempt++) {
      // a repeat runs on the progress as it is now (the earlier run already saved its result)
      const cur = attempt === 0 ? input : plannerInputFor(child, deps.clock.today(), deps.clock.now() >>> 0, curriculum);
      const r = await playOnce(child, cur, step, position, my, { intro: attempt === 0, replay, resume });
      if (r === 'stop') return false;
      if (r.choice === 'continue') return true;
      if (r.applied === 'done') replay = true;
      resume = r.applied === 'failed' ? r.resume : undefined;
    }
  }

  // Runs the step once in a fresh shell and saves its result. After a game (or a failed step) the result window opens
  // over the station and waits for the tap; any other step goes straight on.
  async function playOnce(
    child: ChildRecord, input: PlannerInput, step: PlannedStep, position: { index: number; count: number }, my: number,
    o: { intro: boolean; replay: boolean; resume?: number },
  ): Promise<'stop' | { choice: ResultChoice; applied: 'done' | 'failed'; resume?: number }> {
    const app = deps.app;
    const ac = new AbortController();
    let markLeft: () => void = () => undefined;
    const left = new Promise<'left'>((res) => { markLeft = () => res('left'); });
    ac.signal.addEventListener('abort', () => markLeft());
    let instruction: { text: string; rate?: number } | null = null;
    const timer = activeTimer(deps.clock);
    // The visible time of the step goes on the break clock once, also when the step is left (that time is still
    // play; it is saved with the next save, since a left step saves nothing itself).
    let counted = false;
    const countPlay = (): number => {
      if (counted) return 0;
      counted = true;
      const ms = timer.stop();
      toChild(child, addPlay(fromChild(child), ms / 1000, deps.clock.now(), app.save.settings.breakLengthMin));
      return ms;
    };
    let shell: ReturnType<typeof mountShell> | null = null;
    let win: ReturnType<typeof mountResult> | null = null;

    deps.router.show('station', (root) => {
      shell = mountShell(root, {
        bg: STEP_BG[step.step] ?? '#EAF5FF',
        stepIndex: position.index,
        stepCount: position.count,
        fullBleed: curriculum.gameRotation.includes(step.step),
        onReplay: () => { if (instruction) void speak(instruction.text, instruction.rate === undefined ? {} : { rate: instruction.rate }); },
      });
      // back or any navigation away: stop the step, its window and its speech; nothing of a running step is saved
      return () => { ac.abort(); win?.dispose(); app.audio.stop(); app.music.stop(); shell?.dispose(); countPlay(); };
    });
    const sh = shell as ReturnType<typeof mountShell> | null;
    if (!sh) return 'stop';
    // the melody plays under the game (ducked while speech plays); teaching steps, warm-ups and check-points have none
    if (MUSIC_GAMES.includes(step.step)) app.music.start();

    // a practice sitting's game is a station step without a path station: it opens like practice; a parent-started
    // practice sitting says practice.intro once, before its first step. A repeat of the step says no intro.
    const intro = !o.intro ? undefined : step.kind === 'parent'
      ? (input.progress.sitting?.done === 0 ? 'practice.intro' : undefined)
      : INTRO[step.kind] ?? (step.kind === 'station' && step.stationId === undefined ? 'practice.intro' : undefined);
    if (intro) {
      await Promise.race([speak(line(content, intro)), left]);
      if (ac.signal.aborted || my !== gen) return 'stop';
    }

    const taught = taughtUnits(input.progress, expandPath(curriculum, input.band));
    const ctx: StepContext = {
      step,
      profile: profileFor(input.band),
      content,
      rng: createRng((deps.clock.now() + position.index) >>> 0),
      stage: sh.stage,
      signal: ac.signal,
      audio: app.audio,
      sfx: app.sfx,
      taught,
      confusions: (unit: UnitId) => {
        const out: UnitId[] = [];
        for (const k of curriculum.itemKinds) for (const u of topConfusions(child.mastery[itemId(unit, k)])) if (!out.includes(u)) out.push(u);
        return out;
      },
      setInstruction: (text, rate) => {
        instruction = rate === undefined ? { text } : { text, rate };
        return speak(text, rate === undefined ? {} : { rate });
      },
      progress: (f) => sh.progress(f),
      ...(o.resume !== undefined ? { resume: o.resume } : {}),
    };

    let result: StepResult | 'left';
    try {
      result = await Promise.race([stepModule(deps.registry, step.step).run(ctx), left]);
    } catch (e) {
      // a broken step must not trap the child: it counts as played with no evidence, like the placeholder
      console.error('step failed', step.step, e);
      result = { outcome: 'done', answers: [], slips: 0, ms: 0 };
    }
    if (result === 'left' || ac.signal.aborted || my !== gen) return 'stop';
    // the result window opens in silence: no melody, no race engine hum
    app.music.stop();
    try { app.sfx.engineStop(); } catch { /* optional */ }
    if (result.outcome === 'aborted') {
      deps.showMap();
      return 'stop';
    }

    const ms = countPlay();
    // a failed step records its answers only (applyStepResult); a replay after a success too (recordAnswers), so
    // the path never moves twice for one station
    const out = o.replay ? recordAnswers(input, result, deps.clock.now()) : applyStepResult(input, step, result, deps.clock.now());
    child.progress = out.progress;
    child.mastery = out.mastery;
    if (out.checkpoint) child.checkpoints.push({ ...out.checkpoint, day: input.today });
    const secs = Math.round(ms / 1000);
    if (secs > 0) child.playSeconds[input.today] = (child.playSeconds[input.today] ?? 0) + secs;
    persist();

    const failed = result.outcome === 'failed';
    const applied = failed ? 'failed' as const : 'done' as const;
    // owner 2026-11-21: a window only after the five games and the paint station; the other teaching stations, warm-ups and check-points flow on
    if (!failed && !curriculum.gameRotation.includes(step.step) && !WINDOW_STATIONS.includes(step.step)) return { choice: 'continue', applied };

    sh.progress(1);
    win = mountResult(sh.screen, {
      kind: failed ? 'failed' : 'success',
      stars: starsFor(result.answers, result.slips),
      ...(failed && result.failLine !== undefined ? { failLine: result.failLine } : {}),
      audio: app.audio,
      sfx: app.sfx,
      content,
      rng: createRng(deps.clock.now() >>> 0),
      reducedMotion: prefersReducedMotion(),
    });
    const choice = await Promise.race([win.choice, left]);
    if (choice === 'left' || ac.signal.aborted || my !== gen) return 'stop';
    win.dispose();
    // the break rule comes first: a break that is due shows the break screen instead (the map then glows the next
    // station). For continue the run loop applies it before the next step; after the sitting's last step the end
    // screen still comes first and the break starts when it is left.
    if (choice === 'again' && breakInstead(child)) return 'stop';
    return { choice, applied, ...(failed && result.resume !== undefined ? { resume: result.resume } : {}) };
  }

  const runner: Runner = {
    async startLetter(childId, unit) {
      const child = findChild(childId);
      if (!child) { deps.showMap(); return; }
      child.progress = startParentSitting(plannerInputFor(child, deps.clock.today(), deps.clock.now() >>> 0, curriculum), unit);
      persist();
      return runner.start(childId);
    },
    async start(childId) {
      const my = ++gen;
      let ran = 0;
      let base: number | null = null;
      for (;;) {
        if (my !== gen) return;
        const child = findChild(childId);
        if (!child) { deps.showMap(); return; }
        const today = deps.clock.today();
        const input = plannerInputFor(child, today, deps.clock.now() >>> 0, curriculum);
        const next = nextStep(input);
        if (next.type === 'end') {
          // after a step of this run, or a closed sitting whose end screen was lost: the end screen
          if (ran > 0 || next.reason === 'sittingDone') showEnd(child, input, next.reason);
          else deps.showMap(endStatus(next.reason));
          return;
        }
        // only between steps: a step is never interrupted by a break
        if (breakInstead(child)) return;
        // position in the sitting: steps already done in today's open sitting, plus what is left
        if (base === null) {
          const s = child.progress.sitting;
          base = s && s.day === today && !s.closed ? s.done : 0;
        }
        const index = base + ran;
        const position = { index, count: index + Math.max(1, previewSitting(input).length) };
        const go = await playStep(child, input, next.step, position, my);
        if (!go) return;
        ran++;
      }
    },
  };
  return runner;
}
