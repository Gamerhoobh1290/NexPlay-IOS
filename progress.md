Original prompt: Fix the existing Music Games tab in `NexPlay.html`, prioritizing Snake (Album Covers), Song Race, Memory Playlist Game, isolating Guess the Song snippets from the main player UI, fixing layout visibility, turning Math Unlock into a NexPlay-style popup, and making progression automatic after correct answers.

## Music Games Fixes

- Landed:
  - isolated music-game snippets from the main player shell/progress/title by freezing and restoring the player UI during preview playback
  - blocked online preview snippets from falling through the normal queue advancement path
  - tightened Music Games layout sizing and overflow so the hub and game views fit more cleanly
  - rebuilt Math Unlock as an in-tab popup/modal instead of a full-page challenge panel
  - fixed Snake restart behavior after crashes and cleaned up the on-screen controls
  - fixed Song Race lane movement so racers actually traverse the lane
  - made Memory Playlist progress automatically into the next round after a correct sequence
  - added automatic correct-answer progression for the quiz-style music games

- Verification:
  - inline script parse passes with Node
  - the Playwright client is present, but the `playwright` package is not installed here, so no real browser run was possible in this environment

## Runtime Stabilization Pass

- Landed:
  - removed the duplicated Music Games helper/quiz definitions so the file now has one canonical implementation path
  - moved Snake, Song Race, and Memory Playlist off full `renderMusicGames()` remounts during active runtime updates
  - added dedicated runtime sync helpers:
    - Snake now updates its own in-tab runtime section per tick instead of remounting the whole Music Games view
    - Song Race now uses `raceId` and `animatedRaceId` guards so each race animates once and stale timers are ignored
    - Memory Playlist now updates only its own runtime section during reveal and answer flow
  - made Snake restart/resume idempotent and added explicit end-state handling for board clear vs crash
  - made Song Race restore/continue lane positions correctly if the Music Games view is re-rendered mid-race
  - kept Memory Playlist automatic round progression while cancelling stale reveal loops and stale auto-advance timers

- Verification:
  - inline script parse passes with Node after the stabilization patch
  - `npm test` passes (`33/33`)
  - real browser validation is still blocked here because `playwright` is not installed in this environment

## April 15, 2026 - Full Rewrite of 3 Music Games

- Scope completed:
  - removed prior `Song Race`, `Memory Playlist Game`, and `Snake (Album Covers)` behavior/engines
  - rebuilt all three from new state models, renderers, and runtime rules while keeping IDs and tab wiring intact

- New implementations:
  - Snake:
    - survival-style board with hazard spawning, pickup point values, combo scoring, and updated status/runtime UI
  - Song Race:
    - live simulation lanes (speed, acceleration, stamina, boosts) with no rigged winner logic
    - tactical boost support and explicit race-finalization flow
  - Memory Playlist:
    - pattern reveal gameplay (visual sequence), strike system, hint system, auto round escalation, reset/replay paths

- Stability fix landed:
  - rewrote `getMusicGamesState()` normalization to preserve object identity instead of replacing the full object each call
  - this removed stale-reference issues that blocked Song Race and Memory initialization under repeated helper calls

- Verification run (real browser interactions):
  - Playwright-driven run against local `NexPlay.html` using seeded in-memory library tracks
  - report + screenshots: `output/music-games-e2e/report.json`, `hub.png`, `snake.png`, `song-race.png`, `memory-playlist.png`
  - targeted Snake control verification screenshot: `output/music-games-e2e/snake-targeted.png`
  - all test-script checks passed for Song Race and Memory flow; targeted Snake check confirmed pause/resume/restart correctness
  - no browser console/page errors captured in the final run

- Additional checks:
  - inline script parse passes
  - `npm test` passes (33/33)

## Browser Verification Notes (Final)

- Final artifacts generated under `output/music-games-e2e/`:
  - `report.json` (full run: Song Race + Memory + baseline Snake capture)
  - `snake-targeted.png` and `snake-targeted-report.json` (focused Snake pause/resume/restart verification)
- Result summary:
  - Song Race: mounted, boosts consumed, lanes progressed, race finalized with winner
  - Memory Playlist: mounted, hint path, strike path, auto round advance, reset path
  - Snake: targeted run confirms pause/resume and restart initialization are functioning

## April 15, 2026 - Smoothness + Reliability Pass

