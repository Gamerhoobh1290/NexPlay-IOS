import { resolveFeatureFlags } from './core/feature-flags.js';
import { PluginRegistry } from './core/plugin-registry.js';
import { createDefaultAppState, createRootReducer, createStore } from './core/store.js';
import { selectTracks } from './core/selectors.js';
import { PlaybackEngine } from './core/playback-engine.js';
import { IndexedDbStorageAdapter } from './services/indexeddb-storage.js';
import { SupabaseSyncService } from './services/supabase-sync-service.js';
import { AutomationEngine, registerDefaultAutomationHandlers } from './services/automation-engine.js';
import { BackgroundJobQueue } from './services/background-jobs.js';
import { ObservabilityService } from './services/observability.js';
import { SemanticIntelligenceService } from './services/semantic-intelligence.js';
import { FileSystemLibraryService } from './services/file-system-library.js';
import { EnrichmentWorkerClient } from './services/enrichment-worker-client.js';
import { registerPwaShell } from './services/pwa.js';
import { installScopedInlineHandlerGuard, sanitizeHtmlFragment } from './services/security.js';
import { CommandPalette } from './ui/command-palette.js';
import { RulesPanel } from './ui/rules-panel.js';
import { createFocusTrap } from './ui/focus-trap.js';
import { ActionRegistry } from './ui/action-registry.js';
import { VirtualizedTrackList } from './ui/virtualized-track-list.js';

const flags = resolveFeatureFlags();

const DEV_TOOLS_UNLOCK_KEY = 'nexplay_next_ops_unlocked';
const DEV_TOOLS_SECRET = 'nexplay::ops::6174';

bootstrap().catch((/** @type {any} */ error) => {
    console.error('[NexPlayNext] bootstrap failed', error);
});

/** @type {(...args: any[]) => Promise<any>} */
async function bootstrap() {
    const observability = new ObservabilityService({
        enabled: flags.use_observability,
        endpoint: window.NEXPLAY_TELEMETRY_ENDPOINT || ''
    });
    observability.mark('nexplay-next:bootstrap:start');

    installSecurityHardening();

    const legacy = await waitForLegacyApi();
    if (!legacy) return;

    const mediaElement = /** @type {HTMLMediaElement|null} */ (document.getElementById('main-audio-element'));
    if (!mediaElement) return;

    const storage = new IndexedDbStorageAdapter();
    const store = createStore(createDefaultAppState(), createRootReducer());
    const playback = new PlaybackEngine(mediaElement);
    const jobs = new BackgroundJobQueue({ concurrency: 3 });
    const semantic = new SemanticIntelligenceService();
    const fsLibrary = flags.use_fs_library ? new FileSystemLibraryService() : null;
    const enrichmentWorker = flags.use_worker_enrichment ? initializeEnrichmentWorker(observability) : null;

    await initializeLocalStore({ legacy, storage, store, observability });
    const sync = initializeSync({ store, storage, observability });
    const automation = initializeAutomation({ legacy, storage, store, observability });
    const commandPalette = flags.use_command_palette
        ? initializeCommandPalette({ legacy, store, automation, semantic, observability, fsLibrary, enrichmentWorker, playback })
        : null;
    const actionRegistry = initializeActionRegistry({ commandPalette, automation, sync, observability });

    if (flags.use_smart_search) {
        installSmartSearch({ legacy, semantic, observability });
    }

    const pluginRegistry = new PluginRegistry();
    if (flags.use_plugins) {
        registerBuiltinPlugins(pluginRegistry);
        await pluginRegistry.initialize({
            flags,
            legacy,
            store,
            storage,
            sync,
            automation,
            commandPalette,
            observability,
            semantic,
            fsLibrary,
            enrichmentWorker
        });
    }

    installModalFocusTraps();
    patchLegacyIntegrations({ legacy, jobs, sync, observability, enrichmentWorker });

    if (flags.use_virtual_list) {
        installVirtualizedTrackList({ legacy, observability });
    }

    if (flags.use_pwa) {
        const pwa = await registerPwaShell({ script: './sw.js', scope: './' });
        observability.track('pwa', 'register', pwa);
    }

    window.NexPlayNext = {
        flags,
        store,
        storage,
        sync,
        automation,
        commandPalette,
        actionRegistry,
        playback,
        jobs,
        selectors: { selectTracks },
        observability,
        semantic,
        fsLibrary,
        enrichmentWorker,
        plugins: pluginRegistry,
        /** @type {(...args: any[]) => any} */
        registerPlugin(plugin) {
            return pluginRegistry.register(plugin);
        }
    };

    if (flags.use_virtual_list) {
        console.info('[NexPlayNext] Virtual list is enabled for large list-mode library views.');
    }

    observability.mark('nexplay-next:bootstrap:end');
    observability.measure('nexplay-next:bootstrap:duration', 'nexplay-next:bootstrap:start', 'nexplay-next:bootstrap:end');
}

