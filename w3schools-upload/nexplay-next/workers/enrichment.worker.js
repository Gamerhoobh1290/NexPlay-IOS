self.onmessage = async (event) => {
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

function fingerprint(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return `fp_${Math.abs(hash).toString(16)}`;
}

function cleanStr(input) {
    return String(input || '')
        .replace(/\(Official Video\)|\(Lyrics\)|\.mp3|\.wav|ft\.|feat\./gi, '')
        .trim();
}

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

async function lookupLyrics(payload) {
    const artist = cleanStr(payload.artist || '');
    const title = cleanStr(payload.title || '');
    if (!artist && !title) return null;

    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const synced = String(data && data.syncedLyrics ? data.syncedLyrics : '').trim();
    if (synced) {
        return { kind: 'synced', raw: synced, provider: 'lrclib' };
    }

    const plain = String(data && data.plainLyrics ? data.plainLyrics : '').trim();
    if (plain) {
        return { kind: 'plain', raw: plain, provider: 'lrclib' };
    }

    return null;
}
