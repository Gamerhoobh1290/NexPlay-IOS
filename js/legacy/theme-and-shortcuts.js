/* Legacy accent, visual style, shortcut, and crossfade configuration.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

// --- ACCENT COLOR & VISUALIZER STYLE ---
/**
 * Set the global accent color used throughout the UI.  Updates the CSS variable
 * and triggers a re-render of navigation and stats to reflect the new color.
 */
function setAccentColor(color, { fromAuto = false } = {}) {
    if (!color) return;
    state.accentColor = color;
    // Disable auto accent if user picks a manual color
    if (!fromAuto) {
        state.autoAccentFromArt = false;
        syncAutoAccentToggle();
    }
    // Apply CSS variables for the accent colour and its semi-transparent version. Convert hex to RGB
    // to build a light variant with alpha 0.2 for track highlighting. If the user inputs a CSS var
    // like rgb() we fall back to using the provided colour for both variables.
    document.documentElement.style.setProperty('--accent-color', color);
    // Also update ambient glow overlay
    updateAccentAmbient(color);
    try {
        // Support hex shorthand (#abc) or full (#aabbcc)
        let hex = color.trim();
        if (hex.startsWith('#')) {
            hex = hex.substring(1);
            if (hex.length === 3) {
                hex = hex.split('').map(c => c + c).join('');
            }
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            const light = `rgba(${r}, ${g}, ${b}, 0.2)`;
            document.documentElement.style.setProperty('--accent-color-light', light);
            document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
            document.documentElement.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.6)`);
        } else if (color.startsWith('rgb')) {
            // Attempt to extract numeric values from rgb/rgba string
            const vals = color.match(/\d+/g);
            if (vals && vals.length >= 3) {
                const [r, g, b] = vals;
                const light = `rgba(${r}, ${g}, ${b}, 0.2)`;
                document.documentElement.style.setProperty('--accent-color-light', light);
                document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
                document.documentElement.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.6)`);
            }
        }
    } catch (e) {
        // if any error occurs, fall back to using accent colour for the light variable
        document.documentElement.style.setProperty('--accent-color-light', color);
        document.documentElement.style.setProperty('--accent-glow', `${color}99`);
    }
    // Hide the accent menu
    const menu = document.getElementById('accent-menu');
    // if (menu) menu.classList.add('hidden'); // DISABLED For Accordion
    // Re-render navigation and stats to update accent colours
    renderNav();
    if (state.activeTab === 'stats') {
        renderStats();
    }
    applyThemePreference();
    persistAppStateNow();
}
// Toggle automatic accent extraction from cover art
function toggleAutoAccent() {
    state.autoAccentFromArt = !state.autoAccentFromArt;
    syncAutoAccentToggle();
    if (state.autoAccentFromArt) {
        const track = getActivePlaybackTrack();
        applyCoverAccent(track);
    }
    persistAppStateNow();
}
// Sync the toggle button label for auto accent
function syncAutoAccentToggle() {
    const btn = document.getElementById('auto-accent-toggle');
    if (!btn) return;
    btn.textContent = state.autoAccentFromArt ? 'Auto Color: ON' : 'Auto Color: OFF';
    btn.classList.toggle('text-cyan-300', state.autoAccentFromArt);
    btn.classList.toggle('border-cyan-500/40', state.autoAccentFromArt);
}
	        // Update ambient glow overlay for the full player
	        function updateAccentAmbient(color) {
	            const ambient = document.getElementById('windowedModeAccentAmbient');
	            if (!ambient || !color) return;
	            let c1 = color, c2 = color;
    if (color.startsWith('rgb')) {
        const vals = color.match(/\d+/g);
        if (vals && vals.length >= 3) {
            const [r,g,b] = vals;
            c1 = `rgba(${r}, ${g}, ${b}, 0.2)`;
            c2 = `rgba(${r}, ${g}, ${b}, 0.13)`;
        }
    } else {
        c1 = `${color}33`;
        c2 = `${color}22`;
    }
    ambient.style.background = `radial-gradient(circle at 20% 20%, ${c1}, transparent 45%), radial-gradient(circle at 80% 60%, ${c2}, transparent 55%)`;
}
// Derive an accent color from the cover art image
function deriveAccentFromCover(src) {
    return new Promise((resolve) => {
        if (!src) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const size = 60;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, size, size);
                const data = ctx.getImageData(0, 0, size, size).data;
                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < data.length; i += 4) {
                    r += data[i];
                    g += data[i + 1];
                    b += data[i + 2];
                    count++;
                }
                if (count === 0) return resolve(null);
                r = Math.round(r / count);
                g = Math.round(g / count);
                b = Math.round(b / count);
                resolve(`#${[r, g, b].map(v => v.toString(16).padStart(2,'0')).join('')}`);
            } catch (e) {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
}
// Apply cover-derived accent if enabled
async function applyCoverAccent(track) {
    if (!state.autoAccentFromArt || !track || !track.cover) return;
    const derived = await deriveAccentFromCover(track.cover);
    if (derived) {
        setAccentColor(derived, { fromAuto: true });
    }
}

// Derive mood tags from title/artist/duration for a track
function deriveMoodTags(track) {
    if (!track) return [];
    const haystack = `${track.title || ''} ${track.artist || ''}`.toLowerCase();
    const tags = new Set();
    const add = (t) => tags.add(t);
    const hasAny = (words) => words.some(w => haystack.includes(w));
    // Keyword-based moods
    if (hasAny(['chill', 'lofi', 'calm', 'ambient', 'mellow', 'vibe', 'sunset'])) add('chill');
    if (hasAny(['sad', 'blue', 'rain', 'moody', 'night', 'heartbreak', 'cry', 'lonely', 'alone'])) add('moody');
    if (hasAny(['soft', 'acoustic', 'piano', 'lullaby', 'unplugged'])) add('soft');
    if (hasAny(['slow', 'ballad', 'midnight', 'late'])) add('slow');
    if (hasAny(['hype', 'club', 'dance', 'remix', 'anthem', 'party', 'lit', 'bang'])) add('highkey');
    if (hasAny(['lowkey', 'minimal', 'quiet', 'mellow', 'lo key'])) add('lowkey');
    if (hasAny(['summer', 'beach', 'island', 'sun'])) add('chill');
    if (hasAny(['love', 'romance', 'kiss'])) add('soft');
    // Duration hints
    if (track.duration) {
        if (track.duration > 320) add('slow');
        if (track.duration < 180) add('highkey');
    }
    return Array.from(tags);
}

function applyMoodTags(track, moods) {
    if (!track || !moods || moods.length === 0) return false;
    const existing = Array.isArray(track.tags) ? track.tags : [];
    const merged = Array.from(new Set([...existing, ...moods]));
    const changed = merged.length !== existing.length;
    track.tags = merged;
    return changed;
}

// Apply mood tags across the library and persist the resulting metadata.
function autoTagLibrary() {
    const changedTracks = [];
    (state.tracks || []).forEach((track) => {
        const moodTags = deriveMoodTags(track);
        if (applyMoodTags(track, moodTags)) changedTracks.push(track);
    });
    if (!changedTracks.length) {
        showToast('No new mood tags detected.', 'info');
        return;
    }
    persistTagMutations(changedTracks);
    refreshAfterTagMutation();
    showToast(`Mood tags applied to ${changedTracks.length} track${changedTracks.length === 1 ? '' : 's'}.`, 'info');
}

// Apply mood tags to the currently playing library track and persist them.
function autoTagCurrent() {
    const track = state.tracks.find(t => t.id === state.currentTrackId);
    if (!track) { showToast('No track playing.', 'info'); return; }
    const moods = deriveMoodTags(track);
    if (!applyMoodTags(track, moods)) {
        showToast('No mood tags detected for this track.', 'info');
        return;
    }
    persistTagMutations(track);
    refreshAfterTagMutation();
    showToast(`Mood tags added: ${moods.join(', ')}`, 'info');
}

function getMoodAffinity(track, dialValue = 0) {
    if (!track) return 0;
    const tags = Array.isArray(track.tags) ? track.tags.map((t) => String(t).toLowerCase()) : [];
    const upbeatTags = new Set(['highkey', 'party', 'dance', 'hype', 'energetic']);
    const calmTags = new Set(['chill', 'moody', 'soft', 'slow', 'lowkey']);
    const upbeatHit = tags.some((t) => upbeatTags.has(t)) ? 1 : 0;
    const calmHit = tags.some((t) => calmTags.has(t)) ? 1 : 0;
    if (dialValue > 0) return upbeatHit - calmHit * 0.35;
    if (dialValue < 0) return calmHit - upbeatHit * 0.35;
    return (upbeatHit + calmHit) ? 0.2 : 0;
}

