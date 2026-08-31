/* Legacy online playlist parsing and playlist recovery helpers.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */


/**
 * Resolve a YouTube / YouTube Music playlist ID from a share URL or raw id.
 * Works with music.youtube.com and youtube.com playlist or share links that include ?list=.
 */
function extractYouTubePlaylistIdFromUrl(rawInput = '') {
    const trimmed = sanitizeText(rawInput || '').trim();
    if (!trimmed) return '';
    try {
        const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;
        const url = new URL(href);
        const list = sanitizeText(url.searchParams.get('list') || '').trim();
        if (list && /^[A-Za-z0-9_-]+$/.test(list)) return list;
    } catch (_) {}
    const bare = trimmed.replace(/^list=/i, '').trim();
    if (/^[A-Za-z0-9_-]{13,}$/.test(bare)) return bare;
    return '';
}

function extractVimeoVideoId(urlObj) {
    const host = (urlObj.hostname || '').toLowerCase();
    if (!(host.includes('vimeo.com'))) return '';
    const parts = (urlObj.pathname || '').split('/').filter(Boolean);
    if (host === 'player.vimeo.com' && parts[0] === 'video' && /^\d+$/.test(parts[1] || '')) {
        return parts[1];
    }
    for (let i = parts.length - 1; i >= 0; i -= 1) {
        if (/^\d+$/.test(parts[i])) return parts[i];
    }
    return '';
}

function extractDailymotionVideoId(urlObj) {
    const host = (urlObj.hostname || '').toLowerCase();
    const parts = (urlObj.pathname || '').split('/').filter(Boolean);
    let id = '';
    if (host === 'dai.ly') {
        id = parts[0] || '';
    } else if (host.includes('dailymotion.com')) {
        if (parts[0] === 'video' && parts[1]) id = parts[1].split('_')[0];
        if (parts[0] === 'embed' && parts[1] === 'video' && parts[2]) id = parts[2];
    }
    id = String(id || '').trim();
    return /^[A-Za-z0-9]+$/.test(id) ? id : '';
}

function hasDirectVideoExtension(urlObj) {
    const path = (urlObj.pathname || '').toLowerCase();
    const match = path.match(/\.[a-z0-9]+$/);
    if (!match) return false;
    return DIRECT_VIDEO_URL_EXTENSIONS.has(match[0]);
}

// Adapter registry: add a new platform by appending a parser here.
const VIDEO_SOURCE_ADAPTERS = [
    {
        sourceType: 'youtube',
        platformLabel: 'YouTube',
        parse(urlObj) {
            const id = extractYouTubeVideoId(urlObj);
            if (!id) return null;
            return {
                videoId: id,
                canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
                embedUrl: buildYouTubeEmbedUrl(id),
                sourceUrl: ''
            };
        }
    },
    {
        sourceType: 'vimeo',
        platformLabel: 'Vimeo',
        parse(urlObj) {
            const id = extractVimeoVideoId(urlObj);
            if (!id) return null;
            return {
                videoId: id,
                canonicalUrl: `https://vimeo.com/${id}`,
                embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1`,
                sourceUrl: ''
            };
        }
    },
    {
        sourceType: 'dailymotion',
        platformLabel: 'Dailymotion',
        parse(urlObj) {
            const id = extractDailymotionVideoId(urlObj);
            if (!id) return null;
            return {
                videoId: id,
                canonicalUrl: `https://www.dailymotion.com/video/${id}`,
                embedUrl: `https://www.dailymotion.com/embed/video/${id}?autoplay=1`,
                sourceUrl: ''
            };
        }
    },
    {
        sourceType: 'direct',
        platformLabel: 'Direct Video',
        parse(urlObj) {
            if (!hasDirectVideoExtension(urlObj)) return null;
            const src = urlObj.toString();
            return {
                videoId: '',
                canonicalUrl: src,
                embedUrl: '',
                sourceUrl: src
            };
        }
    },
    {
        sourceType: 'embed',
        platformLabel: 'Embed',
        parse(urlObj) {
            const host = (urlObj.hostname || '').toLowerCase();
            const path = (urlObj.pathname || '').toLowerCase();
            if (!(path.includes('/embed/') || path.includes('/player/') || host.startsWith('player.'))) {
                return null;
            }
            const src = urlObj.toString();
            return {
                videoId: '',
                canonicalUrl: src,
                embedUrl: src,
                sourceUrl: src
            };
        }
    }
];

function detectVideoSource(urlInput) {
    const normalized = normalizeVideoUrlInput(urlInput);
    let parsedUrl;
    try {
        parsedUrl = new URL(normalized);
    } catch (_) {
        throw new Error('Invalid URL. Please paste a full video link.');
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only HTTP(S) video URLs are supported.');
    }

    for (const adapter of VIDEO_SOURCE_ADAPTERS) {
        const parsed = adapter.parse(parsedUrl);
        if (!parsed) continue;
        return {
            rawUrl: String(urlInput || '').trim(),
            sourceType: adapter.sourceType,
            platformLabel: adapter.platformLabel,
            videoId: parsed.videoId || '',
            canonicalUrl: parsed.canonicalUrl || parsedUrl.toString(),
            embedUrl: parsed.embedUrl || '',
            sourceUrl: parsed.sourceUrl || ''
        };
    }

    throw new Error('Unsupported link. Use YouTube, Vimeo, Dailymotion, or direct .mp4/.webm URLs.');
}

function deriveVideoLinkTitle(source) {
    const platform = source?.platformLabel || 'Video';
    if (source?.videoId) return `${platform} \u00B7 ${source.videoId}`;
    try {
        const urlObj = new URL(source?.canonicalUrl || source?.sourceUrl || '');
        const fileLike = decodeURIComponent((urlObj.pathname || '').split('/').filter(Boolean).pop() || '');
        if (fileLike) return `${platform} \u00B7 ${sanitizeText(fileLike)}`;
        return `${platform} \u00B7 ${urlObj.hostname}`;
    } catch (_) {
        return `${platform} Video`;
    }
}

function sanitizeStoredVideoLinks(list) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach(item => {
        const candidate = typeof item?.rawUrl === 'string' && item.rawUrl.trim()
            ? item.rawUrl.trim()
            : (typeof item?.canonicalUrl === 'string' ? item.canonicalUrl.trim() : '');
        if (!candidate) return;
        try {
            const parsed = detectVideoSource(candidate);
            if (seen.has(parsed.canonicalUrl)) return;
            seen.add(parsed.canonicalUrl);
            out.push({
                id: (typeof item?.id === 'string' && item.id) ? item.id : generateId(),
                title: sanitizeText(item?.title || deriveVideoLinkTitle(parsed)),
                rawUrl: candidate,
                sourceType: parsed.sourceType,
                platformLabel: parsed.platformLabel,
                videoId: parsed.videoId || '',
                canonicalUrl: parsed.canonicalUrl,
                embedUrl: parsed.embedUrl || '',
                sourceUrl: parsed.sourceUrl || '',
                addedAt: Number(item?.addedAt) || Date.now()
            });
        } catch (_) {
            // Ignore unsupported or malformed persisted entries.
        }
    });
    return out.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

function persistVideoUrlLibrary() {
    writeStorageJson(VIDEO_URL_LIBRARY_KEY, state.savedVideoLinks || []);
}

function updateVideoUrlFeedback(message, tone = 'info') {
    const feedback = document.getElementById('video-url-feedback');
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.classList.remove('text-gray-400', 'text-emerald-300', 'text-rose-300', 'text-amber-300');
    if (tone === 'success') feedback.classList.add('text-emerald-300');
    else if (tone === 'error') feedback.classList.add('text-rose-300');
    else if (tone === 'warn') feedback.classList.add('text-amber-300');
    else feedback.classList.add('text-gray-400');
}

function teardownVideoUrlHostPlayback(host) {
    if (!host || typeof host.querySelector !== 'function') return;
    const mounted = host.querySelector('iframe, video');
    if (!mounted) return;
    if (mounted.tagName === 'VIDEO') {
        safeCall(() => mounted.pause());
        safeCall(() => {
            mounted.removeAttribute('src');
            mounted.src = '';
            if (typeof mounted.load === 'function') mounted.load();
        });
        return;
    }
    if (mounted.tagName === 'IFRAME') {
        // Stop previous iframe playback before mounting a new source.
        safeCall(() => { mounted.src = 'about:blank'; });
    }
}

function renderVideoUrlPlayer(source = null) {
    const host = document.getElementById('video-url-player');
    if (!host) return;

    const sourceType = source?.sourceType || '';
    const sourceKey = source
        ? (sourceType === 'direct'
            ? (source.sourceUrl || source.canonicalUrl || '')
            : (source.embedUrl || source.sourceUrl || source.canonicalUrl || ''))
        : '';

    const mountedKey = host.dataset.loadedVideoKey || '';
    const mountedType = host.dataset.loadedVideoType || '';
    const mountedPlayer = host.querySelector('iframe, video');

    // Prevent unnecessary remounts so playback/time doesn't reset when returning to the tab.
    if (source && mountedPlayer && sourceKey && sourceKey === mountedKey && sourceType === mountedType) {
        return;
    }

    teardownVideoUrlHostPlayback(host);
    host.innerHTML = '';
    host.dataset.loadedVideoKey = '';
    host.dataset.loadedVideoType = '';

    if (!source) {
        const placeholder = document.createElement('div');
        placeholder.className = 'video-url-placeholder';
        placeholder.textContent = 'Paste a video URL to start watching inside NexPlay.';
        host.appendChild(placeholder);
        return;
    }

    if (source.sourceType === 'direct' && source.sourceUrl) {
        const video = document.createElement('video');
        video.controls = true;
        video.preload = 'metadata';
        video.playsInline = true;
        video.src = source.sourceUrl;
        if (shouldUseOnlineResume()) {
            const resumeEntry = getStoredOnlineResume(source);
            const resumeAt = Number(resumeEntry?.position || 0);
            video.addEventListener('loadedmetadata', () => {
                if (resumeAt > 1 && Number.isFinite(video.duration) && video.duration > 0) {
                    const target = Math.min(resumeAt, Math.max(0, video.duration - 0.25));
                    if (target > 1) safeSeekMedia(video, target, { fallbackDuration: video.duration });
                }
            });
            video.addEventListener('timeupdate', () => {
                const now = Date.now();
                const last = Number(video.dataset.lastResumePersist || 0);
                if (now - last < 2000) return;
                video.dataset.lastResumePersist = String(now);
                persistOnlineResumeEntry(source, video.currentTime || 0, video.paused ? 'paused' : 'playing');
            });
        }
        host.appendChild(video);
        host.dataset.loadedVideoKey = sourceKey;
        host.dataset.loadedVideoType = sourceType;
        const playAttempt = video.play();
        if (playAttempt && typeof playAttempt.catch === 'function') {
            playAttempt.catch(() => {});
        }
        return;
    }

    const iframe = document.createElement('iframe');
    iframe.src = source.embedUrl || source.sourceUrl || source.canonicalUrl;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = source.sourceType === 'youtube' ? 'origin' : 'strict-origin-when-cross-origin';
    iframe.title = `${source.platformLabel || 'Video'} player`;
    host.appendChild(iframe);
    host.dataset.loadedVideoKey = sourceKey;
    host.dataset.loadedVideoType = sourceType;
}

function getLinkCollectionsSorted() {
    const collections = Array.isArray(state.linkCollections?.collections) ? state.linkCollections.collections : [];
    return collections.slice().sort((a, b) => {
        if ((a.order || 0) !== (b.order || 0)) return (a.order || 0) - (b.order || 0);
        return (a.name || '').localeCompare(b.name || '');
    });
}

function getLinkCollectionIdForLink(linkId) {
    if (!linkId) return 'default';
    const assignments = state.linkCollections?.assignments || {};
    return assignments[linkId] || 'default';
}

function setLinkCollectionForLink(linkId, collectionId) {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_link_collections)) return;
    if (!linkId) return;
    const valid = new Set(getLinkCollectionsSorted().map((c) => c.id));
    const nextCollection = valid.has(collectionId) ? collectionId : 'default';
    if (!state.linkCollections.assignments || typeof state.linkCollections.assignments !== 'object') {
        state.linkCollections.assignments = {};
    }
    state.linkCollections.assignments[linkId] = nextCollection;
    state.linkCollections.collections = getLinkCollectionsSorted().map((item, idx) => ({ ...item, order: idx, updatedAt: Date.now() }));
    persistExtendedStores();
    renderVideoUrlLibrary();
}

function setActiveLinkCollectionFilter(collectionId) {
    state.activeLinkCollectionId = collectionId || 'all';
    renderVideoUrlLibrary();
}

async function createLinkCollectionPrompt() {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_link_collections)) return;
    const name = await openTextPromptModal({
        title: 'Create collection',
        label: 'Collection name',
        defaultValue: 'New Collection',
        confirmLabel: 'Create',
        validate: (value) => getLinkCollectionsSorted().some((c) => (c.name || '').toLowerCase() === value.toLowerCase())
            ? 'Collection name already exists.'
            : ''
    });
    if (!name) return;
    const exists = getLinkCollectionsSorted().some((c) => (c.name || '').toLowerCase() === name.toLowerCase());
    if (exists) {
        showToast('Collection name already exists.', 'error');
        return;
    }
    const collections = getLinkCollectionsSorted();
    collections.push({
        id: generateId(),
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        order: collections.length
    });
    state.linkCollections.collections = collections;
    persistExtendedStores();
    renderVideoUrlLibrary();
}

async function renameLinkCollectionPrompt() {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_link_collections)) return;
    const activeId = state.activeLinkCollectionId;
    if (!activeId || activeId === 'all' || activeId === 'default') {
        showToast('Select a custom collection to rename.', 'info');
        return;
    }
    const collections = getLinkCollectionsSorted();
    const target = collections.find((c) => c.id === activeId);
    if (!target) return;
    const next = await openTextPromptModal({
        title: 'Rename collection',
        label: 'Collection name',
        defaultValue: target.name,
        confirmLabel: 'Rename',
        validate: (value) => collections.some((c) => c.id !== activeId && (c.name || '').toLowerCase() === value.toLowerCase())
            ? 'Collection name already exists.'
            : ''
    });
    if (!next) return;
    target.name = next;
    target.updatedAt = Date.now();
    state.linkCollections.collections = collections;
    persistExtendedStores();
    renderVideoUrlLibrary();
}

async function deleteLinkCollectionPrompt() {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_link_collections)) return;
    const activeId = state.activeLinkCollectionId;
    if (!activeId || activeId === 'all' || activeId === 'default') {
        showToast('Select a custom collection to delete.', 'info');
        return;
    }
    const collections = getLinkCollectionsSorted();
    const target = collections.find((c) => c.id === activeId);
    if (!target) return;
    const ok = await openConfirmDialog({
        title: 'Delete collection?',
        message: `Delete "${target.name}"? Links will be moved to General.`,
        confirmLabel: 'Delete',
        destructive: true
    });
    if (!ok) return;
    state.linkCollections.collections = collections.filter((c) => c.id !== activeId).map((c, idx) => ({ ...c, order: idx, updatedAt: Date.now() }));
    Object.entries(state.linkCollections.assignments || {}).forEach(([linkId, collectionId]) => {
        if (collectionId === activeId) state.linkCollections.assignments[linkId] = 'default';
    });
    state.activeLinkCollectionId = 'all';
    persistExtendedStores();
    renderVideoUrlLibrary();
}

function handleVideoUrlLibraryChange(event) {
    const target = event?.target;
    if (!target) return;
    if (target.id === 'video-link-collection-filter') {
        setActiveLinkCollectionFilter(target.value || 'all');
        return;
    }
    if (target.matches('[data-video-link-collection]')) {
        const linkId = target.getAttribute('data-video-link-id');
        setLinkCollectionForLink(linkId, target.value || 'default');
    }
}

function renderVideoUrlLibrary() {
    const container = document.getElementById('video-url-library');
    const count = document.getElementById('video-url-library-count');
    const collectionFilter = document.getElementById('video-link-collection-filter');
    if (!container) return;
    const links = Array.isArray(state.savedVideoLinks) ? state.savedVideoLinks : [];
    const collections = getLinkCollectionsSorted();
    const validCollectionIds = new Set(collections.map((c) => c.id));
    if (collectionFilter) {
        const baseOptions = `<option value="all">All Collections</option>${collections.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}`;
        collectionFilter.innerHTML = baseOptions;
        if (!validCollectionIds.has(state.activeLinkCollectionId) && state.activeLinkCollectionId !== 'all') {
            state.activeLinkCollectionId = 'all';
        }
        collectionFilter.value = state.activeLinkCollectionId || 'all';
    }
    const selectedCollectionId = state.activeLinkCollectionId || 'all';
    let filteredLinks = links;
    if (isFeatureEnabled(FEATURE_REGISTRY.core_link_collections) && selectedCollectionId !== 'all') {
        filteredLinks = links.filter((entry) => getLinkCollectionIdForLink(entry.id) === selectedCollectionId);
    }
    if (count) count.textContent = `${filteredLinks.length} saved`;

    if (filteredLinks.length === 0) {
        container.innerHTML = '<div class="text-xs text-gray-500 bg-black/40 border border-white/10 rounded-xl px-3 py-3">No saved links yet. Load a URL, then tap Save.</div>';
        return;
    }

    container.innerHTML = filteredLinks.map(entry => {
        const title = escapeHtml(entry.title || deriveVideoLinkTitle(entry));
        const url = escapeHtml(entry.canonicalUrl || entry.rawUrl || '');
        const label = escapeHtml((entry.platformLabel || entry.sourceType || 'video').toUpperCase());
        const dateLabel = new Date(entry.addedAt || Date.now()).toLocaleDateString();
        const collectionId = getLinkCollectionIdForLink(entry.id);
        const collectionPicker = isFeatureEnabled(FEATURE_REGISTRY.core_link_collections)
            ? `<select data-video-link-collection="true" data-video-link-id="${entry.id}" class="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-gray-200">${collections.map((c) => `<option value="${c.id}" ${c.id === collectionId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select>`
            : '';
        const reorderButtons = isFeatureEnabled(FEATURE_REGISTRY.core_link_collections)
            ? `<button data-video-link-action="move-up" data-video-link-id="${entry.id}" class="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20" title="Move up"><i data-lucide="chevron-up" class="w-4 h-4"></i></button>
               <button data-video-link-action="move-down" data-video-link-id="${entry.id}" class="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20" title="Move down"><i data-lucide="chevron-down" class="w-4 h-4"></i></button>`
            : '';
        return `
            <div class="video-link-row rounded-xl px-3 py-3 flex items-center gap-3">
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-white truncate">${title}</p>
                    <p class="text-xs text-gray-400 truncate">${url}</p>
                    <p class="text-[10px] text-gray-500 font-mono mt-1">Saved ${escapeHtml(dateLabel)}</p>
                    ${collectionPicker}
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <span class="px-2 py-1 rounded-lg text-[10px] font-bold bg-white/10 text-gray-200 tracking-wide">${label}</span>
                    ${reorderButtons}
                    <button data-video-link-action="open" data-video-link-id="${entry.id}" class="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20" title="Open link">
                        <i data-lucide="play" class="w-4 h-4"></i>
                    </button>
                    <button data-video-link-action="delete" data-video-link-id="${entry.id}" class="p-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/35" title="Remove link">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    refreshLucideIcons();
    applyFeatureVisibility();
}

function persistTrackResumeEntry(track, time, duration) {
    if (shouldSuppressMusicGameMetrics()) return;
    if (shouldBypassPrivateSessionTrackPersistence(track)) return;
    if (!track || !shouldUseLocalResume(duration || track.duration || 0)) return;
    if (!state.resumeStore || typeof state.resumeStore !== 'object') state.resumeStore = createDefaultResumeStore();
    if (!state.resumeStore.tracks || typeof state.resumeStore.tracks !== 'object') state.resumeStore.tracks = {};
    const safeTime = Math.max(0, Number(time || 0));
    if (!Number.isFinite(safeTime) || safeTime <= 0) return;
    track.resumePosition = safeTime;
    track.resumeUpdatedAt = Date.now();
    state.resumeStore.tracks[track.id] = {
        time: safeTime,
        duration: Math.max(0, Number(duration || 0)),
        updatedAt: track.resumeUpdatedAt,
        mediaType: track.type === 'video' ? 'video' : 'audio'
    };
    state.resumeStore.lastUpdatedAt = Date.now();
    writeStorageJson(EXTENDED_STORAGE_KEYS.resumeStore, state.resumeStore);
    persistTrackMetadata(track);
}

function getStoredTrackResume(track) {
    if (!track) return 0;
    const entry = state.resumeStore?.tracks?.[track.id];
    if (entry) {
        const val = Number(entry.time || 0);
        if (Number.isFinite(val) && val > 0) return Math.max(0, val);
    }
    const meta = getStoredMetadataForFile(track) || getStoredMetadataForFile({
        name: track.fileName,
        size: track.size,
        lastModified: 0
    }) || getTrackMetadataKeys(track).map((key) => state.metadataStore?.[key]).find(Boolean);
    const fallback = Number(meta?.resumePosition || track.resumePosition || 0);
    return Number.isFinite(fallback) ? Math.max(0, fallback) : 0;
}

function extractProviderPositionFromSource(source) {
    try {
        const url = new URL(source?.canonicalUrl || source?.rawUrl || source?.sourceUrl || source?.embedUrl || '');
        const querySec = Number(url.searchParams.get('t') || url.searchParams.get('start') || 0);
        return Number.isFinite(querySec) ? Math.max(0, querySec) : 0;
    } catch (_) {
        return 0;
    }
}

function persistOnlineResumeEntry(source, position = 0, playerState = '') {
    if (!source || !shouldUseOnlineResume()) return;
    if (!state.resumeStore || typeof state.resumeStore !== 'object') state.resumeStore = createDefaultResumeStore();
    if (!state.resumeStore.online || typeof state.resumeStore.online !== 'object') state.resumeStore.online = {};
    const key = source.canonicalUrl || source.rawUrl || source.sourceUrl || source.embedUrl;
    if (!key) return;
    state.resumeStore.online[key] = {
        position: Math.max(0, Number(position || 0)),
        provider: sanitizeText(source.platformLabel || source.sourceType || 'embed'),
        sourceType: sanitizeText(source.sourceType || 'embed'),
        updatedAt: Date.now(),
        lastKnownCanonicalUrl: sanitizeText(source.canonicalUrl || key),
        playerState: sanitizeText(playerState || '')
    };
    state.resumeStore.lastUpdatedAt = Date.now();
    writeStorageJson(EXTENDED_STORAGE_KEYS.resumeStore, state.resumeStore);
}

function getStoredOnlineResume(source) {
    if (!shouldUseOnlineResume()) return null;
    const key = source?.canonicalUrl || source?.rawUrl || source?.sourceUrl || source?.embedUrl;
    if (!key) return null;
    return state.resumeStore?.online?.[key] || null;
}

function loadDetectedVideoSource(source, { fromLibrary = false } = {}) {
    if (!source) return;
    state.currentUrlVideoSource = { ...source };
    renderVideoUrlPlayer(state.currentUrlVideoSource);
    if (shouldUseOnlineResume()) {
        const resume = getStoredOnlineResume(source);
        const providerApiAvailable = (source.sourceType === 'youtube' && typeof window.YT !== 'undefined')
            || (source.sourceType === 'vimeo' && typeof window.Vimeo !== 'undefined');
        const providerPosition = providerApiAvailable
            ? Number(resume?.position || 0)
            : extractProviderPositionFromSource(source);
        persistOnlineResumeEntry(source, providerPosition, providerApiAvailable ? 'provider-api' : 'metadata-only');
    }
    const input = document.getElementById('video-url-input');
    if (input) input.value = source.canonicalUrl || source.rawUrl || '';
    if (source.sourceType === 'youtube' && !getSafeAppOrigin()) {
        updateVideoUrlFeedback('YouTube embeds can fail in local/app mode (Error 153). Open NexPlay on http://localhost:5000/ for inline playback.', 'warn');
    } else {
        updateVideoUrlFeedback(`Loaded ${source.platformLabel || 'video'} player.`, 'success');
    }
    if (fromLibrary) showToast('Loaded saved video link.', 'info');
}

function loadPastedVideoUrl(options = {}) {
    const opts = { autoSave: false, quiet: false, ...options };
    const input = document.getElementById('video-url-input');
    const raw = (input?.value || '').trim();
    if (!raw) {
        updateVideoUrlFeedback('Paste a URL first.', 'warn');
        if (!opts.quiet) showToast('Paste a URL first.', 'error');
        return;
    }

    try {
        const source = detectVideoSource(raw);
        loadDetectedVideoSource(source);
        if (opts.autoSave) saveCurrentVideoUrl({ quiet: true });
    } catch (err) {
        const msg = err?.message || 'Unable to load that URL.';
        updateVideoUrlFeedback(msg, 'error');
        if (!opts.quiet) showToast(msg, 'error');
    }
}

function saveCurrentVideoUrl(options = {}) {
    const opts = { quiet: false, ...options };
    const input = document.getElementById('video-url-input');
    const inputUrl = (input?.value || '').trim();
    let source = state.currentUrlVideoSource;

    if (!source && inputUrl) {
        try {
            source = detectVideoSource(inputUrl);
        } catch (err) {
            const msg = err?.message || 'Could not parse this URL.';
            updateVideoUrlFeedback(msg, 'error');
            if (!opts.quiet) showToast(msg, 'error');
            return null;
        }
    }

    if (!source) {
        updateVideoUrlFeedback('Load a video first, then save it.', 'warn');
        if (!opts.quiet) showToast('Load a video first, then save it.', 'error');
        return null;
    }

    const canonical = source.canonicalUrl;
    const existing = (state.savedVideoLinks || []).find(link => link.canonicalUrl === canonical);
    if (existing) {
        updateVideoUrlFeedback('This video link is already saved.', 'warn');
        if (!opts.quiet) showToast('This video link is already saved.', 'info');
        return existing;
    }

    const entry = {
        id: generateId(),
        title: sanitizeText(deriveVideoLinkTitle(source)),
        rawUrl: source.rawUrl || canonical,
        sourceType: source.sourceType,
        platformLabel: source.platformLabel,
        videoId: source.videoId || '',
        canonicalUrl: canonical,
        embedUrl: source.embedUrl || '',
        sourceUrl: source.sourceUrl || '',
        addedAt: Date.now()
    };

    state.savedVideoLinks.unshift(entry);
    if (!state.linkCollections.assignments || typeof state.linkCollections.assignments !== 'object') {
        state.linkCollections.assignments = {};
    }
    const preferredCollection = (isFeatureEnabled(FEATURE_REGISTRY.core_link_collections) && state.activeLinkCollectionId && state.activeLinkCollectionId !== 'all')
        ? state.activeLinkCollectionId
        : 'default';
    state.linkCollections.assignments[entry.id] = preferredCollection;
    persistVideoUrlLibrary();
    persistExtendedStores();
    renderVideoUrlLibrary();
    updateVideoUrlFeedback('Video link saved to your NexPlay library.', 'success');
    if (!opts.quiet) showToast('Video link saved.', 'info');
    return entry;
}

function openSavedVideoLink(id) {
    const entry = (state.savedVideoLinks || []).find(item => item.id === id);
    if (!entry) return;
    try {
        const source = detectVideoSource(entry.rawUrl || entry.canonicalUrl);
        loadDetectedVideoSource({ ...source, rawUrl: entry.rawUrl }, { fromLibrary: true });
    } catch (_) {
        const fallback = {
            rawUrl: entry.rawUrl,
            sourceType: entry.sourceType || 'embed',
            platformLabel: entry.platformLabel || 'Embed',
            videoId: entry.videoId || '',
            canonicalUrl: entry.canonicalUrl || entry.rawUrl,
            embedUrl: entry.embedUrl || '',
            sourceUrl: entry.sourceUrl || ''
        };
        loadDetectedVideoSource(fallback, { fromLibrary: true });
    }
}

function removeSavedVideoLink(id) {
    const before = (state.savedVideoLinks || []).length;
    state.savedVideoLinks = (state.savedVideoLinks || []).filter(item => item.id !== id);
    if (state.savedVideoLinks.length === before) return;
    if (state.linkCollections?.assignments) {
        delete state.linkCollections.assignments[id];
    }
    persistVideoUrlLibrary();
    persistExtendedStores();
    renderVideoUrlLibrary();
    updateVideoUrlFeedback('Removed saved link.', 'info');
    showToast('Saved link removed.', 'info');
}

function reorderSavedVideoLink(id, direction = 'up') {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_link_collections)) return;
    const list = state.savedVideoLinks || [];
    const idx = list.findIndex((item) => item.id === id);
    if (idx < 0) return;
    const target = direction === 'down' ? idx + 1 : idx - 1;
    if (target < 0 || target >= list.length) return;
    const tmp = list[target];
    list[target] = list[idx];
    list[idx] = tmp;
    state.savedVideoLinks = list;
    persistVideoUrlLibrary();
    renderVideoUrlLibrary();
}

function handleVideoUrlLibraryClick(event) {
    const button = event.target?.closest?.('[data-video-link-action]');
    if (!button) return;
    const action = button.getAttribute('data-video-link-action');
    const id = button.getAttribute('data-video-link-id');
    if (!id) return;
    if (action === 'open') {
        openSavedVideoLink(id);
    } else if (action === 'delete') {
        removeSavedVideoLink(id);
    } else if (action === 'move-up') {
        reorderSavedVideoLink(id, 'up');
    } else if (action === 'move-down') {
        reorderSavedVideoLink(id, 'down');
    }
}

function renderOnlineVideosTab() {
    const hub = document.getElementById('video-url-hub');
    const emptyEl = document.getElementById('empty-state');
    const container = els.tracksContainer;
    if (hub) hub.classList.remove('hidden');
    if (emptyEl) {
        emptyEl.classList.add('hidden');
        emptyEl.classList.remove('flex');
    }
    if (container) {
        container.innerHTML = '';
        container.className = 'w-full pb-8 pt-4';
        container.classList.remove('multi-select-active');
    }
    renderVideoUrlPlayer(state.currentUrlVideoSource);
    renderVideoUrlLibrary();
    updateBulkBar();
    applyFeatureVisibility();
}

function normalizeOnlineMusicTrackId(value = '', provider = '') {
    const raw = sanitizeText(value || '');
    if (!raw) return '';
    const prefixed = raw.match(/^(yt|youtube|itunes|deezer|spotify)[:_](.+)$/i);
    if (prefixed) {
        const provider = normalizeOnlineMusicProvider(prefixed[1]);
        const body = sanitizeText(prefixed[2] || '');
        if (!body) return '';
        return provider === 'youtube' ? `yt_${body}` : `${provider}_${body}`;
    }
    const normalizedProvider = normalizeOnlineMusicProvider(provider || '');
    return normalizedProvider && normalizedProvider !== 'youtube'
        ? `${normalizedProvider}_${raw}`
        : `yt_${raw}`;
}

function parseYouTubeDuration(raw = '') {
    const value = String(raw || '').trim();
    if (!value) return 0;
    const match = value.match(/^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)$/i);
    if (!match) return 0;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    return (hours * 3600) + (minutes * 60) + seconds;
}

function deriveOnlineMusicLyricsIdentity(rawTitle = '', rawArtist = '', rawChannel = '') {
    const titleText = sanitizeText(rawTitle || '');
    const artistText = sanitizeText(rawArtist || rawChannel || '');
    let lyricsArtist = normalizeLyricsArtistName(artistText);
    let lyricsTitle = titleText;

    const splitMatch = titleText.match(/^([^|]{1,80}?)\s[-–—]\s(.{1,180})$/);
    if (splitMatch) {
        const left = sanitizeText(splitMatch[1]);
        const right = sanitizeText(splitMatch[2]);
        const artistLooksGeneric = !lyricsArtist
            || /^youtube$/i.test(lyricsArtist)
            || /\b(?:records?|music|official|channel|media|tv|videos?)\b/i.test(artistText);
        const artistHasTopicHint = /\b-topic\b/i.test(artistText) || /\bvevo\b/i.test(artistText);
        const leftMatchesArtist = normalizeLyricsLookupText(left) === normalizeLyricsLookupText(lyricsArtist || artistText);
        if (artistLooksGeneric || artistHasTopicHint || leftMatchesArtist) {
            lyricsArtist = normalizeLyricsArtistName(left) || lyricsArtist;
            lyricsTitle = right || lyricsTitle;
        }
    }

    lyricsTitle = sanitizeText(String(lyricsTitle || '')
        .replace(/\s*[\(\[\{]\s*(?:official|lyrics?|lyric video|audio|video|visualizer|live|remaster(?:ed)?(?: \d{4})?|acoustic|demo|edit|mix|version|explicit|clean)\b[^)\]\}]*[\)\]\}]\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim());

    return {
        lyricsArtist: sanitizeText(lyricsArtist || artistText || ''),
        lyricsTitle: sanitizeText(lyricsTitle || titleText || '')
    };
}

function sanitizeStoredOnlineMusicTrack(raw = {}) {
    const provider = normalizeOnlineMusicProvider(raw.provider || raw.catalogProvider || raw.sourceProvider || raw.transportProvider || '');
    const fallbackId = raw.providerTrackId || raw.trackId || raw.videoId || '';
    const normalizedId = normalizeOnlineMusicTrackId(raw.id || fallbackId || '', provider || (raw.videoId ? 'youtube' : ''));
    if (!normalizedId) return null;
    const normalizedProvider = provider
        || (normalizedId.startsWith('itunes_') ? 'itunes' : (normalizedId.startsWith('deezer_') ? 'deezer' : (normalizedId.startsWith('spotify_') ? 'spotify' : 'youtube')));
    const providerLabel = getOnlineMusicProviderLabel(normalizedProvider);
    const videoId = sanitizeText(raw.videoId || raw.youtubeVideoId || '').trim()
        || (normalizedId.startsWith('yt_') ? normalizedId.replace(/^yt_/, '') : '');
    const parsedDuration = Number(raw.duration);
    const duration = Number.isFinite(parsedDuration) && parsedDuration >= 0
        ? parsedDuration
        : parseYouTubeDuration(raw.isoDuration || raw.youtubeDuration || '');
    const durationLabel = typeof raw.durationLabel === 'string' && raw.durationLabel.trim()
        ? raw.durationLabel.trim()
        : formatTime(duration || 0);
    const displayArtist = sanitizeText(raw.artist || raw.channelTitle || raw.channel || providerLabel || 'YouTube');
    const displayChannel = sanitizeText(raw.channelTitle || raw.artist || raw.channel || displayArtist || providerLabel || 'YouTube');
    const fallbackTitle = videoId
        ? `YouTube Track ${videoId}`
        : `${providerLabel || 'Streaming'} Track`;
    const lyricsIdentity = deriveOnlineMusicLyricsIdentity(raw.title || '', displayArtist, displayChannel);
    return {
        id: normalizedId,
        videoId,
        title: sanitizeText(raw.title || fallbackTitle),
        artist: displayArtist,
        channelTitle: displayChannel,
        channelId: sanitizeText(raw.channelId || ''),
        provider: normalizedProvider,
        providerLabel,
        catalogProvider: normalizeOnlineMusicProvider(raw.catalogProvider || normalizedProvider),
        catalogProviderLabel: sanitizeText(raw.catalogProviderLabel || providerLabel),
        transportProvider: sanitizeText(raw.transportProvider || (videoId ? 'youtube' : '')),
        transportProviderLabel: sanitizeText(raw.transportProviderLabel || (videoId ? 'YouTube' : '')),
        providerTrackId: sanitizeText(raw.providerTrackId || raw.trackId || ''),
        providerArtistId: sanitizeText(raw.providerArtistId || raw.artistId || ''),
        providerReleaseId: sanitizeText(raw.providerReleaseId || raw.providerAlbumId || raw.collectionId || raw.albumId || ''),
        releaseTitle: sanitizeText(raw.releaseTitle || ''),
        resolver: sanitizeText(raw.resolver || ''),
        sourceSurface: sanitizeText(raw.sourceSurface || ''),
        playableInEmbed: typeof raw.playableInEmbed === 'boolean' ? raw.playableInEmbed : null,
        resolvedTitle: sanitizeText(raw.resolvedTitle || raw.playbackTitle || ''),
        resolvedArtist: sanitizeText(raw.resolvedArtist || raw.playbackArtist || ''),
        pendingPlaybackResolution: !videoId,
        lyricsArtist: lyricsIdentity.lyricsArtist || displayArtist,
        lyricsTitle: lyricsIdentity.lyricsTitle || sanitizeText(raw.title || fallbackTitle),
        cover: raw.cover || raw.thumbnail || raw.artwork || '',
        description: sanitizeText(raw.description || ''),
        tags: Array.isArray(raw.tags)
            ? raw.tags.map((tag) => sanitizeText(tag || '')).filter(Boolean).slice(0, 24)
            : [],
        providerSearchRank: Math.max(0, Math.min(250, Number(raw.providerSearchRank || raw.searchProviderRank || 0) || 0)),
        providerPopularity: Math.max(0, Number(raw.providerPopularity || raw.rank || 0) || 0),
        searchCatalogSources: Array.from(new Set((Array.isArray(raw.searchCatalogSources) ? raw.searchCatalogSources : [])
            .map((source) => normalizeOnlineMusicProvider(source || ''))
            .filter(Boolean)))
            .slice(0, 6),
        searchCatalogConsensus: Math.max(0, Math.min(6, Number(raw.searchCatalogConsensus || 0) || 0)),
        viewCount: Math.max(0, Number(raw.viewCount || 0) || 0),
        likeCount: Math.max(0, Number(raw.likeCount || 0) || 0),
        duration: duration || 0,
        durationLabel,
        canonicalUrl: sanitizeText(raw.canonicalUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '')),
        publishedAt: sanitizeText(raw.publishedAt || ''),
        type: 'audio',
        source: 'online-music',
        isFavorite: !!raw.isFavorite,
        addedAt: Number(raw.addedAt) || Date.now(),
        playCount: Number(raw.playCount) || 0,
        lastPlayedAt: Number(raw.lastPlayedAt) || 0,
        customLyrics: typeof raw.customLyrics === 'string' ? raw.customLyrics : '',
        assignedLyricsRaw: typeof raw.assignedLyricsRaw === 'string' ? raw.assignedLyricsRaw : '',
        assignedLyricsSource: sanitizeText(raw.assignedLyricsSource || ''),
        assignedLyricsMeta: raw.assignedLyricsMeta && typeof raw.assignedLyricsMeta === 'object'
            ? {
                kind: raw.assignedLyricsMeta.kind === 'manual' ? 'manual' : 'auto',
                providerLabel: sanitizeText(raw.assignedLyricsMeta.providerLabel || ''),
                format: sanitizeText(raw.assignedLyricsMeta.format || ''),
                matchedLabel: sanitizeText(raw.assignedLyricsMeta.matchedLabel || ''),
                queryReason: sanitizeText(raw.assignedLyricsMeta.queryReason || ''),
                provider: sanitizeText(raw.assignedLyricsMeta.provider || '')
            }
            : null,
        resumePosition: Math.max(0, Number(raw.resumePosition) || 0),
        sourcePath: sanitizeText(raw.sourcePath || ''),
        watchFolderId: sanitizeText(raw.watchFolderId || ''),
        sourceFingerprint: sanitizeText(raw.sourceFingerprint || ''),
        originProvider: sanitizeText(raw.originProvider || normalizedProvider),
        originReleaseId: sanitizeText(raw.originReleaseId || raw.providerReleaseId || raw.providerAlbumId || raw.collectionId || raw.albumId || ''),
        downloadedAt: Number(raw.downloadedAt) || 0,
        downloadState: sanitizeText(raw.downloadState || '')
    };
}

