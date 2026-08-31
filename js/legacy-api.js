/* Backward compatibility layer for inline handlers, optional next runtime, and external automation. */

window.NexPlayLegacy = {
    getState: () => state,
    getElements: () => els,
    getCurrentTrack,
    getFilteredTracks,
    actions: {
        changeTab,
        togglePlay,
        playNext,
        playPrev,
        loadTrack,
        setSpeed,
        toggleQueueOverlay,
        toggleWindowedMode,
        enterFsMode,
        exitFsMode,
        enterVideoFsMode,
        exitVideoFsMode,
        toggleFsModeForCurrentTrack,
        addToQueue,
        openPlaylist,
        openPlaylistModal,
        renderTracks,
        renderNav,
        setFeatureToggle: (featureId, value) => setFeatureEnabled(featureId, !!value),
        applyFeaturePreset: (presetId) => applyFeaturePreset(presetId),
        exportBackup,
        importBackup
    },
    dispatchAction(action, payload = {}) {
        switch (action) {
            case 'play_pause': togglePlay(); return;
            case 'next': playNext(); return;
            case 'prev': playPrev(); return;
            case 'set_speed': if (typeof payload.speed === 'number') setSpeed(payload.speed); return;
            case 'set_feature_toggle':
                if (payload.featureId) setFeatureEnabled(payload.featureId, !!payload.value);
                return;
            case 'apply_feature_preset':
                if (payload.presetId) applyFeaturePreset(payload.presetId);
                return;
            case 'export_backup':
                exportBackup();
                return;
            case 'import_backup':
                if (payload.backup) importBackup(payload.backup, { mode: payload.mode || 'replace' });
                return;
            case 'toggle_mode':
                if (payload.mode === 'windowed') toggleWindowedMode();
                else if (payload.mode === 'fs') toggleFsModeForCurrentTrack();
                else if (payload.mode === 'video') {
                    if (state.videoFsModeActive) exitVideoFsMode();
                    else enterVideoFsMode();
                }
                return;
            case 'change_tab': if (payload.tab) changeTab(payload.tab); return;
            default: return;
        }
    }
};
window.dispatchEvent(new CustomEvent('nexplay:legacy-api-ready'));