/** @type {(...args: any[]) => Promise<any>} */
async function initializeLocalStore({ legacy, storage, store, observability }) {
    const migration = await storage.migrateFromLegacy();
    const persistedState = await storage.getState();

    const legacyState = legacy.getState();
    if (Array.isArray(legacyState.tracks) && legacyState.tracks.length > 0) {
        store.dispatch({ type: 'tracks/upsertMany', payload: legacyState.tracks });
    }
    if (Array.isArray(legacyState.playlists) && legacyState.playlists.length > 0) {
        store.dispatch({ type: 'playlists/upsertMany', payload: legacyState.playlists });
    }

    if (persistedState && typeof persistedState === 'object') {
        if (persistedState.settings) {
            store.dispatch({ type: 'settings/patch', payload: persistedState.settings });
        }
        if (Array.isArray(persistedState.playlists)) {
            store.dispatch({ type: 'playlists/upsertMany', payload: persistedState.playlists });
        }
        if (persistedState.metadata && typeof persistedState.metadata === 'object') {
            const snapshot = store.getState();
            store.replaceState({ ...snapshot, metadata: persistedState.metadata });
        }
    }

    const debouncedSave = debounce(async () => {
        const state = store.getState();
        await storage.saveState({
            settings: state.settings,
            playlists: state.playlists,
            metadata: state.metadata,
            updatedAt: Date.now()
        });
        await storage.upsertPlaylists(state.playlists);
        await storage.upsertTracks(state.tracks);
    }, 250, (/** @type {any} */ error) => {
        console.warn('[NexPlayNext] failed persisting local state', error);
        observability.captureError(error, { source: 'storage.debounced_save' });
    });

    store.subscribe(() => {
        debouncedSave();
    });

    if (migration && migration.migrated) {
        console.info(`[NexPlayNext] Migrated legacy storage (${migration.playlistCount || 0} playlists).`);
    }
}

/** @type {(...args: any[]) => any} */
function initializeSync({ store, storage, observability }) {
    if (!flags.use_sync) {
        return {
            enabled: false,
            getStatus: () => ({ state: 'disabled' }),
            syncNow: async () => ({ disabled: true })
        };
    }

    const config = {
        url: window.NEXPLAY_SUPABASE_URL || '',
        anonKey: window.NEXPLAY_SUPABASE_ANON_KEY || '',
        accessToken: window.NEXPLAY_SUPABASE_ACCESS_TOKEN || ''
    };
    const sync = new SupabaseSyncService(config);

    const syncNow = async () => {
        if (!navigator.onLine) {
            return { offline: true };
        }

        const state = store.getState();
        const localChanges = buildSyncChanges(state);

        const pullPayload = await sync.pull();
        const remoteChanges = pullPayload && Array.isArray(pullPayload.changes) ? pullPayload.changes : [];
        const resolved = sync.resolveConflicts(localChanges, remoteChanges);

        await sync.push(resolved);
        await storage.upsertSyncRecords(resolved);

        observability.track('sync', 'sync-now', { pushed: resolved.length });
        return { pushed: resolved.length };
    };

    const periodic = () => {
        syncNow().catch((/** @type {any} */ error) => {
            console.warn('[NexPlayNext] sync cycle failed', error);
            observability.captureError(error, { source: 'sync.periodic' });
        });
    };

    window.addEventListener('online', periodic);
    setInterval(periodic, 2 * 60 * 1000);
    setTimeout(periodic, 1200);

    return {
        enabled: true,
        getStatus: () => sync.getStatus(),
        syncNow
    };
}

