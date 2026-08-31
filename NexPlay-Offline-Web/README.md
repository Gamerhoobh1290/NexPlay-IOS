# NexPlay Offline Web

This is a standalone offline web edition of NexPlay. It is separate from the original NexPlay project and is designed to keep working when Wi-Fi is off.

## Run

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:5177/
```

You can also open `index.html` directly, but the local server is preferred because it enables the service worker and installable web-app behavior.

## Desktop Build

```powershell
npm run make:icon
npm run dist:win
```

Build outputs are written to `dist-installer/`:

- `NexPlay Offline Setup 1.0.0 x64.exe`: Windows installer.
- `NexPlay Offline Portable 1.0.0 x64.exe`: portable executable.
- `win-unpacked/NexPlay Offline.exe`: unpacked executable for smoke testing.

The app icon is generated from the original NexPlay icon by `tools/create-offline-icon.ps1` and written to `assets/nexplay-offline-icon.ico`.

## Offline Behavior

- CDN libraries are vendored locally in `vendor/`.
- The service worker caches the app shell for repeat offline launches.
- Trusted cover and lyrics lookups are allowed while online, then cached for future offline use.
- Album art from iTunes/Deezer is fetched one track at a time in a low-priority background queue and saved into track metadata as local image data when possible, so imports stay responsive.
- Lyrics from LRCLIB and lyrics.ovh are saved into the offline lyrics cache after a successful lookup.
- Other remote fetch, XHR, JSONP script injection, iframes, remote images, and remote links are blocked by the offline guard.
- Online Music, Online Videos, YouTube playlist import, telemetry, Supabase sync, and update/proxy endpoints remain disabled.
- Local audio/video import, playlists, queue, history, stats, NotyPad, backups, and local app state remain local to the browser.

## Files

- `NexPlay.html` and `NexPlay.mobile.html`: offline-patched copies of the NexPlay web shell.
- `offline/offline-mode.js`: network guard and offline route handling.
- `offline/offline-mode.css`: blocked-surface styles.
- `sw.js`: offline-first service worker.
- `tools/offline-server.mjs`: dependency-free local static server.