function registerSkipSignalForCurrentTrack() {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_smart_autoqueue)) return;
    const track = getCurrentTrack();
    if (!track || !Number.isFinite(els.audio.duration) || els.audio.duration <= 0) return;
    const pct = (els.audio.currentTime || 0) / els.audio.duration;
    if (pct >= 0.92) return;
    track.skipCount = (track.skipCount || 0) + 1;
    track.lastSkippedAt = Date.now();
    persistTrackMetadata(track);
}

function scoreTrackForSmartQueue(track, currentTrack = null) {
    const prefs = getAppSettings().queue;
    const now = Date.now();
    const ageDays = Math.max(0, (now - (track.addedAt || now)) / 86400000);
    const recency = Math.max(0, 1 - Math.min(ageDays / 365, 1));
    const playCount = Math.min((track.playCount || 0) / 50, 1);
    const skipPenalty = Math.min((track.skipCount || 0) / 20, 1);
    const favoriteBoost = track.isFavorite ? (prefs.favoriteWeight / 100) : 0;
    const sameArtistPenalty = currentTrack && currentTrack.artist && track.artist && currentTrack.artist === track.artist
        ? (prefs.sameArtistPenalty / 100)
        : 0;
    const duration = Number(track.duration || 0);
    const durationBias = duration <= 0 ? 0 : Math.max(-1, Math.min(1, (duration - 240) / 220));
    const longFormBias = durationBias * (prefs.longFormBias / 100);
    const tabBoost = (() => {
        if (state.activeTab === 'favorites' && track.isFavorite) return 1;
        if (state.activeTab === 'audio' && track.type === 'audio') return 1;
        if (state.activeTab === 'videos' && track.type === 'video') return 1;
        if (state.activeTab === 'tags' && state.tagFilter && Array.isArray(track.tags) && track.tags.includes(state.tagFilter)) return 1;
        return 0.3;
    })();
    const dialValue = isFeatureEnabled(FEATURE_REGISTRY.creative_mood_dial)
        ? Math.max(-100, Math.min(100, Number(state.moodDialState?.value ?? 0) || 0))
        : 0;
    const moodAffinity = getMoodAffinity(track, dialValue);
    const contextualAffinity = currentTrack && Array.isArray(currentTrack.tags) && Array.isArray(track.tags)
        ? currentTrack.tags.filter((tag) => track.tags.includes(tag)).length / Math.max(1, currentTrack.tags.length)
        : 0;
    const score =
        (recency * (prefs.recencyWeight / 100)) +
        (playCount * 0.25) +
        ((1 - skipPenalty) * 0.20) +
        (contextualAffinity * (prefs.tagAffinityWeight / 100)) +
        (tabBoost * 0.10) +
        (moodAffinity * 0.18) +
        favoriteBoost +
        longFormBias -
        sameArtistPenalty;
    return score;
}

function buildSmartAutoQueue(track, mediaType, options = {}) {
    const contextTab = sanitizeText(options.contextTab || state.activeTab || '');
    if (!canQueueTrackInContext(track, { contextTab })) return [];
    const list = (getQueueTracks(mediaType) || []).filter((item) => item && item.id !== track.id && canQueueTrackInContext(item, { contextTab }));
    return list.sort((a, b) => {
        const sa = scoreTrackForSmartQueue(a, track);
        const sb = scoreTrackForSmartQueue(b, track);
        if (sb !== sa) return sb - sa;
        const aAdded = Number(a.addedAt || 0);
        const bAdded = Number(b.addedAt || 0);
        if (bAdded !== aAdded) return bAdded - aAdded;
        return String(a.id || '').localeCompare(String(b.id || ''));
    }).map((item) => item.id);
}

function getAutoplayRadioOnlineContextLabel(playbackContext = 'search') {
    const context = normalizeOnlineMusicPlaybackContext(playbackContext || 'search');
    if (context === 'release') return 'From the current release';
    if (context === 'artist') return 'From the current artist context';
    return 'From the current online search';
}

function buildAutoplayRadioReason(track, currentTrack = null, options = {}) {
    if (!track) return '';
    if (options.source === 'online') {
        return sanitizeText(options.contextLabel || 'From your online music context');
    }
    const sharedTag = currentTrack && Array.isArray(currentTrack.tags) && Array.isArray(track.tags)
        ? currentTrack.tags.find((tag) => track.tags.includes(tag))
        : '';
    if (sharedTag) return `Shared tag: ${sharedTag}`;
    if (currentTrack?.artist && track.artist && currentTrack.artist === track.artist) {
        return `Same artist: ${track.artist}`;
    }
    if (track.isFavorite) return 'Favorite track';
    if (Number(track.playCount || 0) >= 3) return 'Strong listening history';
    if (Number(track.addedAt || 0) > 0 && (Date.now() - Number(track.addedAt || 0)) < 30 * 86400000) {
        return 'Recently added';
    }
    return 'From your library';
}

function buildAutoplayRadioQueue(currentTrack = null) {
    const anchorTrack = currentTrack || getActivePlaybackTrack();
    if (!anchorTrack || anchorTrack.type !== 'audio') {
        return { ids: [], reasons: {} };
    }
    const seenIds = new Set([sanitizeText(anchorTrack.id || '')].filter(Boolean));
    const ids = [];
    const reasons = {};
    const localCandidates = (state.tracks || [])
        .filter((track) => track && track.type === 'audio' && !seenIds.has(track.id) && canQueueTrackInContext(track))
        .sort((left, right) => {
            const rightScore = scoreTrackForSmartQueue(right, anchorTrack);
            const leftScore = scoreTrackForSmartQueue(left, anchorTrack);
            if (rightScore !== leftScore) return rightScore - leftScore;
            const rightAdded = Number(right.addedAt || 0);
            const leftAdded = Number(left.addedAt || 0);
            if (rightAdded !== leftAdded) return rightAdded - leftAdded;
            return String(left.id || '').localeCompare(String(right.id || ''));
        })
        .slice(0, 15);

    localCandidates.forEach((track) => {
        seenIds.add(track.id);
        ids.push(track.id);
        reasons[track.id] = buildAutoplayRadioReason(track, anchorTrack, { source: 'local' });
    });

    if (ids.length < 5 && isOnlineMusicPlaybackActive() && getOnlineMusicState().playbackContext !== 'library') {
        const online = getOnlineMusicState();
        const context = normalizeOnlineMusicPlaybackContext(online.queueContextView || online.playbackContext || 'search');
        const contextLabel = getAutoplayRadioOnlineContextLabel(context);
        getOnlineMusicTracksForView(context)
            .filter((track) => track && !seenIds.has(track.id) && canQueueTrackInContext(track))
            .some((track) => {
                seenIds.add(track.id);
                ids.push(track.id);
                reasons[track.id] = buildAutoplayRadioReason(track, anchorTrack, {
                    source: 'online',
                    contextLabel
                });
                return ids.length >= 15;
            });
    }

    return { ids, reasons };
}

async function startAutoplayRadio(options = {}) {
    if (!getAppSettings().onlineMusic?.autoplayRadioEnabled) return false;
    const currentTrack = options.currentTrack || getActivePlaybackTrack();
    if (!currentTrack || currentTrack.type !== 'audio') return false;
    const radioQueue = buildAutoplayRadioQueue(currentTrack);
    if (!radioQueue.ids.length) return false;
    const [firstId, ...upcomingIds] = radioQueue.ids;
    state.autoplayRadioState = {
        active: true,
        source: isOnlineMusicPlaybackActive() && getOnlineMusicState().playbackContext !== 'library' ? 'online' : 'local',
        generatedAt: Date.now(),
        reasons: radioQueue.reasons
    };
    const radioTracks = [currentTrack, firstId, ...upcomingIds]
        .map((trackOrId) => typeof trackOrId === 'string' ? resolveQueueDisplayTrack(trackOrId) : trackOrId)
        .filter(Boolean);
    setUnifiedAudioQueueFromTrackList(radioTracks, currentTrack.id, {
        queueSource: 'radio',
        isShuffle: false,
        repeatMode: getUnifiedAudioQueueState().repeatMode || 'none',
        resetFailures: true
    });
    showToast('Autoplay radio started.', 'info');
    await playResolvedTrackFromQueue(firstId, {
        autoplay: true,
        allowCrossfade: false
    });
    return true;
}

