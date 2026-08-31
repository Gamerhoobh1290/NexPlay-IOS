/* Legacy DOM rendering for library, stats, settings, smart cards, and games.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

// --- UI RENDERING & UTILS ---
function buildFirstTrackByIdLookup(tracks = []) {
    const lookup = new Map();
    (Array.isArray(tracks) ? tracks : []).forEach((track) => {
        if (!track) return;
        const trackId = track.id;
        // Array.find() returned the first duplicate id. Preserve that behavior
        // while making every subsequent render-pass lookup constant-time.
        if (!lookup.has(trackId)) lookup.set(trackId, track);
    });
    return lookup;
}

function resolveTracksById(trackIds = [], trackById = null) {
    const lookup = trackById && typeof trackById.get === 'function'
        ? trackById
        : buildFirstTrackByIdLookup(state.tracks || []);
    return (Array.isArray(trackIds) ? trackIds : [])
        .map((trackId) => lookup.get(trackId))
        .filter(Boolean);
}

function buildFirstValueIndexLookup(values = []) {
    const lookup = new Map();
    (Array.isArray(values) ? values : []).forEach((value, index) => {
        if (!lookup.has(value)) lookup.set(value, index);
    });
    return lookup;
}

function formatTrackPlayCountLabel(track = null) {
    const count = Math.max(0, Math.trunc(Number(track?.playCount || 0)));
    return `${count} play${count === 1 ? '' : 's'}`;
}

function renderTopPlayedCountBadge(track = null, options = {}) {
    if (state.activeTab !== 'top') return '';
    const label = formatTrackPlayCountLabel(track);
    const classes = options.compact
        ? 'shrink-0 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200'
        : 'mt-3 inline-flex w-fit items-center rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200';
    return `<span data-top-played-count="${escapeHtml(String(track?.id || ''))}" class="${classes}">${escapeHtml(label)}</span>`;
}

function renderTracks(opts = {}) {
    const preserveScroll = !!opts.preserveScroll;
    if (!Array.isArray(state.tracks)) state.tracks = [];
    const hub = document.getElementById('video-url-hub');
    const onlineMusicHub = document.getElementById('online-music-hub');
    const coverWallSection = document.getElementById('library-cover-wall');
    const coverWallGrid = document.getElementById('library-cover-wall-grid');
    const isPrivateSessionRoute = isPrivateSessionRouteActive();
    const isOnlineVideosTab = !isPrivateSessionRoute && state.activeTab === 'online-videos';
    const isOnlineMusicTab = !isPrivateSessionRoute && state.activeTab === 'online-music';
    syncHeaderActionVisibility();
    if (hub) hub.classList.toggle('hidden', !isOnlineVideosTab);
    if (onlineMusicHub) onlineMusicHub.classList.toggle('hidden', !isOnlineMusicTab);
    const shouldShowCoverWall = isFeatureEnabled(FEATURE_REGISTRY.creative_dynamic_cover_wall)
        && !isPrivateSessionRoute
        && state.tracks.length > 0
        && ['all', 'audio', 'videos', 'favorites'].includes(state.activeTab);
    if (coverWallSection) {
        coverWallSection.classList.toggle('hidden', !shouldShowCoverWall);
        if (shouldShowCoverWall && coverWallGrid) {
            coverWallGrid.innerHTML = renderCoverWallModule();
            refreshLucideIcons();
        }
    }
    if (isPrivateSessionRoute) {
        renderPrivateSessionPage();
        return;
    }
    if (isOnlineVideosTab) {
        renderOnlineVideosTab();
        return;
    }
    if (isOnlineMusicTab) {
        renderOnlineMusicTab();
        return;
    }
    // If a special tab is active, render its dedicated view
    if (state.activeTab === 'stats') {
        renderStats();
        return;
    }
    if (state.activeTab === 'settings') {
        renderSettingsTab();
        return;
    }
    if (state.activeTab === 'playlists') {
        renderPlaylists();
        return;
    }
    if (state.activeTab === 'history') {
        renderHistory();
        return;
    }
    if (state.activeTab === 'queue') {
        renderQueue();
        return;
    }
    if (state.activeTab === 'tags') {
        renderTags();
        return;
    }
    // Smart playlists view: handle separately
    if (state.activeTab === 'smart') {
        renderSmart();
        return;
    }
    if (state.activeTab === 'music-games') {
        renderMusicGames();
        return;
    }
    if (state.activeTab === 'notypad') {
        renderNotyPadTab();
        return;
    }

    // Get filtered list based on current tab, search and type filters
    let filtered = getFilteredTracks() || [];
    // Guard against undefined entries which can arise if a track was deleted
    // or an unexpected value slipped into the array.  Filtering null/undefined
    // prevents runtime errors when mapping over tracks.
    filtered = filtered.filter(t => t);
    // For non-history tabs, apply sorting by name, size or date added
    const sortableTabs = ['all','audio','videos','favorites'];
    if (sortableTabs.includes(state.activeTab)) {
        filtered.sort((a, b) => {
            let cmp = 0;
            if (state.sortType === 'name') cmp = (a.title || '').localeCompare(b.title || '');
            else if (state.sortType === 'size') cmp = (a.size || 0) - (b.size || 0);
            else cmp = (a.addedAt || 0) - (b.addedAt || 0);
            return state.sortDirection === 'desc' ? -cmp : cmp;
        });
    }

    const container = els.tracksContainer;
    const prevScroll = preserveScroll && container ? container.scrollTop : null;
    const emptyEl = document.getElementById('empty-state');
    if(filtered.length === 0) {
        emptyEl.classList.remove('hidden');
        emptyEl.classList.add('flex');
        container.className = 'w-full pb-8 pt-4';
        container.classList.remove('multi-select-active');
        setEmptyStateVariant(state.tracks.length === 0 ? 'welcome' : 'basic', getEmptyStateConfig());
        container.innerHTML = '';
        updateBulkBar();
        return;
    }
    // Hide empty state when tracks are present
    emptyEl.classList.add('hidden');
    emptyEl.classList.remove('flex');

    container.className = state.viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6' : 'flex flex-col gap-3';

	            const selectedSet = new Set(state.selectedTrackIds || []);
            const performanceTier = getEffectivePerformanceTier();
            const libraryEntranceAnimationLimit = performanceTier === 'low'
                ? 20
                : performanceTier === 'degraded'
                    ? 48
                    : 160;
            const animateTrackRows = filtered.length <= 160;
	            const eagerArtworkCount = performanceTier === 'low'
                ? (state.viewMode === 'list' ? 6 : 8)
                : (state.viewMode === 'list' ? 10 : 12);
	            const entranceAnimationDuration = performanceTier === 'low'
                ? (state.viewMode === 'list' ? '0.32s' : '0.36s')
                : (state.viewMode === 'list' ? '0.55s' : '0.65s');
	            const entranceDelayLimit = performanceTier === 'low' ? 8 : 16;
	            const entranceDelayStep = performanceTier === 'low' ? 0.012 : 0.018;
	            container.innerHTML = `${filtered.map((track, i) => {
	                const isCurrent = isCurrentLibraryTrack(track);
            const coverSrc = getTrackCoverOrFallback(track);
	                const hasCover = !!coverSrc;
	                const isSelected = selectedSet.has(track.id);
	                const durationLabel = track.duration ? formatTime(track.duration) : '--:--';
            const isStreamingOnlineTrack = track.source === 'online-music';
            const queueAddAllowed = canQueueTrackInContext(track);
            const queueAddDisabledAttrs = queueAddAllowed ? '' : 'disabled aria-disabled="true"';
            const queueAddButtonClass = queueAddAllowed
                ? 'p-2.5 rounded-full hover:bg-white/20 transition'
                : 'p-2.5 rounded-full opacity-40 cursor-not-allowed';
            const queueAddIconClass = queueAddAllowed ? 'w-5 h-5 text-gray-200' : 'w-5 h-5 text-gray-500';
            const queueAddTitle = queueAddAllowed
                ? 'Add to end'
                : `Queue blocked by ${getQueueAllowedSourceLabel(getQueueAllowedSourceMode())}`;
            const shouldAnimateTrackRow = animateTrackRows && i < libraryEntranceAnimationLimit;
            const animationDelay = (Math.min(i, entranceDelayLimit) * entranceDelayStep).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
            const animationStyle = shouldAnimateTrackRow
                ? ` style="animation: ${state.viewMode === 'list' ? 'slideDown' : 'popIn'} ${entranceAnimationDuration} cubic-bezier(0.22, 1, 0.36, 1) forwards; animation-delay: ${animationDelay}s; opacity: 0;"`
                : '';
            const artworkLoading = i < eagerArtworkCount ? 'eager' : 'lazy';
        const buttons = `
            <div class="track-actions flex items-center gap-2">
	                        <button data-action="toggle-favorite" data-track-id="${track.id}" class="p-2.5 rounded-full hover:bg-white/20 transition" title="Toggle favorite">
	                            <i data-lucide="heart" class="w-5 h-5 ${track.isFavorite ? "fill-red-500 text-red-500" : "text-gray-400"}"></i>
	                        </button>

	                        <button data-action="add-queue" data-track-id="${track.id}" class="${queueAddButtonClass}" title="${escapeHtml(queueAddTitle)}" ${queueAddDisabledAttrs}>
	                            <i data-lucide="plus" class="${queueAddIconClass}"></i>
	                        </button>
	                        <button data-action="add-playlist" data-track-id="${track.id}" class="p-2.5 rounded-full hover:bg-white/20 transition" title="Add to playlist">
                    <i data-lucide="list-plus" class="w-5 h-5 text-gray-200"></i>
                </button>
                <button data-action="edit-track" data-track-id="${track.id}" class="p-2.5 rounded-full hover:bg-white/20 transition" title="Edit metadata">
                    <i data-lucide="edit" class="w-5 h-5 text-gray-200"></i>
                </button>
                <button data-action="delete-track" data-track-id="${track.id}" class="p-2.5 rounded-full hover:bg-red-500/20 hover:text-red-500 text-gray-400 transition" title="Delete track">
                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                </button>
            </div>`;

	                if(state.viewMode === 'list') {
	                    return `
	                <div data-view="list" data-track-id="${track.id}" class="library-track-item group flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer border-l-2 border-transparent hover:bg-white/5 ${isCurrent ? 'track-active' : ''} ${isSelected ? 'track-selected' : ''}"${animationStyle}>
                <div class="flex items-center flex-1 min-w-0 gap-4">
	                            <div class="w-5 h-5 flex items-center justify-center shrink-0"><input type="checkbox" data-select-checkbox="true" data-action="toggle-select" data-track-id="${track.id}" ${isSelected ? 'checked' : ''} class="multi-select-only w-4 h-4 accent-cyan-500 rounded-md border border-white/20"></div>
                    <div class="w-12 h-12 shrink-0 relative rounded-lg overflow-hidden bg-[#1a1d26] ring-1 ring-white/5">
                        <img id="img-list-${track.id}" src="${coverSrc}" loading="${artworkLoading}" decoding="async" data-track-cover-image="true" data-track-id="${track.id}" data-track-title="${escapeHtml(track.title || '')}" data-track-artist="${escapeHtml(track.artist || '')}" data-track-type="${track.type === 'video' ? 'video' : 'audio'}" class="w-full h-full object-cover ${hasCover?'':'hidden'}">
                        <div class="default-icon w-full h-full flex items-center justify-center ${hasCover?'hidden':''}">
                            <i data-lucide="${track.type === 'video' ? 'video' : 'music'}" class="text-gray-600 w-5 h-5"></i>
                        </div>
                        <div class="absolute inset-0 bg-black/50 flex items-center justify-center track-playing-overlay ${isCurrent && state.isPlaying ? '' : 'hidden'}"><div class="w-1 h-3 bg-cyan-500 animate-pulse mx-0.5"></div><div class="w-1 h-5 bg-cyan-500 animate-pulse delay-75 mx-0.5"></div><div class="w-1 h-2 bg-cyan-500 animate-pulse delay-150 mx-0.5"></div></div>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex min-w-0 items-center gap-2">
                            <h3 class="min-w-0 font-bold text-sm truncate ${isCurrent ? 'accent-text' : 'text-gray-200'}">${track.title}</h3>
                            ${renderTopPlayedCountBadge(track, { compact: true })}
                        </div>
                        <p class="text-xs text-gray-500 truncate font-mono">${track.artist}</p>
                    </div>
                </div>
                <div class="flex items-center gap-6 ml-4">
                    <span class="text-[10px] text-gray-600 font-mono hidden sm:block">${formatSize(track.size)}</span>
                    <span data-track-duration-for="${track.id}" class="text-[10px] text-gray-500 font-mono hidden sm:block">${durationLabel}</span>
                    ${buttons}
                </div>
            </div>`;
        }
	                
	                return `
	                <div data-view="grid" data-track-id="${track.id}" class="library-track-item holo-card group relative cursor-pointer rounded-2xl p-4 ${isCurrent ? 'track-active' : ''} ${isSelected ? 'track-selected' : ''}"${animationStyle}>
             <div class="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 rounded-full backdrop-blur-md">
                ${buttons}
            </div>
	                    <button data-select-button="true" class="multi-select-only absolute top-3 left-3 z-20 w-7 h-7 rounded-full border border-white/20 bg-black/60 text-white ${isSelected ? 'accent-bg' : ''}" data-action="toggle-select" data-track-id="${track.id}">
                    <i data-lucide="check" class="w-4 h-4 mx-auto select-icon-check ${isSelected ? '' : 'hidden'}"></i>
                    <i data-lucide="circle" class="w-4 h-4 mx-auto select-icon-circle ${isSelected ? 'hidden' : ''}"></i>
                </button>
            <div class="relative overflow-hidden rounded-xl aspect-square w-full mb-4 bg-black/50 shadow-inner">
                <img id="img-grid-${track.id}" src="${coverSrc}" loading="${artworkLoading}" decoding="async" data-track-cover-image="true" data-track-id="${track.id}" data-track-title="${escapeHtml(track.title || '')}" data-track-artist="${escapeHtml(track.artist || '')}" data-track-type="${track.type === 'video' ? 'video' : 'audio'}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${hasCover?'':'hidden'}">
                <div class="default-icon w-full h-full flex items-center justify-center ${hasCover?'hidden':''}">
                    <i data-lucide="${track.type === 'video' ? 'video' : 'music'}" class="text-gray-700 w-10 h-10"></i>
                </div>
                ${isStreamingOnlineTrack ? '<div class="absolute left-3 bottom-3 z-10 rounded-full border border-cyan-400/30 bg-black/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200 backdrop-blur-md">Online</div>' : ''}
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center track-playing-overlay ${isCurrent && state.isPlaying ? '' : 'hidden'}">
                    <div class="flex items-end gap-1">
                        <div class="w-1.5 h-3 bg-cyan-500 animate-pulse"></div>
                        <div class="w-1.5 h-6 bg-cyan-500 animate-pulse delay-75"></div>
                        <div class="w-1.5 h-4 bg-cyan-500 animate-pulse delay-150"></div>
                    </div>
                </div>
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                    <div class="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg transform scale-0 group-hover:scale-100 transition-transform">
                        <i data-lucide="play" class="fill-black text-black w-5 h-5 ml-1"></i>
                    </div>
                </div>
            </div>
            <h3 class="font-bold text-sm truncate text-gray-200 mb-1">${track.title}</h3>
            <p class="text-xs text-gray-500 truncate font-mono tracking-tight">${track.artist}</p>
            ${renderTopPlayedCountBadge(track)}
        </div>`;
    }).join('')}`;
    refreshLucideIcons();
    bindTrackCoverImageFallbacks(container);
    if (preserveScroll && container && typeof prevScroll === 'number') {
        container.scrollTop = prevScroll;
    }
    refreshPlayingIndicators();
    updateBulkBar();
    if (selectionController) {
        selectionController.syncFromState(state.selectedTrackIds || []);
        selectionController.refreshGeometry();
    }
    applyFeatureVisibility();
}

function shouldCropWindowedCoverArt(track = null) {
    if (!track || track?.type === 'video') return false;
    if (isOnlineMusicTrackRecord(track)) return true;
    const source = sanitizeText(track.source || '').toLowerCase();
    if (source && source !== 'local') return true;
    const trackId = normalizeOnlineMusicTrackId(track.id || '');
    const online = safeCall(() => getOnlineMusicState(), null) || {};
    const activeOnlineId = normalizeOnlineMusicTrackId(online.currentTrackId || state.currentTrackId || '');
    return !!(trackId && activeOnlineId && state.currentPlaybackSource === 'online-music' && trackId === activeOnlineId);
}

function syncWindowedOnlineCoverCrop(track = null, coverEl = null, coverSrc = '') {
    if (!coverEl) return;
    const shouldCheckCrop = shouldCropWindowedCoverArt(track);
    const forceThumbnailCrop = isLikelyYouTubeVideoThumbnailCover(coverSrc);
    const token = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    coverEl.dataset.windowedCropToken = token;

    if (!shouldCheckCrop || !coverSrc) {
        coverEl.classList.remove('windowed-online-cover-crop');
        return;
    }

    const applyCropState = () => {
        if (coverEl.dataset.windowedCropToken !== token) return;
        if ((coverEl.getAttribute('src') || '') !== coverSrc) return;
        const naturalWidth = Number(coverEl.naturalWidth || 0);
        const naturalHeight = Number(coverEl.naturalHeight || 0);
        const shouldCrop = naturalWidth > 0
            && naturalHeight > 0
            && (forceThumbnailCrop || (naturalWidth / naturalHeight) > 1.08);
        coverEl.classList.toggle('windowed-online-cover-crop', shouldCrop);
    };

    coverEl.classList.remove('windowed-online-cover-crop');
    if (coverEl.complete && Number(coverEl.naturalWidth || 0) > 0 && Number(coverEl.naturalHeight || 0) > 0) {
        applyCropState();
        return;
    }

    coverEl.addEventListener('load', applyCropState, { once: true });
    coverEl.addEventListener('error', () => {
        if (coverEl.dataset.windowedCropToken !== token) return;
        coverEl.classList.remove('windowed-online-cover-crop');
    }, { once: true });
}

	        function applyNowPlayingMetadata(track = null) {
	            const miniTitle = document.getElementById('mini-title');
	            const miniArtist = document.getElementById('mini-artist');
	            const windowedTitle = document.getElementById('windowedModeTrackTitle');
	            const windowedArtist = document.getElementById('windowedModeTrackArtist');
	            const fsModeTitle = document.getElementById('fsModeTrackTitle');
	            const fsModeArtist = document.getElementById('fsModeTrackArtist');
	            const safeTrack = track || null;
	            if (miniTitle) miniTitle.textContent = safeTrack?.title || 'No track selected';
	            if (miniArtist) miniArtist.textContent = safeTrack?.artist || 'Playback idle';
	            if (windowedTitle) windowedTitle.textContent = safeTrack?.title || 'No track selected';
	            if (windowedArtist) windowedArtist.textContent = safeTrack?.artist || 'Playback idle';
	            if (fsModeTitle) fsModeTitle.textContent = safeTrack?.title || 'No track selected';
	            if (fsModeArtist) fsModeArtist.textContent = safeTrack?.artist || 'Playback idle';
	            const cover = safeTrack
	                ? getTrackCoverOrFallback(safeTrack)
	                : buildTrackCoverPlaceholderDataUri({ title: 'NexPlay', artist: 'Ready', type: 'audio' });
	            const miniCover = document.getElementById('mini-cover');
	            const windowedCover = document.getElementById('windowedModeCoverArt');
	            const windowedBg = document.getElementById('windowedModeBgArt');
	            const fsModeCover = document.getElementById('fsModeCoverArt');
	            const fsModeBg = document.getElementById('fsModeBgArt');
    if (miniCover) {
        if (cover) {
            miniCover.src = cover;
            miniCover.classList.remove('hidden');
        } else {
            miniCover.src = '';
            miniCover.classList.add('hidden');
        }
    }
    if (windowedCover) {
        windowedCover.src = cover;
        syncWindowedOnlineCoverCrop(track, windowedCover, cover);
    }
    if (windowedBg) windowedBg.src = cover;
    if (fsModeCover) fsModeCover.src = cover;
    if (fsModeBg) fsModeBg.src = cover;
	            const videoTitle = document.getElementById('videoFsModeHoverTitle');
	            if (videoTitle) {
	                if (safeTrack?.type === 'video') {
	                    videoTitle.textContent = safeTrack.title || 'Untitled video';
	                    videoTitle.classList.remove('hidden');
	                } else {
	                    videoTitle.textContent = '';
	                    videoTitle.classList.add('hidden');
	                }
	            }
	            if (safeTrack) {
	                updateMediaSession(safeTrack, cover);
	            }
	            syncFavoriteUI(safeTrack);
	        }

	        function updateTrackUI(track) {
	            if (!track) return;
	            const isCurrent = isCurrentLibraryTrack(track);
	            if (isCurrent) {
	                applyNowPlayingMetadata(track);
    }
    const domList = document.getElementById(`img-list-${track.id}`);
    const domGrid = document.getElementById(`img-grid-${track.id}`);
    const coverSrc = getTrackCoverOrFallback(track);
    if (domList && coverSrc) {
        domList.src = coverSrc;
        domList.classList.remove('hidden');
        // Hide the placeholder element if it exists
        if (domList.nextElementSibling) {
            domList.nextElementSibling.classList.add('hidden');
        }
    }
    if (domGrid && coverSrc) {
        domGrid.src = coverSrc;
        domGrid.classList.remove('hidden');
        if (domGrid.nextElementSibling) {
            domGrid.nextElementSibling.classList.add('hidden');
        }
    }
}

	        // Keep mode favorite button visuals synced with track state
	        function syncFavoriteUI(track) {
	            const active = !!(track && track.isFavorite);
	            const btns = [getCachedElement('windowedModeFavBtn'), getCachedElement('fsModeFavBtn')].filter(Boolean);
	            const icons = [getCachedElement('windowedModeFavIcon'), getCachedElement('fsModeFavIcon')].filter(Boolean);
	            btns.forEach(btn => {
	                btn.classList.toggle('text-red-500', active);
	                btn.classList.toggle('text-gray-400', !active);
	            });
	            icons.forEach(icon => {
	                icon.classList.toggle('fill-red-500', active);
	                icon.classList.toggle('text-red-500', active);
	                icon.classList.toggle('text-gray-400', !active);
	            });
	        }

/**
 * Render the statistics view when the Stats tab is selected.
 * Displays a bar chart of the most played tracks and summary metrics.
 */
