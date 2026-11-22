# Alfi Guided Path - Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new offline app in `D:\alfi\app` where a 3-5 year old follows one guided path through the first six Hebrew letters (meet, find, drive-the-letter, first sound, a short game, check-points, weak-point practice), set up and supervised by a parent, delivered as a local APK.

**Architecture:** TypeScript + Vite building static files into `D:\alfi\app\dist`, no UI framework (plain DOM + one `h()` helper; screens are small mount functions), because the app is a handful of screens with game-like DOM/CSS stages, must stay light on low-end Android WebViews, and must load from the wrapper's secure asset origin with relative paths. A letter-agnostic engine (`src/engine`, pure functions, unit-tested with Vitest) owns curriculum expansion, mastery, distractors, scattering, check-points and the sitting planner; letter-specific step modules (`src/steps`) and screens (`src/ui`) sit on top; content is data (`app/content/*.json`).

**Tech Stack:** TypeScript ^5.8, Vite ^6.3, Vitest ^3.1, happy-dom ^17 (dev only, screen smoke tests), Node 24 (runs `.ts` scripts directly via type stripping), Android wrapper (Gradle 8.7, AGP 8.5.2, JDK 17, androidx.webkit 1.11.0, androidx.core 1.13.1).

**Spec:** `D:\alfi\docs\superpowers\specs\2026-11-21-alfi-guided-path-design.md` (approved; sections 3, 6, 7, 8, 9a bind). Visual reference: `D:\alfi-build\mockups\*.dc.html` (Main = setup, Children, Map, Meet, Find, Drive, FirstSound, Checkpoint, End, Plane, Race, Parent; Trace is replaced by Drive). Old game for porting: `D:\alfi\web\index.html` (`LN`/`LNP` line 398-399, `WORDS` 400, `SIM` 423, `STROKES` 425, speech layer 808-822, `IMPL.trace` 1268, `IMPL.plane`/`planeGame` 1335-1361, `IMPL.mole` 1363, `IMPL.match` 1375, `IMPL.race` 1527). Review: `D:\alfi-build\alfi-review.md`. Audio pipeline: `D:\alfi-build\audio\PIPELINE.md`.

## Global Constraints

- **Local only:** never `git commit` / `git push` in `D:\alfi`; no task has a commit step. A task ends with its verification.
- New app source in `D:\alfi\app`, built output in `D:\alfi\app\dist`. `D:\alfi\web` stays untouched and runnable (read from it, copy fonts from it, never edit it).
- All commands run from `D:\alfi\app` unless stated. Relative imports carry the `.ts` extension (so Node can run `scripts/*.ts` directly). New files use CRLF line endings, except JSON written by scripts (LF is fine).
- No network at runtime: no CDNs, no Google Fonts; Rubik is bundled from `D:\alfi\web\fonts` (`rubik-hebrew.woff2`, `rubik-latin.woff2`, weights 300-900, same `@font-face` unicode ranges as `D:\alfi\web\index.html` lines 15-16). Vite `base: './'` so the app works under `https://appassets.androidplatform.net/assets/web/index.html`.
- `<html lang="he" dir="rtl">`; colours, sizes and layout follow the mockups (backgrounds `#EAF5FF` / `#FFF6E5` / `#DDF2E2`, ink `#1D2742`, accent `#1E4FBF`, ok `#2E9E5B`, next station `#FFA928`).
- **No menus or choices for the child**: one glowing next station; no coins, shop, streaks, quests, lives, XP; no timers and no losing for 3-5; no brands or real people.
- **Every instruction is spoken.** Spoken lines are fixed texts from the content file; the child's name is always its own line (never concatenated); wording is gender-neutral (plural imperative or infinitive).
- **Audio key rule (pipeline):** key = `text + '|' + String(rate)`, default rate `0.9` (sound lines `0.75`); index at `audio/index.json` (relative to the page); clip file at `audio/<voice>/<file>`, voice folder `'hila'`; missing index, missing clip, load error or `play()` rejection fall back to the live voice. All line texts are NFC-normalized.
- **Never use an online voice:** live speech only with a Hebrew voice whose `localService` is true (the Android bridge voice is local).
- **Engine knows nothing about letters:** no file under `src/engine` contains a Hebrew character or imports from `src/content` / `src/steps` (enforced by a test).
- **Pick-out rule (owner):** whenever the child must pick the letter out of others, every letter and its balloon / disc / card / sign has the same neutral colour, font and size (class `pick-neutral`: background `#FFFFFF` or `#E8EEF6`, ink `#1D2742`, Rubik 800); feedback colour appears only after a pick. Targets are scattered: never stacked in one column, never in a trail (scatter rules S1-S3, Task 5).
- **Target named by voice, not shown** in plane, race and mole (recall, not matching to a sample).
- **Motor slips never change mastery.** Only picking a wrong item is a knowledge error; when unsure a step reports no evidence. An aborted step (back button, app closed) records nothing.
- **Accessibility:** viewport allows zoom (no `user-scalable=no`, no `maximum-scale`); `prefers-reduced-motion: reduce` stops glow/pop/confetti animations; text contrast >= 4.5:1 (large text >= 24px or bold >= 19px: >= 3:1; icon-only controls >= 3:1); child tap targets >= 56px, parent controls >= 44px; drive works with either hand.
- **Privacy:** nothing leaves the device; the photo is never in an export unless the parent ticks "include photo"; Android cloud backup is off.
- **Saving:** never overwrite a save that fails to load (quarantine it); keep the previous good copy; native backup file in the wrapper; damaged-save recovery is automatic.
- Android: package `com.raviv.alfi.local`, minSdk 24, debug signing. Build: env `JAVA_HOME=D:\android-tools\jdk17`, `ANDROID_HOME=D:\android-tools\sdk`, from `D:\alfi-build\android-local`: `D:\android-tools\gradle-8.7\bin\gradle.bat assembleDebug --no-daemon -q`.
- Hebrew content written in this plan's tasks reaches the app only after the **OWNER CHECK** gate (Task 2 -> Task 15).

## Review Focus

1. **Back button / app closed mid-station** - the station's partial answers must not count, the station must not be marked done, speech must stop, and the same station resumes the same day. Pinned in Task 6 (`aborted result changes nothing`) and Task 10 (`back during a step stops audio and saves nothing`).
2. **A child mashing the screen** (double taps on a card, on the next arrow, two fingers) - must not record two answers for one question or skip a step. Pinned in Task 11 (`taps during feedback are ignored`) and Task 10 (`next fires once on a double tap`).
3. **Device with no local Hebrew voice and no clips** - a pre-reader hears nothing; the parent must be told on setup and on the parent page (captions still show). Pinned in Task 8 (`voiceStatus is none ...`) and Task 14 (`shows the no-voice notice`).
4. **Clock edge cases** - device date moved back, midnight during a sitting, a stored day in the future; the path must never lock forever and day counting stays by local date. Pinned in Task 6 (`a future day stored by a moved-back clock does not block the path`) and Task 3 (`setOn in the future keeps the set age`).
5. **Storage write fails during play** (quota full, private mode) - play continues, nothing already saved is lost, the parent sees a warning. Pinned in Task 7 (`write failure ...`) and Task 10 (`save failure sets storageWarning and play continues`).

## Rulings on points the spec leaves open

- Letter order מ ל ב ת י צ (Task 2, owner checks); check-points after units 3 and 6. A due check-point opens the **next** sitting (after the warm-up), so it tests recall on a later day; a failed one inserts practice and a retry that closes that sitting; the path does not move until it passes (spec 4).
- Known = correct on 2 separate days, at least one a recall, and no error left uncleared; an error clears only with a correct answer on a later day. First sound counts as `match` (the letter and written words are on screen); sound recall comes from `soundPick` (warm-up, practice, check-point). Drive gives no mastery evidence.
- One new-content sitting per day (3-5: one letter, 6-8: two); the parent page can open one more sitting today. A 6-8 child plays the same six letters with the 6-8 profile until the 6-8 path exists (no placement check in slice 1).
- Matching pairs: face-up, all cards neutral; round 1 target + distant letters, round 2 adds the look-alike (the old style-variant cards would break the neutral-style rule). Race / plane HUD slots fill with stars, not letters. Mole: a tap on a wrong letter is a knowledge error (a deliberate pick); plane / race contact with a wrong letter is motor.
- Photo optional (initial-letter avatar); one child skips the picker. Daily limit default 20 minutes, applied only between stations. Android cloud backup off (`allowBackup=false`) so the photo never leaves the phone. No service worker in slice 1. The boy / girl wording setting and colouring station are not built (no gendered clips yet; not in this slice).

---

### Task 1: Project scaffold, utilities and theme tokens

**Files:**
- Create: `app/package.json`, `app/tsconfig.json`, `app/vite.config.ts`, `app/index.html`, `app/.gitignore` (`node_modules/`, `dist/`)
- Create: `app/public/fonts/rubik-hebrew.woff2`, `app/public/fonts/rubik-latin.woff2` (copied from `D:\alfi\web\fonts`)
- Create: `app/src/main.ts` (placeholder mount), `app/src/styles/base.css`, `app/src/styles/tokens.ts`
- Create: `app/src/util/rng.ts`, `app/src/util/day.ts`, `app/src/util/contrast.ts`, `app/src/util/dom.ts`
- Test: `app/tests/util/rng.test.ts`, `app/tests/util/day.test.ts`, `app/tests/util/contrast.test.ts`

**Interfaces:**
- Produces:
  - `createRng(seed: number): Rng` with `Rng = { next(): number /*[0,1)*/; int(lo: number, hi: number): number /*inclusive*/; pick<T>(a: readonly T[]): T; shuffle<T>(a: readonly T[]): T[] }` (mulberry32).
  - `dayKey(d: Date): string` (`'YYYY-MM-DD'`, local time), `daysBetween(a: string, b: string): number` (calendar days, b - a, computed from the date parts with `Date.UTC`, DST-safe), `addDays(day: string, n: number): string`.
  - `contrastRatio(fg: string, bg: string): number` (WCAG 2.x, `#RRGGBB`).
  - `TOKENS: Record<string, string>` and `TOKEN_PAIRS: { fg: string; bg: string; large: boolean; icon?: boolean; where: string }[]`; `applyTokens(root: HTMLElement): void` writes each token as a CSS variable `--<name>`.
  - `h(tag: string, attrs?: Record<string, unknown>, ...children: (Node | string | null)[]): HTMLElement` (attrs: `class`, `style`, `aria-*`, `on<Event>` handlers).

- [ ] **Step 1: Write `package.json`** with `"type": "module"`, scripts `"dev": "vite"`, `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`, `"build": "tsc --noEmit && vite build"`, devDependencies `typescript ^5.8.0`, `vite ^6.3.0`, `vitest ^3.1.0`, `happy-dom ^17.4.0`. `tsconfig.json`: `strict`, `target ES2019`, `module ESNext`, `moduleResolution bundler`, `allowImportingTsExtensions`, `noEmit`, `resolveJsonModule`, `lib ["ES2020","DOM"]`, include `src`, `tests`, `scripts`. `vite.config.ts`: `base: './'`, `build: { outDir: 'dist', target: 'es2019', assetsInlineLimit: 0 }`, `test: { include: ['tests/**/*.test.ts'] }`. `index.html`: `lang="he" dir="rtl"`, viewport `width=device-width, initial-scale=1, viewport-fit=cover`, `<div id="app">`, module script `/src/main.ts`. Run `npm install`; expect exit 0.

- [ ] **Step 2: Write the failing tests**

```ts
// rng.test.ts
it('same seed gives the same sequence', () => { const a = createRng(7), b = createRng(7); expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]); });
it('int stays inclusive in range', () => { const r = createRng(1); for (let i = 0; i < 1000; i++) { const v = r.int(2, 4); expect(v >= 2 && v <= 4).toBe(true); } });
it('shuffle keeps elements', () => expect(createRng(3).shuffle([1,2,3,4]).sort()).toEqual([1,2,3,4]));
// day.test.ts
it('dayKey uses local date', () => expect(dayKey(new Date(2026, 10, 21, 23, 59))).toBe('2026-11-21'));
it('daysBetween across a DST change is whole days', () => expect(daysBetween('2027-03-25', '2027-03-27')).toBe(2));
it('addDays crosses month end', () => expect(addDays('2026-11-30', 1)).toBe('2026-12-01'));
// contrast.test.ts
it('white on black is 21', () => expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0));
it('every theme pair meets its threshold', () => { for (const p of TOKEN_PAIRS) expect(contrastRatio(TOKENS[p.fg], TOKENS[p.bg]), p.where).toBeGreaterThanOrEqual(p.large || p.icon ? 3 : 4.5); });
```

- [ ] **Step 3: Run** `npx vitest run tests/util` - Expected: FAIL (modules not found).

