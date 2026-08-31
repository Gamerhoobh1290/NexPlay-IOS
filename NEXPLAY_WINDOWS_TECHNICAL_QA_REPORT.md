# NexPlay Windows Desktop - Technical QA and Fix Report

**Report date:** July 19, 2026  
**Application version:** NexPlay 2.0.8  
**Final validation runtime:** Electron 43.1.1 / Chromium 150.0.7871.114  
**Platform tested:** Windows desktop

## Executive summary

This phase was restricted to technical reliability, recovery, security, and runtime performance. The original NexPlay presentation was not redesigned or restyled.

The final working source now includes fixes for malformed local requests, unsafe path-boundary checks, multiple-instance conflicts, metadata redirect validation, local data integrity, listening-statistics persistence and recovery, redundant playback DOM work, hidden debug work, shortcut conflicts, search clearing, and route scrolling. The obsolete Electron 34 runtime and older packaging toolchain were also replaced with current supported versions after a separate compatibility build.

Final verification status:

- **130 automated tests passed**
- **0 tests failed or skipped**
- **TypeScript check passed**
- **Production JavaScript syntax checks passed**
- **Full npm dependency audit: 0 known vulnerabilities**
- **Windows unpacked package build passed**
- **Electron 43 packaged startup passed**
- **Real cold-restart persistence passed**
- **Corrupt-primary recovery from backup passed**
- **Approved metadata IPC passed; unapproved host was blocked**

The installed copy at `C:\Users\Adam\AppData\Local\Programs\NexPlay` was used only as a reference and was not modified, reinstalled, or replaced.

## Non-negotiable UI guardrail

No UI work was authorized in this phase. The following were therefore left unchanged:

- Application layout and sizing
- Sidebar structure, scrolling, spacing, and navigation presentation
- Floating player position, size, glass treatment, and overlap behavior
- Player cover rotation and its timing
- Cards, colors, typography, gradients, icons, and shadows
- Modal presentation
- Track actions and their visible behavior
- Windowed and fullscreen presentation
- Animation and reduced-motion styling

### Mechanical UI-integrity evidence

The current source was hashed against the previously restored validation package. These files are byte-for-byte identical:

- `index.html`
- `css/base.css`
- `css/theme.css`
- `css/components.css`
- `css/animations.css`
- `css/tailwind.generated.css`

The same six files were then read back out of the final Electron 43 ASAR package and matched the working source exactly. Regression tests also protect the original sidebar and floating-player contracts.

## Production and validation artifacts

| Item | Location | Status |
|---|---|---|
| Installed NexPlay 2.0.8 | `C:\Users\Adam\AppData\Local\Programs\NexPlay` | Reference only; not modified |
| Working source | `C:\Users\Adam\Videos\Nexa` | Technical fixes and tests |
| Previous restored-UI package | `C:\Users\Adam\Videos\Nexa\dist-codex-restored-ui-final5\win-unpacked\NexPlay.exe` | UI hash reference |
| Final technical validation package | `C:\Users\Adam\Videos\Nexa\dist-codex-technical-fixes3-e43\win-unpacked\NexPlay.exe` | Disposable unpacked build |

No production installer was installed, published, signed, or distributed.

## Technical fixes implemented

### 1. Malformed local URLs could escape controlled error handling

Malformed percent-encoded paths could throw while being decoded.

**Fix:** Malformed paths now return a controlled HTTP `400 Bad Request` response.

**Verification:** Automated coverage exercises the static route, external-media route, and online-stream route.

### 2. Static-file containment used an unsafe string-prefix boundary

A sibling directory whose name began with the application directory name could satisfy a simple prefix check.

**Fix:** Static path containment now uses normalized `path.relative` boundaries.

**Verification:** Valid shell content returns `200`; traversal is rejected; the sibling-prefix regression passes.

### 3. More than one desktop instance could compete for state and port 5000

**Fix:** NexPlay now acquires Electron's single-instance lock before startup. A second launch restores, shows, and focuses the existing window instead of starting another server and renderer set.

**Verification:** Both lock outcomes and second-instance focus behavior are covered by automated tests.

### 4. Desktop server and IPC trust boundaries were incomplete

**Fixes retained:**

- Content Security Policy
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- Trusted-renderer validation for sensitive IPC handlers
- HTTPS-only provider metadata bridge
- Approved-provider host allowlist
- Response-size and timeout limits

### 5. Provider redirects were checked too late

The earlier implementation used automatic redirect following and checked the final URL afterward. That meant a request could already have reached an unapproved destination before validation rejected it.

**Fix:** Metadata requests now use manual redirect handling. Every redirect destination is normalized and approved before the next network request is sent. Missing locations and redirect loops are rejected.

