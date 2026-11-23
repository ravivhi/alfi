# Alfi all 22 letters for ages 3-5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Content for the 16 missing Hebrew letters in the guided path, reviewed by the owner in one document, then the
path runs all 22 letters.

**Architecture:** Content-only extension of `app/content/letters-3-5.json` (same `LetterEntry` shape as the six), with
the validator and content tests moved from "six letters" to "the full alphabet". The review draft `letters-3-5.md`
mirrors the JSON (a test enforces it). A static stroke preview page draws every letter. After the owner approves, the
curriculum lists all 22 units and the app runs on the reviewed content.

**Tech Stack:** TypeScript 5.8, Vite 6, Vitest 3 (happy-dom), JSON content; Android wrapper `android-local` (Gradle).

**Spec:** `docs/superpowers/specs/2026-11-23-alfi-all-letters-3-5-design.md` (parent: `2026-11-21-alfi-guided-path-design.md`).

## Global Constraints

- Work in `D:\alfi-main` (branch `main`). **No commit or push without the owner's explicit go**; every "Commit" step
  below means "stage and ask". `web/` is not touched (a push to `main` that changes `web/` publishes the live site).
- Band `3-5` only. No final letters (ך ם ן ף ץ) anywhere in a picture word or distractor.
- Every emoji has `emojiUnicode <= 9` (Android 7). Look the version up in the Unicode emoji list
  (unicode.org/emoji/charts/emoji-versions.html), never from memory; 🫏 🪟 🫒 🪰 🫙 are all above 9.
- 3-5 picture words per letter; `first` is the letter; `plain`, `letters`, `vowels` are derived with `plainOf` /
  `deriveVowels` from `src/content/schema.ts`, never typed by hand.
- Sounds: a kamatz syllable as for the six (מָה). ב כ פ with dagesh (b k p), ש with shin dot, ו as v; א and ע both
  `"אָ"` / `"עָ"` spoken as "a" (they are a `sameSound` pair).
- Strokes: 1-3 SVG paths per letter on the 300 x 300 board, each starting with `M`, coordinates within 0..300, in
  kindergarten writing order and direction (right-to-left where the stroke runs horizontally).
- Order: the six stay first (מ ל ב ת י צ); the 16 follow. No two letters of the same group of three (positions 1-3,
  4-6, ...) are look-alikes (`lookAlikes`, either direction) or sound-alikes (`sameSound`).
- Kept old words come from `web/index.html` `const WORDS=`. Every replacement is listed in the draft with the old word
  and the reason.
- All texts NFC. Files keep their line endings (JSON/TS LF as today, md as today).

## Review Focus

1. A kept old word whose emoji is above Unicode 9 or that contains a final letter (גשם, היפופוטם, תנין...): the content
   test rejects it (existing tests; Task 2 must replace these words).
2. A word whose first sound is not the taught sound (a soft כ/פ/ב, a sin ש, a vav read as "u"): Task 2 test
   `first letter carries the taught sound mark`.
3. A look-alike or sound-alike pair inside one check-point group: Task 1 validator rule + test.
4. A stroke point outside the board, or a horizontal stroke drawn left-to-right: Task 3 validator rule (bounds) and the
   preview page (direction, checked by the owner).
5. 22 is not a multiple of 3: the path must still end correctly (last group = letter 22 alone, 7 check-points after
   units 3..21). Task 5 curriculum test pins it.

---

### Task 1: Validator and tests for the full alphabet

**Files:**
- Modify: `app/src/content/schema.ts` (`validateContent`, lines ~129-143)
- Modify: `app/tests/content/content.test.ts`

**Interfaces:**
- Produces: `validateContent(c)` accepting `order` = the 22 letters (each once); `GROUP = 3` exported from
  `schema.ts` as `CHECKPOINT_GROUP`.

- [ ] **Step 1: Write the failing tests** in `content.test.ts` (file-level block, for both JSON files):
  - replace `has six letters in the proposed order` with `starts with the six and lists all 22 letters once`:
    `expect(c.order.slice(0, 6)).toEqual(['מ','ל','ב','ת','י','צ']); expect([...c.order].sort()).toEqual([...'אבגדהוזחטיכלמנסעפצקרשת'].sort())`
  - replace `no two of the six are look-alikes or sound-alikes` with `no look-alike or sound-alike pair in one group of three`
    (groups `c.order.slice(i, i + 3)` for i = 0, 3, ...; same two assertions as today, both directions).
  - in `validateContent catches errors`: `a look-alike pair in one group` (swap order positions so ב and כ share a group
    -> errors), `a stroke point outside the board` (`'M 10 10 L 320 10'` -> errors).
- [ ] **Step 2: Run** `npm test -- tests/content` - Expected: FAIL (order has 6 letters; new rules missing).
- [ ] **Step 3: Implement in `validateContent`:** order must be exactly the 22 alphabet letters, each once; the group rule
  (both `lookAlikes` directions and `sameSound`); stroke numbers within 0..300; drop the `taken` rule for distractors
  (with every letter on the path it rejects every word; `pickFirstSoundOptions` already skips the target and its
  sound-alikes) but keep `distractorWords >= 10` and `checkWord`.
- [ ] **Step 4: Run** `npm test -- tests/content` - Expected: the new `catches errors` tests PASS; the file-level tests
  still FAIL until Task 2-3 land the content (the suite is green at the end of Task 3).

### Task 2: Order, sounds and picture words for the 16 letters

**Files:**
- Modify: `app/content/letters-3-5.json` (`order`, `letters`), `app/content/dev-fixture.json` (kept equal to the draft
  plus `"fixture": true`, as the test demands)