- [ ] **Step 4: Implement** the util modules and `tokens.ts`. Tokens (from the mockups): `ink #1D2742`, `inkSoft #4A5878`, `accent #1E4FBF`, `accentShadow #163C91`, `ok #2E9E5B`, `okInk #1E7442`, `next #FFA928`, `neutral #FFFFFF`, `neutralAlt #E8EEF6`, `bgSky #EAF5FF`, `bgSand #FFF6E5`, `bgGrass #DDF2E2`, `bgCheck #FFF1E8`, `bgNight #1E3A7A`, `danger #A12A2A`, `dangerBg #FFF4F4`, `white #FFFFFF`. Pairs at least: white on accent (setup start button), ink on next (glowing station letter, large), white on ok (done station letter, large; next arrow, icon), inkSoft on bgSky, okInk on bgSky, bgNight on white (end "to map" button), danger on dangerBg, ink on neutral, ink on neutralAlt. If a pair fails, darken the token minimally (keep the hue) rather than drop the pair. `base.css`: the two `@font-face` rules (`url(fonts/...)`), `body { margin:0; font-family: Rubik, sans-serif; background: var(--bgSky); color: var(--ink) }`, `#app { min-height: 100dvh }` with a `100vh` fallback, `.pick-neutral` class, and `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important } }`.

- [ ] **Step 5: Verify** `npx vitest run tests/util` PASS; `npm run build` exit 0; `dist/index.html` references `./assets/...` (relative) and `dist/fonts/rubik-hebrew.woff2` exists.

---

### Task 2: Hebrew content draft for the first six letters + OWNER CHECK gate

**Files:**
- Create: `app/content/letters-3-5.md` (the reviewable table, Hebrew)
- Create: `app/content/letters-3-5.json` (the same content as data, `"reviewed": false`)
- Create: `app/content/dev-fixture.json` (a copy of the draft JSON with `"fixture": true`; the app uses it until Task 15)
- Create: `app/src/content/schema.ts`, `app/src/content/index.ts`
- Test: `app/tests/content/content.test.ts`

**Interfaces:**
- Produces (`schema.ts`):
  ```ts
  interface PictureWord { word: string; plain: string; emoji: string; emojiUnicode: number; first: string; letters: string[]; vowels: string[]; band: '3-5' }
  interface LetterEntry { glyph: string; soundSay: string; words: PictureWord[]; strokes: string[] }
  interface LettersContent {
    id: string; reviewed: boolean; fixture?: boolean; band: '3-5';
    order: string[];                                            // the six, in path order
    alphabet: Record<string, { name: string; plain: string; latin: string }>; // all 22
    letters: Record<string, LetterEntry>;                       // the six
    lookAlikes: Record<string, string[]>;                       // all 22
    sameSound: string[][];
    distractorWords: PictureWord[];
    lines: Record<string, string>;                              // templates, see below
    praise: string[];
  }
  validateContent(c: LettersContent): string[]   // empty = valid
  ```
- Produces (`index.ts`): `CONTENT: LettersContent` (imports `../../content/dev-fixture.json` until Task 15).

- [ ] **Step 1: Write the failing test**

```ts
for (const file of ['letters-3-5.json', 'dev-fixture.json']) describe(file, () => {
  const c = load(file);
  it('is valid', () => expect(validateContent(c)).toEqual([]));
  it('has six letters in the proposed order', () => expect(c.order).toEqual(['מ','ל','ב','ת','י','צ']));
  it('no two of the six are look-alikes or sound-alikes', () => { for (const a of c.order) for (const b of c.order) if (a !== b) { expect(c.lookAlikes[a]).not.toContain(b); expect(c.sameSound.some(g => g.includes(a) && g.includes(b))).toBe(false); } });
  it('picture words: no final letters, emoji <= Unicode 9, first letter matches', () => { for (const L of c.order) { expect(c.letters[L].words.length).toBeGreaterThanOrEqual(3); for (const w of c.letters[L].words) { expect(w.word).not.toMatch(/[ךםןףץ]/); expect(w.emojiUnicode).toBeLessThanOrEqual(9); expect(w.first).toBe(L); } } });
  it('all texts are NFC', () => allTexts(c).forEach(t => expect(t).toBe(t.normalize('NFC'))));
  it('lines are gender-neutral (no masculine singular imperatives)', () => Object.values(c.lines).forEach(t => expect(t).not.toMatch(/(^|\s)(בוא|לחץ|מצא|שים|קום|תלחץ)(\s|$|[.!?,])/)));
  it('every line id the app uses exists', () => LINE_IDS.forEach(id => expect(c.lines[id], id).toBeTruthy()));
});
```
(`validateContent` checks: 22 alphabet entries; `lookAlikes` has 22 keys and never lists a same-sound letter of its key; each of the six has 1-3 `strokes` that start with `M`; every `{placeholder}` in a line is one of `{name}`, `{sound}`, `{word}`; `distractorWords.length >= 10` with no finals and emoji <= 9.)

- [ ] **Step 2: Run** `npx vitest run tests/content` - Expected: FAIL (files missing).

- [ ] **Step 3: Write `letters-3-5.md`** - columns per word: word with niqqud, plain, emoji, Unicode version, first letter, letters needed, vowels needed, age band. Sections:
  1. **Letter order (proposal): מ ל ב ת י צ**, check-points after ב and after צ. Reason: no pair among the six is in the old `SIM` look-alike table in either direction, none share a sound (א/ע, ט/ת, כ/ק, ס/שׂ excluded), sounds are distinct and frequent (/m/ /l/ /b/ /t/ /y/ /ts/); ב uses its dagesh sound /b/.
  2. Per letter: glyph, name (from `LN`), `soundSay` (what the voice says for the sound; live TTS reads a bare consonant as the letter name, so draft it as the old `sylSay` style syllable, e.g. `מָה`, and note that a recorded clip may later replace it), 3-5 picture words (start from the old `WORDS`, e.g. מָטוֹס ✈️, מְכוֹנִית 🚗, מַפְתֵּחַ 🔑; בָּנָנָה 🍌, בַּיִת 🏠, בֵּיצָה 🥚; תַּפּוּחַ 🍎, תּוּת 🍓; יָד ✋, יָרֵחַ 🌙; צָב 🐢, צִפּוֹר 🐦, צְפַרְדֵּעַ 🐸; ל needs words without finals, e.g. לֵב ❤️, לְטָאָה 🦎), and the strokes: the old `STROKES` paths (300x300 board) in writing direction, with ב's base reversed to right-to-left (`M 236 240 L 70 240`); mark each stroke direction for the owner.
  3. First-sound distractor words (>= 10, other first sounds, no finals, e.g. דָּג 🐟, כַּדּוּר ⚽, פִּיל 🐘, גֶּזֶר 🥕, נָחָשׁ 🐍, חָתוּל 🐈, סוּס 🐎, רַכֶּבֶת 🚂, שֶׁמֶשׁ ☀️, עוּגָה 🎂).
  4. All 22 letter names (from `LN`/`LNP`, plus a `latin` file key: alef, bet, gimel, dalet, he, vav, zayin, het, tet, yod, kaf, lamed, mem, nun, samekh, ayin, pe, tsadi, qof, resh, shin, tav), look-alikes (from `SIM`, with any same-sound entry removed: drop ע from א's list and א from ע's list), same-sound groups `[['א','ע'],['ט','ת'],['כ','ק'],['ס','שׂ']]`.
  5. Spoken lines (templates; `{name}` = letter name with niqqud, `{sound}` = `soundSay`, `{word}` = picture word), draft wording from the approved mockups: `children.who` "מי משחק עכשיו? לוחצים על התמונה שלכם", `map.next` "היום מכירים אות חדשה. לוחצים על התחנה הזוהרת", `map.tomorrow` "להיום סיימנו. ממשיכים מחר!", `map.limit` "זמן המשחק של היום נגמר. ממשיכים מחר!", `map.complete` "כל האותיות של עכשיו נלמדו. עוד אותיות בקרוב!", `leave.ask` "רוצים לצאת?", `meet.line` "זאת האות {name}. {sound}, {sound}, {word}!", `find.ask` "איפה האות {name}?", `find.right` "נכון! זאת {name}", `find.wrong` "זאת {name}. נסו שוב", `soundPick.ask` "איזו אות אומרת {sound}?", `firstSound.ask` "איזו מילה מתחילה בצליל {sound}?", `firstSound.right` "נכון! {sound}, {word}", `firstSound.wrong` "זה מתחיל בצליל אחר. נסו שוב", `drive.ask` "נוסעים על הכביש של {name}, מהדגל הירוק עד הסוף!", `drive.back` "חוזרים לכביש", `drive.next` "עכשיו מהדגל הירוק הבא", `drive.done` "יופי! נסענו על {name}", `plane.ask` "מפוצצים רק בלונים של {name}!", `race.ask` "אוספים רק את {name}!", `mole.ask` "נוגעים רק בחפרפרות של {name}!", `match.ask1` "מוצאים שתי אותיות זהות", `match.ask2` "עכשיו יש גם {name}. מוצאים זוגות זהים", `checkpoint.intro` "נקודת בדיקה! בודקים מה זוכרים", `warmup.intro` "מתחממים!", `practice.intro` "מתרגלים עוד קצת", `step.next` "לוחצים על החץ הירוק", `end.great` "כל הכבוד!", `end.bye` "מדבקה חדשה נכנסה למפה. להתראות, מחר ממשיכים!". Praise: gender-neutral only ("כל הכבוד!", "יופי!", "מעולה!", "נהדר!", "וואו!").
  Export `LINE_IDS` (the list above) from `schema.ts`.

- [ ] **Step 4: Write `letters-3-5.json`** from the table and copy it to `dev-fixture.json` adding `"fixture": true`. Implement `schema.ts` (`validateContent`) and `index.ts`.

- [ ] **Step 5: Verify** `npx vitest run tests/content` PASS.

- [ ] **Step 6: OWNER CHECK (gate, non-blocking for Tasks 3-14).** The controller sends `app/content/letters-3-5.md` to the owner for review (letter order, words, niqqud, sounds, stroke directions, every spoken line). Tasks 3-14 proceed meanwhile on `dev-fixture.json`. Task 15 must not start until the owner (or someone she names) has answered.

---

### Task 3: Engine types, curriculum format, age and age profiles

**Files:**
- Create: `app/src/engine/types.ts`, `app/src/engine/curriculum.ts`, `app/src/engine/profiles.ts`, `app/src/engine/age.ts`
- Create: `app/content/curriculum-letters.json`
- Test: `app/tests/engine/curriculum.test.ts`, `app/tests/engine/age.test.ts`, `app/tests/engine/architecture.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  type UnitId = string; type ItemId = string /* `${unitId}/${kind}` */; type StepTypeId = string; type AgeBand = '3-5' | '6-8';
  interface StationSpec { step: StepTypeId | '$game'; params?: Record<string, unknown> }
  interface Curriculum {
    id: string; version: 1; bands: AgeBand[]; itemKinds: string[];       // letters: ['name','sound']
    units: { id: UnitId }[];
    unitStations: Record<AgeBand, StationSpec[]>;
    gameRotation: StepTypeId[];
    checkpoint: { everyUnits: number; step: StepTypeId };
    itemSteps: Record<string, StepTypeId>;          // warm-up / review step per item kind
    practice: Record<string, StationSpec[]>;        // practice steps per failed item kind
  }
  interface PathNode { id: string; type: 'unit' | 'checkpoint'; unitId?: UnitId; stations?: { step: StepTypeId; params?: Record<string, unknown> }[]; blockUnits?: UnitId[] }
  interface AnswerEvent { item: ItemId; ok: boolean; kind: 'recall' | 'match'; chose?: UnitId; t: number }
  interface StepResult { outcome: 'done' | 'aborted'; answers: AnswerEvent[]; slips: number; ms: number }
  ```
- Produces (`curriculum.ts`): `itemId(unit: UnitId, kind: string): ItemId`, `parseItem(id: ItemId): { unit: UnitId; kind: string }`, `validateCurriculum(c: Curriculum, knownSteps: StepTypeId[]): string[]`, `expandPath(c: Curriculum, band: AgeBand): PathNode[]`.
- Produces (`profiles.ts`): `AgeProfile` and `profileFor(band: AgeBand): AgeProfile` with exactly these values:

  | field | 3-5 | 6-8 |
  |---|---|---|
  | unitsPerSitting | 1 | 2 |
  | sittingMinutes | 10 | 10 |
  | timers | false | false |
  | findChoices / findRounds | 3 / 3 | 4 / 2 |
  | soundPickChoices / soundPickRounds | 3 / 2 | 4 / 2 |
  | firstSoundChoices / firstSoundRounds | 3 / 2 | 4 / 2 |
  | checkpointChoices / checkpointExtraReview | 4 / 1 | 4 / 2 |
  | traceTolerance (board units of 300) | 40 | 30 |
  | plane {targets, lanes, travelSec, spawnGapSec} | 5, 3, 7, 2.4 | 6, 4, 4.5, 1.5 |
  | race {targets, lanes, travelSec, spawnGapSec} | 6, 3, 6, 2.0 | 8, 3, 3.5, 1.3 |
  | mole {targets, rows, cols, upMs, downMs, maxUp} | 4, 3, 3, [2600,3600], [800,1600], 2 | 5, 3, 3, [1600,2600], [500,1300], 3 |
  | match {pairs} | 3 | 4 |
  | allowedSteps | all slice steps | all slice steps |

  Slice steps: `SLICE_STEPS: StepTypeId[] = ['meet','find','soundPick','firstSound','drive','checkpoint','plane','race','mole','match']` (exported from `profiles.ts`).