/** @type {(...args: any[]) => any} */
function initializeAutomation({ legacy, storage, store, observability }) {
    const automation = new AutomationEngine();
    registerDefaultAutomationHandlers(automation, legacy);

    const bootstrapRules = async () => {
        const rules = await storage.getAutomationRules();
        if (Array.isArray(rules) && rules.length > 0) {
            automation.setRules(rules);
            store.dispatch({ type: 'automation/setRules', payload: rules });
        }
    };
    bootstrapRules().catch((/** @type {any} */ error) => {
        console.warn('[NexPlayNext] failed loading automation rules', error);
        observability.captureError(error, { source: 'automation.bootstrap' });
    });

    if (flags.use_automation) {
        window.addEventListener('nexplay:app-ready', (/** @type {any} */ event) => {
            automation.evaluate('on_app_start', event.detail).catch((/** @type {any} */ error) => {
                observability.captureError(error, { source: 'automation.on_app_start' });
            });
        });

        window.addEventListener('nexplay:track-ended', (/** @type {any} */ event) => {
            automation.evaluate('on_track_end', event.detail).catch((/** @type {any} */ error) => {
                observability.captureError(error, { source: 'automation.on_track_end' });
            });
        });

        window.addEventListener('nexplay:import-complete', (/** @type {any} */ event) => {
            automation.evaluate('on_import_complete', event.detail).catch((/** @type {any} */ error) => {
                observability.captureError(error, { source: 'automation.on_import_complete' });
            });
        });

        setInterval(() => {
            automation.evaluate('scheduled_time', { now: Date.now() }).catch((/** @type {any} */ error) => {
                observability.captureError(error, { source: 'automation.scheduled_time' });
            });
        }, 60 * 1000);
    }

    const rulesPanel = new RulesPanel({
        getRules: () => automation.listRules(),
        onSave: async (/** @type {any} */ rules) => {
            automation.setRules(rules);
            store.dispatch({ type: 'automation/setRules', payload: rules });
            await storage.upsertAutomationRules(rules);
        }
    });

    return {
        engine: automation,
        openRulesPanel: () => rulesPanel.open(),
        listRules: () => automation.listRules()
    };
}