function generateStoryModeQueue(options = {}) {
    if (!isFeatureEnabled(FEATURE_REGISTRY.creative_story_mode)) return;
    const prefs = getAppSettings().queue;
    const aggression = prefs.storyModeAggression / 100;
    const requestedMediaType = sanitizeText(options?.mediaType || '').toLowerCase();
    const mediaType = requestedMediaType === 'audio' || requestedMediaType === 'video'
        ? requestedMediaType
        : currentMediaType();
    const activeTrack = getActivePlaybackTrack();
    const anchorTrack = activeTrack && activeTrack.type === mediaType ? activeTrack : null;
    const source = getQueueTracks(mediaType).filter((track) => track && canQueueTrackInContext(track));
    if (!source.length) {
        if (anchorTrack && !canQueueTrackInContext(anchorTrack)) notifyQueueSourceBlocked(anchorTrack);
        else showToast(`No ${mediaType} tracks available for Story Mode.`, 'info');
        return;
    }
    const scored = source.map((track) => {
        const duration = Number(track.duration || 0);
        const longForm = duration > 320 ? 0.45 : 0;
        const shortForm = duration > 0 && duration < 190 ? 0.35 : 0;
        const energy = (getMoodAffinity(track, 100) * (1 + aggression * 0.7)) + ((track.playCount || 0) / 40) + shortForm + ((Array.isArray(track.tags) && track.tags.includes('highkey')) ? 0.6 : 0);
        const calm = (getMoodAffinity(track, -100) * (1 + (1 - aggression) * 0.25)) + longForm + ((Array.isArray(track.tags) && (track.tags.includes('chill') || track.tags.includes('moody'))) ? 0.6 : 0);
        return { track, energy, calm };
    });
    const warmupShare = Math.max(0.2, 0.38 - aggression * 0.12);
    const peakShare = Math.min(0.45, 0.28 + aggression * 0.17);
    const warmup = scored.slice().sort((a, b) => b.calm - a.calm).slice(0, Math.ceil(source.length * warmupShare)).map((x) => x.track.id);
    const peak = scored.slice().sort((a, b) => b.energy - a.energy).slice(0, Math.ceil(source.length * peakShare)).map((x) => x.track.id);
    const used = new Set([...warmup, ...peak]);
    const cooldown = scored.filter((x) => !used.has(x.track.id)).sort((a, b) => b.calm - a.calm).map((x) => x.track.id);
    const ordered = [...warmup, ...peak, ...cooldown]
        .filter((id, idx, arr) => arr.indexOf(id) === idx)
        .filter((id) => id !== anchorTrack?.id);
    const orderedTracks = [anchorTrack, ...ordered.map((id) => resolveQueueDisplayTrack(id))]
        .filter(Boolean);
    const targetTrackId = anchorTrack?.id || orderedTracks[0]?.id || '';
    setUnifiedAudioQueueFromTrackList(orderedTracks, targetTrackId, {
        queueSource: 'manual',
        isShuffle: false,
        repeatMode: getUnifiedAudioQueueState().repeatMode || 'none',
        resetFailures: true
    });
    state.storyModeState = sanitizeStoryModeState({
        lastGeneratedAt: Date.now(),
        lastSummary: {
            count: ordered.length,
            warmup: warmup.length,
            peak: peak.length,
            cooldown: cooldown.length
        }
    });
    persistExtendedStores();
    saveActiveQueueBucket();
    if (state.activeTab === 'settings') renderSettingsTab();
    showToast(`Story queue ready (${ordered.length} tracks).`, 'info');
}

function getCoverWallTracks(limit = 12) {
    const scored = (state.tracks || []).filter(Boolean).map((track) => {
        const playWeight = Math.min((track.playCount || 0) / 25, 1) * 0.65;
        const recencyWeight = Math.max(0, 1 - Math.min((Date.now() - (track.addedAt || Date.now())) / (1000 * 60 * 60 * 24 * 30), 1)) * 0.35;
        return { track, weight: playWeight + recencyWeight };
    });
    return scored.sort((a, b) => b.weight - a.weight).slice(0, limit).map((item) => item.track);
}

function renderCoverWallModule() {
    if (!isFeatureEnabled(FEATURE_REGISTRY.creative_dynamic_cover_wall)) return '';
    const picks = getCoverWallTracks(12);
    if (!picks.length) return '<div class="text-xs text-gray-500">No artwork available for cover wall.</div>';
    const nextIds = picks.map((track) => track.id);
    const prevIds = Array.isArray(state.coverWallState?.cachedTrackIds) ? state.coverWallState.cachedTrackIds : [];
    const changed = prevIds.length !== nextIds.length || prevIds.some((id, idx) => id !== nextIds[idx]);
    if (changed) {
        state.coverWallState = sanitizeCoverWallState({
            lastUpdatedAt: Date.now(),
            cachedTrackIds: nextIds
        });
    }
    if (changed || Date.now() - lastCoverWallStorePersist > 12000) {
        writeStorageJson(EXTENDED_STORAGE_KEYS.coverWallState, sanitizeCoverWallState(state.coverWallState));
        lastCoverWallStorePersist = Date.now();
    }
    const cards = picks.map((track) => {
        const img = track.cover ? `<img src="${track.cover}" loading="lazy" decoding="async" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-gray-600"><i data-lucide="${track.type === 'video' ? 'video' : 'music'}" class="w-5 h-5"></i></div>`;
        return `<button onclick="loadTrack('${track.id}', true)" class="aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/40 hover:scale-[1.03] transition">${img}</button>`;
    }).join('');
    return `<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">${cards}</div>`;
}

function applyBeatReactiveStyles(dataArray) {
    if (!isFeatureEnabled(FEATURE_REGISTRY.creative_beat_reactive_ui)) return;
    const sample = Math.min(dataArray.length, 48);
    if (!sample) return;
    const now = performance.now();
    const perfTier = getEffectivePerformanceTier();
    const minWriteMs = perfTier === 'low' ? 220 : perfTier === 'degraded' ? 150 : 95;
    if (now - lastBeatReactiveWriteTs < minWriteMs) return;
    let total = 0;
    for (let i = 0; i < sample; i += 1) total += dataArray[i];
    const intensity = Math.max(0, Math.min(1, total / (sample * 255)));
    const tierScale = perfTier === 'low' ? 0.4 : perfTier === 'degraded' ? 0.64 : 1;
    const moodBoost = isFeatureEnabled(FEATURE_REGISTRY.creative_mood_dial)
        ? 1 + (Math.abs(Number(state.moodDialState?.value || 0)) / 100) * 0.25
        : 1;
    const finalIntensity = Math.max(0, Math.min(1, intensity * tierScale * moodBoost));
    const quantized = Number(finalIntensity.toFixed(4));
    if (lastBeatReactiveValue >= 0 && Math.abs(lastBeatReactiveValue - quantized) < 0.02) return;
    document.documentElement.style.setProperty('--beat-intensity', quantized.toFixed(4));
    lastBeatReactiveValue = quantized;
    lastBeatReactiveWriteTs = now;
}

const PERFORMANCE_TIER_ORDER = Object.freeze({ normal: 0, degraded: 1, low: 2 });

function normalizeMeasuredPerformanceTier(tier = 'normal') {
    return Object.prototype.hasOwnProperty.call(PERFORMANCE_TIER_ORDER, tier) ? tier : 'normal';
}

function getSelectedDesktopPerformancePreset() {
    const preset = String(state.desktopPerformancePreset || '').trim().toLowerCase();
    return preset === 'low-end' || preset === 'high-end' ? preset : '';
}

function getEffectivePerformanceTier(measuredTier = state.perfPolicy?.tier || 'normal') {
    if (getSelectedDesktopPerformancePreset() === 'low-end') return 'low';
    return normalizeMeasuredPerformanceTier(measuredTier);
}

function getDesktopPerformancePresetRecommendation() {
    if (typeof navigator === 'undefined') return 'high-end';
    const logicalCores = Number(navigator.hardwareConcurrency || 0);
    const deviceMemory = Number(navigator.deviceMemory || 0);
    const constrainedCpu = logicalCores > 0 && logicalCores <= 4;
    const constrainedMemory = deviceMemory > 0 && deviceMemory <= 4;
    return constrainedCpu || constrainedMemory ? 'low-end' : 'high-end';
}

function proposeMeasuredPerformanceTier(currentTier = 'normal', fps = 60) {
    const tier = normalizeMeasuredPerformanceTier(currentTier);
    const measuredFps = Number.isFinite(Number(fps)) ? Number(fps) : 60;
    if (tier === 'low') return measuredFps >= 39 ? 'degraded' : 'low';
    if (tier === 'degraded') {
        if (measuredFps < 29) return 'low';
        return measuredFps >= 52 ? 'normal' : 'degraded';
    }
    if (measuredFps < 30) return 'low';
    return measuredFps < 44 ? 'degraded' : 'normal';
}

function getInitialPerformanceTierHint() {
    if (typeof navigator === 'undefined') return 'normal';
    const logicalCores = Number(navigator.hardwareConcurrency || 0);
    const deviceMemory = Number(navigator.deviceMemory || 0);
    const constrainedCpu = logicalCores > 0 && logicalCores <= 2;
    const constrainedMemory = deviceMemory > 0 && deviceMemory <= 2;
    return constrainedCpu || constrainedMemory ? 'degraded' : 'normal';
}