**Verification:**

- An unapproved redirect test confirms only the original request is sent.
- An approved cross-provider redirect is followed manually.
- JSONP callback parameters are removed from redirected URLs.
- Live iTunes metadata returned one result.
- A live `example.com` request was blocked by IPC.

### 6. Fonts, icons, and charts depended on public CDNs

**Fix:** Outfit, Space Mono, Lucide, and Chart.js are pinned and packaged locally.

**Result:** Startup presentation, icons, and statistics no longer depend on those public CDNs. Runtime resource inspection confirmed that the Electron 43 build loaded the packaged local resources.

### 7. Local-library index writes were vulnerable to interruption and overlap

**Fixes retained:**

- Serialized saves
- Temporary-file write before replacement
- Atomic rename
- Valid-primary backup maintenance
- Recovery from a valid backup when the primary index is damaged

**Verification:** Automated tests cover save serialization, temporary replacement, backup creation, and recovery.

### 8. Listening time was not fully and safely accounted for

**Fixes retained:**

- Valid playback deltas update the track, daily history, and aggregate total.
- Paused time and large seek jumps are excluded.
- Private-session and game-suppressed playback are excluded.
- Older totals migrate from listening history.
- Export and backup payloads include the aggregate total.

### 9. App-state persistence could falsely report success

The app-state path treated a failed storage write as successful, so its quota fallback could be skipped.

**Fix:** The write result is now honored. If the full payload cannot be stored, NexPlay retries with trimmed detailed history while preserving the aggregate listening total.

### 10. Cold restart and corrupt-state recovery were incomplete

**Fixes:**

- Primary and backup app-state records are maintained.
- Cold startup reads a valid primary or recovers from a valid backup.
- A damaged primary is repaired from backup.
- A damaged backup is repaired from primary.
- If both copies are unusable, only those two app-state keys are cleared; the rest of the library data is preserved.
- Importing a manual backup now persists restored listening totals immediately.

**Packaged live verification:**

- `321.25` seconds and its daily history survived a real restart in an isolated profile.
- The primary record was deliberately corrupted and the browser process was terminated to simulate a crash.
- On restart, the total and history were recovered and both primary and backup records were valid again.
- The final Electron 43 package separately preserved `432.5` seconds through a cold restart.

### 11. The internal performance sampler ran too often while idle

**Fix:** When continuous sampling is not needed, the sampler backs off to a 1.5-second wake-up instead of maintaining a frame-by-frame loop.

**UI impact:** None. The original continuously rotating cover remains exactly as shipped.

### 12. Online playback performed redundant DOM and accessibility-tree work

The online progress timer runs every 200 ms. It previously rewrote unchanged text, images, slider values, button state, and classes, then scanned every online result row on each tick.

**Fixes:**

- Text, properties, and class states are written only when their value changes.
- The 200 ms path now updates progress controls only.
- Full card synchronization remains event-driven for real track, connection, playback, save, and capability changes.
- Result rows are no longer rescanned on every progress tick.

**Expected result:** Less renderer work and fewer Windows UI Automation value/structure updates during online playback, with identical visible output.

### 13. Hidden player modes received unnecessary progress updates

Mini-player, windowed-player, and fullscreen-player controls were all updated even when the latter two modes were not active.

**Fix:** The mini-player remains unconditional. Windowed and fullscreen surfaces update only while their corresponding mode is active. Video fullscreen behavior is preserved.

### 14. The hidden debug overlay still scheduled animation frames

**Fix:** Debug refresh exits before requesting an animation frame when the overlay is hidden. Hiding the overlay also cancels a pending debug frame.

### 15. Global shortcuts could fire while the user was editing

**Fix:** Playback and navigation shortcuts ignore inputs, text areas, selects, buttons, links, and editable elements.

The shortcut editor also preserves `Tab`, closes on `Escape`, and returns focus to its opener.

### 16. Clear Search and route scrolling had stale-state edge cases

**Fixes:**

- Clearing a no-results query rerenders the library even through the legacy empty-state call path.
- A real route change resets the main content scroll position immediately and after Chromium's delayed anchoring.
- Selecting the already active route does not move the scroll position.

### 17. The desktop runtime and build toolchain were obsolete

The project resolved to Electron 34.5.8. Electron 34 reached end of life on June 24, 2025. The runtime was upgraded only after a separate compatibility experiment.

**Upgrades retained:**

- Electron `34.5.8` to `43.1.1`
- Chromium `132` to `150`
- electron-builder `25.1.8` to `26.15.3`
- PostCSS pinned to `8.5.10` to close the remaining development dependency advisory
- TypeScript and Node type definitions declared directly instead of relying on transitive build-tool packages