/** @type {(...args: any[]) => any} */
function initializeCommandPalette({ legacy, store, automation, semantic, observability, fsLibrary, enrichmentWorker, playback }) {
    const palette = new CommandPalette();

    palette.register({ id: 'play-toggle', title: 'Playback: Toggle Play/Pause', keywords: ['play', 'pause', 'music'], run: () => legacy.dispatchAction('play_pause') });
    palette.register({ id: 'play-next', title: 'Playback: Next Track', keywords: ['next'], run: () => legacy.dispatchAction('next') });
    palette.register({ id: 'play-prev', title: 'Playback: Previous Track', keywords: ['previous', 'back'], run: () => legacy.dispatchAction('prev') });
    palette.register({ id: 'queue-open', title: 'View: Toggle Queue Overlay', keywords: ['queue'], run: () => legacy.actions.toggleQueueOverlay?.() });

    // Pro playback controls
    palette.register({
        id: 'playback-ab-loop-set',
        title: 'Playback: Set AB Loop',
        keywords: ['ab', 'loop'],
        run: () => {
            const start = Number(window.prompt('AB loop start (seconds):', '10') || 0);
            const end = Number(window.prompt('AB loop end (seconds):', '20') || 0);
            playback.setAbLoop(start, end);
        }
    });
    palette.register({ id: 'playback-ab-loop-clear', title: 'Playback: Clear AB Loop', keywords: ['ab', 'loop', 'clear'], run: () => playback.clearAbLoop() });
    palette.register({
        id: 'playback-normalization-toggle',
        title: 'Playback: Toggle Loudness Normalization',
        keywords: ['replaygain', 'loudness', 'normalize'],
        run: () => {
            const nextEnabled = !playback.normalizationEnabled;
            playback.setLoudnessNormalization(nextEnabled, -14);
        }
    });
    palette.register({
        id: 'playback-waveform-snapshot',
        title: 'Playback: Capture Waveform Snapshot',
        keywords: ['waveform', 'snapshot'],
        run: () => {
            const snapshot = playback.getWaveformSnapshot(96);
            window.dispatchEvent(new CustomEvent('nexplay:waveform-snapshot', { detail: snapshot }));
            observability.track('playback', 'waveform-snapshot', { size: snapshot.length });
        }
    });
    palette.register({ id: 'mode-windowed', title: 'Mode: Toggle Windowed Mode', keywords: ['windowed', 'lyrics'], run: () => legacy.dispatchAction('toggle_mode', { mode: 'windowed' }) });
    palette.register({ id: 'mode-fs', title: 'Mode: Toggle Immersive Mode', keywords: ['fullscreen', 'immersive'], run: () => legacy.dispatchAction('toggle_mode', { mode: 'fs' }) });
    palette.register({ id: 'mode-video', title: 'Mode: Toggle Video Mode', keywords: ['video', 'fs'], run: () => legacy.dispatchAction('toggle_mode', { mode: 'video' }) });
    palette.register({ id: 'tab-library', title: 'Navigate: Library', keywords: ['tab', 'all'], run: () => legacy.dispatchAction('change_tab', { tab: 'all' }) });
    palette.register({ id: 'tab-audio', title: 'Navigate: Audio', keywords: ['tab', 'songs'], run: () => legacy.dispatchAction('change_tab', { tab: 'audio' }) });
    palette.register({ id: 'tab-videos', title: 'Navigate: Videos', keywords: ['tab', 'movies'], run: () => legacy.dispatchAction('change_tab', { tab: 'videos' }) });
    palette.register({ id: 'tab-playlists', title: 'Navigate: Playlists', keywords: ['tab'], run: () => legacy.dispatchAction('change_tab', { tab: 'playlists' }) });
    palette.register({ id: 'tab-stats', title: 'Navigate: Stats', keywords: ['tab', 'analytics'], run: () => legacy.dispatchAction('change_tab', { tab: 'stats' }) });
    palette.register({ id: 'automation-open', title: 'Automation: Open Rules Panel', keywords: ['rules', 'automation'], run: () => automation.openRulesPanel() });
    palette.register({
        id: 'automation-quick',
        title: 'Automation: Create Quick Track-End Speed Rule',
        keywords: ['rule', 'speed'],
        run: async () => {
            const existing = automation.listRules();
            const next = [...existing, {
                id: `rule-${Date.now()}`,
                name: 'Track End -> 1.25x',
                enabled: true,
                priority: existing.length + 1,
                trigger: { type: 'on_track_end', config: {} },
                actions: [{ type: 'set_speed', payload: { speed: 1.25 } }],
                updatedAt: Date.now()
            }];
            await window.NexPlayNext.storage.upsertAutomationRules(next);
            window.NexPlayNext.automation.engine.setRules(next);
            store.dispatch({ type: 'automation/setRules', payload: next });
        }
    });

    // Macro recorder workflow
    palette.register({
        id: 'macro-start',
        title: 'Macro: Start Recording',
        keywords: ['macro', 'record'],
        run: () => {
            palette.startMacroRecording();
            observability.track('macro', 'start', {});
        }
    });
    palette.register({
        id: 'macro-stop',
        title: 'Macro: Stop Recording',
        keywords: ['macro', 'stop', 'record'],
        run: () => {
            const id = palette.stopMacroRecording();
            observability.track('macro', 'stop', { id });
        }
    });
    palette.register({
        id: 'macro-play-latest',
        title: 'Macro: Play Latest',
        keywords: ['macro', 'play'],
        run: async () => {
            const latest = palette.listMacros()[0];
            if (!latest) return;
            await palette.playMacro(latest.id);
        }
    });

    // Keyboard scopes
    palette.register({ id: 'scope-global', title: 'Scope: Global Hotkeys', keywords: ['scope', 'global'], run: () => palette.setScope('global') });
    palette.register({ id: 'scope-library', title: 'Scope: Library Hotkeys', keywords: ['scope', 'library'], run: () => palette.setScope('library') });
    palette.register({ id: 'scope-player', title: 'Scope: Player Hotkeys', keywords: ['scope', 'player'], run: () => palette.setScope('player') });

    palette.registerKeybinding('alt+p', 'play-toggle', 'global');
    palette.registerKeybinding('alt+arrowright', 'play-next', 'global');
    palette.registerKeybinding('alt+arrowleft', 'play-prev', 'global');
    palette.registerKeybinding('alt+q', 'queue-open', 'library');

    // Smart search + semantic tagging
    palette.register({
        id: 'smart-search-apply',
        title: 'Smart Search: Parse Query',
        keywords: ['smart', 'search', 'query'],
        run: () => {
            const raw = window.prompt('Smart query (examples: video tag:live recent):', '');
            if (!raw) return;
            applyNaturalLanguageQuery({ raw, legacy, semantic, observability });
        }
    });

    palette.register({
        id: 'smart-tags-apply',
        title: 'Smart Tags: Auto Tag Library',
        keywords: ['smart', 'tags', 'library'],
        run: async () => {
            const state = legacy.getState();
            const tracks = Array.isArray(state.tracks) ? state.tracks : [];
            for (const track of tracks) {
                const suggested = enrichmentWorker
                    ? await enrichmentWorker.suggestTags(track).catch(() => semantic.suggestTags(track))
                    : semantic.suggestTags(track);
                track.tags = Array.from(new Set([...(track.tags || []), ...suggested]));
            }
            legacy.actions.renderTracks?.({ preserveScroll: true });
            observability.track('semantic', 'auto-tags-applied', { count: tracks.length });
        }
    });

    palette.register({
        id: 'recommend-next-track',
        title: 'Smart: Recommend And Queue Next',
        keywords: ['recommend', 'next'],
        run: () => {
            const state = legacy.getState();
            const track = semantic.recommendNextTrack(state.tracks || [], state.currentTrackId, state.listeningHistory || state.history || []);
            if (!track) return;
            legacy.actions.addToQueue?.(null, track.id);
            observability.track('semantic', 'recommend-next', { trackId: track.id });
        }
    });

    // File System Access integration
    if (fsLibrary) {
        palette.register({
            id: 'fs-pick-files',
            title: 'Library: Pick Persistent Files (File System Access)',
            keywords: ['filesystem', 'persistent', 'files'],
            run: async () => {
                const result = await fsLibrary.pickFiles({ multiple: true });
                observability.track('fs-library', 'pick-files', { supported: result.supported, count: (result.handles || []).length });
            }
        });
        palette.register({
            id: 'fs-load-handles',
            title: 'Library: Restore Saved File Handles',
            keywords: ['filesystem', 'restore'],
            run: async () => {
                const handles = await fsLibrary.loadHandles();
                observability.track('fs-library', 'load-handles', { count: handles.length });
            }
        });
    }

    const instrumentedRun = async (/** @type {any} */ commandId, /** @type {any} */ run) => {
        observability.mark(`command:${commandId}:start`);
        await run();
        observability.mark(`command:${commandId}:end`);
        observability.measure(`command:${commandId}:duration`, `command:${commandId}:start`, `command:${commandId}:end`);
    };

    // Wrap existing commands to add telemetry without changing command behavior.
    palette.commands = palette.commands.map((/** @type {any} */ command) => ({
        ...command,
        run: () => instrumentedRun(command.id, command.run)
    }));

    return palette;
}