function applyMeasuredPerformanceTier(tier = 'normal') {
    if (!document.body) return;
    const measuredTier = normalizeMeasuredPerformanceTier(tier);
    const nextTier = getEffectivePerformanceTier(measuredTier);
    const selectedPreset = getSelectedDesktopPerformancePreset();
    const shouldDegrade = nextTier !== 'normal';
    document.body.classList.toggle('performance-preset-low-end', selectedPreset === 'low-end');
    document.body.classList.toggle('performance-preset-high-end', selectedPreset === 'high-end');
    document.body.classList.toggle('creative-throttle-degraded', shouldDegrade);
    document.body.classList.toggle('creative-throttle-low', nextTier === 'low');
    document.body.setAttribute('data-performance-preset', selectedPreset || 'unselected');
    document.body.setAttribute('data-measured-perf-tier', measuredTier);
    if (shouldDegrade) document.body.setAttribute('data-perf-tier', nextTier);
    else document.body.removeAttribute('data-perf-tier');
}

function applyDesktopPerformancePresetRuntime() {
    applyMeasuredPerformanceTier(state.perfPolicy?.tier || 'normal');
    return getEffectivePerformanceTier();
}

function stopPerfSampler() {
    if (perfSamplerRafId && perfSamplerRafId !== -1 && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(perfSamplerRafId);
    }
    if (perfSamplerTimeoutId) clearTimeout(perfSamplerTimeoutId);
    perfSamplerRafId = 0;
    perfSamplerTimeoutId = null;
}