function sanitizeStoredOnlineMusicPlaylists(list) {
    return (Array.isArray(list) ? list : [])
        .map((playlist) => ({
            id: sanitizeText(playlist?.id || generateId()),
            name: sanitizeText(playlist?.name || 'Playlist'),
            tracks: Array.from(new Set((Array.isArray(playlist?.tracks) ? playlist.tracks : [])
                .map((id) => normalizeOnlineMusicTrackId(id))
                .filter(Boolean))),
            createdAt: Number(playlist?.createdAt) || Date.now(),
            updatedAt: Number(playlist?.updatedAt) || Date.now()
        }))
        .filter((playlist) => playlist.name);
}

function sanitizeStoredOnlineMusicState(raw) {
    const base = createDefaultOnlineMusicState();
    const searchResults = (Array.isArray(raw?.searchResults) ? raw.searchResults : [])
        .map((track) => sanitizeStoredOnlineMusicTrack(track))
        .filter(Boolean);
    const currentTrack = sanitizeStoredOnlineMusicTrack(raw?.currentTrack || {});
    const downloadingTrackIds = Array.from(new Set((Array.isArray(raw?.downloadingTrackIds) ? raw.downloadingTrackIds : [])
        .map((id) => normalizeOnlineMusicTrackId(id))
        .filter(Boolean)));
    return {
        ...base,
        apiKey: sanitizeText(raw?.apiKey || base.apiKey) || base.apiKey,
        searchQuery: sanitizeText(raw?.searchQuery || ''),
        searchResults,
        searchStatus: sanitizeText(raw?.searchStatus || base.searchStatus) || base.searchStatus,
        currentTrackId: normalizeOnlineMusicTrackId(raw?.currentTrackId || currentTrack?.id || ''),
        currentTrack,
        currentTime: 0,
        duration: Math.max(0, Number(raw?.duration) || currentTrack?.duration || 0),
        volume: clampNumber(raw?.volume, 0, 100, base.volume),
        isPlaying: false,
        queue: [],
        queueIndex: base.queueIndex,
        queueMode: base.queueMode,
        queueContextView: base.queueContextView,
        queueContextKey: base.queueContextKey,
        playbackContext: raw?.playbackContext === 'library' ? 'library' : 'search',
        connectingTrackId: null,
        downloadingTrackIds,
        pendingTrackId: normalizeOnlineMusicTrackId(raw?.pendingTrackId || ''),
        downloadJobs: (Array.isArray(raw?.downloadJobs) ? raw.downloadJobs : [])
            .map((job) => ({
                id: sanitizeText(job?.id || ''),
                kind: sanitizeText(job?.kind || 'single') || 'single',
                status: sanitizeText(job?.status || 'queued') || 'queued',
                title: sanitizeText(job?.title || 'Download') || 'Download',
                message: sanitizeText(job?.message || ''),
                createdAt: Number(job?.createdAt) || Date.now(),
                updatedAt: Number(job?.updatedAt) || Date.now(),
                totalCount: Math.max(0, Number(job?.totalCount) || 0),
                completedCount: Math.max(0, Number(job?.completedCount) || 0),
                failedCount: Math.max(0, Number(job?.failedCount) || 0),
                currentIndex: Math.max(0, Number(job?.currentIndex) || 0),
                tracks: Array.isArray(job?.tracks) ? job.tracks.map((track) => ({
                    trackId: normalizeOnlineMusicTrackId(track?.trackId || ''),
                    title: sanitizeText(track?.title || ''),
                    artist: sanitizeText(track?.artist || ''),
                    status: sanitizeText(track?.status || 'queued') || 'queued',
                    message: sanitizeText(track?.message || ''),
                    savedPath: sanitizeText(track?.savedPath || '')
                })) : []
            }))
            .filter((job) => job.id),
        importReviewItems: (Array.isArray(raw?.importReviewItems) ? raw.importReviewItems : [])
            .map((item) => ({
                id: sanitizeText(item?.id || generateId()) || generateId(),
                kind: sanitizeText(item?.kind || 'info') || 'info',
                title: sanitizeText(item?.title || 'Import Review') || 'Import Review',
                detail: sanitizeText(item?.detail || ''),
                trackId: sanitizeText(item?.trackId || ''),
                createdAt: Number(item?.createdAt) || Date.now()
            })),
        artistWorkSortMode: normalizeOnlineMusicArtistWorkSortMode(raw?.artistWorkSortMode || base.artistWorkSortMode),
        artistWorkSearchQuery: sanitizeText(raw?.artistWorkSearchQuery || ''),
        providerHealth: {
            youtubeDiscovery: ['healthy', 'quota', 'error', 'disabled'].includes(raw?.providerHealth?.youtubeDiscovery) ? raw.providerHealth.youtubeDiscovery : base.providerHealth.youtubeDiscovery,
            youtubePlaybackResolver: ['idle', 'healthy', 'error'].includes(raw?.providerHealth?.youtubePlaybackResolver) ? raw.providerHealth.youtubePlaybackResolver : base.providerHealth.youtubePlaybackResolver,
            lastMessage: sanitizeText(raw?.providerHealth?.lastMessage || ''),
            lastCode: sanitizeText(raw?.providerHealth?.lastCode || ''),
            lastUpdatedAt: Number(raw?.providerHealth?.lastUpdatedAt) || 0,
            blockedUntil: Number(raw?.providerHealth?.blockedUntil) || 0
        },
        lastUpdatedAt: Number(raw?.lastUpdatedAt) || 0
    };
}

function sanitizeStoredOnlineMusicLibrary(list) {
    return (Array.isArray(list) ? list : [])
        .map((track) => sanitizeStoredOnlineMusicTrack(track))
        .filter(Boolean)
        .map((track) => ({
            ...track,
            resumePosition: 0,
            resumeUpdatedAt: 0
        }));
}

function buildSavedOnlineMusicLibraryIndex(tracks = []) {
    const sanitizedTracks = sanitizeStoredOnlineMusicLibrary(tracks);
    const helper = window.NexPlayOnlineMusicHelpers;
    if (helper && typeof helper.buildSavedOnlineMusicLibraryIndex === 'function') {
        return helper.buildSavedOnlineMusicLibraryIndex(sanitizedTracks);
    }
    return sanitizedTracks.reduce((index, track) => {
        if (track?.id) index[track.id] = { ...track };
        return index;
    }, {});
}

function replaceSavedOnlineMusicLibrary(tracks = []) {
    state.savedOnlineMusicLibraryIndex = buildSavedOnlineMusicLibraryIndex(tracks);
    return state.savedOnlineMusicLibraryIndex;
}

function upsertSavedOnlineMusicLibraryTrack(track = null) {
    const clean = sanitizeStoredOnlineMusicTrack(track);
    if (!clean) return null;
    const helper = window.NexPlayOnlineMusicHelpers;
    const currentIndex = state.savedOnlineMusicLibraryIndex && typeof state.savedOnlineMusicLibraryIndex === 'object'
        ? state.savedOnlineMusicLibraryIndex
        : {};
    const existing = currentIndex[clean.id] || {};
    const nextTrack = {
        ...existing,
        ...clean,
        resumePosition: 0,
        resumeUpdatedAt: 0
    };
    if (helper && typeof helper.upsertSavedOnlineMusicLibraryEntry === 'function') {
        state.savedOnlineMusicLibraryIndex = helper.upsertSavedOnlineMusicLibraryEntry(currentIndex, nextTrack);
    } else {
        state.savedOnlineMusicLibraryIndex = {
            ...currentIndex,
            [clean.id]: nextTrack
        };
    }
    return state.savedOnlineMusicLibraryIndex[clean.id] || nextTrack;
}

function removeSavedOnlineMusicLibraryTracks(trackIds = []) {
    const helper = window.NexPlayOnlineMusicHelpers;
    const currentIndex = state.savedOnlineMusicLibraryIndex && typeof state.savedOnlineMusicLibraryIndex === 'object'
        ? state.savedOnlineMusicLibraryIndex
        : {};
    const ids = Array.from(new Set((Array.isArray(trackIds) ? trackIds : [trackIds])
        .map((id) => normalizeOnlineMusicTrackId(id))
        .filter(Boolean)));
    if (!ids.length) return state.savedOnlineMusicLibraryIndex;
    if (helper && typeof helper.removeSavedOnlineMusicLibraryEntries === 'function') {
        state.savedOnlineMusicLibraryIndex = helper.removeSavedOnlineMusicLibraryEntries(currentIndex, ids);
    } else {
        state.savedOnlineMusicLibraryIndex = Object.entries(currentIndex).reduce((nextIndex, [id, track]) => {
            if (!ids.includes(id)) nextIndex[id] = track;
            return nextIndex;
        }, {});
    }
    return state.savedOnlineMusicLibraryIndex;
}

function getSavedOnlineTrack(trackId = '') {
    const id = normalizeOnlineMusicTrackId(trackId);
    if (!id) return null;
    const helper = window.NexPlayOnlineMusicHelpers;
    const currentIndex = state.savedOnlineMusicLibraryIndex && typeof state.savedOnlineMusicLibraryIndex === 'object'
        ? state.savedOnlineMusicLibraryIndex
        : {};
    if (helper && typeof helper.lookupSavedOnlineMusicLibraryEntry === 'function') {
        return helper.lookupSavedOnlineMusicLibraryEntry(currentIndex, id) || null;
    }
    return currentIndex[id] || null;
}

function getSavedOnlineLibraryTracks() {
    const currentIndex = state.savedOnlineMusicLibraryIndex && typeof state.savedOnlineMusicLibraryIndex === 'object'
        ? state.savedOnlineMusicLibraryIndex
        : {};
    return sanitizeStoredOnlineMusicLibrary(Object.values(currentIndex));
}

function persistSavedOnlineMusicLibrary() {
    if (shouldBypassStorageWriteForPrivateSession()) return false;
    try {
        writeStorageJson(ONLINE_MUSIC_LIBRARY_KEY, getSavedOnlineLibraryTracks());
    } catch (_) {}
    return true;
}

function clearOnlineMusicResumeMetadata(track = null) {
    const libraryTargets = track ? [track] : (state.tracks || []).filter((item) => isOnlineMusicTrackRecord(item));
    const savedTargets = track
        ? [getSavedOnlineTrack(track.id)].filter(Boolean)
        : Object.values(state.savedOnlineMusicLibraryIndex || {});
    const targets = [...libraryTargets, ...savedTargets];
    targets.forEach((candidate) => {
        if (!candidate || !isOnlineMusicTrackRecord(candidate)) return;
        candidate.resumePosition = 0;
        candidate.resumeUpdatedAt = 0;
        const keys = getTrackMetadataKeys(candidate);
        keys.forEach((key) => {
            const existing = state.metadataStore?.[key];
            if (!existing) return;
            state.metadataStore[key] = {
                ...existing,
                resumePosition: 0,
                resumeUpdatedAt: 0
            };
        });
    });
    if (state.currentTrack && isOnlineMusicTrackRecord(state.currentTrack)) {
        state.currentTrack = {
            ...state.currentTrack,
            resumePosition: 0,
            resumeUpdatedAt: 0
        };
    }
    if (state.onlineMusic?.currentTrack && isOnlineMusicTrackRecord(state.onlineMusic.currentTrack)) {
        state.onlineMusic.currentTrack = {
            ...state.onlineMusic.currentTrack,
            resumePosition: 0,
            resumeUpdatedAt: 0
        };
    }
}

function hydrateSavedOnlineTracksIntoMainLibrary(savedTracks = []) {
    sanitizeStoredOnlineMusicLibrary(savedTracks).forEach((track) => {
        upsertSavedOnlineMusicLibraryTrack(track);
        syncOnlineTrackIntoMainLibrary(track, { allowInsert: true, persistLibrary: false });
    });
    clearOnlineMusicResumeMetadata();
}

function applyLegacyOnlineMusicMigration(rawState = null) {
    const helper = window.NexPlayOnlineMusicHelpers;
    if (!helper || typeof helper.migrateLegacyOnlineMusicData !== 'function') return;
    const raw = rawState && typeof rawState === 'object' ? rawState : {};
    const legacyLibrary = sanitizeStoredOnlineMusicLibrary(raw.library);
    const legacyPlaylists = sanitizeStoredOnlineMusicPlaylists(raw.playlists);
    if (!legacyLibrary.length && !legacyPlaylists.length) return;
    const migrated = helper.migrateLegacyOnlineMusicData({
        onlineMusicState: {
            ...raw,
            library: legacyLibrary,
            playlists: legacyPlaylists
        },
        existingPlaylists: state.playlists || [],
        generateId
    });
    hydrateSavedOnlineTracksIntoMainLibrary(migrated.migratedTracks || []);
    if (Array.isArray(migrated.migratedPlaylists) && migrated.migratedPlaylists.length) {
        state.playlists = sanitizeStoredPlaylists([...(state.playlists || []), ...migrated.migratedPlaylists]);
    }
    state.onlineMusic = sanitizeStoredOnlineMusicState(migrated.nextOnlineState || {});
    clearOnlineMusicResumeMetadata();
    persistSavedOnlineMusicLibrary();
    persistOnlineMusicState();
    persistPlaylists();
    persistMetadataStoreWithFallback();
}

function getOnlineMusicState() {
    if (!state.onlineMusic || typeof state.onlineMusic !== 'object') {
        state.onlineMusic = createDefaultOnlineMusicState();
    }
    return state.onlineMusic;
}

function getOnlineMusicPlayerVideoId() {
    try {
        return sanitizeText(onlineMusicPlayer?.getVideoData?.().video_id || '');
    } catch (_) {
        return '';
    }
}

function beginOnlineMusicSession(track = null, options = {}) {
    const online = getOnlineMusicState();
    onlineMusicSessionId += 1;
    online.sessionId = onlineMusicSessionId;
    online.expectedVideoId = sanitizeText(track?.videoId || '');
    setOnlineMusicTransportOwner('connecting', {
        sessionId: onlineMusicSessionId,
        trackId: track?.id || '',
        attemptId: options.attemptId || options.attempt?.id || 0
    });
    return onlineMusicSessionId;
}

function invalidateOnlineMusicSession() {
    const online = getOnlineMusicState();
    onlineMusicSessionId += 1;
    online.sessionId = onlineMusicSessionId;
    online.expectedVideoId = '';
    clearOnlineMusicTransportOwner({ force: true });
    return onlineMusicSessionId;
}

function clearOnlineMusicAdvanceAfterFailureTimer() {
    if (!onlineMusicAdvanceAfterFailureTimer) return;
    clearTimeout(onlineMusicAdvanceAfterFailureTimer);
    onlineMusicAdvanceAfterFailureTimer = null;
}

function beginOnlineMusicPlaybackAttempt(trackId = '') {
    clearOnlineMusicAdvanceAfterFailureTimer();
    onlineMusicPlaybackAttemptSeq += 1;
    const playbackIntent = getActivePlaybackIntent();
    onlineMusicLatestPlaybackAttempt = {
        id: onlineMusicPlaybackAttemptSeq,
        trackId: normalizeOnlineMusicTrackId(trackId || ''),
        playbackIntentId: Number(playbackIntent.id || 0),
        playbackIntentSource: sanitizeText(playbackIntent.sourceKind || '')
    };
    return { ...onlineMusicLatestPlaybackAttempt };
}

function isOnlineMusicPlaybackAttemptStale(attempt = null) {
    const attemptId = Number(attempt?.id || 0) || 0;
    const attemptTrackId = normalizeOnlineMusicTrackId(attempt?.trackId || '');
    const playbackIntentId = Number(attempt?.playbackIntentId || 0) || 0;
    if (playbackIntentId && !isPlaybackIntentActive({
        id: playbackIntentId,
        trackId: attemptTrackId,
        sourceKind: attempt?.playbackIntentSource || 'online-music'
    })) {
        return true;
    }
    const helper = window.NexPlayOnlineMusicHelpers?.isStaleOnlineMusicPlaybackAttempt;
    if (typeof helper === 'function') {
        return !!helper({
            attemptId,
            latestId: Number(onlineMusicLatestPlaybackAttempt?.id || 0),
            attemptTrackId,
            latestTrackId: normalizeOnlineMusicTrackId(onlineMusicLatestPlaybackAttempt?.trackId || '')
        });
    }
    return !attemptId
        || attemptId !== Number(onlineMusicLatestPlaybackAttempt?.id || 0)
        || attemptTrackId !== normalizeOnlineMusicTrackId(onlineMusicLatestPlaybackAttempt?.trackId || '');
}

function getOnlineMusicConnectingAttemptTrackId() {
    return normalizeOnlineMusicTrackId(onlineMusicConnectingAttempt?.trackId || '');
}

function setOnlineMusicConnectingAttempt(trackId = '', options = {}) {
    const safeTrackId = normalizeOnlineMusicTrackId(trackId || '');
    onlineMusicConnectingAttempt = {
        attemptId: Number(options.attemptId || options.attempt?.id || 0) || 0,
        trackId: safeTrackId,
        sessionId: Number(options.sessionId || 0) || 0,
        startedAt: Date.now(),
        phase: sanitizeText(options.phase || 'connecting') || 'connecting'
    };
    getOnlineMusicState().connectingTrackId = safeTrackId || null;
    return { ...onlineMusicConnectingAttempt };
}

function isOnlineMusicConnectingAttemptActive(options = {}) {
    const activeTrackId = getOnlineMusicConnectingAttemptTrackId();
    if (!activeTrackId) return false;
    const safeTrackId = normalizeOnlineMusicTrackId(options.trackId || '');
    if (safeTrackId && safeTrackId !== activeTrackId) return false;
    const online = getOnlineMusicState();
    if (normalizeOnlineMusicTrackId(online.connectingTrackId || '') !== activeTrackId) return false;
    const expectedAttemptId = Number(options.attemptId || options.attempt?.id || 0) || 0;
    const activeAttemptId = Number(onlineMusicConnectingAttempt?.attemptId || 0) || 0;
    if (expectedAttemptId && activeAttemptId && expectedAttemptId !== activeAttemptId) return false;
    const expectedSessionId = Number(options.sessionId || 0) || 0;
    const activeSessionId = Number(onlineMusicConnectingAttempt?.sessionId || 0) || 0;
    if (expectedSessionId && activeSessionId && expectedSessionId !== activeSessionId) return false;
    return true;
}

function clearOnlineMusicConnectingAttempt(options = {}) {
    const safeTrackId = normalizeOnlineMusicTrackId(options.trackId || '');
    const force = options.force === true;
    if (!force && !isOnlineMusicConnectingAttemptActive({
        trackId: safeTrackId,
        attemptId: Number(options.attemptId || options.attempt?.id || 0) || 0,
        sessionId: Number(options.sessionId || 0) || 0
    })) {
        return false;
    }
    const activeTrackId = getOnlineMusicConnectingAttemptTrackId();
    const online = getOnlineMusicState();
    const visibleTrackId = normalizeOnlineMusicTrackId(online.connectingTrackId || '');
    if (force || !safeTrackId || visibleTrackId === safeTrackId || visibleTrackId === activeTrackId) {
        online.connectingTrackId = null;
    }
    onlineMusicConnectingAttempt = { attemptId: 0, trackId: '', sessionId: 0, startedAt: 0, phase: '' };
    return true;
}

function shouldHoldOnlineMusicTransportEventDuringConnect(eventData = null) {
    if (eventData === undefined || eventData === null) return false;
    const YTState = window.YT?.PlayerState || {};
    const isSettlingEvent = eventData === YTState.PAUSED
        || eventData === YTState.CUED
        || eventData === YTState.ENDED;
    if (!isSettlingEvent) return false;
    const connectingTrackId = getOnlineMusicConnectingAttemptTrackId()
        || normalizeOnlineMusicTrackId(getOnlineMusicState().connectingTrackId || '');
    return !!connectingTrackId && isOnlineMusicConnectingAttemptActive({ trackId: connectingTrackId });
}

function getFailedOnlineMusicTrackRecord(trackId = '') {
    const id = normalizeOnlineMusicTrackId(trackId || '');
    if (!id) return null;
    const record = onlineMusicFailedTrackCache.get(id) || null;
    if (!record) return null;
    const failedAt = Number(record.failedAt || 0);
    if (failedAt && Date.now() - failedAt > 10 * 60 * 1000) {
        onlineMusicFailedTrackCache.delete(id);
        return null;
    }
    return record;
}

function rememberFailedOnlineMusicTrack(track = null, message = '', options = {}) {
    const trackId = normalizeOnlineMusicTrackId(track?.id || track || '');
    const safeMessage = sanitizeText(message || 'This track could not be played right now.') || 'This track could not be played right now.';
    const failedVideoId = sanitizeText(options.videoId || track?.videoId || '').trim();
    if (!trackId) {
        return {
            trackId: '',
            title: sanitizeText(track?.title || ''),
            message: safeMessage,
            failedVideoIds: failedVideoId ? [failedVideoId] : [],
            failedAt: Date.now(),
            isFirstFailure: false
        };
    }
    const existing = onlineMusicFailedTrackCache.get(trackId);
    const failedVideoIds = Array.from(new Set([
        ...(Array.isArray(existing?.failedVideoIds) ? existing.failedVideoIds : []),
        failedVideoId
    ].map((id) => sanitizeText(id || '')).filter(Boolean))).slice(-6);
    if (existing) {
        const next = {
            ...existing,
            message: safeMessage || existing.message,
            failedVideoIds,
            failedAt: Date.now(),
            isFirstFailure: false
        };
        onlineMusicFailedTrackCache.set(trackId, next);
        return next;
    }
    const record = {
        trackId,
        title: sanitizeText(track?.title || ''),
        message: safeMessage,
        failedVideoIds,
        failedAt: Date.now()
    };
    onlineMusicFailedTrackCache.set(trackId, record);
    return {
        ...record,
        isFirstFailure: true
    };
}

function forgetFailedOnlineMusicTrack(trackId = '') {
    const id = normalizeOnlineMusicTrackId(trackId || '');
    if (!id) return false;
    return onlineMusicFailedTrackCache.delete(id);
}

function getFailedOnlineMusicTrackVideoIds(trackId = '') {
    const record = getFailedOnlineMusicTrackRecord(trackId);
    return Array.from(new Set((Array.isArray(record?.failedVideoIds) ? record.failedVideoIds : [])
        .map((id) => sanitizeText(id || '').trim())
        .filter(Boolean)));
}

function getFailedOnlineMusicTrackMessage(trackId = '', fallback = 'This track could not be played right now.') {
    return getFailedOnlineMusicTrackRecord(trackId)?.message
        || (sanitizeText(fallback || '') || 'This track could not be played right now.');
}

function scheduleOnlineMusicAdvanceAfterFailure(trackId = '') {
    const failedTrackId = normalizeOnlineMusicTrackId(trackId || '');
    if (!failedTrackId || onlineMusicAdvanceAfterFailureTimer) return;
    const failedSessionId = Number(getOnlineMusicState().sessionId || 0);
    const failurePlaybackIntent = getActivePlaybackIntent();
    if (!isPlaybackIntentActive(failurePlaybackIntent)) return;
    if (normalizeOnlineMusicTrackId(failurePlaybackIntent.trackId || '') !== failedTrackId) return;
    onlineMusicAdvanceAfterFailureTimer = window.setTimeout(() => {
        onlineMusicAdvanceAfterFailureTimer = null;
        if (!isPlaybackIntentActive(failurePlaybackIntent)) return;
        if (Number(getOnlineMusicState().sessionId || 0) !== failedSessionId) return;
        const currentTrackId = normalizeOnlineMusicTrackId(getOnlineMusicCurrentTrack()?.id || state.currentTrackId || '');
        if (currentTrackId !== failedTrackId) return;
        Promise.resolve()
            .then(() => playNext())
            .catch((error) => console.error(error));
    }, 0);
}

function shouldIgnoreOnlineMusicTransport(track = getOnlineMusicCurrentTrack(), options = {}) {
    const online = getOnlineMusicState();
    const expectedVideoId = sanitizeText(options.expectedVideoId || online.expectedVideoId || track?.videoId || '');
    const playerVideoId = sanitizeText(options.playerVideoId || getOnlineMusicPlayerVideoId() || '');
    const payload = {
        currentPlaybackSource: state.currentPlaybackSource,
        currentTrackId: online.currentTrackId || track?.id || '',
        currentSessionId: Number(online.sessionId || 0),
        latestSessionId: Number(onlineMusicSessionId || 0),
        expectedVideoId,
        playerVideoId
    };
    const helper = window.NexPlayOnlineMusicHelpers?.shouldIgnoreOnlineMusicTransportEvent;
    if (typeof helper === 'function') {
        return !!helper(payload);
    }
    if (payload.currentPlaybackSource !== 'online-music') return true;
    if (!payload.currentTrackId) return true;
    if (payload.currentSessionId !== payload.latestSessionId) return true;
    if (payload.expectedVideoId && payload.playerVideoId && payload.expectedVideoId !== payload.playerVideoId) return true;
    return false;
}

	        function deactivateOnlineMusicTransport(options = {}) {
	            const opts = {
	                nextPlaybackSource: 'local',
	                stopPlayer: true,
	                resetTime: true,
	                ...options
	            };
	            const online = getOnlineMusicState();
	            logSourceTransition('online-transport-deactivate', 'Deactivating online transport', {
	                nextPlaybackSource: sanitizeText(opts.nextPlaybackSource || ''),
	                stopPlayer: !!opts.stopPlayer,
	                resetTime: !!opts.resetTime
	            });
	            invalidateOnlineMusicSession();
	            clearOnlineMusicAdvanceAfterFailureTimer();
	            clearOnlineMusicConnectTimeout();
	            onlineMusicCurrentTrackStartedFromQueue = false;
    online.isPlaying = false;
    clearOnlineMusicConnectingAttempt({ force: true });
    if (opts.resetTime) {
        online.currentTime = 0;
    }
    stopOnlineMusicProgressTimer();
    if (typeof opts.nextPlaybackSource === 'string' && opts.nextPlaybackSource) {
        state.currentPlaybackSource = opts.nextPlaybackSource;
    }
    if (opts.nextPlaybackSource !== 'online-music') {
        const localActive = !!(els.audio && !els.audio.paused && hasPlayableSource(els.audio));
        state.isPlaying = localActive;
    }
    stopOnlineMusicDirectAudioTransport({
        clearSource: opts.nextPlaybackSource !== 'online-music',
        resetTime: !!opts.resetTime
    });
	            if (opts.stopPlayer && onlineMusicPlayer) {
	                try {
	                    if (typeof onlineMusicPlayer.stopVideo === 'function') onlineMusicPlayer.stopVideo();
	                    else if (typeof onlineMusicPlayer.pauseVideo === 'function') onlineMusicPlayer.pauseVideo();
	                } catch (_) {}
	            }
	            scheduleDebugOverlayRefresh();
	        }

function syncOnlineMusicResultRows() {
    const online = getOnlineMusicState();
    const activeTrackId = normalizeOnlineMusicTrackId(online.currentTrackId || '');
    const connectingTrackId = normalizeOnlineMusicTrackId(online.connectingTrackId || '');
    document.querySelectorAll('[data-online-music-track-row]').forEach((row) => {
        const trackId = normalizeOnlineMusicTrackId(row.getAttribute('data-online-music-track-row') || '');
        const isCurrent = !!trackId && activeTrackId === trackId;
        const isConnecting = !!trackId && connectingTrackId === trackId;
        row.classList.toggle('ring-1', isCurrent);
        row.classList.toggle('ring-cyan-400/40', isCurrent);
        const track = getOnlineMusicTrack(trackId);
        const canResolveTrack = track ? canResolveOnlineMusicTrackOnCurrentRuntime(track) : true;
        const canQueueTrack = !track?.pendingPlaybackResolution || canResolveTrack;

        const badge = row.querySelector('[data-online-music-now-playing-badge]');
        if (badge) badge.classList.toggle('hidden', !isCurrent);

        const playBtn = row.querySelector('[data-online-music-action="play-track"]');
        if (playBtn) {
            const idleLabel = !canQueueTrack
                ? 'Desktop Only'
                : (track?.pendingPlaybackResolution && !(isCurrent && online.isPlaying)
                    ? 'Resolve + Play'
                    : ((isCurrent && online.isPlaying) ? 'Playing' : 'Play'));
            setTextContentIfChanged(playBtn, isConnecting ? 'Connecting...' : idleLabel);
            playBtn.disabled = !!(isConnecting || !canQueueTrack);
            playBtn.classList.toggle('cursor-wait', !!isConnecting);
            playBtn.classList.toggle('opacity-80', !!isConnecting);
            if (!canQueueTrack && track) {
                playBtn.title = getOnlineMusicPlaybackResolutionUnavailableMessage('track');
            }
        }
    });
}

function silenceActivePlaybackForOnlineSwitch(track = null, options = {}) {
    const online = getOnlineMusicState();
    const trackId = normalizeOnlineMusicTrackId(track?.id || track || '');
    const shouldAutoplay = options.autoplay !== false;
    state.currentPlaybackSource = 'online-music';
    state.isPlaying = false;
    online.isPlaying = false;
    // A new selection owns playback immediately, even while its resolver is
    // still pending. Invalidate the prior session so delayed iframe errors,
    // fallback streams, retries, or queue advances cannot reclaim transport.
    invalidateOnlineMusicSession();
    if (shouldAutoplay) {
        setOnlineMusicConnectingAttempt(trackId, {
            attempt: options.attempt,
            attemptId: options.attemptId,
            phase: options.phase || 'resolving'
        });
    } else {
        clearOnlineMusicConnectingAttempt({ force: true });
    }
    stopOnlineMusicDirectAudioTransport({ clearSource: true, resetTime: false });
    stopLocalMediaTransport({ resetTime: false });
    if (onlineMusicPlayer && typeof onlineMusicPlayer.stopVideo === 'function') {
        try { onlineMusicPlayer.stopVideo(); } catch (_) {}
    } else if (onlineMusicPlayer && typeof onlineMusicPlayer.pauseVideo === 'function') {
        try { onlineMusicPlayer.pauseVideo(); } catch (_) {}
    }
    stopOnlineMusicProgressTimer();
    clearOnlineMusicConnectTimeout();
    updatePlayIcons();
    syncOnlineMusicResultRows();
    syncOnlineMusicPlayerCard();
    scheduleDebugOverlayRefresh();
}

