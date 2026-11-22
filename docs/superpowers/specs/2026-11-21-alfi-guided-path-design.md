# Alfi guided path - design

Status: DRAFT for the owner's review (2026-11-21). Local only: nothing in this work is committed or pushed.

## 1. Intent

Alfi today is a menu of about 17 letter games with coins, a shop and daily quests. The child (or parent) chooses what
to play. The owner wants the opposite: **one guided path**. The parent sets the child up once, and from then on the
child just follows the path - no menus, no choices. The path remembers what the child achieved, keeps practising the
child's weak points, and checks along the way that earlier letters really stuck before moving on.

Why: small children cannot navigate menus or choose well what to practise, and a free menu teaches unevenly. A
structured, adaptive path makes sure every child reaches real, consolidated knowledge at their own pace.

## 2. Who it is for

- **Child, ages 3-5** (pre-readers): cannot read any instruction; everything is spoken and shown.
- **Child, ages 6-8** (early readers): faster pace, more content.
- **Parent**: one setup screen, then a protected progress page; never needed during play.

## 3. Goals

1. **Setup is name + age + a photo of the child, and nothing else.** (Owner.) The photo is the child's face on the path.
2. **No menus or selections for the child.** One glowing next station; tap; the guide speaks. (Owner.)
3. **End points per age** (owner approved the proposal):
   - Ages 3-5: recognise all 22 letters by sight and name; know each letter's sound; hear which letter a word starts
     with; trace each letter.
   - Ages 6-8: all of the above, faster; the vowel marks (kamatz/patach, tsere/segol, hirik, holam, shuruk/kubutz,
     shva); the five final letters (ך ם ן ף ץ); blend syllables; read 2-3 syllable words with vowel marks; short
     sentences at the end. A short placement check at the start lets a child who already knows letters skip ahead; the
     path returns only where the check finds gaps.
4. **The sitting** (owner approved the proposal):
   - The map: the child's photo on a winding path of stations; each station is one small step ("meet ב", "trace ב",
     "which word starts with ב?").
   - About 10 minutes per sitting, always the same rhythm: a quick warm-up on a weak letter; the next new station; a
     short game that uses it; every few stations a **check-point** that mixes earlier letters.
   - A missed check-point does not move the path on: it inserts practice stations for the letters that failed, then
     retries the check.
   - The sitting ends with a sticker on the map and the guide saying goodbye; the next station waits for tomorrow.
   - The parent opens a simple progress page by a long press on the photo (a parent gate, below).
5. **Achievements are saved** per child: stations done, stickers, letters mastered, check-points passed. (Owner.)
6. **Weak points are practised** automatically and **consolidation is checked** along the path. (Owner.)
7. **Fix the issues found in the experience review** on the way (owner: "fix any issue on the way"). The review is
   `D:\alfi-build\alfi-review.md`; section 8 below lists what this design takes from it.

## 4. Non-goals (for this design)

- **Numbers.** The owner wants numbers as a later feature. This design must make numbers a second curriculum on the
  same engine (section 6.2), but builds letters only.
- **Recorded audio clips.** Parked by the owner; the owner wants Claude to produce the clips later. The design must
  make clips drop in without code changes (section 6.6), but ships with the live voice.
- **Publishing.** No Play Store release, no push to the GitHub repo. Local builds only.
- **Script (cursive) handwriting.** Print letters only for now.

## 5. Anti-goals (failure even if it works)

- The child has to read, choose or navigate anything to make progress.
- The path marks a letter "mastered" that the child cannot actually recall (today: one touch counts).
- Pressure mechanics for small children: streak loss, coins to grind, timers that fail a 3-year-old, "lives".
- A motor slip (a crash in a driving game, a shaky trace) counted as not knowing the letter.
- Any data leaving the device, the child's photo above all.
- Losing a child's progress when storage is cleared or a save is damaged, with no way back.

## 6. Constraints and decisions

### 6.1 Approach (owner chose option 2)

Approaches considered:
1. A path layer on top of today's single `index.html`, reusing the activities in place. Fastest; inherits the old
   code's globals and quirks.
2. **A clean new app; the existing activities are ported one by one into it; the review's issues are fixed on the
   way. (Chosen by the owner.)** Cleanest base for the path, numbers and recorded audio; about 2-3x the work before the
   first playable build; risk of breaking games that work today while porting.
3. Only reshape the menus (auto-pick the next activity). Rejected: no real check-points, no age model, mastery stays
   "one touch".

