# NexPlay Modular Architecture

NexPlay now uses a staged modular architecture. The app entrypoint is `index.html`; `NexPlay.html` remains as a compatibility launcher for old desktop and web links.

## Structure

```text
css/
  base.css
  theme.css
  components.css
  animations.css
  tailwind.generated.css
js/
  core/
    error-boundary.js
    state.js
    storage.js
    audio-context.js
    audio.js
  ui/
    dom-utils.js
    layout.js
    theme.js
    toast.js
  features/
    player.js
    sidebar.js
    queue.js
    playlists.js
    visualizer.js
    search.js
    stats.js
    modals.js
  utils/
    helpers.js
    keyboard-shortcuts.js
  legacy/
    *.js
  app.js
  legacy-api.js
  bootstrap.js
components/
assets/
```

## Dependency Rules

1. Core modules stay independent.
2. UI modules may depend on core modules.
3. Feature modules may depend on core and UI modules.
4. Avoid circular dependencies.
5. Every feature module exports `init()`.
6. New state updates must use `setState()` from `js/core/state.js`.
7. New modules should not mutate shared state directly.
8. Global errors are handled by `js/core/error-boundary.js`.
9. Keep modules loosely coupled and reusable.

## Migration Status

The former inline runtime has been extracted into ordered files under `js/legacy/` to preserve behavior while creating a modular boundary. New code should be added to `js/core/`, `js/ui/`, `js/features/`, or `js/utils/`, then wired through `js/app.js`. Legacy functions are exposed through `js/legacy-api.js` for inline handlers and backward compatibility.

## Boot Sequence

1. `index.html` loads compiled Tailwind and the split CSS files.
2. Third-party libraries load.
3. Legacy runtime slices load in dependency order.
4. `legacy-api.js` exposes `window.NexPlayLegacy`.
5. `bootstrap.js` configures optional advanced loading.
6. `app.js` initializes core, UI, feature, and utility modules, then calls the legacy `init()`.

## Verification Checklist

- Run `npm test`.
- Check for circular imports before moving more legacy code into ES modules.
- Verify `index.html` loads with zero relevant console errors.
- Verify CSS imports render the same app shell.
- Verify state persistence and media import flows.
- Test desktop and mobile-sized browser viewports.
- Run performance and accessibility audits before release.

## Troubleshooting

Module not found: check path, case, file existence, and import syntax.

State not updating: use `setState()`, check subscriptions, and verify whether the code path is still legacy-managed.

Feature not initializing: ensure `app.js` imports the feature and the feature exports `init()`.

Audio not working: verify audio context initialization, the `#main-audio-element`, source URLs, and browser autoplay restrictions.