function prewarmOnlineMusicPlayer() {
    if (!getSafeAppOrigin()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (onlineMusicPlayer && typeof onlineMusicPlayer.loadVideoById === 'function') return;
    if (onlineMusicPrewarmRequested && (window.__nexplayOnlineMusicPlayerInitPromise || onlineMusicApiReadyPromise)) return;
    onlineMusicPrewarmRequested = true;
    ensureOnlineMusicPlayer('', { quiet: true })
        .then((player) => {
            if (!player) onlineMusicPrewarmRequested = false;
        })
        .catch(() => {
            onlineMusicPrewarmRequested = false;
        });
}

function getOnlineMusicTrack(trackId = '') {
    const id = normalizeOnlineMusicTrackId(trackId);
    if (!id) return null;
    const privateTrack = findPrivateSessionTrackById(id, { includeSearchResults: true });
    if (privateTrack && isOnlineMusicTrackRecord(privateTrack) && isPrivateSessionRouteActive()) {
        return privateTrack;
    }
    const online = getOnlineMusicState();
    return getSavedOnlineTrack(id)
        || (online.searchResults || []).find((track) => track.id === id)
        || (online.browserRelease?.tracks || []).find((track) => track.id === id)
        || (online.browserArtist?.allWork || []).find((track) => track.id === id)
        || getOnlineMusicTrackListsForLookup().flat().find((track) => track?.id === id)
        || (online.currentTrack && online.currentTrack.id === id ? online.currentTrack : null)
        || null;
}

function findOnlineMusicTrackInList(trackId = '', list = []) {
    const id = normalizeOnlineMusicTrackId(trackId);
    if (!id || !Array.isArray(list)) return null;
    return list.find((track) => track?.id === id) || null;
}

function getOnlineMusicTracksForContext(context = '') {
    const online = getOnlineMusicState();
    const normalizedContext = normalizeOnlineMusicPlaybackContext(context || getOnlineMusicActiveViewContext());
    if (normalizedContext === 'private-session') {
        const privateState = getPrivateSessionState();
        return getPrivateSessionCollectionTracks(privateState.currentCollectionKey || privateState.onlineView || 'search');
    }
    if (normalizedContext === 'release') return Array.isArray(online.browserRelease?.tracks) ? online.browserRelease.tracks : [];
    if (normalizedContext === 'artist') return getOnlineMusicArtistTrackSearchPool(online.browserArtist);
    if (normalizedContext === 'library') return getSavedOnlineLibraryTracks();
    return Array.isArray(online.searchResults) ? online.searchResults : [];
}

function resolveOnlineMusicActionTarget(actionEl, options = {}) {
    const directId = normalizeOnlineMusicTrackId(actionEl?.getAttribute?.('data-track-id') || '');
    const rowId = normalizeOnlineMusicTrackId(actionEl?.closest?.('[data-online-music-track-row]')?.getAttribute?.('data-online-music-track-row') || '');
    const trackId = directId || rowId;
    if (!trackId) return { trackId: '', track: null };
    const context = normalizeOnlineMusicPlaybackContext(options.context || actionEl?.getAttribute?.('data-playback-context') || getOnlineMusicActiveViewContext());
    const scopedTrack = findOnlineMusicTrackInList(trackId, getOnlineMusicTracksForContext(context));
    const savedTrack = getSavedOnlineTrack(trackId);
    const currentTrack = getOnlineMusicCurrentTrack();
    const currentMatch = currentTrack && normalizeOnlineMusicTrackId(currentTrack.id) === trackId ? currentTrack : null;
    return {
        trackId,
        track: scopedTrack || savedTrack || currentMatch || null
    };
}

function getOnlineMusicCurrentTrack() {
    const online = getOnlineMusicState();
    if (isPrivateSessionRouteActive()) {
        const privateTrack = findPrivateSessionTrackById(online.currentTrackId || getPrivateSessionState().currentTrackId || '', {
            includeSearchResults: true
        });
        if (privateTrack && isOnlineMusicTrackRecord(privateTrack)) return privateTrack;
    }
    return getOnlineMusicTrack(online.currentTrackId) || online.currentTrack || null;
}

function sanitizeOnlineProviderErrorMessage(message = '') {
    const helper = window.NexPlayOnlineMusicHelpers?.sanitizeProviderErrorMessage;
    if (typeof helper === 'function') {
        return sanitizeText(helper(message) || '');
    }
    return sanitizeText(String(message || '').replace(/\s+/g, ' ').trim());
}

function classifyOnlineMusicYouTubeError(message = '') {
    const helper = window.NexPlayOnlineMusicHelpers?.classifyYouTubeApiError;
    if (typeof helper === 'function') {
        return helper(message) || {
            code: 'requestFailed',
            isQuota: false,
            isMissingKey: false,
            message: sanitizeOnlineProviderErrorMessage(message),
            userMessage: sanitizeOnlineProviderErrorMessage(message) || 'YouTube discovery is unavailable right now.'
        };
    }
    const cleanMessage = sanitizeOnlineProviderErrorMessage(message);
    return {
        code: 'requestFailed',
        isQuota: false,
        isMissingKey: false,
        message: cleanMessage,
        userMessage: cleanMessage || 'YouTube discovery is unavailable right now.'
    };
}

function getConfiguredOnlineMusicApiKey() {
    const settingsKey = sanitizeText(getAppSettings().onlineMusic?.customApiKey || '');
    return sanitizeText(settingsKey || getOnlineMusicState().apiKey || YOUTUBE_DATA_API_KEY);
}

function syncConfiguredOnlineMusicApiKey() {
    const online = getOnlineMusicState();
    online.apiKey = getConfiguredOnlineMusicApiKey();
    return online.apiKey;
}

function getOnlineMusicProviderHealth() {
    const online = getOnlineMusicState();
    if (!online.providerHealth || typeof online.providerHealth !== 'object') {
        online.providerHealth = createDefaultOnlineMusicState().providerHealth;
    }
    return online.providerHealth;
}

function updateOnlineMusicProviderHealth(patch = {}, options = {}) {
    const opts = { persist: true, rerender: state.activeTab === 'online-music', ...options };
    const current = getOnlineMusicProviderHealth();
    const next = {
        ...current,
        ...patch,
        lastMessage: sanitizeText((patch.lastMessage ?? current.lastMessage) || ''),
        lastCode: sanitizeText((patch.lastCode ?? current.lastCode) || ''),
        lastUpdatedAt: Number(patch.lastUpdatedAt ?? current.lastUpdatedAt) || Date.now(),
        blockedUntil: Number(patch.blockedUntil ?? current.blockedUntil) || 0
    };
    getOnlineMusicState().providerHealth = next;
    if (opts.persist) persistOnlineMusicState();
    if (opts.rerender) renderOnlineMusicContent();
    return next;
}

function rememberOnlineMusicDiscoveryHealthy(message = '') {
    return updateOnlineMusicProviderHealth({
        youtubeDiscovery: 'healthy',
        lastCode: '',
        lastMessage: sanitizeText(message || ''),
        blockedUntil: 0,
        lastUpdatedAt: Date.now()
    }, { persist: false, rerender: false });
}

function rememberOnlineMusicDiscoveryFailure(error) {
    const details = classifyOnlineMusicYouTubeError(error?.message || error || '');
    const nextStatus = details.isQuota
        ? 'quota'
        : (details.isMissingKey ? 'disabled' : 'error');
    return updateOnlineMusicProviderHealth({
        youtubeDiscovery: nextStatus,
        lastCode: details.code,
        lastMessage: sanitizeText(details.userMessage || details.message || ''),
        blockedUntil: details.isQuota ? (Date.now() + (30 * 60 * 1000)) : 0,
        lastUpdatedAt: Date.now()
    }, { persist: false, rerender: false });
}

function rememberOnlineMusicPlaybackResolverState(status = 'idle', message = '') {
    return updateOnlineMusicProviderHealth({
        youtubePlaybackResolver: ['idle', 'healthy', 'error'].includes(status) ? status : 'idle',
        lastMessage: sanitizeText(message || getOnlineMusicProviderHealth().lastMessage || ''),
        lastUpdatedAt: Date.now()
    }, { persist: false, rerender: false });
}

function resetOnlineMusicProviderHealth() {
    updateOnlineMusicProviderHealth(createDefaultOnlineMusicState().providerHealth, { persist: true, rerender: true });
    updateOnlineMusicFeedback('Provider health was reset. NexPlay can try YouTube discovery again.', 'info');
}

function isOnlineMusicYouTubeDiscoveryBlocked() {
    const health = getOnlineMusicProviderHealth();
    if (health.youtubeDiscovery === 'disabled') return true;
    if (health.youtubeDiscovery !== 'quota') return false;
    return Number(health.blockedUntil || 0) > Date.now();
}

function isOnlineMusicPlaybackResolutionAvailable() {
    return !!(nexPlayDesktopBridge && typeof nexPlayDesktopBridge.resolveOnlineTrackPlayback === 'function');
}

function canResolveOnlineMusicTrackOnCurrentRuntime(track = null) {
    const clean = sanitizeStoredOnlineMusicTrack(track || {});
    if (!clean) return false;
    if (clean.videoId) return true;
    return isOnlineMusicPlaybackResolutionAvailable();
}

function hasResolvableOnlineMusicTrackInCollection(tracks = []) {
    return (Array.isArray(tracks) ? tracks : []).some((track) => canResolveOnlineMusicTrackOnCurrentRuntime(track));
}

function getOnlineMusicPlaybackResolutionUnavailableMessage(scope = 'track') {
    if (isOnlineMusicPlaybackResolutionAvailable()) {
        return scope === 'collection'
            ? 'Playback resolution is unavailable for this collection right now.'
            : 'Playback resolution is unavailable for this track right now.';
    }
    return scope === 'collection'
        ? 'Desktop runtime required to resolve these tracks for playback.'
        : 'Desktop runtime required to resolve this track for playback.';
}

function replaceOnlineMusicTrackInList(list = [], track = null) {
    if (!Array.isArray(list) || !track?.id) return list;
    let changed = false;
    const next = list.map((item) => {
        if (!item || item.id !== track.id) return item;
        changed = true;
        return { ...item, ...track };
    });
    return changed ? next : list;
}

const onlineMusicCatalogCoverRefreshes = new Map();

function isLikelyYouTubeVideoThumbnailCover(cover = '') {
    const value = sanitizeText(cover || '').toLowerCase();
    if (!value) return false;
    return /\/\/(?:i\.)?ytimg\.com\/(?:vi|vi_webp)\//i.test(value)
        || /youtube(?:-nocookie)?\.com\/.*(?:vi|thumbnail|thumb)/i.test(value);
}

function hasUsableOnlineMusicCatalogArtwork(item = {}) {
    const cover = sanitizeText(item?.cover || item?.artwork || '');
    return !!cover && !isLikelyYouTubeVideoThumbnailCover(cover);
}

function hasUsableOnlineMusicReleaseArtwork(release = {}) {
    if (hasUsableOnlineMusicCatalogArtwork(release)) return true;
    return buildOnlineMusicReleaseSourceList(release)
        .some((source) => hasUsableOnlineMusicCatalogArtwork(source));
}

function getOnlineMusicCatalogCoverCacheKey(track = null) {
    const artist = sanitizeText(track?.lyricsArtist || track?.artist || track?.channelTitle || '').toLowerCase();
    const title = sanitizeText(track?.lyricsTitle || track?.title || '').toLowerCase();
    return artist && title ? `${artist}|${title}` : '';
}

function shouldRefreshOnlineMusicCatalogCover(track = null) {
    if (!track || track?.type === 'video' || !isOnlineMusicTrackRecord(track)) return false;
    const cover = sanitizeText(track.cover || '');
    return !cover || isLikelyYouTubeVideoThumbnailCover(cover);
}

async function resolveOnlineMusicCatalogCoverForPlayback(track = null) {
    const clean = sanitizeStoredOnlineMusicTrack(track || {});
    if (!clean) return '';
    const currentCover = sanitizeText(clean.cover || '');
    if (currentCover && !isLikelyYouTubeVideoThumbnailCover(currentCover)) return currentCover;

    const cacheKey = getOnlineMusicCatalogCoverCacheKey(clean);
    const cachedCover = sanitizeText(cacheKey ? state.coverCache?.[cacheKey] || '' : '');
    if (cachedCover && !isLikelyYouTubeVideoThumbnailCover(cachedCover)) return cachedCover;

    const query = sanitizeText([
        clean.lyricsArtist || clean.artist,
        clean.lyricsTitle || clean.title
    ].filter(Boolean).join(' '));
    let catalogCover = '';

    if (query) {
        try {
            const bundle = await fetchOnlineMusicCatalogSearchBundle(query);
            const candidates = mergeOnlineMusicSearchResults(bundle?.tracks || [], { query });
            const match = candidates.find((candidate) => {
                const cover = sanitizeText(candidate?.cover || '');
                return cover && !isLikelyYouTubeVideoThumbnailCover(cover);
            });
            catalogCover = sanitizeText(match?.cover || '');
        } catch (_) {}
    }

    if (!catalogCover) {
        try { catalogCover = sanitizeText(await fetchDeezer(clean) || ''); } catch (_) {}
    }
    if (!catalogCover) {
        try { catalogCover = sanitizeText(await fetchItunes(clean) || ''); } catch (_) {}
    }
    if (catalogCover && cacheKey) {
        state.coverCache[cacheKey] = catalogCover;
    }
    return catalogCover || currentCover;
}

function applyOnlineMusicCatalogCover(track = null, cover = '') {
    const cleanCover = sanitizeText(cover || '');
    const trackId = normalizeOnlineMusicTrackId(track?.id || '');
    if (!trackId || !cleanCover) return null;
    const updated = sanitizeStoredOnlineMusicTrack({
        ...(track || {}),
        cover: cleanCover
    });
    if (!updated) return null;

    mapOnlineMusicCollections((item) => (
        normalizeOnlineMusicTrackId(item?.id || '') === trackId
            ? { ...item, cover: cleanCover }
            : item
    ));
    upsertOnlineMusicTrackReferences(updated);

    const saved = getSavedOnlineTrack(trackId);
    if (saved) {
        upsertSavedOnlineMusicLibraryTrack({ ...saved, cover: cleanCover });
        persistSavedOnlineMusicLibrary();
    }

    const online = getOnlineMusicState();
    if (normalizeOnlineMusicTrackId(online.currentTrackId || '') === trackId || normalizeOnlineMusicTrackId(online.currentTrack?.id || '') === trackId) {
        online.currentTrack = {
            ...(online.currentTrack || updated),
            cover: cleanCover
        };
    }
    if (normalizeOnlineMusicTrackId(state.currentTrackId || '') === trackId || normalizeOnlineMusicTrackId(state.currentTrack?.id || '') === trackId) {
        state.currentTrack = {
            ...(state.currentTrack || updated),
            cover: cleanCover
        };
        applyNowPlayingMetadata(state.currentTrack);
        updateTrackUI(state.currentTrack);
        applyCoverAccent(state.currentTrack);
    }

    syncOnlineMusicPlayerCard();
    syncOnlineMusicResultRows();
    persistOnlineMusicState();
    return updated;
}

function refreshOnlineMusicCatalogCover(track = null) {
    const clean = sanitizeStoredOnlineMusicTrack(track || {});
    if (!clean || !shouldRefreshOnlineMusicCatalogCover(clean)) return Promise.resolve('');
    const refreshKey = normalizeOnlineMusicTrackId(clean.id || '') || getOnlineMusicCatalogCoverCacheKey(clean);
    if (!refreshKey) return Promise.resolve('');
    if (onlineMusicCatalogCoverRefreshes.has(refreshKey)) {
        return onlineMusicCatalogCoverRefreshes.get(refreshKey);
    }
    const promise = resolveOnlineMusicCatalogCoverForPlayback(clean)
        .then((cover) => {
            const cleanCover = sanitizeText(cover || '');
            if (cleanCover && !isLikelyYouTubeVideoThumbnailCover(cleanCover) && cleanCover !== sanitizeText(clean.cover || '')) {
                applyOnlineMusicCatalogCover(clean, cleanCover);
            }
            return cleanCover;
        })
        .catch(() => '')
        .finally(() => {
            onlineMusicCatalogCoverRefreshes.delete(refreshKey);
        });
    onlineMusicCatalogCoverRefreshes.set(refreshKey, promise);
    return promise;
}

function upsertOnlineMusicTrackReferences(track = null) {
    if (!track?.id) return track;
    const online = getOnlineMusicState();
    if (isPrivateSessionTrackRecord(track) || isPrivateSessionRouteActive()) {
        const privateState = getPrivateSessionState();
        const applyPrivateTrack = (item = null) => (
            item?.id === track.id
                ? sanitizePrivateSessionTrackRecord({ ...item, ...track })
                : item
        );
        privateState.searchResults = (privateState.searchResults || []).map(applyPrivateTrack);
        privateState.imports = (privateState.imports || []).map(applyPrivateTrack);
        privateState.playlists = (privateState.playlists || []).map((playlist) => ({
            ...playlist,
            tracks: (Array.isArray(playlist?.tracks) ? playlist.tracks : []).map(applyPrivateTrack)
        }));
    }
    online.searchResults = replaceOnlineMusicTrackInList(online.searchResults || [], track);
    if (online.browserRelease?.tracks) {
        online.browserRelease = {
            ...online.browserRelease,
            tracks: replaceOnlineMusicTrackInList(online.browserRelease.tracks || [], track)
        };
    }
    if (online.browserArtist?.allWork) {
        online.browserArtist = {
            ...online.browserArtist,
            allWork: replaceOnlineMusicTrackInList(online.browserArtist.allWork || [], track)
        };
    }
    const releaseCache = getOnlineMusicReleaseTracksCache();
    Object.keys(releaseCache).forEach((key) => {
        const entry = releaseCache[key];
        if (!Array.isArray(entry?.tracks)) return;
        releaseCache[key] = {
            ...entry,
            tracks: replaceOnlineMusicTrackInList(entry.tracks || [], track)
        };
    });
    const artistCache = getOnlineMusicArtistCatalogCache();
    Object.keys(artistCache).forEach((key) => {
        const catalog = artistCache[key];
        if (!Array.isArray(catalog?.allWork)) return;
        artistCache[key] = {
            ...catalog,
            allWork: replaceOnlineMusicTrackInList(catalog.allWork || [], track)
        };
    });
    if (online.currentTrack?.id === track.id) {
        online.currentTrack = { ...online.currentTrack, ...track };
    }
    if (isPrivateSessionTrackRecord(track) || isPrivateSessionRouteActive()) {
        return track;
    }
    const existingIndex = state.tracks.findIndex((item) => item?.id === track.id);
    if (existingIndex !== -1) {
        state.tracks.splice(existingIndex, 1, {
            ...state.tracks[existingIndex],
            ...track
        });
    }
    return track;
}

function resolveQueueDisplayTrack(trackId = '') {
    const rawId = sanitizeText(trackId || '');
    if (!rawId) return null;
    const privateTrack = findPrivateSessionTrackById(rawId, { includeSearchResults: true });
    if (privateTrack && (isPrivateSessionRouteActive() || isPrivateSessionTrackRecord(state.currentTrack))) {
        return privateTrack;
    }
    const directTrack = (state.tracks || []).find((track) => track?.id === rawId) || null;
    if (directTrack) return directTrack;
    const queuedEntry = getUnifiedAudioQueueEntryByTrackId(rawId);
    if (queuedEntry?.trackSnapshot && typeof queuedEntry.trackSnapshot === 'object') {
        return clonePrivateSessionValue(queuedEntry.trackSnapshot, null);
    }
    if (!/^(?:yt|youtube|itunes|deezer|spotify)[:_]/i.test(rawId)) {
        return queuedEntry ? (resolveUnifiedAudioQueueEntryTrack(queuedEntry) || null) : null;
    }
    const normalizedOnlineId = normalizeOnlineMusicTrackId(rawId);
    if (!normalizedOnlineId) return queuedEntry ? (resolveUnifiedAudioQueueEntryTrack(queuedEntry) || null) : null;
    const onlineTrack = getOnlineMusicTrack(normalizedOnlineId);
    if (onlineTrack) return onlineTrack;
    return queuedEntry ? (buildOnlineMusicTrackSnapshotFromQueueEntry(queuedEntry) || null) : null;
}

function isOnlineMusicTrackRecord(track = null) {
    if (!track || typeof track !== 'object') return false;
    const source = sanitizeText(track.source || '').toLowerCase();
    if (source === 'online-music') return true;
    if (source === 'local') return false;
    const provider = normalizeOnlineMusicProvider(track.provider || track.catalogProvider || '');
    if (provider) return true;
    const id = sanitizeText(track.id || '');
    if (/^(?:yt|itunes|deezer)[:_]/i.test(id)) return true;
    const videoId = sanitizeText(track.videoId || '');
    if (!videoId) return false;
    const url = sanitizeText(track.url || '');
    // Local imports typically use blob URLs and should remain in the local queue path.
    if (url.startsWith('blob:')) return false;
    return true;
}

function getOnlineMusicMetadataFingerprint(trackId = '') {
    const id = normalizeOnlineMusicTrackId(trackId);
    return id ? `online-music:${id}` : '';
}

function createMainLibraryTrackFromOnlineTrack(track) {
    const clean = sanitizeStoredOnlineMusicTrack(track);
    if (!clean) return null;
    const existing = state.tracks.find((item) => item?.id === clean.id) || {};
    const fingerprint = existing.fingerprint || getOnlineMusicMetadataFingerprint(clean.id);
    const storedMeta = (fingerprint && state.metadataStore?.[fingerprint]) || {};
    const mergedTags = Array.isArray(existing.tags)
        ? existing.tags.slice()
        : (Array.isArray(storedMeta.tags) ? storedMeta.tags.slice() : []);
    return {
        ...existing,
        ...storedMeta,
        ...clean,
        fingerprint,
        source: 'online-music',
        platformLabel: 'YouTube',
        type: 'audio',
        url: existing.url || clean.canonicalUrl || '',
        size: Number(existing.size || 0) || 0,
        tags: mergedTags,
        addedAt: Number(clean.addedAt || existing.addedAt || Date.now()) || Date.now(),
        isFavorite: !!(clean.isFavorite || existing.isFavorite || storedMeta.isFavorite),
        playCount: Math.max(Number(clean.playCount) || 0, Number(existing.playCount) || 0, Number(storedMeta.playCount) || 0),
        duration: Math.max(Number(clean.duration) || 0, Number(existing.duration) || 0, Number(storedMeta.duration) || 0),
        skipCount: Math.max(Number(existing.skipCount) || 0, Number(storedMeta.skipCount) || 0),
        lastSkippedAt: Math.max(Number(existing.lastSkippedAt) || 0, Number(storedMeta.lastSkippedAt) || 0),
        listeningTime: Math.max(Number(existing.listeningTime) || 0, Number(storedMeta.listeningTime) || 0),
        resumePosition: 0,
        resumeUpdatedAt: 0,
        customLyrics: typeof clean.customLyrics === 'string' && clean.customLyrics.trim()
            ? clean.customLyrics
            : (typeof existing.customLyrics === 'string' && existing.customLyrics.trim()
                ? existing.customLyrics
                : (typeof storedMeta.customLyrics === 'string' ? storedMeta.customLyrics : '')),
        assignedLyricsRaw: typeof clean.assignedLyricsRaw === 'string' && clean.assignedLyricsRaw
            ? clean.assignedLyricsRaw
            : (existing.assignedLyricsRaw || ''),
        assignedLyricsSource: clean.assignedLyricsSource || existing.assignedLyricsSource || '',
        assignedLyricsMeta: clean.assignedLyricsMeta || existing.assignedLyricsMeta || null,
        channelTitle: clean.channelTitle || existing.channelTitle || clean.artist,
        channelId: clean.channelId || existing.channelId || '',
        canonicalUrl: clean.canonicalUrl,
        videoId: clean.videoId,
        publishedAt: clean.publishedAt || existing.publishedAt || '',
        lyricsArtist: clean.lyricsArtist || existing.lyricsArtist || clean.artist,
        lyricsTitle: clean.lyricsTitle || existing.lyricsTitle || clean.title
    };
}

function syncOnlineTrackIntoMainLibrary(track, options = {}) {
    const opts = { allowInsert: true, persistMetadata: false, persistLibrary: true, ...options };
    if (opts.privateSession || isPrivateSessionTrackRecord(track)) {
        const cleanPrivateTrack = sanitizeStoredOnlineMusicTrack(track);
        return cleanPrivateTrack
            ? { ...cleanPrivateTrack, ...track, privateSession: true, privateSessionSource: 'online' }
            : clonePrivateSessionValue(track, null);
    }
    const merged = createMainLibraryTrackFromOnlineTrack(track);
    if (!merged) return null;
    if (isOnlineMusicTrackRecord(merged) && getSavedOnlineTrack(merged.id)) {
        upsertSavedOnlineMusicLibraryTrack(merged);
    }
    const existingIndex = state.tracks.findIndex((item) => item?.id === merged.id);
    if (existingIndex === -1) {
        if (!opts.allowInsert) return null;
        state.tracks.unshift(merged);
    } else {
        state.tracks.splice(existingIndex, 1, merged);
    }
    clearOnlineMusicResumeMetadata(merged);
    if (state.currentTrackId === merged.id || state.currentTrack?.id === merged.id) {
        state.currentTrack = merged;
    }
    if (opts.persistMetadata) persistTrackMetadata(merged);
    if (opts.persistLibrary) persistSavedOnlineMusicLibrary();
    return merged;
}

function syncMainLibraryTrackToOnlineState(track, options = {}) {
    const opts = { ensureSaved: false, persist: true, ...options };
    if (!isOnlineMusicTrackRecord(track)) return null;
    const savedTrack = opts.ensureSaved
        ? (syncOnlineTrackIntoMainLibrary(track, { allowInsert: true, persistLibrary: false }) || track)
        : track;
    const clean = sanitizeStoredOnlineMusicTrack(savedTrack);
    if (!clean) return null;
    const online = getOnlineMusicState();
    const merged = {
        ...clean,
        isFavorite: !!savedTrack.isFavorite,
        playCount: Math.max(Number(clean.playCount) || 0, Number(savedTrack.playCount) || 0),
        lastPlayedAt: Math.max(Number(clean.lastPlayedAt) || 0, Number(savedTrack.lastPlayedAt) || 0),
        resumePosition: 0,
        resumeUpdatedAt: 0,
        customLyrics: typeof savedTrack.customLyrics === 'string' ? savedTrack.customLyrics : (clean.customLyrics || '')
    };
    mapOnlineMusicCollections((item) => item?.id === merged.id ? { ...item, ...merged } : item);
    if (online.currentTrackId === merged.id || online.currentTrack?.id === merged.id) {
        online.currentTrack = { ...(online.currentTrack || {}), ...merged };
    }
    upsertSavedOnlineMusicLibraryTrack(merged);
    clearOnlineMusicResumeMetadata(savedTrack);
    if (opts.persist) {
        persistSavedOnlineMusicLibrary();
        persistOnlineMusicState();
    }
    return merged;
}

function pruneOnlineMusicLibraryEntries(trackIds = [], options = {}) {
    const ids = Array.from(new Set((Array.isArray(trackIds) ? trackIds : [trackIds])
        .map((id) => normalizeOnlineMusicTrackId(id))
        .filter(Boolean)));
    if (!ids.length) return;
    removeSavedOnlineMusicLibraryTracks(ids);
    const online = getOnlineMusicState();
    online.queue = (online.queue || []).filter((itemId) => !ids.includes(itemId));
    online.queueIndex = online.queue.length > 0 ? Math.min(online.queueIndex, online.queue.length - 1) : -1;
    mapOnlineMusicCollections((item) => (
        ids.includes(item?.id)
            ? { ...item, isFavorite: false, resumePosition: 0, resumeUpdatedAt: 0 }
            : item
    ));
    if (online.currentTrack && ids.includes(online.currentTrack.id)) {
        online.currentTrack = { ...online.currentTrack, isFavorite: false, resumePosition: 0, resumeUpdatedAt: 0 };
    }
    if (options.persist !== false) {
        persistSavedOnlineMusicLibrary();
        persistOnlineMusicState();
    }
}

function removeOnlineTrackFromMainLibrary(trackId) {
    const id = normalizeOnlineMusicTrackId(trackId);
    if (!id) return;
    state.tracks = (state.tracks || []).filter((track) => !(isOnlineMusicTrackRecord(track) && track.id === id));
    state.selectedTrackIds = (state.selectedTrackIds || []).filter((itemId) => itemId !== id);
    state.queue = (state.queue || []).filter((itemId) => itemId !== id);
    state.shuffleQueue = (state.shuffleQueue || []).filter((itemId) => itemId !== id);
    const audioHelper = getAudioQueueHelper();
    let nextAudioState = getUnifiedAudioQueueState();
    const matchingEntry = (nextAudioState.entries || []).find((entry) => entry?.trackId === id);
    if (matchingEntry && typeof audioHelper.removeEntry === 'function') {
        nextAudioState = audioHelper.removeEntry(nextAudioState, matchingEntry.id);
        commitUnifiedAudioQueue({
            ...nextAudioState,
            failedEntryIds: Array.isArray(nextAudioState.failedEntryIds) ? nextAudioState.failedEntryIds.filter((entryId) => (nextAudioState.entries || []).some((entry) => entry.id === entryId)) : []
        }, { refresh: false });
    }
    state.videoQueueState.queue = (state.videoQueueState.queue || []).filter((itemId) => itemId !== id);
    state.videoQueueState.shuffleQueue = (state.videoQueueState.shuffleQueue || []).filter((itemId) => itemId !== id);
    state.playHistory = (state.playHistory || []).filter((itemId) => itemId !== id);
    state.playlists = (state.playlists || []).map((playlist) => ({
        ...playlist,
        tracks: (playlist.tracks || []).filter((itemId) => itemId !== id)
    }));
    persistSavedOnlineMusicLibrary();
}

function removeTrackIdsFromCollections(trackIds = []) {
    const ids = new Set((trackIds || []).filter(Boolean));
    if (!ids.size) return;
    state.tracks = (state.tracks || []).filter((track) => !ids.has(track?.id));
    state.selectedTrackIds = (state.selectedTrackIds || []).filter((itemId) => !ids.has(itemId));
    state.queue = (state.queue || []).filter((itemId) => !ids.has(itemId));
    state.shuffleQueue = (state.shuffleQueue || []).filter((itemId) => !ids.has(itemId));
    const audioHelper = getAudioQueueHelper();
    let nextAudioState = getUnifiedAudioQueueState();
    Array.from(ids).forEach((trackId) => {
        const matchingEntry = (nextAudioState.entries || []).find((entry) => entry?.trackId === trackId);
        if (matchingEntry && typeof audioHelper.removeEntry === 'function') {
            nextAudioState = audioHelper.removeEntry(nextAudioState, matchingEntry.id);
        }
    });
    commitUnifiedAudioQueue({
        ...nextAudioState,
        failedEntryIds: Array.isArray(nextAudioState.failedEntryIds) ? nextAudioState.failedEntryIds.filter((entryId) => (nextAudioState.entries || []).some((entry) => entry.id === entryId)) : []
    }, { refresh: false });
    state.videoQueueState.queue = (state.videoQueueState.queue || []).filter((itemId) => !ids.has(itemId));
    state.videoQueueState.shuffleQueue = (state.videoQueueState.shuffleQueue || []).filter((itemId) => !ids.has(itemId));
    state.playHistory = (state.playHistory || []).filter((itemId) => !ids.has(itemId));
    state.playlists = (state.playlists || []).map((playlist) => ({
        ...playlist,
        tracks: (playlist.tracks || []).filter((itemId) => !ids.has(itemId))
    }));
}

function syncOnlineLibraryIntoMainLibrary() {
    const savedOnlineTracks = sanitizeStoredOnlineMusicLibrary(readStorageJson(ONLINE_MUSIC_LIBRARY_KEY, []));
    replaceSavedOnlineMusicLibrary(savedOnlineTracks);
    const savedIds = new Set(savedOnlineTracks.map((track) => track.id).filter(Boolean));
    state.tracks = (state.tracks || []).filter((track) => !isOnlineMusicTrackRecord(track) || savedIds.has(track.id));
    savedOnlineTracks.forEach((track) => {
        syncOnlineTrackIntoMainLibrary(track, { allowInsert: true, persistLibrary: false });
    });
    clearOnlineMusicResumeMetadata();
}

function updateLibraryStatsLabel() {
    const statsEl = document.getElementById('library-stats');
    if (statsEl) {
        const libraryTrackCount = (state.tracks || []).filter((track) => track && (!isOnlineMusicTrackRecord(track) || !!getSavedOnlineTrack(track.id))).length;
        statsEl.innerHTML = `${libraryTrackCount} <span class="text-xs font-normal text-gray-500">tracks</span>`;
    }
}

function persistOnlineMusicState() {
    if (shouldBypassStorageWriteForPrivateSession()) return false;
    const liveOnline = getOnlineMusicState();
    const online = sanitizeStoredOnlineMusicState(liveOnline);
    const currentTrack = getOnlineMusicCurrentTrack();
    if (currentTrack) {
        const sanitizedCurrentTrack = {
            ...sanitizeStoredOnlineMusicTrack(currentTrack),
            resumePosition: 0,
            resumeUpdatedAt: 0,
            duration: Math.max(0, Number(online.duration) || currentTrack.duration || 0)
        };
        online.currentTrack = sanitizedCurrentTrack;
        online.currentTrackId = sanitizedCurrentTrack.id;
        liveOnline.currentTrack = { ...sanitizedCurrentTrack };
        liveOnline.currentTrackId = sanitizedCurrentTrack.id;
    }
    online.currentTime = 0;
    online.isPlaying = false;
    online.lastUpdatedAt = Date.now();
    const storedOnline = {
        ...online,
        downloadingTrackIds: [],
        pendingTrackId: null
    };
    liveOnline.lastUpdatedAt = storedOnline.lastUpdatedAt;
    try {
        writeStorageJson(ONLINE_MUSIC_STATE_KEY, storedOnline);
    } catch (_) {}
    return true;
}

function updateOnlineMusicFeedback(message, tone = 'info') {
    const feedback = document.getElementById('online-music-feedback');
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.classList.remove('text-gray-400', 'text-emerald-300', 'text-rose-300', 'text-amber-300');
    if (tone === 'success') feedback.classList.add('text-emerald-300');
    else if (tone === 'error') feedback.classList.add('text-rose-300');
    else if (tone === 'warn') feedback.classList.add('text-amber-300');
    else feedback.classList.add('text-gray-400');
}

function appendOnlineMusicImportReviewItem(input = {}, options = {}) {
    const opts = { persist: true, rerender: false, cap: 50, ...options };
    const online = getOnlineMusicState();
    const item = {
        id: sanitizeText(input.id || generateId()) || generateId(),
        kind: sanitizeText(input.kind || 'info') || 'info',
        title: sanitizeText(input.title || 'Import Review') || 'Import Review',
        detail: sanitizeText(input.detail || ''),
        trackId: sanitizeText(input.trackId || ''),
        createdAt: Number(input.createdAt) || Date.now()
    };
    const existing = Array.isArray(online.importReviewItems) ? online.importReviewItems : [];
    online.importReviewItems = [item, ...existing].slice(0, Math.max(5, Number(opts.cap) || 50));
    if (opts.persist) persistOnlineMusicState();
    if (opts.rerender && state.activeTab === 'online-music') renderOnlineMusicContent();
    return item;
}

function clearOnlineMusicImportReview() {
    const online = getOnlineMusicState();
    online.importReviewItems = [];
    persistOnlineMusicState();
    if (state.activeTab === 'online-music' || state.activeTab === 'settings') {
        renderTracks({ preserveScroll: true });
    }
}

function syncOnlineMusicViewTabs() {
    return;
}

function normalizeOnlineMusicPlaybackContext(value = '') {
    const raw = sanitizeText(value || '').toLowerCase();
    if (['library', 'artist', 'release', 'search', 'private-session'].includes(raw)) return raw;
    return 'search';
}

function isPrivateOnlineMusicPlaybackContext(value = '') {
    return normalizeOnlineMusicPlaybackContext(value || '') === 'private-session';
}

function getOnlineMusicArtistCatalogCache() {
    const online = getOnlineMusicState();
    if (!online.artistCatalogCache || typeof online.artistCatalogCache !== 'object') {
        online.artistCatalogCache = {};
    }
    return online.artistCatalogCache;
}

function getOnlineMusicReleaseTracksCache() {
    const online = getOnlineMusicState();
    if (!online.releaseTracksCache || typeof online.releaseTracksCache !== 'object') {
        online.releaseTracksCache = {};
    }
    return online.releaseTracksCache;
}

function sanitizeOnlineMusicReleaseCacheText(value = '', limit = 320) {
    return sanitizeText(value || '').slice(0, Math.max(1, Number(limit) || 320));
}

function sanitizeOnlineMusicReleaseCacheUrl(value = '') {
    const raw = sanitizeOnlineMusicReleaseCacheText(value, 2048);
    if (!raw || !/^https?:\/\//i.test(raw) || /[\u0000-\u001f\u007f\s"'<>]/.test(raw)) return '';
    return raw;
}

function sanitizeStoredOnlineMusicReleaseCacheTrack(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const track = sanitizeStoredOnlineMusicTrack(raw);
    if (!track) return null;
    return {
        id: sanitizeOnlineMusicReleaseCacheText(track.id, 240),
        videoId: sanitizeOnlineMusicReleaseCacheText(track.videoId, 160),
        title: sanitizeOnlineMusicReleaseCacheText(track.title, 320),
        artist: sanitizeOnlineMusicReleaseCacheText(track.artist, 240),
        channelTitle: sanitizeOnlineMusicReleaseCacheText(track.channelTitle, 240),
        channelId: sanitizeOnlineMusicReleaseCacheText(track.channelId, 180),
        provider: sanitizeOnlineMusicReleaseCacheText(track.provider, 40),
        providerLabel: sanitizeOnlineMusicReleaseCacheText(track.providerLabel, 80),
        catalogProvider: sanitizeOnlineMusicReleaseCacheText(track.catalogProvider, 40),
        catalogProviderLabel: sanitizeOnlineMusicReleaseCacheText(track.catalogProviderLabel, 80),
        transportProvider: sanitizeOnlineMusicReleaseCacheText(track.transportProvider, 40),
        transportProviderLabel: sanitizeOnlineMusicReleaseCacheText(track.transportProviderLabel, 80),
        providerTrackId: sanitizeOnlineMusicReleaseCacheText(track.providerTrackId, 180),
        providerArtistId: sanitizeOnlineMusicReleaseCacheText(track.providerArtistId, 180),
        providerReleaseId: sanitizeOnlineMusicReleaseCacheText(track.providerReleaseId, 180),
        releaseTitle: sanitizeOnlineMusicReleaseCacheText(track.releaseTitle, 320),
        resolver: sanitizeOnlineMusicReleaseCacheText(track.resolver, 80),
        sourceSurface: sanitizeOnlineMusicReleaseCacheText(track.sourceSurface, 80),
        playableInEmbed: typeof track.playableInEmbed === 'boolean' ? track.playableInEmbed : null,
        resolvedTitle: sanitizeOnlineMusicReleaseCacheText(track.resolvedTitle, 320),
        resolvedArtist: sanitizeOnlineMusicReleaseCacheText(track.resolvedArtist, 240),
        pendingPlaybackResolution: !!track.pendingPlaybackResolution,
        lyricsArtist: sanitizeOnlineMusicReleaseCacheText(track.lyricsArtist, 240),
        lyricsTitle: sanitizeOnlineMusicReleaseCacheText(track.lyricsTitle, 320),
        cover: sanitizeOnlineMusicReleaseCacheUrl(track.cover),
        description: sanitizeOnlineMusicReleaseCacheText(track.description, 1000),
        tags: (Array.isArray(track.tags) ? track.tags : [])
            .map((tag) => sanitizeOnlineMusicReleaseCacheText(tag, 80))
            .filter(Boolean)
            .slice(0, 16),
        viewCount: Math.max(0, Number(track.viewCount || 0) || 0),
        likeCount: Math.max(0, Number(track.likeCount || 0) || 0),
        duration: Math.max(0, Number(track.duration || 0) || 0),
        durationLabel: sanitizeOnlineMusicReleaseCacheText(track.durationLabel, 40),
        canonicalUrl: sanitizeOnlineMusicReleaseCacheUrl(track.canonicalUrl),
        publishedAt: sanitizeOnlineMusicReleaseCacheText(track.publishedAt, 80),
        type: 'audio',
        source: 'online-music',
        originProvider: sanitizeOnlineMusicReleaseCacheText(track.originProvider, 40),
        originReleaseId: sanitizeOnlineMusicReleaseCacheText(track.originReleaseId, 180)
    };
}

function sanitizeStoredOnlineMusicReleaseCacheRecord(raw = {}, playlistId = '') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const safePlaylistId = buildOnlineMusicReleaseCacheKey(playlistId || raw.playlistId || '').slice(0, 240);
    if (!safePlaylistId || ['__proto__', 'prototype', 'constructor'].includes(safePlaylistId)) return null;
    const provider = normalizeOnlineMusicProvider(raw.provider || raw.catalogProvider || inferOnlineMusicReleaseProvider(raw));
    return {
        playlistId: safePlaylistId,
        provider: sanitizeOnlineMusicReleaseCacheText(provider, 40),
        providerLabel: sanitizeOnlineMusicReleaseCacheText(raw.providerLabel || getOnlineMusicProviderLabel(provider), 80),
        catalogProvider: sanitizeOnlineMusicReleaseCacheText(raw.catalogProvider || provider, 40),
        catalogProviderLabel: sanitizeOnlineMusicReleaseCacheText(raw.catalogProviderLabel || raw.providerLabel || getOnlineMusicProviderLabel(provider), 80),
        transportProvider: sanitizeOnlineMusicReleaseCacheText(raw.transportProvider || '', 40),
        transportProviderLabel: sanitizeOnlineMusicReleaseCacheText(raw.transportProviderLabel || '', 80),
        providerReleaseId: sanitizeOnlineMusicReleaseCacheText(raw.providerReleaseId || raw.originReleaseId || '', 180),
        originProvider: sanitizeOnlineMusicReleaseCacheText(raw.originProvider || provider, 40),
        originReleaseId: sanitizeOnlineMusicReleaseCacheText(raw.originReleaseId || raw.providerReleaseId || '', 180),
        channelId: sanitizeOnlineMusicReleaseCacheText(raw.channelId, 180),
        artist: sanitizeOnlineMusicReleaseCacheText(raw.artist, 240),
        title: sanitizeOnlineMusicReleaseCacheText(raw.title || 'Release', 320) || 'Release',
        description: sanitizeOnlineMusicReleaseCacheText(raw.description, 1200),
        cover: sanitizeOnlineMusicReleaseCacheUrl(raw.cover),
        kind: sanitizeOnlineMusicReleaseCacheText(raw.kind || 'release', 40),
        releaseType: sanitizeOnlineMusicReleaseCacheText(raw.releaseType || '', 80),
        releaseBucket: sanitizeOnlineMusicReleaseCacheText(raw.releaseBucket || '', 40),
        publishedAt: sanitizeOnlineMusicReleaseCacheText(raw.publishedAt, 80),
        trackCount: Math.max(0, Number(raw.trackCount || 0) || 0),
        declaredTrackCount: Math.max(0, Number(raw.declaredTrackCount || 0) || 0),
        missingTrackCount: Math.max(0, Number(raw.missingTrackCount || 0) || 0)
    };
}

function sanitizeStoredOnlineMusicReleaseTracksCacheEntry(raw = {}, now = Date.now(), playlistId = '') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const currentTime = Math.max(0, Number(now) || Date.now());
    const updatedAt = Math.max(0, Number(raw.updatedAt || 0) || 0);
    if (!updatedAt || updatedAt > currentTime + (5 * 60 * 1000) || currentTime - updatedAt > ONLINE_MUSIC_RELEASE_TRACKS_CACHE_TTL_MS) return null;
    const safePlaylistId = buildOnlineMusicReleaseCacheKey(playlistId || raw.release?.playlistId || '').slice(0, 240);
    const release = sanitizeStoredOnlineMusicReleaseCacheRecord(raw.release || {}, safePlaylistId);
    if (!release) return null;
    const tracks = (Array.isArray(raw.tracks) ? raw.tracks : [])
        .slice(0, ONLINE_MUSIC_RELEASE_TRACKS_CACHE_TRACK_LIMIT)
        .map((track) => sanitizeStoredOnlineMusicReleaseCacheTrack(track))
        .filter(Boolean);
    if (!tracks.length) return null;
    const declaredTrackCount = Math.max(
        tracks.length,
        Number(raw.declaredTrackCount || 0) || 0,
        Number(release.declaredTrackCount || 0) || 0,
        Number(release.trackCount || 0) || 0
    );
    const missingTrackCount = Math.max(0, Number(raw.missingTrackCount || 0) || 0, declaredTrackCount - tracks.length);
    return {
        release: {
            ...release,
            trackCount: Math.max(release.trackCount, declaredTrackCount),
            declaredTrackCount,
            missingTrackCount
        },
        tracks,
        declaredTrackCount,
        missingTrackCount,
        updatedAt,
        lastAccessedAt: Math.min(currentTime, Math.max(updatedAt, Number(raw.lastAccessedAt || updatedAt) || updatedAt))
    };
}