function closeDesktopPerformancePresetOnboarding() {
    const modal = document.getElementById('performance-preset-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('performance-preset-dialog-open');
}

function handleDesktopPerformancePresetDialogKeydown(event) {
    const modal = document.getElementById('performance-preset-modal');
    if (!modal || !modal.classList.contains('is-open')) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        return;
    }
    if (event.key !== 'Tab') return;
    const choices = Array.from(modal.querySelectorAll('[data-performance-choice]'))
        .filter((button) => !button.disabled);
    if (!choices.length) return;
    const first = choices[0];
    const last = choices[choices.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function maybeShowDesktopPerformancePresetOnboarding(options = {}) {
    const route = String(options.route || '').trim().toLowerCase();
    if (route === 'private-session' || getSelectedDesktopPerformancePreset()) return false;
    const modal = document.getElementById('performance-preset-modal');
    if (!modal) return false;
    const recommendedPreset = getDesktopPerformancePresetRecommendation();
    modal.querySelectorAll('[data-performance-choice]').forEach((button) => {
        const isRecommended = button.getAttribute('data-performance-choice') === recommendedPreset;
        button.classList.toggle('is-recommended', isRecommended);
        const badge = button.querySelector('[data-performance-recommendation]');
        if (badge) badge.classList.toggle('hidden', !isRecommended);
    });
    modal.classList.remove('hidden');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('performance-preset-dialog-open');
    const recommendedChoice = modal.querySelector(`[data-performance-choice="${recommendedPreset}"]`);
    requestAnimationFrame(() => (recommendedChoice || modal).focus());
    return true;
}

function selectDesktopPerformancePreset(value, options = {}) {
    const preset = String(value || '').trim().toLowerCase();
    if (preset !== 'low-end' && preset !== 'high-end') return false;
    const previousPreset = getSelectedDesktopPerformancePreset();
    state.desktopPerformancePreset = preset;
    persistDesktopPerformancePreset(preset);
    if (preset === 'low-end') stopPerfSampler();
    applyDesktopPerformancePresetRuntime();
    if (preset === 'high-end') startPerfSampler();
    closeDesktopPerformancePresetOnboarding();
    if (state.activeTab === 'settings' && typeof renderSettingsTab === 'function') renderSettingsTab();
    if (options.announce !== false && previousPreset !== preset && typeof showToast === 'function') {
        showToast(`${preset === 'low-end' ? 'Low End PCs' : 'High End'} performance preset saved.`, 'success');
    }
    return true;
}

function startPerfSampler() {
    if (perfSamplerRafId) return;
    if (getSelectedDesktopPerformancePreset() === 'low-end') {
        stopPerfSampler();
        applyDesktopPerformancePresetRuntime();
        return;
    }
    let lastTs = performance.now();
    let frames = 0;
    const sampleWindowMs = 2000;
    const idleSampleDelayMs = 3500;
    const hiddenSampleDelayMs = 1200;
    let pendingTier = normalizeMeasuredPerformanceTier(state.perfPolicy?.tier || 'normal');
    let pendingCount = 0;
    let wasDocumentHidden = !!document.hidden;

    if (!Number(state.perfPolicy?.updatedAt || 0)) {
        const hintedTier = getInitialPerformanceTierHint();
        if (hintedTier !== 'normal') {
            state.perfPolicy = {
                fps: Number(state.perfPolicy?.fps || 60),
                tier: hintedTier,
                updatedAt: Date.now()
            };
            pendingTier = hintedTier;
        }
    }
    applyMeasuredPerformanceTier(state.perfPolicy?.tier || 'normal');

    function isHighMotionContext() {
        return !!(
            state.isPlaying
            || state.windowedModeActive
            || state.fsModeActive
            || state.videoFsModeActive
            || state.activeTab === 'music-games'
        );
    }

    function resetSampleWindow() {
        lastTs = performance.now();
        frames = 0;
    }

    function queueNext(delayMs = 0) {
        if (getSelectedDesktopPerformancePreset() === 'low-end') {
            stopPerfSampler();
            applyDesktopPerformancePresetRuntime();
            return;
        }
        if (perfSamplerTimeoutId) {
            clearTimeout(perfSamplerTimeoutId);
            perfSamplerTimeoutId = null;
        }
        if (delayMs > 0) {
            // Keep the global sampler guard truthy while a delayed sample is pending.
            perfSamplerRafId = -1;
            perfSamplerTimeoutId = setTimeout(() => {
                perfSamplerTimeoutId = null;
                if (getSelectedDesktopPerformancePreset() === 'low-end') {
                    stopPerfSampler();
                    applyDesktopPerformancePresetRuntime();
                    return;
                }
                resetSampleWindow();
                applyMeasuredPerformanceTier(state.perfPolicy?.tier || 'normal');
                perfSamplerRafId = requestAnimationFrame(tick);
            }, delayMs);
            return;
        }
        perfSamplerRafId = requestAnimationFrame(tick);
    }

    function tick(now) {
        perfSamplerRafId = 0;
        if (getSelectedDesktopPerformancePreset() === 'low-end') {
            stopPerfSampler();
            applyDesktopPerformancePresetRuntime();
            return;
        }
        if (document.hidden) {
            wasDocumentHidden = true;
            queueNext(hiddenSampleDelayMs);
            return;
        }
        if (wasDocumentHidden) {
            wasDocumentHidden = false;
            resetSampleWindow();
            queueNext(0);
            return;
        }

        frames += 1;
        const elapsed = now - lastTs;
        if (elapsed >= sampleWindowMs) {
            const fps = (frames * 1000) / elapsed;
            const currentTier = normalizeMeasuredPerformanceTier(state.perfPolicy?.tier || 'normal');
            const proposedTier = proposeMeasuredPerformanceTier(currentTier, fps);
            let nextTier = currentTier;
            if (proposedTier === currentTier) {
                pendingTier = currentTier;
                pendingCount = 0;
            } else {
                if (proposedTier === pendingTier) pendingCount += 1;
                else {
                    pendingTier = proposedTier;
                    pendingCount = 1;
                }
                const isDowngrade = PERFORMANCE_TIER_ORDER[proposedTier] > PERFORMANCE_TIER_ORDER[currentTier];
                const requiredSamples = isDowngrade ? 2 : 3;
                if (pendingCount >= requiredSamples) {
                    nextTier = proposedTier;
                    pendingTier = nextTier;
                    pendingCount = 0;
                }
            }

            state.perfPolicy = { fps, tier: nextTier, updatedAt: Date.now() };
            applyMeasuredPerformanceTier(nextTier);
            resetSampleWindow();
            queueNext(isHighMotionContext() ? 0 : idleSampleDelayMs);
            return;
        }
        queueNext(0);
    }
    queueNext(0);
}
// Map visualizer style id to a friendly label
function formatVisualizerLabel(style) {
    const labels = {
        bars: 'Bars',
        wave: 'Waveform',
        dots: 'Particles'
    };
    return labels[style] || 'Visualizer Style';
}
// Update menu highlighting and the visible label to reflect the current style
function syncVisualizerMenu(style) {
    const buttons = document.querySelectorAll('#viz-menu button[data-style]');
    buttons.forEach(btn => {
        const active = btn.dataset.style === style;
        btn.classList.toggle('bg-white/10', active);
        btn.classList.toggle('text-cyan-400', active);
    });
    const label = document.getElementById('viz-label');
    if (label) {
        label.textContent = formatVisualizerLabel(style);
    }
}
/**
 * Set the current visualizer style.  Supported values: 'bars', 'wave', 'dots'.
 */
function setVisualizerStyle(style) {
    const safeStyle = normalizeVisualizerStyle(style);
    state.visualizerStyle = safeStyle;
    syncVisualizerMenu(safeStyle);
    const menu = document.getElementById('viz-menu');
    if (menu) {
        menu.classList.remove('menu-open');
        setTimeout(() => menu.classList.add('hidden'), 150);
    }
    persistAppStateNow();
}

// --- SHORTCUTS SETTINGS ---
let shortcutsModalReturnFocus = null;

function openShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    if (!modal) return;
    shortcutsModalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const list = document.getElementById('shortcuts-list');
    if (list) {
        list.innerHTML = '';
	                const pretty = {
	                    playPause: 'Play/Pause',
	                    next: 'Next Track',
	                    prev: 'Previous Track',
	                    volumeUp: 'Volume Up',
	                    volumeDown: 'Volume Down',
	                    mute: 'Mute',
	                    fsModeToggle: 'Immersive Mode'
	                };
        Object.keys(state.keyBindings).forEach(action => {
            const val = state.keyBindings[action];
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between gap-2';
            row.innerHTML = `
                <span class="text-sm text-gray-300 font-mono uppercase tracking-wide">${pretty[action] || action}</span>
                <input type="text" class="w-24 px-2 py-1 rounded bg-black/50 text-white border border-white/10 text-xs text-center font-bold shortcut-input" id="shortcut-${action}" name="shortcut-${action}" value="${val}" />
            `;
            list.appendChild(row);
        });
    }
    // Render icons for any new dynamic elements (like the keyboard icon)
    refreshLucideIcons();
    // Attach keydown listeners to each shortcut input so pressing a key captures the event.code
    const inputs = list.querySelectorAll('.shortcut-input');
    inputs.forEach(input => {
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Tab') return;
            if (ev.key === 'Escape') {
                ev.preventDefault();
                closeShortcutsModal();
                return;
            }
            ev.preventDefault();
            // Use event.code to store the physical key (e.g., "KeyM", "ArrowUp")
            input.value = ev.code;
        });
    });
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    window.requestAnimationFrame(() => inputs[0]?.focus());
}
function closeShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    if (shortcutsModalReturnFocus?.isConnected) shortcutsModalReturnFocus.focus();
    shortcutsModalReturnFocus = null;
}
function saveShortcuts() {
    // Iterate over inputs and update keyBindings
    const inputs = document.querySelectorAll('.shortcut-input');
    inputs.forEach(inp => {
        const action = inp.id.replace('shortcut-', '');
        const val = inp.value.trim();
        if (val) {
            state.keyBindings[action] = val;
        }
    });
    closeShortcutsModal();
}
function normalizeCommandPaletteText(value = '') {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}
function getCommandPaletteContextConfig(context = state.commandPaletteContext) {
    const defaults = {
        title: 'Command Palette',
        subtitle: 'Jump through NexPlay actions, views, and tracks.',
        placeholder: 'Search commands, tabs, or tracks...'
    };
    if (!context || !context.kind) return defaults;
    if (context.kind === 'track') {
        const track = state.tracks.find(item => item.id === context.trackId);
        if (!track) return defaults;
        const label = track.title || track.fileName || 'Untitled Track';
        const subtitle = [label, track.artist || (track.type === 'video' ? 'Video' : 'Audio')].filter(Boolean).join(' - ');
        return {
            title: 'Track Actions',
            subtitle,
            placeholder: 'Search track actions or NexPlay commands...'
        };
    }
    if (context.kind === 'selection') {
        const count = Math.max(0, Array.isArray(context.selectionIds) ? context.selectionIds.length : 0);
        return {
            title: 'Selection Actions',
            subtitle: `${count} track${count === 1 ? '' : 's'} selected`,
            placeholder: 'Search selection actions or NexPlay commands...'
        };
    }
    if (context.kind === 'library') {
        const activeTab = NAV_TABS.find(tab => tab.id === state.activeTab);
        return {
            title: 'Library Actions',
            subtitle: activeTab ? `${activeTab.l} shortcuts for the current view` : 'Right-click shortcuts for the current view',
            placeholder: 'Search library actions or NexPlay commands...'
        };
    }
    return defaults;
}
function updateCommandPaletteChrome() {
    const config = getCommandPaletteContextConfig();
    if (els.commandPaletteTitle) els.commandPaletteTitle.textContent = config.title;
    if (els.commandPaletteSubtitle) els.commandPaletteSubtitle.textContent = config.subtitle;
    if (els.commandPaletteInput) els.commandPaletteInput.placeholder = config.placeholder;
}
function filterCommandPaletteItems(entries = [], normalizedQuery = '') {
    const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (!normalizedQuery) return list;
    return list
        .map(entry => {
            const label = normalizeCommandPaletteText(entry.label);
            const hint = normalizeCommandPaletteText(entry.hint || '');
            const keywords = normalizeCommandPaletteText(entry.keywords || '');
            const haystack = `${label} ${hint} ${keywords}`.trim();
            if (!haystack.includes(normalizedQuery)) return null;
            let score = 0;
            if (label.startsWith(normalizedQuery)) score += 12;
            else if (label.includes(normalizedQuery)) score += 8;
            if (hint.includes(normalizedQuery)) score += 3;
            if (keywords.includes(normalizedQuery)) score += 2;
            return { ...entry, _score: score };
        })
        .filter(Boolean)
        .sort((a, b) => b._score - a._score || a.label.localeCompare(b.label))
        .map(({ _score, ...entry }) => entry);
}
function getCommandPaletteContextEntries(query) {
    const context = state.commandPaletteContext;
    if (!context || !context.kind) return [];
    const normalizedQuery = normalizeCommandPaletteText(query);
    const selectedIds = Array.from(new Set((context.selectionIds || []).filter(Boolean)));
    const track = context.trackId ? state.tracks.find(item => item.id === context.trackId) : null;
    if (context.kind === 'track' && track) {
        const trackLabel = track.title || track.fileName || 'Untitled Track';
        const isSelected = selectedIds.includes(track.id);
        const entries = [
            {
                id: `context-play-${track.id}`,
                group: 'Track',
                label: `Play ${trackLabel}`,
                hint: track.artist || (track.type === 'video' ? 'Video' : 'Audio'),
                keywords: 'play open start now current',
                icon: 'play',
                run: () => loadTrack(track.id, true)
            },
            {
                id: `context-queue-${track.id}`,
                group: 'Track',
                label: 'Add to Queue',
                hint: trackLabel,
                keywords: 'queue upcoming next later',
                icon: 'plus',
                run: () => addToQueue(null, track.id)
            },
            {
                id: `context-playlist-${track.id}`,
                group: 'Track',
                label: 'Add to Playlist',
                hint: trackLabel,
                keywords: 'playlist collection save mix',
                icon: 'list-plus',
                run: () => openPlaylistModal(track.id)
            },
            {
                id: `context-favorite-${track.id}`,
                group: 'Track',
                label: track.isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
                hint: trackLabel,
                keywords: 'favorite like heart saved',
                icon: 'heart',
                run: () => toggleFavorite(null, track.id)
            },
            {
                id: `context-select-${track.id}`,
                group: 'Track',
                label: isSelected ? 'Remove from Selection' : 'Select Track',
                hint: isSelected ? 'Currently selected' : 'Add this track to the current selection',
                keywords: 'select deselect bulk multi select',
                icon: 'check',
                run: () => toggleTrackSelection(null, track.id)
            },
            {
                id: `context-edit-${track.id}`,
                group: 'Track',
                label: 'Edit Metadata',
                hint: trackLabel,
                keywords: 'edit metadata title artist tags cover',
                icon: 'edit',
                run: () => openEditModal(track.id)
            },
            {
                id: `context-delete-${track.id}`,
                group: 'Track',
                label: 'Delete Track',
                hint: trackLabel,
                keywords: 'delete remove trash',
                icon: 'trash-2',
                run: () => confirmDeleteTrack(null, track.id)
            }
        ];
        if (state.currentTrackId === track.id) {
            entries.splice(1, 0, {
                id: `context-focus-${track.id}`,
                group: 'Track',
                label: track.type === 'video' ? 'Toggle Video Fullscreen' : 'Toggle Immersive Mode',
                hint: 'Focus the current track',
                keywords: 'fullscreen immersive cinema focus current',
                icon: 'maximize',
                run: () => toggleFsModeForCurrentTrack()
            });
        }
        return filterCommandPaletteItems(entries, normalizedQuery);
    }
    if (context.kind === 'selection' && selectedIds.length > 1) {
        const selectionLabel = `${selectedIds.length} selected track${selectedIds.length === 1 ? '' : 's'}`;
        const entries = [
            {
                id: 'context-selection-queue',
                group: 'Selection',
                label: 'Queue Selected Tracks',
                hint: selectionLabel,
                keywords: 'queue selected bulk upcoming',
                icon: 'list-music',
                run: () => {
                    setSelectedTrackIds(selectedIds);
                    bulkAddToQueue();
                }
            },
            {
                id: 'context-selection-playlist',
                group: 'Selection',
                label: 'Add Selection to Playlist',
                hint: selectionLabel,
                keywords: 'playlist selected bulk save collection',
                icon: 'list-plus',
                run: () => {
                    setSelectedTrackIds(selectedIds);
                    openPlaylistModalForSelection();
                }
            },
            {
                id: 'context-selection-clear',
                group: 'Selection',
                label: 'Clear Selection',
                hint: selectionLabel,
                keywords: 'clear selection deselect reset',
                icon: 'x',
                run: () => clearSelection()
            },
            {
                id: 'context-selection-delete',
                group: 'Selection',
                label: 'Delete Selected Tracks',
                hint: selectionLabel,
                keywords: 'delete remove selected trash bulk',
                icon: 'trash-2',
                run: () => {
                    setSelectedTrackIds(selectedIds);
                    bulkDelete();
                }
            }
        ];
        if (track) {
            entries.unshift({
                id: `context-selection-play-${track.id}`,
                group: 'Track',
                label: `Play ${track.title || track.fileName || 'Selected Track'}`,
                hint: track.artist || (track.type === 'video' ? 'Video' : 'Audio'),
                keywords: 'play selected anchor current',
                icon: 'play',
                run: () => loadTrack(track.id, true)
            });
        }
        return filterCommandPaletteItems(entries, normalizedQuery);
    }
    if (context.kind === 'library') {
        const entries = [
            {
                id: 'context-library-search',
                group: 'Library',
                label: 'Focus Library Search',
                hint: 'Jump to the main search box',
                keywords: 'search filter find focus',
                icon: 'search',
                run: () => focusLibrarySearch()
            },
            {
                id: 'context-library-import',
                group: 'Library',
                label: 'Import Media Files',
                hint: 'Open the file picker',
                keywords: 'import upload add files media',
                icon: 'plus',
                run: () => requestMediaImport()
            },
            {
                id: 'context-library-multiselect',
                group: 'Library',
                label: state.multiSelectMode ? 'Turn Off Multi-Select' : 'Turn On Multi-Select',
                hint: state.multiSelectMode ? `${state.selectedTrackIds.length} currently selected` : 'Enable bulk selection controls',
                keywords: 'multi select bulk selection mode',
                icon: 'check',
                run: () => toggleMultiSelectMode()
            },
            {
                id: 'context-library-view',
                group: 'Library',
                label: state.viewMode === 'list' ? 'Switch to Grid View' : 'Switch to List View',
                hint: `Current view: ${state.viewMode}`,
                keywords: 'view grid list layout',
                icon: 'command',
                run: () => setViewMode(state.viewMode === 'list' ? 'grid' : 'list')
            },
            {
                id: 'context-library-queue',
                group: 'Library',
                label: state.isQueueOverlayOpen ? 'Hide Queue Overlay' : 'Show Queue Overlay',
                hint: `${state.queue.length} queued`,
                keywords: 'queue overlay up next upcoming',
                icon: 'list-music',
                run: () => toggleQueueOverlay()
            }
        ];
        return filterCommandPaletteItems(entries, normalizedQuery);
    }
    return [];
}
function getCommandPaletteActions() {
    const currentTrack = getCurrentTrack();
    const actions = [
        { id: 'tab-all', group: 'Views', label: 'Go to Library', hint: `${state.tracks.length} tracks`, keywords: 'library all collection home', run: () => changeTab('all') },
        { id: 'tab-audio', group: 'Views', label: 'Go to Audio', hint: 'Audio library', keywords: 'audio songs music', run: () => changeTab('audio') },
        { id: 'tab-videos', group: 'Views', label: 'Go to Videos', hint: 'Video library', keywords: 'videos movies clips', run: () => changeTab('videos') },
        { id: 'tab-online-videos', group: 'Views', label: 'Go to Online Videos', hint: 'URL hub', keywords: 'online videos youtube vimeo links', run: () => changeTab('online-videos') },
        { id: 'tab-favorites', group: 'Views', label: 'Go to Favorites', hint: 'Liked media', keywords: 'favorites liked heart saved', run: () => changeTab('favorites') },
        { id: 'tab-playlists', group: 'Views', label: 'Go to Playlists', hint: 'Your playlists', keywords: 'playlists mixes collections', run: () => changeTab('playlists') },
        { id: 'tab-history', group: 'Views', label: 'Go to History', hint: 'Recently played', keywords: 'history recent played', run: () => changeTab('history') },
        { id: 'tab-top', group: 'Views', label: 'Go to Top Played', hint: 'Usage ranking', keywords: 'top played popular ranking most played', run: () => changeTab('top') },
        { id: 'tab-stats', group: 'Views', label: 'Go to Stats', hint: 'Charts and listening data', keywords: 'stats analytics charts listening history', run: () => changeTab('stats') },
        { id: 'tab-tags', group: 'Views', label: 'Go to Tags', hint: 'Metadata filters', keywords: 'tags labels metadata', run: () => changeTab('tags') },
    { id: 'tab-smart', group: 'Views', label: 'Go to Smart', hint: 'Smart playlists', keywords: 'smart queue surprise story mode', run: () => changeTab('smart') },
    { id: 'tab-music-games', group: 'Views', label: 'Go to Music Games', hint: 'Library-powered mini-games', keywords: 'music games math unlock snake song race memory lyrics artist guess', run: () => changeTab('music-games') },
    { id: 'tab-settings', group: 'Views', label: 'Go to Settings', hint: 'System controls', keywords: 'settings preferences options', run: () => changeTab('settings') },
    { id: 'tab-notypad', group: 'Views', label: 'Go to NotyPad', hint: 'Auto-saved notes', keywords: 'notes notepad text scratch pad draft writing', run: () => changeTab('notypad') },
        { id: 'focus-search', group: 'Actions', label: 'Focus Library Search', hint: 'Jump to the main search box', keywords: 'search find filter focus', run: () => focusLibrarySearch() },
        { id: 'import-media', group: 'Actions', label: 'Import Media Files', hint: 'Open file picker', keywords: 'import upload files add music video', run: () => requestMediaImport() },
        { id: 'toggle-view', group: 'Actions', label: state.viewMode === 'list' ? 'Switch to Grid View' : 'Switch to List View', hint: `Current: ${state.viewMode}`, keywords: 'view grid list layout cards rows', run: () => setViewMode(state.viewMode === 'list' ? 'grid' : 'list') },
        { id: 'toggle-queue', group: 'Actions', label: state.isQueueOverlayOpen ? 'Hide Queue Overlay' : 'Show Queue Overlay', hint: `${state.queue.length} queued`, keywords: 'queue overlay now playing upcoming', run: () => toggleQueueOverlay() },
        { id: 'toggle-eq', group: 'Actions', label: 'Toggle Equalizer Panel', hint: '10-band EQ', keywords: 'equalizer eq audio tuning frequencies', run: () => toggleEQPanel() },
        { id: 'toggle-shuffle', group: 'Actions', label: state.isShuffle ? 'Turn Shuffle Off' : 'Turn Shuffle On', hint: state.isShuffle ? 'Currently enabled' : 'Currently disabled', keywords: 'shuffle random order', run: () => toggleShuffle() },
        { id: 'cycle-repeat', group: 'Actions', label: 'Cycle Repeat Mode', hint: `Current: ${state.repeatMode || 'none'}`, keywords: 'repeat loop one all', run: () => cycleRepeat() },
        { id: 'toggle-theme', group: 'Actions', label: state.isDarkMode ? 'Use Light Theme' : 'Use Dark Theme', hint: `Current: ${state.isDarkMode ? 'dark' : 'light'}`, keywords: 'theme dark light appearance', run: () => toggleTheme() },
        { id: 'open-shortcuts', group: 'Actions', label: 'Open Shortcut Settings', hint: 'Remap keys', keywords: 'keyboard shortcuts hotkeys bindings', run: () => openShortcutsModal() },
        { id: 'sleep-15', group: 'Actions', label: 'Set Sleep Timer: 15 Minutes', hint: 'Pause later', keywords: 'sleep timer fifteen 15', run: () => setSleepTimer(15) },
        { id: 'sleep-off', group: 'Actions', label: 'Turn Sleep Timer Off', hint: 'Disable timer', keywords: 'sleep timer off cancel disable', run: () => setSleepTimer(0) },
        { id: 'story-queue', group: 'Actions', label: 'Generate Story Queue', hint: 'Warmup to peak to cooldown', keywords: 'story queue smart playlist progression', run: () => generateStoryModeQueue() }
    ];
    if (currentTrack) {
        actions.unshift(
            { id: 'toggle-playback', group: 'Playback', label: state.isPlaying ? 'Pause Playback' : 'Resume Playback', hint: currentTrack.title || 'Current track', keywords: 'play pause resume stop', run: () => togglePlay() },
            { id: 'next-track', group: 'Playback', label: 'Play Next Track', hint: 'Skip ahead', keywords: 'next skip forward', run: () => playNext() },
            { id: 'prev-track', group: 'Playback', label: 'Play Previous Track', hint: 'Go back', keywords: 'previous back rewind', run: () => playPrev() },
            { id: 'toggle-immersive', group: 'Playback', label: currentTrack.type === 'video' ? 'Toggle Video Fullscreen' : 'Toggle Immersive Mode', hint: currentTrack.type === 'video' ? 'Video fullscreen controls' : 'Artwork + lyrics scene', keywords: 'fullscreen immersive focus cinema windowed', run: () => toggleFsModeForCurrentTrack() }
        );
    }
    return actions.filter(action => {
        if (action.id === 'story-queue') return isFeatureEnabled(FEATURE_REGISTRY.creative_story_mode);
        return true;
    });
}
function getCommandPaletteTrackEntries(query) {
    const normalizedQuery = normalizeCommandPaletteText(query);
    let tracks = [];
    if (!normalizedQuery) {
        const recent = (state.playHistory || [])
            .map(id => state.tracks.find(t => t.id === id))
            .filter(Boolean);
        const fallbacks = state.tracks.slice(0, 6);
        tracks = [...recent, ...fallbacks].filter((track, idx, list) => track && list.findIndex(item => item.id === track.id) === idx).slice(0, 6);
    } else {
        tracks = (state.tracks || []).map(track => {
            const haystack = normalizeCommandPaletteText([
                track.title,
                track.artist,
                track.fileName,
                Array.isArray(track.tags) ? track.tags.join(' ') : ''
            ].join(' '));
            if (!haystack || !haystack.includes(normalizedQuery)) return null;
            let score = 0;
            if (normalizeCommandPaletteText(track.title).startsWith(normalizedQuery)) score += 6;
            if (normalizeCommandPaletteText(track.artist).startsWith(normalizedQuery)) score += 3;
            if (haystack.includes(` ${normalizedQuery}`)) score += 2;
            score += Math.min(track.playCount || 0, 10) * 0.05;
            return { track, score };
        }).filter(Boolean)
            .sort((a, b) => b.score - a.score || (b.track.playCount || 0) - (a.track.playCount || 0))
            .slice(0, 8)
            .map(entry => entry.track);
    }
    return tracks.map(track => ({
        id: `track-${track.id}`,
        group: normalizedQuery ? 'Tracks' : 'Recent',
        label: track.title || track.fileName || 'Untitled Track',
        hint: [track.artist || (track.type === 'video' ? 'Video' : 'Unknown artist'), track.type === 'video' ? 'Video' : 'Audio'].filter(Boolean).join(' &middot; '),
        icon: track.type === 'video' ? 'video' : 'music',
        run: () => loadTrack(track.id, true),
        trackId: track.id
    }));
}
function getCommandPaletteEntries() {
    const query = state.commandPaletteQuery || '';
    const normalizedQuery = normalizeCommandPaletteText(query);
    const contextEntries = getCommandPaletteContextEntries(query);
    const actionEntries = filterCommandPaletteItems(getCommandPaletteActions(), normalizedQuery);
    const trackEntries = getCommandPaletteTrackEntries(query);
    const combined = [];
    const appendGroup = (groupName, entries) => {
        if (!entries.length) return;
        combined.push({ id: `group-${groupName}`, type: 'group', group: groupName });
        entries.forEach(entry => combined.push({ ...entry, type: 'item' }));
    };
    const groupedContext = new Map();
    contextEntries.forEach(entry => {
        if (!groupedContext.has(entry.group)) groupedContext.set(entry.group, []);
        groupedContext.get(entry.group).push(entry);
    });
    groupedContext.forEach((entries, groupName) => appendGroup(groupName, entries));
    const groupedActions = new Map();
    actionEntries.forEach(action => {
        if (!groupedActions.has(action.group)) groupedActions.set(action.group, []);
        groupedActions.get(action.group).push(action);
    });
    groupedActions.forEach((entries, groupName) => appendGroup(groupName, entries));
    if (!state.commandPaletteContext || normalizedQuery) {
        appendGroup(trackEntries[0]?.group || 'Tracks', trackEntries);
    }
    return combined;
}
function focusLibrarySearch() {
    closeCommandPalette(() => {
        const input = document.getElementById('search-input');
        if (!input) return;
        input.focus();
        input.select?.();
    });
}
function syncCommandPaletteSelection(totalItems) {
    if (totalItems <= 0) {
        state.commandPaletteSelectedIndex = 0;
        return;
    }
    if (state.commandPaletteSelectedIndex >= totalItems) state.commandPaletteSelectedIndex = totalItems - 1;
    if (state.commandPaletteSelectedIndex < 0) state.commandPaletteSelectedIndex = 0;
}
function renderCommandPalette() {
    if (!els.commandPaletteResults) return;
    const entries = getCommandPaletteEntries();
    const actionableEntries = entries.filter(entry => entry.type === 'item');
    syncCommandPaletteSelection(actionableEntries.length);
    if (!entries.length) {
        els.commandPaletteResults.innerHTML = `
            <div class="px-4 py-10 text-center text-sm text-gray-400">
                No matches for <span class="text-white font-mono">${escapeHtml(state.commandPaletteQuery || '')}</span>.
            </div>
        `;
        return;
    }
    let itemIndex = -1;
    els.commandPaletteResults.innerHTML = entries.map(entry => {
        if (entry.type === 'group') {
            return `<div class="px-3 pt-3 pb-2 text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">${escapeHtml(entry.group)}</div>`;
        }
        itemIndex += 1;
        const isSelected = itemIndex === state.commandPaletteSelectedIndex;
        const icon = entry.icon || 'sparkles';
        const extraBadge = entry.trackId === state.currentTrackId
            ? '<span class="px-2 py-1 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-mono text-cyan-200">LIVE</span>'
            : '';
        return `
            <button type="button" data-command-entry-index="${itemIndex}" onclick="runCommandPaletteEntry(${itemIndex})" class="w-full text-left flex items-center gap-3 px-4 py-3 rounded-2xl transition border ${isSelected ? 'bg-white text-black border-white shadow-[0_0_24px_rgba(255,255,255,0.14)]' : 'bg-white/0 text-white border-transparent hover:bg-white/5 hover:border-white/10'}">
                <div class="w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center ${isSelected ? 'bg-black/10 text-black' : 'bg-white/5 text-cyan-300'}">
                    <i data-lucide="${icon}" class="w-4 h-4"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold truncate">${escapeHtml(entry.label)}</div>
                    <div class="text-xs ${isSelected ? 'text-black/65' : 'text-gray-400'} truncate">${escapeHtml(entry.hint || '')}</div>
                </div>
                ${extraBadge}
            </button>
        `;
    }).join('');
    refreshLucideIcons();
    const activeEl = els.commandPaletteResults.querySelector(`[data-command-entry-index="${state.commandPaletteSelectedIndex}"]`);
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}
function openCommandPalette(options = {}) {
    if (!els.commandPaletteModal || !els.commandPaletteInput) return;
    const paletteOptions = options && typeof options === 'object' ? options : {};
    commandPaletteLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    state.commandPaletteContext = paletteOptions.context && paletteOptions.context.kind ? paletteOptions.context : null;
    updateCommandPaletteChrome();
    state.commandPaletteOpen = true;
    state.commandPaletteQuery = typeof paletteOptions.query === 'string' ? paletteOptions.query : '';
    state.commandPaletteSelectedIndex = 0;
    els.commandPaletteModal.classList.remove('hidden');
    els.commandPaletteModal.classList.add('flex');
    els.commandPaletteInput.value = state.commandPaletteQuery;
    renderCommandPalette();
    requestAnimationFrame(() => {
        els.commandPaletteInput.focus();
        els.commandPaletteInput.select?.();
    });
}
function closeCommandPalette(afterClose = null) {
    if (!els.commandPaletteModal) return;
    state.commandPaletteOpen = false;
    state.commandPaletteContext = null;
    updateCommandPaletteChrome();
    els.commandPaletteModal.classList.add('hidden');
    els.commandPaletteModal.classList.remove('flex');
    if (typeof afterClose === 'function') {
        afterClose();
    } else if (commandPaletteLastFocus && typeof commandPaletteLastFocus.focus === 'function') {
        commandPaletteLastFocus.focus();
    }
    commandPaletteLastFocus = null;
}
function updateCommandPaletteQuery(value) {
    state.commandPaletteQuery = String(value || '');
    state.commandPaletteSelectedIndex = 0;
    renderCommandPalette();
}
function handleCommandPaletteKeydown(event) {
    const entries = getCommandPaletteEntries().filter(entry => entry.type === 'item');
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!entries.length) return;
        state.commandPaletteSelectedIndex = (state.commandPaletteSelectedIndex + 1) % entries.length;
        renderCommandPalette();
        return;
    }
    if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!entries.length) return;
        state.commandPaletteSelectedIndex = (state.commandPaletteSelectedIndex - 1 + entries.length) % entries.length;
        renderCommandPalette();
        return;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        runCommandPaletteEntry(state.commandPaletteSelectedIndex);
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        closeCommandPalette();
    }
}
function runCommandPaletteEntry(index) {
    const entries = getCommandPaletteEntries().filter(entry => entry.type === 'item');
    const entry = entries[index];
    if (!entry || typeof entry.run !== 'function') return;
    closeCommandPalette();
    entry.run();
}
function handleCommandPaletteBackdrop(event) {
    if (event.target === els.commandPaletteModal) closeCommandPalette();
}
function updateShuffleIcon() {
    const btn = document.getElementById('shuffle-btn');
    const vidBtn = document.getElementById('videoFsModeShuffleBtn');
    if (!btn && !vidBtn) return;
    const apply = (targetBtn) => {
        if (!targetBtn) return;
        const icon = targetBtn.querySelector('i, svg');
        const on = !!state.isShuffle;
        targetBtn.classList.remove('control-pill-off','control-pill-on','text-gray-500','text-gray-400','accent-text');
        targetBtn.classList.add('control-pill');
        targetBtn.classList.add(on ? 'control-pill-on' : 'control-pill-off');
        if (icon) {
            icon.classList.remove('text-gray-400','text-gray-500','accent-text');
            if (on) icon.classList.add('text-black'); else icon.classList.add('text-gray-400');
        }
        targetBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    };
    apply(btn);
    apply(vidBtn);
}
function updateRepeatIcon() {
    const btn = document.getElementById('repeat-btn');
    const vidIcon = document.getElementById('videoFsModeRepeatIcon');
    const vidBtn = vidIcon ? vidIcon.closest('button') : null;
    if (!btn && !vidIcon) return;
    const iconName = state.repeatMode === 'one' ? 'repeat-1' : 'repeat';
    const badge = document.getElementById('repeat-badge');
    const label = state.repeatMode === 'all' ? 'Repeat all' : state.repeatMode === 'one' ? 'Repeat one' : 'Repeat off';
    const active = state.repeatMode !== 'none';
    const apply = (targetBtn) => {
        if (!targetBtn) return;
        const icon = targetBtn.querySelector('i, svg');
        if (icon) replaceLucideIcon(icon, iconName);
        targetBtn.classList.remove('control-pill-on','control-pill-off','text-gray-500');
        targetBtn.classList.add('control-pill', active ? 'control-pill-on' : 'control-pill-off');
        targetBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
        targetBtn.setAttribute('aria-label', label);
    };
    apply(btn);
    if (vidIcon) {
        if (vidBtn) apply(vidBtn);
        const activeVidIcon = vidBtn ? vidBtn.querySelector('i, svg') : vidIcon;
        if (activeVidIcon) {
            activeVidIcon.classList.remove('text-gray-400','accent-text');
            activeVidIcon.classList.add(active ? 'text-black' : 'text-gray-400');
        }
    }
    if (badge) {
        if (state.repeatMode === 'none') {
            badge.classList.add('hidden');
            badge.classList.remove('repeat-badge-strong');
        } else {
            badge.classList.remove('hidden');
            badge.classList.add('repeat-badge-strong');
            badge.textContent = state.repeatMode === 'one' ? '1' : '∞';
        }
    }
}

	        // fsMode-only: line-by-line lyrics overlay (no windowedMode leakage)
	        let fsModeLyricAnimationRafId = 0;
	        function updateFsModeLyricOverlay(currentText = '', nextText = '') {
	            const wrap = document.getElementById('fsModeLyricOverlay');
	            const cur = document.getElementById('fsModeLyricCurrent');
	            const nxt = document.getElementById('fsModeLyricNext');
	            if (!wrap || !cur || !nxt) return;
	            const has = currentText && currentText.trim();
	            const shouldShow = !!has && !!state.fsModeActive;
	            cur.textContent = has ? currentText : '';
	            nxt.textContent = has ? (nextText && nextText.trim() ? nextText : '') : '';
	            if (!shouldShow) {
	                if (fsModeLyricAnimationRafId) cancelAnimationFrame(fsModeLyricAnimationRafId);
	                fsModeLyricAnimationRafId = 0;
	                wrap.classList.add('hidden');
	                wrap.dataset.currentText = '';
	                wrap.classList.remove('fsModeLyricAnimate');
	                return;
	            }
	            wrap.classList.remove('hidden');
	            if (wrap.dataset.currentText !== currentText) {
	                wrap.dataset.currentText = currentText;
	                if (fsModeLyricAnimationRafId) cancelAnimationFrame(fsModeLyricAnimationRafId);
	                wrap.classList.remove('fsModeLyricAnimate');
	                fsModeLyricAnimationRafId = requestAnimationFrame(() => {
	                    fsModeLyricAnimationRafId = 0;
	                    if (wrap.dataset.currentText !== currentText || !state.fsModeActive || wrap.classList.contains('hidden')) return;
	                    wrap.classList.add('fsModeLyricAnimate');
	                });
	            }
	        }

