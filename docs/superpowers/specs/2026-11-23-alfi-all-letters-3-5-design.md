# Alfi guided path - all 22 letters for ages 3-5 (short design)

## Intent

The guided path (preview 0.8) stops after six letters (מ ל ב ת י צ) because slice 1 only wrote content for those. The
owner wants the whole alphabet available for ages 3-5 now, so a child can walk the path from the first letter to the
last. The 3-5 goal in the guided-path design already says "all 22 letters"; this change fills in the content.

## Goals

- Content for the 16 missing letters (א ג ד ה ו ז ח ט כ נ ס ע פ ק ר ש), in the same shape as the six: spoken sound,
  picture words, stroke paths for the car road, look-alike and sound-alike data, place in the order.
- One review document for all 16 letters at once (owner's choice), plus a page that draws every letter's strokes with
  numbered arrows so direction and writing order can be checked by eye.
- After the owner approves: the app runs on the full 22-letter content and the path offers all 22 letters, with a
  check-point after every third letter.

## Non-goals

- Final letters (ך ם ן ף ץ), vowel marks, reading: the 6-8 path (guided-path design, section 7).
- New step types, games or engine changes.
- Recorded audio: waits for the Azure Speech key; the app keeps speaking live until then.
- Revisiting the six reviewed-pending letters' content, except where the new order or the look-alike data touch them.

## Anti-goals

- A word a 3-5 year old does not know, an emoji that shows something else, or a word whose first sound is not the
  letter's taught sound.
- Two look-alike or sound-alike letters inside the same group of three (the check-point would mix them).
- New content reaching the app before the owner approves it.

## Decisions

- **Format (only sensible approach):** extend `app/content/letters-3-5.json` and the review draft
  `app/content/letters-3-5.md` exactly as for the six letters. The app already reads this format. Dropped: a separate
  file per batch (owner reviews all at once) and strokes generated from a font (loses the kindergarten writing order).
- **Words (owner):** start from the old game's WORDS table (about 5 words per letter, `web/index.html`). Keep the words
  that fit ages 3-5; replace the weak ones in their slot, each replacement marked in the review draft with the old word
  and the reason (unknown to 3-5, emoji shows something else, first sound unclear). Every word carries the same
  metadata as the six (vowelized form, plain form, emoji and its Unicode version, letters, vowels, band).
- **Order (Claude's proposal, owner checks):** the 16 letters continue after צ. No look-alike pair (per `lookAlikes`)
  and no sound-alike pair (per `sameSound`) in the same group of three, and spread apart where possible.
- **Sounds (Claude's proposal, owner checks):** a kamatz syllable as for the six (מָה). ב כ פ hard (b, k, p), ש as
  shin, ו as v. א and ע both say "אָ"; they are already a same-sound pair, so no game asks the child to tell them apart
  by sound.
- **Strokes (Claude's proposal, owner checks):** hand-written SVG paths on the same 300 x 300 board, in writing order
  and direction as taught in kindergarten.
- **Switch-over (after approval):** `app/src/content/index.ts` moves from `dev-fixture.json` to `letters-3-5.json`
  (`reviewed: true`), and `app/content/curriculum-letters.json` `units` lists all 22 letters in the approved order.
  `spoken-lines.json` is regenerated (`npm run lines`); tests and build must pass; a new APK is built.

## Left to the builder

- The exact order, the replacement words, the sound spellings and the stroke paths (all reviewed by the owner).
- How the stroke preview page is made (a static HTML page next to the draft is enough).
- Test updates where tests assume six letters.