function getOnlineMusicReleaseTracksCacheByteLength(value) {
    const serialized = safeCall(() => JSON.stringify(value), '');
    if (!serialized) return Number.POSITIVE_INFINITY;
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(serialized).length;
    return serialized.length * 2;
}

function sanitizeStoredOnlineMusicReleaseTracksCache(raw = {}, now = Date.now()) {
    const currentTime = Math.max(0, Number(now) || Date.now());
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Number(raw.schemaVersion || 0) !== ONLINE_MUSIC_RELEASE_TRACKS_CACHE_SCHEMA_VERSION) {
        return {
            schemaVersion: ONLINE_MUSIC_RELEASE_TRACKS_CACHE_SCHEMA_VERSION,
            savedAt: currentTime,
            entries: {}
        };
    }
    const candidates = Object.entries(raw.entries && typeof raw.entries === 'object' && !Array.isArray(raw.entries) ? raw.entries : {})
        .map(([key, entry]) => [buildOnlineMusicReleaseCacheKey(key).slice(0, 240), sanitizeStoredOnlineMusicReleaseTracksCacheEntry(entry, currentTime, key)])
        .filter(([key, entry]) => key && entry)
        .sort((left, right) => Number(right[1].lastAccessedAt || right[1].updatedAt || 0) - Number(left[1].lastAccessedAt || left[1].updatedAt || 0));
    const entries = {};
    let payloadBytes = getOnlineMusicReleaseTracksCacheByteLength({
        schemaVersion: ONLINE_MUSIC_RELEASE_TRACKS_CACHE_SCHEMA_VERSION,
        savedAt: currentTime,
        entries: {}
    });
    let entryCount = 0;
    for (const [key, entry] of candidates.slice(0, ONLINE_MUSIC_RELEASE_TRACKS_CACHE_ENTRY_LIMIT)) {
        const entryBytes = Math.max(0, getOnlineMusicReleaseTracksCacheByteLength({ [key]: entry }) - 2) + (entryCount ? 1 : 0);
        if (payloadBytes + entryBytes > ONLINE_MUSIC_RELEASE_TRACKS_CACHE_BYTE_LIMIT) break;
        entries[key] = entry;
        payloadBytes += entryBytes;
        entryCount += 1;
    }
    return {
        schemaVersion: ONLINE_MUSIC_RELEASE_TRACKS_CACHE_SCHEMA_VERSION,
        savedAt: currentTime,
        entries
    };
}

function hydrateOnlineMusicReleaseTracksCache(options = {}) {
    if (shouldBypassStorageWriteForPrivateSession()) return 0;
    const now = Math.max(0, Number(options?.now) || Date.now());
    const raw = readStorageJson(ONLINE_MUSIC_RELEASE_TRACKS_CACHE_KEY, null, { repairOnError: false });
    const sanitized = sanitizeStoredOnlineMusicReleaseTracksCache(raw, now);
    const cache = getOnlineMusicReleaseTracksCache();
    Object.entries(sanitized.entries).forEach(([key, entry]) => {
        if (!cache[key]?.promise) cache[key] = entry;
    });
    if (raw && (!raw.schemaVersion || Number(raw.schemaVersion) !== ONLINE_MUSIC_RELEASE_TRACKS_CACHE_SCHEMA_VERSION || Object.keys(sanitized.entries).length !== Object.keys(raw.entries || {}).length)) {
        if (Object.keys(sanitized.entries).length) writeStorageJson(ONLINE_MUSIC_RELEASE_TRACKS_CACHE_KEY, sanitized);
        else removeStorageValue(ONLINE_MUSIC_RELEASE_TRACKS_CACHE_KEY);
    }
    return Object.keys(sanitized.entries).length;
}

function persistOnlineMusicReleaseTracksCache(options = {}) {
    if (options?.persist === false || shouldBypassStorageWriteForPrivateSession()) return false;
    const now = Math.max(0, Number(options?.now) || Date.now());
    const cache = getOnlineMusicReleaseTracksCache();
    const payload = sanitizeStoredOnlineMusicReleaseTracksCache({
        schemaVersion: ONLINE_MUSIC_RELEASE_TRACKS_CACHE_SCHEMA_VERSION,
        entries: cache
    }, now);
    let entries = Object.entries(payload.entries);
    while (entries.length) {
        const candidate = { ...payload, entries: Object.fromEntries(entries) };
        if (writeStorageJson(ONLINE_MUSIC_RELEASE_TRACKS_CACHE_KEY, candidate)) return true;
        entries = entries.slice(0, Math.max(0, Math.floor(entries.length / 2)));
    }
    return writeStorageJson(ONLINE_MUSIC_RELEASE_TRACKS_CACHE_KEY, { ...payload, entries: {} });
}

function getReusableOnlineMusicReleaseTracksCacheEntry(playlistId = '', now = Date.now()) {
    const key = buildOnlineMusicReleaseCacheKey(playlistId || '');
    if (!key) return null;
    const cache = getOnlineMusicReleaseTracksCache();
    const existing = cache[key];
    if (!existing || existing.promise) return null;
    const sanitized = sanitizeStoredOnlineMusicReleaseTracksCacheEntry(existing, now, key);
    if (!sanitized) {
        delete cache[key];
        return null;
    }
    sanitized.lastAccessedAt = Math.max(sanitized.lastAccessedAt, Number(now) || Date.now());
    cache[key] = sanitized;
    return sanitized;
}

function storeOnlineMusicReleaseTracksCacheEntry(playlistId = '', entry = {}, options = {}) {
    const key = buildOnlineMusicReleaseCacheKey(playlistId || entry?.release?.playlistId || '');
    if (!key) return null;
    const opts = typeof options === 'number' ? { now: options } : (options || {});
    const now = Math.max(0, Number(opts.now) || Date.now());
    const sanitized = sanitizeStoredOnlineMusicReleaseTracksCacheEntry({
        ...entry,
        release: { ...(entry?.release || {}), playlistId: key },
        updatedAt: Number(entry?.updatedAt || 0) || now,
        lastAccessedAt: now
    }, now, key);
    if (!sanitized) return null;
    getOnlineMusicReleaseTracksCache()[key] = sanitized;
    if (opts.persist !== false) persistOnlineMusicReleaseTracksCache({ now });
    return sanitized;
}

function mapOnlineMusicCollections(transform) {
    if (typeof transform !== 'function') return;
    const online = getOnlineMusicState();
    const applyTrack = (track) => {
        if (!track || typeof track !== 'object') return track;
        const next = transform(track);
        return next && typeof next === 'object' ? next : track;
    };
    const applyList = (list) => (Array.isArray(list) ? list.map(applyTrack) : list);

    online.searchResults = applyList(online.searchResults);
    if (online.currentTrack && typeof online.currentTrack === 'object') {
        online.currentTrack = applyTrack(online.currentTrack);
    }
    if (online.browserArtist && typeof online.browserArtist === 'object') {
        online.browserArtist = {
            ...online.browserArtist,
            allWork: applyList(online.browserArtist.allWork)
        };
    }
    if (online.browserRelease && typeof online.browserRelease === 'object') {
        online.browserRelease = {
            ...online.browserRelease,
            tracks: applyList(online.browserRelease.tracks)
        };
    }

    Object.entries(getOnlineMusicArtistCatalogCache()).forEach(([key, catalog]) => {
        if (!catalog || typeof catalog !== 'object') return;
        online.artistCatalogCache[key] = {
            ...catalog,
            allWork: applyList(catalog.allWork)
        };
    });

    Object.entries(getOnlineMusicReleaseTracksCache()).forEach(([key, entry]) => {
        if (!entry || typeof entry !== 'object') return;
        online.releaseTracksCache[key] = {
            ...entry,
            tracks: applyList(entry.tracks)
        };
    });
}

function getOnlineMusicTracksForView(view = '') {
    const online = getOnlineMusicState();
    const targetView = normalizeOnlineMusicPlaybackContext(view || online.playbackContext || online.browserView || 'search');
    if (targetView === 'private-session') {
        const privateState = getPrivateSessionState();
        return getPrivateSessionCollectionTracks(privateState.currentCollectionKey || privateState.onlineView || 'search');
    }
    if (targetView === 'library') {
        return getQueueTracks('audio').filter((track) => track && track.type === 'audio');
    }
    if (targetView === 'artist') {
        return filterOnlineMusicArtistTracksForSearch(
            getOnlineMusicArtistTrackSearchPool(online.browserArtist),
            online.artistWorkSearchQuery || ''
        );
    }
    if (targetView === 'release') {
        return Array.isArray(online.browserRelease?.tracks) ? online.browserRelease.tracks.slice() : [];
    }
    return (online.searchResults || []).slice();
}

function getOnlineMusicQueueContextKey(view = '', options = {}) {
    const online = getOnlineMusicState();
    const targetView = normalizeOnlineMusicPlaybackContext(view || online.playbackContext || 'search');
    if (targetView === 'private-session') {
        return sanitizeText(options.privateSessionKey || getPrivateSessionQueueContextKey('search'));
    }
    if (targetView === 'release') {
        const playlistId = sanitizeText(options.release?.playlistId || online.browserRelease?.playlistId || '');
        return playlistId ? `release:${playlistId}` : 'release';
    }
    if (targetView === 'artist') {
        const channelId = sanitizeText(options.artist?.channelId || online.browserArtist?.channelId || '');
        return channelId ? `artist:${channelId}` : 'artist';
    }
    if (targetView === 'library') return 'library';
    const query = sanitizeText(options.searchQuery || online.searchQuery || '');
    return query ? `search:${query}` : 'search';
}

function setOnlineMusicQueueContext(view = '', key = '', mode = 'ordered') {
    const online = getOnlineMusicState();
    online.queueContextView = normalizeOnlineMusicPlaybackContext(view || 'search');
    online.queueContextKey = sanitizeText(key || getOnlineMusicQueueContextKey(online.queueContextView) || '');
    online.queueMode = mode === 'shuffle' ? 'shuffle' : 'ordered';
}

function getOnlineMusicQueuedTracks() {
    const online = getOnlineMusicState();
    return (online.queue || []).map((id) => getOnlineMusicTrack(id)).filter(Boolean);
}

function projectOnlineQueueToAudioState(options = {}) {
    const helper = window.NexPlayOnlineMusicHelpers?.projectOnlineQueueToAudioState;
    const input = {
        queue: Array.isArray(options.queue) ? options.queue : [],
        queueIndex: Number(options.queueIndex),
        currentTrackId: normalizeOnlineMusicTrackId(options.currentTrackId || ''),
        queueMode: options.queueMode === 'shuffle' ? 'shuffle' : 'ordered'
    };
    const normalizeProjection = (projection = {}) => {
        const queue = Array.from(new Set((Array.isArray(projection.queue) ? projection.queue : [])
            .map((id) => normalizeOnlineMusicTrackId(id))
            .filter(Boolean)));
        const shuffleQueue = Array.from(new Set((Array.isArray(projection.shuffleQueue) ? projection.shuffleQueue : [])
            .map((id) => normalizeOnlineMusicTrackId(id))
            .filter(Boolean)));
        return {
            queue,
            queueSource: projection.queueSource === 'auto' ? 'auto' : 'manual',
            isShuffle: !!projection.isShuffle,
            shuffleQueue,
            shuffleIndex: clampNumber(projection.shuffleIndex, -1, Math.max(shuffleQueue.length - 1, -1), -1),
            pendingShuffleSeed: normalizeOnlineMusicTrackId(projection.pendingShuffleSeed || '')
        };
    };
    if (typeof helper === 'function') {
        return normalizeProjection(helper(input));
    }

    const queue = Array.from(new Set(input.queue
        .map((id) => normalizeOnlineMusicTrackId(id))
        .filter(Boolean)));
    const currentIndexFromId = input.currentTrackId ? queue.indexOf(input.currentTrackId) : -1;
    const resolvedIndex = currentIndexFromId >= 0
        ? currentIndexFromId
        : clampNumber(input.queueIndex, -1, Math.max(queue.length - 1, -1), queue.length ? 0 : -1);
    if (input.queueMode === 'shuffle') {
        return normalizeProjection({
            queue: [],
            queueSource: 'manual',
            isShuffle: true,
            shuffleQueue: queue,
            shuffleIndex: resolvedIndex,
            pendingShuffleSeed: null
        });
    }
    return normalizeProjection({
        queue: resolvedIndex >= 0 ? queue.slice(resolvedIndex + 1) : queue.slice(),
        queueSource: 'manual',
        isShuffle: false,
        shuffleQueue: [],
        shuffleIndex: -1,
        pendingShuffleSeed: null
    });
}

function resolveOnlineQueueStep(options = {}) {
    const helper = window.NexPlayOnlineMusicHelpers?.resolveOnlineQueueStep;
    const input = {
        queue: Array.isArray(options.queue) ? options.queue : [],
        queueIndex: Number(options.queueIndex),
        currentTrackId: normalizeOnlineMusicTrackId(options.currentTrackId || ''),
        offset: Number(options.offset) || 0,
        repeatMode: ['none', 'all', 'one'].includes(sanitizeText(options.repeatMode || '').toLowerCase())
            ? sanitizeText(options.repeatMode || '').toLowerCase()
            : 'none'
    };
    const normalizeResolution = (resolution = {}) => ({
        action: ['play', 'restart', 'stop'].includes(resolution.action) ? resolution.action : 'stop',
        nextTrackId: normalizeOnlineMusicTrackId(resolution.nextTrackId || '') || null,
        nextIndex: Number.isFinite(Number(resolution.nextIndex)) ? Math.trunc(Number(resolution.nextIndex)) : -1
    });
    if (typeof helper === 'function') {
        return normalizeResolution(helper(input));
    }

    const queue = Array.from(new Set(input.queue
        .map((id) => normalizeOnlineMusicTrackId(id))
        .filter(Boolean)));
    if (!queue.length) return normalizeResolution({ action: 'stop', nextTrackId: null, nextIndex: -1 });
    const currentIndexFromId = input.currentTrackId ? queue.indexOf(input.currentTrackId) : -1;
    const currentIndex = currentIndexFromId >= 0
        ? currentIndexFromId
        : clampNumber(input.queueIndex, -1, Math.max(queue.length - 1, -1), 0);
    const currentTrackId = currentIndex >= 0 ? queue[currentIndex] : null;
    if (!currentTrackId) return normalizeResolution({ action: 'stop', nextTrackId: null, nextIndex: -1 });
    if (input.repeatMode === 'one') {
        return normalizeResolution({ action: 'restart', nextTrackId: currentTrackId, nextIndex: currentIndex });
    }
    if (input.offset < 0) {
        if (currentIndex > 0) {
            return normalizeResolution({ action: 'play', nextTrackId: queue[currentIndex - 1], nextIndex: currentIndex - 1 });
        }
        if (input.repeatMode === 'all') {
            return normalizeResolution({ action: 'play', nextTrackId: queue[queue.length - 1], nextIndex: queue.length - 1 });
        }
        return normalizeResolution({ action: 'restart', nextTrackId: currentTrackId, nextIndex: currentIndex });
    }
    if (currentIndex < queue.length - 1) {
        return normalizeResolution({ action: 'play', nextTrackId: queue[currentIndex + 1], nextIndex: currentIndex + 1 });
    }
    if (input.repeatMode === 'all') {
        return normalizeResolution({ action: 'play', nextTrackId: queue[0], nextIndex: 0 });
    }
    return normalizeResolution({ action: 'stop', nextTrackId: null, nextIndex: currentIndex });
}

function isSharedOnlineMusicQueuePlayback(options = {}) {
    const online = getOnlineMusicState();
    const playbackContext = normalizeOnlineMusicPlaybackContext(options.playbackContext || online.playbackContext || online.queueContextView || 'search');
    return state.currentPlaybackSource === 'online-music' && playbackContext !== 'library';
}

function syncOnlineMusicQueueToSharedAudioState(options = {}) {
    const online = getOnlineMusicState();
    const playbackContext = normalizeOnlineMusicPlaybackContext(options.playbackContext || online.playbackContext || online.queueContextView || 'search');
    // Library playback uses the same audio/video queue bucket as local files so Next/Prev,
    // the Queue tab, and mini-player "next" stay one unified list (online tab still uses
    // the separate online queue path via isSharedOnlineMusicQueuePlayback).
    const projected = projectOnlineQueueToAudioState({
        queue: Array.isArray(options.queue) ? options.queue : (online.queue || []),
        queueIndex: Number.isFinite(Number(options.queueIndex)) ? Number(options.queueIndex) : online.queueIndex,
        currentTrackId: options.currentTrackId || online.currentTrackId || state.currentTrackId || '',
        queueMode: options.queueMode === 'shuffle'
            ? 'shuffle'
            : (options.queueMode === 'ordered'
                ? 'ordered'
                : (online.queueMode === 'shuffle' ? 'shuffle' : 'ordered'))
    });
    if (activeQueueType !== 'audio') {
        saveActiveQueueBucket();
    }
    const bucket = getQueueBucket('audio');
    bucket.queue = [...projected.queue];
    bucket.queueSource = projected.queueSource || 'manual';
    bucket.isShuffle = !!projected.isShuffle;
    bucket.shuffleQueue = [...projected.shuffleQueue];
    bucket.shuffleIndex = projected.shuffleIndex;
    bucket.pendingShuffleSeed = projected.pendingShuffleSeed || null;
    loadQueueBucket('audio');
    refreshQueueViews();
    return true;
}

function refreshQueueViews() {
    normalizeRuntimeState({ allowStopWhenQueueEmpty: false });
    renderMiniQueuePeek();
    if (state.isQueueOverlayOpen) renderQueueOverlay();
    if (state.activeTab === 'queue') renderQueue();
}

function getDefaultAutoplayRadioState() {
    return { active: false, source: '', generatedAt: 0, reasons: {} };
}

function cloneAutoplayRadioState(value = null) {
    const fallback = getDefaultAutoplayRadioState();
    try {
        return JSON.parse(JSON.stringify(value || fallback));
    } catch (_) {
        return { ...fallback };
    }
}

function clearAutoplayRadioState() {
    state.autoplayRadioState = getDefaultAutoplayRadioState();
}

function rememberQueueUndoState(mediaType = currentMediaType()) {
    const autoplayRadioState = cloneAutoplayRadioState(state.autoplayRadioState);
    const targetType = mediaType === 'video' ? 'video' : 'audio';
    const bucket = getQueueBucket(targetType);
    state.queueUndoState = {
        kind: targetType === 'audio' ? 'audio' : 'video',
        mediaType: targetType,
        bucket: JSON.parse(JSON.stringify({
            entries: Array.isArray(bucket.entries) ? bucket.entries : [],
            currentIndex: Number(bucket.currentIndex ?? -1),
            queue: Array.isArray(bucket.queue) ? bucket.queue : [],
            queueSource: bucket.queueSource || 'auto',
            isShuffle: !!bucket.isShuffle,
            repeatMode: bucket.repeatMode || 'none',
            shuffleOrder: Array.isArray(bucket.shuffleOrder) ? bucket.shuffleOrder : [],
            shuffleQueue: Array.isArray(bucket.shuffleQueue) ? bucket.shuffleQueue : [],
            shuffleIndex: Number(bucket.shuffleIndex || -1),
            pendingShuffleSeed: bucket.pendingShuffleSeed || null,
            failedEntryIds: Array.isArray(bucket.failedEntryIds) ? bucket.failedEntryIds : []
        })),
        autoplayRadioState
    };
}

function undoLastQueueEdit() {
    const snapshot = state.queueUndoState;
    if (!snapshot) {
        showToast('No queue change to undo.', 'info');
        return;
    }
    if (snapshot.kind === 'audio' || snapshot.kind === 'video') {
        const bucket = getQueueBucket(snapshot.mediaType || currentMediaType());
        Object.assign(bucket, snapshot.bucket || {});
        if ((snapshot.mediaType || currentMediaType()) === 'audio') {
            commitUnifiedAudioQueue(snapshot.bucket || {}, {
                refresh: (snapshot.mediaType || currentMediaType()) === activeQueueType
            });
        } else if ((snapshot.mediaType || currentMediaType()) === activeQueueType) {
            loadQueueBucket(snapshot.mediaType || currentMediaType());
            refreshQueueViews();
            updateShuffleIcon();
            updateRepeatIcon();
            saveActiveQueueBucket();
        }
    }
    state.autoplayRadioState = cloneAutoplayRadioState(snapshot.autoplayRadioState);
    state.queueUndoState = null;
    showToast('Queue change undone.', 'success');
}

function moveUniqueTrackToIndex(list = [], trackId = '', targetIndex = 0) {
    const id = sanitizeText(trackId || '');
    const next = Array.from((list || []).filter(Boolean));
    if (!id) return next;
    const filtered = next.filter((item) => item !== id);
    const safeIndex = Math.max(0, Math.min(Number(targetIndex) || 0, filtered.length));
    filtered.splice(safeIndex, 0, id);
    return filtered;
}

function appendUniqueTrack(list = [], trackId = '') {
    const id = sanitizeText(trackId || '');
    if (!id) return Array.from((list || []).filter(Boolean));
    return [...(list || []).filter((item) => item && item !== id), id];
}

function queueOnlineCatalogTrack(trackId = '', placement = 'end', options = {}) {
    return withQueueUpdateLock(() => {
        const opts = { quiet: false, ...options };
        const track = getOnlineMusicTrack(trackId);
        if (!track) return false;
        const online = getOnlineMusicState();
        const playbackContext = getOnlineMusicActiveViewContext();
        const queueContextKey = getOnlineMusicQueueContextKey(playbackContext, {
            release: online.browserRelease,
            artist: online.browserArtist,
            searchQuery: online.searchQuery
        });
        rememberQueueUndoState();
        clearAutoplayRadioState();
        if (isSharedOnlineMusicQueuePlayback()) {
            mutateSharedOnlineMusicQueue(({ queue, currentIndex }) => {
                if (placement === 'next') {
                    return moveUniqueTrackToIndex(queue, track.id, Math.max(0, currentIndex + 1));
                }
                return appendUniqueTrack(queue, track.id);
            });
            if (!opts.quiet) showToast(`${track.title || 'Track'} queued ${placement === 'next' ? 'next' : 'to the end'}.`, 'info');
            return true;
        }
        const baseQueue = getOnlineMusicPreferredQueueTracks(playbackContext, {
            queueContextKey,
            release: online.browserRelease,
            artist: online.browserArtist,
            searchQuery: online.searchQuery
        }).map((item) => item?.id).filter(Boolean);
        const nextQueue = placement === 'next'
            ? moveUniqueTrackToIndex(baseQueue, track.id, 0)
            : appendUniqueTrack(baseQueue, track.id);
        setOnlineMusicQueue(nextQueue, online.currentTrackId || '');
        setOnlineMusicQueueContext(playbackContext, queueContextKey, 'ordered');
        syncOnlineMusicQueueToSharedAudioState({
            queue: nextQueue,
            queueIndex: online.currentTrackId ? nextQueue.indexOf(online.currentTrackId) : -1,
            currentTrackId: online.currentTrackId || '',
            playbackContext,
            queueMode: 'ordered'
        });
        persistOnlineMusicState();
        if (!opts.quiet) showToast(`${track.title || 'Track'} queued ${placement === 'next' ? 'next' : 'to the end'}.`, 'info');
        return true;
    }, false);
}

function queueLocalTrack(trackId = '', placement = 'end', options = {}) {
    const opts = { quiet: false, contextTab: state.activeTab, ...options };
    const track = resolveQueueDisplayTrack(trackId) || (state.tracks || []).find((item) => item?.id === trackId);
    if (!track) return false;
    const mediaType = track.type === 'video' ? 'video' : 'audio';
    if (mediaType === 'audio') {
        rememberQueueUndoState('audio');
        clearAutoplayRadioState();
        return queueUnifiedAudioTrack(track, placement, { quiet: opts.quiet });
    }
    const bucket = getQueueBucket(mediaType);
    rememberQueueUndoState(mediaType);
    clearAutoplayRadioState();
    if (bucket.isShuffle) {
        const currentId = mediaType === currentMediaType() ? sanitizeText(state.currentTrackId || '') : '';
        let currentIndex = currentId ? (bucket.shuffleQueue || []).indexOf(currentId) : -1;
        if (!Array.isArray(bucket.shuffleQueue) || !bucket.shuffleQueue.length) {
            bucket.shuffleQueue = (getQueueTracks(mediaType) || []).map((item) => item?.id).filter(Boolean);
            currentIndex = currentId ? bucket.shuffleQueue.indexOf(currentId) : -1;
        }
        bucket.shuffleQueue = placement === 'next'
            ? moveUniqueTrackToIndex(bucket.shuffleQueue, track.id, Math.max(0, currentIndex + 1))
            : appendUniqueTrack(bucket.shuffleQueue, track.id);
        if (currentId) bucket.shuffleIndex = bucket.shuffleQueue.indexOf(currentId);
    } else {
        bucket.queue = placement === 'next'
            ? moveUniqueTrackToIndex(bucket.queue || [], track.id, 0)
            : appendUniqueTrack(bucket.queue || [], track.id);
        bucket.queueSource = 'manual';
    }
    if (mediaType === activeQueueType) {
        loadQueueBucket(mediaType);
        refreshQueueViews();
        saveActiveQueueBucket();
    }
    if (!opts.quiet) showToast(`${track.title || 'Track'} queued ${placement === 'next' ? 'next' : 'to the end'}.`, 'info');
    return true;
}

function queueTrackNext(trackId = '', options = {}) {
    return withQueueUpdateLock(() => {
        const opts = { quiet: false, contextTab: state.activeTab, ...options };
        const track = resolveQueueDisplayTrack(trackId);
        if (!track) return false;
        if (!ensureManualQueueAllowed(track, { quiet: opts.quiet, contextTab: opts.contextTab })) return false;
        return queueLocalTrack(track.id, 'next', { quiet: opts.quiet, contextTab: opts.contextTab });
    }, false);
}

function queueTrackToEnd(trackId = '', options = {}) {
    return withQueueUpdateLock(() => {
        const opts = { quiet: false, contextTab: state.activeTab, ...options };
        const track = resolveQueueDisplayTrack(trackId);
        if (!track) return false;
        if (!ensureManualQueueAllowed(track, { quiet: opts.quiet, contextTab: opts.contextTab })) return false;
        return queueLocalTrack(track.id, 'end', { quiet: opts.quiet, contextTab: opts.contextTab });
    }, false);
}

async function startTrackCollectionPlayback(tracks = [], currentTrackId = '', options = {}) {
    let list = (Array.isArray(tracks) ? tracks : []).filter(Boolean);
    if (!list.length) return false;
    const requestedTrackId = sanitizeText(currentTrackId || '');
    const requestedOnlineTrackId = normalizeOnlineMusicTrackId(requestedTrackId);
    let targetTrack = requestedTrackId
        ? list.find((track) => track?.id === requestedTrackId)
        : null;
    if (!targetTrack && requestedOnlineTrackId) {
        targetTrack = list.find((track) => isOnlineMusicTrackRecord(track)
            && normalizeOnlineMusicTrackId(track?.id || '') === requestedOnlineTrackId) || null;
    }
    if (!targetTrack && requestedTrackId) {
        const recoveredTrack = getOnlineMusicTrack(requestedTrackId) || resolveQueueDisplayTrack(requestedTrackId);
        if (recoveredTrack && isOnlineMusicTrackRecord(recoveredTrack)) {
            targetTrack = recoveredTrack;
            list = [
                recoveredTrack,
                ...list.filter((track) => normalizeOnlineMusicTrackId(track?.id || '') !== normalizeOnlineMusicTrackId(recoveredTrack.id || ''))
            ];
        }
    }
    if (!targetTrack && !requestedTrackId) targetTrack = list[0];
    if (!targetTrack) {
        showToast('That track is no longer available in this view.', 'error');
        return false;
    }
    const mediaType = targetTrack.type === 'video' ? 'video' : 'audio';
    if (mediaType === 'audio') {
        const previousAudioQueue = isOnlineMusicTrackRecord(targetTrack)
            ? JSON.parse(JSON.stringify(getUnifiedAudioQueueState()))
            : null;
        setUnifiedAudioQueueFromTrackList(list, targetTrack.id, {
            queueSource: options.queueSource || 'manual',
            isShuffle: !!options.isShuffle,
            preserveShuffleOrder: !!options.isShuffle,
            repeatMode: getUnifiedAudioQueueState().repeatMode || 'none',
            resetFailures: true
        });
        if (isOnlineMusicTrackRecord(targetTrack)) {
            const started = !!(await playOnlineMusicTrack(targetTrack.id, {
                autoplay: options.autoplay !== false,
                startTime: Number(options.startTime) || 0,
                playbackContext: options.playbackContext || 'library',
                queueContextView: options.queueContextView || options.playbackContext || 'library',
                queueContextKey: options.queueContextKey || '',
                queueMode: options.isShuffle ? 'shuffle' : 'ordered',
                trackSnapshot: targetTrack,
                forcePlaybackResolution: !!options.forcePlaybackResolution || !!targetTrack.pendingPlaybackResolution
            }));
            if (!started && previousAudioQueue) {
                commitUnifiedAudioQueue(previousAudioQueue, { refresh: true });
            }
            return started;
        }
        loadTrack(targetTrack.id, options.autoplay !== false, null);
        return true;
    }
    ensureQueueForType('video');
    state.isShuffle = !!options.isShuffle;
    state.queueSource = options.queueSource || 'manual';
    clearAutoplayRadioState();
    if (state.isShuffle) {
        const shuffled = list.map((track) => track.id).filter(Boolean);
        shuffleArray(shuffled);
        const ordered = [targetTrack.id, ...shuffled.filter((id) => id !== targetTrack.id)];
        state.queue = [];
        state.shuffleQueue = ordered;
        state.shuffleIndex = 0;
        state.pendingShuffleSeed = null;
    } else {
        const ordered = list.map((track) => track.id).filter(Boolean);
        const startIndex = ordered.indexOf(targetTrack.id);
        state.queue = startIndex >= 0 ? ordered.slice(startIndex + 1) : ordered.slice(1);
        state.shuffleQueue = [];
        state.shuffleIndex = -1;
        state.pendingShuffleSeed = null;
    }
    saveActiveQueueBucket();
    refreshQueueViews();
    updateShuffleIcon();
    updateRepeatIcon();
    await playResolvedTrackFromQueue(targetTrack.id, { autoplay: options.autoplay !== false, allowCrossfade: false });
    return true;
}

