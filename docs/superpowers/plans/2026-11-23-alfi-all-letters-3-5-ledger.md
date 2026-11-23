# SDD ledger — plan: docs/superpowers/plans/2026-11-23-alfi-all-letters-3-5.md
Pre-flight: T2 consumes T1 validator (order 22, group rule, bounds); T3 replaces T2 placeholder strokes; T5 consumes approved order. No conflicts.
Ruling: ledger kept next to the plan, not in .superpowers — owner rule (no .superpowers folder) — none.
Ruling: work on main without commits — owner approved plan saying D:\alfi-main main, no commits without her go — a stray change would sit uncommitted on main.
Task 1: complete (uncommitted, tests: vitest tests/content -> 25 pass; 4 file-level fails expected until Task 3 per plan)
Ruling: owner switched execution to a dedicated agent mid-Task 2 ("start AN AGENT. DO NOT DO IT HERE YOURSELF") — Task 2 onward run by one background agent; the session only coordinates — none.
Task 2: in progress (sound-mark guard test added; proposed order of the 16: א ס ק | נ ד פ | ה ע ו | ג ש כ | ח ז ט | ר, no group conflicts).
Ruling: order of the 16 refined to א ס ר | נ ד ק | פ ש ה | ו ג כ | ע ח ז | ט — common kid-friendly letters (ר ק פ) earlier, ט (rare, sounds like ת) alone at the end; group rule holds (validator) — owner reorders in review, only order lines move.
Ruling: א and ע picture words start with an "a" vowel (patach / kamatz / hataf-patach), since both teach "אָ"/"עָ" — a word read "o"/"u"/"e" would teach another first sound (אוטובוס, עוגה, עץ replaced) — ע keeps 4 words.
Ruling: emojiUnicode = Unicode age of the base code point (UCD DerivedAge.txt, fetched), cross-checked with the unicode.org emoji-versions chart (all dated <= 2016) — same convention as the six (✈️ 1.1, 🕊️ 7) — a mislabeled version only misleads the draft; the <= 9 bound still holds.
Ruling: no weak filler words — ה ר ע keep 4, ו ז keep 3 where no known, final-free, <= Unicode 9 word fits — less variety for those letters.
Ruling: ו words are thin (וֶרֶד, וִילָה 🏡, וִי ✔️); the last two flagged for the owner in the draft — she may swap them.
Ruling: ktiv male with shuruk for סוּכָּרִיָּה / קוּבִּיָּה so the plain form (aria label) reads as the common spelling — none, both spellings are standard.
Ruling: sound syllables for ג ד carry a dagesh (גָּה, דָּה), as תָּה in the six; ש = שָׁה, ו = וָה, א = אָ, ע = עָ — TTS may read a syllable differently; owner checks by ear.
Task 2: complete (uncommitted; scripts/word-meta.ts added, node-shim declares process; 16 letters with words + placeholder strokes in both JSON files; vitest tests/content -> 28 pass, 3 md-equality fails expected until Task 4).
Ruling: stroke direction — a roof that turns into a down stroke starts at its left end (as ב ת in the six); bases and stand-alone top bars (ד ז) run right to left per the plan's rule — owner may teach ד/ז bars left to right; flagged in the draft, one path each to flip.
Ruling: ש starts top-right (down, bottom right-to-left, up the left side), so its bottom runs right to left; ט keeps the old game's start at the inner curl — both go up the left side; flagged in the draft — owner may prefer another start.
Ruling: strokes fitted to the Rubik glyph rendered from app/public/fonts (fontTools + PIL, letter body y 60..240, centred at x 150, same fit as the six); stroke/glyph width ratio 0.75-1.02 (the six: 0.82-1.08); renders in D:/alfi-build/new16a.png / new16b.png — a stem a few units off centre only shifts the road.
Ruling: strokes-preview.html checked headless (happy-dom: 22 cards, 37 strokes, 0 errors) and served by vite (page, JSON, font 200) — not viewed in a browser; the owner's eye check stays the gate.
Task 3: complete (uncommitted; 16 letters' strokes in both JSON files, app/content/strokes-preview.html; vitest tests/content -> 28 pass, 3 md-equality fails expected until Task 4).
Ruling: draft intro made gender-neutral ("רק אחרי אישור" instead of "אחרי שתאשרי") and sections renumbered (3 = replaced words, 4 distractors, 5 alphabet, 6 lines) — plan asks for gender-neutral Hebrew — none, wording only.
Ruling: map.complete line ("... עוד אותיות בקרוב!") left unchanged and raised as review question 9 — changing spoken lines is outside Tasks 2-4 — the line is misleading once 22 letters run, until the owner answers.
Task 4 Steps 1-3: complete (uncommitted; letters-3-5.md extended: order + 8 groups, 16 letter sections, replaced-words table (27 rows), review questions updated; npx vitest run -> 43 files / 560 tests pass; npm run typecheck -> exit 0). Steps 4-5 (commit, owner check) and Task 5 wait for the owner.
Final: fixed owner decision for ז זֵר 💐 (mis-cue with פרחים) — md review question 2 — tests/content 31/31
Final: fixed owner decision for ו וִילָה 🏡 (reads as בית, clashes with ב) — md review question 2 — tests/content 31/31
Final: fixed gender-neutral wording (הילד -> הילדים, 3 places) — md wording — tests/content 31/31
Final: minor (deferred): ח stroke 2 start badge overlaps stroke 1 (start ח stroke 2 at M 90 66)
Final: minor (deferred): ו sound-mark test misses holam haser U+05BA
Final: minor (deferred): no test for the א/ע words start with an "a" vowel ruling
Final: minor (deferred): stroke bounds check misses lowercase relative SVG commands
Final: minor (deferred): טֶלֶוִיזְיָה plain derives as טלויזיה (standard טלוויזיה)
Final: minor (deferred): דֶּגֶל 🚩 could be 🇮🇱
Task 5 (partial, test APK): units 22 in content order (curriculum-letters.json), curriculum test 22 units / cp1..cp7 / unit 22 last; reviewed stays false, index.ts still on dev-fixture; spoken-lines regenerated (653); tests 560/560, typecheck + build pass; APK D:\alfi-build\alfi-local-0.9-draft22.apk (versionName still 0.8-preview)
Ruling: tests whose assumption was only the old count follow the curriculum: pathHarness allDone counts its sittings by a dry run; map/boot 29 nodes, 7 check-points; planner cp2 no longer completes the path and the 7th letter follows; parent-page "outside the path" case moved to parentText with a 6-unit curriculum (with 22 units no grid letter is outside the path); planner outside-the-path letter is now the final form ך
Task 4 owner decisions (pre-review test APK b): ז זֵר 💐 -> זִיקּוּק 🎆 (U+1F386, Unicode 6.0); ו וִילָה 🏡 removed, וֶסְפָּה 🛵 added (U+1F6F5, Unicode 9.0); ו = וֶרֶד וִי וֶסְפָּה; both JSON files + md (rows, replaced-words table, review question 2 marked decided); spoken-lines regenerated (653); tests 560/560, typecheck + build pass; APK D:\alfi-build\alfi-local-0.9-draft22b.apk
Ruling: זִיקּוּק kept as the owner wrote it (ktiv male with niqqud, yod after hiriq, dagesh in ק), the common spelling in vowelized children's text; the Academy niqqud spelling without the yod is זִקּוּק
Task 5: complete (uncommitted; letters-3-5.json + dev-fixture.json reviewed: true, index.ts imports letters-3-5.json, fixture-flag tests: the app runs on the reviewed content (failed first, then passed); spoken-lines regenerated (653); version 0.9 (package.json 0.9.0, APK versionName 0.9 / versionCode 9, native.test.ts); npm test -> 43 files / 560 tests pass, typecheck + build pass; APK D:\alfi-build\alfi-local-0.9.apk (2188784 bytes))