/** @type {(...args: any[]) => any} */
function initializeActionRegistry({ commandPalette, automation, sync, observability }) {
    const registry = new ActionRegistry(document);

    registry.register('open-command-palette', () => {
        observability.track('action', 'open-command-palette');
        if (commandPalette) commandPalette.open();
    });

    registry.register('open-automation-rules', () => {
        observability.track('action', 'open-automation-rules');
        automation.openRulesPanel();
    });

    registry.register('sync-now', async () => {
        observability.track('action', 'sync-now');
        if (sync && sync.enabled) {
            await sync.syncNow();
        }
    });

    const host = document.querySelector('header');
    let actionsWrap = document.getElementById('nexplay-next-actions');
    if (host && !actionsWrap) {
        const wrap = document.createElement('div');
        wrap.id = 'nexplay-next-actions';
        wrap.className = 'hidden items-center gap-2 ml-3';
        wrap.innerHTML = [
            '<button data-action="open-command-palette" class="px-3 py-2 rounded-lg border border-white/10 text-xs text-gray-300 hover:text-white hover:bg-white/10">Cmd</button>',
            '<button data-action="open-automation-rules" class="px-3 py-2 rounded-lg border border-white/10 text-xs text-gray-300 hover:text-white hover:bg-white/10">Rules</button>',
            '<button data-action="sync-now" class="px-3 py-2 rounded-lg border border-white/10 text-xs text-gray-300 hover:text-white hover:bg-white/10">Sync</button>'
        ].join('');
        host.appendChild(wrap);
        actionsWrap = wrap;
    }

    installDevToolsConsoleGate(actionsWrap);
    return registry;
}

/** @type {(...args: any[]) => any} */
function installDevToolsConsoleGate(actionsWrap) {
    const syncVisibility = () => {
        applyDevToolsVisibility(actionsWrap, isDevToolsUnlocked());
    };

    syncVisibility();

    window.NexPlayOps = {
        /** @type {(...args: any[]) => any} */
        unlock(secret) {
            if (secret !== DEV_TOOLS_SECRET) {
                console.warn('[NexPlayNext] Invalid unlock key.');
                return false;
            }
            localStorage.setItem(DEV_TOOLS_UNLOCK_KEY, '1');
            syncVisibility();
            return true;
        },
        /** @type {(...args: any[]) => any} */
        hide() {
            localStorage.removeItem(DEV_TOOLS_UNLOCK_KEY);
            syncVisibility();
            return true;
        },
        /** @type {(...args: any[]) => any} */
        status() {
            return {
                unlocked: isDevToolsUnlocked(),
                command: "NexPlayOps.unlock('<key>')"
            };
        }
    };
}

/** @type {(...args: any[]) => any} */
function isDevToolsUnlocked() {
    try {
        return localStorage.getItem(DEV_TOOLS_UNLOCK_KEY) === '1';
    } catch (_) {
        return false;
    }
}

/** @type {(...args: any[]) => any} */
function applyDevToolsVisibility(actionsWrap, unlocked) {
    if (!actionsWrap) return;
    actionsWrap.classList.toggle('hidden', !unlocked);
    actionsWrap.classList.toggle('md:flex', unlocked);
}