function clearCurrentQueue() {
    withQueueUpdateLock(() => {
        rememberQueueUndoState();
        clearAutoplayRadioState();
        const mediaType = currentMediaType();
        if (mediaType === 'audio') {
            const bucket = getUnifiedAudioQueueState();
            const currentEntry = getUnifiedAudioQueueCurrentEntry();
            const entries = currentEntry ? [currentEntry] : [];
            commitUnifiedAudioQueue({
                entries,
                currentIndex: entries.length ? 0 : -1,
                queueSource: 'auto',
                isShuffle: bucket.isShuffle,
                repeatMode: bucket.repeatMode,
                shuffleOrder: bucket.isShuffle ? entries.map((entry) => entry.id) : [],
                pendingShuffleSeed: null,
                failedEntryIds: []
            });
            showToast('Queue cleared.', 'info');
            return true;
        }
        const bucket = getQueueBucket(mediaType);
        bucket.queue = [];
        bucket.queueSource = 'auto';
        if (bucket.isShuffle) {
            const currentTrackId = sanitizeText(state.currentTrackId || '');
            bucket.shuffleQueue = currentTrackId ? [currentTrackId] : [];
            bucket.shuffleIndex = bucket.shuffleQueue.length ? 0 : -1;
        }
        loadQueueBucket(mediaType);
        refreshQueueViews();
        saveActiveQueueBucket();
        showToast('Queue cleared.', 'info');
        return true;
    }, false);
}

function getQueueSurfaceMeta(type = 'manual', list = []) {
    const count = Array.isArray(list) ? list.length : 0;
    const sourceLabel = (() => {
        if (state.queueSource === 'manual') return 'Manual';
        if (state.queueSource === 'radio') return 'Radio';
        return 'Auto';
    })();
    const modeLabel = type === 'shuffle' ? 'Shuffle' : 'Ordered';
    const contextLabel = (() => {
        if (state.activeTab === 'playlists' && state.activePlaylistId) {
            return sanitizeText((state.playlists || []).find((playlist) => playlist.id === state.activePlaylistId)?.name || 'Playlist');
        }
        if (state.activeTab === 'favorites') return 'Favorites';
        if (state.activeTab === 'history') return 'History';
        if (state.activeTab === 'top') return 'Top Played';
        if (state.activeTab === 'tags' && state.tagFilter) return `Tag: ${state.tagFilter}`;
        return currentMediaType() === 'video' ? 'Videos' : 'Library';
    })();
    return { count, sourceLabel, modeLabel, contextLabel };
}

function renderQueueHeader(meta = { count: 0, sourceLabel: 'Auto', modeLabel: 'Ordered', contextLabel: 'Library' }) {
    return `
        <div class="rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/80">Queue Overview</div>
                    <div class="mt-1 text-sm text-white">${meta.count} upcoming track${meta.count === 1 ? '' : 's'}</div>
                </div>
                <div class="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.16em]">
                    <span class="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-gray-200">${escapeHtml(meta.sourceLabel)}</span>
                    <span class="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-gray-200">${escapeHtml(meta.modeLabel)}</span>
                    <span class="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-gray-200">${escapeHtml(meta.contextLabel)}</span>
                </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
                <button onclick="undoLastQueueEdit()" class="px-3 py-2 rounded-lg text-xs border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10">Undo</button>
                <button onclick="clearCurrentQueue()" class="px-3 py-2 rounded-lg text-xs border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20">Clear Queue</button>
            </div>
        </div>
    `;
}

function getAutoplayRadioReason(trackId = '') {
    return sanitizeText(state.autoplayRadioState?.reasons?.[trackId] || '');
}

function getSharedOnlineMusicQueuePlaybackOptions(options = {}) {
    const online = getOnlineMusicState();
    const playbackContext = normalizeOnlineMusicPlaybackContext(options.playbackContext || online.playbackContext || 'search');
    const queueContextView = normalizeOnlineMusicPlaybackContext(options.queueContextView || online.queueContextView || playbackContext);
    const queueContextKey = sanitizeText(options.queueContextKey || online.queueContextKey || getOnlineMusicQueueContextKey(queueContextView) || '');
    const queueMode = options.queueMode === 'shuffle'
        ? 'shuffle'
        : (options.queueMode === 'ordered'
            ? 'ordered'
            : (online.queueMode === 'shuffle' ? 'shuffle' : 'ordered'));
    const queuedTracks = Array.isArray(options.queueTracks) && options.queueTracks.length
        ? options.queueTracks
        : getOnlineMusicQueuedTracks();
    return {
        autoplay: options.autoplay !== false,
        startTime: Math.max(0, Number(options.startTime) || 0),
        queueTracks: queuedTracks.length ? queuedTracks : getOnlineMusicTracksForView(playbackContext),
        playbackContext,
        queueContextView,
        queueContextKey,
        queueMode
    };
}

function shouldReuseOnlineMusicQueue(view = '', key = '') {
    const online = getOnlineMusicState();
    const targetView = normalizeOnlineMusicPlaybackContext(view || online.playbackContext || 'search');
    const targetKey = sanitizeText(key || getOnlineMusicQueueContextKey(targetView) || '');
    if (!(online.queue || []).length) return false;
    return online.queueContextView === targetView && sanitizeText(online.queueContextKey || '') === targetKey;
}

function getOnlineMusicPreferredQueueTracks(view = '', options = {}) {
    const targetView = normalizeOnlineMusicPlaybackContext(view || getOnlineMusicActiveViewContext());
    const targetKey = sanitizeText(options.queueContextKey || getOnlineMusicQueueContextKey(targetView, options) || '');
    if (shouldReuseOnlineMusicQueue(targetView, targetKey)) {
        const queued = getOnlineMusicQueuedTracks();
        if (queued.length) return queued;
    }
    return getOnlineMusicTracksForView(targetView);
}

function getOnlineMusicActiveViewContext() {
    const online = getOnlineMusicState();
    if (online.browserView === 'release') return 'release';
    if (online.browserView === 'artist') return 'artist';
    return 'search';
}

function getOnlineMusicTrackListsForLookup() {
    const online = getOnlineMusicState();
    const releaseCacheTracks = Object.values(getOnlineMusicReleaseTracksCache())
        .flatMap((entry) => Array.isArray(entry?.tracks) ? entry.tracks : []);
    const artistCacheTracks = Object.values(getOnlineMusicArtistCatalogCache())
        .flatMap((catalog) => Array.isArray(catalog?.allWork) ? catalog.allWork : []);
    return [
        online.searchResults || [],
        Array.isArray(online.browserRelease?.tracks) ? online.browserRelease.tracks : [],
        Array.isArray(online.browserArtist?.allWork) ? online.browserArtist.allWork : [],
        releaseCacheTracks,
        artistCacheTracks
    ];
}

function getOnlineMusicThumbnail(snippet = {}) {
    return snippet?.thumbnails?.maxres?.url
        || snippet?.thumbnails?.standard?.url
        || snippet?.thumbnails?.high?.url
        || snippet?.thumbnails?.medium?.url
        || snippet?.thumbnails?.default?.url
        || '';
}

function buildOnlineMusicReleaseCacheKey(playlistId = '') {
    return sanitizeText(playlistId || '');
}

function normalizeOnlineMusicProvider(value = '') {
    const helper = window.NexPlayOnlineMusicHelpers;
    if (helper && typeof helper.normalizeOnlineMusicProvider === 'function') {
        return helper.normalizeOnlineMusicProvider(value || '');
    }
    const raw = sanitizeText(value || '').toLowerCase();
    if (raw === 'yt') return 'youtube';
    if (['youtube', 'itunes', 'deezer', 'spotify', 'musicbrainz'].includes(raw)) return raw;
    return raw;
}

function inferOnlineMusicReleaseProvider(release = {}) {
    const explicit = normalizeOnlineMusicProvider(release?.provider || '');
    if (explicit) return explicit;
    const playlistId = sanitizeText(release?.playlistId || '');
    if (/^itunes:/i.test(playlistId)) return 'itunes';
    if (/^deezer:/i.test(playlistId)) return 'deezer';
    if (playlistId) return 'youtube';
    return '';
}

function getOnlineMusicProviderLabel(value = '') {
    const helper = window.NexPlayOnlineMusicHelpers;
    if (helper && typeof helper.getOnlineMusicProviderLabel === 'function') {
        return helper.getOnlineMusicProviderLabel(value || '');
    }
    const provider = normalizeOnlineMusicProvider(value);
    if (provider === 'youtube') return 'YouTube';
    if (provider === 'itunes') return 'iTunes';
    if (provider === 'deezer') return 'Deezer';
    if (provider === 'spotify') return 'Spotify';
    if (provider === 'musicbrainz') return 'MusicBrainz';
    return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Unknown';
}

function isCatalogBackedOnlineMusicTrack(track = {}) {
    const provider = normalizeOnlineMusicProvider(track?.catalogProvider || track?.provider || '');
    const id = sanitizeText(track?.id || '');
    return ['itunes', 'deezer', 'spotify'].includes(provider)
        || /^(?:itunes|deezer|spotify):/i.test(id);
}

function normalizeOnlineMusicCatalogArtistName(value = '') {
    const raw = sanitizeText(value || '')
        .replace(/\s*[-\u2013\u2014|:]\s*(?:topic|official\s+artist\s+channel|official\s+channel|official|vevo)\s*$/gi, ' ')
        .replace(/\s*[\(\[\{]\s*(?:topic|official\s+artist\s+channel|official\s+channel|official|vevo)\s*[\)\]\}]\s*/gi, ' ')
        .replace(/\b(?:topic|official\s+artist\s+channel|official\s+channel)\b/gi, ' ')
        .replace(/\bvevo\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return sanitizeText(normalizeLyricsArtistName(raw) || raw).replace(/\s+/g, ' ').trim();
}

function normalizeOnlineMusicArtistMatchText(value = '') {
    return normalizeLyricsLookupText(normalizeLyricsArtistName(value || ''))
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function getOnlineMusicCatalogArtistName(channel = {}, fallbackTrack = {}) {
    const candidates = [
        channel?.catalogArtistName,
        fallbackTrack?.lyricsArtist,
        fallbackTrack?.artist,
        fallbackTrack?.channelTitle,
        channel?.title
    ];
    const seen = new Set();
    for (const candidate of candidates) {
        const clean = normalizeOnlineMusicCatalogArtistName(candidate || '');
        const key = normalizeLyricsLookupText(clean);
        if (!clean || !key || seen.has(key)) continue;
        seen.add(key);
        if (!/^(?:topic|official|vevo|youtube)$/i.test(clean)) return clean;
    }
    return '';
}

function buildOnlineMusicCatalogArtistNameCandidates(channel = {}, fallbackTrack = {}) {
    const rawCandidates = [
        channel?.catalogArtistName,
        fallbackTrack?.lyricsArtist,
        fallbackTrack?.artist,
        fallbackTrack?.channelTitle,
        channel?.title
    ];
    const seen = new Set();
    const names = [];
    rawCandidates.forEach((candidate) => {
        const clean = normalizeOnlineMusicCatalogArtistName(candidate || '');
        const variants = [
            clean,
            clean.replace(/\s+\b(?:and|&)\b\s+/gi, ' & '),
            clean.replace(/\s*&\s*/g, ' and ')
        ];
        variants.forEach((variant) => {
            const safe = normalizeOnlineMusicCatalogArtistName(variant || '');
            const key = normalizeLyricsLookupText(safe).toLowerCase();
            if (!safe || !key || seen.has(key)) return;
            if (/^(?:topic|official|vevo|youtube)$/i.test(safe)) return;
            seen.add(key);
            names.push(safe);
        });
    });
    return names.slice(0, 5);
}

function getOnlineMusicCatalogProviderArtistId(channel = {}, provider = '') {
    const normalizedProvider = normalizeOnlineMusicProvider(provider || '');
    if (!normalizedProvider) return '';
    const ids = channel?.providerArtistIds && typeof channel.providerArtistIds === 'object'
        ? channel.providerArtistIds
        : {};
    const fromMap = sanitizeText(ids[normalizedProvider] || '');
    if (fromMap) return fromMap;
    const channelProvider = normalizeOnlineMusicProvider(channel?.catalogProvider || channel?.provider || '');
    if (channelProvider === normalizedProvider) {
        return sanitizeText(channel?.providerArtistId || '');
    }
    return '';
}

function buildOnlineMusicCatalogArtistChannelId(artistName = '') {
    const slug = normalizeLyricsLookupText(normalizeOnlineMusicCatalogArtistName(artistName || ''))
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return slug ? `catalog:${slug}` : '';
}

function buildOnlineMusicArtistCatalogCacheKey(channel = {}, fallbackTrack = {}) {
    return sanitizeText(channel?.artistCatalogKey || '')
        || buildOnlineMusicCatalogArtistChannelId(getOnlineMusicCatalogArtistName(channel, fallbackTrack))
        || sanitizeText(channel?.channelId || '');
}

function withOnlineMusicCatalogArtistMetadata(channel = {}, fallbackTrack = {}) {
    const catalogArtistName = getOnlineMusicCatalogArtistName(channel, fallbackTrack);
    const artistCatalogKey = buildOnlineMusicCatalogArtistChannelId(catalogArtistName)
        || sanitizeText(channel?.artistCatalogKey || channel?.channelId || '');
    return {
        ...(channel || {}),
        catalogArtistName,
        artistCatalogKey
    };
}

function createCatalogOnlyOnlineMusicArtistChannel(track = {}) {
    const artistName = getOnlineMusicCatalogArtistName({}, track);
    const channelId = buildOnlineMusicCatalogArtistChannelId(artistName);
    if (!artistName || !channelId) return null;
    const provider = normalizeOnlineMusicProvider(track?.catalogProvider || track?.provider || '');
    const providerArtistId = sanitizeText(track?.providerArtistId || '');
    const providerArtistIds = {};
    if (provider && providerArtistId) providerArtistIds[provider] = providerArtistId;
    return {
        channelId,
        artistCatalogKey: channelId,
        catalogArtistName: artistName,
        title: artistName,
        catalogProvider: provider,
        providerArtistId,
        providerArtistIds,
        description: '',
        cover: track?.cover || track?.thumbnail || '',
        uploadsPlaylistId: '',
        subscriberCount: 0,
        videoCount: 0,
        catalogOnly: true
    };
}

function isCatalogOnlyOnlineMusicArtistChannel(channel = {}) {
    return !!channel?.catalogOnly || /^catalog:/i.test(sanitizeText(channel?.channelId || ''));
}

function buildItunesArtworkUrl(url = '', size = '600x600bb') {
    const safe = sanitizeText(url || '');
    if (!safe) return '';
    return safe
        .replace(/\/\d+x\d+bb\./i, `/${size}.`)
        .replace(/\/\d+x\d+\./i, `/${size}.`);
}

function createOnlineMusicRequestAbortError(message = 'Online request cancelled.') {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
}

function raceOnlineMusicRequestWithSignal(request, signal = null, message = 'Online request cancelled.') {
    if (!signal) return Promise.resolve(request);
    if (signal.aborted) return Promise.reject(createOnlineMusicRequestAbortError(message));
    return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => signal.removeEventListener('abort', handleAbort);
        const settle = (callback, value) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        };
        const handleAbort = () => settle(reject, createOnlineMusicRequestAbortError(message));
        signal.addEventListener('abort', handleAbort, { once: true });
        Promise.resolve(request).then(
            (value) => settle(resolve, value),
            (error) => settle(reject, error)
        );
    });
}