function renderStats() {
    const container = els.tracksContainer;
    const emptyEl = document.getElementById('empty-state');
    emptyEl.classList.add('hidden');
    emptyEl.classList.remove('flex');

    const totalTracks = state.tracks.length;
    const totalPlays = state.tracks.reduce((sum, t) => sum + (t.playCount || 0), 0);
    const topTracks = [...state.tracks]
        .filter(t => (t.playCount || 0) > 0)
        .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
        .slice(0, 5);

    const labels = topTracks.map(t => t.title);
    const values = topTracks.map(t => t.playCount || 0);

    const needsLayout = !container.querySelector('#stats-page');
    if (needsLayout) {
        container.innerHTML = `
            <div id="stats-page" class="w-full flex flex-col items-center justify-start py-10 gap-8 animate-pop-in">
                <div class="w-full max-w-2xl h-64 holo-panel p-4 rounded-2xl"><canvas id="stats-chart"></canvas></div>
                <div class="w-full max-w-2xl h-64 holo-panel p-4 rounded-2xl"><canvas id="history-chart"></canvas></div>
                <div id="stats-cover-wall-wrap" data-feature-id="${FEATURE_REGISTRY.creative_dynamic_cover_wall}" class="hidden w-full max-w-2xl holo-panel p-4 rounded-2xl">
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="text-xs uppercase tracking-[0.14em] text-gray-300">Dynamic Cover Wall</h4>
                        <span class="text-[10px] text-gray-500">Top played + recent</span>
                    </div>
                    <div id="stats-cover-wall"></div>
                </div>
                <div class="text-gray-400 text-sm flex flex-col items-start gap-1 max-w-2xl w-full px-2 font-mono" id="stats-summary">
                    <div id="stats-total-tracks"></div>
                    <div id="stats-total-plays"></div>
                    <div id="stats-total-listening"></div>
                </div>
            </div>
        `;
    }
    container.className = 'flex flex-col items-center';

    const totalTracksEl = document.getElementById('stats-total-tracks');
    const totalPlaysEl = document.getElementById('stats-total-plays');
    const totalListeningEl = document.getElementById('stats-total-listening');
    if (totalTracksEl) totalTracksEl.innerHTML = `<span class="font-bold text-white">Total Tracks:</span> ${totalTracks}`;
    if (totalPlaysEl) totalPlaysEl.innerHTML = `<span class="font-bold text-white">Total Plays:</span> ${totalPlays}`;
    if (totalListeningEl) totalListeningEl.innerHTML = `<span class="font-bold text-white">Total Listening Time:</span> ${formatTime(Math.floor(state.totalListeningTime))}`;

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#3b82f6';
    const statsCanvas = document.getElementById('stats-chart');
    if (statsCanvas) {
        if (window.statsChart && window.statsChart.canvas === statsCanvas) {
            window.statsChart.data.labels = labels;
            window.statsChart.data.datasets[0].data = values;
            window.statsChart.data.datasets[0].backgroundColor = `${accent}99`;
            window.statsChart.data.datasets[0].borderColor = accent;
            window.statsChart.update('none');
        } else {
            if (window.statsChart && window.statsChart.destroy) window.statsChart.destroy();
            const barCtx = statsCanvas.getContext('2d');
            window.statsChart = new Chart(barCtx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Play Count',
                        data: values,
                        backgroundColor: `${accent}99`,
                        borderColor: accent,
                        borderWidth: 1,
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            ticks: { color: '#d1d5db', font: { size: 12 } },
                            grid: { display: false }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: { color: '#d1d5db', font: { size: 12 } },
                            grid: { color: 'rgba(255,255,255,0.1)' }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `Plays: ${context.parsed.y}`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    const days = [];
    const valuesHist = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        days.push(`${d.getMonth() + 1}/${d.getDate()}`);
        const sec = state.listeningHistory[dateStr] || 0;
        valuesHist.push(Math.round((sec / 60) * 100) / 100);
    }

    const historyCanvas = document.getElementById('history-chart');
    if (historyCanvas) {
        if (window.historyChart && window.historyChart.canvas === historyCanvas) {
            window.historyChart.data.labels = days;
            window.historyChart.data.datasets[0].data = valuesHist;
            window.historyChart.data.datasets[0].borderColor = accent;
            window.historyChart.data.datasets[0].backgroundColor = `${accent}33`;
            window.historyChart.data.datasets[0].pointBackgroundColor = accent;
            window.historyChart.update('none');
        } else {
            if (window.historyChart && window.historyChart.destroy) window.historyChart.destroy();
            const histCtx = historyCanvas.getContext('2d');
            window.historyChart = new Chart(histCtx, {
                type: 'line',
                data: {
                    labels: days,
                    datasets: [{
                        label: 'Listening Time (min)',
                        data: valuesHist,
                        borderColor: accent,
                        backgroundColor: `${accent}33`,
                        tension: 0.3,
                        fill: true,
                        pointRadius: 4,
                        pointBackgroundColor: accent
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            ticks: { color: '#d1d5db', font: { size: 12 } },
                            grid: { display: false }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: { color: '#d1d5db', font: { size: 12 } },
                            grid: { color: 'rgba(255,255,255,0.1)' }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.parsed.y} min`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }
    const coverWall = document.getElementById('stats-cover-wall');
    if (coverWall) {
        coverWall.innerHTML = renderCoverWallModule();
        refreshLucideIcons();
    }
    applyFeatureVisibility();
}
function updateStatsLiveSummary(nowTs = Date.now()) {
    if (state.activeTab !== 'stats') return;
    if (!getCachedElement('stats-page')) return;
    const totalTracks = state.tracks.length;
    const totalPlays = state.tracks.reduce((sum, t) => sum + (t.playCount || 0), 0);
    setHtmlIfChanged(getCachedElement('stats-total-tracks'), `<span class="font-bold text-white">Total Tracks:</span> ${totalTracks}`);
    setHtmlIfChanged(getCachedElement('stats-total-plays'), `<span class="font-bold text-white">Total Plays:</span> ${totalPlays}`);
    setHtmlIfChanged(getCachedElement('stats-total-listening'), `<span class="font-bold text-white">Total Listening Time:</span> ${formatTime(Math.floor(state.totalListeningTime))}`);
    if (!window.historyChart || nowTs - lastStatsDetailRefreshTs < 4000) return;
    const days = [];
    const valuesHist = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        days.push(`${d.getMonth() + 1}/${d.getDate()}`);
        const sec = state.listeningHistory[dateStr] || 0;
        valuesHist.push(Math.round((sec / 60) * 100) / 100);
    }
    window.historyChart.data.labels = days;
    window.historyChart.data.datasets[0].data = valuesHist;
    window.historyChart.update('none');
    lastStatsDetailRefreshTs = nowTs;
}
/**
 * Render the queue view when the Queue tab is selected.
 * Displays the upcoming tracks in a simple list with controls to reorder or remove.
 */
function renderQueue() {
    ensureQueueForType(currentMediaType());
    const container = els.tracksContainer;
    const emptyEl = document.getElementById('empty-state');
    // Hide the empty state for queue view
    emptyEl.classList.add('hidden');
    emptyEl.classList.remove('flex');
    container.className = 'flex flex-col gap-2';
    const { type, list, offset } = getQueueDisplayList();
    const meta = getQueueSurfaceMeta(type, list);
    if (!list || list.length === 0) {
        container.innerHTML = `${renderQueueHeader(meta)}<div class="w-full text-center text-gray-400 mt-12">${type === 'shuffle' ? 'Shuffle queue is empty. Click a track to seed a shuffled queue.' : 'Queue is empty. Add tracks using the + button on any track.'}</div>`;
        return;
    }
    container.innerHTML = `${renderQueueHeader(meta)}${list.map((track, idx) => {
        if (!track) return '';
        const icon = track.type === 'video' ? 'video' : 'music';
        const actualIdx = (offset || 0) + idx;
        const reason = getAutoplayRadioReason(track.id);
        const controls = type === 'manual'
            ? `<div class="flex items-center gap-1">
                    <button onclick="moveQueueItemUp(${idx})" class="p-1 text-gray-400 hover:text-white" title="Move Up"><i data-lucide="chevron-up" class="w-4 h-4"></i></button>
                    <button onclick="moveQueueItemDown(${idx})" class="p-1 text-gray-400 hover:text-white" title="Move Down"><i data-lucide="chevron-down" class="w-4 h-4"></i></button>
                    <button onclick="event.stopPropagation();removeQueueItem(${idx})" class="p-1 text-gray-400 hover:text-red-400" title="Remove from Queue"><i data-lucide="x" class="w-4 h-4"></i></button>
                </div>`
            : `<div class="flex items-center gap-1">
                    <button onclick="moveShuffleItemUp(${actualIdx})" class="p-1 text-gray-400 hover:text-white" title="Move Up"><i data-lucide="chevron-up" class="w-4 h-4"></i></button>
                    <button onclick="moveShuffleItemDown(${actualIdx})" class="p-1 text-gray-400 hover:text-white" title="Move Down"><i data-lucide="chevron-down" class="w-4 h-4"></i></button>
                    <button onclick="event.stopPropagation();removeShuffleQueueItem(${actualIdx})" class="p-1 text-gray-400 hover:text-red-400" title="Remove from Shuffle Queue"><i data-lucide="x" class="w-4 h-4"></i></button>
                </div>`;
        return `
            <div class="flex items-center justify-between px-4 py-2 rounded-xl border border-white/10 bg-[#1a1d26]">
                <div class="flex items-center gap-3 cursor-pointer" onclick="playQueuedTrack('${track.id}', event)">
                    <i data-lucide="${icon}" class="w-4 h-4 text-gray-400"></i>
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 min-w-0">
                            <div class="text-sm text-gray-200 font-medium truncate max-w-[180px]">${track.title}</div>
                            ${renderQueueSourceBadge(track)}
                        </div>
                        <div class="text-xs text-gray-500 truncate max-w-[180px]">${track.artist || ''}${reason ? ` | ${escapeHtml(reason)}` : ''}</div>
                    </div>
                </div>
                ${controls}
            </div>`;
    }).join('')}`;
    refreshLucideIcons();
}

function persistTagMutations(tracks = []) {
    const seen = new Set();
    let hasOnlineChanges = false;
    (Array.isArray(tracks) ? tracks : [tracks]).forEach((track) => {
        if (!track) return;
        const key = sanitizeText(track.id || `${track.title || ''}:${track.artist || ''}:${track.addedAt || 0}`);
        if (seen.has(key)) return;
        seen.add(key);
        track.tags = Array.from(new Set(
            (Array.isArray(track.tags) ? track.tags : [])
                .map((tag) => sanitizeText(tag))
                .filter(Boolean)
        ));
        persistTrackMetadata(track);
        if (isOnlineMusicTrackRecord(track)) {
            syncMainLibraryTrackToOnlineState(track, { ensureSaved: true, persist: false });
            hasOnlineChanges = true;
        }
    });
    if (hasOnlineChanges) {
        persistSavedOnlineMusicLibrary();
        persistOnlineMusicState();
    }
}

function refreshAfterTagMutation() {
    renderTracks({ preserveScroll: true });
    refreshLiveViews();
}

function removeTagFromTrack(trackId, tag) {
    const track = (state.tracks || []).find((item) => item && item.id === trackId);
    if (!track || !Array.isArray(track.tags) || !track.tags.includes(tag)) return;
    track.tags = track.tags.filter((item) => item !== tag);
    persistTagMutations(track);
    refreshAfterTagMutation();
}

/**
 * Render the tags view when the Tags tab is selected.  Shows a list of tags or, if a tag
 * filter is active, shows tracks belonging to that tag with an option to go back.
 */
function renderTags() {
    const container = els.tracksContainer;
    const emptyEl = document.getElementById('empty-state');
    emptyEl.classList.add('hidden');
    emptyEl.classList.remove('flex');

    const tagCounts = new Map();
    let taggedTrackCount = 0;
    (state.tracks || []).forEach((track) => {
        const tags = Array.isArray(track?.tags) ? track.tags.map((tag) => sanitizeText(tag)).filter(Boolean) : [];
        if (tags.length > 0) taggedTrackCount += 1;
        tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
    });
    const tags = Array.from(tagCounts.entries()).sort((left, right) => left[0].localeCompare(right[0]));
    const summaryText = `${tags.length} tag${tags.length === 1 ? '' : 's'} | ${taggedTrackCount} tagged track${taggedTrackCount === 1 ? '' : 's'}`;
    const actionsHtml = `
        <div class="px-4">
            <div class="rounded-2xl border border-white/10 bg-[#151922] px-4 py-4">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div class="min-w-0">
                        <div class="text-[10px] uppercase tracking-[0.28em] text-gray-500">Tag Tools</div>
                        <div class="mt-1 text-sm text-gray-200">${summaryText}</div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button onclick="autoTagLibrary()" class="px-3 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-xs font-semibold uppercase tracking-wide text-cyan-100 hover:bg-cyan-500/20">Auto-tag Library</button>
                        <button onclick="autoTagCurrent()" class="px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-wide text-gray-200 hover:bg-white/10">Auto-tag Current</button>
                    </div>
                </div>
            </div>
        </div>`;

    container.className = 'flex flex-col gap-3';

    if (state.tagFilter) {
        const tag = state.tagFilter;
        const tracksWithTag = (state.tracks || []).filter((track) => Array.isArray(track?.tags) && track.tags.includes(tag));
        const encodedTag = encodeURIComponent(tag);
        const detailHeader = `
            <div class="flex items-center justify-between gap-3 px-4">
                <div class="min-w-0">
                    <div class="text-gray-300 text-sm">Tag: <span class="accent-text font-semibold">${escapeHtml(tag)}</span></div>
                    <div class="text-[11px] text-gray-500 font-mono">${tracksWithTag.length} track${tracksWithTag.length === 1 ? '' : 's'}</div>
                </div>
                <button onclick="state.tagFilter=null; renderTags();" class="text-xs text-gray-400 hover:text-white">Back to all tags</button>
            </div>`;
        if (!tracksWithTag.length) {
            container.innerHTML = `${actionsHtml}${detailHeader}<div class="w-full text-center text-gray-400 mt-8">No tracks with tag "${escapeHtml(tag)}".</div>`;
            refreshLucideIcons();
            return;
        }
        container.innerHTML = actionsHtml + detailHeader + tracksWithTag.map((track) => {
            const icon = track.type === 'video' ? 'video' : 'music';
            return `<div onclick="loadTrack('${track.id}', true, event)" class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-white/10 bg-[#1a1d26] cursor-pointer">
                        <div class="flex items-center gap-3 flex-1 min-w-0">
                            <i data-lucide="${icon}" class="w-4 h-4 text-gray-400"></i>
                            <div class="min-w-0">
                                <div class="text-sm text-gray-200 font-medium truncate">${escapeHtml(track.title || '')}</div>
                                <div class="text-xs text-gray-500 truncate">${escapeHtml(track.artist || '')}</div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0" onclick="event.stopPropagation()">
                            <button onclick="addToQueue(event, '${track.id}')" class="p-2 rounded-full hover:bg-white/20 transition" title="Add to Queue"><i data-lucide="plus" class="w-4 h-4 text-gray-400"></i></button>
                            <button onclick="removeTagFromTrack('${track.id}', decodeURIComponent('${encodedTag}'))" class="px-3 py-2 rounded-lg border border-rose-500/20 bg-rose-500/10 text-[11px] font-semibold uppercase tracking-wide text-rose-200 hover:bg-rose-500/20" title="Remove tag">Remove</button>
                            <button onclick="openEditModal('${track.id}')" class="p-2 rounded-full hover:bg-white/20 transition" title="Edit Metadata"><i data-lucide="edit" class="w-4 h-4 text-gray-400"></i></button>
                        </div>
                    </div>`;
        }).join('');
        refreshLucideIcons();
        return;
    }

    if (!tags.length) {
        container.innerHTML = `${actionsHtml}<div class="w-full text-center text-gray-400 mt-8">No tags available yet. Edit a track or run Auto-tag Library.</div>`;
        refreshLucideIcons();
        return;
    }

    container.innerHTML = actionsHtml + `<div class="text-gray-300 text-sm px-4">Browse tags and jump straight into the matching tracks.</div>` + tags.map(([tag, count]) => {
        const encodedTag = encodeURIComponent(tag);
        return `<div class="mx-4 flex items-center gap-2 rounded-xl border border-white/10 bg-[#1a1d26] px-3 py-3">
                    <button onclick="state.tagFilter=decodeURIComponent('${encodedTag}'); renderTags();" class="flex-1 min-w-0 text-left">
                        <div class="flex items-center justify-between gap-3">
                            <div class="min-w-0">
                                <div class="text-sm text-white font-medium truncate">${escapeHtml(tag)}</div>
                                <div class="text-[11px] text-gray-500 font-mono">${count} track${count === 1 ? '' : 's'}</div>
                            </div>
                            <span class="text-[10px] uppercase tracking-[0.24em] text-gray-500">Open</span>
                        </div>
                    </button>
                    <button onclick="renameTag(decodeURIComponent('${encodedTag}'))" class="p-2 rounded-lg text-gray-400 hover:text-white" title="Rename tag"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                    <button onclick="deleteTagGlobal(decodeURIComponent('${encodedTag}'))" class="p-2 rounded-lg text-gray-400 hover:text-red-400" title="Delete tag"><i data-lucide="trash" class="w-4 h-4"></i></button>
                </div>`;
    }).join('');
    refreshLucideIcons();
}

async function renameTag(tag) {
    const newName = await openTextPromptModal({
        title: 'Rename tag',
        label: 'Tag name',
        defaultValue: tag,
        confirmLabel: 'Rename'
    });
    if (!newName || newName === tag) return;
    const changedTracks = [];
    (state.tracks || []).forEach((track) => {
        if (!Array.isArray(track?.tags) || !track.tags.includes(tag)) return;
        track.tags = Array.from(new Set(
            track.tags
                .map((item) => item === tag ? newName : item)
                .map((item) => sanitizeText(item))
                .filter(Boolean)
        ));
        changedTracks.push(track);
    });
    if (!changedTracks.length) return;
    persistTagMutations(changedTracks);
    if (state.tagFilter === tag) state.tagFilter = newName;
    refreshAfterTagMutation();
}

function deleteTagGlobal(tag) {
    const changedTracks = [];
    (state.tracks || []).forEach((track) => {
        if (!Array.isArray(track?.tags) || !track.tags.includes(tag)) return;
        track.tags = track.tags.filter((item) => item !== tag);
        changedTracks.push(track);
    });
    if (!changedTracks.length) return;
    persistTagMutations(changedTracks);
    if (state.tagFilter === tag) state.tagFilter = null;
    refreshAfterTagMutation();
}

function isImportedOnlinePlaylist(playlist, trackById = null) {
    if (!playlist || typeof playlist !== 'object') return false;
    if (playlist.importSource === 'youtube-playlist') return true;
    const ids = Array.isArray(playlist.tracks) ? playlist.tracks : [];
    if (!ids.length) return false;
    const lookup = trackById && typeof trackById.get === 'function'
        ? trackById
        : buildFirstTrackByIdLookup(state.tracks || []);
    return ids.every((id) => {
        const t = lookup.get(id);
        return t && t.source === 'online-music';
    });
}

function getImportedPlaylistSourceLabel(playlist) {
    const importSource = sanitizeText(playlist?.importSource || '');
    if (importSource === 'youtube-playlist') return 'YouTube import';
    return 'Streaming import';
}

async function playImportedOnlinePlaylistOrdered(playlistId) {
    const pl = (state.playlists || []).find((p) => p.id === playlistId);
    if (!pl) return;
    const tracks = (pl.tracks || [])
        .map((id) => state.tracks.find((t) => t && t.id === id))
        .filter((track) => track && canQueueTrackInContext(track));
    if (!tracks.length) {
        const firstTrack = (pl.tracks || []).map((id) => state.tracks.find((t) => t && t.id === id)).find(Boolean);
        if (firstTrack) notifyQueueSourceBlocked(firstTrack);
        else showToast('This playlist has no playable tracks.', 'info');
        return;
    }
    await startTrackCollectionPlayback(tracks, tracks[0].id, {
        autoplay: true,
        queueSource: 'manual',
        isShuffle: false
    });
}

async function playImportedOnlinePlaylistShuffled(playlistId) {
    const pl = (state.playlists || []).find((p) => p.id === playlistId);
    if (!pl) return;
    const tracks = (pl.tracks || [])
        .map((id) => state.tracks.find((t) => t && t.id === id))
        .filter((track) => track && canQueueTrackInContext(track));
    if (!tracks.length) {
        const firstTrack = (pl.tracks || []).map((id) => state.tracks.find((t) => t && t.id === id)).find(Boolean);
        if (firstTrack) notifyQueueSourceBlocked(firstTrack);
        else showToast('This playlist has no playable tracks.', 'info');
        return;
    }
    const shuffled = tracks.slice();
    shuffleArray(shuffled);
    await startTrackCollectionPlayback(shuffled, shuffled[0]?.id || '', {
        autoplay: true,
        queueSource: 'manual',
        isShuffle: true
    });
}

function renderPlaylists() {
    const container = els.tracksContainer;
    const emptyEl = document.getElementById('empty-state');
    emptyEl.classList.add('hidden');
    emptyEl.classList.remove('flex');
    container.className = 'flex flex-col gap-3';
    if (!state.activePlaylistId) {
        const list = state.playlists || [];
        let html = `<div class="flex items-center justify-between px-4">
                        <div class="text-gray-300 text-sm font-semibold">Playlists</div>
                        <div class="flex gap-2">
                            <input type="text" id="playlist-name-input" placeholder="New playlist" class="w-40 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500">
                            <button onclick="createPlaylistFromInput()" class="px-3 py-2 text-xs bg-white/10 rounded-lg text-white hover:bg-white/20">Create</button>
                        </div>
                    </div>`;
        if (list.length === 0) {
            html += `<div class="w-full text-center text-gray-400 mt-8">No playlists yet. Create one to start grouping tracks.</div>`;
        } else {
            html += list.map(pl => {
                const count = pl.tracks ? pl.tracks.length : 0;
                return `<div class="flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 bg-[#1a1d26]">
                            <div class="flex items-center gap-3 cursor-pointer" onclick="openPlaylist('${pl.id}')">
                                <i data-lucide="list-music" class="w-4 h-4 text-gray-400"></i>
                                <div>
                                    <div class="text-sm text-white font-semibold">${pl.name}</div>
                                    <div class="text-[11px] text-gray-500 font-mono">${count} tracks</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2" onclick="event.stopPropagation()">
                                <button onclick="renamePlaylist('${pl.id}')" class="p-2 text-gray-400 hover:text-white" title="Rename"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                                <button onclick="deletePlaylist('${pl.id}')" class="p-2 text-gray-400 hover:text-red-400" title="Delete playlist"><i data-lucide="trash" class="w-4 h-4"></i></button>
                            </div>
                        </div>`;
            }).join('');
        }
        container.innerHTML = html;
        refreshLucideIcons();
        return;
    }
    const playlist = state.playlists.find(p => p.id === state.activePlaylistId);
    if (!playlist) { state.activePlaylistId = null; renderPlaylists(); return; }
    const playlistTrackIds = Array.isArray(playlist.tracks) ? playlist.tracks : [];
    const trackById = playlistTrackIds.length
        ? buildFirstTrackByIdLookup(state.tracks || [])
        : new Map();
    const tracks = resolveTracksById(playlistTrackIds, trackById);
    const firstPlaylistIndexByTrackId = buildFirstValueIndexLookup(playlistTrackIds);
    const importedPl = isImportedOnlinePlaylist(playlist, trackById);
    const importSourceLabel = importedPl ? getImportedPlaylistSourceLabel(playlist) : '';
    const importedPlayRow = importedPl ? `
                    <div class="flex flex-wrap gap-2 justify-end">
                        <button type="button" onclick="playImportedOnlinePlaylistOrdered('${playlist.id}')" class="px-3 py-2 text-xs font-bold uppercase tracking-wide rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20">Play in order</button>
                        <button type="button" onclick="playImportedOnlinePlaylistShuffled('${playlist.id}')" class="px-3 py-2 text-xs font-bold uppercase tracking-wide rounded-lg border border-white/15 bg-white/10 text-white hover:bg-white/20">Play in shuffle</button>
                    </div>` : '';
    let html = `<div class="flex flex-col gap-3 px-4 mb-2 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                        <div class="text-gray-300 text-sm">Playlist: <span class="accent-text font-semibold">${playlist.name}</span></div>
                        <div class="text-[11px] text-gray-500 font-mono">${tracks.length} tracks${importedPl ? ` · ${escapeHtml(importSourceLabel)}` : ''}</div>
                    </div>
                    <div class="flex flex-col items-stretch sm:items-end gap-2">
                        ${importedPlayRow}
                        <div class="flex flex-wrap gap-2 justify-end">
                        <button onclick="state.activePlaylistId=null; renderPlaylists();" class="px-3 py-2 text-xs bg-white/10 rounded-lg text-white hover:bg-white/20">Back</button>
                        <button onclick="clearPlaylist('${playlist.id}')" class="px-3 py-2 text-xs text-gray-300 hover:text-white">Clear</button>
                    </div>
                    </div>
                </div>`;
    if (tracks.length === 0) {
        html += `<div class="w-full text-center text-gray-400 mt-8">No tracks yet. Use the playlist button on any track to add here.</div>`;
        container.innerHTML = html;
        return;
    }
    html += tracks.map(t => {
        const icon = t.type === 'video' ? 'video' : 'music';
        return `<div class="flex items-center justify-between px-4 py-2 rounded-xl border border-white/10 bg-[#1a1d26]">
                    <div class="flex items-center gap-3 cursor-pointer" onclick="loadTrack('${t.id}', true, event)">
                        <i data-lucide="${icon}" class="w-4 h-4 text-gray-400"></i>
                        <span class="text-sm text-gray-200 font-medium truncate max-w-[140px]">${t.title}</span>
                        <span class="text-xs text-gray-500 truncate max-w-[100px]">${t.artist}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="moveQueueItemUp(${firstPlaylistIndexByTrackId.get(t.id) ?? -1})" class="hidden"></button>

                        <button onclick="addToQueue(event, '${t.id}')" class="p-2 text-gray-400 hover:text-white" title="Add to Queue"><i data-lucide="plus" class="w-4 h-4"></i></button>
                        <button onclick="removeFromPlaylist('${playlist.id}','${t.id}')" class="p-2 text-gray-400 hover:text-red-400" title="Remove"><i data-lucide="x" class="w-4 h-4"></i></button>
                    </div>
                </div>`;
    }).join('');
    container.innerHTML = html;
    refreshLucideIcons();
}

function openPlaylist(id) {
    state.activePlaylistId = id;
    renderPlaylists();
}

function createPlaylistFromInput() {
    const inp = document.getElementById('playlist-name-input');
    const name = inp ? sanitizeText(inp.value) : '';
    if (!name) return;
    state.playlists.push({ id: generateId(), name, tracks: [] });
    if (inp) inp.value = '';
    persistPlaylists();
    renderPlaylists();
}

async function renamePlaylist(id) {
    const pl = state.playlists.find(p => p.id === id);
    if (!pl) return;
    const val = await openTextPromptModal({
        title: 'Rename playlist',
        label: 'Playlist name',
        defaultValue: pl.name,
        confirmLabel: 'Rename'
    });
    if (!val) return;
    pl.name = sanitizeText(val);
    persistPlaylists();
    renderPlaylists();
}

function deletePlaylist(id) {
    state.playlists = state.playlists.filter(p => p.id !== id);
    if (state.activePlaylistId === id) state.activePlaylistId = null;
    persistPlaylists();
    renderPlaylists();
}

function clearPlaylist(id) {
    const pl = state.playlists.find(p => p.id === id);
    if (!pl) return;
    pl.tracks = [];
    persistPlaylists();
    renderPlaylists();
}

function removeFromPlaylist(pid, tid) {
    const pl = state.playlists.find(p => p.id === pid);
    if (!pl) return;
    pl.tracks = (pl.tracks || []).filter(id => id !== tid);
    persistPlaylists();
    renderPlaylists();
}

function persistPlaylists() {
    writeStorageJson('nexplay_pro_playlists', state.playlists);
}

function openPlaylistModal(trackId = null) {
    state.pendingPlaylistTrackId = trackId;
    populatePlaylistSelect();
    const modal = document.getElementById('playlist-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closePlaylistModal() {
    const modal = document.getElementById('playlist-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    const newInput = document.getElementById('playlist-new-name');
    if (newInput) newInput.value = '';
    state.pendingPlaylistTrackId = null;
}

function populatePlaylistSelect() {
    const select = document.getElementById('playlist-select');
    if (!select) return;
    const list = state.playlists || [];
    if (list.length === 0) {
        select.innerHTML = `<option value="">No playlists yet</option>`;
        return;
    }
    select.innerHTML = list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function createPlaylistFromModal() {
    const input = document.getElementById('playlist-new-name');
    const name = input ? sanitizeText(input.value) : '';
    if (!name) return;
    const newPl = { id: generateId(), name, tracks: [] };
    state.playlists.push(newPl);
    persistPlaylists();
    if (input) input.value = '';
    populatePlaylistSelect();
}

function savePlaylistSelection() {
    const select = document.getElementById('playlist-select');
    let pid = select ? select.value : null;
    if (!pid && state.playlists.length > 0) pid = state.playlists[0].id;
    if (!pid) {
        showToast('Create a playlist first.', 'error');
        return;
    }
    const ids = state.pendingPlaylistTrackId ? [state.pendingPlaylistTrackId] : state.selectedTrackIds.slice();
    if (!ids.length) { showToast('No tracks selected.', 'error'); return; }
    addTracksToPlaylist(pid, ids);
    closePlaylistModal();
}

function addTracksToPlaylist(pid, ids) {
    const pl = state.playlists.find(p => p.id === pid);
    if (!pl) return;
    pl.tracks = pl.tracks || [];
    ids.forEach(id => {
        if (!pl.tracks.includes(id)) pl.tracks.push(id);
    });
    persistPlaylists();
    showToast(`Added ${ids.length} track(s) to ${pl.name}.`);
    if (state.activePlaylistId === pid) renderPlaylists();
    clearSelection();
}

function renderHistory() {
    const container = els.tracksContainer;
    const emptyEl = document.getElementById('empty-state');
    emptyEl.classList.add('hidden');
    emptyEl.classList.remove('flex');
    container.className = 'flex flex-col gap-2';
    const historyIds = Array.isArray(state.playHistory) ? state.playHistory : [];
    const trackById = historyIds.length
        ? buildFirstTrackByIdLookup(state.tracks || [])
        : new Map();
    const hist = resolveTracksById(historyIds, trackById);
    let html = `<div class="flex items-center justify-between px-4 mb-2">
                    <div class="text-gray-300 text-sm font-semibold">Recently Played</div>
                    <button onclick="clearHistory()" class="text-xs text-gray-400 hover:text-white">Clear History</button>
                </div>`;
    if (hist.length === 0) {
        html += `<div class="w-full text-center text-gray-400 mt-8">No history yet. Play some tracks!</div>`;
        container.innerHTML = html;
        return;
    }
    html += hist.map(track => {
        const icon = track.type === 'video' ? 'video' : 'music';
        return `<div onclick="loadTrack('${track.id}', true, event)" class="flex items-center justify-between px-4 py-2 rounded-xl border border-white/10 bg-[#1a1d26] cursor-pointer">
                    <div class="flex items-center gap-3">
                        <i data-lucide="${icon}" class="w-4 h-4 text-gray-400"></i>
                        <span class="text-sm text-gray-200 font-medium truncate max-w-[140px]">${track.title}</span>
                        <span class="text-xs text-gray-500 truncate max-w-[100px]">${track.artist}</span>
                    </div>
                    <div data-track-duration-for="${track.id}" class="text-[10px] text-gray-500 font-mono">${formatTime(track.duration || 0)}</div>
                </div>`;
    }).join('');
    container.innerHTML = html;
    refreshLucideIcons();
}

function clearHistory() {
    state.playHistory = [];
    persistAppStateNow();
    renderHistory();
}

function getSmartAudioLibraryTracks() {
    return (state.tracks || []).filter((track) => track && track.type === 'audio');
}

function getSmartAnchorTrack() {
    const track = getActivePlaybackTrack();
    return track && track.type === 'audio' ? track : null;
}

function sortSmartTracksByScore(tracks = [], anchorTrack = null) {
    return (Array.isArray(tracks) ? tracks : [])
        .filter(Boolean)
        .slice()
        .sort((left, right) => {
            const rightScore = scoreTrackForSmartQueue(right, anchorTrack);
            const leftScore = scoreTrackForSmartQueue(left, anchorTrack);
            if (rightScore !== leftScore) return rightScore - leftScore;
            const rightPlayed = Number(right.lastPlayedAt || 0);
            const leftPlayed = Number(left.lastPlayedAt || 0);
            if (rightPlayed !== leftPlayed) return rightPlayed - leftPlayed;
            const rightAdded = Number(right.addedAt || 0);
            const leftAdded = Number(left.addedAt || 0);
            if (rightAdded !== leftAdded) return rightAdded - leftAdded;
            return String(left.id || '').localeCompare(String(right.id || ''));
        });
}

function getSmartRecommendedNextData() {
    const anchorTrack = getSmartAnchorTrack();
    if (!anchorTrack) return { tracks: [], reasons: {} };
    const radioQueue = buildAutoplayRadioQueue(anchorTrack);
    const radioQueueIds = Array.isArray(radioQueue.ids) ? radioQueue.ids : [];
    const trackById = radioQueueIds.length
        ? buildFirstTrackByIdLookup(state.tracks || [])
        : new Map();
    return {
        tracks: resolveTracksById(radioQueueIds, trackById)
            .filter((track) => track && track.type === 'audio'),
        reasons: radioQueue.reasons || {}
    };
}

function getMusicGamesState() {
    const defaults = createDefaultMusicGamesState();
    if (!state.musicGames || typeof state.musicGames !== 'object') {
        state.musicGames = {};
    }
    const games = state.musicGames;
    const topSnapshot = { ...games };
    Object.assign(games, defaults, topSnapshot);
    ['preview', 'pianoTiles', 'mathUnlock', 'snake', 'songRace', 'memoryPlaylist', 'whosThatArtist', 'finishTheLyrics', 'guessTheSong'].forEach((key) => {
        if (!games[key] || typeof games[key] !== 'object' || Array.isArray(games[key])) {
            games[key] = {};
        }
        const nestedSnapshot = { ...games[key] };
        Object.assign(games[key], defaults[key], nestedSnapshot);
    });
    return games;
}

function getMusicGameStateKey(gameId = '') {
    return ({
        'piano-tiles': 'pianoTiles',
        'math-unlock': 'mathUnlock',
        'snake-album-covers': 'snake',
        'song-race': 'songRace',
        'memory-playlist': 'memoryPlaylist',
        'whos-that-artist': 'whosThatArtist',
        'finish-the-lyrics': 'finishTheLyrics',
        'guess-the-song': 'guessTheSong'
    })[sanitizeText(gameId || '')] || null;
}

function resetMusicGameModeState(gameId = '') {
    const games = getMusicGamesState();
    const key = getMusicGameStateKey(gameId);
    if (!key) return games;
    games[key] = createDefaultMusicGamesState()[key];
    return games[key];
}

function isMusicGamePreviewActive() {
    return !!getMusicGamesState().preview.active;
}

function shouldSuppressMusicGameMetrics() {
    return !!getMusicGamesState().preview.suppressMetrics;
}

function getMusicGamePreviewTrack() {
    return getMusicGamesState().preview.previewTrack || null;
}

function getMusicGameTransportTrack() {
    if (shouldSuppressMusicGameMetrics()) {
        return getMusicGamePreviewTrack() || getCurrentTrack();
    }
    return getCurrentTrack();
}

function getMusicGameLocalAudioTracks() {
    const deduped = new Map();
    (state.tracks || []).forEach((track) => {
        if (!track || track.type !== 'audio') return;
        const trackId = sanitizeText(track.id || '');
        if (!trackId) return;
        const isLocalTrack = sanitizeText(track.source || 'local') === 'local'
            && typeof track.url === 'string'
            && track.url.trim();
        const isOnlineTrack = isOnlineMusicTrackRecord(track);
        if (!isLocalTrack && !isOnlineTrack) return;
        const existing = deduped.get(trackId);
        deduped.set(trackId, existing ? { ...existing, ...track } : track);
    });
    return Array.from(deduped.values());
}

function getMusicGameSortedLibraryTracks() {
    return getMusicGameLocalAudioTracks()
        .slice()
        .sort((left, right) => {
            const rightPlayed = Number(right.playCount || 0);
            const leftPlayed = Number(left.playCount || 0);
            if (rightPlayed !== leftPlayed) return rightPlayed - leftPlayed;
            const rightRecent = Math.max(Number(right.lastPlayedAt || 0), Number(right.addedAt || 0));
            const leftRecent = Math.max(Number(left.lastPlayedAt || 0), Number(left.addedAt || 0));
            if (rightRecent !== leftRecent) return rightRecent - leftRecent;
            return String(left.title || '').localeCompare(String(right.title || ''));
        });
}

function getMusicGameDistinctArtists() {
    return Array.from(new Set(
        getMusicGameLocalAudioTracks()
            .map((track) => sanitizeText(track.artist || ''))
            .filter(Boolean)
    ));
}

function getMusicGameTrackLyricsText(track = null) {
    if (!track) return '';
    const manualCached = String(getCustomLyricsForTrack(track, track.lyricsArtist || track.artist, track.lyricsTitle || track.title) || '').trim();
    if (manualCached) return manualCached;
    const manualInline = String(track.customLyrics || '').trim();
    if (manualInline) return manualInline;
    const assigned = String(track.assignedLyricsRaw || '').trim();
    if (assigned) return assigned;
    const cached = getOfflineLyricsForTrack(track, track.lyricsArtist || track.artist, track.lyricsTitle || track.title);
    return String(cached.manual?.raw || cached.auto?.raw || '').trim();
}

function normalizeMusicGameLyricLine(line = '') {
    return String(line || '')
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getMusicGameLyricLines(track = null) {
    const raw = getMusicGameTrackLyricsText(track);
    if (!raw) return [];
    const lines = detectLyricsFormat(raw) === 'lrc'
        ? parseSyncedLyrics(raw).map((entry) => entry?.text || '')
        : String(raw || '').split(/\r?\n/);
    return lines
        .map((line) => normalizeMusicGameLyricLine(line))
        .filter((line) => line && !/^lyrics?$/i.test(line));
}

function getMusicGameLyricTracks() {
    return getMusicGameLocalAudioTracks().filter((track) => getMusicGameLyricLines(track).length > 0);
}

function shuffleMusicGameArray(list = []) {
    const next = Array.isArray(list) ? list.slice() : [];
    for (let index = next.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    }
    return next;
}

function sampleMusicGameItems(list = [], count = 1, excluded = []) {
    const skip = new Set(Array.isArray(excluded) ? excluded.filter(Boolean) : []);
    return shuffleMusicGameArray((Array.isArray(list) ? list : []).filter((item) => {
        if (!item) return false;
        if (typeof item === 'string') return !skip.has(item);
        return !skip.has(item.id);
    })).slice(0, Math.max(0, Number(count) || 0));
}

function pickRandomMusicGameItem(list = [], excluded = []) {
    return sampleMusicGameItems(list, 1, excluded)[0] || null;
}

function getMusicGameAvailability(gameId = '') {
    const localTracks = getMusicGameLocalAudioTracks();
    const lyricTracks = getMusicGameLyricTracks();
    const artistCount = getMusicGameDistinctArtists().length;
    switch (gameId) {
        case 'piano-tiles':
            return {
                ready: localTracks.length >= 1,
                reason: localTracks.length >= 1 ? 'Ready' : 'Add library audio to start.',
                metric: `${localTracks.length} playable song${localTracks.length === 1 ? '' : 's'}`
            };
        case 'math-unlock':
        case 'snake-album-covers':
            return {
                ready: localTracks.length >= 1,
                reason: localTracks.length >= 1 ? 'Ready' : 'Add library audio to start.',
                metric: `${localTracks.length} library track${localTracks.length === 1 ? '' : 's'}`
            };
        case 'song-race':
            return {
                ready: localTracks.length >= 3,
                reason: localTracks.length >= 3 ? 'Ready' : 'Needs at least 3 library tracks.',
                metric: `${Math.min(localTracks.length, 5)} racer${Math.min(localTracks.length, 5) === 1 ? '' : 's'}`
            };
        case 'memory-playlist':
            return {
                ready: localTracks.length >= 4,
                reason: localTracks.length >= 4 ? 'Ready' : 'Needs at least 4 library tracks.',
                metric: `${Math.min(localTracks.length, 10)} cover choices`
            };
        case 'whos-that-artist':
            return {
                ready: artistCount >= 4,
                reason: artistCount >= 4 ? 'Ready' : 'Needs 4 distinct artists.',
                metric: `${artistCount} artist${artistCount === 1 ? '' : 's'}`
            };
        case 'finish-the-lyrics':
            return {
                ready: lyricTracks.length >= 1,
                reason: lyricTracks.length >= 1 ? 'Ready' : 'No lyric-ready library tracks yet.',
                metric: `${lyricTracks.length} lyric track${lyricTracks.length === 1 ? '' : 's'}`
            };
        case 'guess-the-song':
            return {
                ready: localTracks.length >= 4,
                reason: localTracks.length >= 4 ? 'Ready' : 'Needs 4 library tracks.',
                metric: `${localTracks.length} song${localTracks.length === 1 ? '' : 's'}`
            };
        default:
            return { ready: localTracks.length >= 1, reason: 'Ready', metric: `${localTracks.length}` };
    }
}

function getMusicGameCardTracks(gameId = '') {
    const sorted = getMusicGameSortedLibraryTracks();
    const seed = String(gameId || '')
        .split('')
        .reduce((total, char) => total + char.charCodeAt(0), 0);
    if (!sorted.length) return [];
    return sorted
        .slice()
        .sort((left, right) => {
            const leftWeight = ((Number(left.playCount || 0) * 11) + Number(left.addedAt || 0) + seed) % 97;
            const rightWeight = ((Number(right.playCount || 0) * 11) + Number(right.addedAt || 0) + seed) % 97;
            return rightWeight - leftWeight;
        })
        .slice(0, 3);
}

function renderMusicGameCardArtwork(gameId = '') {
    const sampleTracks = getMusicGameCardTracks(gameId);
    if (!sampleTracks.length) {
        const icon = escapeHtml(getMusicGameDefinition(gameId)?.icon || 'disc-3');
        return `<div class="flex h-20 w-20 items-center justify-center rounded-[1.35rem] border border-white/10 bg-black/30 text-gray-300">
            <i data-lucide="${icon}" class="h-8 w-8"></i>
        </div>`;
    }
    return `<div class="music-games-card-stack flex-1">
        ${sampleTracks.map((track, index) => {
            const cover = getTrackCoverOrFallback(track);
            const top = 4 + (index * 12);
            const left = 4 + (index * 28);
            const rotate = -7 + (index * 6);
            return `<div class="music-games-card-cover" style="top:${top}px; left:${left}px; transform: rotate(${rotate}deg);">
                <img src="${cover}" alt="${escapeHtml(track.title || 'Album cover')}" data-track-cover-image="true" data-track-id="${track.id}" data-track-title="${escapeHtml(track.title || '')}" data-track-artist="${escapeHtml(track.artist || '')}" data-track-type="audio">
            </div>`;
        }).join('')}
    </div>`;
}

function getMusicGameDefinition(gameId = '') {
    return MUSIC_GAME_BY_ID[sanitizeText(gameId || '')] || null;
}

function getMusicGameDisplayTitle(gameId = '') {
    const game = getMusicGameDefinition(gameId);
    if (!game) return 'Music Game';
    if (game.id === 'whos-that-artist') return "Who's That Artist?";
    return String(game.title || 'Music Game');
}

function getMusicGameDomId(value = '') {
    return sanitizeText(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'item';
}

function clearMusicGamePreviewTimer() {
    const preview = getMusicGamesState().preview;
    if (preview.endTimerId) {
        clearTimeout(preview.endTimerId);
        preview.endTimerId = null;
    }
}

function clearMusicGameSnakeTimer() {
    const snake = getMusicGamesState().snake;
    if (snake.tickTimerId) {
        clearInterval(snake.tickTimerId);
        snake.tickTimerId = null;
    }
    if (snake.rafId) {
        cancelAnimationFrame(snake.rafId);
        snake.rafId = null;
    }
    snake.lastStepAt = 0;
}

function clearMusicGameSongRaceTimer() {
    const race = getMusicGamesState().songRace;
    if (race.tickTimerId) {
        clearInterval(race.tickTimerId);
        race.tickTimerId = null;
    }
    if (race.finishTimerId) {
        clearTimeout(race.finishTimerId);
        race.finishTimerId = null;
    }
}

function clearMusicGameMemoryAdvanceTimer() {
    const memory = getMusicGamesState().memoryPlaylist;
    if (memory.revealTimerId) {
        clearTimeout(memory.revealTimerId);
        memory.revealTimerId = null;
    }
    if (memory.advanceTimerId) {
        clearTimeout(memory.advanceTimerId);
        memory.advanceTimerId = null;
    }
}

function isMusicGameViewActive(gameId = '') {
    const games = getMusicGamesState();
    return state.activeTab === 'music-games'
        && games.view === 'game'
        && games.activeGameId === gameId;
}

function getMusicGameSnakeStatusLabel(snake = {}) {
    if (snake.running) return 'Live';
    if (snake.gameOver && snake.endReason === 'cleared') return 'Cleared';
    if (snake.gameOver && snake.endReason === 'hazard') return 'Hazard Hit';
    if (snake.gameOver && snake.endReason === 'wall') return 'Wall Crash';
    if (snake.gameOver && snake.endReason === 'self') return 'Self Crash';
    return (Array.isArray(snake.snake) && snake.snake.length) ? 'Paused' : 'Ready';
}

function getMusicGameSnakeSegmentMotionStyle(segment = null, fromCell = null) {
    const currentX = Math.trunc(Number(segment?.x || 0));
    const currentY = Math.trunc(Number(segment?.y || 0));
    const previousX = Number.isFinite(Number(fromCell?.x)) ? Math.trunc(Number(fromCell.x)) : currentX;
    const previousY = Number.isFinite(Number(fromCell?.y)) ? Math.trunc(Number(fromCell.y)) : currentY;
    const dx = Math.max(-1, Math.min(1, previousX - currentX));
    const dy = Math.max(-1, Math.min(1, previousY - currentY));
    const shiftX = dx === 0 ? '0%' : `${dx * 100}%`;
    const shiftY = dy === 0 ? '0%' : `${dy * 100}%`;
    const gapX = dx === 0 ? '0rem' : (dx > 0 ? '0.35rem' : '-0.35rem');
    const gapY = dy === 0 ? '0rem' : (dy > 0 ? '0.35rem' : '-0.35rem');
    return [
        `--snake-shift-x:${shiftX}`,
        `--snake-shift-y:${shiftY}`,
        `--snake-gap-x:${gapX}`,
        `--snake-gap-y:${gapY}`
    ];
}

function renderMusicGameSnakeRuntime(snake = getMusicGamesState().snake) {
    const boardSize = Math.max(2, Number(snake.boardSize || 12));
    const segmentIndexMap = new Map((snake.snake || []).map((segment, index) => [`${segment.x}:${segment.y}`, index]));
    const hazardMap = new Set((snake.hazards || []).map((spot) => `${spot.x}:${spot.y}`));
    const motionFrom = Array.isArray(snake.motionFrom) ? snake.motionFrom : [];
    const cells = [];
    for (let y = 0; y < boardSize; y += 1) {
        for (let x = 0; x < boardSize; x += 1) {
            const cellKey = `${x}:${y}`;
            const segmentIndex = segmentIndexMap.get(cellKey);
            const isFood = snake.food && snake.food.x === x && snake.food.y === y;
            const isHazard = hazardMap.has(cellKey);
            let inner = '';
            if (typeof segmentIndex === 'number') {
                const segment = snake.snake[segmentIndex] || { x, y };
                const cover = segmentIndex > 0 ? snake.collectedCovers[segmentIndex - 1] || '' : '';
                const styleParts = getMusicGameSnakeSegmentMotionStyle(segment, motionFrom[segmentIndex]);
                if (cover) styleParts.push(`background-image:url('${cover}')`);
                inner = `<div class="music-games-snake-segment ${segmentIndex === 0 ? 'music-games-snake-head' : ''}" style="${styleParts.join(';')}"></div>`;
            } else if (isFood) {
                    inner = `<div class="music-games-food"><img src="${snake.food.cover}" alt="${escapeHtml(snake.food.title || 'Album cover')}" class="h-full w-full object-cover"></div>`;
            } else if (isHazard) {
                inner = '<div class="music-games-snake-hazard"></div>';
            }
            cells.push(`<div class="music-games-cell">${inner}</div>`);
        }
    }
    const statusLabel = getMusicGameSnakeStatusLabel(snake);
    const primaryAction = snake.running ? 'pauseMusicGameSnake()' : `startMusicGameSnake(${snake.gameOver ? 'true' : 'false'})`;
    const primaryLabel = snake.running ? 'Pause' : (snake.gameOver ? 'Play Again' : 'Resume');
    const mobileLabel = snake.running ? 'Pause' : (snake.gameOver ? 'Again' : 'Play');
    const pickupMarkup = snake.food ? `<div class="mt-3 flex items-center gap-3">
                            <div class="h-14 w-14 overflow-hidden rounded-xl border border-white/10 bg-black/40"><img src="${snake.food.cover}" alt="${escapeHtml(snake.food.title || 'Cover')}" class="h-full w-full object-cover"></div>
                            <div class="min-w-0">
                                <div class="truncate text-sm font-black text-white">${escapeHtml(snake.food.title || 'Album art')}</div>
                            <div class="mt-1 text-xs text-gray-400">Collect to extend your chain and keep the run alive.</div>
                            </div>
                        </div>` : `<div class="mt-3 text-sm text-gray-400">${snake.gameOver && snake.endReason === 'cleared' ? 'No open cells left. You cleared the board.' : 'Launch the run to begin collecting cover boosts.'}</div>`;
    const bannerMarkup = snake.gameOver
        ? `<div class="mt-5 rounded-2xl border ${snake.endReason === 'cleared' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-rose-500/30 bg-rose-500/10 text-rose-100'} px-4 py-3 text-sm leading-7">${snake.endReason === 'cleared' ? 'Board cleared. Every open cell is occupied by your trail and hazards.' : 'Run ended. Use Play Again to redeploy the board.'}</div>`
        : '';
    return `
        <section class="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-4 md:p-5">
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Survival Board</div>
                    <h3 class="mt-2 text-xl font-black text-white">Collect covers in a no-fail run with wall-bounce movement.</h3>
                    </div>
                    <div class="text-xs font-mono text-gray-500">${boardSize}x${boardSize}</div>
                </div>
                <div class="mt-5 rounded-[1.6rem] border border-white/10 bg-black/30 p-3">
                    <div class="music-games-board" style="--music-games-grid-size:${boardSize}; --music-snake-step-ms:${Math.max(140, Math.floor(Number(snake.speedMs || MUSIC_GAME_SNAKE_TICK_MS) * 0.98))}ms;">
                        ${cells.join('')}
                    </div>
                </div>
            </div>
            <div class="flex flex-col gap-5">
                <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                    <div class="grid gap-4 sm:grid-cols-2">
                        <div class="rounded-[1.3rem] border border-white/10 bg-black/25 px-4 py-4">
                            <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Score</div>
                            <div class="mt-2 text-2xl font-black text-white">${Number(snake.score || 0)}</div>
                        </div>
                        <div class="rounded-[1.3rem] border border-white/10 bg-black/25 px-4 py-4">
                            <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Length</div>
                            <div class="mt-2 text-2xl font-black text-white">${(snake.snake || []).length}</div>
                        </div>
                        <div class="rounded-[1.3rem] border border-white/10 bg-black/25 px-4 py-4">
                            <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Best Combo</div>
                            <div class="mt-2 text-2xl font-black text-white">x${Number(snake.bestCombo || 1)}</div>
                        </div>
                        <div class="rounded-[1.3rem] border border-white/10 bg-black/25 px-4 py-4">
                            <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Hazards</div>
                            <div class="mt-2 text-2xl font-black text-white">${(snake.hazards || []).length}</div>
                        </div>
                    </div>
                    <div class="mt-5 rounded-[1.5rem] border border-white/10 bg-black/30 p-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Status</div>
                        <div class="mt-2 text-sm font-black text-white">${statusLabel}</div>
                        ${pickupMarkup}
                    </div>
                    <div class="mt-5 flex flex-wrap gap-3">
                        <button onclick="${primaryAction}" class="rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.02]">${primaryLabel}</button>
                        <button onclick="startMusicGameSnake(true)" class="rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">Restart</button>
                    </div>
                    ${bannerMarkup}
                </div>
                <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Controls</div>
                    <p class="mt-3 text-sm leading-7 text-gray-400">Use arrow keys or WASD. Space pauses or resumes. Hitting a wall now bounces the snake back instead of ending the run.</p>
                    <div class="mt-5 grid w-full max-w-[15rem] grid-cols-3 gap-2">
                        <div></div>
                        <button onclick="setMusicGameSnakeDirection('up')" class="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-black text-white">&uarr;</button>
                        <div></div>
                        <button onclick="setMusicGameSnakeDirection('left')" class="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-black text-white">&larr;</button>
                        <button onclick="${primaryAction}" class="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-100">${mobileLabel}</button>
                        <button onclick="setMusicGameSnakeDirection('right')" class="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-black text-white">&rarr;</button>
                        <div></div>
                        <button onclick="setMusicGameSnakeDirection('down')" class="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-black text-white">&darr;</button>
                        <div></div>
                    </div>
                </div>
            </div>
        </section>`;
}

function syncSnakeGameDom() {
    if (!isMusicGameViewActive('snake-album-covers')) return false;
    const runtime = document.getElementById('music-games-snake-runtime');
    if (!runtime) return false;
    runtime.innerHTML = renderMusicGameSnakeRuntime(getMusicGamesState().snake);
    bindTrackCoverImageFallbacks(runtime);
    return true;
}

function getSongRaceOrderedLanes(race = getMusicGamesState().songRace) {
    return (race.lanes || [])
        .slice()
        .sort((left, right) => {
            const leftFinished = Number(left.finishedAt || 0);
            const rightFinished = Number(right.finishedAt || 0);
            if (leftFinished && rightFinished && leftFinished !== rightFinished) return leftFinished - rightFinished;
            if (leftFinished && !rightFinished) return -1;
            if (!leftFinished && rightFinished) return 1;
            const progressDelta = Number(right.progress || 0) - Number(left.progress || 0);
            if (progressDelta !== 0) return progressDelta;
            return Number(right.speed || 0) - Number(left.speed || 0);
        });
}

function renderMusicGameSongRaceRuntime(race = getMusicGamesState().songRace) {
    const ranked = getSongRaceOrderedLanes(race);
    const rankMap = new Map(ranked.map((lane, index) => [lane.trackId, index + 1]));
    const winner = (race.lanes || []).find((lane) => lane.trackId === race.winnerTrackId) || ranked[0] || null;
    const timerText = `${(Number(race.elapsedMs || 0) / 1000).toFixed(1)}s`;
    return `<section class="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                <div class="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Live Draft Race</div>
                        <h3 class="mt-2 text-2xl font-black text-white">Tap boosts and fight for first place in real time.</h3>
                    </div>
                    <div class="text-xs font-mono text-gray-400">${timerText} elapsed</div>
                </div>
                <div class="mt-5 grid gap-4" style="grid-template-columns:repeat(auto-fit,minmax(11.2rem,1fr));">
                    ${(race.lanes || []).map((lane) => {
                        const progress = Math.max(0, Math.min(100, Number(lane.progress || 0)));
                        const rank = rankMap.get(lane.trackId) || '-';
                        const finished = progress >= 100;
                        const racerBottom = Math.max(0, Math.min(98, progress));
                        const laneClass = finished
                            ? 'border-emerald-500/30 bg-emerald-500/8'
                            : 'border-white/10 bg-black/25';
                        const racerClass = `music-games-race-racer${lane.burstTicks > 0 ? ' music-games-race-racer--burst' : ''}`;
                        return `<div class="music-games-song-race-lane-card rounded-[1.5rem] border ${laneClass} px-4 py-4">
                            <div class="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">
                                <span>P${rank}</span>
                                <span>${progress.toFixed(1)}%</span>
                            </div>
                            <div class="mt-3 flex flex-col items-center text-center">
                                <div class="h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                                    <img src="${lane.cover}" alt="${escapeHtml(lane.title || 'Runner cover')}" class="h-full w-full object-cover" data-track-cover-image="true" data-track-id="${lane.trackId}" data-track-title="${escapeHtml(lane.title || '')}" data-track-artist="${escapeHtml(lane.artist || '')}" data-track-type="audio">
                                </div>
                                <div class="mt-2 min-w-0">
                                    <div class="truncate text-sm font-black text-white">${escapeHtml(lane.title || 'Untitled')}</div>
                                    <div class="mt-1 truncate text-[11px] font-mono text-gray-400">${escapeHtml(lane.artist || 'Unknown artist')}</div>
                                </div>
                            </div>
                            <div class="music-games-race-column mt-4">
                                <div class="music-games-race-lane rounded-[1rem] border border-white/10 bg-black/40">
                                    <div class="music-games-race-lane-fill rounded-[0.92rem] bg-gradient-to-t from-cyan-500/30 via-emerald-400/28 to-emerald-300/35" style="height:${progress.toFixed(2)}%"></div>
                                    <div class="${racerClass}" style="bottom:${racerBottom.toFixed(2)}%">
                                        <div class="music-games-race-racer-core">
                                            <span class="music-games-race-racer-cover">
                                                <img src="${lane.cover}" alt="${escapeHtml(lane.title || 'Runner cover')}" loading="lazy">
                                            </span>
                                            <span class="music-games-race-racer-bars" aria-hidden="true">
                                                <span class="music-games-race-racer-bar"></span>
                                                <span class="music-games-race-racer-bar"></span>
                                                <span class="music-games-race-racer-bar"></span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="mt-4 text-center text-[11px] font-mono text-gray-400">
                                <div>speed ${Number(lane.speed || 0).toFixed(2)}</div>
                                <div class="mt-1">stamina ${Math.round(Number(lane.stamina || 0))}</div>
                            </div>
                            <button onclick="boostMusicGameSongRace('${lane.trackId}')" ${!race.running || Number(race.userBoostsRemaining || 0) <= 0 || finished ? 'disabled' : ''} class="mt-4 w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-100 transition disabled:cursor-not-allowed disabled:opacity-40">Boost</button>
                        </div>`;
                    }).join('')}
                </div>
            </div>
            <div class="flex flex-col gap-5">
                <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Race Status</div>
                    <div class="mt-2 text-xl font-black text-white">${escapeHtml(race.phaseLabel || 'Ready')}</div>
                    <div class="mt-3 text-sm text-gray-400">Boost tokens remaining: <span class="font-black text-white">${Number(race.userBoostsRemaining || 0)}</span></div>
                    <div class="mt-5 rounded-[1.3rem] border border-white/10 bg-black/30 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Leader</div>
                        <div class="mt-2 text-sm font-black text-white">${escapeHtml(((race.lanes || []).find((lane) => lane.trackId === race.leaderTrackId)?.title) || 'Waiting for movement')}</div>
                    </div>
                    ${race.finished && winner ? `<div class="mt-5 rounded-[1.3rem] border border-emerald-500/30 bg-emerald-500/10 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">Winner</div>
                        <div class="mt-2 text-base font-black text-emerald-50">${escapeHtml(winner.title || 'Unknown')}</div>
                        <div class="mt-1 text-xs text-emerald-100">${escapeHtml(winner.artist || 'Unknown artist')}</div>
                    </div>` : ''}
                </div>
                <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">How This Version Works</div>
                    <ul class="mt-4 space-y-3 text-sm leading-7 text-gray-300">
                        <li>Every lane uses live acceleration, stamina drain, and random momentum swings.</li>
                        <li>Songs are shown as vertical lanes next to each other for side-by-side racing.</li>
                        <li>The winner auto-plays a 6.5s snippet from the middle of the track.</li>
                        <li>You control two tactical boosts per race to swing the leaderboard.</li>
                    </ul>
                </div>
            </div>
        </section>`;
}

function syncSongRaceDom() {
    if (!isMusicGameViewActive('song-race')) return false;
    const runtime = document.getElementById('music-games-song-race-runtime');
    if (!runtime) return false;
    runtime.innerHTML = renderMusicGameSongRaceRuntime(getMusicGamesState().songRace);
    bindTrackCoverImageFallbacks(runtime);
    return true;
}

function renderMusicGameMemoryPlaylistRuntime(memory = getMusicGamesState().memoryPlaylist, tracks = getMusicGameLocalAudioTracks()) {
    const hasTrackLookups = memory.poolTrackIds.length > 0 || memory.inputTrackIds.length > 0;
    const trackById = hasTrackLookups ? buildFirstTrackByIdLookup(tracks) : new Map();
    const poolTracks = resolveTracksById(memory.poolTrackIds, trackById);
    const expectedTrackId = memory.sequenceTrackIds[memory.inputTrackIds.length] || '';
    const maxStrikes = Math.max(1, Number(memory.maxStrikes || 3));
    const strikeMarkup = Array.from({ length: maxStrikes }).map((_, index) => {
        const used = index < Number(memory.strikes || 0);
        return `<span class="inline-flex h-6 w-6 items-center justify-center rounded-full border ${used ? 'border-rose-400/40 bg-rose-500/20 text-rose-100' : 'border-white/10 bg-black/30 text-gray-500'} text-[10px] font-black">${index + 1}</span>`;
    }).join('');
    return `<section class="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.9fr]">
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Round ${memory.round || 1}</div>
                        <h3 class="mt-2 text-2xl font-black text-white">Memorize the audio snippet sequence before strikes run out.</h3>
                    </div>
                    <div class="flex flex-wrap gap-3">
                        <button onclick="startMemoryPlaylistRound({ replay: true })" class="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">Replay Pattern</button>
                        <button onclick="advanceMemoryPlaylistRound()" ${memory.showingSequence ? 'disabled' : ''} class="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-cyan-100 transition disabled:cursor-not-allowed disabled:opacity-40">Next Pattern</button>
                        <button onclick="useMemoryPlaylistHint()" ${memory.showingSequence || !expectedTrackId ? 'disabled' : ''} class="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-amber-100 transition disabled:cursor-not-allowed disabled:opacity-40">Replay Next Snippet</button>
                        <button onclick="startMemoryPlaylistRound({ reset: true })" class="rounded-2xl bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.02]">Reset</button>
                    </div>
                </div>
                <div class="mt-5 rounded-[1.5rem] border border-white/10 bg-black/25 px-4 py-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Sequence Progress</div>
                        <div class="flex items-center gap-2">${strikeMarkup}</div>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                        ${memory.sequenceTrackIds.map((trackId, index) => {
                            const enteredTrackId = memory.inputTrackIds[index];
                            const enteredTrack = trackById.get(enteredTrackId);
                            const label = enteredTrack ? escapeHtml(enteredTrack.title || `Slot ${index + 1}`) : `Slot ${index + 1}`;
                            const classes = enteredTrack
                                ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                                : 'border-white/10 bg-black/30 text-gray-400';
                            return `<div class="rounded-full border ${classes} px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em]">${label}</div>`;
                        }).join('')}
                    </div>
                    <p class="mt-4 text-sm leading-7 text-gray-400">${escapeHtml(memory.feedback || 'Listen to the pattern, then tap tracks in order.')}</p>
                    ${memory.roundComplete ? `<div class="mt-4 rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-cyan-100">Round clear. Loading next pattern.</div>` : ''}
                </div>
                <div class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    ${poolTracks.length ? poolTracks.map((track) => renderMusicGameTrackButton(track, {
                        onclick: `chooseMemoryPlaylistTrack('${track.id}')`,
                        highlighted: false,
                        muted: memory.showingSequence
                    })).join('') : `<div class="sm:col-span-2 rounded-[1.35rem] border border-white/10 bg-black/30 px-4 py-5 text-sm text-gray-400">${memory.showingSequence ? 'Pattern reveal in progress.' : 'Start a round to load track tiles.'}</div>`}
                </div>
            </div>
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Pattern Rules</div>
                <ul class="mt-4 space-y-3 text-sm leading-7 text-gray-300">
                    <li>Each step plays a 10-second snippet with no tile highlight.</li>
                    <li>Wrong picks add strikes and reset current input for the same round.</li>
                    <li>If a snippet source fails, NexPlay automatically swaps to a fresh pattern.</li>
                    <li>Three strikes restarts the round with the same difficulty.</li>
                </ul>
                <div class="mt-6 rounded-[1.5rem] border border-white/10 bg-black/30 px-4 py-4">
                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Current Pattern Size</div>
                    <div class="mt-2 text-3xl font-black text-white">${memory.sequenceTrackIds.length || 0}</div>
                    <div class="mt-2 text-xs text-gray-400">${memory.showingSequence ? 'Reveal running now.' : 'Waiting for input.'}</div>
                    <div class="mt-2 text-xs text-gray-400">Hints used this round: ${Number(memory.hintsUsed || 0)}</div>
                </div>
            </div>
        </section>`;
}

function syncMemoryPlaylistDom() {
    if (!isMusicGameViewActive('memory-playlist')) return false;
    const runtime = document.getElementById('music-games-memory-runtime');
    if (!runtime) return false;
    runtime.innerHTML = renderMusicGameMemoryPlaylistRuntime(getMusicGamesState().memoryPlaylist, getMusicGameLocalAudioTracks());
    bindTrackCoverImageFallbacks(runtime);
    return true;
}

function resetMusicGamePlayerShell() {
    const miniTitle = getCachedElement('mini-title');
    const miniArtist = getCachedElement('mini-artist');
    const miniCover = getCachedElement('mini-cover');
    const windowedTitle = getCachedElement('windowedModeTrackTitle');
    const windowedArtist = getCachedElement('windowedModeTrackArtist');
    const fsTitle = getCachedElement('fsModeTrackTitle');
    const fsArtist = getCachedElement('fsModeTrackArtist');
    if (miniTitle) miniTitle.textContent = 'Standby';
    if (miniArtist) miniArtist.textContent = 'NexPlay OS';
    if (windowedTitle) windowedTitle.textContent = 'Standby';
    if (windowedArtist) windowedArtist.textContent = 'NexPlay OS';
    if (fsTitle) fsTitle.textContent = 'Standby';
    if (fsArtist) fsArtist.textContent = 'NexPlay OS';
    if (miniCover) {
        miniCover.src = '';
        miniCover.classList.add('hidden');
    }
}

function clearMusicGamePlayerShellSnapshot() {
    getMusicGamesState().preview.uiShellSnapshot = null;
}

function captureMusicGamePlayerShellSnapshot() {
    const preview = getMusicGamesState().preview;
    if (preview.uiShellSnapshot) return preview.uiShellSnapshot;
    const readImage = (id) => {
        const el = getCachedElement(id);
        if (!el) return null;
        return {
            src: String(el.getAttribute('src') || el.src || ''),
            hidden: el.classList.contains('hidden')
        };
    };
    const readProgress = (sliderId, fillId, currentId, durationId, remainingId = null) => {
        const slider = getCachedElement(sliderId);
        const fill = getCachedElement(fillId);
        const current = getCachedElement(currentId);
        const duration = durationId ? getCachedElement(durationId) : null;
        const remaining = remainingId ? getCachedElement(remainingId) : null;
        return {
            value: slider ? String(slider.value || '0') : '0',
            max: slider ? String(slider.max || '0') : '0',
            disabled: !!slider?.disabled,
            width: fill ? String(fill.style.width || '') : '',
            color: fill ? String(fill.style.backgroundColor || '') : '',
            currentText: current ? String(current.textContent || '') : '',
            durationText: duration ? String(duration.textContent || '') : '',
            remainingText: remaining ? String(remaining.textContent || '') : ''
        };
    };
    preview.uiShellSnapshot = {
        titles: {
            miniTitle: String(getCachedElement('mini-title')?.textContent || ''),
            miniArtist: String(getCachedElement('mini-artist')?.textContent || ''),
            windowedTitle: String(getCachedElement('windowedModeTrackTitle')?.textContent || ''),
            windowedArtist: String(getCachedElement('windowedModeTrackArtist')?.textContent || ''),
            fsTitle: String(getCachedElement('fsModeTrackTitle')?.textContent || ''),
            fsArtist: String(getCachedElement('fsModeTrackArtist')?.textContent || '')
        },
        images: {
            miniCover: readImage('mini-cover'),
            windowedCover: readImage('windowedModeCoverArt'),
            windowedBg: readImage('windowedModeBgArt'),
            fsCover: readImage('fsModeCoverArt'),
            fsBg: readImage('fsModeBgArt')
        },
        progress: {
            mini: readProgress('mini-seek-slider', 'mini-progress-fill', 'mini-time-current', 'mini-time-duration'),
            windowed: readProgress('windowedModeSeekSlider', 'windowedModeProgressFill', 'windowedModeTimeCurrent', 'windowedModeTimeDuration'),
            fs: readProgress('fsModeSeekSlider', 'fsModeProgressFill', 'fsModeTimeCurrent', 'fsModeTimeDuration'),
            videoFs: readProgress('videoFsModeSeekSlider', 'videoFsModeProgressFill', 'videoFsTimeCurrent', null, 'videoFsTimeRemaining')
        }
    };
    return preview.uiShellSnapshot;
}

function restoreMusicGamePlayerShellSnapshot(clearAfterRestore = false) {
    const preview = getMusicGamesState().preview;
    const snapshot = preview.uiShellSnapshot;
    if (!snapshot) return false;
    const applyText = (id, value) => {
        const el = getCachedElement(id);
        if (el) el.textContent = value || '';
    };
    const applyImage = (id, imageState) => {
        const el = getCachedElement(id);
        if (!el || !imageState) return;
        el.src = imageState.src || '';
        el.classList.toggle('hidden', !!imageState.hidden);
    };
    const applyProgress = (sliderId, fillId, currentId, durationId, remainingId, stateSnapshot) => {
        const slider = getCachedElement(sliderId);
        const fill = getCachedElement(fillId);
        const current = getCachedElement(currentId);
        const duration = durationId ? getCachedElement(durationId) : null;
        const remaining = remainingId ? getCachedElement(remainingId) : null;
        if (slider) {
            slider.value = stateSnapshot?.value || '0';
            slider.max = stateSnapshot?.max || '0';
            slider.disabled = !!stateSnapshot?.disabled;
        }
        if (fill) {
            fill.style.width = stateSnapshot?.width || '';
            fill.style.backgroundColor = stateSnapshot?.color || '';
        }
        if (current) current.textContent = stateSnapshot?.currentText || '';
        if (duration) duration.textContent = stateSnapshot?.durationText || '';
        if (remaining) remaining.textContent = stateSnapshot?.remainingText || '';
    };
    applyText('mini-title', snapshot.titles?.miniTitle || '');
    applyText('mini-artist', snapshot.titles?.miniArtist || '');
    applyText('windowedModeTrackTitle', snapshot.titles?.windowedTitle || '');
    applyText('windowedModeTrackArtist', snapshot.titles?.windowedArtist || '');
    applyText('fsModeTrackTitle', snapshot.titles?.fsTitle || '');
    applyText('fsModeTrackArtist', snapshot.titles?.fsArtist || '');
    applyImage('mini-cover', snapshot.images?.miniCover);
    applyImage('windowedModeCoverArt', snapshot.images?.windowedCover);
    applyImage('windowedModeBgArt', snapshot.images?.windowedBg);
    applyImage('fsModeCoverArt', snapshot.images?.fsCover);
    applyImage('fsModeBgArt', snapshot.images?.fsBg);
    applyProgress('mini-seek-slider', 'mini-progress-fill', 'mini-time-current', 'mini-time-duration', null, snapshot.progress?.mini);
    applyProgress('windowedModeSeekSlider', 'windowedModeProgressFill', 'windowedModeTimeCurrent', 'windowedModeTimeDuration', null, snapshot.progress?.windowed);
    applyProgress('fsModeSeekSlider', 'fsModeProgressFill', 'fsModeTimeCurrent', 'fsModeTimeDuration', null, snapshot.progress?.fs);
    applyProgress('videoFsModeSeekSlider', 'videoFsModeProgressFill', 'videoFsTimeCurrent', null, 'videoFsTimeRemaining', snapshot.progress?.videoFs);
    if (clearAfterRestore) clearMusicGamePlayerShellSnapshot();
    return true;
}

function captureMusicGamePlaybackSnapshot() {
    const games = getMusicGamesState();
    if (games.playbackSnapshot) return games.playbackSnapshot;
    if (isOnlineMusicPlaybackActive()) {
        const online = getOnlineMusicState();
        const currentOnlineTrack = getOnlineMusicCurrentTrack();
        games.playbackSnapshot = {
            source: 'online-music',
            trackId: sanitizeText(currentOnlineTrack?.id || online.currentTrackId || ''),
            trackSnapshot: currentOnlineTrack ? { ...currentOnlineTrack } : null,
            currentTime: Math.max(0, Number(online.currentTime || 0)),
            wasPlaying: !!online.isPlaying,
            queueMode: online.queueMode === 'shuffle' ? 'shuffle' : 'ordered',
            playbackContext: normalizeOnlineMusicPlaybackContext(online.playbackContext || 'library'),
            queueContextView: normalizeOnlineMusicPlaybackContext(online.queueContextView || online.playbackContext || 'library'),
            queueContextKey: sanitizeText(online.queueContextKey || '')
        };
        return games.playbackSnapshot;
    }
    const currentTrack = getCurrentTrack();
    if (currentTrack && (state.currentTrackId || els.audio?.src)) {
        games.playbackSnapshot = {
            source: 'local',
            trackId: sanitizeText(currentTrack.id || ''),
            trackSnapshot: { ...currentTrack },
            currentTime: Math.max(0, Number(els.audio?.currentTime || currentTrack.resumePosition || 0)),
            wasPlaying: !!state.isPlaying && !!els.audio && !els.audio.paused,
            playbackRate: Number(state.playbackSpeed || els.audio?.playbackRate || 1) || 1
        };
        return games.playbackSnapshot;
    }
    games.playbackSnapshot = { source: 'none', trackId: '', trackSnapshot: null, currentTime: 0, wasPlaying: false };
    return games.playbackSnapshot;
}

function clearMusicGamePlaybackSnapshot() {
    getMusicGamesState().playbackSnapshot = null;
}

function buildMusicGameSnippetWindow(track = null, preferredSeconds = MUSIC_GAME_DEFAULT_SNIPPET_SECONDS, options = {}) {
    const opts = {
        randomStart: false,
        minStartSeconds: 0,
        endBufferSeconds: 0,
        ...options
    };
    const duration = Math.max(0, Number(track?.duration || 0));
    const baseClip = Math.max(1.6, Number(preferredSeconds) || MUSIC_GAME_DEFAULT_SNIPPET_SECONDS);
    const clipLength = duration > 0
        ? Math.max(1.4, Math.min(baseClip, Math.max(1.4, duration * 0.55)))
        : baseClip;
    if (!(duration > 0)) {
        return { startTime: 0, durationSeconds: clipLength };
    }
    const introSkip = Math.max(0, Number(getAppSettings().playback?.skipIntroSeconds || 0));
    const minStart = Math.max(introSkip, Math.max(0, Number(opts.minStartSeconds || 0)));
    const endBuffer = Math.max(0, Number(opts.endBufferSeconds || 0));
    const maxStart = Math.max(0, duration - clipLength - Math.max(0.35, endBuffer));
    const boundedMinStart = Math.max(0, Math.min(minStart, maxStart));
    let targetStart = Math.max(boundedMinStart, Math.min(duration * 0.32, 7));
    if (opts.randomStart && maxStart > boundedMinStart + 0.12) {
        targetStart = boundedMinStart + (Math.random() * (maxStart - boundedMinStart));
    }
    return {
        startTime: Math.max(0, Math.min(maxStart, targetStart)),
        durationSeconds: clipLength
    };
}

async function prepareMusicGameSharedAudio(track = null, options = {}) {
    const opts = {
        autoplay: true,
        startTime: 0,
        playbackRate: 1,
        updateCurrentTrackId: null,
        ...options
    };
    if (!track || !track.url || !els.audio) return false;
    const games = getMusicGamesState();
    games.preview.token = Number(games.preview.token || 0) + 1;
    const requestToken = games.preview.token;
    safePauseMedia(els.audio);
    state.currentPlaybackSource = 'local';
    state.lastProgressTime = 0;
    if (opts.updateCurrentTrackId) {
        state.currentTrackId = opts.updateCurrentTrackId;
        state.currentTrack = track;
    }
    els.audio.volume = state.volume;
    els.audio.playbackRate = clampNumber(Number(opts.playbackRate) || 1, 0.5, 2.5, 1);
    state.playbackSpeed = els.audio.playbackRate;
    return new Promise((resolve) => {
        const finalize = () => {
            if (getMusicGamesState().preview.token !== requestToken) {
                resolve(false);
                return;
            }
            const duration = Math.max(0, Number(els.audio.duration || track.duration || 0));
            const safeStart = Math.max(0, Math.min(Number(opts.startTime || 0), duration > 0 ? Math.max(0, duration - 0.25) : Number(opts.startTime || 0)));
            const applyStartPosition = () => {
                if (safeStart <= 0.05) return;
                if (!safeSeekMedia(els.audio, safeStart)) {
                    safeCall(() => { els.audio.currentTime = safeStart; });
                }
            };
            applyStartPosition();
            updateProgress();
            if (opts.autoplay === false) {
                state.isPlaying = false;
                updatePlayIcons();
                refreshPlayingIndicators();
                resolve(true);
                return;
            }
            const playAttempt = els.audio.play();
            if (playAttempt && typeof playAttempt.then === 'function') {
                playAttempt.then(() => {
                    applyStartPosition();
                    resolve(true);
                }).catch(async () => {
                    const previousMutedState = !!els.audio.muted;
                    try {
                        els.audio.muted = true;
                        const mutedAttempt = els.audio.play();
                        if (mutedAttempt && typeof mutedAttempt.then === 'function') {
                            await mutedAttempt;
                        }
                        applyStartPosition();
                        resolve(true);
                    } catch (_) {
                        resolve(false);
                    } finally {
                        els.audio.muted = previousMutedState;
                    }
                });
            } else {
                applyStartPosition();
                resolve(true);
            }
        };
        els.audio.src = track.url;
        if (Number.isFinite(Number(els.audio.duration)) && Number(els.audio.duration) > 0) {
            finalize();
            return;
        }
        const onLoaded = () => finalize();
        const onError = () => resolve(false);
        els.audio.addEventListener('loadedmetadata', onLoaded, { once: true });
        els.audio.addEventListener('canplay', onLoaded, { once: true });
        els.audio.addEventListener('error', onError, { once: true });
        try { els.audio.load(); } catch (_) { finalize(); }
    });
}

async function startMusicGamePreview(track = null, options = {}) {
    const isOnlineTrack = isOnlineMusicTrackRecord(track);
    const isLocalTrack = !!track
        && sanitizeText(track.source || 'local') === 'local'
        && track.type === 'audio'
        && typeof track.url === 'string'
        && track.url.trim();
    if (!track || track.type !== 'audio' || (!isLocalTrack && !isOnlineTrack)) return false;
    const opts = {
        durationSeconds: MUSIC_GAME_DEFAULT_SNIPPET_SECONDS,
        startTime: null,
        restoreAfterEnd: false,
        randomStart: false,
        minStartSeconds: 0,
        endBufferSeconds: 0,
        ...options
    };
    captureMusicGamePlaybackSnapshot();
    captureMusicGamePlayerShellSnapshot();
    const games = getMusicGamesState();
    clearMusicGamePreviewTimer();
    games.preview.active = true;
    games.preview.suppressMetrics = true;
    games.preview.trackId = track.id;
    games.preview.previewTrack = track;
    if (isOnlineTrack) {
        stopLocalMediaTransport({ resetTime: false });
    } else if (isOnlineMusicPlaybackActive()) {
        handoffToLocalPlayback({ resetOnlineTime: false });
    } else {
        stopLocalMediaTransport({ resetTime: false });
    }
    const snippet = buildMusicGameSnippetWindow(track, opts.durationSeconds, {
        randomStart: opts.randomStart,
        minStartSeconds: opts.minStartSeconds,
        endBufferSeconds: opts.endBufferSeconds
    });
    const hasExplicitStartTime = opts.startTime !== null
        && opts.startTime !== undefined
        && Number.isFinite(Number(opts.startTime));
    const snippetStart = hasExplicitStartTime ? Number(opts.startTime) : snippet.startTime;
    const started = isOnlineTrack
        ? await playOnlineMusicTrack(track.id, {
            autoplay: true,
            startTime: snippetStart,
            playbackContext: 'library',
            queueContextView: 'library',
            queueContextKey: 'music-games-preview',
            queueMode: getOnlineMusicState().queueMode || 'ordered',
            trackSnapshot: track
        })
        : await prepareMusicGameSharedAudio(track, {
            autoplay: true,
            startTime: snippetStart,
            playbackRate: 1
        });
    if (!started) {
        games.preview.active = false;
        games.preview.suppressMetrics = false;
        await restoreMusicGamePlayback();
        return false;
    }
    restoreMusicGamePlayerShellSnapshot(false);
    const token = games.preview.token;
    games.preview.endTimerId = setTimeout(() => {
        if (getMusicGamesState().preview.token !== token) return;
        stopMusicGamePreview({ restore: opts.restoreAfterEnd === true, resetShell: false });
    }, Math.max(1200, (snippet.durationSeconds || opts.durationSeconds || MUSIC_GAME_DEFAULT_SNIPPET_SECONDS) * 1000 + MUSIC_GAME_PREVIEW_FADE_MS));
    return true;
}

async function stopMusicGamePreview(options = {}) {
    const opts = { restore: false, resetShell: false, ...options };
    const games = getMusicGamesState();
    const previewTrack = games.preview.previewTrack;
    const wasOnlinePreview = isOnlineMusicTrackRecord(previewTrack) || state.currentPlaybackSource === 'online-music';
    clearMusicGamePreviewTimer();
    games.preview.active = false;
    games.preview.trackId = null;
    games.preview.previewTrack = null;
    games.preview.token = Number(games.preview.token || 0) + 1;
    if (wasOnlinePreview) {
        deactivateOnlineMusicTransport({
            nextPlaybackSource: 'local',
            stopPlayer: true,
            resetTime: false
        });
    } else {
        safePauseMedia(els.audio);
    }
    if (state.progressInterval) {
        clearInterval(state.progressInterval);
        state.progressInterval = null;
    }
    if (opts.restore) {
        return restoreMusicGamePlayback();
    }
    games.preview.suppressMetrics = false;
    state.isPlaying = false;
    restoreMusicGamePlayerShellSnapshot(false);
    if (!games.preview.uiShellSnapshot) {
        updatePlayIcons();
        refreshPlayingIndicators();
    }
    if (opts.resetShell) resetProgressUI();
    return true;
}

async function restoreMusicGamePlayback() {
    const games = getMusicGamesState();
    const snapshot = games.playbackSnapshot;
    clearMusicGamePreviewTimer();
    games.preview.active = false;
    games.preview.trackId = null;
    games.preview.previewTrack = null;
    games.preview.token = Number(games.preview.token || 0) + 1;
    if (!snapshot || snapshot.source === 'none') {
        if (state.currentPlaybackSource === 'online-music') {
            deactivateOnlineMusicTransport({
                nextPlaybackSource: 'local',
                stopPlayer: true,
                resetTime: false
            });
        }
        safePauseMedia(els.audio);
        games.preview.suppressMetrics = false;
        games.playbackSnapshot = null;
        state.currentTrackId = '';
        state.currentTrack = null;
        state.isPlaying = false;
        updatePlayIcons();
        refreshPlayingIndicators();
        resetProgressUI();
        resetMusicGamePlayerShell();
        clearMusicGamePlayerShellSnapshot();
        return true;
    }
    games.preview.suppressMetrics = true;
    if (snapshot.source === 'online-music' && snapshot.trackId) {
        stopLocalMediaTransport({ resetTime: true });
        const restoredOnline = await playOnlineMusicTrack(snapshot.trackId, {
            autoplay: snapshot.wasPlaying,
            startTime: snapshot.currentTime || 0,
            playbackContext: snapshot.playbackContext || 'library',
            queueContextView: snapshot.queueContextView || snapshot.playbackContext || 'library',
            queueContextKey: snapshot.queueContextKey || '',
            queueMode: snapshot.queueMode || 'ordered',
            trackSnapshot: snapshot.trackSnapshot || null
        });
        if (!snapshot.wasPlaying) {
            try {
                const player = await ensureOnlineMusicPlayer(getOnlineMusicCurrentTrack()?.videoId || '');
                player.pauseVideo?.();
            } catch (_) {}
            state.isPlaying = false;
            updatePlayIcons();
        }
        games.preview.suppressMetrics = false;
        games.playbackSnapshot = null;
        clearMusicGamePlayerShellSnapshot();
        return restoredOnline;
    }
    if (snapshot.source === 'local' && snapshot.trackId) {
        if (state.currentPlaybackSource === 'online-music') {
            deactivateOnlineMusicTransport({
                nextPlaybackSource: 'local',
                stopPlayer: true,
                resetTime: false
            });
        }
        const previousTrack = (state.tracks || []).find((track) => track?.id === snapshot.trackId) || snapshot.trackSnapshot;
        if (!previousTrack || !previousTrack.url) {
            games.preview.suppressMetrics = false;
            games.playbackSnapshot = null;
            return false;
        }
        const prevTrackId = state.currentTrackId;
        state.currentTrackId = previousTrack.id;
        state.currentTrack = previousTrack;
        applyNowPlayingMetadata(previousTrack);
        updateTrackUI(previousTrack);
        applyCoverAccent(previousTrack);
        ensureActiveTrackHighlight(prevTrackId, previousTrack.id);
        resetProgressUI();
        const restoredLocal = await prepareMusicGameSharedAudio(previousTrack, {
            autoplay: snapshot.wasPlaying,
            startTime: snapshot.currentTime || 0,
            playbackRate: snapshot.playbackRate || getPreferredPlaybackSpeedForTrack(previousTrack),
            updateCurrentTrackId: previousTrack.id
        });
        if (!snapshot.wasPlaying) {
            safePauseMedia(els.audio);
            state.isPlaying = false;
            updatePlayIcons();
            refreshPlayingIndicators();
        }
        games.preview.suppressMetrics = false;
        games.playbackSnapshot = null;
        clearMusicGamePlayerShellSnapshot();
        return restoredLocal;
    }
    games.preview.suppressMetrics = false;
    games.playbackSnapshot = null;
    clearMusicGamePlayerShellSnapshot();
    return true;
}

async function teardownMusicGamesSession(options = {}) {
    const opts = { restorePlayback: true, resetState: true, ...options };
    const games = getMusicGamesState();
    await stopPianoTilesSession({ restorePlayback: false, resetPhase: false });
    clearMusicGamePreviewTimer();
    clearMusicGameSnakeTimer();
    clearMusicGameSongRaceTimer();
    clearMusicGameMemoryAdvanceTimer();
    games.snake.running = false;
    games.songRace.running = false;
    if (opts.restorePlayback && (games.playbackSnapshot || games.preview.active)) {
        await restoreMusicGamePlayback();
    } else {
        clearMusicGamePlaybackSnapshot();
        clearMusicGamePlayerShellSnapshot();
        games.preview.suppressMetrics = false;
        games.preview.active = false;
        games.preview.trackId = null;
        games.preview.previewTrack = null;
    }
    if (opts.resetState) {
        state.musicGames = createDefaultMusicGamesState();
    }
    return true;
}

function waitForMusicGame(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

const pianoTilesRuntime = {
    tiles: [],
    tileElements: new Map(),
    activeKeyTimers: new Map(),
    lastStatPaint: 0,
    lastBoardWidth: 0,
    lastBoardHeight: 0,
    visualTime: 0,
    lastVisualNow: 0
};

function sanitizeKeyBindingToken(value = '') {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 72);
}

function getKeyBindingIdentity(binding = null) {
    const code = sanitizeKeyBindingToken(binding?.code || binding || '');
    const key = sanitizeKeyBindingToken(binding?.key || '');
    return (code || key).toLowerCase();
}

function getReadableKeyBindingLabel(binding = null) {
    const code = sanitizeKeyBindingToken(binding?.code || binding || '');
    const key = sanitizeKeyBindingToken(binding?.key || '');
    const display = sanitizeKeyBindingToken(binding?.display || binding?.label || '');
    if (display && display.length <= 28) return display;
    if (code.startsWith('Numpad')) return `Numpad ${code.replace('Numpad', '')}`;
    if (code.startsWith('Digit')) return code.replace('Digit', '');
    if (code.startsWith('Key')) return code.replace('Key', '');
    if (key === ' ') return 'Space';
    if (key && key.length === 1) return key.toUpperCase();
    if (key && !['Unidentified', 'Dead', 'Process'].includes(key)) return key;
    if (code === 'Space') return 'Space';
    if (code === 'Enter') return 'Enter';
    if (code === 'Backspace') return 'Backspace';
    if (code === 'Delete') return 'Delete';
    if (code.startsWith('Arrow')) return code.replace('Arrow', 'Arrow ');
    return code ? code.replace(/([a-z])([A-Z])/g, '$1 $2') : 'Unset';
}

function createNexPlayKeybindingManager(config = {}) {
    const laneCount = Math.max(1, Math.trunc(Number(config.laneCount || 0)) || PIANO_TILES_LANE_COUNT);
    const storageKey = sanitizeKeyBindingToken(config.storageKey || '');
    const defaults = Array.from({ length: laneCount }, (_, index) => {
        const fallback = config.defaultBindings?.[index] || { code: PIANO_TILES_DEFAULT_KEYS[index] || '', key: '', display: '' };
        return {
            id: sanitizeKeyBindingToken(fallback.id || `lane-${index}`),
            label: sanitizeKeyBindingToken(fallback.label || `Lane ${index + 1}`),
            code: sanitizeKeyBindingToken(fallback.code || PIANO_TILES_DEFAULT_KEYS[index] || ''),
            key: sanitizeKeyBindingToken(fallback.key || ''),
            display: sanitizeKeyBindingToken(fallback.display || '')
        };
    });
    const invalidCodes = new Set([...(config.invalidCodes || NEXPLAY_KEYBINDING_INVALID_CODES)].map((code) => sanitizeKeyBindingToken(code)));
    const cancelCodes = new Set([...(config.cancelCodes || NEXPLAY_KEYBINDING_CANCEL_CODES)].map((code) => sanitizeKeyBindingToken(code)));

    const normalizeInput = (input = null, laneIndex = 0) => {
        if (input && typeof input === 'object' && ('code' in input || 'key' in input || 'display' in input)) {
            const code = sanitizeKeyBindingToken(input.code || '');
            const key = sanitizeKeyBindingToken(input.key || '');
            const display = sanitizeKeyBindingToken(input.display || input.label || '');
            return {
                id: sanitizeKeyBindingToken(input.id || defaults[laneIndex]?.id || `lane-${laneIndex}`),
                label: sanitizeKeyBindingToken(defaults[laneIndex]?.label || input.label || `Lane ${laneIndex + 1}`),
                code: code || key,
                key,
                display
            };
        }
        const code = sanitizeKeyBindingToken(input || '');
        return {
            id: sanitizeKeyBindingToken(defaults[laneIndex]?.id || `lane-${laneIndex}`),
            label: sanitizeKeyBindingToken(defaults[laneIndex]?.label || `Lane ${laneIndex + 1}`),
            code,
            key: '',
            display: ''
        };
    };

    const normalizeEvent = (event = null, laneIndex = 0) => {
        const code = sanitizeKeyBindingToken(event?.code || '');
        const key = sanitizeKeyBindingToken(event?.key || '');
        if (cancelCodes.has(code) || cancelCodes.has(key)) {
            return { ok: false, cancelled: true, message: 'Rebinding cancelled.' };
        }
        const invalidCode = !!code && invalidCodes.has(code);
        const invalidKey = !!key && invalidCodes.has(key);
        if (event?.isComposing || invalidCode || invalidKey || (!code && !key)) {
            return { ok: false, cancelled: false, message: 'That key cannot be assigned to a lane.' };
        }
        const binding = normalizeInput({
            code: code || key,
            key,
            display: getReadableKeyBindingLabel({ code: code || key, key })
        }, laneIndex);
        return { ok: true, binding };
    };

    const sanitizeBindings = (raw = null) => {
        const source = Array.isArray(raw) ? raw : [];
        const used = new Set();
        return defaults.map((fallback, index) => {
            let candidate = normalizeInput(source[index] || fallback, index);
            let identity = getKeyBindingIdentity(candidate);
            if (!identity || used.has(identity)) {
                candidate = normalizeInput(fallback, index);
                identity = getKeyBindingIdentity(candidate);
            }
            used.add(identity);
            return {
                ...candidate,
                id: fallback.id,
                label: fallback.label,
                display: getReadableKeyBindingLabel(candidate)
            };
        });
    };

    const save = (bindings = []) => {
        const clean = sanitizeBindings(bindings);
        if (storageKey) writeStorageJson(storageKey, clean);
        return clean;
    };

    const load = () => {
        const raw = storageKey ? readStorageJson(storageKey, defaults.map((binding) => ({ ...binding }))) : defaults;
        return sanitizeBindings(raw);
    };

    const assign = (bindings = [], laneIndex = 0, input = null) => {
        const lane = Math.max(0, Math.min(laneCount - 1, Math.trunc(Number(laneIndex || 0))));
        const current = sanitizeBindings(bindings);
        const normalized = input && input.nativeEvent ? normalizeEvent(input.nativeEvent, lane) : (
            input && typeof input === 'object' && ('preventDefault' in input || 'code' in input && 'key' in input)
                ? normalizeEvent(input, lane)
                : { ok: true, binding: normalizeInput(input, lane) }
        );
        if (!normalized.ok) return { ...normalized, bindings: current };
        const candidate = {
            ...normalized.binding,
            id: defaults[lane].id,
            label: defaults[lane].label,
            display: getReadableKeyBindingLabel(normalized.binding)
        };
        const identity = getKeyBindingIdentity(candidate);
        const invalidCandidateCode = !!candidate.code && invalidCodes.has(candidate.code);
        const invalidCandidateKey = !!candidate.key && invalidCodes.has(candidate.key);
        if (!identity || invalidCandidateCode || invalidCandidateKey) {
            return { ok: false, bindings: current, message: 'That key cannot be assigned to a lane.' };
        }
        const duplicateIndex = current.findIndex((binding, index) => index !== lane && getKeyBindingIdentity(binding) === identity);
        if (duplicateIndex >= 0 && config.allowDuplicates !== true) {
            return {
                ok: false,
                conflictLane: duplicateIndex,
                bindings: current,
                message: `${getReadableKeyBindingLabel(candidate)} is already assigned to Lane ${duplicateIndex + 1}. Choose a different key.`
            };
        }
        const next = current.slice();
        next[lane] = candidate;
        return { ok: true, lane, binding: candidate, bindings: sanitizeBindings(next) };
    };

    const findLaneForEvent = (bindings = [], event = null) => {
        const code = sanitizeKeyBindingToken(event?.code || '');
        const key = sanitizeKeyBindingToken(event?.key || '');
        if (!code && !key) return -1;
        return sanitizeBindings(bindings).findIndex((binding) => {
            const bindingCode = sanitizeKeyBindingToken(binding.code || '');
            const bindingKey = sanitizeKeyBindingToken(binding.key || '');
            if (bindingCode && code && bindingCode === code) return true;
            if (!bindingKey || !key) return false;
            return bindingKey.length === 1 && key.length === 1
                ? bindingKey.toLowerCase() === key.toLowerCase()
                : bindingKey === key;
        });
    };

    return {
        defaults,
        load,
        save,
        sanitizeBindings,
        assign,
        normalizeEvent,
        findLaneForEvent,
        getLabel: getReadableKeyBindingLabel
    };
}

let pianoTilesKeyBindingManager = null;
function getPianoTilesKeyBindingManager() {
    if (!pianoTilesKeyBindingManager) {
        pianoTilesKeyBindingManager = createNexPlayKeybindingManager({
            storageKey: PIANO_TILES_STORAGE_KEYS.keyBindings,
            laneCount: PIANO_TILES_LANE_COUNT,
            defaultBindings: PIANO_TILES_DEFAULT_BINDINGS,
            allowDuplicates: false
        });
    }
    return pianoTilesKeyBindingManager;
}

function getPianoTilesKeyCodes(bindings = []) {
    return sanitizePianoTilesKeyBindings(bindings).map((binding) => binding.code);
}

function sanitizePianoTilesKeyBindings(raw) {
    return getPianoTilesKeyBindingManager().sanitizeBindings(raw);
}

function loadPianoTilesKeyBindings() {
    const bindings = getPianoTilesKeyBindingManager().load();
    const piano = getMusicGamesState().pianoTiles;
    piano.laneBindings = bindings;
    piano.laneKeys = getPianoTilesKeyCodes(bindings);
    return bindings;
}

function persistPianoTilesKeyBindings(bindings = getMusicGamesState().pianoTiles.laneBindings || getMusicGamesState().pianoTiles.laneKeys) {
    const clean = getPianoTilesKeyBindingManager().save(bindings);
    const piano = getMusicGamesState().pianoTiles;
    piano.laneBindings = clean;
    piano.laneKeys = getPianoTilesKeyCodes(clean);
    return clean;
}

function getPianoTilesKeyLabel(binding = '') {
    return getPianoTilesKeyBindingManager().getLabel(binding);
}

function getPianoTilesLaneForKeyboardEvent(event = null) {
    const piano = getMusicGamesState().pianoTiles;
    return getPianoTilesKeyBindingManager().findLaneForEvent(piano.laneBindings || piano.laneKeys, event);
}

function isPianoTilesPlayableTrack(track = null) {
    if (!track || track.type !== 'audio') return false;
    const isLocalTrack = sanitizeText(track.source || 'local') === 'local'
        && typeof track.url === 'string'
        && track.url.trim();
    return isLocalTrack || isOnlineMusicTrackRecord(track);
}

function getPianoTilesCandidateTracks() {
    const deduped = new Map();
    const addTrack = (track, preferred = false) => {
        if (!isPianoTilesPlayableTrack(track)) return;
        const id = sanitizeText(track.id || track.videoId || '');
        if (!id) return;
        const existing = deduped.get(id);
        deduped.set(id, preferred || !existing ? { ...track } : { ...existing, ...track });
    };
    addTrack(getActivePlaybackTrack(), true);
    getMusicGameSortedLibraryTracks().forEach((track) => addTrack(track));
    return Array.from(deduped.values());
}

function getPianoTilesSelectedTrack() {
    const piano = getMusicGamesState().pianoTiles;
    const tracks = getPianoTilesCandidateTracks();
    const selected = tracks.find((track) => track.id === piano.selectedTrackId);
    if (selected) return selected;
    const active = tracks.find((track) => track.id === getActivePlaybackTrack()?.id);
    return active || tracks[0] || null;
}

function getPianoTilesTrackCacheKey(track = null) {
    if (!track) return '';
    const kind = isOnlineMusicTrackRecord(track) ? 'online' : 'local';
    const parts = [
        kind,
        sanitizeText(track.id || track.videoId || ''),
        sanitizeText(track.fingerprint || track.sourcePath || ''),
        sanitizeText(track.videoId || ''),
        Math.round(Number(track.duration || 0) || 0),
        Math.round(Number(track.size || 0) || 0),
        Math.round(Number(track.lastModified || 0) || 0)
    ];
    return parts.filter((part) => part !== '').join('|');
}

function sanitizePianoTilesBeatmapEntry(entry = null, fallbackTrackKey = '') {
    if (!entry || typeof entry !== 'object') return null;
    const tiles = (Array.isArray(entry.tiles) ? entry.tiles : [])
        .map((tile, index) => ({
            id: Number.isFinite(Number(tile?.id)) ? Math.max(0, Math.trunc(Number(tile.id))) : index,
            time: Math.max(0, Number(tile?.time || 0)),
            lane: Math.max(0, Math.min(PIANO_TILES_LANE_COUNT - 1, Math.trunc(Number(tile?.lane || 0)))),
            strength: clampNumber(tile?.strength, 0, 1, 0.5)
        }))
        .filter((tile) => Number.isFinite(tile.time))
        .sort((left, right) => left.time - right.time)
        .slice(0, 1800)
        .map((tile, index) => ({ ...tile, id: index }));
    if (!tiles.length) return null;
    return {
        schemaVersion: 1,
        trackKey: sanitizeText(entry.trackKey || fallbackTrackKey || ''),
        trackId: sanitizeText(entry.trackId || ''),
        source: sanitizeText(entry.source || 'analysis'),
        generatedAt: Math.max(0, Number(entry.generatedAt || 0) || Date.now()),
        duration: Math.max(0, Number(entry.duration || tiles[tiles.length - 1]?.time || 0)),
        bpmEstimate: Math.max(0, Number(entry.bpmEstimate || 0) || 0),
        analysisSummary: sanitizeText(entry.analysisSummary || ''),
        tiles
    };
}

function getPianoTilesBeatmapStore() {
    const raw = readStorageJson(PIANO_TILES_STORAGE_KEYS.beatmaps, {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function getCachedPianoTilesBeatmap(track = null) {
    const trackKey = getPianoTilesTrackCacheKey(track);
    if (!trackKey) return null;
    const store = getPianoTilesBeatmapStore();
    return sanitizePianoTilesBeatmapEntry(store[trackKey], trackKey);
}

function persistPianoTilesBeatmap(track = null, beatmap = null) {
    const trackKey = getPianoTilesTrackCacheKey(track);
    const clean = sanitizePianoTilesBeatmapEntry({ ...(beatmap || {}), trackKey, trackId: track?.id || '' }, trackKey);
    if (!trackKey || !clean) return false;
    const store = getPianoTilesBeatmapStore();
    store[trackKey] = clean;
    const entries = Object.entries(store)
        .map(([key, value]) => [key, sanitizePianoTilesBeatmapEntry(value, key)])
        .filter(([, value]) => !!value)
        .sort((left, right) => Number(right[1].generatedAt || 0) - Number(left[1].generatedAt || 0))
        .slice(0, 30);
    writeStorageJson(PIANO_TILES_STORAGE_KEYS.beatmaps, Object.fromEntries(entries));
    return true;
}

function getPianoTilesScoreStore() {
    const raw = readStorageJson(PIANO_TILES_STORAGE_KEYS.scores, {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function sanitizePianoTilesScoreEntry(entry = null) {
    if (!entry || typeof entry !== 'object') {
        return { lastScore: 0, highScore: 0, bestCombo: 0, plays: 0, updatedAt: 0 };
    }
    return {
        lastScore: Math.max(0, Math.trunc(Number(entry.lastScore || 0))),
        highScore: Math.max(0, Math.trunc(Number(entry.highScore || 0))),
        bestCombo: Math.max(0, Math.trunc(Number(entry.bestCombo || 0))),
        plays: Math.max(0, Math.trunc(Number(entry.plays || 0))),
        updatedAt: Math.max(0, Number(entry.updatedAt || 0) || 0)
    };
}

function getPianoTilesScoreForTrack(track = null) {
    const trackKey = getPianoTilesTrackCacheKey(track);
    const store = getPianoTilesScoreStore();
    return sanitizePianoTilesScoreEntry(trackKey ? store[trackKey] : null);
}

function applyPianoTilesScoreSnapshot(track = getPianoTilesSelectedTrack()) {
    const score = getPianoTilesScoreForTrack(track);
    const piano = getMusicGamesState().pianoTiles;
    piano.lastScore = score.lastScore;
    piano.highScore = score.highScore;
    piano.bestCombo = Math.max(Number(piano.bestCombo || 0), score.bestCombo || 0);
    return score;
}

function persistPianoTilesScore(track = null, run = {}) {
    const trackKey = getPianoTilesTrackCacheKey(track);
    if (!trackKey) return sanitizePianoTilesScoreEntry(null);
    const store = getPianoTilesScoreStore();
    const previous = sanitizePianoTilesScoreEntry(store[trackKey]);
    const lastScore = Math.max(0, Math.trunc(Number(run.score || 0)));
    const next = {
        lastScore,
        highScore: Math.max(previous.highScore, lastScore),
        bestCombo: Math.max(previous.bestCombo, Math.max(0, Math.trunc(Number(run.bestCombo || 0)))),
        plays: previous.plays + 1,
        updatedAt: Date.now()
    };
    store[trackKey] = next;
    writeStorageJson(PIANO_TILES_STORAGE_KEYS.scores, store);
    return next;
}

function hashPianoTilesString(value = '') {
    const text = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function percentileNumber(values = [], ratio = 0.5) {
    const clean = (Array.isArray(values) ? values : Array.from(values || []))
        .filter((value) => Number.isFinite(Number(value)))
        .sort((left, right) => left - right);
    if (!clean.length) return 0;
    const index = Math.max(0, Math.min(clean.length - 1, Math.floor((clean.length - 1) * clampNumber(ratio, 0, 1, 0.5))));
    return Number(clean[index] || 0);
}

function setPianoTilesAnalysisStatus(message = '', progress = null) {
    const piano = getMusicGamesState().pianoTiles;
    if (message) piano.analysisStatus = message;
    if (progress !== null) piano.analysisProgress = clampNumber(progress, 0, 100, piano.analysisProgress || 0);
    const messageEl = document.getElementById('piano-tiles-analysis-status');
    const progressEl = document.getElementById('piano-tiles-analysis-progress');
    if (messageEl) messageEl.textContent = piano.analysisStatus;
    if (progressEl) progressEl.style.width = `${Math.round(piano.analysisProgress || 0)}%`;
}

async function decodePianoTilesAudioBuffer(arrayBuffer) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('Audio analysis is unavailable in this runtime.');
    const ctx = new Ctx();
    try {
        return await new Promise((resolve, reject) => {
            const input = arrayBuffer.slice ? arrayBuffer.slice(0) : arrayBuffer;
            const maybePromise = ctx.decodeAudioData(input, resolve, reject);
            if (maybePromise && typeof maybePromise.then === 'function') {
                maybePromise.then(resolve).catch(reject);
            }
        });
    } finally {
        if (typeof ctx.close === 'function') {
            ctx.close().catch(() => {});
        }
    }
}

async function fetchPianoTilesAudioBuffer(track = null) {
    if (!track || !track.url) throw new Error('This track does not expose a decodable audio URL.');
    const url = String(track.url || '');
    if (isOnlineMusicTrackRecord(track) && /^https?:\/\/(www\.)?(youtube|youtu\.be)/i.test(url)) {
        throw new Error('Streaming playback does not expose raw waveform data.');
    }
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Audio fetch failed (${response.status}).`);
    return response.arrayBuffer();
}

function createPianoTilesSeededRandom(seed = 1) {
    let value = (Number(seed) >>> 0) || 0x9e3779b9;
    return () => {
        value += 0x6D2B79F5;
        let next = value;
        next = Math.imul(next ^ (next >>> 15), next | 1);
        next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
        return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
}

function getPianoTilesPatternProfile(time = 0, duration = 0) {
    const progress = duration > 0 ? clampNumber(time / duration, 0, 1, 0) : 0;
    if (progress < 0.34) return PIANO_TILES_PATTERN_PROFILES.early;
    if (progress < 0.72) return PIANO_TILES_PATTERN_PROFILES.mid;
    return PIANO_TILES_PATTERN_PROFILES.late;
}

function choosePianoTilesPattern(profile = PIANO_TILES_PATTERN_PROFILES.early, rng = createPianoTilesSeededRandom(1), lastLane = -1) {
    const stageId = profile?.id || 'early';
    const eligible = PIANO_TILES_PATTERN_LIBRARY.filter((pattern) => pattern.stages.includes(stageId));
    const pool = eligible.length ? eligible : PIANO_TILES_PATTERN_LIBRARY;
    const weighted = pool.map((pattern) => {
        const startsOnLastLane = lastLane >= 0 && pattern.sequence[0] === lastLane;
        return { pattern, weight: Math.max(1, Number(pattern.weight || 1) - (startsOnLastLane ? 2 : 0)) };
    });
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = rng() * Math.max(1, total);
    for (const entry of weighted) {
        cursor -= entry.weight;
        if (cursor <= 0) return entry.pattern;
    }
    return weighted[weighted.length - 1]?.pattern || PIANO_TILES_PATTERN_LIBRARY[0];
}

function createPianoTilesLanePlanner(options = {}) {
    const duration = Math.max(1, Number(options.duration || 0) || 1);
    const rng = createPianoTilesSeededRandom(options.seed || 1);
    const history = [];
    let activePattern = null;
    let activePatternIndex = 0;

    const getSameLaneRun = (lane) => {
        let run = 0;
        for (let index = history.length - 1; index >= 0; index -= 1) {
            if (history[index].lane !== lane) break;
            run += 1;
        }
        return run;
    };

    return {
        chooseLane(note = {}) {
            const profile = getPianoTilesPatternProfile(note.time, duration);
            const previous = history[history.length - 1] || null;
            const beforePrevious = history[history.length - 2] || null;
            if (!activePattern || activePatternIndex >= activePattern.sequence.length) {
                activePattern = choosePianoTilesPattern(profile, rng, previous?.lane ?? -1);
                activePatternIndex = 0;
            }
            const targetLane = activePattern.sequence[activePatternIndex] ?? 1;
            activePatternIndex += 1;
            const delta = previous ? Math.max(0, Number(note.time || 0) - Number(previous.time || 0)) : 999;
            const recent = history.filter((entry) => Number(note.time || 0) - Number(entry.time || 0) <= 1.35);
            const laneScores = Array.from({ length: PIANO_TILES_LANE_COUNT }, (_, lane) => {
                let score = Math.abs(lane - targetLane) * 1.7;
                if (lane === targetLane) score -= 3.2;
                if (profile.id === 'early' && lane === 1) score -= 0.55;
                if (previous) {
                    const distance = Math.abs(lane - previous.lane);
                    const sameRun = getSameLaneRun(lane);
                    if (lane === previous.lane) score += sameRun >= profile.maxSameRun ? 28 : 4.5;
                    if (lane === previous.lane && delta < profile.repeatGap) score += 18;
                    if (distance === 1) score -= 1.1;
                    if (distance === 2 && delta < profile.fastWideGap) score += 18;
                    if (distance === 2 && delta >= profile.fastWideGap) score += 0.7;
                }
                if (beforePrevious && previous && lane === beforePrevious.lane && Math.abs(previous.lane - beforePrevious.lane) === 2 && delta < profile.bounceGap) {
                    score += 14;
                }
                const recentLaneUse = recent.filter((entry) => entry.lane === lane).length;
                score += recentLaneUse * 1.05;
                score += rng() * 0.72;
                return { lane, score };
            });
            laneScores.sort((left, right) => left.score - right.score);
            const lane = laneScores[0]?.lane ?? targetLane;
            history.push({ lane, time: Number(note.time || 0), profile: profile.id });
            if (history.length > 16) history.shift();
            return lane;
        }
    };
}

function quantizePianoTilesNoteTime(time = 0, options = {}) {
    const beatInterval = Math.max(0.18, Number(options.beatInterval || 0.5) || 0.5);
    const profile = getPianoTilesPatternProfile(time, options.duration || 0);
    const subdivision = beatInterval / Math.max(1, Number(profile.snapSubdivision || 1));
    const anchor = Math.max(0, Number(options.anchor || 0));
    const stepIndex = Math.round((Number(time || 0) - anchor) / subdivision);
    const snapped = anchor + (stepIndex * subdivision);
    const tolerance = Math.min(profile.snapTolerance, subdivision * 0.24);
    return Math.abs(snapped - time) <= tolerance ? Math.max(0, snapped) : Number(time || 0);
}

function buildPianoTilesPatternedTiles(candidates = [], options = {}) {
    const duration = Math.max(1, Number(options.duration || 0) || 1);
    const beatInterval = Math.max(0.18, Number(options.beatInterval || 0) || (60 / Math.max(60, Number(options.bpmEstimate || 120) || 120)));
    const maxTiles = Math.max(16, Math.min(1800, Math.trunc(Number(options.maxTiles || 1200))));
    const seed = Number(options.seed || 1) >>> 0;
    const planner = createPianoTilesLanePlanner({ seed, duration });
    const ordered = (Array.isArray(candidates) ? candidates : [])
        .map((candidate) => ({
            time: Math.max(0, Number(candidate?.time || 0)),
            strength: clampNumber(candidate?.strength, 0.12, 1, 0.5),
            onset: Math.max(0, Number(candidate?.onset || 0)),
            energy: Math.max(0, Number(candidate?.energy || 0))
        }))
        .filter((candidate) => Number.isFinite(candidate.time) && candidate.time >= 0.18 && candidate.time <= duration - 0.16)
        .sort((left, right) => left.time - right.time || right.strength - left.strength);
    const anchor = ordered[0]?.time || 0.72;
    const tiles = [];
    let lastAcceptedTime = -999;

    // Timing and lane choice are intentionally separate: audio/tempo picks readable note
    // moments, then a small pattern planner assigns lanes with keyboard comfort guards.
    for (const candidate of ordered) {
        if (tiles.length >= maxTiles) break;
        const profile = getPianoTilesPatternProfile(candidate.time, duration);
        const minGap = Math.max(0.14, Math.min(profile.minGap, beatInterval * (profile.id === 'early' ? 0.86 : 0.66)));
        const time = quantizePianoTilesNoteTime(candidate.time, { beatInterval, duration, anchor });
        if (time - lastAcceptedTime < minGap) {
            const previous = tiles[tiles.length - 1];
            if (!previous || candidate.strength <= previous.strength + 0.16 || time - lastAcceptedTime < 0.12) continue;
            previous.time = Number(time.toFixed(4));
            previous.strength = Number(candidate.strength.toFixed(3));
            lastAcceptedTime = time;
            continue;
        }
        const lane = planner.chooseLane({ ...candidate, time });
        tiles.push({
            id: tiles.length,
            time: Number(time.toFixed(4)),
            lane,
            strength: Number(candidate.strength.toFixed(3))
        });
        lastAcceptedTime = time;
    }
    return tiles.map((tile, index) => ({ ...tile, id: index }));
}

async function buildPianoTilesBeatmapFromAudioBuffer(audioBuffer, track = null) {
    const duration = Math.max(0, Number(audioBuffer?.duration || track?.duration || 0));
    const sampleRate = Math.max(1, Number(audioBuffer?.sampleRate || 44100));
    const channels = [];
    for (let index = 0; index < Math.min(2, audioBuffer.numberOfChannels || 1); index += 1) {
        channels.push(audioBuffer.getChannelData(index));
    }
    if (!channels.length || !duration) throw new Error('Decoded audio did not contain usable samples.');
    const hopSize = Math.max(512, Math.floor(sampleRate * 0.035));
    const windowSize = Math.max(hopSize * 2, Math.floor(sampleRate * 0.075));
    const step = Math.max(1, Math.floor(sampleRate / 11025));
    const frameCount = Math.max(1, Math.floor((channels[0].length - windowSize) / hopSize));
    const energies = new Float32Array(frameCount);
    const onsets = new Float32Array(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) {
        const start = frame * hopSize;
        const end = Math.min(channels[0].length, start + windowSize);
        let sum = 0;
        let count = 0;
        for (let sample = start; sample < end; sample += step) {
            let mixed = 0;
            for (let channel = 0; channel < channels.length; channel += 1) {
                mixed += channels[channel][sample] || 0;
            }
            mixed /= channels.length;
            sum += mixed * mixed;
            count += 1;
        }
        energies[frame] = Math.sqrt(sum / Math.max(1, count));
        if (frame > 0 && frame % 420 === 0) {
            setPianoTilesAnalysisStatus('Scanning waveform peaks...', 24 + Math.min(34, (frame / frameCount) * 34));
            await waitForMusicGame(0);
        }
    }
    for (let frame = 1; frame < frameCount; frame += 1) {
        const lookbackStart = Math.max(0, frame - 10);
        let localAverage = 0;
        for (let cursor = lookbackStart; cursor < frame; cursor += 1) {
            localAverage += energies[cursor] || 0;
        }
        localAverage /= Math.max(1, frame - lookbackStart);
        onsets[frame] = Math.max(0, energies[frame] - localAverage);
    }
    const onsetValues = Array.from(onsets);
    const onsetThreshold = Math.max(
        percentileNumber(onsetValues, 0.74),
        percentileNumber(onsetValues, 0.55) * 1.42
    );
    const frameSeconds = hopSize / sampleRate;
    const minGapFrames = Math.max(3, Math.round(0.18 / frameSeconds));
    const rawPeaks = [];
    let lastPeakFrame = -minGapFrames;
    for (let frame = 2; frame < frameCount - 2; frame += 1) {
        const onset = onsets[frame] || 0;
        if (onset < onsetThreshold) continue;
        const localMax = onset >= onsets[frame - 1] && onset >= onsets[frame + 1] && onset >= onsets[frame - 2] && onset >= onsets[frame + 2];
        if (!localMax) continue;
        if (frame - lastPeakFrame < minGapFrames) {
            const previous = rawPeaks[rawPeaks.length - 1];
            if (previous && onset > previous.onset) {
                previous.frame = frame;
                previous.time = frame * frameSeconds;
                previous.onset = onset;
                previous.energy = energies[frame] || 0;
                lastPeakFrame = frame;
            }
            continue;
        }
        rawPeaks.push({
            frame,
            time: frame * frameSeconds,
            onset,
            energy: energies[frame] || 0
        });
        lastPeakFrame = frame;
    }
    setPianoTilesAnalysisStatus('Locking rhythm grid...', 70);
    await waitForMusicGame(0);
    const peakIntervals = [];
    for (let index = 1; index < rawPeaks.length; index += 1) {
        const delta = rawPeaks[index].time - rawPeaks[index - 1].time;
        if (delta >= 0.24 && delta <= 1.25) peakIntervals.push(delta);
    }
    let beatInterval = percentileNumber(peakIntervals, 0.5) || 0.5;
    while (beatInterval > 0.82) beatInterval /= 2;
    while (beatInterval < 0.28) beatInterval *= 2;
    const bpmEstimate = beatInterval > 0 ? Math.round(60 / beatInterval) : 120;
    const maxTiles = Math.max(24, Math.min(1600, Math.round(duration * 3.4)));
    const strengthMax = Math.max(percentileNumber(rawPeaks.map((peak) => peak.onset), 0.96), 0.0001);
    let candidates = rawPeaks
        .filter((peak) => peak.time >= 0.28 && peak.time <= Math.max(0.5, duration - 0.18))
        .map((peak) => ({
            ...peak,
            strength: clampNumber(peak.onset / strengthMax, 0.16, 1, 0.45)
        }));
    if (candidates.length > maxTiles) {
        const keepThreshold = percentileNumber(candidates.map((peak) => peak.strength), 1 - (maxTiles / candidates.length));
        candidates = candidates.filter((peak) => peak.strength >= keepThreshold).slice(0, maxTiles);
    }
    candidates.sort((left, right) => left.time - right.time);
    const patternSeed = hashPianoTilesString([
        getPianoTilesTrackCacheKey(track),
        Math.round(duration * 10),
        bpmEstimate,
        candidates.length
    ].filter(Boolean).join('|'));
    const tiles = buildPianoTilesPatternedTiles(candidates, {
        duration,
        beatInterval,
        bpmEstimate,
        maxTiles,
        seed: patternSeed
    });
    if (tiles.length < Math.max(18, duration / 4)) {
        return generateFallbackPianoTilesBeatmap(track, {
            duration,
            source: 'analysis-assisted-grid',
            bpmEstimate,
            analysisSummary: 'Waveform peaks were sparse, so NexPlay filled a steady rhythm grid.'
        });
    }
    return sanitizePianoTilesBeatmapEntry({
        source: 'waveform-analysis',
        generatedAt: Date.now(),
        duration,
        bpmEstimate,
        analysisSummary: `${tiles.length} waveform peaks mapped near ${bpmEstimate || 120} BPM with staged keyboard-friendly lane patterns.`,
        tiles
    });
}

function generateFallbackPianoTilesBeatmap(track = null, options = {}) {
    const duration = Math.max(18, Number(options.duration || track?.duration || 90) || 90);
    const seed = hashPianoTilesString([
        track?.id,
        track?.title,
        track?.artist,
        track?.videoId,
        Math.round(duration)
    ].filter(Boolean).join('|'));
    const bpm = Math.max(76, Math.min(158, Number(options.bpmEstimate || 0) || (92 + (seed % 54))));
    const beat = 60 / bpm;
    const candidates = [];
    for (let beatIndex = 0, time = 0.72; time < duration - 0.28 && candidates.length < 1700; beatIndex += 1, time += beat) {
        const profile = getPianoTilesPatternProfile(time, duration);
        const barAccent = beatIndex % 4 === 0;
        const backbeat = beatIndex % 4 === 2;
        const deterministicRoll = (seed + beatIndex * 37) % 100;
        const includeBeat = barAccent
            || (profile.id === 'early' ? (backbeat && deterministicRoll > 24) : deterministicRoll > (profile.id === 'mid' ? 15 : 8));
        if (!includeBeat) continue;
        candidates.push({
            time: Number(time.toFixed(4)),
            strength: barAccent ? 0.84 : (backbeat ? 0.62 : 0.48),
            onset: barAccent ? 1 : 0.56,
            energy: barAccent ? 0.82 : 0.46
        });
        const syncopate = profile.id !== 'early' && !barAccent && ((seed + beatIndex * 19) % (profile.id === 'mid' ? 13 : 9) === 0);
        if (syncopate && time + beat * 0.5 < duration - 0.28) {
            candidates.push({
                time: Number((time + beat * 0.5).toFixed(4)),
                strength: profile.id === 'late' ? 0.66 : 0.56,
                onset: 0.64,
                energy: 0.52
            });
        }
    }
    const tiles = buildPianoTilesPatternedTiles(candidates, {
        duration,
        bpmEstimate: bpm,
        beatInterval: beat,
        maxTiles: 1500,
        seed
    });
    return sanitizePianoTilesBeatmapEntry({
        source: options.source || 'streaming-tempo-grid',
        generatedAt: Date.now(),
        duration,
        bpmEstimate: Math.round(bpm),
        analysisSummary: options.analysisSummary || 'Streaming source used a deterministic tempo grid with staged, keyboard-friendly lane patterns because raw waveform data was unavailable.',
        tiles
    });
}

async function analyzePianoTilesTrack(track = null, options = {}) {
    if (!track) throw new Error('Choose a song before starting NexBeat Tiles.');
    const opts = { force: false, ...options };
    const cached = opts.force ? null : getCachedPianoTilesBeatmap(track);
    if (cached) {
        setPianoTilesAnalysisStatus('Cached beatmap loaded. Starting run...', 100);
        await waitForMusicGame(170);
        return cached;
    }
    setPianoTilesAnalysisStatus('Preparing audio analysis...', 8);
    await waitForMusicGame(80);
    let beatmap = null;
    try {
        const arrayBuffer = await fetchPianoTilesAudioBuffer(track);
        setPianoTilesAnalysisStatus('Decoding audio waveform...', 18);
        const audioBuffer = await decodePianoTilesAudioBuffer(arrayBuffer);
        beatmap = await buildPianoTilesBeatmapFromAudioBuffer(audioBuffer, track);
    } catch (error) {
        const duration = Math.max(0, Number(track.duration || getOnlineMusicState().duration || els.audio?.duration || 0));
        setPianoTilesAnalysisStatus('Waveform unavailable. Building tempo-safe stream map...', 58);
        await waitForMusicGame(140);
        beatmap = generateFallbackPianoTilesBeatmap(track, {
            duration: duration > 0 ? duration : 96,
            source: isOnlineMusicTrackRecord(track) ? 'streaming-tempo-grid' : 'fallback-tempo-grid',
            analysisSummary: sanitizeText(error?.message || 'Waveform analysis fell back safely.')
        });
    }
    beatmap = sanitizePianoTilesBeatmapEntry({
        ...beatmap,
        trackKey: getPianoTilesTrackCacheKey(track),
        trackId: track.id
    });
    if (!beatmap) throw new Error('NexPlay could not build a playable beatmap for this song.');
    persistPianoTilesBeatmap(track, beatmap);
    setPianoTilesAnalysisStatus('Beatmap cached. Launching run...', 100);
    await waitForMusicGame(160);
    return beatmap;
}

function clearPianoTilesRuntimeDom() {
    if (pianoTilesRuntime.rafId) {
        cancelAnimationFrame(pianoTilesRuntime.rafId);
        pianoTilesRuntime.rafId = 0;
    }
    pianoTilesRuntime.activeKeyTimers.forEach((timerId) => clearTimeout(timerId));
    pianoTilesRuntime.activeKeyTimers.clear();
    pianoTilesRuntime.tileElements.forEach((element) => {
        if (element && element.parentElement) element.parentElement.removeChild(element);
    });
    pianoTilesRuntime.tileElements.clear();
    pianoTilesRuntime.tiles = [];
    pianoTilesRuntime.lastStatPaint = 0;
    pianoTilesRuntime.visualTime = 0;
    pianoTilesRuntime.lastVisualNow = 0;
}

async function stopPianoTilesSession(options = {}) {
    const opts = { restorePlayback: false, resetPhase: false, ...options };
    const piano = getMusicGamesState().pianoTiles;
    piano.isRunning = false;
    piano.bindingLaneIndex = null;
    piano.playbackToken = Number(piano.playbackToken || 0) + 1;
    clearPianoTilesRuntimeDom();
    if (opts.restorePlayback && (getMusicGamesState().playbackSnapshot || getMusicGamesState().preview.active)) {
        await restoreMusicGamePlayback();
    }
    if (opts.resetPhase) {
        const preservedBindings = sanitizePianoTilesKeyBindings(piano.laneBindings || piano.laneKeys);
        const selectedTrackId = piano.selectedTrackId;
        getMusicGamesState().pianoTiles = {
            ...createDefaultMusicGamesState().pianoTiles,
            selectedTrackId,
            laneBindings: preservedBindings,
            laneKeys: getPianoTilesKeyCodes(preservedBindings)
        };
        applyPianoTilesScoreSnapshot(getPianoTilesSelectedTrack());
    }
    return true;
}

function getPianoTilesTransportTime() {
    if (state.currentPlaybackSource === 'online-music') {
        return Math.max(0, Number(getOnlineMusicState().currentTime || 0));
    }
    return Math.max(0, Number(els.audio?.currentTime || 0));
}

function getPianoTilesTransportDuration(track = null, beatmap = null) {
    if (state.currentPlaybackSource === 'online-music') {
        return Math.max(0, Number(getOnlineMusicState().duration || track?.duration || beatmap?.duration || 0));
    }
    return Math.max(0, Number(els.audio?.duration || track?.duration || beatmap?.duration || 0));
}

async function startPianoTilesPlayback(track = null, beatmap = null) {
    const piano = getMusicGamesState().pianoTiles;
    if (!track || !beatmap) return false;
    await stopPianoTilesSession({ restorePlayback: false, resetPhase: false });
    captureMusicGamePlaybackSnapshot();
    captureMusicGamePlayerShellSnapshot();
    const games = getMusicGamesState();
    games.preview.active = true;
    games.preview.suppressMetrics = true;
    games.preview.trackId = track.id;
    games.preview.previewTrack = track;
    games.preview.token = Number(games.preview.token || 0) + 1;
    const started = isOnlineMusicTrackRecord(track)
        ? await playOnlineMusicTrack(track.id, {
            autoplay: true,
            startTime: 0,
            playbackContext: 'library',
            queueContextView: 'library',
            queueContextKey: 'music-games-piano-tiles',
            queueMode: getOnlineMusicState().queueMode || 'ordered',
            trackSnapshot: track
        })
        : await prepareMusicGameSharedAudio(track, {
            autoplay: true,
            startTime: 0,
            playbackRate: 1,
            updateCurrentTrackId: track.id
        });
    if (!started) {
        games.preview.active = false;
        games.preview.suppressMetrics = false;
        return false;
    }
    const playbackToken = getMusicGamesState().preview.token;
    restoreMusicGamePlayerShellSnapshot(false);
    const scoreSnapshot = getPianoTilesScoreForTrack(track);
    Object.assign(piano, {
        phase: 'gameplay',
        selectedTrackId: track.id,
        beatmap,
        beatmapSource: beatmap.source || '',
        error: '',
        isRunning: true,
        startedAt: Date.now(),
        endedAt: 0,
        score: 0,
        combo: 0,
        bestCombo: 0,
        hits: 0,
        misses: 0,
        accuracyTotal: 0,
        lastJudgement: 'Ready',
        lastScore: scoreSnapshot.lastScore,
        highScore: scoreSnapshot.highScore,
        newHighScore: false,
        currentTime: 0,
        duration: Math.max(0, Number(beatmap.duration || track.duration || 0)),
        inputLockedUntil: Date.now() + 180,
        playbackToken
    });
    pianoTilesRuntime.tiles = beatmap.tiles.map((tile, index) => ({
        ...tile,
        id: index,
        status: 'pending',
        resolvedAt: 0
    }));
    pianoTilesRuntime.visualTime = 0;
    pianoTilesRuntime.lastVisualNow = 0;
    renderMusicGames();
    pianoTilesRuntime.rafId = requestAnimationFrame(tickPianoTilesGameplay);
    return true;
}

async function startPianoTilesFromSelection(options = {}) {
    const opts = { forceAnalyze: false, ...options };
    const piano = getMusicGamesState().pianoTiles;
    const track = getPianoTilesSelectedTrack();
    if (!track) {
        piano.error = 'Add a playable audio track to your library first.';
        renderMusicGames();
        return false;
    }
    const games = getMusicGamesState();
    captureMusicGamePlaybackSnapshot();
    captureMusicGamePlayerShellSnapshot();
    games.preview.suppressMetrics = true;
    if (isOnlineMusicPlaybackActive()) {
        deactivateOnlineMusicTransport({
            nextPlaybackSource: 'local',
            stopPlayer: true,
            resetTime: false
        });
    } else {
        safePauseMedia(els.audio);
        state.isPlaying = false;
        updatePlayIcons();
        refreshPlayingIndicators();
    }
    loadPianoTilesKeyBindings();
    applyPianoTilesScoreSnapshot(track);
    Object.assign(piano, {
        phase: 'analyzing',
        selectedTrackId: track.id,
        error: '',
        analysisStatus: 'Preparing audio analysis...',
        analysisProgress: 4,
        beatmap: null,
        bindingLaneIndex: null,
        bindingMessage: '',
        bindingMessageType: ''
    });
    renderMusicGames();
    try {
        const beatmap = await analyzePianoTilesTrack(track, { force: opts.forceAnalyze });
        if (!isMusicGameViewActive('piano-tiles')) return false;
        piano.beatmap = beatmap;
        const started = await startPianoTilesPlayback(track, beatmap);
        if (!started) {
            await restoreMusicGamePlayback();
        }
        return started;
    } catch (error) {
        piano.phase = 'select';
        piano.error = error?.message || 'NexBeat Tiles could not start this song.';
        await restoreMusicGamePlayback();
        renderMusicGames();
        return false;
    }
}

function selectPianoTilesTrack(trackId = '') {
    const piano = getMusicGamesState().pianoTiles;
    const track = getPianoTilesCandidateTracks().find((entry) => entry.id === trackId) || null;
    if (!track) return;
    piano.selectedTrackId = track.id;
    piano.error = '';
    piano.phase = 'select';
    piano.bindingLaneIndex = null;
    piano.bindingMessage = '';
    piano.bindingMessageType = '';
    applyPianoTilesScoreSnapshot(track);
    renderMusicGames();
}

function openPianoTilesSettings() {
    const piano = getMusicGamesState().pianoTiles;
    loadPianoTilesKeyBindings();
    piano.phase = 'settings';
    piano.bindingLaneIndex = null;
    piano.bindingMessage = '';
    piano.bindingMessageType = '';
    renderMusicGames();
}

function closePianoTilesSettings() {
    const piano = getMusicGamesState().pianoTiles;
    piano.phase = 'select';
    piano.bindingLaneIndex = null;
    piano.bindingMessage = '';
    piano.bindingMessageType = '';
    renderMusicGames();
}

function startPianoTilesKeyCapture(laneIndex = 0) {
    const piano = getMusicGamesState().pianoTiles;
    if (piano.phase === 'gameplay' || piano.isRunning) return false;
    piano.bindingLaneIndex = Math.max(0, Math.min(PIANO_TILES_LANE_COUNT - 1, Math.trunc(Number(laneIndex || 0))));
    piano.bindingMessage = `Press any key for Lane ${piano.bindingLaneIndex + 1}.`;
    piano.bindingMessageType = 'info';
    renderMusicGames();
    return true;
}

function resetPianoTilesKeyBindings() {
    const piano = getMusicGamesState().pianoTiles;
    piano.laneBindings = PIANO_TILES_DEFAULT_BINDINGS.map((binding) => ({ ...binding }));
    piano.laneKeys = getPianoTilesKeyCodes(piano.laneBindings);
    piano.bindingLaneIndex = null;
    piano.bindingMessage = 'Lane controls reset to defaults.';
    piano.bindingMessageType = 'success';
    persistPianoTilesKeyBindings(piano.laneBindings);
    renderMusicGames();
}

function assignPianoTilesKeyBinding(laneIndex = 0, input = null) {
    const piano = getMusicGamesState().pianoTiles;
    const lane = Math.max(0, Math.min(PIANO_TILES_LANE_COUNT - 1, Math.trunc(Number(laneIndex || 0))));
    const manager = getPianoTilesKeyBindingManager();
    const current = sanitizePianoTilesKeyBindings(piano.laneBindings || piano.laneKeys);
    const result = manager.assign(current, lane, input);
    if (result.cancelled) {
        piano.bindingLaneIndex = null;
        piano.bindingMessage = result.message || 'Rebinding cancelled.';
        piano.bindingMessageType = 'info';
        renderMusicGames();
        return false;
    }
    if (!result.ok) {
        piano.bindingLaneIndex = lane;
        piano.bindingMessage = result.message || 'Choose a different key for this lane.';
        piano.bindingMessageType = result.conflictLane >= 0 ? 'error' : 'warning';
        renderMusicGames();
        return false;
    }
    const clean = persistPianoTilesKeyBindings(result.bindings);
    piano.bindingLaneIndex = null;
    piano.bindingMessage = `Lane ${lane + 1} set to ${getPianoTilesKeyLabel(clean[lane])}.`;
    piano.bindingMessageType = 'success';
    renderMusicGames();
    return true;
}

function pulsePianoTilesLane(laneIndex = 0) {
    const keyEl = document.querySelector(`[data-piano-key-lane="${laneIndex}"]`);
    const laneEl = document.querySelector(`[data-piano-lane="${laneIndex}"]`);
    [keyEl, laneEl].forEach((element) => {
        if (!element) return;
        element.classList.add('is-active', 'is-armed');
    });
    const existing = pianoTilesRuntime.activeKeyTimers.get(laneIndex);
    if (existing) clearTimeout(existing);
    pianoTilesRuntime.activeKeyTimers.set(laneIndex, setTimeout(() => {
        [keyEl, laneEl].forEach((element) => {
            if (!element) return;
            element.classList.remove('is-active', 'is-armed');
        });
        pianoTilesRuntime.activeKeyTimers.delete(laneIndex);
    }, 105));
}

function showPianoTilesFeedback(label = '', laneIndex = 0, type = 'hit') {
    const board = document.getElementById('piano-tiles-board');
    const feedback = document.getElementById('piano-tiles-feedback');
    if (feedback) {
        feedback.textContent = label;
        feedback.classList.remove('is-showing');
        void feedback.offsetWidth;
        feedback.classList.add('is-showing');
    }
    if (!board || type === 'miss') return;
    const colors = ['#22d3ee', '#34d399', '#f472b6'];
    const rect = board.getBoundingClientRect();
    const laneWidth = rect.width / PIANO_TILES_LANE_COUNT;
    const originX = laneWidth * laneIndex + (laneWidth / 2);
    const originY = rect.height * 0.88;
    for (let index = 0; index < 9; index += 1) {
        const particle = document.createElement('span');
        particle.className = 'music-games-piano-particle';
        particle.style.left = `${originX}px`;
        particle.style.top = `${originY}px`;
        particle.style.setProperty('--particle-color', colors[laneIndex] || colors[0]);
        particle.style.setProperty('--particle-x', `${Math.round((Math.cos(index * 0.7) * 42) + ((index % 2) * 14))}px`);
        particle.style.setProperty('--particle-y', `${Math.round(-34 - (Math.sin(index * 0.8) * 34) - index * 2)}px`);
        board.appendChild(particle);
        setTimeout(() => {
            if (particle.parentElement) particle.parentElement.removeChild(particle);
        }, 620);
    }
}

function judgePianoTilesHit(laneIndex = 0) {
    const piano = getMusicGamesState().pianoTiles;
    if (!piano.isRunning || Date.now() < Number(piano.inputLockedUntil || 0)) return false;
    const currentTime = getPianoTilesTransportTime();
    let bestTile = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    pianoTilesRuntime.tiles.forEach((tile) => {
        if (tile.status !== 'pending' || tile.lane !== laneIndex) return;
        const delta = Math.abs(tile.time - currentTime);
        if (delta < bestDelta) {
            bestDelta = delta;
            bestTile = tile;
        }
    });
    pulsePianoTilesLane(laneIndex);
    if (!bestTile || bestDelta > PIANO_TILES_HIT_WINDOWS.miss) {
        piano.combo = 0;
        piano.misses = Number(piano.misses || 0) + 1;
        piano.lastJudgement = 'Miss';
        showPianoTilesFeedback('Miss', laneIndex, 'miss');
        paintPianoTilesStats(true);
        return false;
    }
    let judgement = 'Good';
    let baseScore = 45;
    let accuracy = 0.72;
    if (bestDelta <= PIANO_TILES_HIT_WINDOWS.perfect) {
        judgement = 'Perfect';
        baseScore = 115;
        accuracy = 1;
    } else if (bestDelta <= PIANO_TILES_HIT_WINDOWS.great) {
        judgement = 'Great';
        baseScore = 82;
        accuracy = 0.88;
    }
    bestTile.status = 'hit';
    bestTile.resolvedAt = currentTime;
    piano.combo = Number(piano.combo || 0) + 1;
    piano.bestCombo = Math.max(Number(piano.bestCombo || 0), Number(piano.combo || 0));
    piano.hits = Number(piano.hits || 0) + 1;
    piano.accuracyTotal = Number(piano.accuracyTotal || 0) + accuracy;
    const comboBonus = Math.min(90, Math.floor(Number(piano.combo || 0) / 8) * 8);
    piano.score = Math.max(0, Math.trunc(Number(piano.score || 0) + baseScore + comboBonus + Math.round((bestTile.strength || 0.5) * 24)));
    piano.lastJudgement = judgement;
    const element = pianoTilesRuntime.tileElements.get(bestTile.id);
    if (element) element.classList.add('is-hit');
    showPianoTilesFeedback(judgement, laneIndex, 'hit');
    paintPianoTilesStats(true);
    return true;
}

function paintPianoTilesStats(force = false) {
    const now = performance.now();
    if (!force && now - Number(pianoTilesRuntime.lastStatPaint || 0) < 80) return;
    pianoTilesRuntime.lastStatPaint = now;
    const piano = getMusicGamesState().pianoTiles;
    const totalJudged = Math.max(1, Number(piano.hits || 0) + Number(piano.misses || 0));
    const accuracy = Math.round((Number(piano.accuracyTotal || 0) / totalJudged) * 100);
    const values = {
        'piano-tiles-score': Number(piano.score || 0).toLocaleString(),
        'piano-tiles-combo': `x${Number(piano.combo || 0)}`,
        'piano-tiles-best-combo': `x${Number(piano.bestCombo || 0)}`,
        'piano-tiles-accuracy': `${Math.max(0, Math.min(100, accuracy))}%`,
        'piano-tiles-judgement': piano.lastJudgement || 'Ready',
        'piano-tiles-time': `${formatTime(piano.currentTime || 0)} / ${formatTime(piano.duration || 0)}`
    };
    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element && element.textContent !== value) element.textContent = value;
    });
    const fill = document.getElementById('piano-tiles-song-progress');
    if (fill) {
        const pct = piano.duration > 0 ? Math.max(0, Math.min(100, (piano.currentTime / piano.duration) * 100)) : 0;
        fill.style.width = `${pct.toFixed(2)}%`;
    }
}

function syncPianoTilesTileDom() {
    const board = document.getElementById('piano-tiles-board');
    if (!board) return false;
    const piano = getMusicGamesState().pianoTiles;
    const boardWidth = board.clientWidth || 1;
    const boardHeight = board.clientHeight || 1;
    const laneWidth = boardWidth / PIANO_TILES_LANE_COUNT;
    const tileWidth = Math.max(46, Math.min(118, laneWidth * 0.68));
    const hitY = boardHeight * 0.86;
    const tileHeight = Math.max(42, Math.min(58, boardHeight * 0.078));
    const currentTime = Number(pianoTilesRuntime.visualTime || piano.currentTime || 0);
    const visibleIds = new Set();
    pianoTilesRuntime.tiles.forEach((tile) => {
        const delta = tile.time - currentTime;
        const recentlyResolved = tile.status !== 'pending' && currentTime - Number(tile.resolvedAt || 0) < 0.22;
        const visible = recentlyResolved || (delta <= PIANO_TILES_LEAD_TIME_SECONDS && delta >= -0.34 && tile.status === 'pending');
        if (!visible) return;
        visibleIds.add(tile.id);
        let element = pianoTilesRuntime.tileElements.get(tile.id);
        if (!element) {
            element = document.createElement('div');
            element.className = 'music-games-piano-tile';
            element.dataset.tileId = String(tile.id);
            element.dataset.lane = String(tile.lane);
            board.appendChild(element);
            pianoTilesRuntime.tileElements.set(tile.id, element);
        }
        element.style.width = `${tileWidth}px`;
        element.style.height = `${tileHeight}px`;
        const laneX = (tile.lane * laneWidth) + ((laneWidth - tileWidth) / 2);
        const progress = 1 - (delta / PIANO_TILES_LEAD_TIME_SECONDS);
        const y = Math.max(-tileHeight - 16, Math.min(boardHeight + tileHeight, progress * hitY));
        const scale = 0.92 + Math.min(0.08, Number(tile.strength || 0.5) * 0.075);
        element.style.transform = `translate3d(${laneX}px, ${y}px, 0) scale(${scale.toFixed(3)})`;
        if (tile.status === 'hit') element.classList.add('is-hit');
        if (tile.status === 'missed') element.classList.add('is-missed');
    });
    pianoTilesRuntime.tileElements.forEach((element, id) => {
        if (visibleIds.has(id)) return;
        if (element && element.parentElement) element.parentElement.removeChild(element);
        pianoTilesRuntime.tileElements.delete(id);
    });
    return true;
}

async function finishPianoTilesRun(reason = 'complete') {
    const piano = getMusicGamesState().pianoTiles;
    if (!piano.isRunning && piano.phase === 'results') return;
    const track = getPianoTilesSelectedTrack();
    piano.isRunning = false;
    piano.endedAt = Date.now();
    clearPianoTilesRuntimeDom();
    const previousScore = getPianoTilesScoreForTrack(track);
    const persisted = persistPianoTilesScore(track, {
        score: piano.score,
        bestCombo: piano.bestCombo
    });
    piano.lastScore = persisted.lastScore;
    piano.newHighScore = Number(piano.score || 0) > Number(previousScore.highScore || 0);
    piano.highScore = persisted.highScore;
    piano.phase = 'results';
    piano.lastJudgement = reason === 'quit' ? 'Run stopped' : 'Song complete';
    await restoreMusicGamePlayback();
    if (isMusicGameViewActive('piano-tiles')) renderMusicGames();
}

function tickPianoTilesGameplay() {
    const piano = getMusicGamesState().pianoTiles;
    if (!isMusicGameViewActive('piano-tiles') || !piano.isRunning || piano.phase !== 'gameplay') {
        clearPianoTilesRuntimeDom();
        return;
    }
    const track = getPianoTilesSelectedTrack();
    const transportTime = getPianoTilesTransportTime();
    const now = performance.now();
    const previousVisualTime = Number(pianoTilesRuntime.visualTime || 0);
    const visualDeltaSeconds = pianoTilesRuntime.lastVisualNow > 0
        ? Math.max(0, Math.min(0.05, (now - pianoTilesRuntime.lastVisualNow) / 1000))
        : 0;
    pianoTilesRuntime.lastVisualNow = now;
    pianoTilesRuntime.visualTime = (
        !previousVisualTime
        || transportTime < previousVisualTime - 0.04
        || Math.abs(transportTime - previousVisualTime) > 0.18
    )
        ? transportTime
        : Math.min(transportTime + 0.035, previousVisualTime + visualDeltaSeconds);
    piano.currentTime = transportTime;
    piano.duration = getPianoTilesTransportDuration(track, piano.beatmap) || Number(piano.duration || 0);
    let missedThisFrame = false;
    pianoTilesRuntime.tiles.forEach((tile) => {
        if (tile.status !== 'pending') return;
        if (piano.currentTime - tile.time > PIANO_TILES_HIT_WINDOWS.miss) {
            tile.status = 'missed';
            tile.resolvedAt = piano.currentTime;
            piano.combo = 0;
            piano.misses = Number(piano.misses || 0) + 1;
            piano.lastJudgement = 'Miss';
            missedThisFrame = true;
            const element = pianoTilesRuntime.tileElements.get(tile.id);
            if (element) element.classList.add('is-missed');
        }
    });
    if (missedThisFrame) showPianoTilesFeedback('Miss', 0, 'miss');
    syncPianoTilesTileDom();
    paintPianoTilesStats(missedThisFrame);
    const unresolved = pianoTilesRuntime.tiles.some((tile) => tile.status === 'pending' && tile.time <= piano.currentTime + 0.35);
    const songEnded = (piano.duration > 0 && piano.currentTime >= piano.duration - 0.12)
        || (state.currentPlaybackSource !== 'online-music' && els.audio && els.audio.ended)
        || (state.currentPlaybackSource === 'online-music' && !getOnlineMusicState().isPlaying && piano.currentTime > 1 && piano.duration > 0 && piano.currentTime >= piano.duration - 0.6);
    if (songEnded && !unresolved) {
        finishPianoTilesRun('complete');
        return;
    }
    pianoTilesRuntime.rafId = requestAnimationFrame(tickPianoTilesGameplay);
}

function handlePianoTilesKeydown(event) {
    const piano = getMusicGamesState().pianoTiles;
    if (state.activeTab !== 'music-games' || getMusicGamesState().activeGameId !== 'piano-tiles') return false;
    if (piano.bindingLaneIndex !== null && piano.phase !== 'gameplay' && !piano.isRunning) {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return true;
        assignPianoTilesKeyBinding(piano.bindingLaneIndex, event);
        return true;
    }
    const target = event?.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return false;
    if (event.repeat) return piano.phase === 'gameplay';
    if (event.code === 'Escape' && piano.phase === 'gameplay') {
        event.preventDefault();
        finishPianoTilesRun('quit');
        return true;
    }
    if (event.code === 'Space' && piano.phase === 'results') {
        event.preventDefault();
        startPianoTilesFromSelection();
        return true;
    }
    if (piano.phase !== 'gameplay' || !piano.isRunning) return false;
    const laneIndex = getPianoTilesLaneForKeyboardEvent(event);
    if (laneIndex < 0) return false;
    event.preventDefault();
    judgePianoTilesHit(laneIndex);
    return true;
}

async function waitForMusicGamePreviewToEnd(maxWaitMs = 0) {
    const timeout = Math.max(400, Number(maxWaitMs) || 0);
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        if (!getMusicGamesState().preview.active) return true;
        await waitForMusicGame(90);
    }
    return !getMusicGamesState().preview.active;
}

function renderMusicGameUnavailable(title, message, actionLabel = 'Back To Hub', action = 'returnToMusicGamesHub()') {
    return `<div class="rounded-[1.8rem] holo-panel border border-white/10 px-6 py-10 text-center">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-300">
            <i data-lucide="sparkles" class="h-6 w-6"></i>
        </div>
        <h3 class="mt-5 text-2xl font-black tracking-tight text-white">${escapeHtml(title)}</h3>
        <p class="mx-auto mt-3 max-w-2xl text-sm leading-7 text-gray-400">${escapeHtml(message)}</p>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button onclick="${action}" class="rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.02]">${escapeHtml(actionLabel)}</button>
            <button onclick="requestMediaImport()" class="rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">Import Songs</button>
        </div>
    </div>`;
}

function renderMusicGameShell(gameId = '', innerHtml = '') {
    const game = getMusicGameDefinition(gameId);
    const gameTitle = getMusicGameDisplayTitle(gameId);
    const availability = getMusicGameAvailability(gameId);
    const localTracks = getMusicGameLocalAudioTracks();
    return `<div class="w-full min-w-0 flex flex-col gap-6 animate-pop-in">
        <section class="relative overflow-hidden rounded-[2rem] holo-panel border border-white/10 px-6 py-6 md:px-8">
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.14),transparent_32%)]"></div>
            <div class="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div class="max-w-3xl">
                    <button onclick="returnToMusicGamesHub()" class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">
                        <i data-lucide="arrow-left" class="h-4 w-4"></i>
                        Back To Music Games
                    </button>
                    <div class="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200 music-games-glow-chip">
                        <i data-lucide="${escapeHtml(game?.icon || 'disc-3')}" class="h-4 w-4"></i>
                        ${escapeHtml(gameTitle)}
                    </div>
                    <h2 class="mt-4 text-3xl md:text-4xl font-black tracking-tight text-white">${escapeHtml(gameTitle)}</h2>
                    <p class="mt-3 max-w-2xl text-sm md:text-base leading-7 text-gray-300">${escapeHtml(game?.description || 'Local-library music game')}</p>
                </div>
                <div class="grid gap-3 sm:grid-cols-3">
                    <div class="rounded-[1.4rem] border border-white/10 bg-black/25 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Library</div>
                        <div class="mt-2 text-2xl font-black text-white">${localTracks.length}</div>
                        <div class="mt-1 text-xs text-gray-400">Library audio tracks</div>
                    </div>
                    <div class="rounded-[1.4rem] border border-white/10 bg-black/25 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Status</div>
                        <div class="mt-2 text-sm font-black text-white">${escapeHtml(availability.reason)}</div>
                        <div class="mt-1 text-xs text-gray-400">${escapeHtml(availability.metric || 'Ready')}</div>
                    </div>
                    <div class="rounded-[1.4rem] border border-white/10 bg-black/25 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Shared Player</div>
                        <div class="mt-2 text-sm font-black text-white">Protected</div>
                        <div class="mt-1 text-xs text-gray-400">Temporary snippets restore your prior context.</div>
                    </div>
                </div>
            </div>
        </section>
        ${innerHtml}
    </div>`;
}

async function returnToMusicGamesHub() {
    await teardownMusicGamesSession({ restorePlayback: true, resetState: false });
    const games = getMusicGamesState();
    games.view = 'hub';
    games.activeGameId = null;
    renderMusicGames();
}

async function openMusicGame(gameId = '') {
    if (!getMusicGameDefinition(gameId)) return;
    await teardownMusicGamesSession({ restorePlayback: true, resetState: false });
    const games = getMusicGamesState();
    games.view = 'game';
    games.activeGameId = gameId;
    resetMusicGameModeState(gameId);
    if (gameId === 'piano-tiles') {
        loadPianoTilesKeyBindings();
        const selected = getPianoTilesSelectedTrack();
        if (selected) {
            games.pianoTiles.selectedTrackId = selected.id;
            applyPianoTilesScoreSnapshot(selected);
        }
    }
    renderMusicGames();
    if (gameId === 'snake-album-covers') {
        startMusicGameSnake(true);
    } else if (gameId === 'song-race') {
        startMusicGameSongRace(true);
    } else if (gameId === 'memory-playlist') {
        startMemoryPlaylistRound({ reset: true });
    } else if (gameId === 'whos-that-artist') {
        startWhosThatArtistRound({ reset: true });
    } else if (gameId === 'finish-the-lyrics') {
        startFinishTheLyricsRound({ reset: true });
    } else if (gameId === 'guess-the-song') {
        startGuessTheSongRound({ reset: true });
    }
}

function renderMusicGamesHub() {
    const localTracks = getMusicGameLocalAudioTracks();
    const lyricTracks = getMusicGameLyricTracks();
    const artistCount = getMusicGameDistinctArtists().length;
    const playCountReady = localTracks.some((track) => Number(track.playCount || 0) > 0);
    return `<div class="w-full flex flex-col gap-6 animate-pop-in">
        <section class="relative overflow-hidden rounded-[2rem] holo-panel border border-white/10 px-6 py-6 md:px-8">
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.18),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_34%)]"></div>
            <div class="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div class="max-w-3xl">
                    <div class="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200 music-games-glow-chip">
                        <i data-lucide="gamepad-2" class="h-4 w-4"></i>
                        Music Games
                    </div>
                    <h2 class="mt-4 text-3xl md:text-5xl font-black tracking-tight text-white">Turn your music library into a playable NexPlay arcade.</h2>
                    <p class="mt-4 max-w-2xl text-sm md:text-base leading-7 text-gray-300">Every game in this hub is driven by songs already inside NexPlay, including imported tracks and saved online music. Pick a mode, stay inside the app, and jump back to the hub whenever you want.</p>
                </div>
                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div class="rounded-[1.4rem] border border-white/10 bg-black/25 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Library Audio</div>
                        <div class="mt-2 text-2xl font-black text-white">${localTracks.length}</div>
                        <div class="mt-1 text-xs text-gray-400">Tracks ready for games</div>
                    </div>
                    <div class="rounded-[1.4rem] border border-white/10 bg-black/25 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Artists</div>
                        <div class="mt-2 text-2xl font-black text-white">${artistCount}</div>
                        <div class="mt-1 text-xs text-gray-400">Distinct artist names</div>
                    </div>
                    <div class="rounded-[1.4rem] border border-white/10 bg-black/25 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Lyrics Ready</div>
                        <div class="mt-2 text-2xl font-black text-white">${lyricTracks.length}</div>
                        <div class="mt-1 text-xs text-gray-400">Tracks with usable lyrics</div>
                    </div>
                    <div class="rounded-[1.4rem] border border-white/10 bg-black/25 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Top Played Data</div>
                        <div class="mt-2 text-sm font-black text-white">${playCountReady ? 'Available' : 'Fallback Mode'}</div>
                        <div class="mt-1 text-xs text-gray-400">Song Race drafting stats</div>
                    </div>
                </div>
            </div>
        </section>
        ${!localTracks.length ? `
            <section class="rounded-[1.8rem] holo-panel border border-white/10 px-6 py-8">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div class="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200">Library Required</div>
                        <h3 class="mt-3 text-2xl font-black text-white">Add a few songs to your library to wake up Music Games.</h3>
                        <p class="mt-2 max-w-2xl text-sm leading-7 text-gray-400">The hub stays visible, but each game needs songs from your NexPlay library before it can run. Imported tracks, saved online music, cover art, artists, lyrics, and play counts unlock richer rounds automatically.</p>
                    </div>
                    <div class="flex flex-wrap gap-3">
                        <button onclick="requestMediaImport()" class="rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.02]">Import Songs</button>
                        <button onclick="changeTab('audio')" class="rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">Open Audio</button>
                    </div>
                </div>
            </section>` : ''}
        <section class="grid grid-cols-1 auto-rows-fr gap-5 md:grid-cols-2 2xl:grid-cols-3">
            ${MUSIC_GAME_DEFINITIONS.map((game) => {
                const availability = getMusicGameAvailability(game.id);
                const gameTitle = getMusicGameDisplayTitle(game.id);
                return `<article class="holo-card min-w-0 overflow-hidden rounded-[1.8rem] border border-white/10 p-5 flex flex-col gap-5">
                    <div class="flex items-start justify-between gap-4">
                        <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.2rem] border border-white/10 bg-black/30 text-white">
                            <i data-lucide="${escapeHtml(game.icon)}" class="h-6 w-6"></i>
                        </div>
                        ${renderMusicGameCardArtwork(game.id)}
                    </div>
                    <div>
                        <div class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gray-300">
                            ${escapeHtml(availability.metric || 'Ready')}
                        </div>
                        <h3 class="mt-4 text-xl font-black tracking-tight text-white">${escapeHtml(gameTitle)}</h3>
                        <p class="mt-2 text-sm leading-7 text-gray-400">${escapeHtml(game.description)}</p>
                    </div>
                    <div class="mt-auto flex items-center justify-between gap-3">
                        <div class="text-xs font-mono text-gray-500">${escapeHtml(availability.reason)}</div>
                        <button onclick="openMusicGame('${game.id}')" class="rounded-2xl bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.02]">Start</button>
                    </div>
                </article>`;
            }).join('')}
        </section>
    </div>`;
}

function generateMusicGameMathChallenge() {
    const mode = Math.floor(Math.random() * 3);
    if (mode === 0) {
        const left = 8 + Math.floor(Math.random() * 21);
        const right = 3 + Math.floor(Math.random() * 14);
        return { prompt: `${left} + ${right}`, answer: left + right };
    }
    if (mode === 1) {
        const left = 14 + Math.floor(Math.random() * 20);
        const right = 2 + Math.floor(Math.random() * 12);
        return { prompt: `${left} - ${right}`, answer: left - right };
    }
    const left = 3 + Math.floor(Math.random() * 8);
    const right = 2 + Math.floor(Math.random() * 7);
    const extra = 1 + Math.floor(Math.random() * 6);
    return { prompt: `(${left} × ${right}) + ${extra}`, answer: (left * right) + extra };
}

function selectMusicGameMathTrack(trackId = '') {
    const track = getMusicGameLocalAudioTracks().find((entry) => entry.id === trackId);
    if (!track) return;
    const math = getMusicGamesState().mathUnlock;
    math.selectedTrackId = track.id;
    math.challenge = generateMusicGameMathChallenge();
    math.submittedAnswer = '';
    math.feedback = '';
    math.unlockedTrackId = null;
    renderMusicGames();
}

function handleMusicGameMathAnswerInput(value = '') {
    getMusicGamesState().mathUnlock.submittedAnswer = String(value || '');
}

function closeMusicGameMathUnlockModal() {
    const math = getMusicGamesState().mathUnlock;
    math.selectedTrackId = null;
    math.challenge = null;
    math.submittedAnswer = '';
    math.feedback = '';
    math.unlockedTrackId = null;
    renderMusicGames();
}

function submitMusicGameMathUnlock(event) {
    if (event?.preventDefault) event.preventDefault();
    const math = getMusicGamesState().mathUnlock;
    const track = getMusicGameLocalAudioTracks().find((entry) => entry.id === math.selectedTrackId);
    if (!track || !math.challenge) return false;
    const submitted = Number(String(math.submittedAnswer || '').trim());
    if (!Number.isFinite(submitted)) {
        math.feedback = 'Enter a real number to unlock the track.';
        renderMusicGames();
        return false;
    }
    if (submitted !== Number(math.challenge.answer)) {
        math.feedback = 'Not quite. The song stays locked until the math is right.';
        renderMusicGames();
        return false;
    }
    math.feedback = `"${track.title}" unlocked. NexPlay is handing playback back to the main player.`;
    math.unlockedTrackId = track.id;
    clearMusicGamePlaybackSnapshot();
    stopMusicGamePreview({ restore: false, resetShell: false });
    loadTrack(track.id, true, null);
    math.selectedTrackId = null;
    math.challenge = null;
    math.submittedAnswer = '';
    renderMusicGames();
    return true;
}

function buildMusicGameSnakeOpenCells(boardSize = 12, occupiedCells = []) {
    const occupied = new Set((Array.isArray(occupiedCells) ? occupiedCells : []).map((entry) => `${entry.x}:${entry.y}`));
    const openCells = [];
    for (let y = 0; y < boardSize; y += 1) {
        for (let x = 0; x < boardSize; x += 1) {
            const key = `${x}:${y}`;
            if (!occupied.has(key)) openCells.push({ x, y });
        }
    }
    return openCells;
}

function buildMusicGameSnakeFood(boardSize = 12, snakeCells = [], libraryTracks = [], hazardCells = []) {
    const openCells = buildMusicGameSnakeOpenCells(boardSize, [...(snakeCells || []), ...(hazardCells || [])]);
    if (!openCells.length) return null;
    const slot = pickRandomMusicGameItem(openCells) || openCells[0];
    const track = pickRandomMusicGameItem(libraryTracks) || libraryTracks[0] || null;
    return track ? {
        x: slot.x,
        y: slot.y,
        trackId: track.id,
        title: track.title,
        cover: getTrackCoverOrFallback(track),
        points: 1 + Math.floor(Math.random() * 3)
    } : null;
}

function buildMusicGameSnakeHazard(boardSize = 12, snakeCells = [], foodCell = null, existingHazards = []) {
    const occupied = [...(snakeCells || []), ...(existingHazards || [])];
    if (foodCell && Number.isFinite(foodCell.x) && Number.isFinite(foodCell.y)) {
        occupied.push({ x: foodCell.x, y: foodCell.y });
    }
    const openCells = buildMusicGameSnakeOpenCells(boardSize, occupied);
    const slot = pickRandomMusicGameItem(openCells) || null;
    return slot ? { x: slot.x, y: slot.y } : null;
}

function setMusicGameSnakeDirection(direction = '') {
    const snake = getMusicGamesState().snake;
    const opposite = {
        up: 'down',
        down: 'up',
        left: 'right',
        right: 'left'
    };
    const next = sanitizeText(direction || '');
    if (!['up', 'down', 'left', 'right'].includes(next)) return;
    if (snake.snake.length > 1 && opposite[snake.direction] === next) return;
    snake.pendingDirection = next;
}

function runMusicGameSnakeFrame(now = performance.now()) {
    const games = getMusicGamesState();
    const snake = games.snake;
    snake.rafId = null;
    if (!isMusicGameViewActive('snake-album-covers') || !snake.running || snake.gameOver) {
        if (!isMusicGameViewActive('snake-album-covers')) snake.running = false;
        return;
    }
    const stepMs = Math.max(80, Number(snake.speedMs || MUSIC_GAME_SNAKE_TICK_MS));
    if (!snake.lastStepAt) snake.lastStepAt = now;
    let steps = 0;
    while (now - snake.lastStepAt >= stepMs && steps < 3 && snake.running && !snake.gameOver) {
        snake.lastStepAt += stepMs;
        advanceMusicGameSnake();
        steps += 1;
    }
    if (isMusicGameViewActive('snake-album-covers') && snake.running && !snake.gameOver) {
        snake.rafId = requestAnimationFrame(runMusicGameSnakeFrame);
    }
}

function startMusicGameSnakeLoop() {
    const snake = getMusicGamesState().snake;
    if (snake.rafId) cancelAnimationFrame(snake.rafId);
    if (snake.tickTimerId) {
        clearInterval(snake.tickTimerId);
        snake.tickTimerId = null;
    }
    snake.lastStepAt = performance.now();
    snake.rafId = requestAnimationFrame(runMusicGameSnakeFrame);
}

function startMusicGameSnake(reset = false) {
    const tracks = getMusicGameLocalAudioTracks();
    if (!tracks.length) return;
    const games = getMusicGamesState();
    if (reset || games.snake.gameOver || !games.snake.snake.length) {
        const boardSize = window.innerWidth < 640 ? 10 : (window.innerWidth < 960 ? 11 : 13);
        const center = Math.floor(boardSize / 2);
        games.snake = {
            ...createDefaultMusicGamesState().snake,
            boardSize,
            snake: [
                { x: center, y: center },
                { x: center - 1, y: center }
            ],
            direction: 'right',
            pendingDirection: 'right',
            hazards: [],
            collectedCovers: [],
            score: 0,
            combo: 1,
            bestCombo: 1,
            totalFood: 0,
            running: true,
            gameOver: false,
            endReason: '',
            speedMs: MUSIC_GAME_SNAKE_TICK_MS,
            motionFrom: [
                { x: center, y: center },
                { x: center - 1, y: center }
            ],
            motionSerial: 0,
            startedAt: Date.now()
        };
        games.snake.food = buildMusicGameSnakeFood(boardSize, games.snake.snake, tracks, games.snake.hazards);
    } else {
        if (games.snake.running && (games.snake.tickTimerId || games.snake.rafId)) {
            if (!syncSnakeGameDom()) renderMusicGames();
            return;
        }
        games.snake.running = true;
        games.snake.gameOver = false;
        games.snake.endReason = '';
        if (!games.snake.food && games.snake.snake.length < (games.snake.boardSize * games.snake.boardSize)) {
            games.snake.food = buildMusicGameSnakeFood(games.snake.boardSize, games.snake.snake, tracks, games.snake.hazards);
        }
    }
    startMusicGameSnakeLoop();
    if (!syncSnakeGameDom()) renderMusicGames();
}

function pauseMusicGameSnake() {
    const snake = getMusicGamesState().snake;
    snake.running = false;
    clearMusicGameSnakeTimer();
    if (!syncSnakeGameDom()) renderMusicGames();
}

function advanceMusicGameSnake() {
    const games = getMusicGamesState();
    if (!isMusicGameViewActive('snake-album-covers')) {
        games.snake.running = false;
        clearMusicGameSnakeTimer();
        return;
    }
    const snake = games.snake;
    if (!snake.running || snake.gameOver || !snake.snake.length) return;
    snake.direction = snake.pendingDirection || snake.direction || 'right';
    const previousSnakeCells = snake.snake.map((segment) => ({ x: segment.x, y: segment.y }));
    const deltas = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 }
    };
    const head = snake.snake[0];
    let delta = deltas[snake.direction] || deltas.right;
    let nextHead = { x: head.x + delta.x, y: head.y + delta.y };
    const hitWall = nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= snake.boardSize || nextHead.y >= snake.boardSize;
    if (hitWall) {
        const bouncedDirection = delta.x !== 0
            ? (delta.x > 0 ? 'left' : 'right')
            : (delta.y > 0 ? 'up' : 'down');
        snake.direction = bouncedDirection;
        snake.pendingDirection = bouncedDirection;
        delta = deltas[bouncedDirection] || deltas.right;
        nextHead = { x: head.x + delta.x, y: head.y + delta.y };
    }
    const willEat = snake.food && nextHead.x === snake.food.x && nextHead.y === snake.food.y;
    const body = willEat ? snake.snake : snake.snake.slice(0, -1);
    const hitSelf = body.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);
    const hitHazard = (snake.hazards || []).some((hazard) => hazard.x === nextHead.x && hazard.y === nextHead.y);
    if (hitSelf) snake.combo = 1;
    if (hitHazard) {
        snake.combo = Math.max(1, Number(snake.combo || 1) - 1);
        snake.hazards = (snake.hazards || []).filter((hazard) => !(hazard.x === nextHead.x && hazard.y === nextHead.y));
    }
    snake.snake.unshift(nextHead);
    if (willEat) {
        if (snake.food?.cover) snake.collectedCovers.push(snake.food.cover);
        snake.totalFood = Number(snake.totalFood || 0) + 1;
        snake.combo = Math.max(1, Number(snake.combo || 1) + 1);
        snake.bestCombo = Math.max(Number(snake.bestCombo || 1), Number(snake.combo || 1));
        snake.score += Math.max(1, Number(snake.food?.points || 1)) * Math.max(1, Number(snake.combo || 1));
        if (snake.totalFood % 2 === 0) {
            const hazard = buildMusicGameSnakeHazard(snake.boardSize, snake.snake, snake.food, snake.hazards || []);
            if (hazard) snake.hazards = [...(snake.hazards || []), hazard];
        }
        snake.food = buildMusicGameSnakeFood(snake.boardSize, snake.snake, getMusicGameLocalAudioTracks(), snake.hazards || []);
        if (!snake.food) {
            snake.gameOver = true;
            snake.running = false;
            snake.endReason = 'cleared';
            clearMusicGameSnakeTimer();
        }
    } else {
        snake.snake.pop();
        if (snake.combo > 1) snake.combo -= 1;
    }
    snake.motionFrom = snake.snake.map((segment, index) => {
        const previous = previousSnakeCells[index] || segment;
        return { x: previous.x, y: previous.y };
    });
    snake.motionSerial = Number(snake.motionSerial || 0) + 1;
    if (!syncSnakeGameDom()) renderMusicGames();
}

function createMusicGameSongRaceLane(track = null) {
    if (!track) return null;
    const playCount = Math.max(0, Number(track.playCount || 0));
    const recency = Math.max(0, Number(track.lastPlayedAt || track.addedAt || 0));
    const recencyBias = recency ? Math.min(0.16, (Date.now() - recency < 1000 * 60 * 60 * 24 * 14) ? 0.16 : 0.05) : 0.04;
    const playBias = Math.min(0.25, playCount * 0.01);
    return {
        trackId: track.id,
        title: track.title,
        artist: track.artist || 'Unknown artist',
        cover: getTrackCoverOrFallback(track),
        progress: 0,
        speed: 0.46 + Math.random() * 0.18,
        acceleration: 0.06 + Math.random() * 0.07 + playBias + recencyBias,
        topSpeed: 1.15 + Math.random() * 0.3 + playBias,
        stamina: 100,
        burstTicks: 0,
        finishedAt: 0
    };
}

function buildMusicGameMiddleSnippetWindow(track = null, targetSeconds = 6.5) {
    const duration = Math.max(0, Number(track?.duration || 0));
    const desired = Math.max(1.8, Number(targetSeconds) || 6.5);
    if (!(duration > 0)) {
        return { startTime: 0, durationSeconds: desired };
    }
    const durationCap = Math.max(1.6, duration - 0.35);
    const clipLength = Math.min(desired, durationCap);
    const maxStart = Math.max(0, duration - clipLength - 0.2);
    const middleStart = Math.max(0, (duration / 2) - (clipLength / 2));
    return {
        startTime: Math.min(maxStart, middleStart),
        durationSeconds: clipLength
    };
}

async function playMusicGameSongRaceWinnerSnippet(race = getMusicGamesState().songRace) {
    const raceId = Number(race.raceId || 0);
    if (!raceId || !race.winnerTrackId) return false;
    if (Number(race.winnerSnippetRaceId || 0) === raceId) return false;
    race.winnerSnippetRaceId = raceId;
    if (!isMusicGameViewActive('song-race')) return false;
    const winnerTrack = getMusicGameLocalAudioTracks().find((track) => track.id === race.winnerTrackId) || null;
    if (!winnerTrack) return false;
    const snippet = buildMusicGameMiddleSnippetWindow(winnerTrack, 6.5);
    race.phaseLabel = `Winner snippet: ${winnerTrack.title || 'Now playing'}`;
    if (!syncSongRaceDom()) renderMusicGames();
    const started = await startMusicGamePreview(winnerTrack, {
        durationSeconds: snippet.durationSeconds,
        startTime: snippet.startTime,
        restoreAfterEnd: false
    });
    if (!started) {
        race.phaseLabel = 'Race complete';
        if (!syncSongRaceDom()) renderMusicGames();
    }
    return started;
}

function finalizeMusicGameSongRace(race = getMusicGamesState().songRace) {
    const ranked = getSongRaceOrderedLanes(race);
    race.winnerTrackId = ranked[0]?.trackId || '';
    race.leaderTrackId = race.winnerTrackId;
    race.running = false;
    race.finished = true;
    race.phaseLabel = 'Race complete';
    clearMusicGameSongRaceTimer();
    playMusicGameSongRaceWinnerSnippet(race);
}

function advanceMusicGameSongRace() {
    const games = getMusicGamesState();
    const race = games.songRace;
    if (!race.running || !Array.isArray(race.lanes) || !race.lanes.length) return;
    if (!isMusicGameViewActive('song-race')) {
        race.running = false;
        clearMusicGameSongRaceTimer();
        return;
    }
    race.elapsedMs = Math.max(0, Date.now() - Number(race.startAt || Date.now()));
    race.lanes.forEach((lane) => {
        if (Number(lane.progress || 0) >= 100) return;
        lane.burstTicks = Math.max(0, Number(lane.burstTicks || 0) - 1);
        const burstBonus = lane.burstTicks > 0 ? 0.24 : 0;
        lane.stamina = Math.max(12, Number(lane.stamina || 100) - (0.28 + Math.random() * 0.22));
        const fatigue = Math.max(0, (100 - Number(lane.stamina || 100)) / 210);
        const jitter = (Math.random() - 0.5) * 0.08;
        lane.speed = Math.max(
            0.35,
            Math.min(Number(lane.topSpeed || 1.5), Number(lane.speed || 0.4) + Number(lane.acceleration || 0.08) + jitter + burstBonus - fatigue)
        );
        lane.progress = Math.min(100, Number(lane.progress || 0) + Number(lane.speed || 0));
        if (Number(lane.progress || 0) >= 100 && !lane.finishedAt) {
            lane.finishedAt = race.elapsedMs;
        }
    });
    const ranked = getSongRaceOrderedLanes(race);
    race.leaderTrackId = ranked[0]?.trackId || '';
    const finishedCount = race.lanes.filter((lane) => Number(lane.progress || 0) >= 100).length;
    if (finishedCount === 0) race.phaseLabel = 'Race live';
    if (finishedCount > 0 && finishedCount < race.lanes.length) race.phaseLabel = 'Final stretch';
    if (finishedCount === race.lanes.length || Number(race.elapsedMs || 0) >= 32000) {
        finalizeMusicGameSongRace(race);
    }
    if (!syncSongRaceDom()) renderMusicGames();
}

function boostMusicGameSongRace(trackId = '') {
    const race = getMusicGamesState().songRace;
    if (!race.running || Number(race.userBoostsRemaining || 0) <= 0) return false;
    const normalizedId = sanitizeText(trackId || '');
    const fallbackId = race.leaderTrackId || getSongRaceOrderedLanes(race)[0]?.trackId || '';
    const lane = (race.lanes || []).find((entry) => entry.trackId === (normalizedId || fallbackId));
    if (!lane || Number(lane.progress || 0) >= 100) return false;
    lane.burstTicks = Math.max(0, Number(lane.burstTicks || 0)) + 7;
    lane.stamina = Math.min(100, Number(lane.stamina || 0) + 14);
    lane.speed = Math.min(Number(lane.topSpeed || 1.4), Number(lane.speed || 0) + 0.35);
    race.userBoostsRemaining = Math.max(0, Number(race.userBoostsRemaining || 0) - 1);
    race.phaseLabel = `${lane.title || 'Lane'} boosted`;
    if (!syncSongRaceDom()) renderMusicGames();
    return true;
}

function startMusicGameSongRace(reset = false) {
    const tracks = getMusicGameLocalAudioTracks();
    if (tracks.length < 3) return;
    const games = getMusicGamesState();
    const nextRaceId = Number(games.songRace.raceId || 0) + 1;
    if (reset) resetMusicGameModeState('song-race');
    clearMusicGameSongRaceTimer();
    const sorted = getMusicGameSortedLibraryTracks();
    const anchors = sorted.slice(0, Math.min(2, sorted.length));
    const anchorIds = new Set(anchors.map((track) => track.id));
    const additionalCount = Math.max(1, Math.min(3, tracks.length - anchors.length));
    const additional = sampleMusicGameItems(tracks.filter((track) => !anchorIds.has(track.id)), additionalCount);
    const draftedTracks = shuffleMusicGameArray([...anchors, ...additional]).slice(0, Math.min(5, tracks.length));
    if (draftedTracks.length < 3) {
        const fillers = sampleMusicGameItems(tracks.filter((track) => !draftedTracks.some((entry) => entry.id === track.id)), 3 - draftedTracks.length);
        draftedTracks.push(...fillers);
    }
    const lanes = draftedTracks
        .map((track) => createMusicGameSongRaceLane(track))
        .filter(Boolean);
    if (lanes.length < 3) return;
    games.songRace = {
        ...createDefaultMusicGamesState().songRace,
        lanes,
        selectedTrackIds: lanes.map((lane) => lane.trackId),
        raceId: nextRaceId,
        running: true,
        finished: false,
        winnerTrackId: '',
        leaderTrackId: lanes[0]?.trackId || '',
        userBoostsRemaining: 2,
        phaseLabel: 'Race live',
        startAt: Date.now(),
        elapsedMs: 0
    };
    games.songRace.tickTimerId = setInterval(() => advanceMusicGameSongRace(), MUSIC_GAME_SONG_RACE_TICK_MS);
    if (!syncSongRaceDom()) renderMusicGames();
}

function renderPianoTilesSongRow(track = null, selectedTrackId = '') {
    if (!track) return '';
    const selected = track.id === selectedTrackId;
    const score = getPianoTilesScoreForTrack(track);
    const sourceLabel = isOnlineMusicTrackRecord(track) ? 'Online' : 'Local';
    return `<button onclick="selectPianoTilesTrack(${escapeInlineJsArgument(track.id)})" class="music-games-piano-song-row w-full rounded-[1.35rem] border px-3 py-3 text-left ${selected ? 'border-cyan-400/45 bg-cyan-500/10 shadow-[0_0_28px_rgba(6,182,212,0.14)]' : 'border-white/10 bg-black/28 hover:border-white/25 hover:bg-white/5'}">
        <div class="flex min-w-0 items-center gap-3">
            <div class="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                <img src="${getTrackCoverOrFallback(track)}" alt="${escapeHtml(track.title || 'Track cover')}" class="h-full w-full object-cover" data-track-cover-image="true" data-track-id="${track.id}" data-track-title="${escapeHtml(track.title || '')}" data-track-artist="${escapeHtml(track.artist || '')}" data-track-type="audio">
            </div>
            <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-black text-white">${escapeHtml(track.title || 'Untitled')}</div>
                <div class="mt-1 truncate text-xs font-mono text-gray-400">${escapeHtml(track.artist || 'Unknown artist')}</div>
            </div>
            <div class="hidden text-right sm:block">
                <div class="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">${escapeHtml(sourceLabel)}</div>
                <div class="mt-1 text-xs font-mono text-cyan-100">${Number(score.highScore || 0).toLocaleString()}</div>
            </div>
        </div>
    </button>`;
}

function renderPianoTilesKeyBindingMessage() {
    const piano = getMusicGamesState().pianoTiles;
    const message = sanitizeKeyBindingToken(piano.bindingMessage || '');
    if (!message) return '';
    const tone = piano.bindingMessageType === 'error'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
        : (piano.bindingMessageType === 'success'
            ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100'
            : 'border-amber-400/25 bg-amber-400/10 text-amber-100');
    return `<div class="mt-3 rounded-2xl border ${tone} px-4 py-3 text-sm font-semibold">${escapeHtml(message)}</div>`;
}

function renderPianoTilesKeyStrip(bindings = loadPianoTilesKeyBindings(), options = {}) {
    const opts = { editable: false, ...options };
    const piano = getMusicGamesState().pianoTiles;
    const keys = sanitizePianoTilesKeyBindings(bindings);
    return `<div class="music-games-piano-key-strip">
        ${keys.map((binding, lane) => {
            const capturing = opts.editable && piano.bindingLaneIndex !== null && Number(piano.bindingLaneIndex) === lane;
            const label = capturing ? 'Press any key...' : getPianoTilesKeyLabel(binding);
            if (!opts.editable) {
                return `<div data-piano-key-lane="${lane}" class="music-games-piano-key"><span>Lane ${lane + 1}</span><strong>${escapeHtml(label)}</strong></div>`;
            }
            return `<button type="button" onclick="startPianoTilesKeyCapture(${lane})" data-piano-key-lane="${lane}" class="music-games-piano-key ${capturing ? 'is-capturing' : ''}" aria-label="Change lane ${lane + 1} key"><span>Lane ${lane + 1}</span><strong>${escapeHtml(label)}</strong></button>`;
        }).join('')}
    </div>`;
}

function renderPianoTilesStartScreen() {
    const tracks = getPianoTilesCandidateTracks();
    if (!tracks.length) {
        return renderMusicGameShell('piano-tiles', renderMusicGameUnavailable('NexBeat Tiles Needs Songs', 'Add local songs or saved online music to your NexPlay library first.', 'Back To Hub'));
    }
    loadPianoTilesKeyBindings();
    const piano = getMusicGamesState().pianoTiles;
    const selectedTrack = getPianoTilesSelectedTrack();
    if (selectedTrack && piano.selectedTrackId !== selectedTrack.id) {
        piano.selectedTrackId = selectedTrack.id;
        applyPianoTilesScoreSnapshot(selectedTrack);
    }
    const score = selectedTrack ? getPianoTilesScoreForTrack(selectedTrack) : sanitizePianoTilesScoreEntry(null);
    const cached = selectedTrack ? getCachedPianoTilesBeatmap(selectedTrack) : null;
    const bindings = sanitizePianoTilesKeyBindings(piano.laneBindings || piano.laneKeys);
    const visibleTracks = tracks.slice(0, 18);
    return renderMusicGameShell('piano-tiles', `
        <section class="grid grid-cols-1 gap-5 xl:grid-cols-[0.98fr_1.02fr]">
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Song Select</div>
                        <h3 class="mt-2 text-2xl font-black text-white">Choose a track and launch a beatmap run.</h3>
                        <p class="mt-2 max-w-2xl text-sm leading-7 text-gray-400">Local audio is analyzed from the waveform. Online streams use a cached map when available, then a deterministic tempo grid when raw samples cannot be decoded.</p>
                    </div>
                    <button onclick="openPianoTilesSettings()" class="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">
                        <i data-lucide="settings-2" class="h-4 w-4"></i>
                        Keys
                    </button>
                </div>
                ${selectedTrack ? `<div class="mt-5 rounded-[1.55rem] border border-white/10 bg-black/30 p-4">
                    <div class="flex min-w-0 items-center gap-4">
                        <div class="h-20 w-20 shrink-0 overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/40">
                            <img src="${getTrackCoverOrFallback(selectedTrack)}" alt="${escapeHtml(selectedTrack.title || 'Track cover')}" class="h-full w-full object-cover" data-track-cover-image="true" data-track-id="${selectedTrack.id}" data-track-title="${escapeHtml(selectedTrack.title || '')}" data-track-artist="${escapeHtml(selectedTrack.artist || '')}" data-track-type="audio">
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="truncate text-lg font-black text-white">${escapeHtml(selectedTrack.title || 'Untitled')}</div>
                            <div class="mt-1 truncate text-xs font-mono text-gray-400">${escapeHtml(selectedTrack.artist || 'Unknown artist')}</div>
                            <div class="mt-3 flex flex-wrap gap-2">
                                <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gray-300">${isOnlineMusicTrackRecord(selectedTrack) ? 'Online track' : 'Local file'}</span>
                                <span class="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">${cached ? 'Beatmap cached' : 'Analysis needed'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="mt-5 grid gap-3 sm:grid-cols-3">
                        <div class="rounded-[1.25rem] border border-white/10 bg-black/30 px-4 py-4">
                            <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Last</div>
                            <div class="mt-2 text-xl font-black text-white">${Number(score.lastScore || 0).toLocaleString()}</div>
                        </div>
                        <div class="rounded-[1.25rem] border border-white/10 bg-black/30 px-4 py-4">
                            <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Highest</div>
                            <div class="mt-2 text-xl font-black text-white">${Number(score.highScore || 0).toLocaleString()}</div>
                        </div>
                        <div class="rounded-[1.25rem] border border-white/10 bg-black/30 px-4 py-4">
                            <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Best Combo</div>
                            <div class="mt-2 text-xl font-black text-white">x${Number(score.bestCombo || 0)}</div>
                        </div>
                    </div>
                    <div class="mt-5 flex flex-wrap gap-3">
                        <button onclick="startPianoTilesFromSelection()" class="rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.02]">${cached ? 'Play Cached Map' : 'Analyze And Play'}</button>
                        <button onclick="startPianoTilesFromSelection({ forceAnalyze: true })" class="rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">Reanalyze</button>
                    </div>
                    ${piano.error ? `<div class="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm leading-7 text-rose-100">${escapeHtml(piano.error)}</div>` : ''}
                </div>` : ''}
                <div class="mt-5 rounded-[1.45rem] border border-white/10 bg-black/25 p-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Controls</div>
                            <div class="mt-1 text-xs text-gray-400">Click a lane and press the key that feels best. Duplicate lane keys are blocked.</div>
                        </div>
                        <button type="button" onclick="resetPianoTilesKeyBindings()" class="rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">Reset</button>
                    </div>
                    <div class="mt-4">${renderPianoTilesKeyStrip(bindings, { editable: true })}</div>
                    ${renderPianoTilesKeyBindingMessage()}
                </div>
            </div>
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Library</div>
                        <h3 class="mt-2 text-xl font-black text-white">Playable songs</h3>
                    </div>
                    <div class="text-xs font-mono text-gray-500">${tracks.length} tracks</div>
                </div>
                <div class="mt-5 grid max-h-[36rem] gap-3 overflow-y-auto pr-1 custom-scrollbar">
                    ${visibleTracks.map((track) => renderPianoTilesSongRow(track, selectedTrack?.id || '')).join('')}
                </div>
            </div>
        </section>`);
}

function renderPianoTilesAnalyzingScreen() {
    const piano = getMusicGamesState().pianoTiles;
    const track = getPianoTilesSelectedTrack();
    return renderMusicGameShell('piano-tiles', `
        <section class="rounded-[1.8rem] holo-panel border border-white/10 p-6 md:p-8">
            <div class="mx-auto max-w-3xl text-center">
                <div class="mx-auto music-games-piano-analysis-orb"></div>
                <h3 class="mt-6 text-3xl font-black tracking-tight text-white">Analyzing beat timing</h3>
                <p id="piano-tiles-analysis-status" class="mx-auto mt-3 max-w-xl text-sm leading-7 text-gray-300">${escapeHtml(piano.analysisStatus || 'Preparing audio analysis...')}</p>
                ${track ? `<div class="mx-auto mt-5 flex max-w-md items-center gap-3 rounded-[1.3rem] border border-white/10 bg-black/30 p-3 text-left">
                    <div class="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                        <img src="${getTrackCoverOrFallback(track)}" alt="${escapeHtml(track.title || 'Track cover')}" class="h-full w-full object-cover" data-track-cover-image="true" data-track-id="${track.id}" data-track-title="${escapeHtml(track.title || '')}" data-track-artist="${escapeHtml(track.artist || '')}" data-track-type="audio">
                    </div>
                    <div class="min-w-0">
                        <div class="truncate text-sm font-black text-white">${escapeHtml(track.title || 'Untitled')}</div>
                        <div class="mt-1 truncate text-xs font-mono text-gray-400">${escapeHtml(track.artist || 'Unknown artist')}</div>
                    </div>
                </div>` : ''}
                <div class="mt-7 h-2 overflow-hidden rounded-full border border-white/10 bg-black/35">
                    <div id="piano-tiles-analysis-progress" class="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-300 to-pink-400 transition-[width] duration-300" style="width:${Math.round(Number(piano.analysisProgress || 0))}%"></div>
                </div>
            </div>
        </section>`);
}

function renderPianoTilesGameplayScreen() {
    const piano = getMusicGamesState().pianoTiles;
    const track = getPianoTilesSelectedTrack();
    const bindings = sanitizePianoTilesKeyBindings(piano.laneBindings || piano.laneKeys);
    return renderMusicGameShell('piano-tiles', `
        <section class="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div class="music-games-piano-stage border border-white/10 p-4 md:p-5">
                <div class="music-games-piano-playfield">
                    <div id="piano-tiles-board" class="music-games-piano-board">
                        <div class="music-games-piano-lanes">
                            ${Array.from({ length: PIANO_TILES_LANE_COUNT }, (_, lane) => `<div data-piano-lane="${lane}" class="music-games-piano-lane"></div>`).join('')}
                        </div>
                        <div class="music-games-piano-hit-zone"></div>
                        <div id="piano-tiles-feedback" class="music-games-piano-feedback">Ready</div>
                    </div>
                </div>
                <div class="mt-4">${renderPianoTilesKeyStrip(bindings)}</div>
            </div>
            <aside class="flex flex-col gap-5">
                <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                    ${track ? `<div class="flex min-w-0 items-center gap-3">
                        <div class="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                            <img src="${getTrackCoverOrFallback(track)}" alt="${escapeHtml(track.title || 'Track cover')}" class="h-full w-full object-cover" data-track-cover-image="true" data-track-id="${track.id}" data-track-title="${escapeHtml(track.title || '')}" data-track-artist="${escapeHtml(track.artist || '')}" data-track-type="audio">
                        </div>
                        <div class="min-w-0">
                            <div class="truncate text-sm font-black text-white">${escapeHtml(track.title || 'Untitled')}</div>
                            <div class="mt-1 truncate text-xs font-mono text-gray-400">${escapeHtml(track.artist || 'Unknown artist')}</div>
                        </div>
                    </div>` : ''}
                    <div class="mt-5 h-2 overflow-hidden rounded-full border border-white/10 bg-black/35">
                        <div id="piano-tiles-song-progress" class="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-300 to-pink-400" style="width:0%"></div>
                    </div>
                    <div id="piano-tiles-time" class="mt-2 text-xs font-mono text-gray-500">0:00 / ${formatTime(piano.duration || 0)}</div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div class="rounded-[1.35rem] border border-white/10 bg-black/25 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Score</div>
                        <div id="piano-tiles-score" class="mt-2 text-2xl font-black text-white">0</div>
                    </div>
                    <div class="rounded-[1.35rem] border border-white/10 bg-black/25 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Combo</div>
                        <div id="piano-tiles-combo" class="mt-2 text-2xl font-black text-white">x0</div>
                    </div>
                    <div class="rounded-[1.35rem] border border-white/10 bg-black/25 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Best</div>
                        <div id="piano-tiles-best-combo" class="mt-2 text-2xl font-black text-white">x${Number(piano.bestCombo || 0)}</div>
                    </div>
                    <div class="rounded-[1.35rem] border border-white/10 bg-black/25 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Accuracy</div>
                        <div id="piano-tiles-accuracy" class="mt-2 text-2xl font-black text-white">100%</div>
                    </div>
                </div>
                <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Hit Window</div>
                    <div id="piano-tiles-judgement" class="mt-2 text-xl font-black text-white">${escapeHtml(piano.lastJudgement || 'Ready')}</div>
                    <div class="mt-4 flex flex-wrap gap-3">
                        <button onclick="finishPianoTilesRun('quit')" class="rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">Stop Run</button>
                    </div>
                </div>
            </aside>
        </section>`);
}

function renderPianoTilesResultsScreen() {
    const piano = getMusicGamesState().pianoTiles;
    const track = getPianoTilesSelectedTrack();
    const totalJudged = Math.max(1, Number(piano.hits || 0) + Number(piano.misses || 0));
    const accuracy = Math.round((Number(piano.accuracyTotal || 0) / totalJudged) * 100);
    return renderMusicGameShell('piano-tiles', `
        <section class="grid grid-cols-1 gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-6 md:p-8">
                <div class="inline-flex items-center gap-2 rounded-full border ${piano.newHighScore ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-white/5 text-gray-300'} px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em]">
                    <i data-lucide="${piano.newHighScore ? 'trophy' : 'check-circle-2'}" class="h-4 w-4"></i>
                    ${piano.newHighScore ? 'New High Score' : 'Run Complete'}
                </div>
                <h3 class="mt-5 text-4xl font-black tracking-tight text-white">${Number(piano.score || 0).toLocaleString()}</h3>
                <p class="mt-3 text-sm leading-7 text-gray-400">${track ? escapeHtml(track.title || 'Selected track') : 'Selected track'} finished with ${Number(piano.hits || 0)} hits and ${Number(piano.misses || 0)} misses.</p>
                <div class="mt-6 grid gap-3 sm:grid-cols-3">
                    <div class="rounded-[1.25rem] border border-white/10 bg-black/30 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Highest</div>
                        <div class="mt-2 text-xl font-black text-white">${Number(piano.highScore || 0).toLocaleString()}</div>
                    </div>
                    <div class="rounded-[1.25rem] border border-white/10 bg-black/30 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Combo</div>
                        <div class="mt-2 text-xl font-black text-white">x${Number(piano.bestCombo || 0)}</div>
                    </div>
                    <div class="rounded-[1.25rem] border border-white/10 bg-black/30 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Accuracy</div>
                        <div class="mt-2 text-xl font-black text-white">${Math.max(0, Math.min(100, accuracy))}%</div>
                    </div>
                </div>
                <div class="mt-6 flex flex-wrap gap-3">
                    <button onclick="startPianoTilesFromSelection()" class="rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.02]">Replay</button>
                    <button onclick="getMusicGamesState().pianoTiles.phase = 'select'; renderMusicGames();" class="rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">Pick Song</button>
                </div>
            </div>
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Beatmap</div>
                <h3 class="mt-2 text-xl font-black text-white">${escapeHtml(piano.beatmap?.source || 'Beatmap')}</h3>
                <p class="mt-3 text-sm leading-7 text-gray-400">${escapeHtml(piano.beatmap?.analysisSummary || 'Beatmap data was generated for this run.')}</p>
                <div class="mt-5 grid gap-3 sm:grid-cols-2">
                    <div class="rounded-[1.25rem] border border-white/10 bg-black/30 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Tiles</div>
                        <div class="mt-2 text-xl font-black text-white">${Number(piano.beatmap?.tiles?.length || 0).toLocaleString()}</div>
                    </div>
                    <div class="rounded-[1.25rem] border border-white/10 bg-black/30 px-4 py-4">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Tempo</div>
                        <div class="mt-2 text-xl font-black text-white">${Number(piano.beatmap?.bpmEstimate || 0) || '--'} BPM</div>
                    </div>
                </div>
            </div>
        </section>`);
}

function renderPianoTilesSettingsScreen() {
    const piano = getMusicGamesState().pianoTiles;
    const bindings = sanitizePianoTilesKeyBindings(piano.laneBindings || piano.laneKeys);
    return renderMusicGameShell('piano-tiles', `
        <section class="rounded-[1.8rem] holo-panel border border-white/10 p-6">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Controls</div>
                    <h3 class="mt-2 text-2xl font-black text-white">NexBeat Tiles keybinds</h3>
                    <p class="mt-2 max-w-2xl text-sm leading-7 text-gray-400">Each lane is individually rebindable and saved immediately. Escape cancels capture; duplicate lane keys are prevented so every input stays unambiguous.</p>
                </div>
                <div class="flex flex-wrap gap-3">
                    <button onclick="resetPianoTilesKeyBindings()" class="rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">Reset To Default</button>
                    <button onclick="closePianoTilesSettings()" class="rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.02]">Done</button>
                </div>
            </div>
            ${renderPianoTilesKeyBindingMessage()}
            <div class="mt-6 grid gap-3 sm:grid-cols-3">
                ${bindings.map((binding, lane) => {
                    const capturing = piano.bindingLaneIndex !== null && Number(piano.bindingLaneIndex) === lane;
                    return `<button onclick="startPianoTilesKeyCapture(${lane})" class="rounded-[1.45rem] border ${capturing ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-100' : 'border-white/10 bg-black/30 text-gray-200 hover:border-white/25 hover:bg-white/5'} px-5 py-5 text-left transition">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Lane ${lane + 1}</div>
                        <div class="mt-3 text-2xl font-black text-white">${capturing ? 'Press any key...' : escapeHtml(getPianoTilesKeyLabel(binding))}</div>
                        <div class="mt-2 text-xs font-mono text-gray-500">${escapeHtml(binding.code || binding.key || 'Unset')}</div>
                    </button>`;
                }).join('')}
            </div>
            <div class="mt-5 rounded-[1.35rem] border border-white/10 bg-black/25 p-4">
                <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Current Assigned Keys</div>
                <div class="mt-3 flex flex-wrap gap-2">
                    ${bindings.map((binding, lane) => `<span class="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-gray-200">Lane ${lane + 1}: ${escapeHtml(getPianoTilesKeyLabel(binding))}</span>`).join('')}
                </div>
            </div>
        </section>`);
}

function renderPianoTilesGame() {
    const piano = getMusicGamesState().pianoTiles;
    loadPianoTilesKeyBindings();
    if (piano.phase === 'analyzing') return renderPianoTilesAnalyzingScreen();
    if (piano.phase === 'gameplay') return renderPianoTilesGameplayScreen();
    if (piano.phase === 'results') return renderPianoTilesResultsScreen();
    if (piano.phase === 'settings') return renderPianoTilesSettingsScreen();
    return renderPianoTilesStartScreen();
}

function renderMathUnlockGame() {
    const tracks = getMusicGameSortedLibraryTracks();
    if (!tracks.length) {
        return renderMusicGameShell('math-unlock', renderMusicGameUnavailable('Math Unlock Needs Songs', 'Add songs to your library first so the unlock gate has something real to protect.', 'Back To Hub'));
    }
    const math = getMusicGamesState().mathUnlock;
    const selectedTrack = tracks.find((track) => track.id === math.selectedTrackId) || null;
    const challenge = math.challenge;
    return renderMusicGameShell('math-unlock', `
        <section class="relative rounded-[1.8rem] holo-panel border border-white/10 p-5">
            <div>
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Track Picker</div>
                        <h3 class="mt-2 text-xl font-black text-white">Choose the song you want to unlock.</h3>
                        <p class="mt-2 max-w-2xl text-sm leading-7 text-gray-400">Selecting a track opens a math-only unlock popup inside NexPlay. Solve it and the main player takes over normally.</p>
                    </div>
                    <div class="text-xs font-mono text-gray-500">${tracks.length} library tracks</div>
                </div>
                <div class="mt-5 grid gap-3 max-h-[34rem] overflow-y-auto custom-scrollbar pr-1 sm:grid-cols-2">
                    ${tracks.slice(0, 12).map((track) => renderMusicGameTrackButton(track, {
                        onclick: `selectMusicGameMathTrack('${track.id}')`,
                        highlighted: track.id === selectedTrack?.id,
                        suffix: Number(track.playCount || 0) > 0 ? `${track.playCount} plays` : 'Fresh unlock'
                    })).join('')}
                </div>
            </div>
            ${selectedTrack && challenge ? `
                <div class="music-games-modal-backdrop z-20 animate-pop-in" onclick="if (event.target === this) closeMusicGameMathUnlockModal()">
                    <div class="music-games-modal-panel p-5 md:p-6" onclick="event.stopPropagation()">
                        <button type="button" onclick="closeMusicGameMathUnlockModal()" class="absolute right-4 top-4 rounded-full border border-white/10 bg-black/35 p-2 text-gray-400 transition hover:border-white/25 hover:bg-white/10 hover:text-white" aria-label="Close math unlock popup">
                            <i data-lucide="x" class="h-4 w-4"></i>
                        </button>
                        <div class="relative z-10">
                            <div class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">Playback Locked</div>
                            <div class="mt-4 flex items-center gap-4 rounded-[1.25rem] border border-white/10 bg-black/35 px-4 py-4">
                                <div class="h-16 w-16 overflow-hidden rounded-[1rem] border border-white/10 bg-black/40">
                                    <img src="${getTrackCoverOrFallback(selectedTrack)}" alt="${escapeHtml(selectedTrack.title || 'Track cover')}" class="h-full w-full object-cover" data-track-cover-image="true" data-track-id="${selectedTrack.id}" data-track-title="${escapeHtml(selectedTrack.title || '')}" data-track-artist="${escapeHtml(selectedTrack.artist || '')}" data-track-type="audio">
                                </div>
                                <div class="min-w-0">
                                    <div class="truncate text-base font-black text-white">${escapeHtml(selectedTrack.title || 'Untitled')}</div>
                                    <div class="mt-1 truncate text-xs font-mono text-gray-400">${escapeHtml(selectedTrack.artist || 'Unknown artist')}</div>
                                </div>
                            </div>
                            <form class="mt-5 space-y-4" onsubmit="submitMusicGameMathUnlock(event)">
                                <div class="rounded-[1.3rem] border border-white/10 bg-black/35 px-4 py-4">
                                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Math Only</div>
                                    <div class="mt-3 text-3xl font-black tracking-tight text-white">${escapeHtml(challenge.prompt)}</div>
                                    <p class="mt-2 text-sm leading-7 text-gray-400">No timer. Solve the equation and NexPlay unlocks normal playback immediately.</p>
                                </div>
                                <label class="block">
                                    <span class="text-xs font-black uppercase tracking-[0.16em] text-gray-400">Your answer</span>
                                    <input type="number" autofocus value="${escapeHtml(math.submittedAnswer || '')}" oninput="handleMusicGameMathAnswerInput(this.value)" class="mt-3 w-full rounded-2xl border border-white/20 bg-white px-4 py-4 text-lg font-black text-black outline-none transition focus:border-cyan-500/70" placeholder="Type the number">
                                </label>
                                ${math.feedback ? `<div class="rounded-2xl border ${math.unlockedTrackId ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-black/20 text-gray-200'} px-4 py-3 text-sm leading-7">${escapeHtml(math.feedback)}</div>` : ''}
                                <div class="flex flex-wrap gap-3">
                                    <button type="submit" class="rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.02]">Unlock Playback</button>
                                    <button type="button" onclick="selectMusicGameMathTrack('${selectedTrack.id}')" class="rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">New Equation</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>` : ''}
        </section>`);
}

function renderSnakeGame() {
    const tracks = getMusicGameLocalAudioTracks();
    if (!tracks.length) {
        return renderMusicGameShell('snake-album-covers', renderMusicGameUnavailable('Snake Needs Library Covers', 'Add songs to your library first so the board has album covers to collect.', 'Back To Hub'));
    }
    const snake = getMusicGamesState().snake;
    if (!snake.snake.length && !snake.running && !snake.gameOver) {
        setTimeout(() => {
            if (isMusicGameViewActive('snake-album-covers')) startMusicGameSnake(true);
        }, 0);
    }
    return renderMusicGameShell('snake-album-covers', `<div id="music-games-snake-runtime">${renderMusicGameSnakeRuntime(snake)}</div>`);
}

function renderSongRaceGame() {
    const tracks = getMusicGameLocalAudioTracks();
    if (tracks.length < 3) {
        return renderMusicGameShell('song-race', renderMusicGameUnavailable('Song Race Needs More Songs', 'Add at least three library tracks so NexPlay can draft a competitive race grid.', 'Back To Hub'));
    }
    const race = getMusicGamesState().songRace;
    if (!race.running && !race.lanes.length) {
        setTimeout(() => {
            if (isMusicGameViewActive('song-race')) startMusicGameSongRace(true);
        }, 0);
    }
    return renderMusicGameShell('song-race', `
        <section class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Interactive Race</div>
                    <h3 class="mt-2 text-2xl font-black text-white">Drafted songs run on live physics, not scripted winners.</h3>
                    <p class="mt-2 max-w-2xl text-sm leading-7 text-gray-400">Every lane updates from speed, stamina, and momentum. Tap Boost on any lane while tokens remain.</p>
                </div>
                <div class="flex flex-wrap gap-3">
                    <button onclick="startMusicGameSongRace(true)" class="rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.02]">Run Again</button>
                </div>
            </div>
            <div id="music-games-song-race-runtime" data-race-id="${Number(race.raceId || 0)}">${renderMusicGameSongRaceRuntime(race)}</div>
        </section>`);
}

function renderMemoryPlaylistGame() {
    const tracks = getMusicGameLocalAudioTracks();
    if (tracks.length < 4) {
        return renderMusicGameShell('memory-playlist', renderMusicGameUnavailable('Memory Playlist Needs More Songs', 'Add at least four library tracks so NexPlay can generate replay patterns with decoys.', 'Back To Hub'));
    }
    const memory = getMusicGamesState().memoryPlaylist;
    return renderMusicGameShell('memory-playlist', `<div id="music-games-memory-runtime">${renderMusicGameMemoryPlaylistRuntime(memory, tracks)}</div>`);
}

function renderWhosThatArtistGame() {
    const tracks = getMusicGameLocalAudioTracks();
    const artistCount = getMusicGameDistinctArtists().length;
    if (tracks.length < 4 || artistCount < 4) {
        return renderMusicGameShell('whos-that-artist', renderMusicGameUnavailable("Who's That Artist? Needs More Metadata", 'Add more library tracks with distinct artist names so the quiz can build clean answer sets.', 'Back To Hub'));
    }
    const quiz = getMusicGamesState().whosThatArtist;
    const track = tracks.find((entry) => entry.id === quiz.trackId) || null;
    return renderMusicGameShell('whos-that-artist', `
        <section class="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.9fr]">
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                <div class="flex flex-wrap gap-3">
                    <button onclick="replayWhosThatArtistSnippet()" class="rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.02]">Replay Snippet</button>
                    <button onclick="startWhosThatArtistRound({ reset: false })" class="rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">Next Artist</button>
                </div>
                <div class="mt-5 rounded-[1.5rem] border border-white/10 bg-black/25 px-5 py-5">
                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Prompt</div>
                    <h3 class="mt-3 text-2xl font-black text-white">Who&apos;s that artist?</h3>
                    <p class="mt-2 text-sm leading-7 text-gray-400">${escapeHtml(quiz.feedback || 'Listen to the clip and identify the artist.')}</p>
                    ${track ? `<div class="mt-5 flex items-center gap-3 rounded-[1.3rem] border border-white/10 bg-black/35 px-4 py-4">
                        <div class="h-14 w-14 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                            <img src="${getTrackCoverOrFallback(track)}" alt="${escapeHtml(track.title || 'Track cover')}" class="h-full w-full object-cover" data-track-cover-image="true" data-track-id="${track.id}" data-track-title="${escapeHtml(track.title || '')}" data-track-artist="${escapeHtml(track.artist || '')}" data-track-type="audio">
                        </div>
                        <div class="min-w-0">
                            <div class="truncate text-sm font-black text-white">${escapeHtml(track.title || 'Unknown song')}</div>
                            <div class="mt-1 text-xs text-gray-400">${quiz.answered ? escapeHtml(track.artist || 'Unknown artist') : 'Artist hidden until you answer.'}</div>
                        </div>
                    </div>` : ''}
                </div>
                <div class="mt-5 grid gap-3">
                    ${quiz.optionArtists.map((artist) => {
                        const selected = quiz.selectedArtist === artist;
                        const isCorrect = quiz.correctArtist === artist;
                        const answeredClass = quiz.answered
                            ? (isCorrect ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : (selected ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : 'border-white/10 bg-black/25 text-gray-300'))
                            : 'border-white/10 bg-black/30 text-gray-200 hover:border-white/25 hover:bg-white/5';
                        return `<button onclick="answerWhosThatArtist(${escapeInlineJsArgument(artist)})" ${quiz.answered ? 'disabled' : ''} class="rounded-[1.35rem] border px-4 py-4 text-left text-sm font-black transition ${answeredClass}">${escapeHtml(artist)}</button>`;
                    }).join('')}
                </div>
            </div>
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Quiz Rules</div>
                <ul class="mt-4 space-y-3 text-sm leading-7 text-gray-300">
                    <li>Only library tracks with artist metadata appear here.</li>
                    <li>Every round uses clean multiple-choice answers.</li>
                    <li>Snippet playback restores your previous listening context after the answer resolves.</li>
                </ul>
            </div>
        </section>`);
}

function renderFinishTheLyricsGame() {
    const lyricTracks = getMusicGameLyricTracks();
    const lyrics = getMusicGamesState().finishTheLyrics;
    if (!lyricTracks.length) {
        return renderMusicGameShell('finish-the-lyrics', renderMusicGameUnavailable('Finish the Lyrics Needs Lyric Data', 'Save or fetch lyrics for songs in your library first, then return to this game.', 'Back To Hub'));
    }
    const track = lyricTracks.find((entry) => entry.id === lyrics.trackId) || null;
    return renderMusicGameShell('finish-the-lyrics', `
        <section class="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.9fr]">
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                <div class="flex flex-wrap gap-3">
                    <button onclick="startFinishTheLyricsRound({ reset: false })" class="rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.02]">Try Another Track</button>
                </div>
                ${lyrics.unavailableReason ? `<div class="mt-5 rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm leading-7 text-amber-100">${escapeHtml(lyrics.unavailableReason)}</div>` : `
                    <div class="mt-5 rounded-[1.5rem] border border-white/10 bg-black/25 px-5 py-5">
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Missing Words</div>
                        <div class="mt-4 text-2xl md:text-3xl font-black tracking-tight text-white">${escapeHtml(lyrics.promptDisplay || 'Loading lyric prompt...')}</div>
                        <p class="mt-3 text-sm leading-7 text-gray-400">${escapeHtml(lyrics.feedback || 'Choose the missing word.')}</p>
                    </div>
                    <div class="mt-5 grid gap-3 sm:grid-cols-2">
                        ${lyrics.optionWords.map((word) => {
                            const selected = lyrics.selectedWord === word;
                            const isCorrect = lyrics.correctWord === word;
                            const answeredClass = lyrics.answered
                                ? (isCorrect ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : (selected ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : 'border-white/10 bg-black/25 text-gray-300'))
                                : 'border-white/10 bg-black/30 text-gray-200 hover:border-white/25 hover:bg-white/5';
                            return `<button onclick="answerFinishTheLyrics(${escapeInlineJsArgument(word)})" ${lyrics.answered ? 'disabled' : ''} class="rounded-[1.35rem] border px-4 py-4 text-left text-sm font-black transition ${answeredClass}">${escapeHtml(word)}</button>`;
                        }).join('')}
                    </div>`}
            </div>
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Lyric Source</div>
                ${track ? `<div class="mt-4 flex items-center gap-3 rounded-[1.3rem] border border-white/10 bg-black/30 px-4 py-4">
                    <div class="h-14 w-14 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                        <img src="${getTrackCoverOrFallback(track)}" alt="${escapeHtml(track.title || 'Track cover')}" class="h-full w-full object-cover" data-track-cover-image="true" data-track-id="${track.id}" data-track-title="${escapeHtml(track.title || '')}" data-track-artist="${escapeHtml(track.artist || '')}" data-track-type="audio">
                    </div>
                    <div class="min-w-0">
                        <div class="truncate text-sm font-black text-white">${escapeHtml(track.title || 'Untitled')}</div>
                        <div class="mt-1 truncate text-xs text-gray-400">${escapeHtml(track.artist || 'Unknown artist')}</div>
                    </div>
                </div>` : `<div class="mt-4 text-sm text-gray-400">No lyric source selected yet.</div>`}
                <p class="mt-4 text-sm leading-7 text-gray-400">Only tracks with synced lyric timing are used here so correct answers can replay the exact sung line before the next round loads.</p>
            </div>
        </section>`);
}

function renderGuessTheSongGame() {
    const tracks = getMusicGameLocalAudioTracks();
    if (tracks.length < 4) {
        return renderMusicGameShell('guess-the-song', renderMusicGameUnavailable('Guess the Song Needs More Tracks', 'Add at least four library songs so the title quiz has enough decoys.', 'Back To Hub'));
    }
    const guess = getMusicGamesState().guessTheSong;
    const currentTrack = tracks.find((track) => track.id === guess.correctTrackId) || null;
    return renderMusicGameShell('guess-the-song', `
        <section class="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.9fr]">
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                <div class="flex flex-wrap gap-3">
                    <button onclick="replayGuessTheSongSnippet()" class="rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.02]">Replay Snippet</button>
                    <button onclick="startGuessTheSongRound({ reset: false })" class="rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/30 hover:bg-white/5">Next Song</button>
                </div>
                <div class="mt-5 rounded-[1.5rem] border border-white/10 bg-black/25 px-5 py-5">
                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Prompt</div>
                    <h3 class="mt-3 text-2xl font-black text-white">Guess the song title.</h3>
                    <p class="mt-2 text-sm leading-7 text-gray-400">${escapeHtml(guess.feedback || 'Play the clip and pick the matching title.')}</p>
                    ${currentTrack ? `<div class="mt-5 text-xs font-mono text-gray-500">${guess.answered ? `Answer: ${escapeHtml(currentTrack.title || 'Unknown')}` : 'Title hidden until you answer.'}</div>` : ''}
                </div>
                <div class="mt-5 grid gap-3">
                    ${guess.optionTrackIds.map((trackId) => {
                        const optionTrack = tracks.find((track) => track.id === trackId);
                        if (!optionTrack) return '';
                        const selected = guess.selectedTrackId === trackId;
                        const isCorrect = guess.correctTrackId === trackId;
                        const answeredClass = guess.answered
                            ? (isCorrect ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : (selected ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : 'border-white/10 bg-black/25 text-gray-300'))
                            : 'border-white/10 bg-black/30 text-gray-200 hover:border-white/25 hover:bg-white/5';
                        return `<button onclick="answerGuessTheSong(${escapeInlineJsArgument(trackId)})" ${guess.answered ? 'disabled' : ''} class="rounded-[1.35rem] border px-4 py-4 text-left text-sm font-black transition ${answeredClass}">
                            ${escapeHtml(optionTrack.title || 'Untitled')}
                            <div class="mt-1 text-xs font-mono text-gray-400">${escapeHtml(optionTrack.artist || 'Unknown artist')}</div>
                        </button>`;
                    }).join('')}
                </div>
            </div>
            <div class="rounded-[1.8rem] holo-panel border border-white/10 p-5">
                <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Mode Notes</div>
                <ul class="mt-4 space-y-3 text-sm leading-7 text-gray-300">
                    <li>Library songs from both local imports and saved online music can appear in this mode.</li>
                    <li>Each round uses one correct title with three decoys.</li>
                    <li>Snippets start at random timestamps, skipping the first and last 30 seconds whenever track length allows.</li>
                </ul>
            </div>
        </section>`);
}

function renderMusicGamesGameView() {
    const activeGameId = getMusicGamesState().activeGameId;
    switch (activeGameId) {
        case 'piano-tiles':
            return renderPianoTilesGame();
        case 'math-unlock':
            return renderMathUnlockGame();
        case 'snake-album-covers':
            return renderSnakeGame();
        case 'song-race':
            return renderSongRaceGame();
        case 'memory-playlist':
            return renderMemoryPlaylistGame();
        case 'whos-that-artist':
            return renderWhosThatArtistGame();
        case 'finish-the-lyrics':
            return renderFinishTheLyricsGame();
        case 'guess-the-song':
            return renderGuessTheSongGame();
        default:
            return renderMusicGamesHub();
    }
}

function renderMusicGames() {
    const container = els.tracksContainer;
    const emptyEl = document.getElementById('empty-state');
    if (!container || !emptyEl) return;
    emptyEl.classList.add('hidden');
    emptyEl.classList.remove('flex');
    container.className = 'w-full min-w-0 flex flex-col gap-6 overflow-x-hidden pb-10 pt-4';
    const games = getMusicGamesState();
    container.innerHTML = games.view === 'game' ? renderMusicGamesGameView() : renderMusicGamesHub();
    refreshLucideIcons();
    bindTrackCoverImageFallbacks(container);
    applyFeatureVisibility();
    if (games.view === 'game') {
        if (games.activeGameId === 'piano-tiles' && games.pianoTiles.phase === 'gameplay') {
            syncPianoTilesTileDom();
            paintPianoTilesStats(true);
        } else if (games.activeGameId === 'snake-album-covers') {
            syncSnakeGameDom();
        } else if (games.activeGameId === 'song-race') {
            syncSongRaceDom();
        } else if (games.activeGameId === 'memory-playlist') {
            syncMemoryPlaylistDom();
        }
    }
}

function handleMusicGamesKeydown(event) {
    const games = getMusicGamesState();
    if (state.activeTab === 'music-games' && games.activeGameId === 'piano-tiles') {
        return handlePianoTilesKeydown(event);
    }
    if (state.activeTab !== 'music-games' || games.activeGameId !== 'snake-album-covers') return false;
    const target = event?.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return false;
    const key = String(event.key || '').toLowerCase();
    if (['arrowup', 'w'].includes(key)) {
        event.preventDefault();
        setMusicGameSnakeDirection('up');
        return true;
    }
    if (['arrowdown', 's'].includes(key)) {
        event.preventDefault();
        setMusicGameSnakeDirection('down');
        return true;
    }
    if (['arrowleft', 'a'].includes(key)) {
        event.preventDefault();
        setMusicGameSnakeDirection('left');
        return true;
    }
    if (['arrowright', 'd'].includes(key)) {
        event.preventDefault();
        setMusicGameSnakeDirection('right');
        return true;
    }
    if (key === ' ') {
        event.preventDefault();
        if (games.snake.running) pauseMusicGameSnake();
        else startMusicGameSnake(false);
        return true;
    }
    return false;
}

function buildMemoryPlaylistRoundData(round = 1) {
    const tracks = getMusicGameLocalAudioTracks();
    const sequenceLength = Math.max(3, Math.min(9, 2 + Number(round || 1)));
    const shuffledTracks = shuffleMusicGameArray(tracks);
    const sequenceTrackIds = [];
    if (shuffledTracks.length >= sequenceLength) {
        shuffledTracks.slice(0, sequenceLength).forEach((track) => sequenceTrackIds.push(track.id));
    } else {
        while (sequenceTrackIds.length < sequenceLength && shuffledTracks.length) {
            const nextTrack = shuffledTracks[sequenceTrackIds.length % shuffledTracks.length];
            sequenceTrackIds.push(nextTrack.id);
        }
    }
    const guaranteedPoolTrackIds = Array.from(new Set(sequenceTrackIds));
    const maxPoolSize = Math.max(guaranteedPoolTrackIds.length, Math.min(10, tracks.length));
    const poolTargetSize = Math.min(Math.max(guaranteedPoolTrackIds.length + 2, 6), maxPoolSize);
    const extrasNeeded = Math.max(0, poolTargetSize - guaranteedPoolTrackIds.length);
    const extraTrackIds = sampleMusicGameItems(tracks, extrasNeeded, guaranteedPoolTrackIds).map((track) => track.id);
    const poolTrackIds = shuffleMusicGameArray([...guaranteedPoolTrackIds, ...extraTrackIds]);
    return { sequenceTrackIds, poolTrackIds };
}

async function startMemoryPlaylistRound(options = {}) {
    const opts = { reset: false, replay: false, fallbackDepth: 0, ...options };
    const fallbackDepth = Math.max(0, Number(opts.fallbackDepth || 0));
    const tracks = getMusicGameLocalAudioTracks();
    if (tracks.length < 4) {
        renderMusicGames();
        return false;
    }
    const memory = opts.reset ? resetMusicGameModeState('memory-playlist') : getMusicGamesState().memoryPlaylist;
    if (opts.reset) {
        memory.round = 1;
        memory.strikes = 0;
    }
    clearMusicGameMemoryAdvanceTimer();
    memory.advanceToken = Number(memory.advanceToken || 0) + 1;
    memory.revealToken = Number(memory.revealToken || 0) + 1;
    const revealToken = memory.revealToken;
    if (!opts.replay || !memory.sequenceTrackIds.length) {
        const nextRound = buildMemoryPlaylistRoundData(memory.round || 1);
        memory.sequenceTrackIds = nextRound.sequenceTrackIds;
        memory.poolTrackIds = nextRound.poolTrackIds;
        memory.hintsUsed = 0;
    }
    memory.inputTrackIds = [];
    memory.showingSequence = true;
    memory.highlightedTrackId = null;
    memory.hintTrackId = null;
    memory.feedback = 'Pattern incoming. Listen to each 10-second snippet in order.';
    memory.roundComplete = false;
    if (!syncMemoryPlaylistDom()) renderMusicGames();
    for (const trackId of memory.sequenceTrackIds) {
        if (!isMusicGameViewActive('memory-playlist') || getMusicGamesState().memoryPlaylist.revealToken !== revealToken) {
            return false;
        }
        const track = tracks.find((entry) => entry.id === trackId) || null;
        if (!syncMemoryPlaylistDom()) renderMusicGames();
        let snippetStarted = false;
        if (track) {
            snippetStarted = await startMusicGamePreview(track, {
                durationSeconds: 10,
                randomStart: true,
                endBufferSeconds: 30,
                restoreAfterEnd: false
            });
        }
        if (!snippetStarted) {
            await stopMusicGamePreview({ restore: false, resetShell: false });
            memory.showingSequence = false;
            memory.inputTrackIds = [];
            memory.hintTrackId = null;
            if (fallbackDepth >= 3) {
                memory.feedback = 'Snippet playback failed repeatedly. Use Replay Pattern or Reset.';
                if (!syncMemoryPlaylistDom()) renderMusicGames();
                return false;
            }
            memory.feedback = 'Snippet source failed. Building a fresh pattern now.';
            if (!syncMemoryPlaylistDom()) renderMusicGames();
            await waitForMusicGame(240);
            return startMemoryPlaylistRound({
                reset: false,
                replay: false,
                fallbackDepth: fallbackDepth + 1
            });
        }
        await waitForMusicGame(10150);
        if (!isMusicGameViewActive('memory-playlist') || getMusicGamesState().memoryPlaylist.revealToken !== revealToken) {
            await stopMusicGamePreview({ restore: false, resetShell: false });
            return false;
        }
        await stopMusicGamePreview({ restore: false, resetShell: false });
        if (!syncMemoryPlaylistDom()) renderMusicGames();
        await waitForMusicGame(210);
    }
    memory.showingSequence = false;
    if (!memory.roundComplete) {
        memory.feedback = 'Pattern locked. Tap tracks in that exact order.';
    }
    if (!syncMemoryPlaylistDom()) renderMusicGames();
    return true;
}

async function useMemoryPlaylistHint() {
    const memory = getMusicGamesState().memoryPlaylist;
    if (memory.showingSequence || memory.roundComplete) return false;
    const expectedTrackId = memory.sequenceTrackIds[memory.inputTrackIds.length] || '';
    if (!expectedTrackId) return false;
    const track = getMusicGameLocalAudioTracks().find((entry) => entry.id === expectedTrackId) || null;
    if (!track) return false;
    memory.hintsUsed = Number(memory.hintsUsed || 0) + 1;
    memory.feedback = 'Hint replayed. Listen to the next sequence snippet carefully.';
    if (!syncMemoryPlaylistDom()) renderMusicGames();
    const snippetStarted = await startMusicGamePreview(track, {
        durationSeconds: 6.4,
        randomStart: true,
        endBufferSeconds: 30,
        restoreAfterEnd: false
    });
    if (!snippetStarted) {
        memory.feedback = 'Hint snippet unavailable right now. Try Replay Pattern.';
        if (!syncMemoryPlaylistDom()) renderMusicGames();
        return false;
    }
    const hintToken = Number(memory.revealToken || 0);
    memory.revealTimerId = setTimeout(() => {
        const nextMemory = getMusicGamesState().memoryPlaylist;
        if (Number(nextMemory.revealToken || 0) !== hintToken) return;
        if (state.activeTab !== 'music-games' || getMusicGamesState().activeGameId !== 'memory-playlist') return;
        stopMusicGamePreview({ restore: false, resetShell: false });
    }, 6550);
    return true;
}

function chooseMemoryPlaylistTrack(trackId = '') {
    const memory = getMusicGamesState().memoryPlaylist;
    if (memory.showingSequence || memory.roundComplete) return;
    const nextIndex = memory.inputTrackIds.length;
    const expectedTrackId = memory.sequenceTrackIds[nextIndex];
    if (!expectedTrackId) return;
    memory.hintTrackId = null;
    if (trackId !== expectedTrackId) {
        memory.strikes = Number(memory.strikes || 0) + 1;
        memory.inputTrackIds = [];
        const strikesLeft = Math.max(0, Number(memory.maxStrikes || 3) - Number(memory.strikes || 0));
        if (strikesLeft <= 0) {
            memory.feedback = `Strike limit reached. Replaying round ${memory.round}.`;
            memory.strikes = 0;
            memory.roundComplete = false;
            clearMusicGameMemoryAdvanceTimer();
            const advanceToken = Number(memory.advanceToken || 0);
            memory.advanceTimerId = setTimeout(() => {
                const nextMemory = getMusicGamesState().memoryPlaylist;
                if (state.activeTab !== 'music-games' || getMusicGamesState().activeGameId !== 'memory-playlist') return;
                if (Number(nextMemory.advanceToken || 0) !== advanceToken) return;
                startMemoryPlaylistRound({ replay: true });
            }, 850);
        } else {
            memory.feedback = `Wrong order. ${strikesLeft} strike${strikesLeft === 1 ? '' : 's'} left this round.`;
        }
        if (!syncMemoryPlaylistDom()) renderMusicGames();
        return;
    }
    memory.inputTrackIds.push(trackId);
    if (memory.inputTrackIds.length >= memory.sequenceTrackIds.length) {
        memory.roundComplete = true;
        memory.feedback = `Round ${memory.round} cleared. Next pattern loading now.`;
        clearMusicGameMemoryAdvanceTimer();
        const advanceToken = Number(memory.advanceToken || 0);
        const currentRound = Number(memory.round || 1);
        memory.advanceTimerId = setTimeout(() => {
            const nextMemory = getMusicGamesState().memoryPlaylist;
            if (state.activeTab !== 'music-games' || getMusicGamesState().activeGameId !== 'memory-playlist') return;
            if (Number(nextMemory.advanceToken || 0) !== advanceToken) return;
            if (!nextMemory.roundComplete || Number(nextMemory.round || 1) !== currentRound) return;
            nextMemory.round = currentRound + 1;
            nextMemory.strikes = 0;
            startMemoryPlaylistRound({ replay: false });
        }, 900);
    } else {
        memory.feedback = `${memory.inputTrackIds.length}/${memory.sequenceTrackIds.length} locked. Keep the pattern.`;
    }
    if (!syncMemoryPlaylistDom()) renderMusicGames();
}

function advanceMemoryPlaylistRound() {
    const memory = getMusicGamesState().memoryPlaylist;
    if (memory.showingSequence) return false;
    clearMusicGameMemoryAdvanceTimer();
    memory.round = Number(memory.round || 1) + 1;
    memory.strikes = 0;
    memory.roundComplete = false;
    memory.inputTrackIds = [];
    memory.hintTrackId = null;
    memory.highlightedTrackId = null;
    memory.feedback = `Loading round ${memory.round} pattern.`;
    if (!syncMemoryPlaylistDom()) renderMusicGames();
    startMemoryPlaylistRound({ replay: false, fallbackDepth: 0 });
    return true;
}

async function startWhosThatArtistRound(options = {}) {
    const opts = { reset: false, ...options };
    const tracks = getMusicGameLocalAudioTracks().filter((track) => sanitizeText(track.artist || ''));
    const distinctArtists = getMusicGameDistinctArtists();
    if (tracks.length < 4 || distinctArtists.length < 4) {
        renderMusicGames();
        return false;
    }
    const quiz = opts.reset ? resetMusicGameModeState('whos-that-artist') : getMusicGamesState().whosThatArtist;
    if (opts.reset) quiz.round = 1;
    const track = pickRandomMusicGameItem(tracks);
    if (!track) return false;
    const correctArtist = sanitizeText(track.artist || '');
    const optionArtists = shuffleMusicGameArray([correctArtist, ...sampleMusicGameItems(distinctArtists, 3, [correctArtist])]).slice(0, 4);
    quiz.trackId = track.id;
    quiz.correctArtist = correctArtist;
    quiz.optionArtists = optionArtists;
    quiz.selectedArtist = '';
    quiz.answered = false;
    quiz.feedback = 'Listen to the snippet and pick the right artist.';
    renderMusicGames();
    await startMusicGamePreview(track, { durationSeconds: 3.2, restoreAfterEnd: false });
    return true;
}

async function answerWhosThatArtist(value = '') {
    const quiz = getMusicGamesState().whosThatArtist;
    if (quiz.answered) return;
    const roundNumber = Number(quiz.round || 1);
    quiz.selectedArtist = String(value || '');
    quiz.answered = true;
    const wasCorrect = quiz.selectedArtist === quiz.correctArtist;
    quiz.feedback = wasCorrect
        ? 'Correct. NexPlay matched the artist.'
        : `Not this round. The correct artist was ${quiz.correctArtist || 'Unknown artist'}.`;
    renderMusicGames();
    await restoreMusicGamePlayback();
    if (wasCorrect && state.activeTab === 'music-games' && getMusicGamesState().activeGameId === 'whos-that-artist') {
        await waitForMusicGame(850);
        const nextQuiz = getMusicGamesState().whosThatArtist;
        if (state.activeTab === 'music-games' && getMusicGamesState().activeGameId === 'whos-that-artist' && nextQuiz.answered && Number(nextQuiz.round || 1) === roundNumber) {
            nextQuiz.round = roundNumber + 1;
            await startWhosThatArtistRound({ reset: false });
        }
    }
}

async function replayWhosThatArtistSnippet() {
    const quiz = getMusicGamesState().whosThatArtist;
    const track = getMusicGameLocalAudioTracks().find((entry) => entry.id === quiz.trackId);
    if (!track) return;
    await startMusicGamePreview(track, { durationSeconds: 3.2, restoreAfterEnd: false });
}

function tokenizeMusicGameLyricLine(line = '') {
    return String(line || '').split(/\s+/).filter(Boolean);
}

function sanitizeMusicGameWord(word = '') {
    return String(word || '').replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '');
}

function getMusicGameTimedLyricLines(track = null) {
    const raw = getMusicGameTrackLyricsText(track);
    if (!raw || detectLyricsFormat(raw) !== 'lrc') return [];
    const parsedLines = parseSyncedLyrics(raw)
        .map((entry) => ({
            text: normalizeMusicGameLyricLine(entry?.text || ''),
            time: Math.max(0, Number(entry?.time || 0))
        }))
        .filter((entry) => entry.text && Number.isFinite(entry.time));
    return parsedLines.map((entry, index) => ({
        ...entry,
        nextTime: Number.isFinite(parsedLines[index + 1]?.time) ? parsedLines[index + 1].time : null
    }));
}

function estimateMusicGameLyricReplayCoverage(line = '') {
    const normalizedLine = normalizeMusicGameLyricLine(line);
    const wordCount = tokenizeMusicGameLyricLine(normalizedLine)
        .map((token) => sanitizeMusicGameWord(token))
        .filter(Boolean)
        .length;
    const charCount = normalizedLine.length;
    return clampNumber((wordCount * 0.52) + (charCount * 0.018) + 1.4, 3.8, 12, MUSIC_GAME_DEFAULT_SNIPPET_SECONDS);
}

function resolveMusicGameLyricReplayCoverage(line = '', lineTime = null, nextLineTime = null, track = null) {
    const estimatedCoverage = estimateMusicGameLyricReplayCoverage(line);
    const startTime = Number(lineTime);
    const nextTime = Number(nextLineTime);
    let coverageSeconds = estimatedCoverage;
    if (Number.isFinite(startTime) && Number.isFinite(nextTime) && nextTime > startTime) {
        const lineGapSeconds = nextTime - startTime;
        const tailPadSeconds = lineGapSeconds >= 7
            ? 1
            : (lineGapSeconds >= 4 ? 0.85 : 0.65);
        coverageSeconds = lineGapSeconds + tailPadSeconds;
    }
    const remainingTrackSeconds = Number.isFinite(startTime)
        ? Math.max(0, Number(track?.duration || 0) - startTime)
        : 0;
    if (remainingTrackSeconds > 0) {
        coverageSeconds = Math.min(coverageSeconds, Math.max(1.8, remainingTrackSeconds - 0.1));
    }
    return clampNumber(coverageSeconds, 2.4, 18, estimatedCoverage);
}

function buildFinishTheLyricsQuestion(track = null, options = {}) {
    const opts = { requireTimedLine: false, ...options };
    const timedCandidates = getMusicGameTimedLyricLines(track).filter((entry) => tokenizeMusicGameLyricLine(entry.text).filter((token) => sanitizeMusicGameWord(token).length >= 4).length >= 4);
    const plainCandidates = getMusicGameLyricLines(track)
        .filter((line) => tokenizeMusicGameLyricLine(line).filter((token) => sanitizeMusicGameWord(token).length >= 4).length >= 4)
        .map((line) => ({ text: line, time: null }));
    const sourceLines = timedCandidates.length
        ? timedCandidates
        : (opts.requireTimedLine ? [] : plainCandidates);
    if (!sourceLines.length) return null;
    const chosenLine = pickRandomMusicGameItem(sourceLines);
    const line = chosenLine?.text || '';
    const tokens = tokenizeMusicGameLyricLine(line);
    const candidates = tokens
        .map((token, index) => ({ token, index, clean: sanitizeMusicGameWord(token) }))
        .filter((entry) => entry.clean.length >= 4 && entry.index > 0 && entry.index < tokens.length - 1);
    const choice = pickRandomMusicGameItem(candidates);
    if (!choice) return null;
    const wordPool = Array.from(new Set(
        getMusicGameLyricTracks()
            .flatMap((entry) => getMusicGameLyricLines(entry))
            .flatMap((entry) => tokenizeMusicGameLyricLine(entry))
            .map((entry) => sanitizeMusicGameWord(entry))
            .filter((entry) => entry.length >= 4 && entry.toLowerCase() !== choice.clean.toLowerCase())
    ));
    const optionWords = shuffleMusicGameArray([choice.clean, ...sampleMusicGameItems(wordPool, 3, [choice.clean])]).slice(0, 4);
    if (optionWords.length < 4) return null;
    return {
        promptLine: line,
        promptDisplay: tokens.map((token, index) => (index === choice.index ? '____' : token)).join(' '),
        optionWords,
        correctWord: choice.clean,
        promptTimeSeconds: Number.isFinite(Number(chosenLine?.time)) ? Number(chosenLine.time) : null,
        promptReplayDurationSeconds: resolveMusicGameLyricReplayCoverage(line, chosenLine?.time, chosenLine?.nextTime, track),
        timedSource: Number.isFinite(Number(chosenLine?.time))
    };
}

async function startFinishTheLyricsRound(options = {}) {
    const opts = { reset: false, ...options };
    const lyricTracks = getMusicGameLyricTracks();
    if (!lyricTracks.length) {
        renderMusicGames();
        return false;
    }
    const lyrics = opts.reset ? resetMusicGameModeState('finish-the-lyrics') : getMusicGamesState().finishTheLyrics;
    if (opts.reset) lyrics.round = 1;
    lyrics.unavailableReason = '';
    const candidates = shuffleMusicGameArray(lyricTracks);
    let chosenTrack = null;
    let question = null;
    for (const track of candidates) {
        const nextQuestion = buildFinishTheLyricsQuestion(track, { requireTimedLine: true });
        if (nextQuestion) {
            chosenTrack = track;
            question = nextQuestion;
            break;
        }
    }
    if (!chosenTrack || !question) {
        lyrics.trackId = null;
        lyrics.promptLine = '';
        lyrics.promptDisplay = '';
        lyrics.promptTimeSeconds = null;
        lyrics.promptReplayDurationSeconds = MUSIC_GAME_DEFAULT_SNIPPET_SECONDS;
        lyrics.timedSource = false;
        lyrics.optionWords = [];
        lyrics.correctWord = '';
        lyrics.selectedWord = '';
        lyrics.answered = false;
        lyrics.feedback = '';
        lyrics.unavailableReason = 'This game now needs synced (timed) lyrics. Add LRC-style lyrics so NexPlay can replay the exact line after a correct answer.';
        renderMusicGames();
        return false;
    }
    lyrics.trackId = chosenTrack.id;
    lyrics.promptLine = question.promptLine;
    lyrics.promptDisplay = question.promptDisplay;
    lyrics.promptTimeSeconds = question.promptTimeSeconds;
    lyrics.promptReplayDurationSeconds = question.promptReplayDurationSeconds;
    lyrics.timedSource = !!question.timedSource;
    lyrics.optionWords = question.optionWords;
    lyrics.correctWord = question.correctWord;
    lyrics.selectedWord = '';
    lyrics.answered = false;
    lyrics.feedback = 'Choose the word that completes the line.';
    renderMusicGames();
    return true;
}

async function answerFinishTheLyrics(value = '') {
    const lyrics = getMusicGamesState().finishTheLyrics;
    if (lyrics.answered) return;
    const roundNumber = Number(lyrics.round || 1);
    lyrics.selectedWord = String(value || '');
    lyrics.answered = true;
    const wasCorrect = lyrics.selectedWord === lyrics.correctWord;
    lyrics.feedback = wasCorrect
        ? 'Correct. Replaying the exact lyric moment now.'
        : `Close, but the missing word was "${lyrics.correctWord}".`;
    renderMusicGames();
    if (!wasCorrect) return;
    const startTime = Number(lyrics.promptTimeSeconds);
    const track = getMusicGameLocalAudioTracks().find((entry) => entry.id === lyrics.trackId) || null;
    if (track && Number.isFinite(startTime)) {
        const previewLeadInSeconds = 0.35;
        const replayCoverageSeconds = clampNumber(
            Number(lyrics.promptReplayDurationSeconds || MUSIC_GAME_DEFAULT_SNIPPET_SECONDS),
            2.4,
            18,
            MUSIC_GAME_DEFAULT_SNIPPET_SECONDS
        );
        const snippetDuration = replayCoverageSeconds + previewLeadInSeconds;
        const playbackStarted = await startMusicGamePreview(track, {
            durationSeconds: snippetDuration,
            startTime: Math.max(0, startTime - previewLeadInSeconds),
            endBufferSeconds: 0.4,
            restoreAfterEnd: false
        });
        if (playbackStarted) {
            const previewEnded = await waitForMusicGamePreviewToEnd(Math.max(2600, Math.round(snippetDuration * 1000) + 2400));
            if (!previewEnded && getMusicGamesState().preview.active) {
                await stopMusicGamePreview({ restore: false, resetShell: false });
            }
        } else {
            lyrics.feedback = 'Snippet failed to play. Moving to the next lyric.';
            renderMusicGames();
        }
    }
    if (state.activeTab === 'music-games' && getMusicGamesState().activeGameId === 'finish-the-lyrics') {
        await waitForMusicGame(180);
        const nextLyrics = getMusicGamesState().finishTheLyrics;
        if (state.activeTab !== 'music-games' || getMusicGamesState().activeGameId !== 'finish-the-lyrics') return;
        if (!nextLyrics.answered || Number(nextLyrics.round || 1) !== roundNumber) return;
        nextLyrics.round = roundNumber + 1;
        await startFinishTheLyricsRound({ reset: false });
    }
}

async function playGuessTheSongSnippet(track = null, options = {}) {
    if (!track) return false;
    const guess = getMusicGamesState().guessTheSong;
    guess.previewToken = Number(guess.previewToken || 0) + 1;
    const previewToken = Number(guess.previewToken || 0);
    const previewDuration = Math.max(2.4, Number(options.durationSeconds || 3.15));
    if (isMusicGamePreviewActive()) {
        await stopMusicGamePreview({ restore: false, resetShell: false });
        await waitForMusicGame(65);
    }
    const primarySnippet = buildMusicGameSnippetWindow(track, previewDuration, {
        randomStart: true,
        minStartSeconds: 30,
        endBufferSeconds: 30
    });
    let started = await startMusicGamePreview(track, {
        durationSeconds: Number(primarySnippet.durationSeconds || previewDuration),
        startTime: Number(primarySnippet.startTime || 0),
        randomStart: false,
        minStartSeconds: 30,
        endBufferSeconds: 30,
        restoreAfterEnd: false
    });
    if (!started) {
        const fallbackSnippet = buildMusicGameSnippetWindow(track, previewDuration, {
            randomStart: false,
            minStartSeconds: 30,
            endBufferSeconds: 30
        });
        started = await startMusicGamePreview(track, {
            durationSeconds: Number(fallbackSnippet.durationSeconds || previewDuration),
            startTime: Number(fallbackSnippet.startTime || 0),
            randomStart: false,
            minStartSeconds: 30,
            endBufferSeconds: 30,
            restoreAfterEnd: false
        });
    }
    if (Number(getMusicGamesState().guessTheSong.previewToken || 0) !== previewToken) return false;
    if (!started) {
        guess.feedback = 'Snippet failed to load. Tap Replay Snippet to retry.';
        if (isMusicGameViewActive('guess-the-song')) renderMusicGames();
        return false;
    }
    return true;
}

async function startGuessTheSongRound(options = {}) {
    const opts = { reset: false, ...options };
    const tracks = getMusicGameLocalAudioTracks();
    if (tracks.length < 4) {
        renderMusicGames();
        return false;
    }
    const guess = opts.reset ? resetMusicGameModeState('guess-the-song') : getMusicGamesState().guessTheSong;
    if (opts.reset) {
        guess.round = 1;
        guess.lastTrackId = null;
        guess.previewToken = 0;
    }
    const excludedTrackIds = [];
    const previousTrackId = sanitizeText(guess.trackId || guess.lastTrackId || '');
    if (tracks.length > 1 && previousTrackId) excludedTrackIds.push(previousTrackId);
    let correctTrack = pickRandomMusicGameItem(tracks, excludedTrackIds);
    if (!correctTrack) correctTrack = pickRandomMusicGameItem(tracks);
    if (!correctTrack) return false;
    const optionTrackIds = shuffleMusicGameArray([
        correctTrack.id,
        ...sampleMusicGameItems(tracks, 3, [correctTrack.id]).map((track) => track.id)
    ]).slice(0, 4);
    guess.trackId = correctTrack.id;
    guess.lastTrackId = correctTrack.id;
    guess.correctTrackId = correctTrack.id;
    guess.optionTrackIds = optionTrackIds;
    guess.selectedTrackId = '';
    guess.answered = false;
    guess.feedback = 'Listen closely, then lock in the song title.';
    renderMusicGames();
    await playGuessTheSongSnippet(correctTrack, { durationSeconds: 3.15 });
    return true;
}

async function answerGuessTheSong(trackId = '') {
    const guess = getMusicGamesState().guessTheSong;
    if (guess.answered) return;
    const roundNumber = Number(guess.round || 1);
    guess.selectedTrackId = sanitizeText(trackId || '');
    guess.answered = true;
    const correctTrack = getMusicGameLocalAudioTracks().find((track) => track.id === guess.correctTrackId);
    const wasCorrect = guess.selectedTrackId === guess.correctTrackId;
    guess.feedback = wasCorrect
        ? 'Correct title. The snippet matched the song.'
        : `Wrong title. The right answer was ${correctTrack?.title || 'Unknown'}.`;
    renderMusicGames();
    if (isMusicGamePreviewActive()) {
        await stopMusicGamePreview({ restore: false, resetShell: false });
    }
    await restoreMusicGamePlayback();
    if (wasCorrect && state.activeTab === 'music-games' && getMusicGamesState().activeGameId === 'guess-the-song') {
        await waitForMusicGame(850);
        const nextGuess = getMusicGamesState().guessTheSong;
        if (state.activeTab === 'music-games' && getMusicGamesState().activeGameId === 'guess-the-song' && nextGuess.answered && Number(nextGuess.round || 1) === roundNumber) {
            nextGuess.round = roundNumber + 1;
            await startGuessTheSongRound({ reset: false });
        }
    }
}

async function replayGuessTheSongSnippet() {
    const guess = getMusicGamesState().guessTheSong;
    const track = getMusicGameLocalAudioTracks().find((entry) => entry.id === guess.correctTrackId);
    if (!track) return;
    await playGuessTheSongSnippet(track, { durationSeconds: 3.15 });
}

function renderMusicGameTrackButton(track = null, options = {}) {
    const opts = {
        onclick: '',
        highlighted: false,
        muted: false,
        suffix: '',
        ...options
    };
    if (!track) return '';
    const cover = getTrackCoverOrFallback(track);
    return `<button onclick="${opts.onclick}" class="w-full rounded-[1.35rem] border px-3 py-3 text-left transition ${opts.highlighted ? 'border-cyan-400/40 bg-cyan-500/10 text-white shadow-[0_0_24px_rgba(6,182,212,0.16)]' : 'border-white/10 bg-black/30 text-gray-200 hover:border-white/25 hover:bg-white/5'} ${opts.muted ? 'opacity-60' : ''}">
        <div class="flex items-center gap-3">
            <div class="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                <img src="${cover}" alt="${escapeHtml(track.title || 'Track cover')}" class="h-full w-full object-cover" data-track-cover-image="true" data-track-id="${track.id}" data-track-title="${escapeHtml(track.title || '')}" data-track-artist="${escapeHtml(track.artist || '')}" data-track-type="audio">
            </div>
            <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-bold">${escapeHtml(track.title || 'Untitled')}</div>
                <div class="mt-1 truncate text-xs font-mono text-gray-400">${escapeHtml(track.artist || 'Unknown artist')}</div>
                ${opts.suffix ? `<div class="mt-1 text-[11px] text-cyan-200">${opts.suffix}</div>` : ''}
            </div>
        </div>
    </button>`;
}

function getSmartPlaylistResult(playlist = null) {
    if (!playlist) return { tracks: [], reasons: {} };
    if (playlist.id === 'recommendedNext') return getSmartRecommendedNextData();
    const tracks = typeof playlist.getTracks === 'function' ? playlist.getTracks() : [];
    return {
        tracks: (Array.isArray(tracks) ? tracks : []).filter(Boolean),
        reasons: {}
    };
}