/** @type {(...args: any[]) => any} */
function installSecurityHardening() {
    installScopedInlineHandlerGuard([
        '#nexplay-command-palette',
        '#nexplay-next-actions',
        '#automation-rules-list',
        '#nexplay-command-list'
    ]);

    window.NexPlaySecurity = {
        sanitizeHtml: sanitizeHtmlFragment
    };
}
/** @type {(...args: any[]) => any} */
function installVirtualizedTrackList({ legacy, observability }) {
    const elements = typeof legacy.getElements === 'function' ? legacy.getElements() : null;
    const container = elements && elements.tracksContainer ? elements.tracksContainer : null;
    if (!container || !legacy.actions || typeof legacy.actions.renderTracks !== 'function') {
        return;
    }

    const originalRender = legacy.actions.renderTracks;
    const originalContainerClassName = container.className;
    const virtualized = new VirtualizedTrackList({
        container,
        rowHeight: 74,
        overscan: 12,
        renderRow: (/** @type {any} */ track) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'w-full text-left px-4 py-2 border-b border-white/5 hover:bg-white/5 transition flex items-center justify-between';
            const state = legacy.getState();
            const isCurrent = state.currentTrackId === track.id;
            if (isCurrent) row.classList.add('bg-white/10', 'accent-border');

            row.innerHTML = [
                '<div class="min-w-0">',
                '<div class="text-sm font-semibold truncate ' + (isCurrent ? 'accent-text' : 'text-white') + '">' + escapeHtml(track.title || 'Untitled') + '</div>',
                '<div class="text-xs text-gray-400 truncate">' + escapeHtml(track.artist || 'Unknown Artist') + '</div>',
                '</div>',
                '<div class="text-[10px] text-gray-500 uppercase tracking-wider">' + escapeHtml(track.type || 'audio') + '</div>'
            ].join('');

            row.addEventListener('click', () => {
                if (typeof legacy.actions.loadTrack === 'function') {
                    legacy.actions.loadTrack(track.id, true);
                }
            });

            return row;
        }
    });

    legacy.actions.renderTracks = function patchedRenderTracks(opts = {}) {
        const state = legacy.getState();
        const allowedTabs = new Set(['all', 'audio', 'videos', 'favorites']);
        const useVirtual = state.viewMode === 'list' && allowedTabs.has(state.activeTab);
        if (!useVirtual) {
            container.className = originalContainerClassName;
            return originalRender(opts);
        }

        let filtered = typeof legacy.getFilteredTracks === 'function'
            ? (legacy.getFilteredTracks() || [])
            : (state.tracks || []);

        filtered = filtered.filter(Boolean);
        if (filtered.length < 350) {
            container.className = originalContainerClassName;
            return originalRender(opts);
        }

        if (state.sortType || state.sortDirection) {
            filtered.sort((/** @type {any} */ a, /** @type {any} */ b) => {
                let cmp = 0;
                if (state.sortType === 'name') cmp = (a.title || '').localeCompare(b.title || '');
                else if (state.sortType === 'size') cmp = (a.size || 0) - (b.size || 0);
                else cmp = (a.addedAt || 0) - (b.addedAt || 0);
                return state.sortDirection === 'desc' ? -cmp : cmp;
            });
        }

        const empty = document.getElementById('empty-state');
        if (empty) {
            empty.classList.add('hidden');
            empty.classList.remove('flex');
        }

        container.className = 'relative overflow-auto rounded-xl border border-white/5';
        virtualized.setItems(filtered);
        observability.track('virtual-list', 'render', { count: filtered.length, tab: state.activeTab });
        return undefined;
    };

    observability.track('virtual-list', 'installed', {});
}
/** @type {(...args: any[]) => any} */
function escapeHtml(text) {
    return String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
/** @type {(...args: any[]) => any} */
function installSmartSearch({ legacy, semantic, observability }) {
    const input = /** @type {HTMLInputElement|null} */ (document.getElementById('search-input'));
    if (!input) return;

    const apply = () => {
        const raw = input.value || '';
        applyNaturalLanguageQuery({ raw, legacy, semantic, observability, source: 'search-input' });
    };

    input.addEventListener('keydown', (/** @type {any} */ event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            apply();
        }
    });
}

/** @type {(...args: any[]) => any} */
function applyNaturalLanguageQuery({ raw, legacy, semantic, observability, source = 'unknown' }) {
    const parsed = semantic.parseNaturalQuery(raw);
    const state = legacy.getState();

    if (parsed.mediaTab) {
        legacy.dispatchAction('change_tab', { tab: parsed.mediaTab });
    }

    if (parsed.sortType) state.sortType = parsed.sortType;
    if (parsed.sortDirection) state.sortDirection = parsed.sortDirection;
    if (parsed.tag) {
        state.tagFilter = parsed.tag;
        state.activeTab = 'tags';
    }

    state.searchQuery = parsed.freeText;
    const searchInput = /** @type {HTMLInputElement|null} */ (document.getElementById('search-input'));
    if (searchInput) searchInput.value = parsed.freeText;
    legacy.actions.renderTracks?.({ preserveScroll: true });

    observability.track('semantic', 'natural-query-applied', {
        source,
        raw: parsed.raw,
        mediaTab: parsed.mediaTab,
        tag: parsed.tag,
        freeText: parsed.freeText
    });
}