function fetchJsonpPayload(rawUrl, options = {}) {
    const opts = {
        callbackParam: 'callback',
        callbackPrefix: 'nexplay_jsonp_',
        timeoutMs: 3500,
        errorMessage: 'Request failed.',
        signal: null,
        ...options
    };
    if (opts.signal?.aborted) {
        return Promise.reject(createOnlineMusicRequestAbortError(opts.errorMessage));
    }
    const desktopFetch = window.NexPlayDesktop?.fetchApprovedRemoteJson;
    if (typeof desktopFetch === 'function') {
        const request = desktopFetch({ url: rawUrl, timeoutMs: opts.timeoutMs }).catch((error) => {
            if (opts.signal?.aborted || error?.name === 'AbortError') {
                throw createOnlineMusicRequestAbortError(opts.errorMessage);
            }
            console.warn('Desktop metadata request failed', error);
            throw new Error(opts.errorMessage);
        });
        return raceOnlineMusicRequestWithSignal(request, opts.signal, opts.errorMessage);
    }
    return new Promise((resolve, reject) => {
        const callbackName = `${opts.callbackPrefix}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        const script = document.createElement('script');
        let settled = false;
        let timer = null;
        let abortHandler = null;

        const removeCallback = (expectedCallback = null) => {
            if (expectedCallback && window[callbackName] !== expectedCallback) return;
            try {
                delete window[callbackName];
            } catch (_) {
                window[callbackName] = undefined;
            }
        };

        const retireCallbackForLateResponse = () => {
            const lateResponseSink = () => {};
            window[callbackName] = lateResponseSink;
            window.setTimeout(() => removeCallback(lateResponseSink), 60_000);
        };

        const cleanup = (options = {}) => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (abortHandler && opts.signal) {
                opts.signal.removeEventListener('abort', abortHandler);
                abortHandler = null;
            }
            if (script.parentNode) script.parentNode.removeChild(script);
            if (options.allowLateResponse) retireCallbackForLateResponse();
            else removeCallback();
        };

        window[callbackName] = (payload) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(payload);
        };

        try {
            const url = new URL(rawUrl, window.location.href);
            url.searchParams.set(opts.callbackParam, callbackName);
            script.src = url.toString();
        } catch (error) {
            cleanup();
            reject(error);
            return;
        }

        script.async = true;
        script.onerror = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(opts.errorMessage));
        };

        if (opts.signal) {
            abortHandler = () => {
                if (settled) return;
                settled = true;
                cleanup({ allowLateResponse: true });
                reject(createOnlineMusicRequestAbortError(opts.errorMessage));
            };
            opts.signal.addEventListener('abort', abortHandler, { once: true });
        }

        timer = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup({ allowLateResponse: true });
            reject(new Error(opts.errorMessage));
        }, Math.max(1000, Number(opts.timeoutMs) || 3500));

        document.body.appendChild(script);
    });
}

async function fetchJsonPayload(rawUrl, options = {}) {
    const opts = {
        timeoutMs: 4500,
        errorMessage: 'Request failed.',
        ...options
    };
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), Math.max(1000, Number(opts.timeoutMs) || 4500));
    try {
        const response = await fetch(rawUrl, {
            signal: controller.signal,
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error(opts.errorMessage);
        return await response.json();
    } finally {
        window.clearTimeout(timer);
    }
}

function scoreOnlineMusicArtistNameCandidate(candidateName = '', expectedName = '') {
    const candidate = normalizeOnlineMusicArtistMatchText(candidateName || '');
    const expected = normalizeOnlineMusicArtistMatchText(expectedName || '');
    if (!candidate || !expected) return 0;
    if (candidate === expected) return 100;
    if (candidate.includes(expected) || expected.includes(candidate)) return 64;
    return 0;
}

function getOnlineMusicCatalogArtistOwnershipNames(channel = {}, artistInfo = {}) {
    const rawNames = [
        artistInfo?.title,
        artistInfo?.artistName,
        artistInfo?.name,
        ...buildOnlineMusicCatalogArtistNameCandidates(channel)
    ];
    const seen = new Set();
    return rawNames
        .map((name) => normalizeOnlineMusicCatalogArtistName(name || ''))
        .filter((name) => {
            const key = normalizeOnlineMusicArtistMatchText(name);
            if (!name || !key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function splitOnlineMusicArtistCredits(value = '') {
    const normalized = normalizeOnlineMusicArtistMatchText(value || '')
        .replace(/\b(?:ft|feat|featuring|with)\b\.?\s+.+$/i, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return [];
    return normalized
        .split(/\s*(?:,|;|&|\+|\band\b)\s*/i)
        .map((part) => part.trim())
        .filter(Boolean);
}

function getOnlineMusicReleaseArtistCandidates(release = {}) {
    return [
        release?.artistName,
        release?.collectionArtistName,
        release?.artist?.name,
        release?.album?.artist?.name,
        typeof release?.artist === 'string' ? release.artist : ''
    ]
        .map((name) => sanitizeText(name || ''))
        .filter(Boolean);
}

function isOnlineMusicPrimaryArtistCreditForCatalog(releaseArtist = '', channel = {}, artistInfo = {}) {
    const expectedNames = getOnlineMusicCatalogArtistOwnershipNames(channel, artistInfo);
    const candidate = normalizeOnlineMusicArtistMatchText(releaseArtist || '');
    if (!candidate || !expectedNames.length) return false;
    const creditParts = splitOnlineMusicArtistCredits(releaseArtist);
    return expectedNames.some((name) => {
        const expected = normalizeOnlineMusicArtistMatchText(name);
        if (!expected) return false;
        return candidate === expected || creditParts.includes(expected);
    });
}

function shouldKeepOnlineMusicCatalogReleaseForArtist(release = {}, channel = {}, artistInfo = {}) {
    const releaseArtists = getOnlineMusicReleaseArtistCandidates(release);
    if (!releaseArtists.length) return true;
    return releaseArtists.some((artistName) => {
        return isOnlineMusicPrimaryArtistCreditForCatalog(artistName, channel, artistInfo);
    });
}

function normalizeOnlineMusicReleaseTitle(value = '') {
    return normalizeLyricsLookupText(
        sanitizeText(value || '')
            .replace(/\s*[\(\[\{][^)\]\}]{0,80}\b(?:deluxe|expanded|edition|remaster(?:ed)?|anniversary|bonus|explicit|clean)\b[^)\]\}]*[\)\]\}]\s*/gi, ' ')
            .replace(/\b\d{1,3}(?:st|nd|rd|th)?\s+anniversary\b/gi, ' ')
            .replace(/\b(?:super\s+deluxe|deluxe|expanded|remaster(?:ed)?|edition|bonus|explicit|clean)\b/gi, ' ')
            .replace(/\s+-\s+(?:single|ep)\s*$/gi, '')
            .replace(/^(.{2,}?)\s+\d{2,3}$/i, '$1')
            .replace(/\s+/g, ' ')
            .trim()
    );
}

function buildOnlineMusicReleaseIdentity(release = {}) {
    const artist = normalizeLyricsLookupText(normalizeLyricsArtistName(release?.artist || ''));
    const title = normalizeOnlineMusicReleaseTitle(release?.title || '');
    const kind = sanitizeText(release?.kind || 'release');
    return [artist, title, kind].filter(Boolean).join('|')
        || buildOnlineMusicReleaseSourceKey(release)
        || sanitizeText(release?.playlistId || '');
}

function getOnlineMusicReleaseSourcePriority(source = {}) {
    const provider = inferOnlineMusicReleaseProvider(source);
    let score = 0;
    if (provider === 'itunes') score += 420;
    else if (provider === 'deezer') score += 380;
    else if (provider === 'musicbrainz') score += 220;
    else if (provider === 'youtube') score += 120;
    if (source?.cover) score += 24;
    if (source?.description) score += 8;
    score += Math.min(80, Number(source?.trackCount || 0) || 0);
    return score;
}

function buildOnlineMusicReleaseSourceKey(source = {}) {
    const provider = inferOnlineMusicReleaseProvider(source);
    const providerReleaseId = sanitizeText(source?.providerReleaseId || '');
    const playlistId = sanitizeText(source?.playlistId || '');
    const identifier = providerReleaseId || playlistId;
    return provider && identifier ? `${provider}:${identifier}` : '';
}

function createOnlineMusicReleaseSource(release = {}) {
    const provider = inferOnlineMusicReleaseProvider(release);
    const providerReleaseId = sanitizeText(release?.providerReleaseId || (provider !== 'youtube' ? String(release?.playlistId || '').replace(/^[^:]+:/, '') : ''));
    const playlistId = sanitizeText(release?.playlistId || (provider && providerReleaseId ? `${provider}:${providerReleaseId}` : ''));
    return {
        provider,
        providerLabel: getOnlineMusicProviderLabel(provider),
        playlistId,
        providerReleaseId: provider === 'youtube' ? (providerReleaseId || playlistId) : providerReleaseId,
        providerArtistId: sanitizeText(release?.providerArtistId || ''),
        title: sanitizeText(release?.title || ''),
        description: sanitizeText(release?.description || ''),
        cover: release?.cover || '',
        trackCount: Number(release?.trackCount || 0) || 0,
        publishedAt: sanitizeText(release?.publishedAt || ''),
        artist: sanitizeText(release?.artist || ''),
        channelId: sanitizeText(release?.channelId || ''),
        kind: sanitizeText(release?.kind || '')
    };
}

function buildOnlineMusicReleaseSourceList(release = {}) {
    const variants = [];
    if (release && typeof release === 'object') variants.push(createOnlineMusicReleaseSource(release));
    (Array.isArray(release?.sources) ? release.sources : []).forEach((source) => {
        variants.push(createOnlineMusicReleaseSource(source));
    });
    const merged = new Map();
    variants.forEach((source) => {
        const key = buildOnlineMusicReleaseSourceKey(source);
        if (!key) return;
        merged.set(key, {
            ...(merged.get(key) || {}),
            ...source
        });
    });
    return Array.from(merged.values()).sort((left, right) => getOnlineMusicReleaseSourcePriority(right) - getOnlineMusicReleaseSourcePriority(left));
}

function getOnlineMusicReleaseSourceLabels(release = {}) {
    return Array.from(new Set(
        buildOnlineMusicReleaseSourceList(release)
            .map((source) => sanitizeText(source.providerLabel || getOnlineMusicProviderLabel(source.provider)))
            .filter(Boolean)
    ));
}

function getOnlineMusicReleaseSourceSummary(release = {}) {
    return getOnlineMusicReleaseSourceLabels(release).join(' + ');
}

function normalizeOnlineMusicReleaseBucket(value = '') {
    const raw = sanitizeText(value || '');
    if (['albums', 'singlesEps', 'otherReleases'].includes(raw)) return raw;
    if (/single|ep/i.test(raw)) return 'singlesEps';
    if (/other|compilation|live|soundtrack|remix/i.test(raw)) return 'otherReleases';
    return '';
}

function getOnlineMusicReleaseDescriptorText(release = {}) {
    return [
        release?.title,
        release?.description,
        release?.releaseType,
        ...(Array.isArray(release?.releaseSubtypes) ? release.releaseSubtypes : [])
    ].filter(Boolean).join(' ');
}

function classifyOnlineMusicArtistReleaseBucket(release = {}) {
    const explicit = normalizeOnlineMusicReleaseBucket(release?.releaseBucket || '');
    if (explicit === 'singlesEps') return explicit;
    const title = sanitizeText(release?.title || '');
    if (/\bEP\b/i.test(title) || /\s[-\u2013\u2014]\s*single\b/i.test(title)) return 'singlesEps';
    if (release?.kind === 'single-ep') return 'singlesEps';
    const descriptor = getOnlineMusicReleaseDescriptorText(release);
    if (/\b(?:compilation|soundtrack|live|tour|instrumentals?|karaoke|b[\s-]*sides?|outtakes?|sessions?|broadcast|remix(?:es)?|rmx|mix(?:es)?|dj[\s-]*mix|mixtape|interview|spokenword|spoken\s+word)\b/i.test(descriptor)) {
        return 'otherReleases';
    }
    if (/\b(?:greatest\s+hits?|best\s+of|essential|ultimate|collection|anthology|number\s+ones?)\b/i.test(descriptor)) {
        return 'otherReleases';
    }
    if (explicit === 'otherReleases') return explicit;
    if (explicit === 'albums') return explicit;
    return 'albums';
}

function hasOnlineMusicArtistCatalogContent(catalog = {}) {
    return !!(
        (Array.isArray(catalog?.albums) && catalog.albums.length)
        || (Array.isArray(catalog?.singlesEps) && catalog.singlesEps.length)
        || (Array.isArray(catalog?.otherReleases) && catalog.otherReleases.length)
        || (Array.isArray(catalog?.allWork) && catalog.allWork.length)
    );
}

function isReusableOnlineMusicArtistCatalog(catalog = null) {
    if (!catalog || typeof catalog !== 'object') return false;
    if (Number(catalog.schemaVersion || 0) !== ONLINE_MUSIC_ARTIST_CATALOG_SCHEMA_VERSION) return false;
    return hasOnlineMusicArtistCatalogContent(catalog);
}

function getOnlineMusicReleaseTitleVariantPenalty(release = {}) {
    const title = sanitizeText(release?.title || '');
    let penalty = 0;
    if (/\b\d{1,3}(?:st|nd|rd|th)?\s+anniversary\b/i.test(title)) penalty += 120;
    if (/\b(?:deluxe|expanded|super\s+deluxe|anniversary|remaster(?:ed)?|edition)\b/i.test(title)) penalty += 110;
    if (/^(.{2,}?)\s+\d{2,3}$/i.test(title)) penalty += 90;
    if (/\b(?:remix(?:es)?|mix(?:es)?|stripped|suite)\b/i.test(title)) penalty += 80;
    return penalty;
}

function getOnlineMusicReleaseDisplayScore(release = {}) {
    const title = sanitizeText(release?.title || '');
    const normalizedTitle = normalizeOnlineMusicReleaseTitle(title);
    const directTitle = normalizeLyricsLookupText(title);
    const sourcePriority = buildOnlineMusicReleaseSourceList(release).reduce((max, source) => {
        return Math.max(max, getOnlineMusicReleaseSourcePriority(source));
    }, getOnlineMusicReleaseSourcePriority(release));
    let score = sourcePriority;
    if (normalizedTitle && directTitle === normalizedTitle) score += 180;
    if (release?.cover) score += 16;
    if ((Number(release?.trackCount || 0) || 0) > 0) score += 20;
    score -= getOnlineMusicReleaseTitleVariantPenalty(release);
    return score;
}

function choosePreferredOnlineMusicRelease(left = {}, right = {}) {
    return getOnlineMusicReleaseDisplayScore(right) > getOnlineMusicReleaseDisplayScore(left) ? right : left;
}

function getOnlineMusicReleaseRankTrackCount(release = {}) {
    const directCount = Number(release?.trackCount || release?.declaredTrackCount || 0) || 0;
    const normalizedTitle = normalizeOnlineMusicReleaseTitle(release?.title || '');
    const sourceCounts = buildOnlineMusicReleaseSourceList(release)
        .map((source) => ({
            count: Number(source?.trackCount || 0) || 0,
            normalizedTitle: normalizeOnlineMusicReleaseTitle(source?.title || ''),
            directTitle: normalizeLyricsLookupText(source?.title || '')
        }))
        .filter((source) => source.count > 0);
    const exactAlbumCounts = sourceCounts
        .filter((source) => source.normalizedTitle && source.normalizedTitle === normalizedTitle && source.directTitle === normalizedTitle)
        .map((source) => source.count);
    const healthyExactCount = exactAlbumCounts.find((count) => count >= 7 && count <= 24);
    if (healthyExactCount) return healthyExactCount;
    const healthySourceCount = sourceCounts
        .map((source) => source.count)
        .filter((count) => count >= 7 && count <= 24)
        .sort((left, right) => right - left)[0];
    if (healthySourceCount) return healthySourceCount;
    return directCount;
}

function mergeOnlineMusicReleaseRecords(existing = {}, incoming = {}) {
    const preferred = choosePreferredOnlineMusicRelease(existing, incoming);
    const fallback = preferred === existing ? incoming : existing;
    const preferredReleaseBucket = normalizeOnlineMusicReleaseBucket(preferred?.releaseBucket || '');
    const fallbackReleaseBucket = normalizeOnlineMusicReleaseBucket(fallback?.releaseBucket || '');
    const preferredTitleKey = normalizeOnlineMusicReleaseTitle(preferred?.title || '');
    const fallbackTitleKey = normalizeOnlineMusicReleaseTitle(fallback?.title || '');
    const sameReleaseTitle = !!preferredTitleKey && preferredTitleKey === fallbackTitleKey;
    const fallbackPlainTitleKey = normalizeLyricsLookupText(fallback?.title || '');
    const canUseFallbackReleaseMetadata = sameReleaseTitle && !!fallbackPlainTitleKey && fallbackPlainTitleKey === fallbackTitleKey;
    const preferredSubtypes = (Array.isArray(preferred?.releaseSubtypes) ? preferred.releaseSubtypes : [])
        .map((type) => sanitizeText(type || ''))
        .filter(Boolean);
    const fallbackSubtypes = canUseFallbackReleaseMetadata
        ? (Array.isArray(fallback?.releaseSubtypes) ? fallback.releaseSubtypes : [])
            .map((type) => sanitizeText(type || ''))
            .filter(Boolean)
        : [];
    const sources = buildOnlineMusicReleaseSourceList({
        ...preferred,
        sources: [
            ...buildOnlineMusicReleaseSourceList(existing),
            ...buildOnlineMusicReleaseSourceList(incoming)
        ]
    });
    const primarySource = sources[0] || createOnlineMusicReleaseSource(preferred);
    return {
        ...fallback,
        ...preferred,
        playlistId: primarySource.playlistId || preferred.playlistId || fallback.playlistId || '',
        provider: primarySource.provider || inferOnlineMusicReleaseProvider(preferred) || inferOnlineMusicReleaseProvider(fallback),
        providerLabel: primarySource.providerLabel || getOnlineMusicProviderLabel(primarySource.provider || preferred.provider || fallback.provider),
        providerReleaseId: primarySource.providerReleaseId || sanitizeText(preferred?.providerReleaseId || fallback?.providerReleaseId || ''),
        providerArtistId: primarySource.providerArtistId || sanitizeText(preferred?.providerArtistId || fallback?.providerArtistId || ''),
        title: sanitizeText(preferred?.title || fallback?.title || ''),
        description: sanitizeText(preferred?.description || fallback?.description || ''),
        cover: preferred?.cover || fallback?.cover || '',
        trackCount: Math.max(Number(preferred?.trackCount || 0) || 0, Number(fallback?.trackCount || 0) || 0),
        publishedAt: sanitizeText(preferred?.publishedAt || fallback?.publishedAt || ''),
        artist: sanitizeText(preferred?.artist || fallback?.artist || ''),
        channelId: sanitizeText(preferred?.channelId || fallback?.channelId || ''),
        kind: sanitizeText(preferred?.kind || fallback?.kind || ''),
        releaseBucket: preferredReleaseBucket || (canUseFallbackReleaseMetadata ? fallbackReleaseBucket : ''),
        releaseType: sanitizeText(preferred?.releaseType || (canUseFallbackReleaseMetadata ? fallback?.releaseType : '') || ''),
        releaseSubtypes: Array.from(new Set([...preferredSubtypes, ...fallbackSubtypes])),
        sources,
        sourceSummary: getOnlineMusicReleaseSourceSummary({ sources })
    };
}

function getOnlineMusicReleaseBrowseRank(release = {}) {
    const title = sanitizeText(release?.title || '');
    const normalizedTitle = normalizeOnlineMusicReleaseTitle(title);
    const provider = inferOnlineMusicReleaseProvider(release);
    const trackCount = getOnlineMusicReleaseRankTrackCount(release);
    let score = 0;
    if (provider === 'itunes') score += 140;
    else if (provider === 'deezer') score += 130;
    else if (provider === 'musicbrainz') score += 90;
    else if (provider === 'youtube') score -= 80;
    if (release?.kind === 'album') score += 80;
    if (trackCount >= 7 && trackCount <= 24) score += 36;
    else if (trackCount > 40) score -= 34;
    else if (trackCount > 0 && trackCount < 4) score -= 36;
    if (normalizedTitle && normalizedTitle.split(/\s+/).length <= 4) score += 24;
    if (provider === 'deezer' && trackCount === 0 && normalizedTitle && normalizedTitle.split(/\s+/).length <= 4) score += 8;
    if (/\b(?:discography|full\s+album|playlist|karaoke|tribute)\b/i.test(title)) score -= 160;
    if (/\b(?:greatest\s+hits?|best\s+of|number\s+ones?|essential|ultimate|collection|anthology|indispensable)\b/i.test(title)) score -= 88;
    if (/\b(?:remix(?:es)?|mix(?:es)?|stripped|suite|live|soundtrack|motion\s+picture|cirque\s+du\s+soleil|love\s+songs)\b/i.test(title)) score -= 68;
    score -= Math.min(140, getOnlineMusicReleaseTitleVariantPenalty(release));
    return score;
}

function hasOfficialOnlineMusicDiscographySource(release = {}) {
    return buildOnlineMusicReleaseSourceList(release)
        .some((source) => {
            const provider = normalizeOnlineMusicProvider(source?.provider || '');
            if (!['itunes', 'deezer', 'spotify'].includes(provider)) return false;
            return !!sanitizeText(source?.providerReleaseId || source?.playlistId || '');
        });
}

function hasDisallowedOnlineMusicArtistReleaseDescriptor(release = {}) {
    const descriptor = normalizeLyricsLookupText([
        release?.title,
        release?.description,
        release?.releaseType,
        release?.kind,
        release?.releaseBucket,
        ...(Array.isArray(release?.releaseSubtypes) ? release.releaseSubtypes : [])
    ].filter(Boolean).join(' ')).toLowerCase();
    if (!descriptor) return false;
    return /\b(?:karaoke|tribute|cover|covers|remix(?:es)?|rmx|mix(?:es)?|dj[\s-]*mix|mixtape|bootleg|unauthorized|unofficial|fanmade|fan\s+made|instrumentals?|a\s+cappella|acapella|sped\s+up|slowed(?:\s+down)?|reverb|nightcore|8d|mashup|leak|unreleased|interviews?|documentary|podcast|broadcast|playlist|full\s+album|discography|soundtrack|motion\s+picture|compilation|collection|anthology|greatest\s+hits?|best\s+of|essential|ultimate|number\s+ones?|love\s+songs)\b/.test(descriptor);
}

function isPublicOnlineMusicArtistReleaseCandidate(release = {}, artist = {}) {
    if (!release || typeof release !== 'object') return false;
    if (!sanitizeText(release?.title || '')) return false;
    const bucket = classifyOnlineMusicArtistReleaseBucket(release);
    if (bucket === 'otherReleases') return false;
    if (!hasOfficialOnlineMusicDiscographySource(release)) return false;
    if (!hasUsableOnlineMusicReleaseArtwork(release)) return false;
    if (hasDisallowedOnlineMusicArtistReleaseDescriptor(release)) return false;
    if (!isOnlineMusicReleaseOwnedByArtist(release, artist)) return false;
    const trackCount = getOnlineMusicReleaseRankTrackCount(release);
    if (bucket === 'albums' && trackCount > 0 && trackCount < 5) return false;
    if (bucket === 'singlesEps' && trackCount > 12) return false;
    return true;
}

function buildOnlineMusicPublicArtistReleaseGroups(releases = [], artist = {}) {
    const groups = {
        albums: [],
        singlesEps: [],
        otherReleases: []
    };
    mergeUniqueOnlineMusicReleases(releases)
        .forEach((release) => {
            const bucket = classifyOnlineMusicArtistReleaseBucket(release);
            const normalizedRelease = {
                ...release,
                releaseBucket: bucket
            };
            if (!isPublicOnlineMusicArtistReleaseCandidate(normalizedRelease, artist)) return;
            if (bucket === 'singlesEps') groups.singlesEps.push(normalizedRelease);
            else if (bucket === 'albums') groups.albums.push(normalizedRelease);
        });
    return groups;
}

function getOnlineMusicArtistCatalogForPublicView(artist = {}) {
    const safeArtist = artist && typeof artist === 'object' ? artist : {};
    const groups = buildOnlineMusicPublicArtistReleaseGroups([
        ...(Array.isArray(safeArtist.albums) ? safeArtist.albums : []),
        ...(Array.isArray(safeArtist.singlesEps) ? safeArtist.singlesEps : []),
        ...(Array.isArray(safeArtist.otherReleases) ? safeArtist.otherReleases : [])
    ], safeArtist);
    const identity = {
        ...safeArtist,
        ...groups
    };
    return {
        ...safeArtist,
        ...groups,
        allWork: filterOnlineMusicArtistWorkTracksForArtist(safeArtist.allWork || [], identity)
    };
}

function sortOnlineMusicReleases(releases = []) {
    return (Array.isArray(releases) ? releases : []).slice().sort((left, right) => {
        const rankDiff = getOnlineMusicReleaseBrowseRank(right) - getOnlineMusicReleaseBrowseRank(left);
        if (rankDiff !== 0) return rankDiff;
        const leftTs = Date.parse(left?.publishedAt || '') || 0;
        const rightTs = Date.parse(right?.publishedAt || '') || 0;
        if (rightTs !== leftTs) return rightTs - leftTs;
        return sanitizeText(left?.title || '').localeCompare(sanitizeText(right?.title || ''));
    });
}

function normalizeOnlineMusicArtistWorkSortMode(value = '') {
    const raw = sanitizeText(value || '').toLowerCase();
    return ONLINE_MUSIC_ARTIST_WORK_SORT_OPTIONS.some((option) => option.id === raw)
        ? raw
        : 'best';
}

function parseOnlineMusicArtistWorkSortDate(value = '') {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
    const raw = sanitizeText(value || '');
    if (!raw) return 0;
    const yearMatch = raw.match(/^(\d{4})$/);
    if (yearMatch) return Date.UTC(Number(yearMatch[1]), 0, 1);
    const monthMatch = raw.match(/^(\d{4})-(\d{1,2})$/);
    if (monthMatch) return Date.UTC(Number(monthMatch[1]), Math.max(0, Number(monthMatch[2]) - 1), 1);
    const ts = Date.parse(raw);
    return Number.isFinite(ts) ? ts : 0;
}

function getOnlineMusicArtistWorkSortDate(item = {}) {
    return parseOnlineMusicArtistWorkSortDate(item?.publishedAt || item?.releaseDate || item?.addedAt || item?.lastPlayedAt || '');
}

function compareOnlineMusicArtistWorkDates(left = {}, right = {}, direction = 'desc') {
    const leftTs = getOnlineMusicArtistWorkSortDate(left);
    const rightTs = getOnlineMusicArtistWorkSortDate(right);
    if (!leftTs && !rightTs) return 0;
    if (!leftTs) return 1;
    if (!rightTs) return -1;
    return direction === 'asc' ? leftTs - rightTs : rightTs - leftTs;
}

function compareOnlineMusicArtistWorkTitles(left = {}, right = {}, direction = 'asc') {
    const comparison = sanitizeText(left?.title || '').localeCompare(
        sanitizeText(right?.title || ''),
        undefined,
        { sensitivity: 'base', numeric: true }
    );
    return direction === 'desc' ? -comparison : comparison;
}

function compareOnlineMusicArtistWorkStable(left, right) {
    return Number(left?.index || 0) - Number(right?.index || 0);
}

function sortOnlineMusicArtistReleasesForView(releases = [], sortMode = 'best') {
    const mode = normalizeOnlineMusicArtistWorkSortMode(sortMode);
    const list = (Array.isArray(releases) ? releases : []).map((release, index) => ({ release, index }));
    if (mode === 'best') return list.map((entry) => entry.release);
    return list.sort((leftEntry, rightEntry) => {
        const left = leftEntry.release || {};
        const right = rightEntry.release || {};
        let result = 0;
        if (mode === 'date-desc') result = compareOnlineMusicArtistWorkDates(left, right, 'desc');
        else if (mode === 'date-asc') result = compareOnlineMusicArtistWorkDates(left, right, 'asc');
        else if (mode === 'name-asc') result = compareOnlineMusicArtistWorkTitles(left, right, 'asc');
        else if (mode === 'name-desc') result = compareOnlineMusicArtistWorkTitles(left, right, 'desc');
        else if (mode === 'tracks-desc') result = getOnlineMusicReleaseRankTrackCount(right) - getOnlineMusicReleaseRankTrackCount(left);
        else if (mode === 'tracks-asc') result = getOnlineMusicReleaseRankTrackCount(left) - getOnlineMusicReleaseRankTrackCount(right);
        if (result !== 0) return result;
        const titleFallback = compareOnlineMusicArtistWorkTitles(left, right, 'asc');
        return titleFallback || compareOnlineMusicArtistWorkStable(leftEntry, rightEntry);
    }).map((entry) => entry.release);
}

function sortOnlineMusicArtistTracksForView(tracks = [], sortMode = 'best') {
    const mode = normalizeOnlineMusicArtistWorkSortMode(sortMode);
    const list = (Array.isArray(tracks) ? tracks : []).map((track, index) => ({ track, index }));
    if (mode === 'best' || mode === 'tracks-desc' || mode === 'tracks-asc') return list.map((entry) => entry.track);
    return list.sort((leftEntry, rightEntry) => {
        const left = leftEntry.track || {};
        const right = rightEntry.track || {};
        let result = 0;
        if (mode === 'date-desc') result = compareOnlineMusicArtistWorkDates(left, right, 'desc');
        else if (mode === 'date-asc') result = compareOnlineMusicArtistWorkDates(left, right, 'asc');
        else if (mode === 'name-asc') result = compareOnlineMusicArtistWorkTitles(left, right, 'asc');
        else if (mode === 'name-desc') result = compareOnlineMusicArtistWorkTitles(left, right, 'desc');
        return result || compareOnlineMusicArtistWorkStable(leftEntry, rightEntry);
    }).map((entry) => entry.track);
}

function normalizeOnlineMusicArtistWorkSearchQuery(value = '') {
    return normalizeLyricsLookupText(sanitizeText(value || '')).toLowerCase();
}

function getOnlineMusicArtistWorkSearchTokens(query = '') {
    const normalized = normalizeOnlineMusicArtistWorkSearchQuery(query);
    return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

function buildOnlineMusicArtistReleaseSearchText(release = {}) {
    const sourceText = buildOnlineMusicReleaseSourceList(release)
        .flatMap((source) => [
            source?.title,
            source?.artist,
            source?.providerLabel,
            source?.publishedAt,
            source?.kind
        ]);
    return normalizeLyricsLookupText([
        release?.title,
        release?.artist,
        release?.description,
        release?.publishedAt,
        release?.releaseType,
        release?.kind,
        release?.releaseBucket,
        ...(Array.isArray(release?.releaseSubtypes) ? release.releaseSubtypes : []),
        ...sourceText
    ].filter(Boolean).join(' ')).toLowerCase();
}

function buildOnlineMusicArtistTrackSearchText(track = {}) {
    return normalizeLyricsLookupText([
        track?.title,
        track?.lyricsTitle,
        track?.artist,
        track?.lyricsArtist,
        track?.channelTitle,
        track?.publishedAt,
        track?.providerLabel,
        track?.catalogProviderLabel,
        track?.transportProviderLabel
    ].filter(Boolean).join(' ')).toLowerCase();
}

function doesOnlineMusicArtistWorkTextMatchSearch(text = '', query = '') {
    const tokens = getOnlineMusicArtistWorkSearchTokens(query);
    if (!tokens.length) return true;
    const haystack = sanitizeText(text || '').toLowerCase();
    if (!haystack) return false;
    return tokens.every((token) => haystack.includes(token));
}

function filterOnlineMusicArtistReleasesForSearch(releases = [], query = '') {
    const tokens = getOnlineMusicArtistWorkSearchTokens(query);
    if (!tokens.length) return Array.isArray(releases) ? releases.slice() : [];
    return (Array.isArray(releases) ? releases : [])
        .filter((release) => doesOnlineMusicArtistWorkTextMatchSearch(buildOnlineMusicArtistReleaseSearchText(release), query));
}

function filterOnlineMusicArtistTracksForSearch(tracks = [], query = '') {
    const tokens = getOnlineMusicArtistWorkSearchTokens(query);
    if (!tokens.length) return Array.isArray(tracks) ? tracks.slice() : [];
    return (Array.isArray(tracks) ? tracks : [])
        .filter((track) => doesOnlineMusicArtistWorkTextMatchSearch(buildOnlineMusicArtistTrackSearchText(track), query));
}

function normalizeOnlineMusicArtistCreditText(value = '') {
    const clean = sanitizeText(value || '')
        .replace(/\b(?:official\s+artist\s+channel|official\s+channel)\b/gi, ' ')
        .replace(/(?:vevo|topic)$/i, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return normalizeOnlineMusicArtistMatchText(normalizeOnlineMusicCatalogArtistName(clean));
}

function compactOnlineMusicArtistCreditText(value = '') {
    return normalizeOnlineMusicArtistCreditText(value).replace(/[^a-z0-9]+/g, '');
}

function isKnownOnlineMusicArtistCredit(value = '') {
    const normalized = normalizeOnlineMusicArtistCreditText(value);
    const compact = normalized.replace(/[^a-z0-9]+/g, '');
    if (!normalized || compact.length < 2) return false;
    return ![
        'unknown',
        'unknownartist',
        'various',
        'variousartist',
        'variousartists',
        'youtube',
        'youtubemusic',
        'topic',
        'official',
        'officialartistchannel',
        'officialchannel'
    ].includes(compact);
}

function getOnlineMusicArtistCreditParts(value = '') {
    const raw = sanitizeText(value || '');
    const parts = [
        raw,
        ...splitOnlineMusicArtistCredits(raw)
    ];
    return Array.from(new Set(parts
        .map((part) => normalizeOnlineMusicArtistCreditText(part))
        .filter((part) => isKnownOnlineMusicArtistCredit(part))));
}

function doOnlineMusicArtistCreditsMatch(candidate = '', expected = '') {
    const candidateKey = normalizeOnlineMusicArtistCreditText(candidate);
    const expectedKey = normalizeOnlineMusicArtistCreditText(expected);
    if (!isKnownOnlineMusicArtistCredit(candidateKey) || !isKnownOnlineMusicArtistCredit(expectedKey)) return false;
    if (candidateKey === expectedKey) return true;
    const candidateCompact = candidateKey.replace(/[^a-z0-9]+/g, '');
    const expectedCompact = expectedKey.replace(/[^a-z0-9]+/g, '');
    return !!candidateCompact && candidateCompact === expectedCompact;
}

function getOnlineMusicArtistNameSearchKeys(artist = {}) {
    return Array.from(new Set([
        artist?.title,
        artist?.catalogArtistName,
        getOnlineMusicCatalogArtistName(artist),
        normalizeLyricsArtistName(artist?.title || ''),
        normalizeLyricsArtistName(artist?.catalogArtistName || '')
    ]
        .map((value) => normalizeOnlineMusicArtistCreditText(value || ''))
        .filter((value) => isKnownOnlineMusicArtistCredit(value))));
}

function getOnlineMusicTrackArtistCreditCandidates(track = {}) {
    return Array.from(new Set([
        track?.artist,
        track?.lyricsArtist,
        track?.channelTitle,
        track?.candidateArtist,
        track?.candidateChannel
    ]
        .map((value) => sanitizeText(value || ''))
        .filter(Boolean)));
}

function doesOnlineMusicArtistCreditMatchArtist(value = '', artist = {}) {
    const artistKeys = getOnlineMusicArtistNameSearchKeys(artist);
    if (!artistKeys.length || !isKnownOnlineMusicArtistCredit(value)) return false;
    const creditParts = getOnlineMusicArtistCreditParts(value);
    return artistKeys.some((key) => (
        doOnlineMusicArtistCreditsMatch(value, key)
        || creditParts.some((part) => doOnlineMusicArtistCreditsMatch(part, key))
    ));
}

function isOnlineMusicTrackByArtist(track = {}, artist = {}) {
    return getOnlineMusicTrackArtistCreditCandidates(track)
        .some((name) => doesOnlineMusicArtistCreditMatchArtist(name, artist));
}

function getOnlineMusicArtistReleaseIdSet(artist = {}) {
    const releases = [
        ...(Array.isArray(artist?.albums) ? artist.albums : []),
        ...(Array.isArray(artist?.singlesEps) ? artist.singlesEps : []),
        ...(Array.isArray(artist?.otherReleases) ? artist.otherReleases : [])
    ];
    return new Set(releases.flatMap((release) => [
        release?.playlistId,
        release?.providerReleaseId,
        release?.originReleaseId,
        ...(Array.isArray(release?.sources) ? release.sources.flatMap((source) => [source?.playlistId, source?.providerReleaseId]) : [])
    ].map((id) => sanitizeText(id || '')).filter(Boolean)));
}

function getOnlineMusicReleaseIdValues(release = {}) {
    return Array.from(new Set([
        release?.playlistId,
        release?.providerReleaseId,
        release?.originReleaseId,
        ...(Array.isArray(release?.sources) ? release.sources.flatMap((source) => [
            source?.playlistId,
            source?.providerReleaseId,
            source?.originReleaseId
        ]) : [])
    ].map((id) => sanitizeText(id || '')).filter(Boolean)));
}

function getOnlineMusicTrackReleaseIdValues(track = {}) {
    return Array.from(new Set([
        track?.providerReleaseId,
        track?.originReleaseId,
        track?.playlistId,
        track?.albumId,
        track?.collectionId,
        track?.providerAlbumId
    ].map((id) => sanitizeText(id || '')).filter(Boolean)));
}

function isStructuredOnlineMusicDiscographyProvider(provider = '') {
    return ['itunes', 'deezer', 'spotify', 'musicbrainz'].includes(normalizeOnlineMusicProvider(provider || ''));
}

function getOnlineMusicDiscographyProvider(item = {}) {
    const provider = normalizeOnlineMusicProvider(item?.catalogProvider || item?.provider || item?.originProvider || '');
    if (provider) return provider;
    const id = sanitizeText(item?.id || item?.playlistId || '');
    if (/^itunes:/i.test(id)) return 'itunes';
    if (/^deezer:/i.test(id)) return 'deezer';
    if (/^spotify:/i.test(id)) return 'spotify';
    if (/^musicbrainz:/i.test(id)) return 'musicbrainz';
    return '';
}

function isStructuredOnlineMusicDiscographyTrack(track = {}) {
    const provider = getOnlineMusicDiscographyProvider(track);
    const id = sanitizeText(track?.id || '');
    return isStructuredOnlineMusicDiscographyProvider(provider)
        || /^(?:itunes|deezer|spotify|musicbrainz):/i.test(id);
}

function isOnlineMusicReleaseOwnedByArtist(release = {}, artist = {}, releaseIds = null) {
    const ids = releaseIds instanceof Set ? releaseIds : getOnlineMusicArtistReleaseIdSet(artist);
    const releaseIdValues = getOnlineMusicReleaseIdValues(release);
    if (releaseIdValues.some((id) => ids.has(id))) return true;
    const releaseArtists = getOnlineMusicReleaseArtistCandidates(release);
    if (!releaseArtists.length) return false;
    return releaseArtists.some((artistName) => doesOnlineMusicArtistCreditMatchArtist(artistName, artist));
}

function doesOnlineMusicTrackReferenceArtistRelease(track = {}, artist = {}, releaseIds = null) {
    const ids = releaseIds instanceof Set ? releaseIds : getOnlineMusicArtistReleaseIdSet(artist);
    if (!ids.size) return false;
    return getOnlineMusicTrackReleaseIdValues(track).some((id) => ids.has(id));
}

function hasDisallowedOnlineMusicArtistWorkModifier(track = {}) {
    const text = [
        track?.title,
        track?.lyricsTitle,
        Array.isArray(track?.tags) ? track.tags.join(' ') : '',
        track?.description
    ].map((value) => sanitizeText(value || '')).filter(Boolean).join(' ');
    const normalized = normalizeLyricsLookupText(text).toLowerCase();
    if (!normalized) return false;
    return /\b(?:cover|karaoke|reaction|reacts?|teaser|trailer|preview|snippet|challenge|meme|status|tiktok|shorts?|clip|clips|fanmade|fan\s+made|tribute|lesson|tutorial|interviews?|documentary|behind\s+the\s+scenes|bts|instrumental|a\s+cappella|acapella|sped\s+up|slowed(?:\s+down)?|reverb|nightcore|8d|mashup|bootleg|leak|unreleased|full\s+album|playlist|compilation|loop(?:ed)?|extended\s+version)\b/.test(normalized);
}

function isVerifiedOnlineMusicArtistWorkSource(track = {}, artist = {}) {
    if (isStructuredOnlineMusicDiscographyTrack(track)) return true;
    const provider = normalizeOnlineMusicProvider(track?.catalogProvider || track?.provider || '');
    const hasYouTubeTransport = provider === 'youtube' || !!track?.videoId || normalizeOnlineMusicProvider(track?.transportProvider || '') === 'youtube';
    if (!hasYouTubeTransport) return false;
    const sourceText = sanitizeText([
        track?.sourceSurface,
        track?.resolver,
        track?.providerLabel,
        track?.catalogProviderLabel,
        track?.transportProviderLabel
    ].filter(Boolean).join(' '));
    if (/\byoutube-music\b|ytmsearch/i.test(sourceText)) return true;
    const titleText = sanitizeText(`${track?.title || ''} ${track?.lyricsTitle || ''}`);
    const channelText = sanitizeText(`${track?.channelTitle || ''} ${track?.artist || ''}`);
    const channelCandidates = getOnlineMusicTrackArtistCreditCandidates(track);
    const hasOfficialChannel = channelCandidates.some((candidate) => {
        const raw = sanitizeText(candidate || '');
        return /\b(?:topic|official\s+artist\s+channel)\b/i.test(raw)
            || /vevo$/i.test(raw.replace(/[^a-z0-9]+/gi, ''));
    })
        || /\bprovided\s+to\s+youtube\s+by\b/i.test(track?.description || '');
    const hasOfficialTitle = /\bofficial\s+(?:music\s+)?(?:video|audio|visuali[sz]er|lyric\s+video)\b/i.test(titleText);
    return (hasOfficialChannel || hasOfficialTitle) && isOnlineMusicTrackByArtist(track, artist);
}

function isOnlineMusicArtistTrackCandidateEligible(track = {}, artist = {}, options = {}) {
    const clean = track && typeof track === 'object' ? track : null;
    if (!clean || !sanitizeText(clean.title || clean.lyricsTitle || '')) return false;
    if (!hasUsableOnlineMusicCatalogArtwork(clean)) return false;
    if (hasDisallowedOnlineMusicArtistWorkModifier(clean)) return false;
    const releaseIds = options.releaseIds instanceof Set ? options.releaseIds : getOnlineMusicArtistReleaseIdSet(artist);
    const release = options.release && typeof options.release === 'object' ? options.release : null;
    const releaseOwnedByArtist = !!release && isOnlineMusicReleaseOwnedByArtist(release, artist, releaseIds);
    const trackReferencesArtistRelease = doesOnlineMusicTrackReferenceArtistRelease(clean, artist, releaseIds);
    const trackArtistMatches = isOnlineMusicTrackByArtist(clean, artist);
    const structuredTrack = isStructuredOnlineMusicDiscographyTrack(clean);
    const fromKnownArtistRelease = releaseOwnedByArtist || trackReferencesArtistRelease;

    if (!trackArtistMatches && !fromKnownArtistRelease) return false;
    if (!trackArtistMatches && fromKnownArtistRelease) {
        const hasAnyKnownCredit = getOnlineMusicTrackArtistCreditCandidates(clean).some((credit) => isKnownOnlineMusicArtistCredit(credit));
        return !hasAnyKnownCredit && (structuredTrack || releaseOwnedByArtist);
    }
    if (structuredTrack || fromKnownArtistRelease) return true;
    return isVerifiedOnlineMusicArtistWorkSource(clean, artist);
}

function filterOnlineMusicArtistWorkTracksForArtist(tracks = [], artist = {}, options = {}) {
    const releaseIds = options.releaseIds instanceof Set ? options.releaseIds : getOnlineMusicArtistReleaseIdSet(artist);
    return mergeUniqueOnlineMusicTracks(Array.isArray(tracks) ? tracks : [])
        .filter((track) => isOnlineMusicArtistTrackCandidateEligible(track, artist, {
            ...options,
            releaseIds
        }));
}

function getOnlineMusicArtistTrackSearchPool(artist = null) {
    const safeArtist = artist && typeof artist === 'object' ? artist : getOnlineMusicState().browserArtist;
    if (!safeArtist) return [];
    const online = getOnlineMusicState();
    const publicGroups = buildOnlineMusicPublicArtistReleaseGroups([
        ...(Array.isArray(safeArtist.albums) ? safeArtist.albums : []),
        ...(Array.isArray(safeArtist.singlesEps) ? safeArtist.singlesEps : []),
        ...(Array.isArray(safeArtist.otherReleases) ? safeArtist.otherReleases : [])
    ], safeArtist);
    const publicArtist = {
        ...safeArtist,
        ...publicGroups
    };
    const releaseIds = getOnlineMusicArtistReleaseIdSet(publicArtist);
    const releaseCacheTracks = Object.values(getOnlineMusicReleaseTracksCache())
        .flatMap((entry) => {
            const release = entry?.release || {};
            const releaseForFilter = isPublicOnlineMusicArtistReleaseCandidate(release, publicArtist)
                && isOnlineMusicReleaseOwnedByArtist(release, publicArtist, releaseIds)
                ? release
                : null;
            return (Array.isArray(entry?.tracks) ? entry.tracks : [])
                .filter((track) => isOnlineMusicArtistTrackCandidateEligible(track, publicArtist, {
                    release: releaseForFilter,
                    releaseIds
                }));
        });
    const matchingSearchResults = (Array.isArray(online.searchResults) ? online.searchResults : [])
        .filter((track) => isOnlineMusicArtistTrackCandidateEligible(track, publicArtist, { releaseIds }));
    return mergeUniqueOnlineMusicTracks([
        ...filterOnlineMusicArtistWorkTracksForArtist(safeArtist.allWork || [], publicArtist, { releaseIds }),
        ...releaseCacheTracks,
        ...matchingSearchResults
    ]);
}

function renderOnlineMusicArtistWorkSortControl(sortMode = 'best', options = {}) {
    const safeMode = normalizeOnlineMusicArtistWorkSortMode(sortMode);
    const isPrivate = options.variant === 'private';
    const selectClass = isPrivate
        ? 'rounded-xl border border-teal-300/20 bg-slate-950/70 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-teal-50 outline-none transition focus:border-teal-300/60'
        : 'rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-white outline-none transition focus:border-cyan-400/60';
    const labelClass = isPrivate
        ? 'text-[10px] font-black uppercase tracking-[0.16em] text-teal-100/70'
        : 'text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300/80';
    const changeAttr = isPrivate
        ? 'onchange="setPrivateSessionArtistWorkSortMode(this.value)"'
        : 'data-online-music-artist-sort-select="true"';
    const optionsHtml = ONLINE_MUSIC_ARTIST_WORK_SORT_OPTIONS
        .map((option) => `<option value="${escapeHtml(option.id)}" ${safeMode === option.id ? 'selected' : ''}>${escapeHtml(option.label)}</option>`)
        .join('');
    return `
        <label class="flex items-center gap-2">
            <span class="${labelClass}">Sort</span>
            <select ${changeAttr} class="${selectClass}" aria-label="Sort artist work">
                ${optionsHtml}
            </select>
        </label>
    `;
}

function mergeUniqueOnlineMusicTracks(tracks = []) {
    const helper = window.NexPlayOnlineMusicHelpers?.mergeUniqueOnlineMusicTracks;
    if (typeof helper === 'function') {
        return helper(tracks).map((track) => sanitizeStoredOnlineMusicTrack(track)).filter(Boolean);
    }
    const seen = new Set();
    return (Array.isArray(tracks) ? tracks : [])
        .filter((track) => {
            const key = sanitizeText(track?.id || track?.videoId || '');
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((left, right) => {
            const leftTs = Date.parse(left?.publishedAt || '') || Number(left?.addedAt || 0) || 0;
            const rightTs = Date.parse(right?.publishedAt || '') || Number(right?.addedAt || 0) || 0;
            return rightTs - leftTs;
        })
        .map((track) => sanitizeStoredOnlineMusicTrack(track))
        .filter(Boolean);
}

function uniqueOnlineMusicTracksInDeclaredOrder(tracks = []) {
    const helper = window.NexPlayOnlineMusicHelpers?.uniqueOnlineMusicTracksInDeclaredOrder;
    if (typeof helper === 'function') {
        return helper(tracks).map((track) => sanitizeStoredOnlineMusicTrack(track)).filter(Boolean);
    }
    const seen = new Set();
    return (Array.isArray(tracks) ? tracks : [])
        .filter((track) => {
            const key = sanitizeText(track?.id || track?.videoId || '');
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map((track) => sanitizeStoredOnlineMusicTrack(track))
        .filter(Boolean);
}

function classifyOnlineMusicRelease(playlist) {
    const helper = window.NexPlayOnlineMusicHelpers?.classifyOnlineMusicRelease;
    const input = {
        title: sanitizeText(playlist?.title || ''),
        description: sanitizeText(playlist?.description || ''),
        itemCount: Number(playlist?.trackCount || 0)
    };
    if (typeof helper === 'function') {
        return helper(input);
    }
    if (!input.title) return { include: false, kind: '' };
    if (input.itemCount <= 0) return { include: false, kind: '' };
    return { include: true, kind: input.itemCount >= 7 ? 'album' : 'single-ep' };
}

function scoreOnlineMusicTrackCandidate(options = {}) {
    const helper = window.NexPlayOnlineMusicHelpers?.scoreOnlineMusicTrackCandidate;
    if (typeof helper === 'function') {
        return Number(helper(options)) || 0;
    }
    return 0;
}

function shouldUseOnlineMusicYouTubeDiscovery() {
    const prefs = getAppSettings().onlineMusic || {};
    const apiKey = getConfiguredOnlineMusicApiKey();
    if (!prefs.preferYoutubeDiscovery) return false;
    if (!apiKey) return false;
    return !isOnlineMusicYouTubeDiscoveryBlocked();
}

function normalizeOnlineMusicSearchMergeTitle(value = '') {
    const raw = sanitizeText(value || '')
        .replace(/\s*[\(\[][^\)\]]*\b(?:remaster(?:ed)?|album\s+version|single\s+version|radio\s+edit|deluxe\s+edition)\b[^\)\]]*[\)\]]\s*/gi, ' ')
        .replace(/\s+(?:-|--|\u2013|\u2014)\s+(?:\d{4}\s+)?(?:remaster(?:ed)?|album\s+version|single\s+version|radio\s+edit)\b.*$/i, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return normalizeLyricsLookupText(raw).toLowerCase();
}

function getOnlineMusicSearchVariantKey(track = {}) {
    const provider = normalizeOnlineMusicProvider(track?.catalogProvider || track?.provider || track?.transportProvider || '');
    const rawTitle = sanitizeText(track?.title || '');
    const rawTags = Array.isArray(track?.tags) ? track.tags.join(' ') : '';
    const markerText = `${rawTitle} ${rawTags}`;
    const artistKey = normalizeLyricsLookupText(normalizeLyricsArtistName(
        track?.lyricsArtist || track?.artist || track?.channelTitle || ''
    )).toLowerCase();
    if (/\bcover\b/i.test(markerText)) return `cover:${artistKey || sanitizeText(track?.videoId || track?.id || '')}`;
    if (provider === 'youtube' && /\b(?:lyrics?|lyric\s+video|with\s+lyrics)\b/i.test(markerText)) return 'lyrics-video';
    if (provider === 'youtube' && /\bofficial\s+(?:music\s+)?video\b|\bmusic\s+video\b/i.test(markerText)) return 'official-video';
    return '';
}

function getOnlineMusicSearchMergeKey(track = {}) {
    const title = normalizeOnlineMusicSearchMergeTitle(track?.lyricsTitle || track?.title || '');
    const artist = normalizeLyricsLookupText(normalizeLyricsArtistName(track?.lyricsArtist || track?.artist || track?.channelTitle || '')).toLowerCase();
    const variant = getOnlineMusicSearchVariantKey(track);
    if (title && artist) return `${artist}::${title}${variant ? `::${variant}` : ''}`;
    return sanitizeText(track?.id || track?.videoId || '');
}

const DESKTOP_ONLINE_MUSIC_SEARCH_STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'by', 'for', 'from', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'the', 'this', 'to', 'with'
]);

function normalizeDesktopOnlineMusicSearchText(value = '') {
    return normalizeLyricsLookupText(sanitizeText(value || '')).toLowerCase();
}

function splitDesktopOnlineMusicSearchTokens(value = '') {
    return normalizeDesktopOnlineMusicSearchText(value).split(/\s+/).filter(Boolean);
}

function getBoundedDesktopOnlineMusicEditDistance(leftValue = '', rightValue = '', maxDistance = 3) {
    const left = String(leftValue || '');
    const right = String(rightValue || '');
    const limit = Math.max(0, Number(maxDistance) || 0);
    if (left === right) return 0;
    if (!left || !right) return Math.max(left.length, right.length);
    if (Math.abs(left.length - right.length) > limit) return limit + 1;
    let previousPrevious = null;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        const current = [leftIndex];
        let rowMinimum = current[0];
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
            let distance = Math.min(
                previous[rightIndex] + 1,
                current[rightIndex - 1] + 1,
                previous[rightIndex - 1] + substitutionCost
            );
            if (previousPrevious
                && leftIndex > 1
                && rightIndex > 1
                && left[leftIndex - 1] === right[rightIndex - 2]
                && left[leftIndex - 2] === right[rightIndex - 1]) {
                distance = Math.min(distance, previousPrevious[rightIndex - 2] + 1);
            }
            current[rightIndex] = distance;
            rowMinimum = Math.min(rowMinimum, distance);
        }
        if (rowMinimum > limit) return limit + 1;
        previousPrevious = previous;
        previous = current;
    }
    return previous[right.length];
}

function scoreDesktopOnlineMusicFuzzyTokenMatch(leftToken = '', rightToken = '') {
    const left = String(leftToken || '');
    const right = String(rightToken || '');
    if (!left || !right) return 0;
    if (left === right) return 1;
    const longestLength = Math.max(left.length, right.length);
    if (longestLength < 4) return 0;
    const allowedDistance = longestLength >= 9 ? 3 : (longestLength >= 5 ? 2 : 1);
    const distance = getBoundedDesktopOnlineMusicEditDistance(left, right, allowedDistance);
    if (distance > allowedDistance) return 0;
    const similarity = 1 - (distance / longestLength);
    return similarity >= 0.6 ? similarity : 0;
}

function getDesktopOnlineMusicFuzzyTokenCoverage(targetTokens = [], candidateTokens = []) {
    const availableIndexes = new Set(candidateTokens.map((_, index) => index));
    let matchedWeight = 0;
    const unmatched = [];
    targetTokens.forEach((targetToken) => {
        let bestIndex = -1;
        let bestSimilarity = 0;
        availableIndexes.forEach((candidateIndex) => {
            const similarity = scoreDesktopOnlineMusicFuzzyTokenMatch(targetToken, candidateTokens[candidateIndex]);
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestIndex = candidateIndex;
            }
        });
        if (bestIndex >= 0 && bestSimilarity >= 0.6) {
            availableIndexes.delete(bestIndex);
            matchedWeight += bestSimilarity;
        } else {
            unmatched.push(targetToken);
        }
    });
    return {
        coverage: targetTokens.length ? matchedWeight / targetTokens.length : 0,
        unmatched
    };
}

function scoreOnlineMusicFuzzyTextMatch(left = '', right = '') {
    const normalizedLeft = normalizeDesktopOnlineMusicSearchText(left);
    const normalizedRight = normalizeDesktopOnlineMusicSearchText(right);
    if (!normalizedLeft || !normalizedRight) return 0;
    if (normalizedLeft === normalizedRight) return 140;
    if (normalizedRight.includes(normalizedLeft)) return 112;
    if (normalizedLeft.includes(normalizedRight)) return 88;
    const leftTokens = splitDesktopOnlineMusicSearchTokens(normalizedLeft);
    const rightTokens = splitDesktopOnlineMusicSearchTokens(normalizedRight);
    const significantLeftTokens = leftTokens.filter((token) => token.length > 1 && !DESKTOP_ONLINE_MUSIC_SEARCH_STOP_WORDS.has(token));
    if (!leftTokens.length || !rightTokens.length || !significantLeftTokens.length) return 0;
    const fuzzyMatch = getDesktopOnlineMusicFuzzyTokenCoverage(leftTokens, rightTokens);
    const significantMatch = getDesktopOnlineMusicFuzzyTokenCoverage(significantLeftTokens, rightTokens);
    const phraseLimit = Math.max(1, Math.min(4, Math.ceil(Math.max(normalizedLeft.length, normalizedRight.length) * 0.24)));
    const phraseDistance = leftTokens.length === rightTokens.length
        ? getBoundedDesktopOnlineMusicEditDistance(normalizedLeft, normalizedRight, phraseLimit)
        : phraseLimit + 1;
    const phraseSimilarity = phraseDistance <= phraseLimit
        ? 1 - (phraseDistance / Math.max(normalizedLeft.length, normalizedRight.length))
        : 0;
    if (fuzzyMatch.coverage < 0.35 && phraseSimilarity < 0.72) return 0;
    let score = Math.round(fuzzyMatch.coverage * 76);
    if (!significantMatch.unmatched.length) score += 18;
    if (significantMatch.unmatched.length >= Math.ceil(significantLeftTokens.length / 2)) score -= 42;
    if (phraseSimilarity >= 0.72) score = Math.max(score, Math.round(78 + (phraseSimilarity * 28)));
    if (leftTokens.length > 1 && significantLeftTokens.length <= 1 && !normalizedRight.includes(normalizedLeft)) {
        score = Math.min(score, 24);
    }
    return Math.max(0, Math.min(120, score));
}

function stripDesktopOnlineMusicSearchTitlePresentation(value = '') {
    return normalizeDesktopOnlineMusicSearchText(String(value || '')
        .replace(/\s*[([{][^\])}]{0,100}\b(?:official|audio|video|lyrics?|lyric\s+video|visuali[sz]er|cover)\b[^\])}]{0,100}[\])}]\s*/gi, ' ')
        .replace(/\b(?:official\s+(?:music\s+)?video|official\s+audio|lyric\s+video|with\s+lyrics)\b/gi, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

function getDesktopOnlineMusicSearchTitleCandidates(track = {}) {
    const rawTitles = [track?.lyricsTitle, track?.title].map((value) => sanitizeText(value || '')).filter(Boolean);
    const splitTitles = rawTitles.map((value) => (
        value.match(/^([^|]{1,120}?)\s+(?:-|--|\u2013|\u2014|\|)\s+(.{1,220})$/)?.[2] || ''
    )).filter(Boolean);
    return Array.from(new Set([...rawTitles, ...splitTitles]
        .map((value) => stripDesktopOnlineMusicSearchTitlePresentation(value))
        .filter(Boolean)));
}

function getDesktopOnlineMusicSearchArtistCandidates(track = {}) {
    const splitArtist = sanitizeText(track?.title || '').match(/^([^|]{1,120}?)\s+(?:-|--|\u2013|\u2014|\|)\s+(.{1,220})$/)?.[1] || '';
    return Array.from(new Set([
        track?.lyricsArtist,
        track?.artist,
        track?.channelTitle,
        splitArtist
    ].map((value) => normalizeDesktopOnlineMusicSearchText(normalizeLyricsArtistName(value || ''))).filter(Boolean)));
}

function getMaxDesktopOnlineMusicFuzzyScore(target = '', candidates = []) {
    return (Array.isArray(candidates) ? candidates : []).reduce(
        (best, candidate) => Math.max(best, scoreOnlineMusicFuzzyTextMatch(target, candidate)),
        0
    );
}

function hasMatchingDesktopOnlineMusicTokenCount(target = '', candidates = []) {
    const targetCount = splitDesktopOnlineMusicSearchTokens(target).length;
    return targetCount > 0 && (Array.isArray(candidates) ? candidates : []).some(
        (candidate) => splitDesktopOnlineMusicSearchTokens(candidate).length === targetCount
    );
}

function hasDesktopOnlineMusicPredictivePrefixMatch(target = '', candidates = []) {
    const normalizedTarget = normalizeDesktopOnlineMusicSearchText(target);
    const targetTokens = splitDesktopOnlineMusicSearchTokens(normalizedTarget);
    if (normalizedTarget.length < 2 || !targetTokens.length) return false;
    return (Array.isArray(candidates) ? candidates : []).some((candidate) => {
        const normalizedCandidate = normalizeDesktopOnlineMusicSearchText(candidate);
        const candidateTokens = splitDesktopOnlineMusicSearchTokens(normalizedCandidate);
        if (!normalizedCandidate || targetTokens.length > candidateTokens.length) return false;
        if (normalizedCandidate.startsWith(normalizedTarget)) return true;
        if (targetTokens.length !== 1) return false;
        return candidateTokens.some((candidateToken) => candidateToken.startsWith(targetTokens[0]));
    });
}

function scoreOnlineMusicSearchResultForQuery(track = {}, query = '') {
    const safeQuery = sanitizeText(query || '');
    const helper = window.NexPlayOnlineMusicHelpers?.scoreOnlineMusicSearchResultForQuery;
    const helperScore = typeof helper === 'function' ? (Number(helper({ ...track, query: safeQuery })) || 0) : 0;
    const normalizedQuery = normalizeDesktopOnlineMusicSearchText(safeQuery);
    if (!normalizedQuery) return helperScore;
    const titleCandidates = getDesktopOnlineMusicSearchTitleCandidates(track);
    const artistCandidates = getDesktopOnlineMusicSearchArtistCandidates(track);
    const byMatch = safeQuery.match(/^(.{1,180}?)\s+\bby\b\s+(.{1,120})$/i);
    const dashMatch = safeQuery.match(/^(.{1,140}?)\s+(?:-|--|\u2013|\u2014|\|)\s+(.{1,180})$/);
    if (byMatch || dashMatch) {
        const identityPairs = byMatch
            ? [{ title: byMatch[1], artist: byMatch[2] }]
            : [
                { title: dashMatch[1], artist: dashMatch[2] },
                { title: dashMatch[2], artist: dashMatch[1] }
            ];
        const coherentFuzzyIdentity = identityPairs.some((pair) => (
            getMaxDesktopOnlineMusicFuzzyScore(pair.title, titleCandidates) >= 88
            && getMaxDesktopOnlineMusicFuzzyScore(pair.artist, artistCandidates) >= 88
        ));
        return coherentFuzzyIdentity ? Math.max(helperScore, 240) : helperScore;
    }
    const titleScore = getMaxDesktopOnlineMusicFuzzyScore(normalizedQuery, titleCandidates);
    const artistScore = getMaxDesktopOnlineMusicFuzzyScore(normalizedQuery, artistCandidates);
    const titlePredictivePrefix = hasDesktopOnlineMusicPredictivePrefixMatch(normalizedQuery, titleCandidates);
    const artistPredictivePrefix = hasDesktopOnlineMusicPredictivePrefixMatch(normalizedQuery, artistCandidates);
    let fuzzyScore = 0;
    if (titleScore >= 88 && (hasMatchingDesktopOnlineMusicTokenCount(normalizedQuery, titleCandidates) || titlePredictivePrefix)) {
        fuzzyScore = Math.max(fuzzyScore, 120 + titleScore);
    }
    if (artistScore >= 88 && (hasMatchingDesktopOnlineMusicTokenCount(normalizedQuery, artistCandidates) || artistPredictivePrefix)) {
        fuzzyScore = Math.max(fuzzyScore, 60 + artistScore);
    }
    return Math.max(helperScore, fuzzyScore);
}

function isLikelyShortFormOnlineMusicResult(track = {}) {
    const helper = window.NexPlayOnlineMusicHelpers?.isLikelyShortFormOnlineMusicResult;
    if (typeof helper === 'function') return !!helper(track);
    const rawText = [
        track?.title,
        track?.description,
        Array.isArray(track?.tags) ? track.tags.join(' ') : '',
        track?.canonicalUrl
    ].map((value) => sanitizeText(value || '')).filter(Boolean).join(' ');
    if (/\/shorts\//i.test(rawText) || /(?:^|\s)#shorts?\b/i.test(rawText)) return true;
    return Number(track?.duration || 0) > 0 && Number(track?.duration || 0) <= 45;
}

function classifyOnlineMusicSearchResultEligibility(track = {}, options = {}) {
    const query = sanitizeText(typeof options === 'string' ? options : (options.query || options.searchQuery || ''));
    const helper = window.NexPlayOnlineMusicHelpers?.classifyOnlineMusicSearchResultEligibility;
    const helperResult = typeof helper === 'function'
        ? (helper({ ...track, query }) || { include: false, kind: '', score: 0, reason: 'unknown' })
        : null;
    const provider = normalizeOnlineMusicProvider(track?.catalogProvider || track?.provider || '');
    const isStructuredCatalog = ['itunes', 'deezer', 'spotify'].includes(provider);
    const isYouTube = !isStructuredCatalog && (provider === 'youtube' || !!track?.videoId);
    if (isStructuredCatalog) {
        const helperRejectedOnlyForIdentityTypo = helperResult?.include === false
            && /^explicit-(?:title|artist)-mismatch$/.test(sanitizeText(helperResult?.reason || ''));
        if (helperRejectedOnlyForIdentityTypo) {
            const titleCandidates = getDesktopOnlineMusicSearchTitleCandidates(track);
            const artistCandidates = getDesktopOnlineMusicSearchArtistCandidates(track);
            const byMatch = query.match(/^(.{1,180}?)\s+\bby\b\s+(.{1,120})$/i);
            const dashMatch = query.match(/^(.{1,140}?)\s+(?:-|--|\u2013|\u2014|\|)\s+(.{1,180})$/);
            const identityPairs = byMatch
                ? [{ title: byMatch[1], artist: byMatch[2] }]
                : (dashMatch ? [
                    { title: dashMatch[1], artist: dashMatch[2] },
                    { title: dashMatch[2], artist: dashMatch[1] }
                ] : []);
            const coherentFuzzyIdentity = identityPairs.some((pair) => (
                getMaxDesktopOnlineMusicFuzzyScore(pair.title, titleCandidates) >= 88
                && getMaxDesktopOnlineMusicFuzzyScore(pair.artist, artistCandidates) >= 88
            ));
            if (coherentFuzzyIdentity) {
                return { include: true, kind: 'catalog', score: 220, reason: 'fuzzy-structured-catalog' };
            }
        }
        return helperResult || { include: true, kind: 'catalog', score: 200, reason: 'structured-catalog' };
    }
    if (!isYouTube) return helperResult || { include: true, kind: 'catalog', score: 200, reason: 'structured-catalog' };
    if (!query || isLikelyShortFormOnlineMusicResult(track)) {
        return helperResult || { include: !query, kind: !query ? 'youtube-unscoped' : '', score: 0, reason: '' };
    }
    const titleText = sanitizeText(`${track?.title || ''} ${track?.lyricsTitle || ''}`);
    const channelText = sanitizeText(`${track?.channelTitle || ''} ${track?.artist || ''}`);
    const descriptionText = sanitizeText(track?.description || '');
    const markerText = `${titleText} ${(Array.isArray(track?.tags) ? track.tags : []).join(' ')}`;
    const isLyricsVideo = /\b(?:lyrics?|lyric\s+video)\b/i.test(titleText);
    const isCover = /(?:[([{][^\])}]{0,80}\bcover\b[^\])}]{0,80}[\])}]|\b(?:acoustic|piano|rock|metal|vocal|guitar)\s+cover\b|\bcover\s+(?:version|song|of|by)\b)/i.test(markerText);
    const isOfficialVideo = /\bofficial\s+(?:music\s+)?video\b|\bmusic\s+video\b/i.test(titleText);
    const isYouTubeMusicSource = /youtube[\s-]*music|ytmsearch/i.test(`${track?.sourceSurface || ''} ${track?.resolver || ''} ${track?.catalogProviderLabel || ''}`);
    const isOfficialSource = /\b(?:topic|vevo|official\s+artist\s+channel)\b/i.test(channelText)
        || /\bprovided\s+to\s+youtube\s+by\b/i.test(descriptionText)
        || /\b(?:official\s+(?:music\s+)?video|official\s+audio|music\s+video)\b/i.test(titleText);
    const unrequestedHardModifier = /\b(?:karaoke|reaction|reacts?|teaser|trailer|preview|snippet|challenge|meme|status|tiktok|shorts?|fanmade|fan\s+made|lesson|tutorial|nightcore|mashup|bootleg|unreleased|full\s+album|playlist|compilation)\b/i.test(markerText)
        || (/\b(?:remix|live|instrumental|acapella|sped\s+up|slowed|reverb)\b/i.test(markerText)
            && !/\b(?:remix|live|instrumental|acapella|sped\s+up|slowed|reverb)\b/i.test(query));
    if (unrequestedHardModifier) {
        return helperResult || { include: false, kind: '', score: -900, reason: 'non-song-modifier' };
    }
    const titleCandidates = getDesktopOnlineMusicSearchTitleCandidates(track);
    const artistCandidates = getDesktopOnlineMusicSearchArtistCandidates(track);
    const normalizedQuery = normalizeDesktopOnlineMusicSearchText(query);
    const byMatch = query.match(/^(.{1,180}?)\s+\bby\b\s+(.{1,120})$/i);
    let titleRelevant = false;
    let artistRelevant = false;
    if (byMatch) {
        titleRelevant = getMaxDesktopOnlineMusicFuzzyScore(byMatch[1], titleCandidates) >= 88;
        artistRelevant = getMaxDesktopOnlineMusicFuzzyScore(byMatch[2], artistCandidates) >= 88;
        if (!titleRelevant || !artistRelevant) return helperResult || { include: false, kind: '', score: -840, reason: 'explicit-identity-mismatch' };
    } else {
        titleRelevant = getMaxDesktopOnlineMusicFuzzyScore(normalizedQuery, titleCandidates) >= 88
            && hasMatchingDesktopOnlineMusicTokenCount(normalizedQuery, titleCandidates);
        artistRelevant = getMaxDesktopOnlineMusicFuzzyScore(normalizedQuery, artistCandidates) >= 88
            && hasMatchingDesktopOnlineMusicTokenCount(normalizedQuery, artistCandidates);
    }
    if (isCover && titleRelevant) {
        const normalizedChannel = normalizeDesktopOnlineMusicSearchText(track?.channelTitle || track?.artist || '');
        const duration = Math.max(0, Number(track?.duration || 0) || 0);
        const credibleChannel = !!normalizedChannel
            && !/^(?:youtube|music|unknown(?: artist)?|various artists?|lyrics?)$/.test(normalizedChannel);
        if (credibleChannel && !(duration > 0 && duration < 75)) {
            return { include: true, kind: 'cover', score: 184, reason: 'relevant-cover' };
        }
    }
    if (isLyricsVideo && titleRelevant) {
        return { include: true, kind: 'lyrics-video', score: 282, reason: 'strong-lyrics-video' };
    }
    if (isOfficialVideo && (titleRelevant || artistRelevant)) {
        return { include: true, kind: 'official-video', score: 302, reason: 'official-music-video' };
    }
    if (isYouTubeMusicSource && (titleRelevant || artistRelevant)) {
        return { include: true, kind: 'youtube-music-result', score: 260, reason: 'youtube-music-source' };
    }
    if (isOfficialSource && (titleRelevant || artistRelevant)) {
        return { include: true, kind: 'official-upload', score: 270, reason: 'official-source' };
    }
    return helperResult || { include: false, kind: '', score: -500, reason: 'unverified-youtube-source' };
}

function isLikelyTitleOnlyOnlineMusicSearchResult(track = {}, options = {}) {
    const query = sanitizeText(typeof options === 'string' ? options : (options.query || options.searchQuery || ''));
    const normalizedQuery = normalizeDesktopOnlineMusicSearchText(query);
    if (!normalizedQuery || /\s+\bby\b\s+/i.test(query) || /\s(?:-|--|\u2013|\u2014|\|)\s/.test(query)) return false;
    const titleCandidates = getDesktopOnlineMusicSearchTitleCandidates(track);
    const isIncompletePrefix = titleCandidates.some((title) => {
        const normalizedTitle = normalizeDesktopOnlineMusicSearchText(title);
        return normalizedTitle !== normalizedQuery && normalizedTitle.startsWith(normalizedQuery);
    });
    if (isIncompletePrefix) return false;
    const helper = window.NexPlayOnlineMusicHelpers?.isLikelyTitleOnlyOnlineMusicSearchResult;
    if (typeof helper === 'function' && helper({ ...track, query })) return true;
    return titleCandidates.some((title) => (
        splitDesktopOnlineMusicSearchTokens(title).length === splitDesktopOnlineMusicSearchTokens(normalizedQuery).length
        && scoreOnlineMusicFuzzyTextMatch(normalizedQuery, title) >= 88
    ));
}

function getOnlineMusicSearchResultLibraryRankScore(track = {}) {
    const trackId = normalizeOnlineMusicTrackId(track?.id || track?.trackId || track?.videoId || '');
    let score = 0;
    if (!trackId) return score;
    const online = getOnlineMusicState();
    const activeTrackId = normalizeOnlineMusicTrackId(online.currentTrackId || state.currentTrackId || '');
    if (activeTrackId && trackId === activeTrackId) score += 1400;
    if (getSavedOnlineTrack(trackId)) score += 780;
    if (track?.isFavorite) score += 160;
    score += Math.min(180, Math.max(0, Number(track?.playCount || 0) || 0) * 24);
    if (Number(track?.lastPlayedAt || 0) > 0) score += 90;
    return score;
}

function getOnlineMusicSearchResultProvider(track = {}) {
    return normalizeOnlineMusicProvider(track?.catalogProvider || track?.provider || track?.transportProvider || '');
}

function getOnlineMusicSearchResultCatalogSources(track = {}) {
    const catalogProviders = new Set(['itunes', 'deezer', 'spotify']);
    return Array.from(new Set([
        ...(Array.isArray(track?.searchCatalogSources) ? track.searchCatalogSources : []),
        getOnlineMusicSearchResultProvider(track)
    ].map((source) => normalizeOnlineMusicProvider(source || '')).filter((source) => catalogProviders.has(source))));
}

function getOnlineMusicSearchResultConsensus(track = {}) {
    return Math.max(
        getOnlineMusicSearchResultCatalogSources(track).length,
        Math.max(0, Number(track?.searchCatalogConsensus || 0) || 0)
    );
}

function isGenericYouTubeMusicSearchIdentity(track = {}) {
    if (getOnlineMusicSearchResultProvider(track) !== 'youtube') return false;
    const sourceText = sanitizeText(`${track?.sourceSurface || ''} ${track?.resolver || ''} ${track?.catalogProviderLabel || ''}`);
    if (!/youtube[\s-]*music|ytmsearch/i.test(sourceText)) return false;
    const artist = normalizeLyricsLookupText(track?.lyricsArtist || track?.artist || track?.channelTitle || '').toLowerCase();
    return !artist || /^(?:youtube(?: music)?|music|unknown(?: artist)?|various artists?)$/.test(artist);
}

function getOnlineMusicSearchResultAuthorityScore(track = {}) {
    const provider = getOnlineMusicSearchResultProvider(track);
    const rank = Math.max(0, Number(track?.providerSearchRank || 0) || 0);
    const popularity = Math.max(0, Number(track?.providerPopularity || 0) || 0);
    const consensus = getOnlineMusicSearchResultConsensus(track);
    let score = 0;
    if (provider === 'itunes') score += 150;
    else if (provider === 'deezer') score += 135;
    else if (provider === 'spotify') score += 130;
    else if (provider === 'youtube') score += 80;
    if (rank > 0) score += Math.max(0, 280 - ((rank - 1) * 22));
    if (popularity > 0) score += Math.min(130, Math.round(Math.log10(popularity + 1) * 22));
    if (consensus > 1) score += Math.min(620, (consensus - 1) * 270);
    if (isGenericYouTubeMusicSearchIdentity(track)) score -= 360;
    return score;
}

function isSpecificOnlineMusicSearchQuery(query = '') {
    const safeQuery = sanitizeText(query || '');
    const normalized = normalizeLyricsLookupText(safeQuery);
    const tokenCount = normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;
    return /["]/.test(safeQuery) || /\sby\s/i.test(safeQuery) || /\s(?:-|--|\u2013|\u2014|\|)\s/.test(safeQuery) || tokenCount >= 3;
}

function shouldIncludeOnlineMusicSearchResult(track = {}, options = {}) {
    if (isLikelyShortFormOnlineMusicResult(track)) return false;
    const query = sanitizeText(typeof options === 'string' ? options : (options.query || options.searchQuery || ''));
    if (!query) return true;
    const provider = normalizeOnlineMusicProvider(track?.catalogProvider || track?.provider || '');
    const isStructuredCatalog = ['itunes', 'deezer', 'spotify'].includes(provider);
    const isYouTube = !isStructuredCatalog && (provider === 'youtube' || !!track?.videoId);
    const threshold = isYouTube
        ? (isSpecificOnlineMusicSearchQuery(query) ? 78 : 42)
        : (isSpecificOnlineMusicSearchQuery(query) ? 78 : 30);
    const relevanceScore = scoreOnlineMusicSearchResultForQuery(track, query);
    if (relevanceScore < threshold) return false;
    const eligibility = classifyOnlineMusicSearchResultEligibility(track, { query });
    return eligibility?.include !== false;
}

function scoreOnlineMusicSearchResult(track = {}, options = {}) {
    const query = sanitizeText(typeof options === 'string' ? options : (options.query || options.searchQuery || ''));
    let score = 0;
    const relevanceScore = query ? scoreOnlineMusicSearchResultForQuery(track, query) : 0;
    const titleOnlyExactMatch = query ? isLikelyTitleOnlyOnlineMusicSearchResult(track, { query }) : false;
    if (query) score += relevanceScore * 4;
    const eligibility = query ? classifyOnlineMusicSearchResultEligibility(track, { query }) : { include: true, score: 0, kind: '' };
    if (query && eligibility?.include === false) score -= 1000;
    else score += Math.max(0, Number(eligibility?.score || 0));
    if (query) score += getOnlineMusicSearchResultLibraryRankScore(track);
    if (track?.videoId) score += 70;
    if (options?.preferPlayableTransport) {
        score += track?.videoId ? 55 : 0;
    }
    const provider = normalizeOnlineMusicProvider(track?.catalogProvider || track?.provider || '');
    if (provider === 'itunes') score += 140;
    else if (provider === 'deezer') score += 120;
    else if (provider === 'youtube') score += 100;
    score += getOnlineMusicSearchResultAuthorityScore(track);
    if (track?.cover) score += 20;
    if (Number(track?.duration || 0) > 0) score += 10;
    if (track?.publishedAt) score += 4;
    const viewCount = Math.max(0, Number(track?.viewCount || 0) || 0);
    if (viewCount > 0 && (!query || shouldIncludeOnlineMusicSearchResult(track, { query }))) {
        score += titleOnlyExactMatch
            ? Math.min(360, Math.round(Math.log10(viewCount + 1) * 42))
            : Math.min(86, Math.round(Math.log10(viewCount + 1) * 12));
    }
    if (isLikelyShortFormOnlineMusicResult(track)) score -= 1000;
    return score;
}

function getOnlineMusicSearchMergeProviderAuthority(track = {}) {
    const provider = getOnlineMusicSearchResultProvider(track);
    if (provider === 'itunes') return 4;
    if (provider === 'deezer') return 3;
    if (provider === 'spotify') return 2;
    if (provider === 'youtube') return 1;
    return 0;
}

function getOnlineMusicSearchMergeStableId(track = {}) {
    return sanitizeText(
        track?.providerTrackId
        || track?.id
        || track?.videoId
        || track?.canonicalUrl
        || `${track?.artist || track?.channelTitle || ''}::${track?.title || ''}`
    ).toLowerCase();
}

function compareOnlineMusicSearchMergeCandidates(left = {}, right = {}, options = {}) {
    const structuredProviders = new Set(['itunes', 'deezer', 'spotify']);
    const leftStructured = structuredProviders.has(getOnlineMusicSearchResultProvider(left));
    const rightStructured = structuredProviders.has(getOnlineMusicSearchResultProvider(right));
    if (leftStructured !== rightStructured) return leftStructured ? 1 : -1;
    const scoreDifference = scoreOnlineMusicSearchResult(left, options) - scoreOnlineMusicSearchResult(right, options);
    if (scoreDifference !== 0) return scoreDifference;
    const authorityDifference = getOnlineMusicSearchMergeProviderAuthority(left)
        - getOnlineMusicSearchMergeProviderAuthority(right);
    if (authorityDifference !== 0) return authorityDifference;
    const leftId = getOnlineMusicSearchMergeStableId(left);
    const rightId = getOnlineMusicSearchMergeStableId(right);
    return rightId.localeCompare(leftId);
}

function mergeOnlineMusicSearchCandidateRecords(existing = {}, incoming = {}, options = {}) {
    const preferIncoming = compareOnlineMusicSearchMergeCandidates(incoming, existing, options) > 0;
    const primary = preferIncoming ? incoming : existing;
    const secondary = preferIncoming ? existing : incoming;
    const transport = primary?.videoId ? primary : (secondary?.videoId ? secondary : null);
    const catalogSources = Array.from(new Set([
        ...getOnlineMusicSearchResultCatalogSources(existing),
        ...getOnlineMusicSearchResultCatalogSources(incoming)
    ])).sort((left, right) => {
        const authorityDifference = getOnlineMusicSearchMergeProviderAuthority({ provider: right })
            - getOnlineMusicSearchMergeProviderAuthority({ provider: left });
        return authorityDifference || left.localeCompare(right);
    }).slice(0, 6);
    const ranks = [existing?.providerSearchRank, incoming?.providerSearchRank]
        .map((rank) => Math.max(0, Number(rank || 0) || 0))
        .filter(Boolean);
    return sanitizeStoredOnlineMusicTrack({
        ...secondary,
        ...primary,
        videoId: sanitizeText(transport?.videoId || ''),
        channelTitle: sanitizeText(primary?.channelTitle || secondary?.channelTitle || ''),
        channelId: sanitizeText(transport?.channelId || primary?.channelId || secondary?.channelId || ''),
        canonicalUrl: sanitizeText(transport?.canonicalUrl || primary?.canonicalUrl || secondary?.canonicalUrl || ''),
        transportProvider: transport?.videoId ? 'youtube' : sanitizeText(primary?.transportProvider || ''),
        transportProviderLabel: transport?.videoId ? 'YouTube' : sanitizeText(primary?.transportProviderLabel || ''),
        resolver: sanitizeText(transport?.resolver || primary?.resolver || secondary?.resolver || ''),
        pendingPlaybackResolution: !transport?.videoId,
        providerSearchRank: ranks.length ? Math.min(...ranks) : 0,
        providerPopularity: Math.max(Number(existing?.providerPopularity || 0) || 0, Number(incoming?.providerPopularity || 0) || 0),
        searchCatalogSources: catalogSources,
        searchCatalogConsensus: catalogSources.length
    });
}

function getOnlineMusicSearchArtistIdentityCandidates(track = {}) {
    const rawTitle = sanitizeText(track?.title || '');
    const splitArtist = rawTitle.match(/^([^|]{1,120}?)\s+(?:-|--|\u2013|\u2014|\|)\s+(.{1,220})$/)?.[1] || '';
    return Array.from(new Set([
        track?.lyricsArtist,
        track?.artist,
        track?.channelTitle,
        splitArtist
    ].map((value) => normalizeLyricsLookupText(normalizeLyricsArtistName(value || '')).toLowerCase()).filter(Boolean)));
}

function getOnlineMusicSearchDeclaredArtistCandidates(track = {}) {
    return Array.from(new Set([
        track?.lyricsArtist,
        track?.artist,
        track?.channelTitle
    ].map((value) => normalizeLyricsLookupText(normalizeLyricsArtistName(value || '')).toLowerCase()).filter(Boolean)));
}

function doesOnlineMusicSearchQueryMatchDeclaredArtist(query = '', track = {}) {
    const artists = getOnlineMusicSearchDeclaredArtistCandidates(track);
    return hasMatchingDesktopOnlineMusicTokenCount(query, artists)
        && getMaxDesktopOnlineMusicFuzzyScore(query, artists) >= 88;
}

function getOnlineMusicArtistSearchAuthorityTier(track = {}, query = '') {
    const declaredArtistMatch = doesOnlineMusicSearchQueryMatchDeclaredArtist(query, track);
    const provider = getOnlineMusicSearchResultProvider(track);
    if (declaredArtistMatch && ['itunes', 'deezer', 'spotify'].includes(provider)) return 5;
    const sourceText = sanitizeText(`${track?.channelTitle || ''} ${track?.artist || ''} ${track?.title || ''} ${track?.description || ''}`);
    const officialSource = /\b(?:topic|vevo|official\s+artist\s+channel|provided\s+to\s+youtube\s+by|official\s+(?:music\s+)?video|official\s+audio)\b/i.test(sourceText);
    if (declaredArtistMatch && officialSource) return 4;
    if (declaredArtistMatch && /youtube[\s-]*music|ytmsearch/i.test(`${track?.sourceSurface || ''} ${track?.resolver || ''}`)) return 3;
    if (declaredArtistMatch) return 2;
    return getOnlineMusicSearchArtistIdentityCandidates(track).some(
        (artist) => scoreOnlineMusicFuzzyTextMatch(query, artist) >= 88
    ) ? 1 : 0;
}

function doOnlineMusicSearchResultsShareArtistIdentity(left = {}, right = {}) {
    const leftArtists = getOnlineMusicSearchArtistIdentityCandidates(left);
    const rightArtists = getOnlineMusicSearchArtistIdentityCandidates(right);
    return leftArtists.some((leftArtist) => rightArtists.some(
        (rightArtist) => scoreOnlineMusicFuzzyTextMatch(leftArtist, rightArtist) >= 88
    ));
}

function applyOnlineMusicSearchResultQualityCutoff(tracks = [], options = {}) {
    const opts = typeof options === 'string' ? { query: options } : (options || {});
    const query = sanitizeText(opts.query || opts.searchQuery || '');
    const maxResults = Math.max(1, Math.min(48, Number(opts.limit || ONLINE_MUSIC_SEARCH_LIMIT) || ONLINE_MUSIC_SEARCH_LIMIT));
    let ranked = Array.isArray(tracks) ? tracks.slice() : [];
    const hasStructuredCatalogResult = ranked.some((track) => ['itunes', 'deezer', 'spotify'].includes(getOnlineMusicSearchResultProvider(track)));
    if (hasStructuredCatalogResult || opts.allowGenericYouTubeFallback !== true) {
        ranked = ranked.filter((track) => !isGenericYouTubeMusicSearchIdentity(track));
    }
    if (!ranked.length || !query) return ranked.slice(0, maxResults);
    const normalizedQuery = normalizeDesktopOnlineMusicSearchText(query);
    const queryTokenCount = normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean).length : 0;
    const artistDiscoveryMatchCount = ranked.filter(
        (track) => doesOnlineMusicSearchQueryMatchDeclaredArtist(normalizedQuery, track)
    ).length;
    let promotedDetachedYouTubeVariantId = '';
    if (artistDiscoveryMatchCount >= 2) {
        ranked = ranked.map((track, index) => ({ track, index }))
            .sort((left, right) => {
                const tierDifference = getOnlineMusicArtistSearchAuthorityTier(right.track, normalizedQuery)
                    - getOnlineMusicArtistSearchAuthorityTier(left.track, normalizedQuery);
                return tierDifference || (left.index - right.index);
            })
            .map((entry) => entry.track);
    } else if (ranked.length > 1) {
        const leadingTrack = ranked[0];
        let canonicalIndex = ranked.findIndex((track, index) => index > 0
            && ['itunes', 'deezer', 'spotify'].includes(getOnlineMusicSearchResultProvider(track))
            && isLikelyTitleOnlyOnlineMusicSearchResult(track, { query })
            && doOnlineMusicSearchResultsShareArtistIdentity(leadingTrack, track));
        if (canonicalIndex < 0
            && getOnlineMusicSearchResultProvider(leadingTrack) === 'youtube'
            && isLikelyTitleOnlyOnlineMusicSearchResult(leadingTrack, { query })) {
            canonicalIndex = ranked.findIndex((track, index) => index > 0
                && ['itunes', 'deezer', 'spotify'].includes(getOnlineMusicSearchResultProvider(track))
                && Math.max(0, Number(track?.providerSearchRank || 0) || 0) === 1
                && isLikelyTitleOnlyOnlineMusicSearchResult(track, { query }));
            if (canonicalIndex > 0) {
                const leadingEligibilityKind = sanitizeText(
                    classifyOnlineMusicSearchResultEligibility(leadingTrack, { query })?.kind || ''
                );
                if (leadingEligibilityKind === 'lyrics-video') {
                    promotedDetachedYouTubeVariantId = getOnlineMusicSearchMergeStableId(leadingTrack);
                }
            }
        }
        if (canonicalIndex > 0) {
            const [canonicalTrack] = ranked.splice(canonicalIndex, 1);
            ranked.unshift(canonicalTrack);
        }
    }
    const isExplicitIdentityQuery = /\s+\bby\b\s+/i.test(query)
        || /\s(?:-|--|\u2013|\u2014|\|)\s/.test(query);
    if (isExplicitIdentityQuery && ranked.length > 1) {
        const canonicalIndex = ranked.findIndex((track) => {
            const provider = getOnlineMusicSearchResultProvider(track);
            if (!['itunes', 'deezer', 'spotify'].includes(provider)) return false;
            const eligibility = classifyOnlineMusicSearchResultEligibility(track, { query });
            return eligibility?.include !== false && eligibility?.kind === 'catalog';
        });
        if (canonicalIndex > 0) {
            const [canonicalTrack] = ranked.splice(canonicalIndex, 1);
            ranked.unshift(canonicalTrack);
        }
    }
    const top = ranked[0];
    const topIsStrongTitleMatch = artistDiscoveryMatchCount < 2
        && queryTokenCount >= 2
        && isLikelyTitleOnlyOnlineMusicSearchResult(top, { query });
    if (topIsStrongTitleMatch) {
        const topScore = scoreOnlineMusicSearchResult(top, opts);
        const topHasConsensus = getOnlineMusicSearchResultConsensus(top) > 1;
        const topRank = Math.max(0, Number(top?.providerSearchRank || 0) || 0);
        let closeCatalogAlternativeCount = 0;
        let strongLyricsFallbackCount = 0;
        ranked = ranked.filter((track, index) => {
            if (index === 0) return true;
            if (!isLikelyTitleOnlyOnlineMusicSearchResult(track, { query })) return false;
            const score = scoreOnlineMusicSearchResult(track, opts);
            const provider = getOnlineMusicSearchResultProvider(track);
            const isStructuredCatalog = ['itunes', 'deezer', 'spotify'].includes(provider);
            const eligibility = classifyOnlineMusicSearchResultEligibility(track, { query });
            const eligibilityKind = sanitizeText(eligibility?.kind || '');
            const rank = Math.max(0, Number(track?.providerSearchRank || 0) || 0);
            const viewCount = Math.max(0, Number(track?.viewCount || 0) || 0);
            const sameArtist = doOnlineMusicSearchResultsShareArtistIdentity(top, track);
            if (topHasConsensus) {
                if (eligibilityKind === 'cover') {
                    return score >= topScore - 900 && ((rank > 0 && rank <= 8) || viewCount >= 50000);
                }
                if (eligibilityKind === 'lyrics-video'
                    && strongLyricsFallbackCount < 1
                    && score >= topScore - 900
                    && ((rank > 0 && rank <= 4) || viewCount >= 250000)) {
                    strongLyricsFallbackCount += 1;
                    return true;
                }
                if (sameArtist) return score >= topScore - 720 || (rank > 0 && rank <= 12);
                // Cross-provider agreement confirms that a recording exists;
                // it does not make a different artist's same-named song part
                // of the winning identity. Keep those rows out once both
                // catalog providers agree on the leading artist/title pair.
                if (isStructuredCatalog) return false;
                return false;
            }
            if (eligibilityKind === 'cover') {
                return score >= topScore - 760 && ((rank > 0 && rank <= 10) || viewCount >= 25000);
            }
            if (promotedDetachedYouTubeVariantId
                && eligibilityKind === 'lyrics-video'
                && getOnlineMusicSearchMergeStableId(track) === promotedDetachedYouTubeVariantId) {
                return true;
            }
            if (sameArtist) return score >= topScore - 720 || (rank > 0 && rank <= 12);
            if (isStructuredCatalog
                && closeCatalogAlternativeCount < 1
                && topRank !== 1
                && rank > 0
                && rank <= 2
                && score >= topScore - 45) {
                closeCatalogAlternativeCount += 1;
                return true;
            }
            return false;
        });
    }
    return ranked.slice(0, maxResults);
}

function mergeOnlineMusicSearchResults(tracks = [], options = {}) {
    const opts = typeof options === 'string' ? { query: options } : (options || {});
    const merged = new Map();
    (Array.isArray(tracks) ? tracks : []).forEach((candidate) => {
        const clean = sanitizeStoredOnlineMusicTrack(candidate);
        if (!clean) return;
        if (!shouldIncludeOnlineMusicSearchResult(clean, opts)) return;
        const key = getOnlineMusicSearchMergeKey(clean);
        if (!key) return;
        const existing = merged.get(key);
        if (!existing) {
            const providerSources = getOnlineMusicSearchResultCatalogSources(clean);
            merged.set(key, sanitizeStoredOnlineMusicTrack({
                ...clean,
                searchCatalogSources: providerSources,
                searchCatalogConsensus: providerSources.length
            }));
            return;
        }
        merged.set(key, mergeOnlineMusicSearchCandidateRecords(existing, clean, opts));
    });
    const ranked = Array.from(merged.values()).sort((left, right) => {
        const scoreDiff = scoreOnlineMusicSearchResult(right, opts) - scoreOnlineMusicSearchResult(left, opts);
        if (scoreDiff !== 0) return scoreDiff;
        const titleDifference = sanitizeText(left?.title || '').localeCompare(sanitizeText(right?.title || ''));
        if (titleDifference !== 0) return titleDifference;
        const artistDifference = sanitizeText(left?.artist || left?.channelTitle || '')
            .localeCompare(sanitizeText(right?.artist || right?.channelTitle || ''));
        if (artistDifference !== 0) return artistDifference;
        const providerDifference = getOnlineMusicSearchMergeProviderAuthority(right)
            - getOnlineMusicSearchMergeProviderAuthority(left);
        if (providerDifference !== 0) return providerDifference;
        return getOnlineMusicSearchMergeStableId(left).localeCompare(getOnlineMusicSearchMergeStableId(right));
    });
    return applyOnlineMusicSearchResultQualityCutoff(ranked, opts);
}

function getOnlineMusicSearchArtistCorrection(query = '', tracks = []) {
    const safeQuery = sanitizeText(query || '');
    if (!safeQuery || /["|]/.test(safeQuery) || /\s+\bby\b\s+/i.test(safeQuery) || /\s(?:-|--|\u2013|\u2014)\s/.test(safeQuery)) return '';
    const normalizedQuery = normalizeLyricsLookupText(safeQuery).toLowerCase();
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    if (!queryTokens.length || queryTokens.length > 3) return '';

    const candidates = new Map();
    (Array.isArray(tracks) ? tracks : []).forEach((track) => {
        const artist = sanitizeText(track?.lyricsArtist || track?.artist || track?.channelTitle || '');
        const normalizedArtist = normalizeLyricsLookupText(normalizeLyricsArtistName(artist)).toLowerCase();
        if (!normalizedArtist || normalizedArtist === normalizedQuery) return;
        const artistTokens = normalizedArtist.split(/\s+/).filter(Boolean);
        if (artistTokens.length !== queryTokens.length) return;
        const fuzzyScore = scoreOnlineMusicFuzzyTextMatch(normalizedQuery, normalizedArtist);
        if (fuzzyScore < 88) return;
        const rank = Math.max(1, Number(track?.providerSearchRank || 0) || 50);
        const popularity = Math.max(0, Number(track?.providerPopularity || track?.viewCount || 0) || 0);
        const candidateScore = (fuzzyScore * 10) + Math.max(0, 120 - (rank * 5)) + Math.min(120, Math.log10(popularity + 1) * 18);
        const existing = candidates.get(normalizedArtist);
        if (!existing || candidateScore > existing.score) candidates.set(normalizedArtist, { artist, score: candidateScore });
    });
    return Array.from(candidates.values()).sort((left, right) => right.score - left.score)[0]?.artist || '';
}

function mergeOnlineMusicProviderSearchPages(...pages) {
    const seen = new Set();
    return pages.flatMap((page) => Array.isArray(page) ? page : []).filter((track) => {
        const key = sanitizeText(track?.id || track?.providerTrackId || track?.videoId || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

const ONLINE_MUSIC_SEARCH_SUGGESTION_CACHE_TTL_MS = 15 * 60 * 1000;
const ONLINE_MUSIC_SEARCH_SUGGESTION_CACHE_MAX_ENTRIES = 64;
const onlineMusicSearchSuggestionCache = new Map();

function normalizeOnlineMusicSearchSuggestions(payload = null) {
    const rawSuggestions = Array.isArray(payload?.[1]) ? payload[1] : [];
    const suggestions = rawSuggestions.map((entry) => sanitizeText(
        Array.isArray(entry) ? entry[0] : entry
    ).replace(/\s+/g, ' ').trim()).filter(Boolean);
    return Array.from(new Set(suggestions)).slice(0, 10);
}

function getOnlineMusicPredictiveSearchQuery(query = '', suggestions = []) {
    const requestedQuery = sanitizeText(query || '').replace(/\s+/g, ' ').trim();
    const normalizedQuery = normalizeLyricsLookupText(requestedQuery).toLowerCase();
    if (normalizedQuery.length < 2) return requestedQuery;
    const candidate = (Array.isArray(suggestions) ? suggestions : []).find((suggestion) => {
        const cleanSuggestion = sanitizeText(suggestion || '').replace(/\s+/g, ' ').trim();
        const normalizedSuggestion = normalizeLyricsLookupText(cleanSuggestion).toLowerCase();
        if (!normalizedSuggestion || normalizedSuggestion === normalizedQuery || cleanSuggestion.length > 120) return false;
        return normalizedSuggestion.startsWith(normalizedQuery)
            || scoreOnlineMusicFuzzyTextMatch(normalizedQuery, normalizedSuggestion) >= 88;
    });
    return sanitizeText(candidate || requestedQuery);
}

async function fetchOnlineMusicSearchSuggestions(query = '', options = {}) {
    const requestedQuery = sanitizeText(query || '').replace(/\s+/g, ' ').trim();
    const cacheKey = normalizeLyricsLookupText(requestedQuery).toLowerCase();
    if (cacheKey.length < 2) return [];
    const currentTime = Date.now();
    const cached = onlineMusicSearchSuggestionCache.get(cacheKey);
    if (cached && currentTime - Number(cached.cachedAt || 0) <= ONLINE_MUSIC_SEARCH_SUGGESTION_CACHE_TTL_MS) {
        onlineMusicSearchSuggestionCache.delete(cacheKey);
        onlineMusicSearchSuggestionCache.set(cacheKey, cached);
        return cached.suggestions.slice();
    }
    if (cached) onlineMusicSearchSuggestionCache.delete(cacheKey);

    const timeoutMs = Math.max(1000, Math.min(2500, Number(options?.timeoutMs) || 1600));
    const desktopFetch = window.NexPlayDesktop?.fetchApprovedRemoteJson;
    let payload = null;
    if (typeof desktopFetch === 'function') {
        const requestUrl = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(requestedQuery)}`;
        payload = await raceOnlineMusicRequestWithSignal(
            desktopFetch({ url: requestUrl, timeoutMs }),
            options?.signal || null,
            'Search predictions were cancelled.'
        );
    } else {
        const requestUrl = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(requestedQuery)}`;
        payload = await fetchJsonpPayload(requestUrl, {
            callbackPrefix: 'nexplay_youtube_suggestions_',
            timeoutMs,
            errorMessage: 'Search predictions are temporarily unavailable.',
            signal: options?.signal || null
        });
    }
    const suggestions = normalizeOnlineMusicSearchSuggestions(payload);
    while (onlineMusicSearchSuggestionCache.size >= ONLINE_MUSIC_SEARCH_SUGGESTION_CACHE_MAX_ENTRIES) {
        const oldestKey = onlineMusicSearchSuggestionCache.keys().next().value;
        if (!oldestKey) break;
        onlineMusicSearchSuggestionCache.delete(oldestKey);
    }
    onlineMusicSearchSuggestionCache.set(cacheKey, { cachedAt: currentTime, suggestions });
    return suggestions.slice();
}

function createItunesSearchTrack(item = {}, options = {}) {
    const trackId = sanitizeText(item?.trackId || '');
    if (!trackId) return null;
    return sanitizeStoredOnlineMusicTrack({
        id: `itunes:${trackId}`,
        provider: 'itunes',
        providerTrackId: trackId,
        title: sanitizeText(item?.trackName || item?.trackCensoredName || ''),
        artist: sanitizeText(item?.artistName || ''),
        channelTitle: sanitizeText(item?.artistName || ''),
        cover: buildItunesArtworkUrl(item?.artworkUrl100 || item?.artworkUrl60 || ''),
        duration: Math.round(Math.max(0, Number(item?.trackTimeMillis || 0) || 0) / 1000),
        canonicalUrl: sanitizeText(item?.trackViewUrl || item?.collectionViewUrl || ''),
        publishedAt: sanitizeText(item?.releaseDate || ''),
        releaseTitle: sanitizeText(item?.collectionName || ''),
        catalogProvider: 'itunes',
        catalogProviderLabel: 'iTunes',
        providerArtistId: sanitizeText(item?.artistId || ''),
        providerReleaseId: sanitizeText(item?.collectionId || ''),
        transportProvider: '',
        transportProviderLabel: '',
        providerSearchRank: Math.max(0, Number(options?.rank || 0) || 0),
        addedAt: Date.now()
    });
}

async function fetchItunesSearchTracks(query = '', options = {}) {
    const term = sanitizeText(query || '');
    if (!term) return [];
    const loadPage = async (searchTerm) => {
        const payload = await fetchJsonpPayload(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=24`, {
            callbackPrefix: 'nexplay_itunes_search_',
            errorMessage: 'iTunes search failed.',
            timeoutMs: Math.max(1000, Number(options?.timeoutMs) || 3500),
            signal: options?.signal || null
        });
        return (Array.isArray(payload?.results) ? payload.results : [])
            .filter((item) => item?.wrapperType === 'track' && sanitizeText(item?.trackName || ''))
            .map((item, index) => createItunesSearchTrack(item, { rank: index + 1 }))
            .filter(Boolean);
    };
    const initialTracks = await loadPage(term);
    const correctedArtist = getOnlineMusicSearchArtistCorrection(term, initialTracks);
    if (!correctedArtist) return initialTracks;
    const correctedTracks = await loadPage(correctedArtist);
    return mergeOnlineMusicProviderSearchPages(correctedTracks, initialTracks);
}

