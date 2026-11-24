# אלפי - אלופי האותיות

Hebrew letters game for kids (ages 3–8). Installable offline PWA, plus an Android (TWA) wrapper published on Google Play as `com.raviv.alfi`.

Live: https://ravivh.com/alfi/

Want to help? See [CONTRIBUTING.md](CONTRIBUTING.md).

## Layout

| Folder | What |
|---|---|
| `web/` | The game itself: `index.html` (everything), service worker, manifest, icons, fonts, privacy page |
| `android/` | Bubblewrap TWA project that wraps https://ravivh.com/alfi/ |
| `play-assets/` | Google Play store listing images |

## Deploying the web app

**Every push to `main` that changes `web/` goes live automatically**, within a couple of minutes, on the website and in the Android app. `.github/workflows/pages.yml` publishes `web/` with this repo's GitHub Pages. ravivh.com is the custom domain of [ravivhi/ravivhi.github.io](https://github.com/ravivhi/ravivhi.github.io), so this repo's own GitHub Pages site is served at ravivh.com/alfi/. No other repo is involved and no token is needed.

To publish again without a code change: Actions → "Publish to ravivh.com/alfi (Pages)" → Run workflow.

When you change cached files, bump the cache version in `web/sw.js` so installed copies update.

## Building the Android app

Run from **PowerShell** (under Git Bash, `gradlew.bat` is not found):

```powershell
cd android
bubblewrap build
```

Passwords: `~/signing-keys/alfi/signing-secrets.txt` (keystore and passwords are not in git, so back them up).

- **Do not run `bubblewrap update`.** It regenerates the project from Bubblewrap's template and resets `targetSdkVersion` to 35 and androidbrowserhelper to 2.6.2. Play requires API 36.
- For a new release, bump `versionCode`/`versionName` in `android/app/build.gradle` and `appVersionCode`/`appVersionName` in `android/twa-manifest.json`.
- `.well-known/assetlinks.json` lives at the root of ravivh.com, so in ravivhi/ravivhi.github.io, not here.