- Landed:
  - Snake:
    - reduced step tick to `160ms`
    - added per-step slide animation (`musicSnakeSlideStep`) so movement visually glides between cells
    - kept wall-bounce/no-fail behavior
    - removed lingering `+1` food badge UI and confirmed no `music-games-snake-food-value` element remains
  - Song Race:
    - converted race lane UI from horizontal progress bars to vertical race columns
    - switched racer movement to `bottom:%` and lane fill to `height:%`
    - retained boost mechanics and animated racer core/equalizer behavior
  - Memory Playlist:
    - added `Next Pattern` runtime control (`advanceMemoryPlaylistRound`) with safe-guard when sequence reveal is active
    - hardened reveal flow so snippet load failures auto-trigger a fresh pattern instead of stalling/breaking
    - preserved replay/reset/hint mechanics and auto-round progression
  - Finish the Lyrics:
    - upgraded prompt generation to prefer timed/synced lyric entries
    - on correct answer, play snippet at the exact lyric timestamp (`promptTimeSeconds`) before advancing
    - round now auto-advances after lyric replay completes

- Verification (real browser, localhost:5000):
  - script: `output/music-games-e2e/verify-music-games-latest.mjs`
  - report: `output/music-games-e2e/report-latest.json`
  - screenshots:
    - `output/music-games-e2e/snake-latest.png`
    - `output/music-games-e2e/song-race-latest.png`
    - `output/music-games-e2e/memory-latest.png`
    - `output/music-games-e2e/finish-lyrics-latest.png`
  - result: all checks passed, including:
    - snake smoothness/no `+1` badge/wall-bounce
    - song race vertical lane rendering + live updates
    - memory fallback recovery + Next Pattern stability
    - finish-the-lyrics timed snippet replay + round advancement

## April 15, 2026 - Reliability Hotfixes (Memory / Math Input / Guess)

- Memory Playlist:
  - fixed pool construction bug where sequence IDs could be dropped from visible tiles after shuffle+slice
  - now pool is built by guaranteeing all sequence tracks first, then adding extras
  - this prevents "revealed song not in list" and missing highlight mismatch

- Math Unlock:
  - adjusted answer input styling to high-contrast (`bg-white` + `text-black`) for readability

- Guess the Song:
  - added immediate-repeat guard so the next round avoids selecting the same correct track back-to-back

- Verification:
  - parse check: `SCRIPT_PARSE_OK 7`
  - targeted Playwright check script: `output/music-games-e2e/verify-memory-guess-fix.mjs`
  - checks passed:
    - `memorySequenceAlwaysInPool: true`
    - `guessNoImmediateRepeatAfterCorrect: true`

## April 15, 2026 - Memory Playlist Audio-Only Reveal

- Removed visual highlight signaling from Memory Playlist reveal flow.
- Sequence now relies on snippet playback only; tile buttons no longer enter highlighted visual state during reveal/hint.
- Updated copy/instructions to describe audio-only sequence.
- Reworked hint action to replay next snippet audio (`Replay Next Snippet`) without revealing a tile.

- Verification:
  - parse check: `SCRIPT_PARSE_OK 7`
  - Playwright checks:
    - `output/music-games-e2e/verify-memory-audio-only.mjs` (hint path confirms no visual highlight)
    - additional direct run confirms `sequenceHasNoVisualHighlight: true` while reveal is active

## April 15, 2026 - Song Race Layout + Winner Snippet

- Song Race layout updated so songs are shown as vertical lane cards next to each other (side-by-side grid).
- Race finish now auto-plays the winner using a 6.5s snippet from the middle of the winning song.
- Added a race guard (`winnerSnippetRaceId`) so winner snippet triggers only once per race.

- Verification:
  - parse check: `SCRIPT_PARSE_OK 7`
  - targeted Playwright script: `output/music-games-e2e/verify-song-race-winner-snippet.mjs`
  - checks passed:
    - side-by-side cards
    - vertical lane geometry
    - winner snippet called exactly on winner
    - snippet duration 6.5s
    - snippet start computed from middle

## April 15, 2026 - Lyrics + Guess Audio Reliability

- Finish the Lyrics:
  - replaced fixed sleep/forced stop flow with preview-end waiting (`waitForMusicGamePreviewToEnd`) so the lyric snippet can finish naturally before advancing
  - increased lyric replay window to 6.5s around the timed lyric moment

- Guess the Song:
  - added `playGuessTheSongSnippet` as a single hardened snippet launcher
  - uses explicit bounded `startTime` (computed via snippet window) and `randomStart:false` at playback call time for stability
  - keeps a retry/fallback attempt when snippet start fails
  - tracks preview attempts with `previewToken` to ignore stale snippet attempts
  - proactively stops active preview before restore/next snippet to avoid audio-state collisions

- Verification:
  - parse check: `SCRIPT_PARSE_OK 7`
  - targeted script: `output/music-games-e2e/verify-lyrics-guess-final.mjs`
  - checks passed:
    - lyrics playback wait applied (`~6.96s` before round advance)
    - guess snippet uses explicit startTime and stable playback options