/** @type {(...args: any[]) => any} */
function initializeEnrichmentWorker(observability) {
    const client = new EnrichmentWorkerClient();
    if (!client.isSupported()) {
        return null;
    }

    return {
        /** @type {(...args: any[]) => any} */
        suggestTags(track) {
            return client.suggestTags(track).catch((/** @type {any} */ error) => {
                observability.captureError(error, { source: 'worker.suggest_tags' });
                throw error;
            });
        },
        /** @type {(...args: any[]) => any} */
        fingerprint(text) {
            return client.fingerprint(text).catch((/** @type {any} */ error) => {
                observability.captureError(error, { source: 'worker.fingerprint' });
                throw error;
            });
        },
        /** @type {(...args: any[]) => any} */
        coverLookup(provider, track) {
            return client.coverLookup(provider, track).catch((/** @type {any} */ error) => {
                observability.captureError(error, { source: 'worker.cover_lookup', provider });
                throw error;
            });
        },
        /** @type {(...args: any[]) => any} */
        lyricsLookup(artist, title) {
            return client.lyricsLookup(artist, title).catch((/** @type {any} */ error) => {
                observability.captureError(error, { source: 'worker.lyrics_lookup' });
                throw error;
            });
        },
        /** @type {(...args: any[]) => any} */
        destroy() {
            client.destroy();
        }
    };
}
/** @type {(...args: any[]) => any} */
function registerBuiltinPlugins(pluginRegistry) {
    pluginRegistry.register({
        id: 'nexplay.telemetry-banner',
        name: 'Telemetry Banner Plugin',
        /** @type {(...args: any[]) => any} */
        setup(context) {
            if (!context.flags.use_observability) return;
            context.observability.track('plugin', 'telemetry-banner-initialized', {
                timestamp: Date.now()
            });
        }
    });

    pluginRegistry.register({
        id: 'nexplay.command-help',
        name: 'Command Help Plugin',
        /** @type {(...args: any[]) => any} */
        setup(context) {
            if (!context.commandPalette) return;
            context.commandPalette.register({
                id: 'help-features',
                title: 'Help: Show Next Features Status',
                keywords: ['help', 'features', 'status'],
                run: () => {
                    const message = [
                        'NexPlay Next: modules, sync, automation, command palette, macro recorder, smart search, plugins, observability, PWA shell.'
                    ].join(' ');
                    if (typeof window.showToast === 'function') window.showToast(message, 'info');
                }
            });
        }
    });
}

/** @type {(...args: any[]) => any} */
function patchLegacyIntegrations({ legacy, jobs, sync, observability, enrichmentWorker }) {
    if (typeof window.fetchItunes === 'function') {
        const originalFetchItunes = window.fetchItunes;
        window.fetchItunes = (/** @type {any} */ track) => jobs.add(() => retryWithBackoff(async () => {
            const workerValue = enrichmentWorker
                ? await enrichmentWorker.coverLookup('itunes', track).catch(() => null)
                : null;
            if (workerValue) return workerValue;

            const proxyValue = await proxyCoverLookup('itunes', track);
            if (proxyValue) return proxyValue;

            return originalFetchItunes(track);
        }, 2)).promise;
    }

    if (typeof window.fetchDeezer === 'function') {
        const originalFetchDeezer = window.fetchDeezer;
        window.fetchDeezer = (/** @type {any} */ track) => jobs.add(() => retryWithBackoff(async () => {
            const workerValue = enrichmentWorker
                ? await enrichmentWorker.coverLookup('deezer', track).catch(() => null)
                : null;
            if (workerValue) return workerValue;

            const proxyValue = await proxyCoverLookup('deezer', track);
            if (proxyValue) return proxyValue;

            return originalFetchDeezer(track);
        }, 2)).promise;
    }

    if (typeof window.fetchLyrics === 'function') {
        const originalFetchLyrics = window.fetchLyrics;
        window.fetchLyrics = async (...args) => jobs.add(async () => {
            const artist = args[0] || '';
            const title = args[1] || '';
            const track = args[2] || null;

            if (enrichmentWorker && artist && title) {
                const workerLyrics = await enrichmentWorker.lyricsLookup(artist, title).catch(() => null);
                if (workerLyrics && workerLyrics.raw && track && !track.assignedLyricsRaw) {
                    track.assignedLyricsRaw = workerLyrics.raw;
                    track.assignedLyricsSource = workerLyrics.kind === 'synced' ? 'Synced' : 'Auto';
                    track.assignedLyricsMeta = {
                        kind: 'auto',
                        providerLabel: workerLyrics.providerLabel || workerLyrics.provider || 'Worker',
                        provider: workerLyrics.provider || '',
                        format: workerLyrics.kind === 'synced' ? 'lrc' : 'plain',
                        matchedLabel: [workerLyrics.artist, workerLyrics.title].filter(Boolean).join(' - '),
                        duration: workerLyrics.duration || 0
                    };
                }
            }

            return originalFetchLyrics(...args);
        }).promise;
    }

    window.addEventListener('beforeunload', () => {
        jobs.clear();
        if (enrichmentWorker) enrichmentWorker.destroy();
        observability.flush().catch(() => {});
    });

    if (sync && sync.enabled) {
        window.addEventListener('nexplay:import-complete', () => {
            sync.syncNow().catch((/** @type {any} */ error) => {
                console.warn('[NexPlayNext] sync on import failed', error);
                observability.captureError(error, { source: 'sync.on_import_complete' });
            });
        });
    }
}

