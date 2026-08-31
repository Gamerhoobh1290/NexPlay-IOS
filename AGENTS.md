# Repository Guidelines

## Project Structure & Module Organization

NexPlay is an Electron desktop app with a browser/PWA frontend and native shells. `index.html` is the main entry point; `NexPlay.html` is a compatibility launcher. Keep new frontend code in the modular layer:

- `js/core/` holds state, storage, audio, and error-boundary primitives.
- `js/ui/` contains reusable presentation helpers; `js/features/` owns feature initialization.
- `js/legacy/` preserves extracted compatibility code. Avoid adding new behavior here unless maintaining an existing legacy path.
- `nexplay-next/` is the incremental migration layer, with `core/`, `services/`, `ui/`, and `workers/`.
- `components/`, `css/`, `assets/`, and `vendor/` hold page fragments, styles, static assets, and checked-in browser libraries. `android/` and `ios/` contain native wrappers; `tests/` contains Node tests.

## Build, Test, and Development Commands

Run commands from the repository root:

```powershell
npm start                 # launch Electron locally
npm test                  # run the repository test suite
npm run typecheck         # validate JavaScript typing via tsconfig.json
npm run build:tailwind    # regenerate css/tailwind.generated.css
npm run build:web-site    # create the publishable web build
npm run verify:web-site   # verify the web-build output
npm run dist:win          # package Windows NSIS and portable builds
```

## Coding Style & Naming Conventions

Use ES modules for new JavaScript and follow the existing four-space indentation and semicolon style. Name files in kebab-case (for example, `audio-context.js`). Feature modules export `init()` and are wired through `js/app.js`. Core must remain independent; UI may depend on core, and features may depend on both. Update shared state only through `setState()` in `js/core/state.js`; do not introduce circular imports or direct shared-state mutation. Route unhandled errors through `js/core/error-boundary.js`.

## Testing Guidelines

Use the built-in Node test runner. Place focused tests under `tests/` using the existing `.test.mjs` naming pattern, then run `npm test`. For web publishing changes, also run `npm run test:web-publish` and `npm run verify:web-site`. Manually check media import, state persistence, desktop and mobile layouts when touching those paths.

## Commit & Pull Request Guidelines

The repository has no commit history yet, so no established message convention can be inferred. Use short imperative commit subjects, such as `Fix queue item focus`. Keep each commit focused. Pull requests should explain the user-visible change, list verification commands, link the relevant issue when available, and include screenshots or recordings for UI changes. Call out compatibility impact on Electron, web, Android, or iOS explicitly.