- Produces (`age.ts`): `ageNow(age: { years: number; setOn: string }, today: string): number` (adds one year on each anniversary of `setOn`; a `02-29` anniversary counts on `03-01` in non-leap years; never less than `years`), `bandForAge(n: number): AgeBand` (<= 5 -> `'3-5'`, else `'6-8'`).

- [ ] **Step 1: Write the failing tests**

```ts
// age.test.ts
it('counts up on the anniversary', () => { expect(ageNow({ years: 4, setOn: '2026-11-21' }, '2027-11-20')).toBe(4); expect(ageNow({ years: 4, setOn: '2026-11-21' }, '2027-11-21')).toBe(5); });
it('leap-day anniversary counts on 1 March', () => { expect(ageNow({ years: 3, setOn: '2028-02-29' }, '2029-02-28')).toBe(3); expect(ageNow({ years: 3, setOn: '2028-02-29' }, '2029-03-01')).toBe(4); });
it('setOn in the future keeps the set age', () => expect(ageNow({ years: 5, setOn: '2030-01-01' }, '2026-11-21')).toBe(5));
it('bands', () => { expect(bandForAge(3)).toBe('3-5'); expect(bandForAge(5)).toBe('3-5'); expect(bandForAge(6)).toBe('6-8'); expect(bandForAge(9)).toBe('6-8'); });
// curriculum.test.ts
const c = loadJson('content/curriculum-letters.json');
it('letters curriculum is valid', () => expect(validateCurriculum(c, SLICE_STEPS)).toEqual([]));
it('expands to 6 units and 2 checkpoints, cp after units 3 and 6', () => expect(expandPath(c, '3-5').map(n => n.id)).toEqual(['u:מ','u:ל','u:ב','cp1','u:ת','u:י','u:צ','cp2']));
it('unit stations resolve $game by rotation', () => expect(expandPath(c, '3-5').filter(n => n.type === 'unit').map(n => n.stations!.at(-1)!.step)).toEqual(['plane','race','mole','match','plane','race']));
it('checkpoint nodes carry their block', () => expect(expandPath(c, '3-5')[3].blockUnits).toEqual(['מ','ל','ב']));
it('rejects unknown step ids', () => expect(validateCurriculum({ ...c, gameRotation: ['jump'] }, SLICE_STEPS)).toContain('unknown step: jump'));
it('profiles hold the table values', () => { expect(profileFor('3-5').findChoices).toBe(3); expect(profileFor('3-5').race.targets).toBe(6); expect(profileFor('6-8').unitsPerSitting).toBe(2); });
// architecture.test.ts
it('engine has no Hebrew and no content/steps imports', () => { for (const f of filesUnder('src/engine')) { const s = read(f); expect(s, f).not.toMatch(/[\u0590-\u05FF]/); expect(s, f).not.toMatch(/from ['"].*\/(content|steps|ui)\//); } });
```

- [ ] **Step 2: Run** `npx vitest run tests/engine` - Expected: FAIL.

- [ ] **Step 3: Write `curriculum-letters.json`**: `id 'letters-he'`, `bands ['3-5','6-8']`, `itemKinds ['name','sound']`, units in Task 2 order, `unitStations` for both bands `[meet, find, drive, firstSound, $game]`, `gameRotation ['plane','race','mole','match']`, `checkpoint { everyUnits: 3, step: 'checkpoint' }`, `itemSteps { name: 'find', sound: 'soundPick' }`, `practice { name: [find, mole], sound: [soundPick, firstSound] }`. Node ids: `u:<unitId>` and `cp<n>`. Station ids used later: `<unitId>#<index>`. (Curriculum JSON is the only engine-facing file with Hebrew; it lives in `content/`, not `src/engine`.)

- [ ] **Step 4: Implement** the four engine modules.

- [ ] **Step 5: Verify** `npx vitest run tests/engine` PASS; `npm run typecheck` exit 0.

---

### Task 4: Mastery model

**Files:**
- Create: `app/src/engine/mastery.ts`
- Test: `app/tests/engine/mastery.test.ts`

**Interfaces:**
- Consumes: `AnswerEvent`, `ItemId`, `UnitId` (Task 3), `daysBetween` (Task 1).
- Produces:
  ```ts
  interface Attempt { day: string; t: number; ok: boolean; kind: 'recall' | 'match'; chose?: UnitId }
  interface MasteryRecord { attempts: Attempt[]; confusions: Record<UnitId, number>; lastSeen: number }
  const MASTERY = { KNOWN_DAYS: 2, MAX_ATTEMPTS: 40, CONFUSION_MIN: 2 };
  recordAnswer(rec: MasteryRecord | undefined, a: Attempt): MasteryRecord     // pure; increments confusions[chose] on a wrong answer; caps attempts (drops oldest)
  isWeak(rec?: MasteryRecord): boolean     // some wrong attempt has no correct attempt on a strictly later day
  isKnown(rec?: MasteryRecord): boolean    // correct on >= KNOWN_DAYS distinct days, >= 1 of them kind 'recall', and !isWeak
  recallDays(rec?: MasteryRecord): number  // distinct days with a correct recall
  topConfusions(rec?: MasteryRecord, min = MASTERY.CONFUSION_MIN): UnitId[]   // by count desc
  unitStatus(recs: (MasteryRecord | undefined)[], taught: boolean): 'known' | 'learning' | 'notYet'  // known iff every item known; learning iff taught or any attempt
  ```

- [ ] **Step 1: Write the failing tests**

```ts
const A = (day: string, ok: boolean, kind: 'recall'|'match' = 'recall', chose?: string) => ({ day, t: 0, ok, kind, chose });
const fold = (...as: Attempt[]) => as.reduce<MasteryRecord | undefined>((r, a) => recordAnswer(r, a), undefined)!;
it('one correct answer is not known', () => expect(isKnown(fold(A('2026-11-21', true)))).toBe(false));
it('many correct answers on one day are not known', () => expect(isKnown(fold(A('d1', true), A('d1', true), A('d1', true)))).toBe(false));
it('correct on two days with a recall is known', () => expect(isKnown(fold(A('2026-11-21', true, 'match'), A('2026-11-22', true)))).toBe(true));
it('two days of match only are not known', () => expect(isKnown(fold(A('2026-11-21', true, 'match'), A('2026-11-22', true, 'match')))).toBe(false));
it('an error is cleared only by a correct answer on a later day', () => { expect(isWeak(fold(A('2026-11-21', false), A('2026-11-21', true)))).toBe(true); expect(isWeak(fold(A('2026-11-21', false), A('2026-11-22', true)))).toBe(false); });
it('a known item that fails becomes weak and not known', () => expect(isKnown(fold(A('2026-11-21', true), A('2026-11-22', true), A('2026-11-25', false)))).toBe(false));
it('confusions count the chosen unit', () => expect(topConfusions(fold(A('d', false, 'recall', 'כ'), A('d', false, 'recall', 'כ'), A('d', false, 'recall', 'ר')))).toEqual(['כ']));
it('attempts are capped at 40', () => expect(fold(...Array.from({ length: 50 }, () => A('d', true))).attempts.length).toBe(40));
it('unit status', () => { expect(unitStatus([undefined, undefined], false)).toBe('notYet'); expect(unitStatus([undefined, undefined], true)).toBe('learning'); });
```

- [ ] **Step 2: Run** `npx vitest run tests/engine/mastery.test.ts` - Expected: FAIL.
- [ ] **Step 3: Implement** `mastery.ts` (string comparison of `'YYYY-MM-DD'` keys is a valid day order).
- [ ] **Step 4: Verify** the test PASSES.

---

### Task 5: Distractor choice and the scattering rule

**Files:**
- Create: `app/src/engine/distractors.ts`, `app/src/engine/scatter.ts`
- Test: `app/tests/engine/distractors.test.ts`, `app/tests/engine/scatter.test.ts`

**Interfaces:**
- Consumes: `Rng` (Task 1), `UnitId` (Task 3).
- Produces:
  ```ts
  type Pool = 'confusions' | 'lookAlikes' | 'taught';
  interface DistractorInput { target: UnitId; n: number; mode: 'look' | 'sound'; alphabet: UnitId[]; lookAlikes: Record<UnitId, UnitId[]>; sameSound: UnitId[][]; taught: UnitId[]; confusions: UnitId[]; prefer: Pool[]; rng: Rng }
  chooseDistractors(i: DistractorInput): UnitId[]
  // Fill from the pools in `prefer` order (each pool shuffled by rng), then from the rest of `alphabet`; never the target;
  // unique; in 'sound' mode skip any candidate that shares a sameSound group with the target or with an already chosen option.
  interface Spawn { lane: number; target: boolean }
  scatterSequence(o: { targets: number; others: number; lanes: number; rng: Rng; sameGroup?: (a: number, b: number) => boolean }): Spawn[]
  // S1 no two adjacent spawns are both targets; S2 consecutive targets (in target order) never in the same lane / sameGroup;
  // S3 per-lane target counts differ by at most 1 (lanes >= 2). Throws if others < targets - 1 or lanes < 2.
  ```
  Algorithm for `scatterSequence` (not determined by the tests alone): build target lanes by repeatedly shuffling `[0..lanes-1]` rounds and appending, swapping the first element of a round with another when it equals the previous lane (or `sameGroup`); then lay out `T o T o ...` and distribute the remaining others into random gaps (including both ends); other lanes are random.

- [ ] **Step 1: Write the failing tests**

```ts
const base = { alphabet: ALEF_BET_22, lookAlikes: SIM_FIXTURE, sameSound: [['א','ע'],['ט','ת'],['כ','ק'],['ס','שׂ']], taught: [], confusions: [], prefer: ['confusions','lookAlikes','taught'] as Pool[] };
it('returns n unique options without the target', () => { const d = chooseDistractors({ ...base, target: 'ב', n: 3, mode: 'look', rng: createRng(1) }); expect(new Set(d).size).toBe(3); expect(d).not.toContain('ב'); });
it('look mode prefers the child confusions, then look-alikes', () => { const d = chooseDistractors({ ...base, target: 'ב', n: 2, mode: 'look', confusions: ['ד'], rng: createRng(2) }); expect(d[0]).toBe('ד'); expect(SIM_FIXTURE['ב']).toContain(d[1]); });
it('sound mode never offers a letter that sounds like the target (200 seeds)', () => { for (let s = 0; s < 200; s++) { expect(chooseDistractors({ ...base, target: 'א', n: 3, mode: 'sound', lookAlikes: { ...SIM_FIXTURE, 'א': ['ע','צ','ש'] }, rng: createRng(s) })).not.toContain('ע'); } });
it('sound mode never offers two options that sound alike', () => { for (let s = 0; s < 200; s++) { const d = chooseDistractors({ ...base, target: 'מ', n: 3, mode: 'sound', taught: ['ט','ת','כ','ק'], prefer: ['taught'], rng: createRng(s) }); expect(d.includes('ט') && d.includes('ת')).toBe(false); expect(d.includes('כ') && d.includes('ק')).toBe(false); } });
it('falls back to the alphabet when pools are short', () => expect(chooseDistractors({ ...base, target: 'ל', n: 3, mode: 'look', lookAlikes: { 'ל': [] }, prefer: ['lookAlikes'], rng: createRng(4) }).length).toBe(3));
// scatter.test.ts
const check = (seq: Spawn[], same = (a: number, b: number) => a === b) => { const t = seq.filter(s => s.target); seq.forEach((s, i) => i && expect(s.target && seq[i - 1].target).toBe(false)); t.forEach((s, i) => i && expect(same(s.lane, t[i - 1].lane)).toBe(false)); };
it('S1-S3 hold over 500 seeds', () => { for (let s = 0; s < 500; s++) { const seq = scatterSequence({ targets: 6, others: 8, lanes: 3, rng: createRng(s) }); expect(seq.filter(x => x.target).length).toBe(6); expect(seq.length).toBe(14); check(seq); const per = [0,1,2].map(l => seq.filter(x => x.target && x.lane === l).length); expect(Math.max(...per) - Math.min(...per)).toBeLessThanOrEqual(1); } });
it('sameGroup keeps consecutive mole targets out of one column', () => { const col = (a: number, b: number) => a % 3 === b % 3; for (let s = 0; s < 200; s++) check(scatterSequence({ targets: 4, others: 5, lanes: 9, rng: createRng(s), sameGroup: col }), col); });
it('throws when there are too few others to separate targets', () => expect(() => scatterSequence({ targets: 5, others: 3, lanes: 3, rng: createRng(1) })).toThrow());
```

