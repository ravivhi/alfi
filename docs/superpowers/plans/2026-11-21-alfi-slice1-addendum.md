# Alfi slice 1 - plan addendum (owner decisions, 2026-11-21)

Adds to `2026-11-21-alfi-guided-path-slice1.md` (same Global Constraints apply). Owner decisions, verbatim intent:
1. **No daily sitting limit.** "Do not limit the daily sessions, allow as many attempts as the child wants, just make
   sure he takes a break every 10 minutes, for 2 minutes." Pace: **one new letter per sitting** (3-5); check-points
   still wait for a later day; "known" still needs correct recall on two separate days.
2. **The dino jumper is in the first version** for 3-5, with no lives and no losing.

Order: T13 (fix) -> T14 (parent page, with the changes below) -> **T17** -> **T18** -> full preview APK -> T15 after the
OWNER CHECK -> final APK.

## Change to Task 14 (parent page) before it starts
- Remove the daily-limit select and the "פתיחת ישיבה נוספת היום" button.
- Add a "הפסקות" setting group: break every **10** minutes (select 5 / 10 / 15 / 20), break length **2** minutes
  (select 1 / 2 / 3 / 5), and a "דילוג על ההפסקה הנוכחית" button shown only while a break is running. Stored in
  `SaveData.settings` as `breakEveryMin` (default 10) and `breakLengthMin` (default 2); `isSaveData` accepts their
  absence (older saves) and applies the defaults.
- Keep `ChildRecord.dailyLimitMin` and `PathProgress.extraSittingDay` in the schema (older saves), unused by the UI.

## Task 17: Unlimited sittings and breaks

**Files:** Modify `src/engine/planner.ts`, `src/engine/pathRules.ts`, `src/engine/progress.ts` (and their tests),
`src/ui/runner.ts`, `src/ui/screens/map.ts`, `src/store/schema.ts`; Create `src/ui/screens/break.ts`,
`src/ui/breakClock.ts`; content: new line ids `break.start`, `break.end` (LINE_IDS, both JSON files, the md table rows
marked "חדש" for the owner); Tests: `tests/engine/planner.test.ts` (extend), `tests/ui/break.test.ts`.

**Planner rules (replace the once-a-day rules):**
- Rule 1 (daily limit) is removed from `nextStep` / `sittingStatus` (the field may stay; it is ignored).
- A closed sitting no longer means `tomorrow`: the next start opens a **new sitting** (fresh `sitting` object for the
  same day). `sittingStatus` is `ready` whenever any step can be offered; `tomorrow` is no longer returned (keep the
  union member for compatibility, unused).
- Warm-up: once per **sitting** (not per day), same item choice as today.
- New unit: at most `unitsPerSitting` units started **in the current sitting** (3-5: 1).
- Check-points: unchanged - due only when none of its block units started today.
- When no new unit and no due check-point / pending practice can be offered (e.g. after the 3rd letter, same day), the
  sitting is a **practice sitting**: warm-up + one `gameRotation` game on the weakest taught unit (same as today's
  review sitting), then the sitting closes. This repeats without limit.
