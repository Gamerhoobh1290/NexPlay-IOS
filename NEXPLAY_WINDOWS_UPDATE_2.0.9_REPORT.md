# NexPlay Windows 2.0.9 Queue, Online Search, and Updater Report

Date: July 23, 2026  
Target: Installed Windows x64 desktop application  
Release: 2.0.9

## Executive summary

The reported queue and Online Music search failures were reproduced in the installed NexPlay application, traced to their actual shared root cause, fixed without changing the UI, packaged into a new 2.0.9 application payload, and installed through the corrected 2.0.9 updater.

This was not only a version-number change. The installed `app.asar` changed from the previous 2.0.9 payload hash to the corrected payload hash, and the updater receipt now records that exact corrected artifact.

The final installed application passed the requested real-app workflow:

1. A fresh Online Music search for `bring me to life evanescence` returned 25 streaming results.
2. Adding a result to the end increased the visible queue from 106 to 107 upcoming tracks.
3. The 107-item queue survived switching from Online Music back to Library.
4. Pressing Next selected `Wanna Be Startin' Somethin'` and started playback.
5. The test was cleaned up: the original track was restored and paused at 0:00, and Undo returned the queue to 106.

## What I reproduced in the previously installed build

### Online Music search

The query `Bring me to life` displayed no results even though the desktop providers returned candidates. A different query could return results, which made the bug appear intermittent and provider-related.

Live inspection showed that all three search sources were producing candidates for the failing query:

- Desktop resolver: 7 candidates
- Catalog provider: 48 candidates
- YouTube discovery: 48 candidates

However, the final merged result set was empty.

### Queue

Clicking Add to End displayed the success toast, but the mini player still showed `Queue empty`. Opening the queue and pressing Next did not advance to the added online track.

The stored queue itself was not empty. It contained 108 entries with a valid current index, but NexPlay's browser-side queue helper was absent, so upcoming-item calculation and queue navigation were not running through the intended engine.

## Root cause

Two browser-loaded helper files use the `.cjs` extension:

- `nexplay-next/audio-queue-engine.cjs`
- `nexplay-next/legacy-online-music-helpers.cjs`

The Electron local HTTP server did not define a MIME type for `.cjs`. It served both files as `application/octet-stream` while also sending `X-Content-Type-Options: nosniff`.

Chromium therefore refused to execute both scripts.

That single delivery error broke two major paths:

- The queue engine global was missing, so visible upcoming items and Next/Previous queue behavior used incomplete fallback behavior.
- The Online Music scoring/filtering global was missing, so the fallback comparison became case-sensitive. For example, `Bring me to life` did not match `Bring Me To Life`, causing valid candidates to be discarded.

This explains why some searches happened to work while others did not, and why the queue toast could succeed even though the queue UI and transport did not.

## Technical fixes implemented

### 1. Correct `.cjs` delivery

File: `electron-main.cjs`

The desktop server now maps `.cjs` to `application/javascript; charset=utf-8`. Both helper scripts execute normally under Chromium's no-sniff protection.

### 2. Preserve unsaved online queue entries

File: `nexplay-next/audio-queue-engine.cjs`

Queue normalization now retains a cloned playback snapshot for transient online tracks. An online result can therefore remain resolvable and playable after the user changes view or the search result list is replaced, even when the track has not been saved to the main library.

### 3. Correct same-version updater comparison

File: `tools/NexPlayUpdaterExe/Program.cs`

The updater already supported replacing a same-version release when the artifact SHA-256 changed. However, .NET treated manifest version `2.0.9` as older than the executable's four-part version `2.0.9.0`, so execution stopped before the artifact-identity check.

Version parsing now normalizes missing build and revision components to zero. `2.0.9` and `2.0.9.0` compare as the same version, allowing the changed SHA-256 to trigger the intended same-version update path.

## Why the earlier attempt was insufficient

The prior 2.0.9 package did contain code changes; it was not literally only a version bump. But those changes addressed symptoms and fallback behavior without finding the shared `.cjs` MIME/no-sniff failure. Because the helper scripts still could not execute, the installed app continued to fail on queue handling and case-sensitive search queries.

The updater also had a separate comparison defect that prevented a corrected 2.0.9 payload from replacing an earlier 2.0.9 install. Both layers had to be fixed.

## UI protection

No layout, CSS, artwork, icons, visible controls, navigation, animation, spacing, or styling was changed.

A file-by-file comparison of the previous installed `app.asar` and the corrected `app.asar` covered 3,810 extracted files. Exactly two application files differed:

- `electron-main.cjs`
- `nexplay-next/audio-queue-engine.cjs`

The updater correction is outside `app.asar` in the updater's C# source. Automated contracts for the original sidebar and floating-player presentation also passed.