function createDeezerSearchTrack(item = {}, options = {}) {
    const trackId = sanitizeText(item?.id || '');
    if (!trackId) return null;
    return sanitizeStoredOnlineMusicTrack({
        id: `deezer:${trackId}`,
        provider: 'deezer',
        providerTrackId: trackId,
        title: sanitizeText(item?.title || item?.title_short || ''),
        artist: sanitizeText(item?.artist?.name || ''),
        channelTitle: sanitizeText(item?.artist?.name || ''),
        cover: item?.album?.cover_xl || item?.album?.cover_big || item?.album?.cover_medium || '',
        duration: Number(item?.duration || 0) || 0,
        canonicalUrl: sanitizeText(item?.link || item?.share || ''),
        publishedAt: sanitizeText(item?.release_date || ''),
        releaseTitle: sanitizeText(item?.album?.title || ''),
        catalogProvider: 'deezer',
        catalogProviderLabel: 'Deezer',
        providerArtistId: sanitizeText(item?.artist?.id || ''),
        providerReleaseId: sanitizeText(item?.album?.id || ''),
        transportProvider: '',
        transportProviderLabel: '',
        providerSearchRank: Math.max(0, Number(options?.rank || 0) || 0),
        providerPopularity: Math.max(0, Number(item?.rank || 0) || 0),
        addedAt: Date.now()
    });
}