- `extraSittingDay` is ignored.
- Tests (names and assertions): `same day after a unit, the next sitting starts the next unit` (fresh child, unit 1
  done, same day -> next sitting's first content step is `meet` of unit 2); `after unit 3 the same day, the next
  sitting is a practice sitting` (kinds `['warmup','station']`, game on a taught unit, no `meet`); `cp1 is due the next
  day` (unchanged); `a sitting never introduces more than one new unit (3-5)`; `no limit: sittingStatus is ready after
  any number of closed sittings the same day`.

**Breaks (runner + screen):**
- `breakClock.ts`: pure `{ playedSec, breakUntil }` logic: `addPlay(sec)`, `due(now, everyMin)`
  (`playedSec >= everyMin*60`), `start(now, lengthMin)` -> `breakUntil = now + lengthMin*60000`, `playedSec = 0`,
  `active(now)`, `remaining(now)`. A gap of at least `lengthMin` minutes with the app closed or hidden counts as a
  break (reset `playedSec`). Kept in `SaveData.settings` (`breakUntil`, `playedSinceBreakSec`) so closing the app does
  not skip a break.
- The runner adds active seconds to the break clock; after a station completes (never inside a step), if `due`, it
  shows the break screen instead of the next step.
- Break screen (`break.ts`, mockup style of the end screen, calm night colours): speaks `break.start` (draft: "זמן
  להפסקה קצרה! נחים קצת ומשחקים עוד מעט"), a large friendly countdown (circle filling, no digits needed), no buttons
  for the child; at the end speaks `break.end` (draft: "ההפסקה נגמרה, ממשיכים!") and returns to the map with the next
  station glowing. Android back during a break goes to the map, where the next station shows the break countdown and
  is not tappable until it ends. A parent can skip it: long press the photo -> gate -> parent page "skip".
- Reduced motion: the countdown fill steps instead of animating.
- Tests: `break starts after 10 minutes of play, only between stations`; `the child cannot start a station during a
  break`; `closing the app does not skip a break` (breakUntil persisted); `a long absence counts as the break`;
  `parent skip ends the break`.

## Task 18: Dino jumper (fifth short game)

**Files:** Create `src/steps/jump.ts` (using `gameKit.ts`); Modify `src/steps/registry.ts`,
`src/engine/profiles.ts` (`jump` profile + `SLICE_STEPS` gains `'jump'`), `content/curriculum-letters.json`
(`gameRotation` `['plane','race','mole','match','jump']`) and the curriculum/profile tests whose expected rotation
changes; content line `jump.ask` (draft: "קופצים ואוספים רק את {name}!"; LINE_IDS, both JSON files, md row "חדש");
Test: `tests/steps/jump.test.ts`.

- Port the old game's jumper (`D:\alfi\web\index.html`, `IMPL.jump` around line 1585) to DOM/CSS with one rAF loop,
  transforms only (no canvas, no large emoji `fillText` - draw the dino as an inline SVG).
- 3-5 rules: **no lives, no losing, no timer**. A fall into a pit or a bump into a rock replays that hop from the edge
  (a short "אופס" sound, no speech, slips+1, no answer). Wrong letters are bumped harmlessly (slips+1, no answer).
  Collecting a target letter -> `ok recall` (letter name spoken). Ends after `jump.targets` collected.
- Pick-out rule: all letter signs `pick-neutral`; HUD fills with stars; the target is named by the voice, never shown.
  Targets scattered via `scatterSequence` (spawn order; never two targets in a row, heights varied, never a trail).
- One big jump button (>= 96px) plus tap anywhere on the stage; works with either hand.
- Profile 3-5: `jump: { targets: 5, speed: slow, gapSec: 2.6 }`; 6-8: `{ targets: 6, faster, gapSec: 1.8 }` (exact
  numbers to the builder, recorded in profiles.ts).
- Abort cancels rAF, timers and listeners. Tests: evidence kinds (target ok recall, wrong letter slip only, fall slip
  only), neutral faces, no sample shown, scatter S1/S2 on the spawn order, ends after targets, abort leaves no timer.

## Task 19: Letter card, four levels, "practise more" marks, parent-started sitting on a letter

Owner decisions (2026-11-21): a summary of all letters with how well each is learned; mark a letter to be worked on
more; start a sitting on a specific letter from the parent page. Marks are meaningful only for letters already met.
A parent-started sitting on a letter NOT yet met **moves that letter into the path now**.

**Files:** Modify `src/engine/mastery.ts` (levels), `src/engine/planner.ts` / `pathRules.ts` / `progress.ts`
(focus marks, parent-started sitting, check-point blocks by introduction order), `src/store/schema.ts`
(`PathProgress.focus: UnitId[]`, `PathProgress.introOrder: UnitId[]`, both optional for older saves),
`src/ui/screens/parent.ts`, `src/ui/parentText.ts`, `src/ui/runner.ts`, `src/ui/boot.ts`; content lines for the
parent-started sitting intro if needed (owner check, md rows "חדש"); tests in the matching test files.

- **Four levels** (`letterLevel(recs, taught)`): `notYet` (never met), `met` (meet done, no answers yet),
  `practising` (any answers, not known: a recent mistake or correct on one day only), `known` (isKnown for every item).
  The parent grid shows the four levels with a legend (colours that also differ in lightness) and a small flag on
  marked letters.
- **Letter card** (tap a letter in the grid): level, distinct days with correct recall, success rate of first answers,
  top confusions ("מתבלבל/ת עם כ"), last practised (short date). Buttons: "תרגול נוסף לאות הזו" (toggle mark; enabled
  only for met letters; at most 3 marks - the 4th asks to remove one) and "בואו נתרגל את האות הזו עכשיו" (any letter).
- **Marks** (`PathProgress.focus`, max 3): marked units are preferred by the warm-up choice, by practice sittings and by
  the game unit of practice/review sittings (weight boost, still weak items first among equals). A mark clears when the
  parent removes it or 3 days after the letter becomes known. Marks never change isKnown, check-point rules or the
  path order.
- **Parent-started sitting on a letter** (closes the parent page, runs immediately, then back to the map; breaks still
  apply):
  - letter already met: practice sitting on that unit only: find, soundPick, drive, one game (rotation);
  - letter not met: **moved into the path now**: run that unit's stations (meet, find, drive, firstSound, game) as the
    unit's real stations (stationsDone, unitStartDay, sticker); it is appended to `introOrder`; the normal path later
    skips units already started.
  - **Check-point blocks follow introduction order:** a check-point is due after every 3 units in `introOrder` order
    (not curriculum order); `expandPath` keeps the curriculum order for the map layout, but a moved letter shows as
    met where it sits on the map. Old saves without `introOrder`: derive it from `unitStartDay` order.
- **Tests:** levels for each state; card numbers (recall days, success rate, confusions); mark limit 3 and only for met
  letters; a marked letter wins the warm-up over an equally weak unmarked one; a parent sitting on a met letter records
  answers and leaves the path order unchanged; a parent sitting on an unmet letter (e.g. the 5th) marks it started and
  done, the next normal sitting continues with the next unstarted unit in curriculum order, and the next check-point
  block is the next 3 units by introduction order; an old save without the new fields loads.

## Addition to Task 19 (owner, 2026-11-21): every letter plays all the games
- `content/curriculum-letters.json`: each unit's stations are `meet, find, drive, firstSound` followed by **all** games
  of `gameRotation` (plane, race, mole, match, jump), the game order rotated per unit (unit i starts at game
  `i mod 5`) so each letter opens with a different game. Replace the single `$game` station with an `$allGames`
  station spec expanded by `expandPath` (keep `$game` supported for practice / review sittings, which still play one
  rotating game).
- Update the curriculum tests (`expands to ... $game by rotation` becomes: every unit has the 5 games after the 4
  teaching stations; unit 1 starts with plane, unit 2 with race, ...), the planner / runner tests that count unit
  stations (5 -> 9) and `previewSitting` length.
- The break rule already applies between stations, so a long sitting gets its 2-minute break between games.

## Task 20: Letter race - continuous steering (owner, 2026-11-21)
Owner: "In the 3d racing, I want constant control, currently it jumps from lane to lane by tapping, I want the kid to
control the car constantly."
- `src/steps/race.ts`: replace lane-snapping with a continuous car position `carX` in [-1, 1] (road-relative).
  - Drag: a pointer down anywhere on the lower half of the stage, then the car eases toward the finger's road-relative x
    every frame (smoothing, max steer speed per second from the profile); no snapping to lanes.
  - Hold-to-steer: the existing big left / right buttons steer continuously while held (pointerdown -> steer, pointerup /
    leave / cancel -> stop), never jump a lane. Keyboard arrows in a browser do the same.
  - Collection: an item at z near the car counts when |item road x - carX| is within the car's half width plus the
    item's radius (projected), not by lane equality. Items still spawn in 3 lanes from `scatterSequence` (owner pick-out
    and scatter rules unchanged); wrong letters touched are motor slips, as before.
- Profile: `race.steerPerSec` (3-5 gentle, 6-8 faster).
- Tests: dragging moves carX continuously (intermediate values between lanes); holding a button changes carX over
  time and stops on release; collection by overlap (an item between lanes is collected when the car is under it);
  existing evidence / scatter / abort tests still pass. Order: after Task 18, before Task 19.

## Owner preview feedback (2026-11-21)

Owner, verbatim intent (from the preview APK):
1. "Remove all the control buttons in play, up down, left right."
2. "There are no sounds in the games, use the old app games sounds and background music."
3. "Do not wait for the kid to tap the green forward button, when he wins, there should be a successful window, like in
   the old app. With the option to either try again or move on; when failed, a failed window which tells you to try
   again."
4. "The 3d race ... too narrow, it should use more screen space, and have curves in the track like the old one."
5. "In the Dino check out the older implementation: it also needs to jump when terrain steps up, more frequent pits to
   fall in, and it was stretched across 3 difficulty levels, each a bit harder than the one before."
6. "In the letters pairs, I liked the older implementation better: the different textures, smaller letter cards and
   more pairs per screen."
7. "I take back the neutral colors rule, as long as the target letters also switch colors and do not always stand out
   as bigger or same color."
8. "Dino should also use more screen space."
- When a game fails: **"Like the old app"** - each old game's own lives / timer / falls, with the failed window when
  they run out.

The old game is `D:\alfi\web\index.html` (read only). Every "old" value below is quoted from it; where a task departs
from it, the task says so and why. These rules replace the global constraints' "no timers and no losing for 3-5" and
"pick-neutral" lines (both docs updated, marked "owner 2026-11-21").

| Owner item | Task |
|---|---|
| 1 buttons | 24 (plane, race, dino); 25 and 26 keep it in the rewrites |
| 2 sounds and music | 21 (every game task also wires its old sound events) |
| 3 result windows, fail "like the old app" | 22 (windows, failed outcome); 25 (race timer); 26 (dino lives) |
| 4 race | 25 |
| 5, 8 dino | 26 |
| 6 pairs | 27 |
| 7 colours | 23 |

**Order:** T21 (audio) -> T22 (result windows + failed outcome) -> T23 (colour rule) -> T24 (no buttons, full-screen
game stage) -> T25 (race) -> T26 (dino) -> T27 (pairs) -> T28 (content check + preview APK). Each task ends green on
`npm test` and `npm run typecheck` with its own tests; T25-T27 use the fail path of T22 and the sound names of T21, but
their tests use the fake `ctx.sfx` and need no audio.

**Old game, where things are** (line numbers in `D:\alfi\web\index.html`): audio `ac()` / `tone` / `sweep` / `noise` /
`SFX` 785-806; win / lose windows `gameWin` / `gameLose` 1142-1157, overlay CSS 96-104, `.starsrow` 348-349, `.btn`
33-35; plane 1335-1361; mole 1363-1374; pairs 1375-1391, textures 377-380, card CSS 201-210; `drawCar` 1516-1525; race
1527-1590; dino 1592-1661 (its melody is in `step`).

## Task 21: Game sounds and music from the old app

**Files:** Create `src/audio/engine.ts`, `src/audio/music.ts`; Modify `src/audio/sfx.ts`, `src/audio/audio.ts`
(`onSpeakingChange`), `src/ui/app.ts`, `src/ui/runner.ts`, `src/ui/screens/parent.ts`, `src/store/schema.ts`,
`src/steps/contract.ts` (`ctx.sfx` type), `src/steps/gameKit.ts` (`combo`), `src/steps/plane.ts`, `race.ts`,
`mole.ts`, `match.ts`, `jump.ts` (sound names only); Tests: `tests/audio/sfx.test.ts`, `tests/audio/music.test.ts`
(new), `tests/audio/audio.test.ts`, `tests/store/settings.test.ts`, `tests/ui/parent.test.ts`,
`tests/ui/runner.test.ts` (extend). No new dependency.

**Step 1 - why the preview was silent (check first, record in the task report).** `createSfx` builds its
`AudioContext` lazily on the first `play()`, which runs inside a rAF tick or a timer, not inside a tap, and its master
gain is `effectsVolume` (default 0.4) on top of recipe gains of 0.07-0.11; the old app played those gains straight to
the destination, so the new app is 2.5 times quieter at best. On the phone (chrome://inspect on the WebView) log
`ctx.state` and the master gain during a game. Both causes are fixed below whatever the log shows; the wrapper already
has `setMediaPlaybackRequiresUserGesture(false)` (no wrapper change).

**Step 2 - one sound engine (`engine.ts`).** `createSoundEngine(doc = document): SoundEngine` with
`ac(): AudioContext | null`, `master(): GainNode | null`, `unlocked(): boolean`, `onUnlock(cb): () => void`,
`setLevel(effectsVolume: number)`, `dispose()`.
- Unlock like the old app (old line 786): capture listeners `pointerdown`, `keydown`, `touchstart` (`{ capture: true,
  passive: true }`) on `doc` create the context on the first gesture and `resume()` it whenever it is `suspended`. A
  sound asked before the unlock is dropped (never queued); music asked before it starts on the unlock.
- `visibilitychange`: hidden -> `ctx.suspend()`; visible -> `ctx.resume()` (no music in the background on Android).
- Level: master gain = `clamp(effectsVolume / SFX_REF, 0, 2.5)` with `SFX_REF = 0.4`, so the default setting plays the
  old app's exact gains; `0` is silent.
- sfx and music share this one context and master (one engine per app, created in `app.ts`).

**Step 3 - the old recipes (`sfx.ts`).** `createSfx(engine): Sfx` with `play(name: SfxName, arg?: number)`,
`setEnabled(on: boolean)`, `engineHum(on: boolean, ratio: number)`, `engineStop()`; `setVolume(v)` forwards to
`engine.setLevel`. The helpers are the old ones (old lines 788-790): `tone(f, d, type, v, at)` (attack 0.015 s
exponential, release to 0.0001 at `d`), `sweep(f0, f1, d, type, v)` (attack 0.02 s), `noise(d, v, f0, f1, at)` (white
noise through a bandpass gliding f0 -> f1). Recipes, exactly:

| name | old recipe |
|---|---|
| pick | tone 520, .1, triangle, .07 |
| good | tones 784, 988, 1175, 1568: .16 s sine .09, one every .06 s |
| bad | tone 300, .18, sine, .1 + tone 240, .22, sine, .08 at .1 |
| boing | tone 330, .12, triangle, .11 + tone 247, .2, triangle, .11 at .11 |
| pop | noise .18 s, .3, 1800 -> 300 |
| chime | tone 784, .28, sine, .11 + 1047, .34, sine, .1 at .11 + 1319, .4, sine, .07 at .22 |
| fanfare | tones 523, 659, 784, 1047, 1319, 1568: .3 s triangle .1, one every .1 s; then 1047, 1319, 1568, 2093: .45 s sine .06 at .75 + i*.08 |
| jump | sweep 420 -> 760, .18, sine, .1 |
| bump | sweep 220 -> 80, .3, sawtooth, .08 |
| ouch | sweep 600 -> 150, .4, sawtooth, .08 |
| door | tones 523, 659, 784, 1047: .22 s triangle .1, one every .09 s |
| bonk | tone 160, .12, square, .08 + noise .1 s, .4, 900 -> 200 |
| tick | tone 1200, .05, square, .03 |
| go | tone 880, .3, square, .06 (race start, old line 1555) |
| combo | `arg` = streak: tone 440 + min(arg, 20)*30, .09, square, .035 (old `ctx.ok`) |
| lane | `arg` = lane 0..2: tone 500 + arg*80, .06, triangle, .05 (old race lane change) |

- New-app names go: `hop` -> `jump`, `oops` -> `ouch`, `whoosh` -> `bump`. `coin` and `applause` (shop and toys only)
  are not ported.
- `engineHum(on, ratio)` (race only, old line 1542): sawtooth + triangle oscillators -> lowpass 600 Hz -> gain;
  frequencies `48 + 70*ratio` and `96 + 140*ratio` (setTargetAtTime tau .15), gain `on ? .03 + .035*ratio : 0` (tau
  .12); created on the first call; `engineStop()` stops both oscillators (the race calls it on done, fail and abort).
- `setEnabled(false)` (setting "game sounds" off): `play` and `engineHum` do nothing.

**Step 4 - background music (`music.ts`).** The old app's only background music is the dino's melody (old `step`,
`musT`): one note every **0.3 s** through `MP = [0,2,4,2,1,3,2,0,2,4,3,1,0,1,2,-1,3,4,3,2,1,2,0,-1]` (24 steps, `-1` =
rest) over `MN = [523,587,659,784,880]`, each note `tone(MN[n] / 2, .25, 'triangle', .025)`, looping (7.2 s). It
becomes the music of every game (ruling: music during games).
- `createMusic(engine): Music` with `start()`, `stop()`, `duck(on: boolean)`, `setEnabled(on: boolean)`.
- Scheduled on the AudioContext clock (a 100 ms `setTimeout` loop schedules the notes falling in the next 0.4 s), not
  on rAF, so it keeps time when frames drop. Notes go through a `musicGain` -> master.
- Duck under speech: `duck(true)` -> musicGain to **0.35** (setTargetAtTime tau .08); `duck(false)` -> 1.
- `stop()` clears the loop and drops musicGain to 0 at once (no tail); `start()` twice is one melody; `start()` before
  the unlock plays from the unlock; `setEnabled(false)` stops it and makes `start()` a no-op.

**Step 5 - speech signal (`audio.ts`).** `AudioApi.onSpeakingChange(cb: (speaking: boolean) => void): () => void`:
true when a line starts (clip or live), false when the last line ends, is stopped or times out. `app.ts` wires
`audio.onSpeakingChange(s => music.duck(s))`. `AppState` gains `music: Music`.

**Step 6 - when the music plays (runner).** A step whose id is in `curriculum.gameRotation` starts the music when its
station mounts (ducked while the ask is spoken); the music stops when the result window opens (Task 22), on back /
leaving the station, and on the break screen. Teaching steps, warm-ups and check-points have no music.

**Step 7 - the old sound events per game** (each game's `sfx(...)` calls; fake-sfx tests assert the names):
- plane: pop + good on a target; **bad** on a wrong balloon (was bonk; old line 1357); combo.
- mole: bonk on every tap of a raised mole; good on a target; bad on a wrong letter (unchanged); combo.
- pairs: pick on the first card, good on a pair, bad on a mismatch, chime when a round is cleared (unchanged); combo.
- race and dino: their full old event lists are in Tasks 25 and 26 (until then: `hop` -> `jump`, `oops` -> `ouch`,
  `whoosh` -> `bump`).
- `gameKit.combo(sfx)`: `{ hit(): void; miss(): void }` - each target collected adds one, any wrong pick or slip resets;
  from the 3rd in a row `hit` plays `combo` with the streak (old: from 3).

**Step 8 - settings.** `SaveData.settings.musicOn?: boolean` and `sfxOn?: boolean` (default true; `withSettingDefaults`
fills them; `isSaveData` accepts their absence and rejects a non-boolean). Parent page, "הגדרות": two switches
"מוזיקה במשחקים" and "צלילי משחק" (on / off, >= 44px, applied at once, saved); the slider "צלילי משחק" is renamed
"עוצמת צלילים ומוזיקה" (same `effectsVolume`).

**Tests (names and assertions):**
- `sfx.test.ts` (fake AudioContext recording oscillators, frequencies, types, gains and start times): `every sound plays
  the old recipe` (table-driven over the table above: frequencies, types, peak gains, start offsets); `nothing plays
  before the first gesture, then the context is created on pointerdown`; `a suspended context is resumed on a gesture`;
  `a hidden page suspends the context and a visible one resumes it`; `the default effects volume plays the old gains
  (master 1.0) and 0 is silent`; `game sounds off: play and engineHum do nothing`; `engineHum follows the speed ratio and
  engineStop stops both oscillators`.
- `music.test.ts`: `plays the old dino melody: 24 steps of 0.3 s, notes MN/2, rests at -1, triangle .25 s at .025`;
  `loops after 7.2 s`; `duck lowers the music to 0.35 while speech plays and restores it`; `start before the unlock
  waits for the first gesture`; `stop silences at once and start twice plays one melody`; `music off: start does
  nothing`.
- `audio.test.ts`: `onSpeakingChange reports true at a line start and false at its end, on stop and on the live
  timeout`.
- `settings.test.ts`: `an older save without musicOn / sfxOn loads with both on`; `a non-boolean musicOn is rejected`.
- `parent.test.ts`: `the music and game sounds switches save and apply at once`.
- `runner.test.ts`: `music starts when a game step starts and stops on back; a teaching step plays no music`; `the
  break screen plays no music`.
- `games.test.ts`: `a wrong balloon plays bad`; `a third target in a row plays combo 3`.

## Task 22: Result windows (success / failed) instead of the green arrow

**Files:** Create `src/ui/resultWindow.ts`; Modify `src/engine/types.ts` (`StepResult`), `src/engine/progress.ts`,
`src/steps/gameKit.ts` (`fail`), `src/ui/shell.ts` (the next slot goes), `src/ui/runner.ts`, `src/content/schema.ts`
(LINE_IDS), `content/letters-3-5.json`, `content/letters-3-5.md` (rows "חדש"), `content/spoken-lines.json`
(`npm run lines`); Tests: `tests/ui/result.test.ts` (new), `tests/ui/runner.test.ts`, `tests/engine/progress.test.ts`,
`tests/steps/games.test.ts`.

**Step 1 - a failed outcome.** `StepResult.outcome: 'done' | 'failed' | 'aborted'`, plus optional `failLine?: string`
(a content line id for the failed window; the engine treats it as opaque). `gameKit.Game.fail(answers, slips,
failLine?)` resolves once with `outcome: 'failed'` and stops everything like `done`.

**Step 2 - engine rules (`progress.ts`).**
- `recordAnswers(i, r, now): StepOutcome` (new, exported): the answers go to mastery exactly as in `applyStepResult`;
  progress is returned unchanged.
- `applyStepResult` with `outcome: 'failed'` = `recordAnswers`: the station is not done (stationsDone, unitStartDay,
  introOrder and stickers unchanged), `sitting.done` does not grow, the practice `pending` head and the parent `queue`
  head stay, the sitting never closes. So the planner offers the same step again; answers given before the fail count.
- A replay after a success (the child tapped "עוד פעם") is applied with `recordAnswers`: the evidence counts as normal,
  the path never moves twice for one station.
- Mastery rules are unchanged (slips are never evidence; known still needs two days).

**Step 3 - the window (`resultWindow.ts`), the old look** (old `showOverlay` + `gameWin` / `gameLose`; CSS lines
96-104, 348-349, 33-35): `mountResult(host: HTMLElement, o: ResultOpts): { choice: Promise<'again' | 'continue'>;
dispose(): void }` with `ResultOpts = { kind: 'success' | 'failed'; stars: 1 | 2 | 3; failLine?: string; audio;
sfx; content; rng; reducedMotion: boolean }`.
- Backdrop `rgba(6,24,60,.55)` over the whole station screen; card `#FFFFFF`, border `5px solid #0D2A5C`, radius 30px,
  shadow `0 10px 0 #0D2A5C`, padding `22px 26px`, max-width 620px, centred; enters with the old `popin` (.45 s,
  `cubic-bezier(.2,1.6,.4,1)`, from scale .4 and opacity 0).
- Success: a trophy (inline SVG, gold `#FFC928` with a `#0D2A5C` outline; old 🏆 at 80px with the old `bnc` 1 s bounce);
  a row of 3 stars, 60px, popping in at .25 s steps (old), the stars above `stars` grey (`filter:grayscale(1);
  opacity:.3`); a heading with the praise text (`clamp(32px,6vw,52px)`, `#E53935`, `text-shadow:3px 3px 0 #FFC928`);
  two buttons: "המשך" (old `.btn.g`, `#2EB85C`) with the forward-arrow icon, and "עוד פעם" (old `.btn.y`, `#FFC928`, ink
  `#0D2A5C`) with a circular-arrow icon. Buttons are >= 96px tall (icon + text for pre-readers), old `.btn` border
  `3px solid #0D2A5C`, radius 18px, shadow `0 5px 0 #0D2A5C`, Rubik 800.
- Failed: a big heart / flexed-arm SVG (old 💪) with the same bounce; heading "כמעט!" (old); under it the text of
  `failLine` when given (e.g. "נגמר הזמן!"); one button "נסו שוב" (old wording, green, circular-arrow icon).
- Stars (old `gameWin`): `wrong = answers.filter(a => !a.ok).length + slips`; `wrong === 0` -> 3, `wrong <= 2` -> 2,
  else 1. Teaching stations and check-points use the same formula (meet is always 3).
- Sounds and speech: success - `fanfare` and confetti, then after 350 ms (old) a praise from `content.praise` (random),
  queued `result.stars3` when 3 stars, queued `result.choose`; failed - `boing`, then `failLine` (if any), queued
  `result.fail`. After 6 s with no tap the window says `result.choose` (success) or `result.fail` (failed) once more,
  never again. Every button tap plays `pick` (old).
- Confetti: a light DOM version of the old one (old: 180 canvas particles, colours `#E53935 #FFC928 #1E6FD9 #2EB85C
  #FB8C00 #FFFFFF #A50044 #004D98`, shapes rect / circle / star): **40** divs, transform keyframes only, removed after
  2.6 s (fewer particles keeps the frame budget on a phone).
- Reduced motion: no popin, no bounce, no star pop, no confetti.
- A button fires once, however often it is tapped (same guard as the old next arrow); `dispose()` stops the idle timer
  and the speech.

**Step 4 - runner flow.** The shell loses `showNext`, its 96px next slot and the `step.next` idle prompt (the line id
stays in LINE_IDS, unused). After a step resolves:
1. `aborted` -> map (unchanged).
2. Apply: `done` -> `applyStepResult` (or `recordAnswers` when this run is a replay after a success); `failed` ->
   `applyStepResult` (= `recordAnswers`). Play seconds and the break clock count as before; persist.
3. Stop the music and the engine hum (Task 21); open the window over the station screen: `success` for `done` (every
   step: games, meet, find, drive, firstSound, soundPick, check-point; teaching stations cannot fail), `failed` for
   `failed`.
4. No tap -> nothing happens (no auto-advance, no timeout).
5. On a tap, first the break rule: if a break is due, the break screen shows (the map afterwards glows the same next
   station). Otherwise "המשך" -> the next planner step (or the end screen); "עוד פעם" / "נסו שוב" -> the same
   `PlannedStep` runs again in a fresh shell, flagged `replay` when it followed a success.
6. Back while the window is up -> map; the result is already saved; nothing more is recorded.

**Step 5 - content lines** (LINE_IDS, both JSON files, md rows marked "חדש" for the owner check; draft, gender-neutral):

| id | when | draft |
|---|---|---|
| result.stars3 | success with 3 stars (old "שלושה כוכבים!") | שלושה כוכבים! |
| result.choose | success, after the praise | רוצים עוד פעם, או ממשיכים? |
| result.fail | failed window (old "כמעט! ... ננסה שוב") | כמעט! בואו ננסה שוב |

**Tests (names and assertions):**
- `result.test.ts`: `stars follow the old formula (0 errors 3, up to 2 errors 2, more 1; slips count)`; `success shows
  trophy, stars, praise and the two buttons`; `failed shows only "נסו שוב" and the failLine text`; `success says a
  praise, result.stars3 only with 3 stars, then result.choose`; `failed plays boing and says the failLine then
  result.fail`; `after 6 s idle the prompt is said once, never twice`; `a double tap fires the choice once`; `reduced
  motion: no confetti nodes and no animation`; `dispose stops speech and the idle timer`.
- `progress.test.ts`: `a failed result records its answers and leaves stationsDone, pending, the parent queue and
  sitting.done unchanged`; `recordAnswers changes mastery only`.
- `runner.test.ts`: `a finished step shows the success window and nothing advances without a tap` (fake timers, 60 s);
  `continue goes to the next step`; `try again after a success replays the same step; its answers reach mastery; the
  replay adds nothing to stationsDone or sitting.done`; `a failed game keeps the station next, saves the answers given
  before the fail, and try again replays it`; `teaching stations show the success window`; `a break due when the window
  closes shows the break screen instead of the next step`; `back on the window returns to the map without another save`;
  `music stops when the window opens`. Replace `next fires once on a double tap` with `the window's continue fires once
  on a double tap`, and `back while the next arrow waits ...` / `back at the last next arrow ...` with their window
  equivalents (same assertions).
- `games.test.ts`: `game.fail resolves failed once, with its failLine, and leaves no timer or frame`.

## Task 23: Colour rule - targets look like every other letter (replaces pick-neutral)

**Files:** Create `src/steps/faces.ts`; Modify `src/steps/plane.ts`, `race.ts`, `mole.ts`, `jump.ts`, `choice.ts`
(letter options: find, soundPick, check-point; firstSound's word options are not letter faces and stay),
`src/styles/base.css` (`.pick-neutral` -> `.pick-face`), `src/styles/tokens.ts` (contrast pairs); the global constraints
and design 9b are already updated; Tests: `tests/steps/faces.test.ts` (new), `tests/steps/games.test.ts`,
`tests/steps/jump.test.ts`, `tests/steps/choice.test.ts`, `tests/util/contrast.test.ts`.

**Rule (owner 2026-11-21):** every letter face (balloon, disc, sign, mole sign, choice card) draws its colour from one
palette and its size from one scale set; targets draw from the same palette with the same distribution and from the
same sizes as the other letters. No property singles a target out. Feedback colour still appears only after a pick
(the collected / correct face turns `#2E9E5B` with white ink, a 4px white ring and the pop).
- `FACE_PALETTE` = the old plane's balloon colours (old line 1348, `BC`): `#FFC928`, `#E53935`, `#1E6FD9`, `#2EB85C`,
  `#FB8C00`, `#AB47BC`, `#00ACC1`.
- `faceInk(bg)`: `#1D2742` or `#FFFFFF`, whichever has the higher contrast (yellow, green, orange, cyan -> ink; red,
  blue, purple -> white). The old app used white on all but yellow; white on orange, green and cyan is below 3:1, so
  the ink follows contrast (all >= 3:1 for the >= 32px Rubik 800 faces).
- `FACE_SCALES = [0.9, 1, 1.1]` (uniform): the face's size multiplier (font and box).
- `faceLook(rng): { bg: string; ink: string; scale: number }` - uniform over palette and scales; the same call for a
  target and a distractor. `faceLooks(rng, n)`: n distinct colours (a shuffled palette slice, for choice rounds),
  scales uniform.
- Each face element carries `class="pick-face"`, `data-bg` and `data-scale` (for the tests), and is drawn with `bg`,
  `ink`, the base size times `scale`, Rubik 800. The mole sign, race disc and dino sign keep a thin `#0D2A5C` ring (old).
- The old app's random font per letter (old `FONTS`) is not ported: those are system fonts the app cannot bundle
  offline; Rubik stays.

**Tests (names and assertions):**
- `faces.test.ts`: `every palette colour has >= 3:1 with its ink`; `faceLook is uniform: over 7000 draws each colour is
  1/7 +- 0.02 and each scale 1/3 +- 0.02`; `faceLooks gives distinct colours`.
- Per game (`games.test.ts`, `jump.test.ts`), helper `faceStats(step, seeds)` (30 seeds, count the spawned faces, no
  play needed), split target / other faces: `<game>: target colours have the same frequencies as the other letters
  (|diff| <= 0.06 per colour over >= 300 target faces)` and `<game>: no target face has a scale outside the other faces'
  scale range`; for plane, race, mole and jump.
- `choice.test.ts`: `the correct option's colour is uniform over the palette across rounds` (same tolerance); `options
  in one round have distinct colours`; replace `all options share the neutral style before a pick` with `options differ
  only in palette colour and scale before a pick`.
- `expectNoSample()` (games tests) checks `.pick-face` instead of `.pick-neutral`.

## Task 24: No control buttons in play; games use the whole screen

**Files:** Modify `src/steps/plane.ts`, `src/steps/race.ts`, `src/steps/jump.ts`, `src/steps/gameKit.ts` (delete
`arrowButton`), `src/ui/shell.ts` (`fullBleed`), `src/ui/runner.ts`; Tests: `tests/steps/games.test.ts`,
`tests/steps/jump.test.ts`, `tests/ui/runner.test.ts`.

**Controls (ruling; the old touch scheme where it had one):**
- Plane: no up / down buttons. A pointer down anywhere on the stage, then the plane eases to the finger's height while
  it is held or dragged (old: `pointerdown` + `pointermove` on the arena; ease `py += (ty - py) * min(1, dt*9)`, the old
  9, was 8). ArrowUp / ArrowDown move the target height one row (browser testing). `BOTTOM_GAP` 130 -> 40.
- Race: no left / right buttons; a drag anywhere on the stage steers (the lower-half limit of Task 20 goes with the
  buttons). The old race switched lanes by tapping the screen halves; the owner asked for continuous control (Task 20),
  so the drag stays. Arrow keys steer while held. (The race rewrite is Task 25; this task only removes the buttons and
  the half limit from the current race.)
- Dino: no hop button; a tap anywhere on the stage hops (old: `pointerdown` on the canvas). Space / ArrowUp hop.
- F1 stays: a collection is recall only after input within `ACTIVE_SEC` (1.5 s); a drag, a held finger, a key and a
  tap count.

**Full-screen game stage:** `ShellOpts.fullBleed` (set by the runner for `gameRotation` steps): the stage spans the
whole width and runs to the bottom edge (no side or bottom padding); the game arena is `position:absolute;inset:0`, no
rounded corners, no `min-height`. The top row (replay + progress bar) stays. With Task 22 the 96px next slot is gone for
every step.

**Tests (names and assertions):** `plane: no buttons in the arena; a held finger keeps steering and keys move one row`;
`race: no buttons; a drag anywhere steers continuously; arrow keys steer while held` (replaces the button and half
tests of Task 20); `jump: no buttons; a tap anywhere is one hop, never a double hop` (replaces `one big jump button`);
`runner: a game step's stage is full-bleed, a teaching step's is not`; `gameKit no longer exports arrowButton`.

## Task 25: Letter race - the old pseudo-3D road with curves, a timer and a fail

**Files:** Rewrite `src/steps/race.ts` (a pure road model + an SVG / DOM view); Modify `src/engine/profiles.ts`
(`race`), `src/content/schema.ts` (LINE_IDS), `content/letters-3-5.json`, `content/letters-3-5.md`,
`content/spoken-lines.json`; Tests: `tests/steps/race.test.ts` (rewrite), `tests/steps/games.test.ts` (race block).

**Port of the old renderer** (old lines 1527-1590), drawn with one SVG of pooled polygons (no canvas, the app's rule)
and DOM items:
- Constants (old): `SEG = 200`, road half width `RW = 2000`, `LANES = [-0.62, 0, 0.62]`, camera height `CAMH = 1000`,
  field of view 100 deg (`DEPTH = 1 / tan(50 deg)`), `DRAW = 110` segments, `PZ = CAMH * DEPTH` (the car's distance).
- Road (old `addRoad(enter, hold, leave, curve, hill)`; curves enter with ease-in `eIn(a,b,p) = a + (b-a)*p*p` and
  leave with ease-in-out `eIO(a,b,p) = a + (b-a)*(-cos(p*PI)/2 + .5)`, hills ease-in-out over the whole piece):
  `addRoad(10,30,10,0,0)`; while fewer than 2100 segments `addRoad(rint(15,25), rint(25,50), rint(15,25),
  pick([0,1.6,-1.6,2.4,-2.4,0,3,-3]), pick([0,0,8,-8,14,-14]))` (a hill rises `hill*SEG`); then `addRoad(20,140,20,0,0)`.
  Segment stripe = `floor(i/3) % 2`.
- Projection (old `proj`): `z = wz - pos`, `s = DEPTH / z`, `x = W/2 - s*camX*W/2`, `y = H/2 - s*(wy - camY)*H/2`,
  `w = s*RW*W/2`. Curves: per drawn segment `x += dx; dx += curve`, starting `dx = -(baseCurve * baseFraction)`, camera x
  `carPos*RW - x`; camera y = the road height under the car + `CAMH`; a segment is skipped when behind the camera, back
  facing, or hidden by a nearer crest (the `maxy` clip).
- Pure API (tested): `buildRoad(rng): Segment[]`, `placeItems(road, rng, cfg, spawner): void`, `roadFrame(road, pos,
  carPos, W, H): { quads: Quad[]; items: ItemDraw[]; bgShift: number }` (screen polygons and item positions; the DOM
  layer only writes `points` and transforms).
- Look (old colours): sky gradient `#1E88E5` -> `#B3E5FC` over the top 60%; sun `#FFE082` at (0.82W, 0.13H), radius
  0.07*min(W,H); two hill bands `#A5D6A7` (base 0.44H, amplitude 0.14H, 3 waves, parallax 0.4) and `#81C784` (base
  0.5H, amplitude 0.09H, 5 waves, parallax 0.8, offset 300); grass stripes `#8BC34A` / `#7CB342`; rumble strips 1.18w
  `#E53935` / `#FFFFFF`; road `#90A4AE` / `#9AA9B3`; lane marks at +-0.31w, width w/45, white, on stripe segments;
  finish line: 8 black / white checks on segments `finishSeg` and `finishSeg+1`; the hills shift with
  `bgX -= curve*(speed/MAXS)*dt*60`.
- **Width:** at the car's depth the road's half width is `RW/CAMH * W/2 = W`, so the road is twice the stage width there
  and fills the bottom of the stage (old). The camera follows the car: the car is drawn at the stage's bottom centre
  `(W/2, H - 14)`, width `min(0.26W, 230)` (old), bouncing `sin(t/60)*(speed/MAXS)*1.5`, tilted
  `(steerTarget - carPos)*0.35` rad; the road slides under it.
- Car: the old `drawCar` as inline SVG: body `#E53935` (the old default of three; no car choice for the child), stroke
  `#0D2A5C`, windscreen `#B3E5FC`, tail lights `#FF1744`, wheels `#212121`, spoiler `#0D2A5C`, shadow
  `rgba(0,0,0,.25)`. **The plate stays blank**: the old plate showed the target letter, which breaks "target named by
  voice, not shown".
- Items follow the curve: an item sits on its segment at road offset `off`, drawn at `sx = a.x + a.s*off*RW*W/2` with
  size `sz = a.s*W/2*380`, hidden under 4px or below the crest clip (old). A letter item = a stalk (`#0D2A5C`, width
  `max(1, sz*.03)`) + a disc of radius `0.42sz` at `y - 1.05sz`, bobbing `sin(t/300 + x)*0.04sz`, face from `faceLook`
  (Task 23) with a `#0D2A5C` ring `max(1.5, sz*.06)`, letter Rubik 900 at `0.56sz`. Cone (old): a `#FF6D00` triangle
  (height 0.9sz, half base 0.32sz), a white band, a `#E65100` base.
- Decoration (old, lighter): 12 falling leaves (old 26; colours `#FB8C00 #FFC928 #8BC34A #E53935`) and an 18-dot burst
  on a pick-up (old colours `#FFC928 #E53935 #1E6FD9 #2EB85C`); none under reduced motion.
- Frame budget: pooled polygons (grass band, rumble, road and 2 lane marks per segment; unused ones hidden); if the
  owner's phone stutters, `DRAW` may drop to 70 (record the measured frame time and the value in the task report).

**Play rules (old values; ruling "like the old app"):**
- Need **10** targets in **60 s** (old `need=10, TIME=60`; the old game had no age variants, so both bands).
- Speed (old): `MAXS = 3200`; from 0 after the countdown; target speed `slow > 0 ? 0.45*MAXS : MAXS`, approached at
  `dt*4` while slowed and `dt*1.2` otherwise.
- Item slots (old): from segment 45 to `length - 220`, every `rint(15,22)` segments. Each slot: a cone with chance
  **0.2** (old), else the next letter from `createSpawner({ lanes: 3 })` (owner scatter rules S1-S3 kept; the old 55 /
  25 % letter split becomes the spawner's order, about half targets). With chance **0.3** (old) a slot gets a second
  item in another lane: always a **cone** (old: a target or a cone; a second target beside the first breaks S1).
- Steering: continuous (Task 20); `carPos` in road units, clamped to [-0.8, 0.8] (lanes at -0.62 / 0 / 0.62). A pointer
  down anywhere, then the drag sets `steerTarget = clamp((x - W/2) / (W/2), -1, 1) * 0.8`; the car moves toward it at
  most `steerPerSec` road units per second (smoothing `min(1, dt*10)`); arrow keys steer while held. Crossing a lane
  centre plays `lane` with that lane (the old lane-change tone).
- Collection (the old test, which is the Task 20 overlap): at the car's segment `floor((pos + PZ)/SEG)` an item counts
  when `|item.off - carPos| < 0.3`.
  - target: `good`, burst, the letter name spoken, a star slot, combo; a recall answer only with input in the last 1.5 s
    (F1).
  - wrong letter: `bump`, slowed **0.9 s** (old), a motor slip, no answer (owner rule: race contact is motor; the old
    game counted it as an error).
  - cone: `bump`, slowed **1.6 s** (old), a slip, no answer.
- Timer (the old HUD box): white, border `3px solid #0D2A5C`, radius 16px, shadow `0 4px 0 #0D2A5C`, Rubik 900; a clock
  icon and the seconds left; background `#FFF3CD` at <= 25 s and `#FFCDD2` at <= 10 s; `tick` each second of the last
  10. It runs only while playing (not during the ask or the countdown) and **stops at the 10th target** (the old timer
  ran on to the finish line, so a child could lose after collecting all ten; not ported).
- Start: after `race.ask`, the old countdown 3-2-1 (big digits `#FFC928` stroked `#0D2A5C`, `0.32*min(W,H)` px, `tick`
  each second), then `go` and `race.go` spoken.
- Finish: the 10th target sets `finishSeg = carSeg + 40` (old) and says `race.finish` after 700 ms; passing it ->
  `done`.
- Fail: time out (or the end of the road) -> `game.fail(answers, slips, 'race.timeUp')`; the failed window says "נגמר
  הזמן!". Answers before the fail count.
- HUD: 10 star slots (24px when there are more than 8) and the timer box; no letter in the HUD (rule kept).
- Sounds: `engineHum(playing, speed/MAXS)` every 0.1 s (old), `engineStop()` on done, fail and abort; tick, go, lane,
  good, bump, combo; the Task 21 music plays under it.

**Profile (both bands, old values; `steerPerSec` converted from Task 20's 3.5 / 6 lanes per second x 0.62):**
`race: { targets: 10, timeSec: 60, maxSpeed: 3200, slotSegs: [15, 22], coneChance: 0.2, secondChance: 0.3,
coneSlowSec: 1.6, wrongSlowSec: 0.9, steerPerSec: 2.2 }` (6-8: `steerPerSec: 3.7`). `RaceGame` no longer extends
`LaneGame`. `AgeProfile.timers` becomes `true` with the comment "games keep the old app's own timers (owner
2026-11-21)".

**Content lines** (LINE_IDS, both JSON files, md rows "חדש" / "שונה"):

| id | when | draft |
|---|---|---|
| race.go | after the countdown (old) | יוצאים לדרך! |
| race.finish | after the 10th letter (old) | הנה קו הסיום! |
| race.timeUp | failed window (old, without the count) | נגמר הזמן! |
| race.ask (שונה) | the ask, now with the timer (the old ask said it too) | אוספים את {name} לפני שנגמר הזמן! |

**Tests (names and assertions):**
- `race.test.ts` (pure): `buildRoad: at least 2100 segments, curves only from the old set, hills only from the old set,
  a flat start and end`; `roadFrame: at the car's depth the road's half width equals the stage width`; `roadFrame: on a
  curve the road and an item on it shift together (item x - road centre x = off * w)`; `roadFrame: a segment behind a
  crest is not drawn and an item on it is hidden`; `placeItems: slots 15-22 segments apart between 45 and length-220;
  never two targets in one slot; no two targets in a row (S1)`.
- `games.test.ts` (race block, fake rAF + timers): `collects the named letter by overlap at the car's segment (|off -
  carPos| < 0.3)`; `a wrong letter slows the car for 0.9 s and is a slip, not an answer`; `a cone slows the car for 1.6 s
  and is a slip`; `the timer starts after the countdown, ticks in the last 10 s and stops at the 10th target`; `ten
  targets show the finish line and the step ends done when the car passes it`; `60 s without ten targets resolves failed
  with failLine race.timeUp and keeps the answers before it`; `a drag anywhere steers continuously toward the finger`;
  `engineStop is called on done, fail and abort`; `abort leaves no timer or frame`; plus the Task 23 colour tests and the
  F1 tests (a passive pick-up records no answer; a held finger counts).

## Task 26: Dino jumper - the old terrain, three levels, lives, full screen

**Files:** Rewrite `src/steps/jump.ts` (a pure level builder + physics + a DOM / SVG view; remove the leftover debug
`console.log` lines and the stray `src/steps/jump.ts.bak`); Modify `src/engine/profiles.ts` (`jump`), content lines
below; Tests: `tests/steps/jump.test.ts` (rewrite; keep the bot approach).

**Replaces Task 18's rules:** the endless course, "replay the hop" and the two-slips bridge go; the old game's levels,
lives and falls come back (ruling).

**Physics (old values, stage units; the stage is 420 units tall):** ground `GY = 320`, gravity `G = 1500`, jump speed
`JV = 760` (about 1 s in the air, apex about 192 units), run speed `SPD = 140`, air speed `AIR = 170`. A hop only from
the ground (old); Task 18's coyote time (0.12 s) and tap buffer (0.2 s) stay (input forgiveness, not a game rule).
Landing (old): on the ground under the dino or on a platform (x within `[p.x - 8, p.x + p.w + 8]`, falling, crossing its
top from above within 12 units); squash 0.72 on landing. A step up blocks walking: if the ground 16 units ahead is more
than 6 units above the feet the dino stops (old `groundAt(nx + 16) < y - 6`) - it must hop onto the step.

**Levels (old `LV`), in one game, each harder:**

| level | targets | wrong letters | pits | step-ups | platforms (target on top) | rocks |
|---|---|---|---|---|---|---|
| 1 | 5 | 3 | 1 | 1 | 0 | 0 |
| 2 | 5 | 4 | 2 | 1 | 1 | 1 |
| 3 | 6 | 5 | 2 | 2 | 2 | 2 |

- Course per level (old `build`; `buildLevel(lv, rng)`): start x 520, ground from -600, the elements in order:
  - target: 48 or 130 units above the ground (50/50; 48 is caught running, 130 needs a hop), then `x += rint(190,240)`;
  - wrong letter: 40 above the ground, `x += rint(230,270)`;
  - platform: 124 wide, top 118 above the ground, its target 160 above, `x += rint(240,280)`;
  - rock: 46 x 40, `x += rint(230,270)`;
  - pit: a gap `rint(80,105)` wide, then `x += rint(170,210)`;
  - step-up: the ground rises **60** units for `rint(260,320)`, then back down, then `x += rint(160,200)`;
  - the door 640 after the last element; the ground runs 900 past it.
- Order: the old order was `['g', ...shuffle(rest)]` (a target first). Kept, plus the owner scatter rule: no two targets
  (plain or on a platform) next to each other, and no three targets in a row at one height (`buildLevel` reshuffles the
  other elements and puts the targets in separate gaps, like `scatterSequence`).
- A target the dino runs past (70 behind it) moves ahead (old): to `door.x - 110 - moved*200` if that is more than 250
  ahead, else 260 ahead of the dino (the door and the ground move on to stay 140 / 900 beyond it); heights alternate 48
  / 130. (The old spacing of 85 at one height lined the moved targets up in a trail; 200 and alternating heights keep
  the scatter rule.)
- When the level's targets are all collected the door opens (old): `door`, then `jump.door` after 500 ms; the closed
  door stops the dino (old `door.x - 10`). Reaching the open door ends the level: `fanfare`, confetti (Task 22's DOM
  confetti), `jump.level` spoken, and a level card in the arena (old: three dots with the dino moving from the done dot
  to the next in 350 ms; one big green continue button >= 96px with the arrow icon). Its tap builds the next level and
  says `jump.ask` again. After level 3 the step ends `done`.

**Lives and fail (old):** **5** lives for the whole game (hearts HUD: `#E53935` full, white with a `#0D2A5C` outline
empty). A life is lost by a fall (`y > GY + 70`), a rock (`|dx| < w/2 + 12` and the feet below its top + 8) or touching
a wrong letter (`|dx| < 26`, `|dy| < 34`, the body 32 above the feet). Then (old): `ouch`, the stage shakes, the dino
blinks (alpha .35 every 90 ms) for 1 s; with lives left it restarts at the last ground point of its trail at least 2 s
before the loss (trail sampled every 0.1 s on the ground, at most 400 points) and waits 1 s (a tap starts it at once); a
touched wrong letter comes back after 1.2 s. Every loss is a slip, never an answer (the old game counted the wrong
letter as an error; the owner rule keeps contact motor). At 0 lives: `game.fail(answers, slips, 'jump.noLives')`; the
failed window says "אוי! נגמרו הלבבות". "נסו שוב" replays the station from level 1 (ruling; the old card retried only
the current level with 5 new lives - owner question in the report).

**Evidence:** a target caught (`|dx| < 38`, `|dy| < 50`) -> `good`, sparks, the name spoken, combo; a recall answer only
with a tap in the last 1.5 s (F1).

**Full screen (owner item 8):** the arena fills the full-bleed stage (Task 24). Scale `k = min(H/420, W/300)` (old:
`H/420`, which on a portrait phone leaves only about 230 units of view, so the width keeps at least 300 units); the
world is anchored to the arena bottom (`offY = H - 420*k`), the sky gradient fills the whole arena, the ground and the
lava reach the bottom edge. Camera: `cam += (x - 0.3*VW - cam) * min(1, dt*5)` (old).

**Look (old colours; the old emoji become inline SVG):** sky `#FF8A65` -> `#FFCC80` (45%) -> `#FFF3E0`; sun `#FFF59D`,
r 34 at (0.8VW, 70); volcano silhouettes every 600 units, parallax 0.15 (old 🌋); hills `#A1887F` at `GY - 40 -
26*(0.5 + 0.5*sin((x + cam*0.4)/170))`; palms / ferns every 380 units, parallax 0.55 (old 🌴🌿); lava below `GY + 24`:
`#FFEB3B` -> `#FF5722` (30%) -> `#B71C1C` with 10 `#FFEB3B` bubbles; ground `#795548` with `#6D4C41` pebbles and a
`#7CB342` grass top (16 units, `#33691E` outline); platforms `#8D6E63` / `#4E342E` with a grass top; rocks `#78909C` /
`#37474F`, highlight `#B0BEC5`; door frame `#5D4037` 80 x 118, inside `#3E2723` closed / `#FFF59D` open with a
`rgba(255,235,59,.35)` glow, knob `#FFC928`, a flag on top; letter signs radius 27 bobbing `sin(clock*3 + x)*4`, faces
from `faceLook` (Task 23) with a `#0D2A5C` ring. The dino stays the Task 18 SVG.

**HUD:** hearts (5), level dots (3), star slots for the current level's targets (refilled per level); no letter.

**Profile (both bands, old values):** `jump: { lives: 5, speed: 140, airSpeed: 170, gravity: 1500, jumpVel: 760,
levels: [{ targets: 5, wrong: 3, pits: 1, steps: 1, platforms: 0, rocks: 0 }, { targets: 5, wrong: 4, pits: 2, steps:
1, platforms: 1, rocks: 1 }, { targets: 6, wrong: 5, pits: 2, steps: 2, platforms: 2, rocks: 2 }] }` (replaces
`targets / speed / gapSec / obstacles`).

**Sounds:** `jump` on a hop, `good` + combo on a target, `ouch` on a loss, `door`, `fanfare` at a level's end; the old
melody is the Task 21 music.

**Content lines** (LINE_IDS, both JSON files, md rows "חדש"):

| id | when | draft |
|---|---|---|
| jump.door | the door opens (old "הדלת נפתחה! רוצו לדלת") | הדלת נפתחה! רוצו לדלת |
| jump.level | a level is done (old "שלב N הושלם!", without the number) | השלב הושלם! ממשיכים לשלב הבא |
| jump.noLives | failed window (old "אוי! נגמרו הלבבות") | אוי! נגמרו הלבבות |

**Tests (names and assertions):**
- Pure: `buildLevel follows the old table for each level (targets, wrong letters, pits, step-ups, platforms, rocks)`;
  `pits are 80-105 wide and step-ups 60 high`; `the first element is a target, no two targets are adjacent and no three
  targets in a row share a height`; `a missed target moves ahead, 200 apart, heights alternating`.
- Play (fake rAF + timers; the bot hops by the exported constants): `a step-up stops a dino that does not hop and a hop
  climbs it`; `a fall into a pit costs a life and a slip, no answer, and restarts 2 s back on the trail`; `a rock costs a
  life`; `a wrong letter costs a life and a slip, not an answer, and comes back after 1.2 s`; `five losses resolve
  failed with failLine jump.noLives and keep the answers before it`; `collecting the level's targets opens the door;
  reaching it shows the level card; its button builds level 2`; `three levels end done, every caught target a recall
  answer when the bot tapped`; `a passive catch records no answer`; `a tap anywhere hops once; the arena has no button
  outside the level card`; `the world fills the arena: k = min(H/420, W/300), the ground at the arena bottom`; `abort
  during a loss (restart pending) leaves no timer or frame`; plus the Task 23 colour tests.

## Task 27: Matching pairs - old textures, smaller cards, more pairs

**Files:** Modify `src/steps/match.ts` (`buildMatchRounds`, cards, grid), `src/engine/profiles.ts` (`match`); Tests:
`tests/steps/match.test.ts`, `tests/steps/games.test.ts` (match block).

**Old pairs (old lines 1375-1391, 377-380, 201-210):** two rounds of **6 pairs (12 cards)**; a pair is two cards with
the same letter **and** the same texture. Six textures, drawn as SVG text fills (old `face(y, s)`: viewBox 0 0 100 100,
text at y 80, font-size 86, Rubik 900, stroke `#0D2A5C` width 2.5, `paint-order: stroke`, round joins):
- `color`: a linear gradient (0,0) -> (1,1): `#E53935`, `#FB8C00` at .25, `#FFC928` at .5, `#2EB85C` at .75, `#1E6FD9`;
- `plain`: fill `#0D2A5C`, no stroke;
- `stripe`: pattern 14 x 14 rotated 45 deg, `#FFFFFF` with a 7-wide `#1E6FD9` band;
- `wave`: pattern 24 x 12, `#FFF3CD` with the path `M0 6 Q6 0 12 6 T24 6` stroked `#E53935` 3;
- `dot`: pattern 12 x 12, `#E8F5E9` with a `#2EB85C` dot, r 3.2, at the centre;
- `outline`: fill `#FFFFFF`, stroke width 5.
The defs live once in the step's hidden SVG, ids prefixed per run (`mt<n>-`).

**Rounds (old counts; the owner's look-alike rule kept):** each round = **3 letters x 2 textures**. Three textures per
round, assigned in a cycle (A: t1 t2, B: t2 t3, C: t3 t1), so each texture is on two letters and each letter on two
textures: neither the letter alone nor the texture alone finds a pair (the old round 2 mixed letters and textures the
same way). Round 1: the target + 2 distant letters; round 2: the target + its look-alike + 1 distant letter
(`match.ask2` names the look-alike, as now). The old round 1 (the target alone in six textures) is not ported: it needs
no letter knowledge and gives no evidence. Textures are drawn uniformly and the same way for the target's cards (colour
rule).

**Cards (old CSS):** square (`aspect-ratio:1`), `#FFFFFF`, border `4px solid #0D2A5C`, radius 18px, shadow `0 5px 0
#0D2A5C`, padding 4px; selected: scale 1.07, border and shadow `#E53935`; a pair: background `#C8F7D4`, border `#2EB85C`,
a bounce, then shrink to .2 and fade; a mismatch: shake .4 s, border `#E53935`. Round dots (old `.dots`): 18px white
circles, 3px `#0D2A5C` border, the done one `#FFC928`.

**Grid (old formula, smaller cards):** gap 10px; `cols = 4` unless the area is narrower than 300px (then 3); `rows =
ceil(12/cols)`; `cell = max(60, min((W - (cols-1)*10)/cols, (H - (rows-1)*10)/rows, 170))`. The old choice
(`cols = W > 1.1H ? 4 : 3`) gives 3 columns on a portrait phone and about 120px cards, bigger than today's 112px; 4
columns give about 80px cards, the owner's "smaller cards".

**Evidence (unchanged meaning):** a target pair -> `match` ok; a mismatch of two different letters involving the target
-> an error with `chose`; a mismatch of the same letter in two textures, or of two non-target letters -> nothing (old
`m:false`). Sounds: pick, good, bad, chime (old), combo (Task 21). Pairs cannot fail (the old game had no fail rule).

**Profile (both bands, old):** `match: { pairs: 6, rounds: 2 }` (was 3 / 4 pairs).

**Tests (names and assertions):** `match.test.ts`: `each round has 12 cards: 3 letters x 2 textures, every card twice`;
`each texture in a round is on exactly two letters and each letter on two textures`; `round 1 is the target + 2 distant
letters with no look-alike; round 2 holds the target, its look-alike and 1 distant letter`; `the target's textures are
uniform over the six across 600 rounds (1/6 +- 0.03)`. `games.test.ts` (match): `a pair needs the same letter and
texture`; `same letter, other texture: no answer`; `the target with another letter: an error with chose`; `four columns
of cards >= 60px on a 390px-wide stage`; `the six texture fills are defined once and used by the cards`; `round 2 says
match.ask2 with the look-alike`; `abort leaves no timer`.

## Task 28: Content check and preview APK

**Files:** `content/letters-3-5.md` (every row added in Tasks 22, 25 and 26, marked "חדש" / "שונה"),
`content/spoken-lines.json` (`npm run lines`); no code.
- Run `npm test`, `npm run typecheck`, `npm run build`; build the APK (Global Constraints, Android) and install it on
  the owner's phone.
- Phone checks (record the results in the task report): every game plays its sounds and the music (the music ducks
  under the voice and stops on the window, the break, back, and when the app is hidden); no control buttons in any game;
  the success window after every station with "המשך" / "עוד פעם", the failed window with "נסו שוב" only (race time-out,
  dino out of lives); the race road fills the bottom of the screen and curves; the dino has step-ups, more pits, three
  levels and fills the screen; pairs show 12 textured, smaller cards; letters come in every colour and the target never
  stands out.
- The new and changed lines reach the clips only after the **OWNER CHECK** (Task 15 gate).

**Owner answers (2026-11-21, binding, override the text above where they differ):**
- Music: ONLY in the dino (jump), like the old app; every other game has sound effects only.
- Dino: after losing all hearts, "try again" restarts the SAME level with 5 new hearts (like the old app), not level 1.
- Race: the old values for every age (10 letters in 60 s).
- Result windows: ONLY after the five games. Teaching stations (meet, find, drive, firstSound), warm-ups and check-points flow on by themselves (no window, no green arrow).
