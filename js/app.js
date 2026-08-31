import { init as initErrorBoundary, captureModuleError } from './core/error-boundary.js';
import { init as initState } from './core/state.js';
import { init as initStorage } from './core/storage.js';
import { init as initAudioContext } from './core/audio-context.js';
import { init as initAudio } from './core/audio.js';
import { init as initDomUtils } from './ui/dom-utils.js';
import { init as initLayout } from './ui/layout.js';
import { init as initTheme } from './ui/theme.js';
import { init as initToast } from './ui/toast.js';
import { init as initPlayer } from './features/player.js';
import { init as initSidebar } from './features/sidebar.js';
import { init as initQueue } from './features/queue.js';
import { init as initPlaylists } from './features/playlists.js';
import { init as initVisualizer } from './features/visualizer.js';
import { init as initSearch } from './features/search.js';
import { init as initStats } from './features/stats.js';
import { init as initModals } from './features/modals.js';
import { init as initHelpers } from './utils/helpers.js';
import { init as initKeyboardShortcuts } from './utils/keyboard-shortcuts.js';

const modules = [
    ['core/error-boundary', initErrorBoundary],
    ['core/state', initState],
    ['core/storage', initStorage],
    ['core/audio-context', initAudioContext],
    ['core/audio', initAudio],
    ['ui/dom-utils', initDomUtils],
    ['ui/layout', initLayout],
    ['ui/theme', initTheme],
    ['ui/toast', initToast],
    ['features/player', initPlayer],
    ['features/sidebar', initSidebar],
    ['features/queue', initQueue],
    ['features/playlists', initPlaylists],
    ['features/visualizer', initVisualizer],
    ['features/search', initSearch],
    ['features/stats', initStats],
    ['features/modals', initModals],
    ['utils/helpers', initHelpers],
    ['utils/keyboard-shortcuts', initKeyboardShortcuts]
];

async function initializeModules() {
    for (const [name, init] of modules) {
        try {
            await init();
        } catch (error) {
            captureModuleError(name, error);
        }
    }
}

async function bootLegacyRuntime() {
    if (typeof window.init !== 'function') {
        throw new Error('Legacy NexPlay init() was not registered.');
    }
    await window.init();
}

async function boot() {
    await initializeModules();
    await bootLegacyRuntime();
    window.dispatchEvent(new CustomEvent('nexplay:app-ready'));
}

boot().catch((error) => {
    captureModuleError('app', error);
    try {
        if (typeof window.showToast === 'function') {
            window.showToast(error?.message || 'NexPlay failed to initialize.', 'error');
        }
    } catch (_) {}
});
