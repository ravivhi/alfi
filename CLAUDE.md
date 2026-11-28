# אלפי (Alfi) - Hebrew letters game

A Hebrew letters game for kids aged 3–8. It is live at ravivh.com/alfi. README.md and CONTRIBUTING.md have the full details.

- `web/` is the live game. `web/index.html` holds all of its HTML, CSS and JS. Every push to `main` that changes `web/` goes live within minutes, on the site and in the Android app.
- `app/` is the new guided-path version (Vite + TypeScript, still a preview, not published). See PREVIEW-NOTES.md.
- `android/` is the Android app (TWA). `play-assets/` holds the Google Play images.

## Rules

- **Bump the cache version in `web/sw.js`** (`const CACHE = 'alfi-vN'`, +1) whenever `index.html`, icons, fonts or the manifest change.
- **Vanilla JS/CSS only in `web/`:** no frameworks, no build step and no external CDNs, because it must work fully offline. UI text is in Hebrew, right to left.
- **Kid-safe:** no ads, no links out, no data collection or tracking.
- **Android:** build from PowerShell only (`cd android; bubblewrap build`). Never run `bubblewrap update`. Raise the version code only when `android/` changes. Web changes need no Android rebuild.
- **A collaborator also pushes to `main`.** Run `git pull --rebase` before committing. Force-push is blocked.
- **Other sessions' or collaborators' commits:** if one has a problem, fix it in a new commit on top; never rewrite it.

## Testing

- `web/`: serve it (`cd web; python -m http.server 8000`), open it in a browser at phone size, and check the changed screens with no console errors.
- `app/`: `cd app; npm test; npm run typecheck`.

## Auto-push

Every time you finish a request, run the tests that cover the change. If they pass, commit and push right away, without asking. If they fail, fix the problem first; never push something broken. Ask first only for something risky, like deleting data or a big rewrite.

## After every push: watch the GitHub checks

1. Find the run: `gh run list --repo ravivhi/alfi --commit $(git rev-parse HEAD)`. If none is listed yet, wait a few seconds and retry.
2. Watch it in the background: `gh run watch <id> --exit-status`.
3. When it finishes, tell the user whether it passed or failed.
4. If it failed: read `gh run view <id> --log-failed`, fix the problem, test, push again and watch the new run too.
5. If no run started, say so. The Pages deploy only runs when `web/` changes.
