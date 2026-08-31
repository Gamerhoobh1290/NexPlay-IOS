(function attachOnlineMusicHelpers(/** @type {any} */ globalScope, /** @type {any} */ factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (globalScope && typeof globalScope === 'object') {
        globalScope.NexPlayOnlineMusicHelpers = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createOnlineMusicHelpers() {
    /** @type {(...args: any[]) => any} */
    function uniqueStrings(values) {
        return Array.from(new Set((Array.isArray(values) ? values : [])
            .map((/** @type {any} */ value) => String(value || '').trim())
            .filter(Boolean)));
    }

    /** @type {(...args: any[]) => any} */
    function cloneTrackForMigration(track) {
        return {
            ...(track && typeof track === 'object' ? track : {}),
            resumePosition: 0,
            resumeUpdatedAt: 0
        };
    }

    /** @type {(...args: any[]) => any} */
    function shouldIgnoreOnlineMusicTransportEvent(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const currentPlaybackSource = String(opts.currentPlaybackSource || '').trim();
        const currentTrackId = String(opts.currentTrackId || '').trim();
        const currentSessionId = Number(opts.currentSessionId) || 0;
        const latestSessionId = Number(opts.latestSessionId) || 0;
        const expectedVideoId = String(opts.expectedVideoId || '').trim();
        const playerVideoId = String(opts.playerVideoId || '').trim();

        if (currentPlaybackSource !== 'online-music') return true;
        if (!currentTrackId) return true;
        if (currentSessionId !== latestSessionId) return true;
        if (expectedVideoId && playerVideoId && expectedVideoId !== playerVideoId) return true;
        return false;
    }

    /** @type {(...args: any[]) => any} */
    function isStaleOnlineMusicPlaybackAttempt(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const attemptId = Number(opts.attemptId) || 0;
        const latestId = Number(opts.latestId) || 0;
        const attemptTrackId = String(opts.attemptTrackId || '').trim();
        const latestTrackId = String(opts.latestTrackId || '').trim();

        if (!attemptId) return true;
        if (attemptId !== latestId) return true;
        if (attemptTrackId !== latestTrackId) return true;
        return false;
    }

    /** @type {(...args: any[]) => any} */
    function normalizeOnlineMusicReleaseText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[()[\]{}]/g, ' ')
            .replace(/[|:_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** @type {(...args: any[]) => any} */
    function classifyOnlineMusicRelease(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const itemCount = Math.max(0, Number(opts.itemCount) || 0);
        const title = normalizeOnlineMusicReleaseText(opts.title || '');
        const description = normalizeOnlineMusicReleaseText(opts.description || '');
        const haystack = `${title} ${description}`.trim();
        if (!haystack) {
            return { include: false, kind: '' };
        }

        const albumHint = /\b(?:album|full album|lp|deluxe|expanded|anniversary|disc\s*\d+|volume\s+\d+|vol\s*\d+)\b/;
        const singleHint = /\b(?:single|ep|extended play|remix|acoustic|instrumental|radio edit|edit)\b/;
        const excludeHint = /\b(?:shorts?|mix(?:es)?|popular(?: uploads| videos)?|uploads?|videos?|live(?:\s+at)?|concert|tour|festival|interview|podcast|stream(?:ing|s)?|karaoke|reaction|trailer|teaser|documentary|behind the scenes)\b/;

        if (excludeHint.test(haystack) && !albumHint.test(haystack) && !singleHint.test(haystack)) {
            return { include: false, kind: '' };
        }
        if (albumHint.test(haystack)) {
            return { include: true, kind: 'album' };
        }
        if (singleHint.test(haystack)) {
            return { include: true, kind: 'single-ep' };
        }
        if (itemCount <= 0) {
            return { include: false, kind: '' };
        }
        return {
            include: true,
            kind: itemCount >= 7 ? 'album' : 'single-ep'
        };
    }

    /** @type {(...args: any[]) => any} */
    function mergeUniqueOnlineMusicTracks(tracks) {
        const seen = new Set();
        /** @type {any[]} */
        const list = [];
        (Array.isArray(tracks) ? tracks : []).forEach((/** @type {any} */ track) => {
            if (!track || typeof track !== 'object') return;
            const key = String(track.id || track.videoId || '').trim();
            if (!key || seen.has(key)) return;
            seen.add(key);
            list.push(track);
        });
        return list.sort((/** @type {any} */ left, /** @type {any} */ right) => {
            const leftTs = Date.parse(left && left.publishedAt ? left.publishedAt : '') || Number(left && left.addedAt ? left.addedAt : 0) || 0;
            const rightTs = Date.parse(right && right.publishedAt ? right.publishedAt : '') || Number(right && right.addedAt ? right.addedAt : 0) || 0;
            return rightTs - leftTs;
        });
    }

    /** @type {(...args: any[]) => any} */
    function uniqueOnlineMusicTracksInDeclaredOrder(tracks) {
        const seen = new Set();
        /** @type {any[]} */
        const list = [];
        (Array.isArray(tracks) ? tracks : []).forEach((/** @type {any} */ track) => {
            if (!track || typeof track !== 'object') return;
            const key = String(track.id || track.videoId || '').trim();
            if (!key || seen.has(key)) return;
            seen.add(key);
            list.push(track);
        });
        return list;
    }

    /** @type {(...args: any[]) => any} */
    function buildSavedOnlineMusicLibraryIndex(tracks) {
        return (Array.isArray(tracks) ? tracks : []).reduce((/** @type {any} */ index, /** @type {any} */ track) => {
            const id = String(track && track.id ? track.id : '').trim();
            if (!id) return index;
            index[id] = {
                ...(index[id] || {}),
                ...(track && typeof track === 'object' ? track : {}),
                id,
                resumePosition: 0,
                resumeUpdatedAt: 0
            };
            return index;
        }, {});
    }

    /** @type {(...args: any[]) => any} */
    function lookupSavedOnlineMusicLibraryEntry(index, trackId) {
        const source = index && typeof index === 'object' ? index : {};
        const id = String(trackId || '').trim();
        return id ? (source[id] || null) : null;
    }

    /** @type {(...args: any[]) => any} */
    function upsertSavedOnlineMusicLibraryEntry(index, track) {
        const source = index && typeof index === 'object' ? index : {};
        const id = String(track && track.id ? track.id : '').trim();
        if (!id) return { ...source };
        return {
            ...source,
            [id]: {
                ...(source[id] || {}),
                ...(track && typeof track === 'object' ? track : {}),
                id,
                resumePosition: 0,
                resumeUpdatedAt: 0
            }
        };
    }

    /** @type {(...args: any[]) => any} */
    function removeSavedOnlineMusicLibraryEntries(index, trackIds) {
        const source = index && typeof index === 'object' ? index : {};
        const blockedIds = new Set(uniqueStrings(trackIds));
        if (!blockedIds.size) return { ...source };
        return Object.entries(source).reduce((/** @type {any} */ nextIndex, [id, track]) => {
            if (!blockedIds.has(id)) nextIndex[id] = track;
            return nextIndex;
        }, {});
    }

    /** @type {(...args: any[]) => any} */
    function buildOnlineMusicTrackFromQueueEntry(entry) {
        const source = entry && typeof entry === 'object' ? entry : {};
        if ((source.sourceKind || '') !== 'online') return null;
        const snapshot = source.trackSnapshot && typeof source.trackSnapshot === 'object'
            ? { ...source.trackSnapshot }
            : {
                id: String(source.trackId || '').trim(),
                title: String(source.title || 'Untitled').trim() || 'Untitled',
                artist: String(source.artist || '').trim(),
                cover: String(source.cover || '').trim(),
                provider: String(source.provider || '').trim(),
                videoId: String(source.videoId || '').trim(),
                source: 'online-music',
                type: 'audio'
            };
        const id = String(snapshot.id || source.trackId || '').trim();
        if (!id) return null;
        return {
            ...snapshot,
            id,
            source: 'online-music',
            type: 'audio',
            resumePosition: 0,
            resumeUpdatedAt: 0
        };
    }

    /** @type {(...args: any[]) => any} */
    function decodeBasicHtmlEntities(value) {
        return String(value || '')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>');
    }

    /** @type {(...args: any[]) => any} */
    function sanitizeProviderErrorMessage(message) {
        return decodeBasicHtmlEntities(message)
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\s+([.,!?;:])/g, '$1')
            .trim();
    }

    /** @type {(...args: any[]) => any} */
    function isSpotifyProvider(value) {
        return normalizeOnlineMusicProvider(value) === 'spotify';
    }

    /** @type {(...args: any[]) => any} */
    function normalizeOnlineMusicProvider(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (raw === 'yt') return 'youtube';
        if (['youtube', 'itunes', 'deezer', 'spotify'].includes(raw)) return raw;
        return raw;
    }

    /** @type {(...args: any[]) => any} */
    function getOnlineMusicProviderLabel(value) {
        const provider = normalizeOnlineMusicProvider(value);
        if (provider === 'youtube') return 'YouTube';
        if (provider === 'itunes') return 'iTunes';
        if (provider === 'deezer') return 'Deezer';
        if (provider === 'spotify') return 'Spotify';
        return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Unknown';
    }

    /** @type {(...args: any[]) => any} */
    function shouldPurgeSpotifyTrack(track) {
        const source = track && typeof track === 'object' ? track : {};
        return isSpotifyProvider(source.provider)
            || isSpotifyProvider(source.catalogProvider)
            || isSpotifyProvider(source.originProvider);
    }

    /** @type {(...args: any[]) => any} */
    function shouldRemoveSpotifyMetadataEntry(key, entry, removedTrackIds) {
        const lookup = removedTrackIds instanceof Set ? removedTrackIds : new Set(uniqueStrings(removedTrackIds));
        const cleanKey = String(key || '').trim();
        if (!cleanKey) return false;
        for (const trackId of lookup) {
            if (cleanKey === `online-music:${trackId}`) return true;
        }
        const source = entry && typeof entry === 'object' ? entry : {};
        const fingerprint = String(source.fingerprint || '').trim();
        if (fingerprint && cleanKey === fingerprint) {
            for (const trackId of lookup) {
                if (fingerprint === `online-music:${trackId}`) return true;
            }
        }
        return false;
    }

    /** @type {(...args: any[]) => any} */
    function purgeSpotifyImportedData(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const savedOnlineTracks = Array.isArray(opts.savedOnlineTracks) ? opts.savedOnlineTracks : [];
        const appState = opts.appState && typeof opts.appState === 'object' ? opts.appState : {};
        const metadataStore = opts.metadataStore && typeof opts.metadataStore === 'object' ? opts.metadataStore : {};
        const onlineMusicState = opts.onlineMusicState && typeof opts.onlineMusicState === 'object' ? opts.onlineMusicState : {};
        const appSettings = opts.appSettings && typeof opts.appSettings === 'object' ? opts.appSettings : {};

        const removedTrackIds = uniqueStrings(savedOnlineTracks
            .filter(shouldPurgeSpotifyTrack)
            .map((/** @type {any} */ track) => track && track.id));
        const removedTrackIdSet = new Set(removedTrackIds);
        const removedPlaylistIds = uniqueStrings((Array.isArray(appState.playlists) ? appState.playlists : [])
            .filter((/** @type {any} */ playlist) => String(playlist && playlist.importSource ? playlist.importSource : '').trim() === 'spotify-playlist')
            .map((/** @type {any} */ playlist) => playlist && playlist.id));
        const removedPlaylistIdSet = new Set(removedPlaylistIds);

        const nextSavedOnlineTracks = savedOnlineTracks.filter((/** @type {any} */ track) => !removedTrackIdSet.has(String(track && track.id ? track.id : '').trim()));
        const nextPlaylists = (Array.isArray(appState.playlists) ? appState.playlists : [])
            .filter((/** @type {any} */ playlist) => !removedPlaylistIdSet.has(String(playlist && playlist.id ? playlist.id : '').trim()))
            .map((/** @type {any} */ playlist) => ({
                ...(playlist && typeof playlist === 'object' ? playlist : {}),
                tracks: uniqueStrings(playlist && playlist.tracks).filter((/** @type {any} */ trackId) => !removedTrackIdSet.has(trackId))
            }));

        const nextAppState = {
            ...appState,
            tracks: (Array.isArray(appState.tracks) ? appState.tracks : []).filter((/** @type {any} */ track) => {
                const source = track && typeof track === 'object' ? track : {};
                const id = String(source.id || '').trim();
                if (!removedTrackIdSet.has(id)) return true;
                return String(source.source || '').trim().toLowerCase() === 'local';
            }),
            selectedTrackIds: uniqueStrings(appState.selectedTrackIds).filter((/** @type {any} */ trackId) => !removedTrackIdSet.has(trackId)),
            queue: uniqueStrings(appState.queue).filter((/** @type {any} */ trackId) => !removedTrackIdSet.has(trackId)),
            shuffleQueue: uniqueStrings(appState.shuffleQueue).filter((/** @type {any} */ trackId) => !removedTrackIdSet.has(trackId)),
            playHistory: uniqueStrings(appState.playHistory).filter((/** @type {any} */ trackId) => !removedTrackIdSet.has(trackId)),
            playlists: nextPlaylists,
            currentTrackId: removedTrackIdSet.has(String(appState.currentTrackId || '').trim()) ? null : appState.currentTrackId,
            currentTrack: removedTrackIdSet.has(String(appState.currentTrack && appState.currentTrack.id ? appState.currentTrack.id : '').trim())
                ? null
                : (appState.currentTrack || null),
            videoQueueState: {
                ...(appState.videoQueueState && typeof appState.videoQueueState === 'object' ? appState.videoQueueState : {}),
                queue: uniqueStrings(appState.videoQueueState && appState.videoQueueState.queue).filter((/** @type {any} */ trackId) => !removedTrackIdSet.has(trackId)),
                shuffleQueue: uniqueStrings(appState.videoQueueState && appState.videoQueueState.shuffleQueue).filter((/** @type {any} */ trackId) => !removedTrackIdSet.has(trackId))
            }
        };

        const nextMetadataStore = Object.entries(metadataStore).reduce((/** @type {any} */ result, [key, value]) => {
            if (!shouldRemoveSpotifyMetadataEntry(key, value, removedTrackIdSet)) {
                result[key] = value;
            }
            return result;
        }, {});

        const nextOnlineMusicState = {
            ...onlineMusicState,
            queue: uniqueStrings(onlineMusicState.queue).filter((/** @type {any} */ trackId) => !removedTrackIdSet.has(trackId)),
            currentTrackId: removedTrackIdSet.has(String(onlineMusicState.currentTrackId || '').trim())
                ? null
                : onlineMusicState.currentTrackId,
            currentTrack: removedTrackIdSet.has(String(onlineMusicState.currentTrack && onlineMusicState.currentTrack.id ? onlineMusicState.currentTrack.id : '').trim())
                ? null
                : (onlineMusicState.currentTrack || null),
            activePlaylistId: removedPlaylistIdSet.has(String(onlineMusicState.activePlaylistId || '').trim())
                ? null
                : (onlineMusicState.activePlaylistId || null),
            currentPlaylistContextId: removedPlaylistIdSet.has(String(onlineMusicState.currentPlaylistContextId || '').trim())
                ? null
                : (onlineMusicState.currentPlaylistContextId || null),
            playlists: (Array.isArray(onlineMusicState.playlists) ? onlineMusicState.playlists : [])
                .filter((/** @type {any} */ playlist) => !removedPlaylistIdSet.has(String(playlist && playlist.id ? playlist.id : '').trim()))
                .map((/** @type {any} */ playlist) => ({
                    ...(playlist && typeof playlist === 'object' ? playlist : {}),
                    tracks: uniqueStrings(playlist && playlist.tracks).filter((/** @type {any} */ trackId) => !removedTrackIdSet.has(trackId))
                }))
        };
        delete nextOnlineMusicState.spotifyAuth;

        const nextAppSettings = {
            ...appSettings,
            onlineMusic: {
                ...(appSettings.onlineMusic && typeof appSettings.onlineMusic === 'object' ? appSettings.onlineMusic : {})
            }
        };
        delete nextAppSettings.onlineMusic.spotifyClientId;

        const changed = removedTrackIds.length > 0
            || removedPlaylistIds.length > 0
            || !!(onlineMusicState && Object.prototype.hasOwnProperty.call(onlineMusicState, 'spotifyAuth'))
            || !!(appSettings.onlineMusic && Object.prototype.hasOwnProperty.call(appSettings.onlineMusic, 'spotifyClientId'));

        return {
            changed,
            removedPlaylistIds,
            removedTrackIds,
            appSettings: nextAppSettings,
            appState: nextAppState,
            metadataStore: nextMetadataStore,
            onlineMusicState: nextOnlineMusicState,
            savedOnlineTracks: nextSavedOnlineTracks
        };
    }

    /** @type {(...args: any[]) => any} */
    function classifyYouTubeApiError(message) {
        const cleanMessage = sanitizeProviderErrorMessage(message);
        const normalized = cleanMessage.toLowerCase();
        const isQuota = /\bquota(exceeded| exceeded)?\b/.test(normalized)
            || /\bdailylimite?xceeded\b/.test(normalized)
            || /\busagelimitsexceeded\b/.test(normalized)
            || normalized.includes('exceeded your quota');
        const isRefererBlocked = normalized.includes('requests from referer')
            || normalized.includes('request from referer')
            || normalized.includes('refererblocked')
            || normalized.includes('referer not allowed')
            || normalized.includes('ip referer blocked')
            || normalized.includes('api keys with referer restrictions cannot be used')
            || normalized.includes('access not configured');
        const isMissingKey = normalized.includes('api key not valid')
            || normalized.includes('bad request')
            || normalized.includes('keyinvalid')
            || normalized.includes('missing youtube api key')
            || isRefererBlocked;
        const code = isQuota
            ? 'quotaExceeded'
            : (isMissingKey ? (isRefererBlocked ? 'apiKeyRefererBlocked' : 'apiKeyInvalid') : 'requestFailed');
        const userMessage = isQuota
            ? 'YouTube discovery is temporarily unavailable because the current API key is over quota. NexPlay will keep using catalog providers and try YouTube again later.'
            : (isMissingKey
                ? (isRefererBlocked
                    ? 'The configured YouTube API key does not allow requests from this app origin. Update the key restrictions in Settings to restore YouTube discovery.'
                    : 'The configured YouTube API key is missing or invalid. Update the key in Settings to restore YouTube discovery.')
                : (cleanMessage || 'YouTube discovery is unavailable right now.'));
        return {
            code,
            isQuota,
            isMissingKey,
            isRefererBlocked,
            message: cleanMessage,
            userMessage
        };
    }

    const ONLINE_MUSIC_SEARCH_STOP_WORDS = new Set([
        'a',
        'an',
        'and',
        'are',
        'as',
        'at',
        'by',
        'for',
        'from',
        'in',
        'is',
        'it',
        'its',
        'of',
        'on',
        'or',
        'the',
        'this',
        'to',
        'with'
    ]);

    /** @type {(...args: any[]) => any} */
    function normalizeOnlineMusicTrackText(value) {
        return decodeBasicHtmlEntities(value)
            .toLowerCase()
            .replace(/[\u2018\u2019'`]/g, '')
            .replace(/[()[\]{}]/g, ' ')
            .replace(/[|:_\-]+/g, ' ')
            .replace(/\b(?:official|audio|video|lyrics?|topic|hd|4k|remaster(?:ed)?|visualizer|provided to youtube by)\b/g, ' ')
            .replace(/[^a-z0-9\s&]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** @type {(...args: any[]) => any} */
    function splitOnlineMusicSearchTokens(value) {
        return normalizeOnlineMusicTrackText(value).split(/\s+/).filter(Boolean);
    }

    /** @type {(...args: any[]) => any} */
    function getSignificantOnlineMusicSearchTokens(value) {
        return splitOnlineMusicSearchTokens(value)
            .filter((token) => token.length > 1 && !ONLINE_MUSIC_SEARCH_STOP_WORDS.has(token));
    }

    /** @type {(...args: any[]) => any} */
    function compactOnlineMusicTrackText(value) {
        return normalizeOnlineMusicTrackText(value).replace(/[^a-z0-9]+/g, '');
    }

    /** @type {(...args: any[]) => any} */
    function uniqueNormalizedOnlineMusicTexts(values) {
        return uniqueStrings(values)
            .map((value) => normalizeOnlineMusicTrackText(value))
            .filter(Boolean);
    }

    /** @type {(...args: any[]) => any} */
    function scoreNormalizedOnlineMusicTextMatch(targetValue, candidateValue) {
        const target = normalizeOnlineMusicTrackText(targetValue);
        const candidate = normalizeOnlineMusicTrackText(candidateValue);
        if (!target || !candidate) return 0;
        if (target === candidate) return 140;
        if (candidate.includes(target)) return 112;
        if (target.includes(candidate)) return 88;

        const targetTokens = splitOnlineMusicSearchTokens(target);
        const candidateTokens = splitOnlineMusicSearchTokens(candidate);
        if (!targetTokens.length || !candidateTokens.length) return 0;
        const significantTargetTokens = getSignificantOnlineMusicSearchTokens(target);
        if (!significantTargetTokens.length) return 0;

        const candidateSet = new Set(candidateTokens);
        const overlap = targetTokens.filter((token) => candidateSet.has(token)).length;
        if (!overlap) return 0;

        const missingSignificant = significantTargetTokens.filter((token) => !candidateSet.has(token)).length;
        const coverage = overlap / Math.max(1, targetTokens.length);
        let score = Math.round(coverage * 76);
        if (significantTargetTokens.length && missingSignificant === 0) score += 18;
        if (significantTargetTokens.length && missingSignificant >= Math.ceil(significantTargetTokens.length / 2)) {
            score -= 42;
        }
        if (targetTokens.length > 1 && significantTargetTokens.length <= 1 && !candidate.includes(target)) {
            score = Math.min(score, 24);
        }
        return Math.max(0, Math.min(120, score));
    }

    /** @type {(...args: any[]) => any} */
    function shouldUseAutoSplitTitleCandidate(value) {
        const normalized = normalizeOnlineMusicTrackText(value);
        if (!normalized) return false;
        const tokens = splitOnlineMusicSearchTokens(normalized);
        if (tokens.length > 1) return true;
        return tokens[0].length >= 4;
    }

    /** @type {(...args: any[]) => any} */
    function parseOnlineMusicSearchIntent(query) {
        const raw = String(query || '').trim();
        const normalized = normalizeOnlineMusicTrackText(raw);
        const titleCandidates = [];
        const artistCandidates = [];
        const quotedMatches = Array.from(raw.matchAll(/"([^"]{1,180})"/g))
            .map((match) => match[1])
            .filter(Boolean);
        titleCandidates.push(...quotedMatches);

        const unquoted = raw.replace(/"([^"]{1,180})"/g, ' $1 ').replace(/\s+/g, ' ').trim();
        const byMatch = unquoted.match(/^(.{1,180}?)\s+\bby\b\s+(.{1,120})$/i);
        if (byMatch) {
            titleCandidates.push(byMatch[1]);
            artistCandidates.push(byMatch[2]);
        }

        const dashMatch = unquoted.match(/^(.{1,140}?)\s+(?:-|--|\u2013|\u2014|\|)\s+(.{1,180})$/);
        if (dashMatch) {
            artistCandidates.push(dashMatch[1]);
            titleCandidates.push(dashMatch[2]);
            titleCandidates.push(dashMatch[1]);
            artistCandidates.push(dashMatch[2]);
        }

        if (!byMatch && !dashMatch && normalized) {
            titleCandidates.push(normalized);
            const tokens = splitOnlineMusicSearchTokens(normalized);
            const maxSplit = Math.min(2, tokens.length - 1);
            for (let split = 1; split <= maxSplit; split += 1) {
                const leftTitle = tokens.slice(0, -split).join(' ');
                const rightTitle = tokens.slice(split).join(' ');
                if (shouldUseAutoSplitTitleCandidate(leftTitle)) titleCandidates.push(leftTitle);
                artistCandidates.push(tokens.slice(-split).join(' '));
                artistCandidates.push(tokens.slice(0, split).join(' '));
                if (shouldUseAutoSplitTitleCandidate(rightTitle)) titleCandidates.push(rightTitle);
            }
        }

        if (normalized) artistCandidates.push(normalized);

        return {
            raw,
            normalized,
            titleCandidates: uniqueNormalizedOnlineMusicTexts(titleCandidates),
            artistCandidates: uniqueNormalizedOnlineMusicTexts(artistCandidates),
            hasExplicitArtist: !!byMatch || !!dashMatch || artistCandidates.length > 1,
            hasStructuredArtist: !!byMatch || !!dashMatch,
            tokenCount: splitOnlineMusicSearchTokens(normalized).length
        };
    }

    /** @type {(...args: any[]) => any} */
    function deriveOnlineMusicCandidateTitle(rawTitle = '', rawArtist = '', rawChannel = '') {
        const title = String(rawTitle || '').trim();
        const artist = normalizeOnlineMusicTrackText(rawArtist || rawChannel || '');
        const splitMatch = title.match(/^([^|]{1,100}?)\s+(?:-|--|\u2013|\u2014)\s+(.{1,180})$/);
        if (!splitMatch) return title;
        const left = splitMatch[1] || '';
        const right = splitMatch[2] || '';
        const normalizedLeft = normalizeOnlineMusicTrackText(left);
        if (!artist || normalizedLeft === artist || normalizedLeft.includes(artist) || artist.includes(normalizedLeft)) {
            return right || title;
        }
        return title;
    }

    /** @type {(...args: any[]) => any} */
    function getMaxOnlineMusicTextMatchScore(candidates, targets) {
        let best = 0;
        (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
            (Array.isArray(targets) ? targets : []).forEach((target) => {
                best = Math.max(best, scoreNormalizedOnlineMusicTextMatch(candidate, target));
            });
        });
        return best;
    }

    /** @type {(...args: any[]) => any} */
    function getOnlineMusicResultTitleTargets(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const rawTitle = String(opts.title || opts.candidateTitle || '').trim();
        const rawArtist = String(opts.artist || opts.candidateArtist || '').trim();
        const rawChannel = String(opts.channelTitle || opts.channel || opts.candidateChannel || '').trim();
        const rawLyricsTitle = String(opts.lyricsTitle || '').trim();
        const rawLyricsArtist = String(opts.lyricsArtist || '').trim();
        const candidateTitle = deriveOnlineMusicCandidateTitle(rawLyricsTitle || rawTitle, rawLyricsArtist || rawArtist, rawChannel);
        return uniqueNormalizedOnlineMusicTexts([
            candidateTitle,
            rawLyricsTitle,
            normalizeOnlineMusicTrackText(candidateTitle) === normalizeOnlineMusicTrackText(rawTitle) ? rawTitle : ''
        ]);
    }

    /** @type {(...args: any[]) => any} */
    function isLikelyTitleOnlyOnlineMusicSearchResult(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const intent = parseOnlineMusicSearchIntent(opts.query || '');
        if (!intent.normalized) return false;
        const raw = String(opts.query || '').trim();
        if (/\s+\bby\b\s+/i.test(raw) || /\s(?:-|--|\u2013|\u2014|\|)\s/.test(raw)) return false;
        return getOnlineMusicResultTitleTargets(opts)
            .some((title) => scoreNormalizedOnlineMusicTextMatch(intent.normalized, title) >= 112);
    }

    /** @type {(...args: any[]) => any} */
    function getOnlineMusicSplitArtistFromTitle(value) {
        const title = String(value || '').trim();
        const splitMatch = title.match(/^([^|]{1,120}?)\s+(?:-|--|\u2013|\u2014|\|)\s+(.{1,220})$/);
        if (!splitMatch) return '';
        return splitMatch[1] || '';
    }

    /** @type {(...args: any[]) => any} */
    function normalizeOnlineMusicChannelArtistText(value) {
        return normalizeOnlineMusicTrackText(String(value || '')
            .replace(/\bofficial\s+artist\s+channel\b/gi, ' ')
            .replace(/\bofficial\s+channel\b/gi, ' ')
            .replace(/\bvevo\b/gi, ' ')
            .replace(/\bartist\b/gi, ' ')
            .replace(/\bchannel\b/gi, ' '))
            .replace(/\b(?:music|records?|recordings?|entertainment|media)\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** @type {(...args: any[]) => any} */
    function compactOnlineMusicChannelArtistText(value) {
        return compactOnlineMusicTrackText(String(value || '')
            .replace(/\bofficial\s+artist\s+channel\b/gi, ' ')
            .replace(/\bofficial\s+channel\b/gi, ' '))
            .replace(/(?:vevo|topic|official|artist|channel)$/g, '');
    }

    /** @type {(...args: any[]) => any} */
    function doOnlineMusicArtistTextsMatch(left, right) {
        const normalizedLeft = normalizeOnlineMusicChannelArtistText(left);
        const normalizedRight = normalizeOnlineMusicChannelArtistText(right);
        if (!normalizedLeft || !normalizedRight) return false;
        if (scoreNormalizedOnlineMusicTextMatch(normalizedLeft, normalizedRight) >= 112) return true;
        const compactLeft = compactOnlineMusicChannelArtistText(left);
        const compactRight = compactOnlineMusicChannelArtistText(right);
        return !!compactLeft && !!compactRight && compactLeft === compactRight;
    }

    /** @type {(...args: any[]) => any} */
    function hasOnlineMusicLyricsVideoMarker(value) {
        return /\b(?:lyrics?|lyric\s+video|with\s+lyrics)\b/i.test(String(value || ''));
    }

    /** @type {(...args: any[]) => any} */
    function hasOnlineMusicOfficialUploadMarker(value) {
        return /\b(?:official\s+(?:music\s+)?video|official\s+audio|official\s+visuali[sz]er|official\s+lyric\s+video|music\s+video)\b/i.test(String(value || ''));
    }

    /** @type {(...args: any[]) => any} */
    function hasDisallowedOnlineMusicSearchResultModifier(value) {
        const normalized = normalizeOnlineMusicReleaseText(value);
        if (!normalized) return false;
        return /\b(?:cover|karaoke|reaction|reacts?|teaser|trailer|preview|snippet|challenge|meme|status|tiktok|shorts?|clip|clips|fanmade|fan\s+made|tribute|lesson|tutorial|instrumental|a\s+cappella|acapella|sped\s+up|slowed(?:\s+down)?|reverb|nightcore|8d|mashup|remix|bootleg|leak|unreleased|live|full\s+album|playlist|compilation|loop(?:ed)?|extended\s+version)\b/.test(normalized);
    }

    /** @type {(...args: any[]) => any} */
    function classifyOnlineMusicSearchResultEligibility(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const provider = normalizeOnlineMusicProvider(opts.catalogProvider || opts.provider || opts.sourceProvider || opts.transportProvider || '');
        const hasStructuredCatalogProvider = ['itunes', 'deezer', 'spotify'].includes(provider);
        const isYouTube = !hasStructuredCatalogProvider && (provider === 'youtube' || !!opts.videoId || !!opts.youtubeVideoId);
        const intent = parseOnlineMusicSearchIntent(opts.query || '');
        if (!intent.normalized) {
            return { include: true, kind: isYouTube ? 'youtube-unscoped' : 'catalog', score: 0, reason: '' };
        }
        if (hasStructuredCatalogProvider || !isYouTube) {
            return { include: true, kind: 'catalog', score: 220, reason: 'structured-catalog' };
        }
        if (isLikelyShortFormOnlineMusicResult(opts)) {
            return { include: false, kind: '', score: -1000, reason: 'short-form' };
        }

        const rawTitle = String(opts.title || opts.candidateTitle || '').trim();
        const rawLyricsTitle = String(opts.lyricsTitle || '').trim();
        const rawArtist = String(opts.artist || opts.candidateArtist || '').trim();
        const rawLyricsArtist = String(opts.lyricsArtist || '').trim();
        const rawChannel = String(opts.channelTitle || opts.channel || opts.candidateChannel || '').trim();
        const rawDescription = String(opts.description || '').trim();
        const rawTags = Array.isArray(opts.tags) ? opts.tags.join(' ') : String(opts.tags || '');
        const rawText = uniqueStrings([
            rawTitle,
            rawLyricsTitle,
            rawArtist,
            rawLyricsArtist,
            rawChannel,
            rawDescription,
            rawTags
        ]).join(' ');
        const modifierText = uniqueStrings([
            rawTitle,
            rawLyricsTitle,
            rawTags
        ]).join(' ');

        if (hasDisallowedOnlineMusicSearchResultModifier(modifierText)) {
            return { include: false, kind: '', score: -900, reason: 'non-song-modifier' };
        }

        const candidateTitle = deriveOnlineMusicCandidateTitle(rawLyricsTitle || rawTitle, rawLyricsArtist || rawArtist, rawChannel);
        const titleTargets = uniqueNormalizedOnlineMusicTexts([
            candidateTitle,
            rawLyricsTitle,
            rawTitle
        ]);
        const titleScore = getMaxOnlineMusicTextMatchScore(intent.titleCandidates, titleTargets);
        const strongTitleMatch = titleScore >= 88;
        if (!strongTitleMatch) {
            return { include: false, kind: '', score: -700, reason: 'weak-title-match' };
        }

        const titleArtist = getOnlineMusicSplitArtistFromTitle(rawTitle);
        const lyricsTitleArtist = getOnlineMusicSplitArtistFromTitle(rawLyricsTitle);
        const channelIdentityText = rawChannel || rawArtist;
        const artistIdentityTargets = uniqueStrings([
            titleArtist,
            lyricsTitleArtist,
            rawLyricsArtist && !doOnlineMusicArtistTextsMatch(rawLyricsArtist, channelIdentityText)
                ? rawLyricsArtist
                : ''
        ]).filter((value) => normalizeOnlineMusicChannelArtistText(value));
        const channelArtist = normalizeOnlineMusicChannelArtistText(rawChannel || rawArtist);
        const channelMatchesDeclaredArtist = artistIdentityTargets
            .some((artist) => doOnlineMusicArtistTextsMatch(rawChannel || rawArtist, artist));
        const channelMatchesQueryArtist = intent.hasExplicitArtist
            && channelArtist
            && getMaxOnlineMusicTextMatchScore(intent.artistCandidates, [channelArtist]) >= 112;

        const rawChannelText = `${rawChannel} ${rawArtist}`.trim();
        const compactChannel = compactOnlineMusicChannelArtistText(rawChannelText);
        const hasTopicChannel = /\btopic\b/i.test(rawChannelText) || /topic$/i.test(compactOnlineMusicTrackText(rawChannelText));
        const hasVevoChannel = /\bvevo\b/i.test(rawChannelText) || /vevo$/i.test(compactOnlineMusicTrackText(rawChannelText));
        const hasOfficialArtistChannel = /\bofficial\s+artist\s+channel\b/i.test(rawText);
        const hasProvidedToYouTube = /\bprovided\s+to\s+youtube\s+by\b/i.test(rawDescription);
        const hasOfficialMarker = hasOnlineMusicOfficialUploadMarker(`${rawTitle} ${rawLyricsTitle}`);
        const hasLyricsMarker = hasOnlineMusicLyricsVideoMarker(`${rawTitle} ${rawLyricsTitle}`);

        if (hasLyricsMarker) {
            return {
                include: true,
                kind: 'lyrics-video',
                score: 170 + titleScore,
                reason: 'strong-lyrics-video'
            };
        }

        const hasOfficialSource = hasTopicChannel
            || hasVevoChannel
            || hasOfficialArtistChannel
            || hasProvidedToYouTube
            || channelMatchesDeclaredArtist
            || channelMatchesQueryArtist;
        const hasVerifiedArtistSource = hasTopicChannel
            || hasVevoChannel
            || hasOfficialArtistChannel
            || channelMatchesDeclaredArtist
            || channelMatchesQueryArtist;
        if (hasOfficialSource && (hasVerifiedArtistSource || hasOfficialMarker || hasProvidedToYouTube)) {
            const officialKind = hasTopicChannel
                ? 'topic'
                : (hasVevoChannel ? 'vevo' : (hasOfficialMarker ? 'official-upload' : 'official-artist'));
            return {
                include: true,
                kind: officialKind,
                score: 220 + titleScore + (compactChannel ? 10 : 0),
                reason: 'official-source'
            };
        }

        return { include: false, kind: '', score: -650, reason: 'unverified-youtube-source' };
    }

    /** @type {(...args: any[]) => any} */
    function scoreOnlineMusicSearchResultForQuery(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const intent = parseOnlineMusicSearchIntent(opts.query || '');
        if (!intent.normalized) return 0;

        const rawTitle = String(opts.title || opts.candidateTitle || '').trim();
        const rawArtist = String(opts.artist || opts.candidateArtist || '').trim();
        const rawChannel = String(opts.channelTitle || opts.channel || opts.candidateChannel || '').trim();
        const rawLyricsTitle = String(opts.lyricsTitle || '').trim();
        const rawLyricsArtist = String(opts.lyricsArtist || '').trim();
        const candidateTitle = deriveOnlineMusicCandidateTitle(rawLyricsTitle || rawTitle, rawLyricsArtist || rawArtist, rawChannel);
        const candidateArtist = rawLyricsArtist || rawArtist || rawChannel;
        const titleTargets = getOnlineMusicResultTitleTargets(opts);
        const artistTargets = uniqueNormalizedOnlineMusicTexts([
            candidateArtist,
            rawArtist,
            rawChannel
        ]);
        const combinedTarget = uniqueStrings([
            candidateArtist,
            rawArtist,
            rawChannel,
            candidateTitle,
            rawLyricsTitle,
            rawTitle,
            opts.releaseTitle || ''
        ]).join(' ');

        const titleScore = getMaxOnlineMusicTextMatchScore(intent.titleCandidates, titleTargets);
        const artistScore = getMaxOnlineMusicTextMatchScore(intent.artistCandidates, artistTargets);
        const fullQueryArtistScore = getMaxOnlineMusicTextMatchScore([intent.normalized], artistTargets);
        const combinedScore = scoreNormalizedOnlineMusicTextMatch(intent.normalized, combinedTarget);
        const combinedTokens = new Set(splitOnlineMusicSearchTokens(combinedTarget));
        const missingQuerySignificantTokens = getSignificantOnlineMusicSearchTokens(intent.normalized)
            .filter((token) => !combinedTokens.has(token));
        const allowArtistOnly = fullQueryArtistScore >= 112 && !intent.hasStructuredArtist;
        let artistWeightedScore = Math.round(artistScore * 1.25);
        if (!allowArtistOnly && titleScore < 42) {
            artistWeightedScore = Math.round(artistWeightedScore * 0.35);
        }
        let score = Math.max(combinedScore, Math.round(titleScore * 1.75), artistWeightedScore);

        if (titleScore >= 112) score += 74;
        else if (titleScore >= 88) score += 42;
        if (artistScore >= 112 && (allowArtistOnly || titleScore >= 42)) score += 54;
        else if (artistScore >= 88 && (allowArtistOnly || titleScore >= 42)) score += 32;
        if (titleScore >= 58 && artistScore >= 42) score += 36;
        if (!allowArtistOnly && artistScore >= 88 && titleScore < 42) score -= 35;
        if (intent.hasExplicitArtist && artistScore < 24 && titleScore < 88) score -= 38;
        if (missingQuerySignificantTokens.length) {
            const missingPenalty = missingQuerySignificantTokens.length * (intent.tokenCount >= 4 ? 100 : 72);
            score -= missingPenalty;
            if (titleScore < 112 || intent.tokenCount >= 4 || missingQuerySignificantTokens.length >= 2) {
                score = Math.min(score, 64);
            }
        }
        return Math.max(0, score);
    }

    /** @type {(...args: any[]) => any} */
    function isLikelyShortFormOnlineMusicResult(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const rawText = uniqueStrings([
            opts.title,
            opts.candidateTitle,
            opts.description,
            Array.isArray(opts.tags) ? opts.tags.join(' ') : opts.tags,
            opts.canonicalUrl,
            opts.url,
            opts.webpageUrl
        ]).join(' ');
        if (/\/shorts\//i.test(rawText)) return true;
        if (/(?:^|\s)#shorts?\b/i.test(rawText) || /\byoutube\s+shorts?\b/i.test(rawText)) return true;

        const duration = Math.max(0, Number(opts.duration || opts.lengthSeconds || 0) || 0);
        if (!(duration > 0 && duration <= 65)) return false;
        const normalized = normalizeOnlineMusicReleaseText(rawText);
        const fullMusicHint = /\b(?:official audio|official music video|official video|music video|vevo|topic|provided to youtube|single|album)\b/i.test(rawText);
        const clipHint = /\b(?:clip|clips|preview|teaser|trailer|challenge|meme|status|snippet|short)\b/.test(normalized);
        if (clipHint && !fullMusicHint) return true;
        return duration <= 45 && !fullMusicHint;
    }

    /** @type {(...args: any[]) => any} */
    function scoreOnlineMusicTrackCandidate(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const expectedVideoId = String(opts.expectedVideoId || '').trim();
        const candidateVideoId = String(opts.candidateVideoId || '').trim();
        const targetTitle = normalizeOnlineMusicTrackText(opts.targetTitle || '');
        const targetArtist = normalizeOnlineMusicTrackText(opts.targetArtist || '');
        const releaseTitle = normalizeOnlineMusicTrackText(opts.releaseTitle || '');
        const candidateTitle = normalizeOnlineMusicTrackText(opts.candidateTitle || '');
        const candidateArtist = normalizeOnlineMusicTrackText(opts.candidateArtist || '');
        const candidateChannel = normalizeOnlineMusicTrackText(opts.candidateChannel || '');

        let score = 0;
        if (expectedVideoId && candidateVideoId && expectedVideoId === candidateVideoId) score += 120;

        if (targetTitle && candidateTitle) {
            const titleScore = scoreNormalizedOnlineMusicTextMatch(targetTitle, candidateTitle);
            score += Math.round(titleScore * 0.72);
            if (titleScore < 28 && getSignificantOnlineMusicSearchTokens(targetTitle).length) score -= 26;
        }

        if (targetArtist && candidateArtist) {
            if (targetArtist === candidateArtist) score += 42;
            else if (candidateArtist.includes(targetArtist) || targetArtist.includes(candidateArtist)) score += 24;
        }

        if (targetArtist && candidateChannel) {
            if (targetArtist === candidateChannel) score += 36;
            else if (candidateChannel.includes(targetArtist) || targetArtist.includes(candidateChannel)) score += 20;
        }

        if (releaseTitle && candidateTitle && (candidateTitle.includes(releaseTitle) || releaseTitle.includes(candidateTitle))) {
            score += 8;
        }
        if (/\btopic\b/i.test(String(opts.candidateChannel || ''))) score += 6;
        return Math.max(0, score);
    }

    /** @type {(...args: any[]) => any} */
    function resolveOnlineQueuePosition(queue, queueIndex, currentTrackId) {
        const list = uniqueStrings(queue);
        if (!list.length) {
            return {
                queue: [],
                currentTrackId: '',
                queueIndex: -1
            };
        }

        const currentId = String(currentTrackId || '').trim();
        if (currentId) {
            const foundIndex = list.indexOf(currentId);
            if (foundIndex !== -1) {
                return {
                    queue: list,
                    currentTrackId: currentId,
                    queueIndex: foundIndex
                };
            }
        }

        const numericIndex = Number(queueIndex);
        if (Number.isFinite(numericIndex)) {
            const boundedIndex = Math.max(0, Math.min(Math.trunc(numericIndex), list.length - 1));
            return {
                queue: list,
                currentTrackId: list[boundedIndex],
                queueIndex: boundedIndex
            };
        }

        return {
            queue: list,
            currentTrackId: list[0],
            queueIndex: 0
        };
    }

    /** @type {(...args: any[]) => any} */
    function projectOnlineQueueToAudioState(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const queueMode = String(opts.queueMode || '').trim().toLowerCase() === 'shuffle' ? 'shuffle' : 'ordered';
        const resolved = resolveOnlineQueuePosition(opts.queue, opts.queueIndex, opts.currentTrackId);

        if (queueMode === 'shuffle') {
            return {
                queue: [],
                queueSource: 'manual',
                isShuffle: true,
                shuffleQueue: resolved.queue.slice(),
                shuffleIndex: resolved.queueIndex,
                pendingShuffleSeed: null
            };
        }

        return {
            queue: resolved.queueIndex >= 0 ? resolved.queue.slice(resolved.queueIndex + 1) : resolved.queue.slice(),
            queueSource: 'manual',
            isShuffle: false,
            shuffleQueue: [],
            shuffleIndex: -1,
            pendingShuffleSeed: null
        };
    }

    /** @type {(...args: any[]) => any} */
    function resolveOnlineQueueStep(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const repeatMode = ['none', 'all', 'one'].includes(String(opts.repeatMode || '').trim().toLowerCase())
            ? String(opts.repeatMode || '').trim().toLowerCase()
            : 'none';
        const direction = (Number(opts.offset) || 0) < 0 ? -1 : 1;
        const resolved = resolveOnlineQueuePosition(opts.queue, opts.queueIndex, opts.currentTrackId);

        if (!resolved.queue.length || !resolved.currentTrackId) {
            return {
                action: 'stop',
                nextTrackId: null,
                nextIndex: -1
            };
        }

        if (repeatMode === 'one') {
            return {
                action: 'restart',
                nextTrackId: resolved.currentTrackId,
                nextIndex: resolved.queueIndex
            };
        }

        if (direction < 0) {
            if (resolved.queueIndex > 0) {
                return {
                    action: 'play',
                    nextTrackId: resolved.queue[resolved.queueIndex - 1],
                    nextIndex: resolved.queueIndex - 1
                };
            }
            if (repeatMode === 'all') {
                return {
                    action: 'play',
                    nextTrackId: resolved.queue[resolved.queue.length - 1],
                    nextIndex: resolved.queue.length - 1
                };
            }
            return {
                action: 'restart',
                nextTrackId: resolved.currentTrackId,
                nextIndex: resolved.queueIndex
            };
        }

        if (resolved.queueIndex < resolved.queue.length - 1) {
            return {
                action: 'play',
                nextTrackId: resolved.queue[resolved.queueIndex + 1],
                nextIndex: resolved.queueIndex + 1
            };
        }
        if (repeatMode === 'all') {
            return {
                action: 'play',
                nextTrackId: resolved.queue[0],
                nextIndex: 0
            };
        }
        return {
            action: 'stop',
            nextTrackId: null,
            nextIndex: resolved.queueIndex
        };
    }

    /** @type {(...args: any[]) => any} */
    function migrateLegacyOnlineMusicData(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const onlineMusicState = opts.onlineMusicState && typeof opts.onlineMusicState === 'object'
            ? opts.onlineMusicState
            : {};
        const existingPlaylists = Array.isArray(opts.existingPlaylists) ? opts.existingPlaylists : [];
        const generateId = typeof opts.generateId === 'function'
            ? opts.generateId
            : (() => `playlist_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`);

        const migratedTracks = (Array.isArray(onlineMusicState.library) ? onlineMusicState.library : [])
            .map(cloneTrackForMigration)
            .filter((/** @type {any} */ track) => track && typeof track.id === 'string' && track.id.trim());
        const validTrackIds = new Set(migratedTracks.map((/** @type {any} */ track) => track.id));
        const playlistIds = new Set(existingPlaylists
            .map((/** @type {any} */ playlist) => String(playlist && playlist.id ? playlist.id : '').trim())
            .filter(Boolean));

        const migratedPlaylists = (Array.isArray(onlineMusicState.playlists) ? onlineMusicState.playlists : [])
            .map((/** @type {any} */ playlist) => {
                const raw = playlist && typeof playlist === 'object' ? playlist : {};
                let nextId = String(raw.id || '').trim();
                if (!nextId || playlistIds.has(nextId)) {
                    do {
                        nextId = String(generateId() || '').trim();
                    } while (!nextId || playlistIds.has(nextId));
                }
                playlistIds.add(nextId);
                return {
                    id: nextId,
                    name: String(raw.name || 'Playlist').trim() || 'Playlist',
                    tracks: uniqueStrings(raw.tracks).filter((/** @type {any} */ trackId) => validTrackIds.has(trackId)),
                    createdAt: Number(raw.createdAt) || Date.now(),
                    updatedAt: Number(raw.updatedAt) || Date.now()
                };
            })
            .filter((/** @type {any} */ playlist) => playlist.name);

        const nextOnlineState = {
            ...onlineMusicState,
            library: [],
            playlists: [],
            activePlaylistId: null,
            currentPlaylistContextId: null,
            currentTime: 0,
            isPlaying: false,
            playbackContext: 'search'
        };

        if (nextOnlineState.currentTrack && typeof nextOnlineState.currentTrack === 'object') {
            nextOnlineState.currentTrack = cloneTrackForMigration(nextOnlineState.currentTrack);
        }

        nextOnlineState.queue = uniqueStrings(nextOnlineState.queue);
        nextOnlineState.queueIndex = nextOnlineState.queue.length > 0
            ? Math.max(-1, Math.min(Number(nextOnlineState.queueIndex) || -1, nextOnlineState.queue.length - 1))
            : -1;

        return {
            migratedTracks,
            migratedPlaylists,
            nextOnlineState
        };
    }

    return {
        buildOnlineMusicTrackFromQueueEntry,
        buildSavedOnlineMusicLibraryIndex,
        classifyOnlineMusicRelease,
        classifyYouTubeApiError,
        classifyOnlineMusicSearchResultEligibility,
        getOnlineMusicProviderLabel,
        isLikelyTitleOnlyOnlineMusicSearchResult,
        isStaleOnlineMusicPlaybackAttempt,
        lookupSavedOnlineMusicLibraryEntry,
        mergeUniqueOnlineMusicTracks,
        migrateLegacyOnlineMusicData,
        normalizeOnlineMusicProvider,
        purgeSpotifyImportedData,
        projectOnlineQueueToAudioState,
        removeSavedOnlineMusicLibraryEntries,
        resolveOnlineQueueStep,
        sanitizeProviderErrorMessage,
        isLikelyShortFormOnlineMusicResult,
        scoreOnlineMusicTrackCandidate,
        scoreOnlineMusicSearchResultForQuery,
        shouldIgnoreOnlineMusicTransportEvent,
        upsertSavedOnlineMusicLibraryEntry,
        uniqueOnlineMusicTracksInDeclaredOrder
    };
}));