### 6.2 Engine and curriculum as data

- The path engine knows nothing about letters. A **curriculum** is a data file: units (e.g. a letter), the stations of
  each unit (step type + parameters), check-point rules, and the age profile it serves. Letters are curriculum #1;
  numbers become curriculum #2 later with their own step types, using the same engine, map, mastery model and
  check-points.
- **Step types** are self-contained activity modules with one contract: given an item set and an age profile, run, and
  report per-item results (correct / wrong / which wrong answer / motor slip vs knowledge error / time). The ported
  games become step types.

### 6.3 Age profiles

One profile per age band (3-5, 6-8; the builder may split 3-5 further if the content needs it): pace (new stations per
sitting), sitting length, which step types are allowed, timers (none for 3-5), number of choices per question,
tracing tolerance, and the end point (goal 3). Age comes from setup; it advances automatically with the child's
birthday and can be corrected on the parent page.

### 6.4 Mastery, weak points and consolidation (replaces today's one-touch rule)

- Every item (letter name, letter sound, letter-vowel syllable, ...) has a mastery record per child: correct and wrong
  answers over time, confusions (which item was chosen instead), last seen.
- An item counts as **known** only after correct recall on separate days, including at least one recall task (say /
  pick the letter from a sound with distractors), not only matching to a sample.
- **Weak points**: items with recent errors or frequent confusions get warm-up stations and extra practice stations.
- **Consolidation**: check-points every few stations mix new items with older ones, weighted to older and weaker
  items; a later check re-tests items learned long ago (spaced repetition). Failing an old item reopens practice for
  it on the path.
- Distractors are chosen from known confusion pairs (ב/כ, ד/ר, ה/ח, ו/ז/ן, ס/ם, ע/צ, ...), never from letters that
  sound the same in a sound-based question (א/ע, ט/ת, כ/ק, ס/שׂ) - the review found the current game does this.
- Motor slips do not lower letter mastery.

### 6.5 Setup, profiles and the parent

- Setup: name, age (birth year or age picker), photo (camera or gallery). Several children per device, each with
  their own path; the first screen shows the children's photos to tap (the only choice, and it is "who am I").
- The photo stays on the device only: never uploaded, never in an export file unless the parent opts in.
- Parent page behind a parent gate (an adult-only task, e.g. hold for 3 seconds and answer a simple question). Shows
  progress per letter, check-point history, weak letters, time played; lets the parent correct the age, set a daily
  time limit, export / import progress (a file), reset or delete a child.
- Deleting a child or resetting progress is only possible behind the parent gate (the review found it is not today).

### 6.6 Audio

- Every instruction is spoken; no on-screen text is required to play.
- Speech goes through one audio layer: a recorded clip when one exists for the exact line, else the live voice
  (the Android TTS bridge in the APK, or Web Speech in a browser). The clip lookup follows the pipeline already built
  (`D:\alfi-build\audio\PIPELINE.md`: key = text + rate, `audio/index.json`), so clips drop in later with no code
  change.
- Lines are worded to be recordable: the child's name is spoken as a separate short line or not at all.
- Instructions address the child in a gender-neutral way, or by the child's gender if the parent sets it (the review
  found masculine-only instructions).
- The teaching voice and the sound effects have separate volume controls on the parent page.

### 6.7 Platform

- Offline-first web app, packaged in the existing local Android wrapper (`D:\alfi-build\android-local`, package
  `com.raviv.alfi.local`, assets served from a secure origin, Android TTS bridge, back button mapped into the app).
  Delivered to the owner's phone as an APK file.
- Must run smoothly on low-end Android tablets.
- Progress is saved on the device with a backup copy and damaged-save recovery (never overwrite a save that fails to
  load; keep the previous good copy).
- The Android back button goes one step back in the app (map <- station), never exits mid-station; on the map it asks
  before leaving.

## 7. Content per age (first version)

- **3-5**: per letter - meet the letter (name + sound + a picture word), find it among 2-3, trace it, "which word
  starts with...?" by sound, a short game. Check-point every 3 letters. Letter order: an order that separates
  look-alike and sound-alike letters early (builder proposes; e.g. not ב next to כ).
- **6-8**: placement check first; then letters at a faster pace (as 3-5, more items per sitting, 3-4 choices), then
  vowel marks per vowel group, final letters, syllable blending, words with vowel marks, short sentences.