/** @type {(...args: any[]) => any} */
function installModalFocusTraps() {
    const modalIds = ['edit-modal', 'delete-confirm-modal', 'shortcuts-modal', 'playlist-modal'];

    modalIds.forEach((/** @type {any} */ id) => {
        const element = document.getElementById(id);
        if (!element) return;
        const trap = createFocusTrap(element);
        const observer = new MutationObserver(() => {
            const active = !element.classList.contains('hidden');
            if (active) trap.activate();
            else trap.deactivate();
        });
        observer.observe(element, { attributes: true, attributeFilter: ['class'] });
    });
}

/** @type {(...args: any[]) => any} */
function buildSyncChanges(state) {
    const now = Date.now();
    /** @type {any[]} */
    const records = [];

    (state.tracks || []).forEach((/** @type {any} */ track) => {
        records.push({
            entity: 'tracks_meta',
            entityId: track.id,
            updatedAt: track.updatedAt || now,
            status: 'pending',
            payload: {
                title: track.title,
                artist: track.artist,
                tags: track.tags || [],
                isFavorite: Boolean(track.isFavorite),
                playCount: track.playCount || 0,
                duration: track.duration || 0,
                cover: track.cover || ''
            }
        });
    });

    (state.playlists || []).forEach((/** @type {any} */ playlist) => {
        records.push({
            entity: 'playlists',
            entityId: playlist.id,
            updatedAt: playlist.updatedAt || now,
            status: 'pending',
            payload: {
                name: playlist.name,
                tracks: playlist.tracks || []
            }
        });
    });

    records.push({
        entity: 'settings',
        entityId: 'default',
        updatedAt: now,
        status: 'pending',
        payload: state.settings
    });

    (state.automationRules || []).forEach((/** @type {any} */ rule) => {
        records.push({
            entity: 'automation_rules',
            entityId: rule.id,
            updatedAt: rule.updatedAt || now,
            status: 'pending',
            payload: rule
        });
    });

    return records;
}

/** @type {(...args: any[]) => any} */
function waitForLegacyApi() {
    if (window.NexPlayLegacy) return Promise.resolve(window.NexPlayLegacy);

    return new Promise((/** @type {any} */ resolve) => {
        const onReady = () => {
            window.removeEventListener('nexplay:legacy-api-ready', onReady);
            resolve(window.NexPlayLegacy || null);
        };

        window.addEventListener('nexplay:legacy-api-ready', onReady);
        setTimeout(() => {
            if (window.NexPlayLegacy) onReady();
            else resolve(null);
        }, 2000);
    });
}

/** @type {(...args: any[]) => Promise<any>} */
async function proxyCoverLookup(provider, track) {
    const proxyUrl = window.NEXPLAY_SYNC_PROXY_URL;
    if (!proxyUrl) return null;

    const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            intent: 'cover_lookup',
            provider,
            title: track && track.title ? track.title : '',
            artist: track && track.artist ? track.artist : ''
        })
    });

    if (!response.ok) return null;
    const payload = await response.json();
    return payload && payload.coverUrl ? payload.coverUrl : null;
}

/** @type {(...args: any[]) => Promise<any>} */
async function retryWithBackoff(task, retries) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await task();
        } catch (error) {
            lastError = error;
            if (attempt >= retries) break;
            await sleep((attempt + 1) * 350);
        }
    }
    throw lastError;
}

/** @type {(...args: any[]) => any} */
function debounce(fn, waitMs, onError = null) {
    /** @type {ReturnType<typeof setTimeout>|null} */
    let timeoutId = null;
    return /** @type {(...args: any[]) => void} */ ((...args) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            Promise.resolve(fn(...args)).catch((/** @type {any} */ error) => {
                if (typeof onError === 'function') {
                    onError(error);
                    return;
                }
                console.warn('[NexPlayNext] debounced task failed', error);
            });
        }, waitMs);
    });
}

/** @type {(...args: any[]) => any} */
function sleep(ms) {
    return new Promise((/** @type {any} */ resolve) => setTimeout(resolve, ms));
}