## Actual installed-app verification

The final package was applied to:

`C:\Users\Adam\AppData\Local\Programs\NexPlay`

The application was launched from that installed location and tested through the real Windows UI.

| Check | Observed result |
|---|---|
| App launch after update | Passed; original UI loaded normally |
| Existing queue rendering | Passed; mini player showed the next queued track |
| Fresh Online Music query | Passed; 25 streaming results returned |
| Add online result to end | Passed; success toast displayed |
| Queue count after add | Passed; 106 -> 107 upcoming tracks |
| Queue survives view change | Passed; still 107 after returning to Library |
| Next transport action | Passed; queued track selected and playback started |
| Queue cleanup | Passed; Undo restored 106 upcoming tracks |
| Playback cleanup | Passed; original track restored, paused at 0:00 |

## Live runtime verification during diagnosis

Before the MIME fix:

- `window.NexPlayAudioQueueHelpers` was absent.
- `window.NexPlayOnlineMusicHelpers` was absent.
- Both `.cjs` responses were `application/octet-stream` and were refused by Chromium.

After restarting the fixed desktop process:

- `.cjs` responses were JavaScript.
- 11 queue helper functions were available.
- 23 Online Music helper functions were available.
- The existing queue rendered 106 upcoming entries.
- The mini player displayed the next queued track.

## Automated verification

| Check | Result |
|---|---|
| Full NexPlay test suite | 135/135 passed |
| `.cjs` JavaScript MIME regression | Passed |
| Unsaved online queue snapshot regression | Passed |
| Three-part/four-part updater version regression | Passed |
| Original sidebar presentation contract | Passed |
| Original floating-player presentation contract | Passed |
| TypeScript type check | Passed; zero errors |
| .NET Release build | Passed; zero warnings and zero errors |

## Installed update receipt

The final updater completed with exit code 0. Its transaction log confirmed artifact validation, synchronization of 74 files, validation of `NexPlay.exe` and `resources/app.asar`, transaction commit, and receipt creation.

The installed receipt records:

- Version: `2.0.9`
- Artifact SHA-256: `e9b53b31dd27572fc6361b7db0b4a5eb538e125798d7d9b598b4140b23ccace5`
- Artifact size: `149,238,455` bytes
- Published: `2026-07-23T17:54:03.8560591Z`
- Installed: `2026-07-23T17:54:40.2894997+00:00`

The receipt SHA-256 and size exactly match the final application payload inside the updater bundle.

## Final release artifacts

### Complete offline updater bundle

- File: `dist-windows-updater\NexPlay-Windows-Updater-2.0.9.zip`
- Size: `214,730,274` bytes
- SHA-256: `f981bf617a2bee611f27baf908c9b59c5720150a7710d5e833356bce400de56f`

### Application payload

- File: `dist-update-release\NexPlay-win-x64-2.0.9.zip`
- Size: `149,238,455` bytes
- SHA-256: `e9b53b31dd27572fc6361b7db0b4a5eb538e125798d7d9b598b4140b23ccace5`

### Installed application

- `NexPlay.exe` size: `225,488,896` bytes
- `NexPlay.exe` SHA-256: `44290b0e98285aeaa4d922f2b1be23645fcd23623375e302849f126146933fd4`
- `resources/app.asar` size: `30,928,689` bytes
- `resources/app.asar` SHA-256: `c3652ff7261a5b03e6f1cdf8e70a2e814386a48d8c161e376c887cc9de756334`

### Updater executable and manifest

- `NexPlay Updater.exe` size: `162,106,936` bytes
- `NexPlay Updater.exe` SHA-256: `c579f623b5dfa5ecb4d95eac14cfc349389c4534bf61ef235f20d108bf0ac035`
- `latest.json` SHA-256: `4f008f20f6f5af3f5f488799784ed314d40e2fe32f2fd2aa2e4c310e18fdfef4`

## Version verification

- Manifest release version: `2.0.9`
- Package/application version: `2.0.9`
- Installed `NexPlay.exe` file version: `2.0.9`
- Installed `NexPlay.exe` product version: `2.0.9.0`
- Updater file version: `2.0.9.0`
- Updater product version: `2.0.9`

## Installation instructions

1. Extract `dist-windows-updater\NexPlay-Windows-Updater-2.0.9.zip`.
2. Keep all extracted files together.
3. Run `Install NexPlay Update.cmd`.
4. Allow elevation if Windows requests it.
5. Let the updater validate, install, and relaunch NexPlay.

## Distribution note

The current application and updater executables are unsigned. Windows may show an Unknown publisher or SmartScreen warning. Signing both executables with a trusted Authenticode certificate is recommended before broad public distribution.