- Word lists: the existing `WORDS` table is reused only where the words fit the stage (no word whose reading needs a
  rule not yet taught; no final letters before they are taught).

## 8. Taken from the experience review (fix on the way)

- No menus, no shop, no coins, no streaks, no daily quests: stickers on the map are the achievement. The brand and
  real-person items (Spider-Man, FC Barcelona, NBA, a named player) go with the shop.
- Mastery rule, distractors and motor-vs-knowledge as in 6.4. Letter sounds and final letters taught (section 7).
- Parent gate, export/import, damaged-save recovery, no silent progress loss (6.5, 6.7).
- Back button (6.7). Daily reward is never marked collected before it is shown.
- Accessibility: zoom allowed, reduced motion respected, contrast of text on buttons at least 4.5:1, large tap
  targets, left-handed tracing works.
- No dependency on online voices; prefer an on-device voice (the review found the current voice choice prefers online
  voices, which fail offline and send text out).
- The full bug list in the review (broken stegosaurus pattern, layout cut-off on phones, etc.) does not need porting:
  code that is not ported is not fixed; code that is ported is fixed as it moves.

## 9. Left to the builder

- Tech stack and project layout for the new app (a plain, dependency-light web stack that builds to static files the
  Android wrapper can load), including whether to use a build step.
- The exact letter order, the number of stations per letter, the check-point mix ratios and the recall-days rule, within
  section 6.4.
- Which existing games are ported first and how each maps to a step type.
- Visual design of the map, stations and stickers (child-friendly, consistent with today's look where it works).
- Where the new app lives: the owner's local clone `D:\alfi` (new folder) or next to it; nothing is committed.

## 9a. Decisions after the builder check (2026-11-21)

Owner's answers:
- **The first tester is a 3-5 year old.** The first playable slice is: setup (name, age, photo), the map, the 3-5 path
  for the first six letters, one check-point, practice of weak points, saving with backup, and the parent page
  (behind the gate). The 6-8 path (placement check, vowel marks, final letters, reading) is the next phase; the engine
  and the curriculum format must already support it, but its content and step types are not built in the first slice.
- **Content: Claude writes, the owner checks.** All new Hebrew teaching content (picture words per letter, vowelized
  words, syllables, later sentences) is written by Claude as a reviewable table (word, vowelized form, picture/emoji,
  which letters and vowels it needs, the age band) and reaches the app only after the owner (or someone she chooses)
  has checked it.

Claude's calls (the owner can overrule any of them while reviewing this document):
- **Scope of porting:** only the step types the curriculum needs are ported or written new (meet the letter, find it,
  trace it, first sound of a word, sound-to-letter recall). The "short game" step in the first slice ports the balloon
  plane, the car (owner asked for both), whack-a-mole and matching pairs, changed as follows: plane - the letter is
  named by the voice, not shown in the HUD (recall, not matching), slow and few balloons for 3-5, a wrong balloon hit
  while steering is a motor slip; car - the road is shaped like the letter in writing direction (a second tracing
  practice), lifting the finger pauses, leaving the road guides back without restart; matching pairs - the second
  round adds the look-alike letter on purpose. **Owner's review of the mockups (2026-11-21):** (a) the car on the
  letter-shaped road IS the tracing step of every letter (it replaces the finger-trace station; the sitting is meet ->
  find -> drive the letter -> first sound -> game / check-point); (b) in the plane, the race and any game where the child
  must pick out the letter, the target letters are scattered among the others: never stacked in one column and never
  lined up in a trail; (c) whenever the child must identify the letter among others, every letter (and its balloon,
  disc or card) has the same neutral colour and style - no colour or size cue gives the target away. The letter race (the pseudo-3D road where the car collects only the
  target letter; owner asked for it) is also in the first slice: for 3-5 it is slow, three lanes with big left / right
  buttons, no timer and no loss (the round ends after collecting six); the target is named by the voice, not shown as a
  sample; driving into a wrong letter is treated as motor (it just passes, no penalty). The jumping dinosaur comes with
  the 6-8 path, with no lives (a round ends with praise and a short retry); colouring is an occasional calm reward
  station.
  The other old games are not ported in the first slice; the old app stays installed (the Play version) and runnable
  from `D:\alfi\web` until the owner decides.
- **Motor slip vs knowledge error:** each step type reports it with its own signal (e.g. a trace that leaves the
  tolerance while following the right letter shape, a crash in a driving game, a tap outside every target). Only
  answers that pick a wrong item count as knowledge errors. When unsure, the step reports "no evidence" rather than an
  error.
- **Photo capture:** the local Android wrapper is extended (camera/gallery file chooser and the permissions it needs).
  In a plain browser the file input with `capture` is enough.
- **Target device:** the owner's phone first, Android 7.0+ (the wrapper's minSdk 24); smooth means no visible stutter on
  the map and in steps on a mid-range phone, with animations kept light (DOM/CSS, no heavy canvas effects).
