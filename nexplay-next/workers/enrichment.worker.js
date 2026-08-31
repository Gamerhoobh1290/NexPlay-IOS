self.onmessage = async (/** @type {any} */ event) => {
    const { id, task, payload } = event.data || {};

    try {
        let result = null;
        if (task === 'suggest_tags') {
            result = suggestTags(payload || {});
        } else if (task === 'fingerprint') {
            result = fingerprint(payload && payload.text ? String(payload.text) : '');
        } else if (task === 'cover_lookup') {
            result = await lookupCover(payload || {});
        } else if (task === 'lyrics_lookup') {
            result = await lookupLyrics(payload || {});
        }

        self.postMessage({ id, ok: true, result });
    } catch (error) {
        self.postMessage({
            id,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        });
    }
};

/** @type {(...args: any[]) => any} */
function suggestTags(track) {
    const title = String(track.title || '').toLowerCase();
    const artist = String(track.artist || '').toLowerCase();
    const tags = new Set();

    if (track.type === 'video') tags.add('video');
    else tags.add('audio');

    if (/live|concert/.test(title)) tags.add('live');
    if (/remix|edit/.test(title)) tags.add('remix');
    if (/instrumental/.test(title)) tags.add('instrumental');
    if (/focus|ambient|lofi/.test(title + ' ' + artist)) tags.add('focus');
    if (/workout|gym|run/.test(title + ' ' + artist)) tags.add('workout');

    return Array.from(tags);
}

/** @type {(...args: any[]) => any} */
function fingerprint(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return `fp_${Math.abs(hash).toString(16)}`;
}

/** @type {(...args: any[]) => any} */
function cleanStr(input) {
    return String(input || '')
        .replace(/\(Official Video\)|\(Lyrics\)|\.mp3|\.wav|ft\.|feat\./gi, '')
        .trim();
}

/** @type {(...args: any[]) => string} */
function normalizeLyricsText(input) {
    return cleanStr(input)
        .toLowerCase()
        .replace(/[\(\[\{]\s*(?:official|lyrics?|lyric video|audio|video|visualizer|live|remaster(?:ed)?|acoustic|demo|edit|mix|version|explicit|clean)[^)\]\}]*[\)\]\}]/gi, ' ')
        .replace(/\b(?:ft|feat|featuring)\b\.?\s+.+$/i, ' ')
        .replace(/\s+-\s+.*$/, ' ')
        .replace(/[^\p{L}\p{N}']+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** @type {(...args: any[]) => number} */
function lyricsTokenOverlapRatio(left, right) {
    const leftTokens = new Set(normalizeLyricsText(left).split(/\s+/).filter(Boolean));
    const rightTokens = new Set(normalizeLyricsText(right).split(/\s+/).filter(Boolean));
    if (!leftTokens.size || !rightTokens.size) return 0;
    let shared = 0;
    leftTokens.forEach((token) => {
        if (rightTokens.has(token)) shared += 1;
    });
    return shared / Math.max(leftTokens.size, rightTokens.size, 1);
}

/** @type {(...args: any[]) => boolean} */
function isLyricsSearchMatch(item, artist, title) {
    const itemTitle = item && (item.trackName || item.title) ? String(item.trackName || item.title) : '';
    const itemArtist = item && (item.artistName || item.artist) ? String(item.artistName || item.artist) : '';
    if (!title || lyricsTokenOverlapRatio(itemTitle, title) < 0.58) return false;
    if (artist && lyricsTokenOverlapRatio(itemArtist, artist) < 0.34) return false;
    return true;
}

/** @type {(...args: any[]) => Promise<any>} */
async function fetchJsonWithTimeout(url, timeoutMs = 15000) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const res = await fetch(url, controller ? { signal: controller.signal, headers: { Accept: 'application/json' } } : { headers: { Accept: 'application/json' } });
        if (!res.ok) return null;
        return await res.json();
    } catch (_) {
        return null;
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

/** @type {(...args: any[]) => any} */
function createLyricsResult(item, raw, kind, provider, providerLabel, artist, title) {
    return {
        kind,
        raw,
        provider,
        providerLabel,
        artist: item?.artistName || artist,
        title: item?.trackName || title,
        duration: item?.duration || 0
    };
}

/** @type {(...args: any[]) => Promise<any>} */
async function lookupCover(payload) {
    const provider = String(payload.provider || 'itunes').toLowerCase();
    const title = cleanStr(payload.title || '');
    const artist = cleanStr(payload.artist || '');
    if (!title && !artist) return null;

    if (provider === 'itunes') {
        const query = encodeURIComponent(`${artist} ${title}`.trim());
        const res = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`);
        if (!res.ok) return null;
        const data = await res.json();
        const image = data && data.results && data.results[0] ? data.results[0].artworkUrl100 : null;
        return image ? image.replace('100x100', '600x600') : null;
    }

    if (provider === 'deezer') {
        const query = encodeURIComponent(`${artist} ${title}`.trim());
        const res = await fetch(`https://api.deezer.com/search?q=${query}&output=json`);
        if (!res.ok) return null;
        const data = await res.json();
        return data && data.data && data.data[0] && data.data[0].album ? data.data[0].album.cover_xl || null : null;
    }

    return null;
}

/** @type {(...args: any[]) => Promise<any>} */
async function lookupLyrics(payload) {
    const artist = cleanStr(payload.artist || '');
    const title = cleanStr(payload.title || '');
    if (!artist && !title) return null;

    const searchUrls = [];
    if (title) {
        const structuredParams = new URLSearchParams();
        if (artist) structuredParams.set('artist_name', artist);
        structuredParams.set('track_name', title);
        searchUrls.push(`https://lrclib.net/api/search?${structuredParams.toString()}`);
        if (artist) {
            searchUrls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(`${artist} ${title}`)}`);
            searchUrls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(`${title} ${artist}`)}`);
        }
    }

    for (const url of searchUrls) {
        const data = await fetchJsonWithTimeout(url, 20000);
        const items = Array.isArray(data) ? data.slice(0, 20) : [];
        const syncedItem = items.find((item) => String(item?.syncedLyrics || '').trim() && isLyricsSearchMatch(item, artist, title));
        if (syncedItem) {
            return createLyricsResult(
                syncedItem,
                String(syncedItem.syncedLyrics || '').trim(),
                'synced',
                'lrclib:search',
                'LRCLIB Search',
                artist,
                title
            );
        }
    }

    const getParams = new URLSearchParams();
    if (artist) getParams.set('artist_name', artist);
    if (title) getParams.set('track_name', title);
    const data = getParams.toString()
        ? await fetchJsonWithTimeout(`https://lrclib.net/api/get?${getParams.toString()}`, 20000)
        : null;
    const synced = String(data && data.syncedLyrics ? data.syncedLyrics : '').trim();
    if (synced) {
        return createLyricsResult(data, synced, 'synced', 'lrclib:get', 'LRCLIB', artist, title);
    }

    const plain = String(data && data.plainLyrics ? data.plainLyrics : '').trim();
    if (plain) {
        return createLyricsResult(data, plain, 'plain', 'lrclib:get', 'LRCLIB', artist, title);
    }

    return null;
}
