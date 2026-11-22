# Alfi guided path - preview 0.7 (test branch)

This branch adds a **new version of Alfi built around one guided path**, next to the current game. Nothing in `web/`
(the live game) changes, and `main` is untouched. It is here so others can try it and report back.

## What it is

Today's Alfi is a menu of letter games. The new app takes the menu away: a parent sets the child up once, and the child
follows **one path on a map**: tap the glowing station, the guide speaks, play. The path remembers what the child knows,
brings weak letters back for practice, and checks earlier letters before moving on.

- **Setup:** child's name, age (3-5 or 6-8) and a photo. Several children can share a phone.
- **Each letter (unit) has 10 stations:** meet the letter, find it, drive on the letter (tracing), paint the letter,
  first sound, then five games: balloon plane, 3D letter race, whack-a-mole, matching pairs, dino jump.
- **Check-points** after units test earlier letters; practice and review sittings come back to weak ones.
- **Parent page:** hold the child's photo at the top of the map for 3 seconds (a ring fills while you hold). It shows
  progress, settings (voice and game-sound volume), backup / restore and the children list.
- **Content:** the first 6 letters (מ ל ב ת י צ), ages 3-5. The Hebrew spoken lines are a draft still being checked,
  and they are spoken by the device's Hebrew voice; recorded clips come later.
- The full design is in `docs/superpowers/specs/2026-11-21-alfi-guided-path-design.md`. The build plans are in
  `docs/superpowers/plans/`.

## How to try it

### In a browser (quickest)

Needs Node 20+.

```
cd app
npm install
npm run dev
```

Open the address it prints (for example http://localhost:5173), ideally in Chrome's phone view (F12, toggle device
toolbar). Speech uses the browser's Hebrew voice: Edge has one built in, and Chrome on Windows needs the Hebrew language
pack.

### On an Android phone

The APK is a debug build that installs **next to** the Play Store app (its own id, `com.raviv.alfi.local`); it does not
replace it. Ask for `alfi-preview-0.7.apk`, or build it:

1. `cd app`, `npm install`, `npm run build` (this writes `app/dist`).
2. Install JDK 17, the Android SDK (platform 34) and Gradle 8.7. Set `JAVA_HOME` and `ANDROID_HOME`.
3. `cd android-local`, then `gradle assembleDebug`. The APK is `android-local/app/build/outputs/apk/debug/app-debug.apk`.

The wrapper loads the game from inside the APK (no network), speaks with the phone's offline Hebrew voice, and gives the
game the phone's back button, the photo picker and backup files.

After installing, check the small version label in a corner of the map (or at the bottom of the parent page): it should
say **0.7-preview**.

## What to test, and what we want to hear

- Can a parent set a child up without help? Can the child (3-5) go through the path alone, without reading?
- Is each game too hard, too easy or unclear? Do the success and "try again" windows feel right?
- Does the parent page open reliably with the 3-second hold, and are its numbers understandable?
- Anything that freezes, gets stuck, or loses progress. Please note the phone model and the version label.

## Known issues and open items

- **Paint the letter comes up only once per letter** (right after "drive on the letter"), and never in practice or
  review sittings. A child who already had progress before 0.7 will not see it until the next new letter (saved
  progress counts stations by position, so the new station took the place of a finished one). How often it should come
  up is still being decided.
- The Hebrew lines are a draft (owner check pending); some words may change. Recorded voice clips are not in yet.
- Small items still open: a fall in the dino game is about 15% slower than the old game; leaving a game mid-level does
  not remember the level; the hold ring shows on the map photo only.

## What changed in the repo

| Path | What |
|---|---|
| `app/` | The new app: TypeScript + Vite, no runtime dependencies and no network at runtime. `src/engine` holds the path logic (curriculum, planner, mastery, check-points), `src/steps` the stations and games, `src/ui` the screens, `src/audio` the voice, sounds and dino music, `src/store` saving and backup, and `content/` the letters and spoken lines. |
| `app/tests/` | 539 unit tests (Vitest + happy-dom). Run `npm test`, `npm run typecheck` and `npm run build` in `app/`. All three pass on this commit. |
| `android-local/` | The Android wrapper for the new app (WebView, back button, backup and photo bridge, offline Hebrew voice). Source only: no build output, APK or keys. |
| `docs/superpowers/` | Design and plans. |

`web/`, `android/` (the Play Store wrapper) and `play-assets/` are unchanged.