Electron 43.1.1 is listed as a current stable release, and the Electron 43 line is supported through January 5, 2027. See the [official release list](https://releases.electronjs.org/) and [official support schedule](https://releases.electronjs.org/schedule).

**Compatibility verification:**

- All 130 application tests passed under the upgraded dependency tree.
- TypeScript and production syntax checks passed.
- electron-builder 26 produced a working unpacked Windows package.
- The packaged renderer reported Electron 43.1.1 and Chromium 150.0.7871.114.
- Local preload IPC was available.
- Approved metadata and blocked-host flows passed.
- Local server startup and security headers passed.
- Cold-restart persistence passed.
- All packaged UI files matched the restored UI files byte-for-byte.

## Automated test coverage

The 130 passing tests cover:

- Queue state, repeat, shuffle, insertion, movement, removal, and failure recovery
- Filtering, sorting, semantic parsing, and plugin registration
- Online search scoring, provider errors, playback fallback, queue projection, and session restore
- Private-session isolation and shared-player behavior
- Lyrics parsing, lookup ordering, and cache rules
- NexBeat Tiles and Snake lifecycle behavior
- Local HTTP hardening and malformed requests
- Static path containment
- Single-instance behavior
- Approved metadata redirect validation
- Original sidebar and floating-player layout contracts
- Search clearing and route scrolling
- Idle sampler behavior
- Listening-time accounting and migration
- True cold-restart app-state persistence
- Primary/backup corruption recovery
- Storage-quota fallback
- Backup-import persistence
- Local dependency usage
- Atomic local-library index persistence
- Hidden progress-surface gating
- Redundant online-card write prevention
- Hidden debug-overlay RAF prevention
- Playback-engine A/B loop and chapters

## Live Windows checks

- Packaged Electron 34 and Electron 43 startup in isolated profiles
- Shell response and security headers
- Traversal rejection
- Trusted preload bridge availability
- Approved iTunes metadata request
- Unapproved provider rejection
- Cold restart with listening totals and history
- Crash-style primary corruption and backup recovery
- Runtime version and local resource inspection
- Clean hidden/occluded idle process sampling
- ASAR UI-file hash verification

No crash was observed during these flows.

## Performance investigation outcome

Earlier diagnostic runs showed unusually high GPU-process activity while Windows UI Automation/computer-control enumeration was attached. That result did not reproduce in clean process-only sampling:

- Electron 34 clean hidden/occluded idle samples were approximately `0%` to `2.2%` aggregate CPU.
- Electron 43 clean hidden/occluded idle samples were approximately `0%` to `0.6%` aggregate CPU.
- Forcing the cover animation to pause temporarily while hidden did not improve the clean Electron 34 result, so no animation change was retained.

Static inspection confirms that the rotating cover is the only definite continuous compositor animation in the ordinary paused library, and its glass background could amplify repaint cost on some driver combinations. That is a diagnostic lead, not proof of a production defect. The correct next step is a visible foreground GPU trace without UI Automation attached. No CSS, blur, frame-rate, GPU flag, or animation behavior was changed based on an unreproducible sample.

## Remaining risks and recommended validation

### 1. Long-duration playback

Run multi-hour local and online playback with memory, handle-count, and audio recovery monitoring.

### 2. Windows lifecycle

Test suspend/resume, audio-device replacement, Bluetooth disconnect/reconnect, and screen lock/unlock while playing.

### 3. Large libraries and accessibility

The full library renders every track and every track action. At several hundred or thousands of tracks this creates a large DOM and accessibility tree. A future virtualizer must preserve the exact existing row/card UI and keyboard/screen-reader access; the current optional virtual-list implementation should not simply be enabled because it changes behavior and content.

No accessibility support was disabled. The hot-path fixes reduce redundant accessibility-tree updates while preserving functionality.

### 4. Hardware and display matrix

Repeat foreground tests at 100%, 125%, and 150% scaling, with integrated and discrete GPUs, multiple monitors, and representative audio drivers.

### 5. Third-party services

Online music, artwork, lyrics, and playback remain subject to provider availability, quotas, regional rules, and network behavior.

### 6. Installer and updater

The unpacked Windows build passed. A production release still needs installer upgrade, rollback, uninstall, updater-signature, and staged-rollout tests. The final test executable is unsigned and is not a distribution artifact.

## Release assessment

The source is materially safer and more recoverable than the reviewed build, and the final unpacked Electron 43 package is suitable for user acceptance testing. It should not yet replace the installed production copy until the installer/updater matrix and a longer playback soak pass are complete.

Most importantly, this technical phase did not modify NexPlay's visual design. Any future technical change that would produce a visible difference should stop for explicit approval first.