- **Backup:** besides the web storage copy, the wrapper keeps a backup file in the app's private files through a small
  native bridge, restored automatically if web storage is empty or damaged. The parent page's export / import file
  stays as the manual route.
- **Age:** setup asks the age (years); the app counts it up once a year from the setup date; the parent page can
  correct it. No birth date is asked.
- **Gender:** not asked at setup. Instructions are gender-neutral by default; the parent page can optionally set boy /
  girl for gendered wording, once recorded clips have both variants.
- **Recorded lines:** worded so each spoken line is a fixed text (the child's name, if used, is its own line), keyed as
  in the existing audio pipeline.

## 9b. Owner changes during the build (2026-11-21)

- **No daily sitting limit**: as many sittings as the child wants, one new letter per sitting (3-5); check-points
  still test on a later day; a 2-minute break after every 10 minutes of active play, between stations only, the child
  cannot skip it, a parent can (through the gate). The daily time limit and "open another sitting today" are removed
  from the parent page; break settings replace them. When no new letter is available that day, the child gets
  practice sittings (warm-up + a game on the weakest letter) without limit.
- **The dino jumper is in the first version** for 3-5; scattered targets, target named by the voice. (Its first rules -
  no lives, a fall replays the hop, neutral letters - were replaced by the owner's preview feedback below.)
- **Owner preview feedback (owner 2026-11-21)** - these replace the "neutral colour" call in 9a (c), the "no timers /
  no lives / no losing for 3-5" parts of sections 5 and 9a, and the dino line above:
  - **Colour rule** (replaces the neutral pick-out rule): every letter face draws its colour from one palette and its
    size from one scale set; the target draws from the same palette with the same distribution and the same sizes, so
    it never stands out by colour or size. Feedback colour only after a pick.
  - **Games fail like the old app**: each game keeps the old game's own lives / timer / falls (race: 10 letters in 60 s;
    dino: 5 lives, falls into pits, rocks and wrong letters cost a life); a game whose old version had no fail rule
    cannot fail. Wrong-letter contact stays a motor slip, never a knowledge error.
  - **Result windows** replace the green forward arrow after every station: a success window (old look: trophy, stars,
    praise, fanfare) with "try again" and "continue", and for a failed game a failed window with "try again" only. A
    failed game does not complete its station; answers before the fail still count. Nothing advances without a tap; the
    break rule is checked when the window closes.
  - **No control buttons in play**: plane follows the finger's height, race steers by drag, dino hops on a tap anywhere.
  - **Sounds**: the old app's sound effects and its background melody (the old dino tune) in every game, ducked under
    speech; parent switches for music and game sounds.
  - **Race**: the old pseudo-3D road with curves and hills, filling the bottom of the screen. **Dino**: the old terrain
    (step-ups, pits, rocks, platforms) in three levels, each harder, filling the screen. **Pairs**: the old textured
    cards, smaller, 6 pairs per round, with the look-alike round kept.
- **Letter summary and focus (parent page)**: four levels per letter (not yet, met, practising, known), a letter card
  (recall days, success rate, confusions, last practised), "practise more" marks (up to 3, only letters already met)
  that make those letters come first in warm-ups, practice and games, and "start a sitting on this letter now" for any
  letter. A letter not yet met that a parent starts **moves into the path now**: it counts as met, the path continues
  where it was, and check-points group letters by the order the child met them.
- Details: `D:\alfi\docs\superpowers\plans\2026-11-21-alfi-slice1-addendum.md`.

## 10. Risks

- Porting breaks games that work today: port one at a time, keep the old app runnable until the new path covers it.
- Live-voice quality on devices without a good Hebrew voice: the path is unusable for pre-readers there until the
  recorded clips exist (parked).
- Scope: two age paths, a placement check and a parent page are a lot; the builder should plan a first playable slice
  (setup + map + 3-5 path for the first few letters + check-point + saving) before the 6-8 content.