- [ ] **Step 2: Run** `npx vitest run tests/engine/distractors.test.ts tests/engine/scatter.test.ts` - Expected: FAIL.
- [ ] **Step 3: Implement** both modules (the test fixtures `ALEF_BET_22` / `SIM_FIXTURE` live in `tests/fixtures/letters.ts`, copied from the old `LETTERS` / `SIM`; test-only Hebrew is fine).
- [ ] **Step 4: Verify** both tests PASS.

---

### Task 6: Check-points, sitting planner and applying step results

**Files:**
- Create: `app/src/engine/checkpoint.ts`, `app/src/engine/planner.ts`, `app/src/engine/progress.ts`
- Test: `app/tests/engine/checkpoint.test.ts`, `app/tests/engine/planner.test.ts`, `app/tests/engine/progress.test.ts`

**Interfaces:**
- Consumes: Tasks 3-5 (`expandPath`, `profileFor`, `MasteryRecord`, `isWeak`, `isKnown`, `recallDays`, `recordAnswer`, `Rng`).
- Produces (`checkpoint.ts`):
  - `buildCheckpoint(i: { blockUnits: UnitId[]; taughtUnits: UnitId[]; itemKinds: string[]; mastery: Record<ItemId, MasteryRecord>; extraReview: number; today: string; rng: Rng }): ItemId[]` - one item per block unit (its item with the fewest `recallDays`, ties -> `itemKinds` order), then `extraReview` items from the other taught items by weight `1 + (isWeak ? 3 : 0) + (isKnown ? 0 : 1) + min(daysSinceLastSeen, 14) / 7` (rng breaks ties).
  - `gradeCheckpoint(items: ItemId[], answers: AnswerEvent[]): { passed: ItemId[]; failed: ItemId[] }` - the first answer for each item decides.
- Produces (`planner.ts`):
  ```ts
  interface PlannedStep { kind: 'warmup' | 'station' | 'practice' | 'checkpoint' | 'review'; step: StepTypeId; unitId?: UnitId; items: ItemId[]; params?: Record<string, unknown>; stationId?: string; cpId?: string }
  interface PathProgress {
    stationsDone: string[]; unitStartDay: Record<UnitId, string>; checkpointsPassed: string[];
    pending: PlannedStep[];                 // practice steps then the retry checkpoint, in order
    extraSittingDay: string | null;         // parent "open another sitting today"
    sitting: { day: string; done: number; warmupDone: boolean; closed: boolean } | null;
    stickers: { id: string; day: string; shown: boolean }[];
  }
  interface PlannerInput { curriculum: Curriculum; band: AgeBand; progress: PathProgress; mastery: Record<ItemId, MasteryRecord>; today: string; minutesToday: number; dailyLimitMin: number | null; rng: Rng }
  type NextResult = { type: 'step'; step: PlannedStep } | { type: 'end'; reason: 'sittingDone' | 'tomorrow' | 'limit' | 'pathComplete' };
  emptyProgress(): PathProgress
  sittingStatus(i: PlannerInput): 'ready' | 'tomorrow' | 'limit' | 'complete'
  nextStep(i: PlannerInput): NextResult
  previewSitting(i: PlannerInput): PlannedStep[]   // assumes every checkpoint passes; used for the progress bar
  ```
  Rules for `nextStep`, in order: (1) `minutesToday >= dailyLimitMin` -> `limit`. (2) sitting of today `closed` and `extraSittingDay !== today` -> `tomorrow`. (3) warm-up once per day if any unit is taught (`meet` done): the weak item with the most recent wrong attempt, else the not-known item with the oldest `lastSeen` not seen today, else a known item not seen for > 3 days; step = `itemSteps[kind]`, `params.rounds = 2`. (4) `pending` non-empty -> its head; after the retry checkpoint the sitting closes. (5) a due checkpoint (all its block units done, not passed) -> `checkpoint` with `items = buildCheckpoint(...)`. (6) an unfinished started unit -> its next undone station (resume). (7) a new unit if fewer than `unitsPerSitting` units started today (or `extraSittingDay === today`, which allows `unitsPerSitting` more) -> its first station. (8) units started today all finished -> close the sitting, `sittingDone`. (9) nothing left in the path -> once per day a `review` sitting (warm-up + `gameRotation` game on the weakest taught unit), then `pathComplete`. A `lastNewUnit` / `unitStartDay` / `sitting.day` later than `today` counts as "not today".