- Create: `app/scripts/word-meta.ts` (dev helper: reads a list of `{word, emoji, emojiUnicode}` and prints full
  `PictureWord` objects using `plainOf` / `deriveVowels`; run with `node scripts/word-meta.ts <file>`)
- Test: `app/tests/content/content.test.ts`

**Interfaces:**
- Consumes: Task 1 validator.
- Produces: `letters[L]` for the 16 letters with `glyph`, `soundSay`, `words` (strokes come in Task 3; until then each
  letter carries the placeholder `["M 150 40 L 150 260"]` so the validator runs).

- [ ] **Step 1: Write the failing test** `first letter carries the taught sound mark`: for every word, if `first` is ב כ פ
  the first cluster has a dagesh (U+05BC); if ש it has the shin dot (U+05C1); if ו the first cluster has no holam/shuruk mark.
- [ ] **Step 2: Run** `npm test -- tests/content` - Expected: FAIL (16 letters missing).
- [ ] **Step 3: Author the content.** Order: propose the 16 after צ under the group rule (write the order, then let the
  test check it). Sounds per Global Constraints. Words: start from the old `WORDS` row of each letter; keep a word only if
  a 3-5 year old knows it, the emoji shows exactly it, it has no final letter, its emoji is <= 9 and its first sound is
  the taught one; replace the rest in the same slot (vowelized). Keep a replacements list (letter, old, new, reason) for
  Task 4. Generate the metadata with `scripts/word-meta.ts`; copy the result into both JSON files.
- [ ] **Step 4: Run** `npm test -- tests/content` - Expected: all pass except the md-equality block (Task 4).

### Task 3: Strokes and the stroke preview page

**Files:**
- Modify: `app/content/letters-3-5.json`, `app/content/dev-fixture.json` (`strokes` of the 16 letters)
- Create: `app/content/strokes-preview.html` (static, no build step: inline script reads `letters-3-5.json` via
  `fetch` when served by `npm run dev`, draws each letter's strokes on a 300 x 300 SVG with the glyph faint behind,
  stroke number at each start point and an arrow at each end, grid of all 22 letters)

**Interfaces:**
- Consumes: the `letters` entries from Task 2.

- [ ] **Step 1:** Replace each placeholder with 1-3 paths in writing order/direction, matching the glyph's shape in
  Rubik (the app font) as the six do; reuse the six as the style reference.
- [ ] **Step 2: Run** `npm test -- tests/content` - Expected: all pass except the md-equality block.
- [ ] **Step 3:** Open `http://localhost:5173/content/strokes-preview.html` (`npm run dev`), check every letter by eye:
  numbering, direction, no stroke outside the glyph.

### Task 4: The review draft for the owner

**Files:**
- Modify: `app/content/letters-3-5.md`

- [ ] **Step 1: Run** `npm test -- tests/content` - Expected: FAIL in `letters-3-5.md (the owner table) equals the JSON`.
- [ ] **Step 2:** Extend the draft in the existing format: the order line `**<22 letters>**` with the check-point
  groups, a section per new letter (sound line `צליל שהקול אומר: **...**`, word rows
  `| word | plain | emoji | unicode | first | letters |`, strokes in backticks), a "words replaced" table (letter, old
  word, new word, reason), the review questions updated (order, words, sounds - especially א/ע "אָ", strokes via
  `strokes-preview.html`). Hebrew, gender-neutral, as the existing draft.
- [ ] **Step 3: Run** `npm test` and `npm run typecheck` - Expected: all PASS.
- [ ] **Step 4: Commit** (ask the owner): `content: letters for all 22 letters (draft for review)`.
- [ ] **Step 5: OWNER CHECK** - hand over the draft and the preview page; apply her corrections, rerun Step 3.

### Task 5: Switch-over after the owner's approval

**Files:**
- Modify: `app/content/curriculum-letters.json` (`units`: the 22 letters in the approved order)
- Modify: `app/tests/engine/curriculum.test.ts` (6-unit expectations)
- Modify: `app/content/letters-3-5.json` (`reviewed: true`), `app/src/content/index.ts` (import `letters-3-5.json`),
  `app/tests/content/content.test.ts` (fixture-flag block: the app runs on the reviewed draft)
- Regenerate: `app/content/spoken-lines.json` (`npm run lines`)

- [ ] **Step 1: Write the failing test** `expands to 22 units and 7 checkpoints`: ids are units in order with `cp1`..`cp7`
  after units 3, 6, ..., 21 and unit 22 last; `units.map(n => n.stations![5].step)` follows the game rotation from
  `plane`.
- [ ] **Step 2: Run** `npm test -- tests/engine/curriculum.test.ts` - Expected: FAIL.
- [ ] **Step 3:** Update `units`, flip `reviewed`, point `index.ts` at the draft, update the fixture-flag tests
  (`the app runs on the reviewed content`: `CONTENT.reviewed === true`), run `npm run lines`.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build` - Expected: PASS; `dist/` built.
- [ ] **Step 5:** Build the APK from `android-local` (PowerShell: `JAVA_HOME=D:\android-tools\jdk17`,
  `ANDROID_HOME=D:\android-tools\sdk`, `gradle assembleDebug --no-daemon`), copy to `D:\alfi-build\alfi-local.apk`,
  give the owner the path.
- [ ] **Step 6: Commit** (ask the owner): `feat: guided path runs all 22 letters for ages 3-5`.

## Open for the owner at hand-over

- The dev fixture mirrors the draft (test-enforced), so after Task 4 the app already holds the 22-letter draft, as it
  held the unreviewed six; the path offers them once `curriculum-letters.json` lists 22 units (Task 5 Steps 1-2 and the
  `units` part of Step 3, without flipping `reviewed`). Owner decides: a test APK with the unreviewed draft before her
  review, or only after Task 5.
