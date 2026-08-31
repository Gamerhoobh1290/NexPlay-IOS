# NexPlay Next Layer

This folder contains the incremental migration layer for the legacy `NexPlay.html` application.

- `core/`: feature flags, typed store, selectors, playback logic, plugin registry.
- `services/`: IndexedDB adapter, sync service, automation engine, background jobs, observability, semantic intelligence, PWA bootstrap, File System Access persistence, security guards.
- `ui/`: command palette (with macro recorder and keyboard scopes), automation rules panel, focus trap, virtualization primitive.
- `workers/`: enrichment worker for off-main-thread suggestions/fingerprints.
- `bootstrap.js`: runtime bridge that wires the new modules into the legacy app.

## Feature Flags

Flags are read from `window.NEXPLAY_FLAGS` and localStorage key `nexplay_feature_flags`.

- `use_new_store`
- `use_virtual_list`
- `use_sync`
- `use_command_palette`
- `use_automation`
- `use_plugins`
- `use_observability`
- `use_macro_recorder`
- `use_smart_search`
- `use_worker_enrichment`
- `use_fs_library`
- `use_pwa`

## Supabase Configuration

Expose these globals before loading `bootstrap.js`:

- `window.NEXPLAY_SUPABASE_URL`
- `window.NEXPLAY_SUPABASE_ANON_KEY`
- `window.NEXPLAY_SUPABASE_ACCESS_TOKEN` (optional)
- `window.NEXPLAY_SYNC_PROXY_URL` (optional edge proxy for metadata providers)

## Optional Runtime Globals

- `window.NEXPLAY_TELEMETRY_ENDPOINT`: endpoint for batched telemetry events.