- Produces (`progress.ts`): `applyStepResult(i: PlannerInput, step: PlannedStep, r: StepResult, now: number): { progress: PathProgress; mastery: Record<ItemId, MasteryRecord>; checkpoint?: { cpId: string; passed: ItemId[]; failed: ItemId[] } }` - `aborted` changes nothing; otherwise records each answer via `recordAnswer` (slips ignored), marks the station done (sets `unitStartDay` on a unit's first station), adds an unshown sticker `u:<unitId>` when a unit's last station completes and `cp<n>` when a checkpoint passes; a failed checkpoint appends to `pending`, for each failed item, `practice[kind]` steps (with `unitId`, `items:[item]`), then one retry checkpoint step with `items = failed`. `markStickersShown(p: PathProgress): PathProgress`.

- [ ] **Step 1: Write the failing tests** (helper `run(input, results)` drives `nextStep` + `applyStepResult` with scripted `StepResult`s; `ok(items)` makes an all-correct result)

```ts
// planner.test.ts
it('fresh child: unit 1 stations in order, then sittingDone', () => expect(steps(fresh('2026-11-21'))).toEqual(['meet','find','drive','firstSound','plane','end:sittingDone']));
it('same day after the unit: tomorrow; parent unlock opens the next unit', () => { const s = afterUnits(1, '2026-11-21'); expect(nextStep(s).type === 'end' && nextStep(s).reason).toBe('tomorrow'); expect(stepOf(nextStep({ ...s, progress: { ...s.progress, extraSittingDay: '2026-11-21' } }))).toBe('meet'); });
it('next day starts with a warm-up on the item with an uncleared error', () => { const s = afterUnits(1, '2026-11-21', { wrong: 'מ/name' }); const n = nextStep({ ...s, today: '2026-11-22' }); expect(n.type === 'step' && n.step.kind).toBe('warmup'); expect(n.type === 'step' && n.step.items).toEqual(['מ/name']); });
// `steps()` returns step ids plus 'end:<reason>'; `kinds()` returns PlannedStep.kind plus 'end:<reason>'
it('after 3 units the next sitting is warm-up, checkpoint cp1, then unit 4', () => { const k = kinds(afterUnits(3, '2026-11-23'), '2026-11-24'); expect(k.slice(0, 3)).toEqual(['warmup', 'checkpoint', 'station']); expect(steps(afterUnits(3, '2026-11-23'), '2026-11-24')[2]).toBe('meet'); });
it('failed checkpoint inserts practice for failed items then a retry, and unit 4 does not start', () => { const opts = { failCheckpointItem: 'ל/name' }; expect(kinds(afterUnits(3, '2026-11-23'), '2026-11-24', opts).slice(1)).toEqual(['checkpoint','practice','practice','checkpoint','end:sittingDone']); expect(steps(afterUnits(3, '2026-11-23'), '2026-11-24', opts).slice(2, 4)).toEqual(['find','mole']); });
it('passing the retry moves on to unit 4 in the next sitting', () => { const s = afterRetryPassed(afterUnits(3, '2026-11-23'), '2026-11-24'); expect(kinds(s, '2026-11-25')).not.toContain('checkpoint'); expect(kinds(s, '2026-11-25')[1]).toBe('station'); expect(steps(s, '2026-11-25')[1]).toBe('meet'); });
it('daily limit ends at a step boundary', () => expect(nextStep({ ...fresh('2026-11-21'), minutesToday: 20, dailyLimitMin: 20 })).toEqual({ type: 'end', reason: 'limit' }));
it('6-8 runs two units per sitting', () => expect(steps({ ...fresh('2026-11-21'), band: '6-8' }).filter(s => s === 'meet').length).toBe(2));
it('an interrupted unit resumes at the next undone station the same day', () => expect(stepOf(nextStep(partway('2026-11-21', 2)))).toBe('drive'));
it('a future day stored by a moved-back clock does not block the path', () => expect(sittingStatus(withSittingDay(fresh('2026-11-21'), '2027-01-01', { closed: true }))).toBe('ready'));
it('everything done: review sitting then pathComplete', () => expect(steps(allDone('2026-12-01'), '2026-12-02').at(-1)).toBe('end:pathComplete'));
it('preview of a fresh child lists the 5 unit stations', () => expect(previewSitting(fresh('2026-11-21')).length).toBe(5));
// checkpoint.test.ts
it('one item per block unit, least established first kind', () => expect(buildCheckpoint({ blockUnits: ['מ','ל','ב'], taughtUnits: ['מ','ל','ב'], itemKinds: ['name','sound'], mastery: {}, extraReview: 0, today: 'd', rng: createRng(1) })).toEqual(['מ/name','ל/name','ב/name']));
it('extra review prefers a weak old item over a fresh known one', () => expect(buildCheckpoint(cpWith({ weakOld: 'מ/sound', knownFresh: 'ת/sound' })).at(-1)).toBe('מ/sound'));
it('grading uses the first answer per item', () => expect(gradeCheckpoint(['מ/name','ל/name'], [ans('מ/name', false), ans('מ/name', true), ans('ל/name', true)])).toEqual({ passed: ['ל/name'], failed: ['מ/name'] }));
// progress.test.ts
it('aborted result changes nothing', () => { const s = fresh('d'); const r = applyStepResult(s, firstStep(s), { outcome: 'aborted', answers: [ans('מ/name', false)], slips: 0, ms: 5 }, 0); expect(r.progress).toEqual(s.progress); expect(r.mastery).toEqual(s.mastery); });
it('slips alone leave mastery unchanged', () => expect(applyStepResult(s, step, { outcome: 'done', answers: [], slips: 4, ms: 9 }, 0).mastery).toEqual(s.mastery));
it('completing a unit adds an unshown sticker; markStickersShown flips it', () => { const p = finishUnit('מ'); expect(p.stickers).toEqual([{ id: 'u:מ', day: 'd', shown: false }]); expect(markStickersShown(p).stickers[0].shown).toBe(true); });
```
(Test files may use Hebrew unit ids; the architecture rule covers `src/engine` only.)

- [ ] **Step 2: Run** `npx vitest run tests/engine` - Expected: FAIL on the three new files.
- [ ] **Step 3: Implement** `checkpoint.ts`, `planner.ts`, `progress.ts` per the rules above.
- [ ] **Step 4: Verify** `npx vitest run tests/engine` PASS.

---

### Task 7: Saving, backup, damaged-save recovery, export / import

**Files:**
- Create: `app/src/store/schema.ts`, `app/src/store/kv.ts`, `app/src/store/save.ts`, `app/src/store/exportImport.ts`, `app/src/platform/native.ts`
- Test: `app/tests/store/save.test.ts`, `app/tests/store/exportImport.test.ts`

**Interfaces:**
- Consumes: `PathProgress`, `emptyProgress`, `MasteryRecord`, `ItemId` (Tasks 4, 6).
- Produces (`schema.ts`):
  ```ts
  interface ChildRecord { id: string; name: string; photo: string | null; age: { years: number; setOn: string }; gender: null; curriculumId: string; createdOn: string;
    mastery: Record<ItemId, MasteryRecord>; progress: PathProgress; playSeconds: Record<string, number>; dailyLimitMin: number | null; checkpoints: { cpId: string; day: string; passed: ItemId[]; failed: ItemId[] }[] }
  interface SaveData { schema: 1; children: ChildRecord[]; settings: { voiceVolume: number; effectsVolume: number; lastChildId: string | null } }
  freshSave(): SaveData            // voiceVolume 0.8, effectsVolume 0.4
  newChild(name: string, years: number, photo: string | null, today: string, id: string): ChildRecord   // dailyLimitMin 20
  isSaveData(x: unknown): x is SaveData
  ```
- Produces (`kv.ts`): `KV = { get(k: string): string | null; set(k: string, v: string): void; remove(k: string): void; keys(): string[] }`, `localKV(): KV`, `memoryKV(init?: Record<string,string>): KV`.
- Produces (`native.ts`): `NativeBackup = { read(): string | null; write(raw: string): boolean }`, `nativeBackup(): NativeBackup | null` (uses `window.AlfiNative.readBackup/writeBackup` when present), `isApp(): boolean`, `exitApp(): void`, `exportFile(name: string, text: string): boolean` (native `AlfiNative.exportFile` in the APK, else a Blob `<a download>`).
- Produces (`save.ts`):
  ```ts
  const KEYS = { primary: 'alfi.app.save', prev: 'alfi.app.save.prev', badPrefix: 'alfi.app.save.bad.' };
  // envelope: { v: 1, seq: number, savedAt: number, sum: string /* FNV-1a 32-bit hex of JSON.stringify(data) */, data: SaveData }
  parseEnvelope(raw: string | null): { ok: true; seq: number; data: SaveData } | { ok: false; reason: 'empty' | 'json' | 'checksum' | 'schema' }
  loadSave(kv: KV, native: NativeBackup | null, now: number): { data: SaveData; seq: number; source: 'primary' | 'prev' | 'native' | 'fresh'; quarantined: string[] }
  // picks the valid copy with the highest seq; quarantines an invalid non-empty primary under badPrefix+now (keeps the newest 3 bad copies); never writes the fresh save until the first saveNow
  saveNow(kv: KV, native: NativeBackup | null, data: SaveData, seq: number, now: number): { ok: boolean; seq: number }
  // if the current primary parses ok -> copy it to prev, else quarantine it; write the new primary (seq+1); any thrown storage error -> { ok: false } with primary and prev left as they were
  scheduleNativeBackup(native: NativeBackup | null, getRaw: () => string, delayMs = 2000): void
  // debounced native.write(getRaw()); also flushes immediately on document visibilitychange to 'hidden'
  ```
- Produces (`exportImport.ts`): `exportChild(c: ChildRecord, includePhoto: boolean, today: string): { name: string; text: string }` (file `alfi-<name>-<YYYY-MM-DD>.json`, body `{ app: 'alfi', kind: 'child-export', version: 1, exportedOn, child }`, `photo: null` unless included), `parseImport(text: string): { ok: true; child: ChildRecord } | { ok: false; reason: 'json' | 'kind' | 'version' | 'shape' }`, `applyImport(data: SaveData, child: ChildRecord): { data: SaveData; replaced: boolean }` (same id -> replace, else append).

- [ ] **Step 1: Write the failing tests**

```ts
it('fresh when nothing is stored', () => expect(loadSave(memoryKV(), null, 1).source).toBe('fresh'));
it('falls back to prev when the primary checksum fails and quarantines the primary', () => { const kv = withPrimaryAndPrev({ corruptPrimary: true }); const r = loadSave(kv, null, 99); expect(r.source).toBe('prev'); expect(kv.get('alfi.app.save.bad.99')).not.toBeNull(); });
it('uses the native backup when web storage is empty', () => expect(loadSave(memoryKV(), fakeNative(envelope(data1, 5)), 1).source).toBe('native'));
it('picks the highest seq among valid copies', () => expect(loadSave(kvWith(envelope(data1, 3)), fakeNative(envelope(data2, 7)), 1).seq).toBe(7));
it('save never overwrites an unreadable primary without quarantining it', () => { const kv = memoryKV({ 'alfi.app.save': '{broken' }); saveNow(kv, null, freshSave(), 0, 42); expect(kv.get('alfi.app.save.bad.42')).toBe('{broken'); });
it('save rotates a valid primary to prev', () => { const kv = kvWith(envelope(data1, 1)); saveNow(kv, null, data2, 1, 2); expect(parseEnvelope(kv.get('alfi.app.save.prev'))).toMatchObject({ ok: true, seq: 1 }); });
it('keeps at most 3 bad copies', () => { const kv = memoryKV(); for (let i = 0; i < 5; i++) { kv.set('alfi.app.save', 'x' + i); loadSave(kv, null, i); } expect(kv.keys().filter(k => k.startsWith('alfi.app.save.bad.')).length).toBe(3); });
it('write failure reports ok:false and leaves the previous primary intact', () => { const kv = throwingKV(envelope(data1, 4)); expect(saveNow(kv, null, data2, 4, 5).ok).toBe(false); expect(parseEnvelope(kv.get('alfi.app.save'))).toMatchObject({ ok: true, seq: 4 }); });
it('a future schema is not overwritten', () => { const kv = kvWith(envelope({ ...data1, schema: 2 } as any, 9)); loadSave(kv, null, 7); expect(kv.get('alfi.app.save.bad.7')).not.toBeNull(); });
// exportImport.test.ts
it('export leaves the photo out unless asked', () => { expect(JSON.parse(exportChild(kid, false, 'd').text).child.photo).toBeNull(); expect(JSON.parse(exportChild(kid, true, 'd').text).child.photo).toBe(kid.photo); });
it('round trip', () => expect(parseImport(exportChild(kid, true, 'd').text)).toEqual({ ok: true, child: kid }));
it('rejects a foreign or newer file and leaves data unchanged', () => { expect(parseImport('{"app":"x"}')).toMatchObject({ ok: false, reason: 'kind' }); expect(parseImport(JSON.stringify({ app: 'alfi', kind: 'child-export', version: 2, child: kid }))).toMatchObject({ ok: false, reason: 'version' }); });
it('import replaces the same child id, else appends', () => { expect(applyImport(withKid, kid).replaced).toBe(true); expect(applyImport(freshSave(), kid).data.children.length).toBe(1); });
```

- [ ] **Step 2: Run** `npx vitest run tests/store` - Expected: FAIL.
- [ ] **Step 3: Implement** the four store modules and `native.ts`; on app start call `navigator.storage?.persist?.()` (ignore failures).
- [ ] **Step 4: Verify** `npx vitest run tests/store` PASS.

---

### Task 8: Audio layer, voice choice, sound effects and the spoken-lines manifest

**Files:**
- Create: `app/src/audio/lines.ts`, `app/src/audio/voice.ts`, `app/src/audio/audio.ts`, `app/src/audio/sfx.ts`
- Create: `app/scripts/spoken-lines.ts` (writes `app/content/spoken-lines.json`), add script `"lines": "node scripts/spoken-lines.ts"` to `package.json`
- Test: `app/tests/audio/lines.test.ts`, `app/tests/audio/voice.test.ts`, `app/tests/audio/audio.test.ts`

**Interfaces:**
- Consumes: `LettersContent`, `LINE_IDS` (Task 2).
- Produces (`lines.ts`):
  - `audioKey(text: string, rate = 0.9): string` -> `text + '|' + String(rate)`.
  - `line(c: LettersContent, id: string, vars?: { name?: string; sound?: string; word?: string }): string` (NFC; throws on an unknown id or an unfilled placeholder).
  - `allSpokenLines(c: LettersContent): { file: string; text: string; rate: number; category: string; pitch: 1.05 }[]` - every concrete line: templates expanded for each letter they apply to (`find.wrong` for all 22 names; letter templates for the six; `{word}` for each of the letter's words), every letter name, `soundSay` at rate 0.75, every picture word, praise. `file` = `lines/<id>__<latin>[__<wordIndex>].mp3` or `letters/name_<latin>.mp3` / `words/<latin>_<i>.mp3`; deduplicated by key. Same entry shape as `D:\alfi-build\audio\manifest.json`.
- Produces (`voice.ts`): `pickHebrewVoice(vs: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null` (lang `^(he|iw)`, `localService === true` only; prefer `default`), `voiceStatus(hasLocalVoice: boolean, clipIndex: Record<string,string> | null): 'clips' | 'live' | 'none'`.
- Produces (`audio.ts`):
  ```ts
  interface AudioDeps { fetchIndex(): Promise<Record<string, string> | null>; makeAudio(src: string): HTMLAudioElement; synth: SpeechSynthesis | null; Utterance: typeof SpeechSynthesisUtterance | null; voiceFolder: string /* 'hila' */ }
  interface AudioApi { ready: Promise<void>; say(text: string, opt?: { rate?: number; queue?: boolean }): Promise<void>; stop(): void; setVoiceVolume(v: number): void; status(): 'clips' | 'live' | 'none' }
  createAudio(d: AudioDeps): AudioApi
  ```
  `say` resolves when the clip / utterance ends (or immediately when muted, empty or no voice); clips: `audio/<voiceFolder>/<file>`, `volume = voiceVolume`; live: `u.lang = 'he-IL'`, `u.voice = pickHebrewVoice(...)`, `u.rate = rate`, `u.pitch = 1.05`, `u.volume = voiceVolume`, resolves on `onend`/`onerror` or after a fallback timeout of `400 + 90 * text.length / rate` ms; `queue: false` stops the current clip and calls `synth.cancel()` first; `queue: true` waits for the current line. Index fetched once from `audio/index.json`; failure -> `null`.
- Produces (`sfx.ts`): `createSfx(): { play(name: 'good' | 'bad' | 'pick' | 'chime' | 'pop' | 'bonk' | 'whoosh'): void; setVolume(v: number): void }` (WebAudio tones ported from the old `SFX`/`tone()`, one master `GainNode`; silently no-op without an `AudioContext`).

- [ ] **Step 1: Write the failing tests**

```ts
// lines.test.ts
it('key matches the pipeline rule', () => { expect(audioKey('שלום')).toBe('שלום|0.9'); expect(audioKey('בָּה', 0.75)).toBe('בָּה|0.75'); });
it('fills placeholders and rejects unknown ids', () => { expect(line(C, 'find.ask', { name: 'בֵּית' })).toBe('איפה האות בֵּית?'); expect(() => line(C, 'nope')).toThrow(); });
it('spoken lines are unique by key, NFC and never contain a child name placeholder', () => { const all = allSpokenLines(C); expect(new Set(all.map(l => audioKey(l.text, l.rate))).size).toBe(all.length); all.forEach(l => { expect(l.text).toBe(l.text.normalize('NFC')); expect(l.text).not.toMatch(/[{}]/); }); });
it('covers find.wrong for all 22 letters', () => expect(allSpokenLines(C).filter(l => l.file.startsWith('lines/find.wrong__')).length).toBe(22));
// voice.test.ts
it('never picks an online voice', () => expect(pickHebrewVoice([v('he-IL', false, 'Microsoft Hila Online (Natural)')])).toBeNull());
it('picks a local Hebrew voice', () => expect(pickHebrewVoice([v('en-US', true), v('he-IL', true, 'Android Hebrew')])?.name).toBe('Android Hebrew'));
it('voiceStatus is none with no local voice and no clips', () => expect(voiceStatus(false, null)).toBe('none'));
// audio.test.ts (fake Audio / synth record calls)
it('plays the clip when the key is indexed, at the voice volume', async () => { const f = fakes({ index: { 'שלום|0.9': 'a.mp3' } }); const a = createAudio(f.deps); await a.ready; a.setVoiceVolume(0.5); const p = a.say('שלום'); f.endClip(); await p; expect(f.clips[0]).toEqual({ src: 'audio/hila/a.mp3', volume: 0.5 }); expect(f.spoken).toEqual([]); });
it('falls back to the live voice when the clip is missing or play() rejects', async () => { const f = fakes({ index: { 'x|0.9': 'x.mp3' }, rejectPlay: true }); const a = createAudio(f.deps); await a.ready; a.say('x'); a.say('y'); await tick(); expect(f.spoken).toEqual(['x', 'y']); });
it('no index -> live voice', async () => { const f = fakes({ index: null }); const a = createAudio(f.deps); await a.ready; a.say('z'); expect(f.spoken).toEqual(['z']); });
it('queued line waits for the current one', async () => { const f = fakes({ index: { 'a|0.9': 'a.mp3', 'b|0.9': 'b.mp3' } }); const a = createAudio(f.deps); await a.ready; a.say('a'); a.say('b', { queue: true }); expect(f.clips.length).toBe(1); f.endClip(); await tick(); expect(f.clips.length).toBe(2); });
it('stop cancels clip and live speech', async () => { const f = fakes({ index: null }); const a = createAudio(f.deps); await a.ready; a.say('z'); a.stop(); expect(f.cancelled).toBe(true); });
```

- [ ] **Step 2: Run** `npx vitest run tests/audio` - Expected: FAIL.
- [ ] **Step 3: Implement** the four modules and the script (reads both JSON files with `fs`, writes `content/spoken-lines.json` for `letters-3-5.json`).
- [ ] **Step 4: Verify** `npx vitest run tests/audio` PASS; `npm run lines` writes `content/spoken-lines.json` with more than 100 entries.

---

### Task 9: App shell - router and back button, parent gate, setup with photo, children picker

**Files:**
- Create: `app/src/ui/router.ts`, `app/src/ui/gate.ts`, `app/src/ui/leaveDialog.ts`, `app/src/ui/app.ts` (app state: save, audio, sfx, current child; `persist()` wrapper over `saveNow` + `scheduleNativeBackup`)
- Create: `app/src/ui/screens/setup.ts`, `app/src/ui/screens/children.ts`, `app/src/platform/photo.ts`
- Modify: `app/src/main.ts` (boot: `applyTokens`, `loadSave`, route; register `window.alfiBack`)
- Test: `app/tests/ui/router.test.ts`, `app/tests/ui/gate.test.ts`, `app/tests/ui/setup.test.ts` (happy-dom)

**Interfaces:**
- Consumes: Tasks 1, 2, 7, 8.
- Produces (`app.ts`): `interface AppState { save: SaveData; seq: number; childId: string | null; audio: AudioApi; sfx: ReturnType<typeof createSfx>; storageWarning: boolean; persist(): boolean /* saveNow + scheduleNativeBackup; false sets storageWarning */ }`, `createAppState(kv: KV, native: NativeBackup | null, now: number): AppState`.
- Produces (`router.ts`):
  ```ts
  type Screen = 'setup' | 'children' | 'map' | 'station' | 'end' | 'gate' | 'parent';
  interface Router { show(s: Screen, mount: (root: HTMLElement) => () => void): void; current(): Screen; dialogOpen(): boolean; openDialog(close: () => void): void; closeDialog(): void; back(): 'handled' | 'exit' }
  createRouter(root: HTMLElement, onBack: Partial<Record<Screen, () => void>>): Router
  ```
  `back()`: dialog open -> close it, `handled`; `station` / `end` -> map; `parent` / `gate` -> map (or children when coming from the picker); `map` / `children` / `setup` -> open the leave dialog (`leave.ask` spoken, two 96px buttons check / cross; check -> `exitApp()` in the APK, else the children picker), `handled`. Never `exit` directly from any screen. `window.alfiBack = () => router.back()`. In a browser, Escape calls `router.back()`.
- Produces (`gate.ts`): `HOLD_MS = 3000`; `makeGateQuestion(rng: Rng): { a: number; b: number; answer: number; choices: number[] }` (a, b in 6..19, 4 distinct choices including `answer`, all > 0); `mountGate(root, opts: { rng: Rng; onPass(): void; onFail(): void })` shows the sum and 4 buttons (adult-facing text, not spoken); `longPress(el: HTMLElement, ms: number, fn: () => void): () => void` (pointerdown starts a timer, pointerup / pointerleave / pointercancel cancels).
- Produces (`setup.ts`): `validateSetup(name: string, years: number | null): { ok: true; name: string } | { ok: false; field: 'name' | 'age' }` (trim; collapse inner whitespace; 1-16 characters; years 3-8); `mountSetup(root, deps: { onDone(child: ChildRecord): void })` per mockup `Main.dc.html`: camera circle (input `type=file accept="image/*"`, no `capture` attribute so the wrapper offers camera and gallery), "התמונה נשמרת רק בטלפון הזה", name field, age buttons 3-8 (none preselected), start button disabled until valid; photo optional (fallback avatar: coloured circle with the name's first letter); when `audio.status() === 'none'` a parent notice "לא נמצא קול עברי במכשיר - הילד/ה לא ישמעו את ההנחיות" is shown above the start button.
- Produces (`photo.ts`): `readPhoto(file: File): Promise<string>` - center-crop to square, scale to 256x256, `canvas.toDataURL('image/jpeg', 0.8)`; on decode failure resolve `null`-like rejection handled by setup (stays without photo).
- Produces (`children.ts`): `mountChildren(root, deps: { children: ChildRecord[]; onPick(id: string): void; onAddChild(): void })` per `Children.dc.html`: 2-column photo grid (140px circles), speaks `children.who` once audio is allowed, "add child (parents)" button opens the gate by long press. Boot routing: no children -> setup; one child -> map directly; two or more -> children picker.

- [ ] **Step 1: Write the failing tests**

```ts
// router.test.ts
it('back from a station goes to the map', () => { const r = routerAt('station'); expect(r.back()).toBe('handled'); expect(r.current()).toBe('map'); });
it('back on the map opens the leave dialog, a second back closes it', () => { const r = routerAt('map'); r.back(); expect(r.dialogOpen()).toBe(true); r.back(); expect(r.dialogOpen()).toBe(false); expect(r.current()).toBe('map'); });
it('back never returns exit', () => (['setup','children','map','station','end','gate','parent'] as Screen[]).forEach(s => expect(routerAt(s).back()).toBe('handled')));
// gate.test.ts
it('question has 4 distinct positive choices including the answer', () => { for (let s = 0; s < 100; s++) { const q = makeGateQuestion(createRng(s)); expect(q.answer).toBe(q.a + q.b); expect(new Set(q.choices).size).toBe(4); expect(q.choices).toContain(q.answer); expect(q.a).toBeGreaterThanOrEqual(6); expect(q.b).toBeLessThanOrEqual(19); } });
it('long press fires only after 3000 ms', () => { vi.useFakeTimers(); const fn = vi.fn(); const el = document.createElement('button'); longPress(el, HOLD_MS, fn); el.dispatchEvent(new Event('pointerdown')); vi.advanceTimersByTime(2999); expect(fn).not.toHaveBeenCalled(); vi.advanceTimersByTime(1); expect(fn).toHaveBeenCalled(); });
it('releasing early cancels', () => { vi.useFakeTimers(); const fn = vi.fn(); const el = document.createElement('button'); longPress(el, HOLD_MS, fn); el.dispatchEvent(new Event('pointerdown')); vi.advanceTimersByTime(1000); el.dispatchEvent(new Event('pointerup')); vi.advanceTimersByTime(5000); expect(fn).not.toHaveBeenCalled(); });
// setup.test.ts
it('validates name and age', () => { expect(validateSetup('   ', 4)).toEqual({ ok: false, field: 'name' }); expect(validateSetup(' נועה  כהן ', 4)).toEqual({ ok: true, name: 'נועה כהן' }); expect(validateSetup('נועה', null)).toEqual({ ok: false, field: 'age' }); expect(validateSetup('א'.repeat(17), 4)).toEqual({ ok: false, field: 'name' }); });
it('start button is disabled until name and age are set', () => { const root = mount(mountSetup); expect(btn(root, 'בואו נתחיל').disabled).toBe(true); type(root, 'נועה'); click(ageBtn(root, 4)); expect(btn(root, 'בואו נתחיל').disabled).toBe(false); });
```

- [ ] **Step 2: Run** `npx vitest run tests/ui` - Expected: FAIL.
- [ ] **Step 3: Implement** the modules; layouts follow `Main.dc.html` and `Children.dc.html` (16px side gutter minimum, works from 320px wide to tablets, landscape scrolls instead of clipping).
- [ ] **Step 4: Verify** `npx vitest run tests/ui` PASS; `npm run build` exit 0; `npm run dev`, open the page at 390x844 in a browser: first run shows setup; after setup the app lands on the (placeholder) map.

---

### Task 10: Map, sitting runner, station shell and end of sitting

**Files:**
- Create: `app/src/ui/screens/map.ts`, `app/src/ui/screens/end.ts`, `app/src/ui/shell.ts`, `app/src/ui/runner.ts`, `app/src/steps/contract.ts`, `app/src/steps/registry.ts` (empty-safe: unknown step -> placeholder step that completes with no answers)
- Test: `app/tests/ui/runner.test.ts`, `app/tests/ui/map.test.ts` (happy-dom)

**Interfaces:**
- Consumes: Tasks 3, 6, 7, 8, 9.
- Produces (`contract.ts`):
  ```ts
  interface StepContext {
    step: PlannedStep; profile: AgeProfile; content: LettersContent; rng: Rng;
    stage: HTMLElement; signal: AbortSignal;
    audio: AudioApi; sfx: ReturnType<typeof createSfx>;
    taught: UnitId[]; confusions(unit: UnitId): UnitId[];
    setInstruction(text: string, rate?: number): void;   // spoken now and on the replay button
    progress(fraction: number): void;                     // optional inner progress
  }
  interface StepModule { id: StepTypeId; run(ctx: StepContext): Promise<StepResult> }
  ```
  A step resolves `done` with its first-try answers, or `aborted` when `signal` aborts (it must remove its listeners, timers and rAF loops on abort).
- Produces (`shell.ts`): `mountShell(root, opts: { bg: string; stepIndex: number; stepCount: number; onReplay(): void }): { stage: HTMLElement; showNext(onNext: () => void): void }` - top row: 56px replay (speaker) button + progress bar (`aria-label` "שלב i מתוך n"), stage, then a 96px green next arrow shown by `showNext` (fires once; also spoken `step.next` after 6 s idle).
- Produces (`runner.ts`): `createRunner(deps: { app: AppState; registry: Record<StepTypeId, StepModule>; router: Router; clock: { now(): number; today(): string } }): { start(childId: string): Promise<void> }` - builds `PlannerInput` with `band = bandForAge(ageNow(child.age, today))`, `minutesToday = floor(playSeconds[today] / 60)`, `dailyLimitMin = child.dailyLimitMin`; loop: `nextStep` -> mount shell -> `module.run` -> `applyStepResult` (a returned `checkpoint` is appended to `child.checkpoints` with today's day) -> `persist()` -> add active seconds to `playSeconds[today]` (counting only while `document.visibilityState === 'visible'`) -> `showNext` -> repeat; on `end` reached after at least one step of this run, show the end screen with unshown stickers then `markStickersShown` + `persist()` (an `end` before any step returns to the map, which speaks the matching `map.*` line); back during a step aborts the `AbortController`, calls `audio.stop()`, saves nothing for that step and returns to the map. A failed `persist()` sets `app.storageWarning = true` and play continues. Warm-up steps are preceded by `warmup.intro`, practice by `practice.intro`, checkpoints by `checkpoint.intro`.
- Produces (`map.ts`): `mapLayout(count: number, width: number): { x: number; y: number }[]` (zigzag bottom-to-top, nodes 76px, next node 92px, inside `16..width-16-92`); `mountMap(root, deps)` per `Map.dc.html`: header with the child photo (52px; long press 3000 ms -> gate -> parent page) and the sticker count; path drawn as SVG; nodes from `expandPath`: done (green, white letter, star badge), next (orange `#FFA928`, glow animation off under reduced motion, child photo bubble beside it; `aria-label` "התחנה הבאה: האות X"), future (white, grey), checkpoint (rounded square with a flag); `sittingStatus` decides the next node: `ready` glows and starts the runner on tap, `tomorrow` / `limit` / `complete` shows a moon icon and speaks `map.tomorrow` / `map.limit` / `map.complete` on tap; on open speaks the child's name (own line, live voice) then `map.next` (queued) when ready. Caption box at the bottom shows the spoken text.
- Produces (`end.ts`): `mountEnd(root, deps: { childName: string; stickers: string[]; onMap(): void })` per `End.dc.html` (night background, star sticker with the letter or a flag, pop animation off under reduced motion, speaks `end.great`, the name, `end.bye`, "to map" button).

- [ ] **Step 1: Write the failing tests** (runner with a fake registry of scripted steps, `memoryKV`, fake audio recording `stop()`)

```ts
it('records evidence and saves after each step', async () => { const t = harness({ results: [okAnswers(['מ/name'])] }); await t.runOneStep(); expect(t.saved().children[0].mastery['מ/name'].attempts.length).toBe(1); });
it('back during a step stops audio and saves nothing', async () => { const t = harness({ hangStep: true }); t.startStep(); t.router.back(); await tick(); expect(t.audio.stopped).toBe(true); expect(t.saveCount()).toBe(0); expect(t.router.current()).toBe('map'); });
it('save failure sets storageWarning and play continues', async () => { const t = harness({ throwingKV: true, results: [ok(), ok()] }); await t.runOneStep(); expect(t.app.storageWarning).toBe(true); await t.runOneStep(); expect(t.stepsRun).toBe(2); });
it('next fires once on a double tap', async () => { const t = harness({ results: [ok(), ok()] }); await t.runOneStep(); t.tapNext(); t.tapNext(); await tick(); expect(t.stepsStarted).toBe(2); });
it('end screen marks stickers shown only after it is displayed', async () => { const t = harness({ finishUnit: true }); await t.runToEnd(); expect(t.saved().children[0].progress.stickers.every(s => s.shown)).toBe(true); });
// map.test.ts
it('layout keeps nodes inside the screen', () => mapLayout(8, 390).forEach(p => { expect(p.x).toBeGreaterThanOrEqual(16); expect(p.x).toBeLessThanOrEqual(390 - 16 - 92); }));
it('next node is labelled with its letter', () => expect(mountedMap(freshChild()).querySelector('[aria-label="התחנה הבאה: האות מ"]')).not.toBeNull());
it('sleeping node after the sitting is done', () => expect(mountedMap(childDoneToday()).querySelector('.node-next.sleeping')).not.toBeNull());
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/runner.test.ts tests/ui/map.test.ts` - Expected: FAIL.
- [ ] **Step 3: Implement** the modules.
- [ ] **Step 4: Verify** the tests PASS; `npm run build` exit 0; in `npm run dev` the map shows 8 nodes, tapping the next node runs placeholder steps through to the end screen and back to a sleeping map.

---

### Task 11: Choice steps - meet, find, sound-to-letter, first sound, check-point

**Files:**
- Create: `app/src/steps/choice.ts` (shared choice round), `app/src/steps/meet.ts`, `app/src/steps/find.ts`, `app/src/steps/soundPick.ts`, `app/src/steps/firstSound.ts`, `app/src/steps/checkpoint.ts`
- Modify: `app/src/steps/registry.ts`
- Test: `app/tests/steps/choice.test.ts`, `app/tests/steps/firstSound.test.ts` (happy-dom)

**Interfaces:**
- Consumes: `StepContext` / `StepModule` (Task 10), `chooseDistractors` (Task 5), `line` (Task 8).
- Produces (`choice.ts`): `runChoiceRound(ctx: StepContext, o: { item: ItemId; options: { id: UnitId; label: Node | string; aria: string }[]; correct: UnitId; ask: string; askRate?: number; right(): string; wrong(id: UnitId): string; kind: 'recall' | 'match'; layout: 'row' | 'grid2' | 'list' }): Promise<AnswerEvent | null>` - renders `pick-neutral` buttons, speaks `ask`; the first pick is the evidence (wrong -> `chose`); a wrong pick greys that option, speaks `wrong(id)` and lets the child try again; after 2 wrong picks the correct option pulses (hint); taps during feedback speech and any tap after the correct pick are ignored; taps outside the options are not evidence; returns `null` if aborted.
- Produces (step modules, all `StepModule`):
  - `meet` - per `Meet.dc.html`: 250px letter card, name with niqqud, picture word card (emoji + word with the first letter coloured), speaks `meet.line`; tapping the letter repeats; no answers; done after the line ends (next arrow).
  - `find` - per `Find.dc.html`: `rounds = params.rounds ?? profile.findRounds`, options = target + `chooseDistractors({ mode: 'look', n: profile.findChoices - 1, prefer: ['confusions','lookAlikes','taught'] })`, ask `find.ask`, wrong `find.wrong` (picked letter's name), item `<unit>/name`, kind `recall`, layout `row`, 100x130 cards, 72px letters.
  - `soundPick` - ask `soundPick.ask` at rate 0.75, options by `mode: 'sound'`, `profile.soundPickChoices`, item `<unit>/sound`, kind `recall`.
  - `firstSound` - per `FirstSound.dc.html`: shows the letter (84px card), `profile.firstSoundRounds` rounds, options = one of the letter's words + `pickFirstSoundOptions(...)` distractor words, layout `list` (104px rows: emoji + word in neutral ink), ask `firstSound.ask`, right `firstSound.right`, wrong `firstSound.wrong`, item `<unit>/sound`, kind `match` (the letter and the written words are on screen, so this is not counted as recall).
  - `checkpoint` - per `Checkpoint.dc.html`: header flag + "נקודת בדיקה" + one dot per question; for each item in `step.items`: kind `name` -> find-style question, kind `sound` -> soundPick-style question; `profile.checkpointChoices` options, prefer `['confusions','taught','lookAlikes']`; layout `grid2`; returns all first-try answers (the runner grades via `applyStepResult`).
- Produces (`firstSound.ts`): `pickFirstSoundOptions(target: string, pool: PictureWord[], n: number, sameSound: string[][], rng: Rng): PictureWord[]` - words whose first letter does not share a sound group with the target or with each other, and is not the target.

- [ ] **Step 1: Write the failing tests**

```ts
// choice.test.ts (happy-dom, fake audio that resolves immediately unless held)
it('first wrong pick is the evidence, with the chosen unit', async () => { const p = round({ correct: 'ב', options: ['כ','ב','ר'] }); tap('כ'); await feedbackDone(); tap('ב'); expect(await p).toMatchObject({ item: 'ב/name', ok: false, chose: 'כ' }); });
it('taps during feedback are ignored', async () => { const p = round({ correct: 'ב', options: ['כ','ב','ר'], holdSpeech: true }); tap('כ'); tap('ר'); tap('ר'); releaseSpeech(); tap('ב'); expect(spokenWrong()).toEqual(['כ']); expect((await p)!.chose).toBe('כ'); });
it('a correct first pick is ok', async () => { const p = round({ correct: 'ב', options: ['כ','ב','ר'] }); tap('ב'); expect(await p).toMatchObject({ ok: true }); });
it('all options share the neutral style', () => { round({ correct: 'ב', options: ['כ','ב','ר'] }); expect(new Set(optionButtons().map(b => b.className)).size).toBe(1); });
it('abort returns null and removes listeners', async () => { const ac = new AbortController(); const p = round({ correct: 'ב', options: ['כ','ב'], signal: ac.signal }); ac.abort(); expect(await p).toBeNull(); });
// firstSound.test.ts
it('distractor words never start with a same-sound letter', () => { for (let s = 0; s < 100; s++) pickFirstSoundOptions('ת', POOL_WITH_TET_AND_KAF_QOF, 2, SAME, createRng(s)).forEach(w => expect(['ט','ת']).not.toContain(w.first)); });
it('two distractor words never share a first sound', () => { for (let s = 0; s < 100; s++) { const [a, b] = pickFirstSoundOptions('מ', POOL_WITH_TET_AND_KAF_QOF, 2, SAME, createRng(s)); expect(SAME.some(g => g.includes(a.first) && g.includes(b.first))).toBe(false); } });
```

- [ ] **Step 2: Run** `npx vitest run tests/steps` - Expected: FAIL.
- [ ] **Step 3: Implement** the shared round and the five steps; register them.
- [ ] **Step 4: Verify** `npx vitest run tests/steps` PASS; `npm run build` exit 0; in `npm run dev` a fresh child goes meet -> find (3 cards, neutral) -> placeholder drive -> first sound -> placeholder game.

---

### Task 12: Drive the letter (tracing step)

**Files:**
- Create: `app/src/steps/road.ts` (pure tracking logic), `app/src/steps/drive.ts`
- Modify: `app/src/steps/registry.ts`
- Test: `app/tests/steps/road.test.ts`

**Interfaces:**
- Consumes: `StepContext` (Task 10), `LetterEntry.strokes` (Task 2), `profile.traceTolerance`.
- Produces (`road.ts`):
  ```ts
  type Pt = { x: number; y: number };
  interface RoadState { stroke: number; idx: number; holding: boolean; offRoad: boolean; done: boolean; slips: number }
  const ROAD = { SAMPLES: 40, LOOKAHEAD: 4, GRAB_EXTRA: 12, OFF_FACTOR: 1.6 };
  createRoad(): RoadState
  roadDown(s: RoadState, strokes: Pt[][], p: Pt, tol: number): RoadState  // holding only if p is within tol + GRAB_EXTRA of the car (strokes[stroke][idx])
  roadMove(s: RoadState, strokes: Pt[][], p: Pt, tol: number): RoadState  // while holding: advance to the farthest j in (idx, idx+LOOKAHEAD] with dist < tol; dist to the car > tol * OFF_FACTOR -> offRoad (slips+1 on entering), car stays; back within tol of the car -> offRoad false; idx >= SAMPLES-2 -> next stroke (idx 0, holding false) or done
  roadUp(s: RoadState): RoadState  // holding false; progress kept (the car waits)
  ```
- Produces (`drive.ts`, `StepModule` `drive`): per `Drive.dc.html` - green stage, the letter's strokes as a grey road (stroke width `2 * tol` in board units) on a 300x300 board scaled to the stage, white dashed centre line, yellow driven trail, green start flag at the current stroke's first point, chequered flag at the last stroke's end, a direction arrow at the car, the car rotated to the path tangent. Samples each stroke with `SVGPathElement.getPointAtLength` into `ROAD.SAMPLES` points. Speaks `drive.ask`, `drive.back` on entering offRoad (at most once per 4 s), `drive.next` on a new stroke, `drive.done` at the end. No restart button and no reset ever. Returns `{ outcome: 'done', answers: [], slips: state.slips }` (tracing is practice, not mastery evidence). Pointer events with `touch-action: none` on the board; the hit tests are symmetric (no handedness assumption).

- [ ] **Step 1: Write the failing tests** (a straight horizontal stroke `H` of 40 points from (200,100) to (80,100), right-to-left, and a second vertical stroke)

```ts
it('advances when the finger follows the road', () => { let s = roadDown(createRoad(), [H], H[0], 40); s = roadMove(s, [H], H[3], 40); expect(s.idx).toBe(3); });
it('cannot skip ahead more than 4 samples per move', () => { let s = roadDown(createRoad(), [H], H[0], 40); s = roadMove(s, [H], H[20], 40); expect(s.idx).toBe(0); });
it('lifting the finger keeps progress', () => { let s = roadDown(createRoad(), [H], H[0], 40); s = roadMove(s, [H], H[4], 40); s = roadUp(s); expect(s.idx).toBe(4); expect(s.holding).toBe(false); });
it('leaving the road flags offRoad, counts one slip and never resets', () => { let s = drivenTo(8); s = roadMove(s, [H], { x: H[8].x, y: 200 }, 40); s = roadMove(s, [H], { x: H[8].x, y: 210 }, 40); expect(s).toMatchObject({ offRoad: true, idx: 8, slips: 1 }); });
it('returning near the car resumes', () => { let s = offRoadAt(8); s = roadMove(s, [H], H[9], 40); expect(s).toMatchObject({ offRoad: false, idx: 9 }); });
it('grabbing far from the car is ignored', () => expect(roadDown(createRoad(), [H], H[30], 40).holding).toBe(false));
it('finishing the last stroke sets done', () => expect(driveAll([H, V]).done).toBe(true));
```

- [ ] **Step 2: Run** `npx vitest run tests/steps/road.test.ts` - Expected: FAIL.
- [ ] **Step 3: Implement** `road.ts` and `drive.ts`; register `drive`.
- [ ] **Step 4: Verify** the test PASSES; `npm run build` exit 0; in `npm run dev` the drive station shows the letter road, lifting the finger pauses, leaving the road says "חוזרים לכביש" without resetting.

---

### Task 13: Short games - plane, race, whack-a-mole, matching pairs

**Files:**
- Create: `app/src/steps/plane.ts`, `app/src/steps/race.ts`, `app/src/steps/mole.ts`, `app/src/steps/match.ts`
- Modify: `app/src/steps/registry.ts`
- Test: `app/tests/steps/race.test.ts`, `app/tests/steps/match.test.ts`

**Interfaces:**
- Consumes: `StepContext` (Task 10), `scatterSequence`, `chooseDistractors` (Task 5), `profile.plane/race/mole/match` (Task 3).
- Produces (all `StepModule`; target = `step.unitId`, item `<unit>/name`; DOM/CSS only, one rAF loop, transforms only, no canvas; balloons / discs / signs / cards are `pick-neutral`; the target is never shown as a sample; HUD slots fill with a star, never the letter):
  - `plane` - port of `planeGame` per `Plane.dc.html`: plane on the left, 84px up / down buttons plus drag, `profile.plane.lanes` rows; spawns follow `scatterSequence({ targets: remaining, others: max(remaining, 3) ... })` regenerated when targets are missed; balloons drift right-to-left over `travelSec`; a target touched -> pop, `good`, `ok recall`, letter name spoken; a wrong balloon touched -> it bumps away, `slips + 1`, no answer; ends after `targets` pops. Ask `plane.ask`.
  - `race` - pseudo-3D road per `Race.dc.html`: `project(z, lane, v)` positions discs; 3 lanes, 92px left / right buttons and swipe; car at the bottom; items approach over `travelSec`; target collected -> `ok recall`; wrong letter -> passes under the car, `slips + 1`; no timer, no loss; ends after `targets` collected. Ask `race.ask`.
    `project(z: number /*1 horizon .. 0 car*/, lane: number /*-1|0|1*/, v: { horizonY: number; bottomY: number; centerX: number; halfRoadBottom: number }): { x: number; y: number; scale: number }` with `q = (1 / (1 + 3z) - 0.25) / 0.75`, `y = horizonY + (bottomY - horizonY) * q`, `x = centerX + lane * halfRoadBottom * q * 0.66`, `scale = 0.25 + 0.75 * q`.
  - `mole` - port of `IMPL.mole`: `rows x cols` holes, signs in one font (Rubik 800), pops follow `scatterSequence({ lanes: rows*cols, sameGroup: same column })`, at most `maxUp` up at once, up / down times from the profile; tap on a target -> `ok recall`; tap on a wrong letter -> `ok: false, chose` (a deliberate pick) and `find.wrong` spoken; tap on an empty or down hole -> nothing. Ask `mole.ask`.
  - `match` - face-up pairs, all cards `pick-neutral`: `buildMatchRounds(target, lookAlike, distant: UnitId[], pairs: number, rng): UnitId[][]` -> round 1 = target + `pairs - 1` distant letters (not look-alikes of the target), each twice; round 2 = target + its first look-alike (`content.lookAlikes[target][0]`) + `pairs - 2` distant, each twice; shuffled. A matched target pair -> `ok match`; a mismatch involving the target -> `ok: false, kind match, chose: other`; mismatches between two non-targets -> nothing. Asks `match.ask1`, then `match.ask2` with the look-alike's name.

- [ ] **Step 1: Write the failing tests**

```ts
// race.test.ts
const v = { horizonY: 300, bottomY: 840, centerX: 195, halfRoadBottom: 195 };
it('horizon and car ends', () => { expect(project(1, 0, v)).toMatchObject({ y: 300, scale: 0.25 }); expect(project(0, 0, v)).toMatchObject({ y: 840, scale: 1 }); });
it('closer is lower and bigger', () => { const a = project(0.6, 1, v), b = project(0.3, 1, v); expect(b.y).toBeGreaterThan(a.y); expect(b.scale).toBeGreaterThan(a.scale); expect(Math.abs(b.x - 195)).toBeGreaterThan(Math.abs(a.x - 195)); });
// match.test.ts
it('round 2 adds the look-alike on purpose, every letter twice', () => { const [r1, r2] = buildMatchRounds('ב', 'כ', ['מ','ל','ש'], 3, createRng(1)); expect(r1.filter(x => x === 'ב').length).toBe(2); expect(r1).not.toContain('כ'); expect(r2.filter(x => x === 'כ').length).toBe(2); expect(r2.length).toBe(6); });
it('round 1 never holds a look-alike of the target', () => { for (let s = 0; s < 50; s++) expect(buildMatchRounds('ב', 'כ', ['מ','ל','ש','פ'].filter(x => !SIM_FIXTURE['ב'].includes(x)), 3, createRng(s))[0]).not.toContain('פ'); });
```

- [ ] **Step 2: Run** `npx vitest run tests/steps/race.test.ts tests/steps/match.test.ts` - Expected: FAIL.
- [ ] **Step 3: Implement** the four games (the caller passes `distant` = alphabet letters that are neither the target, its look-alikes, nor same-sound letters); register them.
- [ ] **Step 4: Verify** the tests PASS; `npm run build` exit 0; in `npm run dev` each game finishes for 3-5 without a timer, and a wrong balloon / race letter only bumps.

---

### Task 14: Parent page

**Files:**
- Create: `app/src/ui/screens/parent.ts`, `app/src/ui/parentText.ts`
- Test: `app/tests/ui/parentText.test.ts`, `app/tests/ui/parent.test.ts` (happy-dom)

**Interfaces:**
- Consumes: Tasks 4, 6, 7, 8, 9.
- Produces (`parentText.ts`, pure, parent-facing Hebrew, gender-neutral):
  - `weakLines(child: ChildRecord, c: LettersContent): string[]` - for each weak item: `"השם של <letter> עוד לא יציב"` / `"הצליל של <letter> עוד לא יציב"`; for each confusion >= 2: `"יש בלבול בין <letter> ל-<other>"`; empty -> `["אין כרגע נקודות חלשות"]`.
  - `lastCheckpointLine(child): string | null` - `"נקודת בדיקה אחרונה: <letters> - עברה (k מתוך n)"` or `"... - לא עברה, מתרגלים <letters>"`.
  - `letterGrid(child, c): { ch: string; status: 'known' | 'learning' | 'notYet' }[]` - all 22 letters in alphabet order, status by `unitStatus` (taught = its `meet` station done).
  - `playMinutes(child, today): { today: number; last7: { day: string; min: number }[] }`.
- Produces (`parent.ts`): `mountParent(root, deps)` per `Parent.dc.html`: header (photo, "<name>, גיל <age>", "בדרך לאות X · N דקות היום", close button), letters grid (8 columns, colours ok / next / `#E3E8F1`, legend "יודע/ת", "בלימוד", "עוד לא"), "מתרגלים עכשיו" (weak lines + last checkpoint line + checkpoint history list), time played (today + last 7 days), settings: daily limit select (15 / 20 / 30 / ללא הגבלה, default 20), voice volume and effects volume sliders (0-100, applied live via `setVoiceVolume` / `sfx.setVolume`, saved in `settings`), "פתיחת ישיבה נוספת היום" (sets `extraSittingDay = today`), "גיבוי לקובץ" (with an "include photo" checkbox, unchecked by default), "שחזור מקובץ" (file input; shows the child name and asks to confirm before `applyImport`), "תיקון גיל" (3-8 picker; sets `age = { years, setOn: today }`), "הוספת ילד", "איפוס התקדמות" and "מחיקת ילד" (each needs a second 3000 ms hold on a confirm button). Banners: `storageWarning` ("השמירה נכשלה - כדאי לגבות לקובץ") and voice status `none` ("לא נמצא קול עברי במכשיר. ...הגדרות > נגישות > המרת טקסט לדיבור"). Reached only through the gate.

- [ ] **Step 1: Write the failing tests**

```ts
it('weak lines name the item and the confusion', () => expect(weakLines(childWith({ wrong: 'ב/name', confusions: { 'ב/name': { 'כ': 2 } } }), C)).toEqual(['השם של ב עוד לא יציב', 'יש בלבול בין ב ל-כ']));
it('no weak items', () => expect(weakLines(freshKid, C)).toEqual(['אין כרגע נקודות חלשות']));
it('grid lists 22 letters, untaught ones notYet', () => { const g = letterGrid(freshKid, C); expect(g.length).toBe(22); expect(g.every(x => x.status === 'notYet')).toBe(true); });
it('play minutes for today and the last 7 days', () => expect(playMinutes(kidWithSeconds({ '2026-11-21': 600 }), '2026-11-21').today).toBe(10));
it('shows the no-voice notice', () => expect(mounted({ voice: 'none' }).textContent).toContain('לא נמצא קול עברי'));
it('export leaves the photo out by default', () => { const r = mounted({}); click(r, 'גיבוי לקובץ'); expect(JSON.parse(lastExport().text).child.photo).toBeNull(); });
it('delete needs the second hold', () => { vi.useFakeTimers(); const r = mounted({}); click(r, 'מחיקת ילד'); vi.advanceTimersByTime(2000); expect(saved().children.length).toBe(1); holdConfirm(r, 3000); expect(saved().children.length).toBe(0); });
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/parentText.test.ts tests/ui/parent.test.ts` - Expected: FAIL.
- [ ] **Step 3: Implement** both modules; wire the map's photo long press and the picker's add-child button to gate -> parent.
- [ ] **Step 4: Verify** the tests PASS; `npm run build` exit 0.

---

### Task 15: Wire the owner-checked content in (after the OWNER CHECK)

**Precondition:** the owner (or someone she named) has answered the Task 2 review. Do not start before.

**Files:**
- Modify: `app/content/letters-3-5.md`, `app/content/letters-3-5.json` (apply every correction; set `"reviewed": true`), `app/content/curriculum-letters.json` (unit order if the owner changed it)
- Modify: `app/src/content/index.ts` (import `letters-3-5.json`; `dev-fixture.json` stays for tests only)
- Create: `app/scripts/check-reviewed.ts`; add script `"build:apk": "node scripts/check-reviewed.ts && npm run lines && npm run build"`
- Test: `app/tests/content/content.test.ts` (extend)

**Interfaces:**
- Consumes: Task 2 schema, Task 3 curriculum, Task 8 `allSpokenLines`.
- Produces: `CONTENT` now the reviewed file; `content/spoken-lines.json` regenerated from it.

- [ ] **Step 1: Extend the failing test**

```ts
it('the app content is reviewed', () => expect(CONTENT.reviewed).toBe(true));
it('the app content is not the fixture', () => expect(CONTENT.fixture).toBeUndefined());
it('curriculum order matches the content order', () => expect(loadJson('content/curriculum-letters.json').units.map((u: any) => u.id)).toEqual(CONTENT.order));
```

- [ ] **Step 2: Run** `npx vitest run tests/content` - Expected: FAIL (`reviewed` false, fixture imported).
- [ ] **Step 3: Apply** the owner's corrections to the `.md` table and the JSON (keep them identical), set `reviewed: true`, switch `index.ts`, write `check-reviewed.ts` (exit 1 with a message unless `letters-3-5.json` has `reviewed: true` and `validateContent` returns no errors). If the owner changed the letter order, re-run the Task 2 order test assertions with the new order (update the expected array only, keep the look-alike / sound-alike assertions).
- [ ] **Step 4: Verify** `npm test` (whole suite) PASS; `npm run build:apk` exit 0; `content/spoken-lines.json` regenerated.

---

### Task 16: Android wrapper - new app, back button, backup bridge, photo chooser, voice volume; build the APK

**Files (in `D:\alfi-build\android-local`):**
- Modify: `gradle.properties` (`alfiWebDir=D:/alfi/app/dist`)
- Modify: `app/build.gradle` (`versionCode 2`, `versionName '0.2-path'`, `implementation 'androidx.core:core:1.13.1'`)
- Modify: `app/src/main/AndroidManifest.xml` (`android:allowBackup="false"`; FileProvider `${applicationId}.files` with `@xml/file_paths`; no CAMERA permission)
- Create: `app/src/main/res/xml/file_paths.xml` (`<cache-path name="photos" path="photos/"/>`)
- Modify: `app/src/main/java/com/raviv/alfi/local/MainActivity.java`
- Modify: `app/src/main/assets/bridge/tts-polyfill.js`

**Interfaces:**
- Consumes: `window.alfiBack(): 'handled' | 'exit'` (Task 9); `window.AlfiNative` calls from `src/platform/native.ts` (Task 7).
- Produces (Java, `@JavascriptInterface` on a new `AlfiNative` object):
  - `String readBackup()` - `files/alfi-backup.json`, else `files/alfi-backup.prev.json`, else `null`.
  - `boolean writeBackup(String json)` - write `alfi-backup.tmp`, rename the current file to `.prev`, rename tmp to `alfi-backup.json`.
  - `void exitApp()` - `finish()` on the UI thread.
  - `void exportFile(String name, String text)` - `ACTION_CREATE_DOCUMENT` (`application/json`, `EXTRA_TITLE name`), writes `text` as UTF-8 in `onActivityResult`.
  - TTS bridge: keep `speak(text, rate, pitch)`; add `speak2(String text, float rate, float pitch, float volume, String id)` (Bundle `KEY_PARAM_VOLUME`, `QUEUE_ADD`, utterance id `id`) and an `UtteranceProgressListener` whose `onDone` / `onError` run `window.__alfiTtsDone && __alfiTtsDone(id)` on the UI thread.
- Behaviour changes in `MainActivity`:
  - `onBackPressed`: evaluate `(window.alfiBack ? window.alfiBack() : <the existing tbBack/tbHome script>)`; finish only on `"exit"`.
  - `WebChromeClient.onShowFileChooser`: accept types containing `image` -> chooser of `ACTION_GET_CONTENT image/*` with an `ACTION_IMAGE_CAPTURE` initial intent writing to a FileProvider uri in `cache/photos/`; otherwise `ACTION_GET_CONTENT */*`; `onActivityResult` always calls the callback (null on cancel).
  - Zoom: `setSupportZoom(true)`, `setBuiltInZoomControls(true)`, `setDisplayZoomControls(false)`.
- Polyfill: utterances get an id; `speak` uses `AlfiTTS.speak2(text, rate, pitch, u.volume ?? 1, id)` when present (else the old `speak`), stores `u` by id, and `__alfiTtsDone(id)` calls `u.onend`. The old `D:\alfi\web` app keeps working with this polyfill.

- [ ] **Step 1: Build the web app** - from `D:\alfi\app`: `npm test` (all PASS) then `npm run build:apk` (exit 0).
- [ ] **Step 2: Apply** the wrapper changes above.
- [ ] **Step 3: Build** - PowerShell from `D:\alfi-build\android-local`: `$env:JAVA_HOME='D:\android-tools\jdk17'; $env:ANDROID_HOME='D:\android-tools\sdk'; & 'D:\android-tools\gradle-8.7\bin\gradle.bat' assembleDebug --no-daemon -q` - Expected: exit 0, `app\build\outputs\apk\debug\app-debug.apk` exists.
- [ ] **Step 4: Check the packaged assets** - `app\build\webassets\web\index.html` exists and references `./assets/`, and `app\build\webassets\web\fonts\rubik-hebrew.woff2` exists (the synced folder is the new dist, not `D:\alfi\web`).
- [ ] **Step 5: Deliver** - copy `app\build\outputs\apk\debug\app-debug.apk` to `D:\alfi-build\alfi-local.apk`; report its size. The controller sends it to the owner with a short test list: setup with camera and gallery photo, map, letter מ sitting end to end, back button in a station and on the map, parent gate (hold photo 3 s), "open another sitting today" to reach the check-point after three letters, export file, voice / effects volumes.