// Crossfade configuration
function setCrossfadeDuration(sec, skipHide = false) {
    const clamped = Math.max(0, Math.min(sec || 0, 12));
    state.crossfadeDuration = clamped;
    state.crossfadeEnabled = clamped > 0;
    syncCrossfadeUI();
    const menu = document.getElementById('crossfade-menu');
    // if (menu) menu.classList.add('hidden'); // DISABLED for Accordion
    persistAppStateNow();
}
function syncCrossfadeUI() {
    const lbl = document.getElementById('crossfade-label');
    const val = document.getElementById('crossfade-value');
    const slider = document.getElementById('crossfade-slider');
    const dur = state.crossfadeDuration || 0;
    // if (lbl) lbl.textContent = dur > 0 ? `Crossfade` : 'Crossfade';
    if (val) val.textContent = `${dur.toFixed(1).replace(/\.0$/, '')}s`;
    if (slider && slider.value !== String(dur)) slider.value = dur;
}

function crossFadeToTrack(nextId) {
    // Smooth crossfade using requestAnimationFrame for better timing.  Fade out the current
    // track, load the next at zero volume, then fade in.  Short-circuit if crossfade is off.
    const dur = Math.max(0, Math.min(state.crossfadeDuration || 0, 12));
    if (!state.crossfadeEnabled || dur <= 0 || els.audio.paused || !state.isPlaying) {
        loadTrack(nextId);
        return;
    }
    const desiredVolume = state.volume || els.audio.volume || 1;
    const volBar = document.getElementById('vol-fill');
    const volSlider = document.getElementById('vol-slider');
    const totalMs = dur * 1000;
    const outMs = Math.max(120, totalMs * 0.45);
    const inMs = Math.max(120, totalMs - outMs);
    const startVol = els.audio.volume;
    const startTime = performance.now();
    function fadeOut(now) {
        const t = Math.min(1, (now - startTime) / outMs);
        const newVol = Math.max(0, startVol * (1 - t));
        els.audio.volume = newVol;
        if (volBar) volBar.style.width = (newVol * 100) + '%';
        if (volSlider) volSlider.value = newVol;
        if (t < 1) {
            requestAnimationFrame(fadeOut);
            return;
        }
        // Load next track at zero volume, then fade in
        loadTrack(nextId);
        els.audio.volume = 0;
        if (volBar) volBar.style.width = '0%';
        if (volSlider) volSlider.value = 0;
        const inStart = performance.now();
        function fadeIn(now2) {
            const tIn = Math.min(1, (now2 - inStart) / inMs);
            const volIn = Math.min(1, desiredVolume * tIn);
            els.audio.volume = volIn;
            if (volBar) volBar.style.width = (volIn * 100) + '%';
            if (volSlider) volSlider.value = volIn;
            if (tIn < 1) {
                requestAnimationFrame(fadeIn);
            } else {
                els.audio.volume = desiredVolume;
                if (volBar) volBar.style.width = (desiredVolume * 100) + '%';
                if (volSlider) volSlider.value = desiredVolume;
            }
        }
        requestAnimationFrame(fadeIn);
    }
    requestAnimationFrame(fadeOut);
}

