# Contributing to אלפי

Thanks for helping! Anything that lands on `main` goes live at https://ravivh.com/alfi/ and in the Android app automatically within 1–2 minutes, so **test before you push**.

## How to contribute

**Collaborators** (added to the repo): push directly to `main`. Test locally first (step 3 below). For bigger changes, a branch + pull request is still welcome.

**Everyone else:**

1. **Fork** this repo.
2. Make your changes in `web/`.
3. Test locally:
   ```
   cd web
   npx serve .          # or: python -m http.server 8000
   ```
   Open the printed URL. Check on a phone-sized window too (DevTools → device toolbar).
4. Open a **Pull Request** to `main` describing what changed and why.
5. After review and merge, it deploys automatically in about 1–2 minutes.

## Where things are

| Path | What |
|---|---|
| `web/index.html` | The whole game: HTML, CSS and JS in one file |
| `web/sw.js` | Service worker (offline support) |
| `web/manifest.json`, `web/icons/`, `web/fonts/` | PWA manifest, icons, bundled Rubik font |
| `android/` | Android (TWA) wrapper, maintained by the owner, please don't change it |
| `play-assets/` | Google Play listing images |

## Rules

- **Hebrew UI text**, right-to-left. Keep new strings in Hebrew.
- **Vanilla JS/CSS only**: no frameworks, no build step, no external CDNs (the game must work fully offline).
- **Kid-friendly**: the audience is ages 3–8. No ads, links out, data collection, or tracking of any kind (the Play listing declares no data collected).
- **Bump the cache version** in `web/sw.js` (`const CACHE = 'alfi-vN'`) whenever you change `index.html`, icons, fonts or the manifest.
- Keep it working on small phone screens.

## You don't need to

- Rebuild or publish the Android app. It loads the website, so merged web changes show up in the app on its next launch.
- Touch `.well-known/assetlinks.json`. It lives in another repo.
