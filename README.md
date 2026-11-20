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

Pushing to `main` does **not** publish anything by itself. The owner reviews the changes and then clicks **Run workflow** on [Sync alfi](https://github.com/ravivhi/guessingGame/actions/workflows/sync-alfi.yml) in [ravivhi/guessingGame](https://github.com/ravivhi/guessingGame). That pulls `web/` into its `alfi/` folder, and its GitHub Pages serves ravivh.com, live within a couple of minutes.

Before publishing, check what changed since the last sync: the latest "alfi: sync ravivhi/alfi@<sha>" commit in guessingGame names the alfi commit it was synced from.

This repo deliberately has no credentials for guessingGame, so collaborators here can only change the alfi game.

**Edit alfi here, never in guessingGame/alfi/.** That folder is overwritten on every deploy.

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
- `.well-known/assetlinks.json` lives at the root of ravivh.com, so in guessingGame, not here.
