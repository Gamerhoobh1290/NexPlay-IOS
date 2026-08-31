# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NexPlay is an Electron desktop music player with a browser/PWA frontend and native shells (Android/iOS). `index.html` is the main entry point; `NexPlay.html` is a compatibility launcher for older desktop/web links; `NexPlay.mobile.html` serves mobile. The app is mid-migration from a large legacy inline runtime into a modular ES-module architecture.

## Build, Test, and Development Commands

Run from the repository root (PowerShell):

```powershell
npm start                 # launch Electron locally
npm test                  # run the full Node test suite (tests/run-tests.mjs)
npm run typecheck         # validate JS typing via tsconfig.json
npm run build:tailwind    # regenerate css/tailwind.generated.css from tailwind.input.css
npm run build:web-site    # create the publishable web build
npm run verify:web-site   # verify the web-build output
npm run test:web-publish  # test web publishing specifically
npm run dist:win          # package Windows NSIS + portable builds
npm run make:updater      # build the standalone Windows updater exe
npm run make:uninstaller  # build the standalone Windows uninstaller exe
```

To run a single test file, use Node's test runner directly rather than `npm test` (which runs the aggregated `tests/run-tests.mjs` importing all suites):

```powershell
node --test tests/snake-game.test.mjs
```

`tests/run-tests.mjs` is a manually maintained list of `import './X.test.mjs'` statements — a new `.test.mjs` file must be added there (or to the relevant sub-index) to be included in `npm test`.

## Architecture

### Modular layer (`js/`)

Dependency direction is strict and one-way — violating it is the most common way to introduce circular imports:

- `js/core/` — state, storage, audio, error-boundary. Must stay independent of everything else.
- `js/ui/` — reusable presentation helpers (dom-utils, layout, theme, toast). May depend on `core`.
- `js/features/` — one file per feature (player, sidebar, queue, playlists, visualizer, search, stats, modals). May depend on `core` and `ui`. Every feature module exports `init()` and is wired through `js/app.js`.
- `js/utils/` — helpers, keyboard shortcuts.
- `js/legacy/` — extracted-but-unmodularized runtime slices (app-init, library, player, queue, rendering, online-music, smart-playlists, theme-and-shortcuts, visualizer, etc.), loaded in dependency order and exposed via `js/legacy-api.js` as `window.NexPlayLegacy` for inline handlers. Avoid adding *new* behavior here unless maintaining an existing legacy path — new work belongs in `core`/`ui`/`features`/`utils`.
- `js/bootstrap.js` configures optional advanced loading before `app.js` initializes core/UI/feature/utility modules and finally calls the legacy `init()`.

All shared-state writes go through `setState()` in `js/core/state.js` — never mutate shared state directly. Route unhandled errors through `js/core/error-boundary.js`.

### Migration layer (`nexplay-next/`)

A separate, newer incremental migration target with its own `core/`, `services/`, `ui/`, `workers/` — includes the audio queue engine (`audio-queue-engine.cjs`), Electron preload, and protocol manifest. Check here before assuming all playback/queue logic lives under `js/`.

### Other top-level areas

- `components/`, `css/`, `assets/`, `vendor/` — page fragments, styles (Tailwind-generated + hand-written), static assets, checked-in third-party libraries.
- `android/`, `ios/` — native wrapper projects.
- `electron-main.cjs` / `electron-preload.cjs` — Electron main/preload processes.
- `scripts/` — build/packaging/release automation (web site build, updater/uninstaller bundling, PowerShell packaging scripts referenced by the `npm run make:*` / `dist:*` commands).
- `supabase/` — backend/data config.
- `tests/` — Node test runner suites (`*.test.mjs`), aggregated by `tests/run-tests.mjs`.

### Boot sequence (browser/Electron)

1. `index.html` loads compiled Tailwind + split CSS files.
2. Third-party libraries load.
3. Legacy runtime slices load in dependency order.
4. `legacy-api.js` exposes `window.NexPlayLegacy`.
5. `bootstrap.js` configures optional advanced loading.
6. `app.js` initializes core, UI, feature, and utility modules, then calls the legacy `init()`.

## Coding Style

- ES modules for new JavaScript; four-space indentation; semicolons.
- Kebab-case file names (e.g. `audio-context.js`).
- No established git commit convention yet — use short imperative subjects (e.g. `Fix queue item focus`), one focused change per commit.

## Testing Guidelines

- Use the built-in Node test runner; place new focused tests under `tests/` as `*.test.mjs` and register the import in `tests/run-tests.mjs`.
- For web publishing changes, also run `npm run test:web-publish` and `npm run verify:web-site`.
- Manually check media import, state persistence, and desktop/mobile layouts when touching those paths — the automated suite does not cover real browser rendering everywhere (Playwright-based e2e checks, when used, are noted in `progress.md` and may not be runnable in every environment).