async function fetchDeezerSearchTracks(query = '', options = {}) {
    const term = sanitizeText(query || '');
    if (!term) return [];
    const loadPage = async (searchTerm) => {
        const payload = await fetchJsonpPayload(`https://api.deezer.com/search?q=${encodeURIComponent(searchTerm)}&limit=24&output=jsonp`, {
            callbackPrefix: 'nexplay_deezer_search_',
            errorMessage: 'Deezer search failed.',
            timeoutMs: Math.max(1000, Number(options?.timeoutMs) || 3500),
            signal: options?.signal || null
        });
        return (Array.isArray(payload?.data) ? payload.data : [])
            .map((item, index) => createDeezerSearchTrack(item, { rank: index + 1 }))
            .filter(Boolean);
    };
    const initialTracks = await loadPage(term);
    const correctedArtist = getOnlineMusicSearchArtistCorrection(term, initialTracks);
    if (!correctedArtist) return initialTracks;
    const correctedTracks = await loadPage(correctedArtist);
    return mergeOnlineMusicProviderSearchPages(correctedTracks, initialTracks);
}

function canUseDesktopYouTubeMusicSearch() {
    return isDesktopRuntimeAvailable()
        && nexPlayDesktopBridge
        && typeof nexPlayDesktopBridge.searchYouTubeMusic === 'function';
}

async function fetchDesktopYouTubeMusicSearchTracks(query = '', options = {}) {
    if (!canUseDesktopYouTubeMusicSearch()) return [];
    const term = sanitizeText(query || '');
    if (!term) return [];
    const timeoutMs = Math.max(3000, Number(options?.timeoutMs || DESKTOP_ONLINE_MUSIC_SEARCH_TIMEOUT_MS) || DESKTOP_ONLINE_MUSIC_SEARCH_TIMEOUT_MS);
    const loadPage = async (searchTerm) => {
        const payload = await raceOnlineMusicRequestWithSignal(nexPlayDesktopBridge.searchYouTubeMusic({
            query: searchTerm,
            limit: ONLINE_MUSIC_SEARCH_LIMIT,
            timeoutMs
        }), options?.signal || null, 'YouTube Music search cancelled.');
        return (Array.isArray(payload?.tracks) ? payload.tracks : [])
            .map((item, index) => sanitizeStoredOnlineMusicTrack({
                ...item,
                provider: 'youtube',
                providerLabel: 'YouTube Music',
                catalogProvider: 'youtube',
                catalogProviderLabel: 'YouTube Music',
                transportProvider: 'youtube',
                transportProviderLabel: 'YouTube',
                sourceSurface: 'youtube-music',
                providerSearchRank: index + 1
            }))
            .filter(Boolean);
    };
    const initialTracks = await loadPage(term);
    const correctedArtist = getOnlineMusicSearchArtistCorrection(term, initialTracks);
    if (!correctedArtist) return initialTracks;
    const correctedTracks = await loadPage(correctedArtist);
    return mergeOnlineMusicProviderSearchPages(correctedTracks, initialTracks);
}

async function fetchOnlineMusicCatalogSearchBundle(query = '', options = {}) {
    const responses = await Promise.allSettled([
        fetchItunesSearchTracks(query, options),
        fetchDeezerSearchTracks(query, options)
    ]);
    return {
        tracks: responses
            .filter((entry) => entry.status === 'fulfilled')
            .flatMap((entry) => Array.isArray(entry.value) ? entry.value : []),
        errors: responses
            .filter((entry) => entry.status === 'rejected')
            .map((entry) => sanitizeOnlineProviderErrorMessage(entry.reason?.message || entry.reason || ''))
            .filter(Boolean)
    };
}

async function fetchDesktopOnlineMusicSearchBundle(query = '') {
    const [youtubeResult, catalogResult] = await Promise.allSettled([
        fetchDesktopYouTubeMusicSearchTracks(query),
        fetchOnlineMusicCatalogSearchBundle(query)
    ]);
    const youtubeMusicTracks = youtubeResult.status === 'fulfilled' && Array.isArray(youtubeResult.value)
        ? youtubeResult.value
        : [];
    const catalogBundle = catalogResult.status === 'fulfilled'
        ? (catalogResult.value || {})
        : { tracks: [], errors: [catalogResult.reason] };
    const errors = [
        ...(Array.isArray(catalogBundle.errors) ? catalogBundle.errors : []),
        ...(youtubeResult.status === 'rejected' ? [youtubeResult.reason] : []),
        ...(catalogResult.status === 'rejected' ? [catalogResult.reason] : [])
    ]
        .map((error) => sanitizeOnlineProviderErrorMessage(error?.message || error || ''))
        .filter(Boolean);
    return {
        tracks: [
            ...youtubeMusicTracks,
            ...(Array.isArray(catalogBundle.tracks) ? catalogBundle.tracks : [])
        ],
        errors
    };
}

function appendDesktopYouTubeMusicResultsToOnlineSearch(query = '') {
    if (!canUseDesktopYouTubeMusicSearch()) return;
    const requestedQuery = sanitizeText(query || '');
    if (!requestedQuery) return;
    fetchDesktopYouTubeMusicSearchTracks(requestedQuery)
        .then((tracks) => {
            if (!Array.isArray(tracks) || !tracks.length) return;
            const online = getOnlineMusicState();
            if (sanitizeText(online.searchQuery || '') !== requestedQuery || online.browserView !== 'search') return;
            const merged = mergeOnlineMusicSearchResults([
                ...(online.searchResults || []),
                ...tracks
            ], { query: requestedQuery, preferPlayableTransport: true });
            if (merged.length <= (online.searchResults || []).length) return;
            online.searchResults = merged;
            online.searchStatus = `Found ${online.searchResults.length} streaming result${online.searchResults.length === 1 ? '' : 's'}.`;
            updateOnlineMusicFeedback(online.searchStatus, 'success');
            persistOnlineMusicState();
            renderOnlineMusicContent();
        })
        .catch((error) => {
            console.warn('Desktop YouTube Music search failed', error);
        });
}

function appendDesktopYouTubeMusicResultsToPrivateSearch(query = '') {
    if (!canUseDesktopYouTubeMusicSearch()) return;
    const requestedQuery = sanitizeText(query || '');
    if (!requestedQuery) return;
    fetchDesktopYouTubeMusicSearchTracks(requestedQuery)
        .then((tracks) => {
            if (!Array.isArray(tracks) || !tracks.length) return;
            const privateState = getPrivateSessionState();
            if (sanitizeText(privateState.searchQuery || '') !== requestedQuery || privateState.onlineView !== 'search') return;
            const merged = mergeOnlineMusicSearchResults([
                ...(privateState.searchResults || []),
                ...tracks
            ], { query: requestedQuery }).slice(0, 48).map((track) => sanitizePrivateSessionTrackRecord({
                ...track,
                sourceLabel: sanitizeText(track?.catalogProviderLabel || track?.transportProviderLabel || track?.providerLabel || track?.provider || 'Online'),
                privateSessionOrigin: 'search',
                privateSessionCollectionKey: 'search'
            }));
            if (merged.length <= (privateState.searchResults || []).length) return;
            state.privateSession = {
                ...privateState,
                searchResults: merged,
                onlineView: 'search'
            };
            setPrivateSessionFeedback(`Found ${merged.length} private online result${merged.length === 1 ? '' : 's'} for "${requestedQuery}".`, 'success');
            renderPrivateSessionCollections();
        })
        .catch((error) => {
            console.warn('Private desktop YouTube Music search failed', error);
        });
}

async function fetchYouTubeOnlineMusicSearchTracks(query = '', options = {}) {
    const searchItems = await fetchOnlineMusicYouTubeItems('search', {
        part: 'snippet',
        type: 'video',
        videoCategoryId: '10',
        maxResults: Math.max(ONLINE_MUSIC_SEARCH_LIMIT, Math.min(50, ONLINE_MUSIC_SEARCH_LIMIT * 4)),
        q: sanitizeText(query || ''),
        videoEmbeddable: 'true',
        videoSyndicated: 'true'
    }, {
        maxPages: 1,
        signal: options?.signal || null,
        timeoutMs: options?.timeoutMs
    });
    const ids = Array.from(new Set((searchItems || [])
        .map((item) => sanitizeText(item?.id?.videoId || ''))
        .filter(Boolean)));
    if (!ids.length) return [];
    const details = await fetchOnlineMusicVideoDetails(ids, options);
    return (details || [])
        .filter((item) => item?.status?.embeddable !== false && item?.status?.privacyStatus !== 'private')
        .map((item) => sanitizeStoredOnlineMusicTrack({
            id: item.id,
            videoId: item.id,
            title: item?.snippet?.title || '',
            artist: item?.snippet?.channelTitle || 'YouTube',
            channelTitle: item?.snippet?.channelTitle || 'YouTube',
            channelId: item?.snippet?.channelId || '',
            thumbnail: item?.snippet?.thumbnails?.medium?.url
                || item?.snippet?.thumbnails?.high?.url
                || item?.snippet?.thumbnails?.default?.url
                || '',
            description: item?.snippet?.description || '',
            tags: Array.isArray(item?.snippet?.tags) ? item.snippet.tags : [],
            isoDuration: item?.contentDetails?.duration || '',
            canonicalUrl: `https://www.youtube.com/watch?v=${item.id}`,
            publishedAt: item?.snippet?.publishedAt || '',
            viewCount: Number(item?.statistics?.viewCount || 0) || 0,
            likeCount: Number(item?.statistics?.likeCount || 0) || 0,
            transportProvider: 'youtube',
            transportProviderLabel: 'YouTube',
            resolver: 'youtube-data-api',
            addedAt: Date.now()
        }))
        .filter(Boolean);
}

async function fetchOnlineMusicYouTube(resource, query = {}, options = {}) {
    const apiKey = sanitizeText(syncConfiguredOnlineMusicApiKey() || YOUTUBE_DATA_API_KEY);
    if (!apiKey) throw new Error('Missing YouTube API key.');
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    const params = new URLSearchParams();
    Object.entries({ ...query, key: apiKey }).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') return;
        params.set(key, String(value));
    });
    url.search = params.toString();
    if (options?.signal?.aborted) throw createOnlineMusicRequestAbortError('YouTube search cancelled.');
    const controller = new AbortController();
    const abortHandler = () => controller.abort();
    if (options?.signal) options.signal.addEventListener('abort', abortHandler, { once: true });
    const timeoutMs = Math.max(0, Number(options?.timeoutMs) || 0);
    const timeout = timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await fetch(url.toString(), {
            signal: controller.signal,
            headers: { Accept: 'application/json' }
        });
        const payload = await response.json();
        if (!response.ok) {
            const rawMessage = payload?.error?.message || `YouTube ${resource} request failed.`;
            const details = classifyOnlineMusicYouTubeError(rawMessage);
            rememberOnlineMusicDiscoveryFailure(rawMessage);
            throw new Error(details.userMessage || details.message || `YouTube ${resource} request failed.`);
        }
        rememberOnlineMusicDiscoveryHealthy('');
        return payload;
    } catch (error) {
        if (controller.signal.aborted) {
            const message = options?.signal?.aborted
                ? 'YouTube search cancelled.'
                : 'YouTube search timed out.';
            throw createOnlineMusicRequestAbortError(message);
        }
        throw error;
    } finally {
        if (timeout) window.clearTimeout(timeout);
        if (options?.signal) options.signal.removeEventListener('abort', abortHandler);
    }
}

async function fetchOnlineMusicYouTubeItems(resource, query = {}, options = {}) {
    const opts = { maxPages: 1, ...options };
    const items = [];
    let pageToken = '';
    for (let page = 0; page < opts.maxPages; page += 1) {
        const payload = await fetchOnlineMusicYouTube(resource, {
            ...query,
            pageToken: pageToken || undefined
        }, options);
        items.push(...(Array.isArray(payload?.items) ? payload.items : []));
        pageToken = sanitizeText(payload?.nextPageToken || '');
        if (!pageToken) break;
    }
    return items;
}

function sanitizeOnlineMusicChannel(raw = {}) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const snippet = item.snippet || {};
    return {
        channelId: sanitizeText(item.id || snippet.channelId || ''),
        title: sanitizeText(snippet.title || ''),
        description: sanitizeText(snippet.description || ''),
        cover: getOnlineMusicThumbnail(snippet),
        uploadsPlaylistId: sanitizeText(item?.contentDetails?.relatedPlaylists?.uploads || ''),
        subscriberCount: Number(item?.statistics?.subscriberCount || 0) || 0,
        videoCount: Number(item?.statistics?.videoCount || 0) || 0
    };
}

function scoreOnlineMusicArtistChannel(channel, track) {
    const channelTitle = normalizeLyricsLookupText(normalizeLyricsArtistName(channel?.title || ''));
    const artistName = normalizeLyricsLookupText(normalizeLyricsArtistName(track?.artist || track?.channelTitle || ''));
    const trackChannel = normalizeLyricsLookupText(normalizeLyricsArtistName(track?.channelTitle || track?.artist || ''));
    let score = 0;
    if (!channelTitle) return score;
    if (artistName && channelTitle === artistName) score += 60;
    else if (artistName && (channelTitle.includes(artistName) || artistName.includes(channelTitle))) score += 28;
    if (trackChannel && channelTitle === trackChannel) score += 44;
    else if (trackChannel && (channelTitle.includes(trackChannel) || trackChannel.includes(channelTitle))) score += 18;
    if (/\btopic\b/i.test(channel?.title || '')) score += 12;
    if (/\bofficial artist channel\b/i.test(channel?.title || '')) score += 18;
    return score;
}

async function resolveOnlineMusicArtistChannel(track) {
    const directChannelId = sanitizeText(track?.channelId || '');
    const catalogFallback = createCatalogOnlyOnlineMusicArtistChannel(track);
    if (directChannelId && catalogFallback) {
        return withOnlineMusicCatalogArtistMetadata({
            ...catalogFallback,
            channelId: directChannelId,
            catalogOnly: false,
            uploadsPlaylistId: ''
        }, track);
    }
    if (directChannelId) {
        try {
            const directItems = await fetchOnlineMusicYouTubeItems('channels', {
                part: 'snippet,contentDetails,statistics',
                id: directChannelId,
                maxResults: 1
            });
            const directChannel = sanitizeOnlineMusicChannel(directItems[0] || {});
            if (directChannel.channelId) return withOnlineMusicCatalogArtistMetadata(directChannel, track);
        } catch (_) {
            if (catalogFallback) return catalogFallback;
            throw _;
        }
    }

    const query = getOnlineMusicCatalogArtistName(catalogFallback || {}, track)
        || sanitizeText(track?.artist || track?.channelTitle || '');
    if (!query) throw new Error('Artist information is missing for this online track.');
    if (catalogFallback && isCatalogBackedOnlineMusicTrack(track)) {
        return catalogFallback;
    }

    let matches = [];
    try {
        matches = await fetchOnlineMusicYouTubeItems('search', {
            part: 'snippet',
            type: 'channel',
            q: `${query} official artist channel`,
            maxResults: 5
        });
    } catch (_) {
        if (catalogFallback) return catalogFallback;
        throw _;
    }
    const channelIds = Array.from(new Set(matches
        .map((item) => sanitizeText(item?.snippet?.channelId || item?.id?.channelId || ''))
        .filter(Boolean)));
    if (!channelIds.length) {
        if (catalogFallback) return catalogFallback;
        throw new Error(`No YouTube artist channel was found for "${query}".`);
    }
    let channels = [];
    try {
        channels = await fetchOnlineMusicYouTubeItems('channels', {
            part: 'snippet,contentDetails,statistics',
            id: channelIds.join(','),
            maxResults: channelIds.length
        });
    } catch (_) {
        if (catalogFallback) return catalogFallback;
        throw _;
    }
    const bestChannel = channels
        .map((item) => sanitizeOnlineMusicChannel(item))
        .sort((left, right) => scoreOnlineMusicArtistChannel(right, track) - scoreOnlineMusicArtistChannel(left, track))[0];
    if (!bestChannel?.channelId) {
        if (catalogFallback) return catalogFallback;
        throw new Error(`No YouTube artist channel was found for "${query}".`);
    }
    return withOnlineMusicCatalogArtistMetadata(bestChannel, track);
}

async function fetchOnlineMusicVideoDetails(videoIds = [], options = {}) {
    const ids = Array.from(new Set((Array.isArray(videoIds) ? videoIds : []).map((id) => sanitizeText(id)).filter(Boolean)));
    if (!ids.length) return [];
    const details = [];
    for (let index = 0; index < ids.length; index += 50) {
        const chunk = ids.slice(index, index + 50);
        const payload = await fetchOnlineMusicYouTube('videos', {
            part: 'snippet,contentDetails,status,statistics',
            id: chunk.join(','),
            maxResults: chunk.length
        }, options);
        details.push(...(Array.isArray(payload?.items) ? payload.items : []));
    }
    return details;
}

function buildOnlineMusicTrackFromVideoDetail(item, options = {}) {
    const videoId = sanitizeText(item?.id || options.videoId || '');
    if (!videoId) return null;
    return sanitizeStoredOnlineMusicTrack({
        id: videoId,
        videoId,
        title: item?.snippet?.title || options.title || '',
        artist: item?.snippet?.channelTitle || options.artist || options.channelTitle || 'YouTube',
        channelTitle: item?.snippet?.channelTitle || options.channelTitle || options.artist || 'YouTube',
        channelId: item?.snippet?.channelId || options.channelId || '',
        thumbnail: getOnlineMusicThumbnail(item?.snippet || {}),
        description: item?.snippet?.description || '',
        tags: Array.isArray(item?.snippet?.tags) ? item.snippet.tags : [],
        isoDuration: item?.contentDetails?.duration || '',
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: sanitizeText(options.publishedAt || item?.snippet?.publishedAt || ''),
        viewCount: Number(item?.statistics?.viewCount || 0) || 0,
        likeCount: Number(item?.statistics?.likeCount || 0) || 0,
        addedAt: Date.parse(options.publishedAt || item?.snippet?.publishedAt || '') || Date.now()
    });
}

function isPlayableOnlineMusicVideoDetail(item) {
    return !!item && item?.status?.embeddable !== false && item?.status?.privacyStatus !== 'private';
}

function isUnavailableOnlineMusicPlaylistTitle(title = '') {
    return /^(?:private video|deleted video)$/i.test(sanitizeText(title || ''));
}

function createOnlineMusicPlaylistItemTarget(item, options = {}) {
    const snippet = item?.snippet || {};
    const title = sanitizeText(snippet.title || '');
    const videoId = sanitizeText(item?.contentDetails?.videoId || snippet?.resourceId?.videoId || '');
    return {
        playlistItemId: sanitizeText(item?.id || ''),
        videoId,
        title,
        publishedAt: sanitizeText(snippet.publishedAt || ''),
        position: Number(snippet.position ?? options.index ?? 0) || 0,
        artist: sanitizeText(options.artist || ''),
        releaseTitle: sanitizeText(options.releaseTitle || ''),
        channelId: sanitizeText(options.channelId || ''),
        channelTitle: sanitizeText(options.channelTitle || options.artist || ''),
        fallbackAllowed: !!title && !isUnavailableOnlineMusicPlaylistTitle(title)
    };
}

async function fetchOnlineMusicPlaylistsByIds(playlistIds = []) {
    const ids = Array.from(new Set((Array.isArray(playlistIds) ? playlistIds : [])
        .map((id) => sanitizeText(id))
        .filter(Boolean)));
    if (!ids.length) return [];
    const details = [];
    for (let index = 0; index < ids.length; index += 50) {
        const chunk = ids.slice(index, index + 50);
        const payload = await fetchOnlineMusicYouTube('playlists', {
            part: 'snippet,contentDetails',
            id: chunk.join(','),
            maxResults: chunk.length
        });
        details.push(...(Array.isArray(payload?.items) ? payload.items : []));
    }
    return details;
}

async function searchOnlineMusicFallbackTrackForPlaylistItem(target, options = {}) {
    const safeTarget = target && typeof target === 'object' ? target : null;
    if (!safeTarget?.fallbackAllowed) return null;
    const searchQuery = [safeTarget.artist, safeTarget.title, safeTarget.releaseTitle]
        .map((value) => sanitizeText(value))
        .filter(Boolean)
        .join(' ');
    if (!searchQuery) return null;

    const searchItems = await fetchOnlineMusicYouTubeItems('search', {
        part: 'snippet',
        type: 'video',
        videoCategoryId: '10',
        maxResults: Math.max(1, Math.min(Number(options.maxResults) || 5, 8)),
        q: searchQuery,
        videoEmbeddable: 'true',
        videoSyndicated: 'true'
    }, { maxPages: 1 });
    const candidateIds = Array.from(new Set(searchItems
        .map((item) => sanitizeText(item?.id?.videoId || ''))
        .filter(Boolean)));
    if (!candidateIds.length) return null;

    const details = await fetchOnlineMusicVideoDetails(candidateIds);
    const scored = details
        .filter((item) => isPlayableOnlineMusicVideoDetail(item))
        .filter((item) => !isLikelyShortFormOnlineMusicResult({
            title: item?.snippet?.title || '',
            description: item?.snippet?.description || '',
            tags: Array.isArray(item?.snippet?.tags) ? item.snippet.tags : [],
            duration: parseYouTubeDuration(item?.contentDetails?.duration || ''),
            canonicalUrl: `https://www.youtube.com/watch?v=${sanitizeText(item?.id || '')}`
        }))
        .map((item) => ({
            item,
            score: scoreOnlineMusicTrackCandidate({
                expectedVideoId: safeTarget.videoId,
                targetTitle: safeTarget.title,
                targetArtist: safeTarget.artist,
                releaseTitle: safeTarget.releaseTitle,
                candidateVideoId: item?.id || '',
                candidateTitle: item?.snippet?.title || '',
                candidateArtist: item?.snippet?.channelTitle || '',
                candidateChannel: item?.snippet?.channelTitle || ''
            })
        }))
        .sort((left, right) => right.score - left.score);
    if (!scored.length || scored[0].score < 70) return null;

    return buildOnlineMusicTrackFromVideoDetail(scored[0].item, {
        publishedAt: safeTarget.publishedAt,
        channelId: safeTarget.channelId,
        artist: safeTarget.artist,
        channelTitle: safeTarget.channelTitle
    });
}

async function fetchOnlineMusicTracksFromPlaylist(playlistId, options = {}) {
    const opts = { maxPages: 4, recoverySearchLimit: 5, ...options };
    const safePlaylistId = sanitizeText(playlistId || '');
    if (!safePlaylistId) {
        return {
            tracks: [],
            rawItems: [],
            declaredTrackCount: 0,
            missingTrackCount: 0
        };
    }
    const playlistItems = await fetchOnlineMusicYouTubeItems('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId: safePlaylistId,
        maxResults: 50
    }, { maxPages: opts.maxPages });
    const rawItems = playlistItems
        .map((item, index) => createOnlineMusicPlaylistItemTarget(item, {
            index,
            artist: opts.artist || '',
            releaseTitle: opts.releaseTitle || '',
            channelId: opts.channelId || '',
            channelTitle: opts.channelTitle || opts.artist || ''
        }))
        .sort((left, right) => left.position - right.position);
    const ids = Array.from(new Set(rawItems.map((item) => item.videoId).filter(Boolean)));
    const videoDetails = await fetchOnlineMusicVideoDetails(ids);
    const detailMap = new Map(videoDetails.map((item) => [sanitizeText(item?.id || ''), item]));
    const resolvedTracks = [];

    for (const rawItem of rawItems) {
        const directDetail = rawItem.videoId ? detailMap.get(rawItem.videoId) : null;
        let track = null;
        if (isPlayableOnlineMusicVideoDetail(directDetail)) {
            track = buildOnlineMusicTrackFromVideoDetail(directDetail, {
                publishedAt: rawItem.publishedAt || directDetail?.snippet?.publishedAt || '',
                channelId: opts.channelId || '',
                artist: opts.artist || '',
                channelTitle: opts.channelTitle || ''
            });
        }
        if (!track) {
            track = await searchOnlineMusicFallbackTrackForPlaylistItem(rawItem, {
                maxResults: opts.recoverySearchLimit || 5
            });
        }
        if (track) resolvedTracks.push(track);
    }

    const orderedTracks = uniqueOnlineMusicTracksInDeclaredOrder(resolvedTracks);
    const declaredTrackCount = rawItems.length;
    return {
        tracks: orderedTracks,
        rawItems,
        declaredTrackCount,
        missingTrackCount: Math.max(0, declaredTrackCount - orderedTracks.length)
    };
}

let onlineMusicPlaylistImportBusy = false;

