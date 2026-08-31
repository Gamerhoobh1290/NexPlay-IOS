/** @type {Record<string, string>} */
const MEDIA_SYNONYMS = {
    song: 'audio',
    songs: 'audio',
    music: 'audio',
    audio: 'audio',
    video: 'videos',
    videos: 'videos',
    movie: 'videos',
    movies: 'videos',
    favorite: 'favorites',
    favorites: 'favorites'
};

export class SemanticIntelligenceService {
    /** @type {(...args: any[]) => any} */
    parseNaturalQuery(input) {
        const raw = String(input || '').trim();
        if (!raw) {
            return { raw: '', freeText: '', mediaTab: null, tag: null, sortType: null, sortDirection: null };
        }

        const tokenized = raw.split(/\s+/);
        let mediaTab = null;
        let tag = null;
        let sortType = null;
        let sortDirection = null;
        /** @type {any[]} */
        const leftovers = [];

        tokenized.forEach((/** @type {any} */ token) => {
            const t = token.toLowerCase();
            if (t.startsWith('tag:')) {
                tag = token.slice(4);
                return;
            }
            if (t.startsWith('sort:')) {
                const [kind, dir] = token.slice(5).split('-');
                if (kind) sortType = kind;
                if (dir) sortDirection = dir;
                return;
            }
            if (t === 'recent') {
                sortType = 'date';
                sortDirection = 'desc';
                return;
            }
            if (t === 'oldest') {
                sortType = 'date';
                sortDirection = 'asc';
                return;
            }
            if (MEDIA_SYNONYMS[t]) {
                mediaTab = MEDIA_SYNONYMS[t];
                return;
            }
            leftovers.push(token);
        });

        return {
            raw,
            freeText: leftovers.join(' ').trim(),
            mediaTab,
            tag,
            sortType,
            sortDirection
        };
    }

    /**
     * Lightweight heuristic tags based on title/artist/type.
     * @param {{title?: string, artist?: string, type?: string, fileName?: string}} track
     */
    suggestTags(track) {
        const title = String(track && track.title ? track.title : '').toLowerCase();
        const artist = String(track && track.artist ? track.artist : '').toLowerCase();
        const fileName = String(track && track.fileName ? track.fileName : '').toLowerCase();
        const tags = new Set();

        if ((track && track.type) === 'video') tags.add('video');
        else tags.add('audio');

        if (/live|concert|session/.test(title + ' ' + fileName)) tags.add('live');
        if (/remix|edit/.test(title + ' ' + fileName)) tags.add('remix');
        if (/instrumental/.test(title + ' ' + fileName)) tags.add('instrumental');
        if (/podcast|episode/.test(title + ' ' + fileName)) tags.add('podcast');
        if (/lofi|chill|ambient/.test(title + ' ' + artist)) tags.add('focus');
        if (/workout|gym|run|drill/.test(title + ' ' + artist)) tags.add('workout');

        const artistTokens = artist.split(/\s+/).filter(Boolean).slice(0, 2);
        artistTokens.forEach((/** @type {any} */ token) => {
            if (token.length > 2) tags.add(`artist:${token}`);
        });

        return Array.from(tags);
    }

    /** @type {(...args: any[]) => any} */
    recommendNextTrack(tracks, currentTrackId, historyIds) {
        const list = Array.isArray(tracks) ? tracks : [];
        if (list.length === 0) return null;

        const current = list.find((/** @type {any} */ track) => track.id === currentTrackId) || null;
        const historySet = new Set(Array.isArray(historyIds) ? historyIds : []);

        const scored = list
            .filter((/** @type {any} */ track) => track.id !== currentTrackId)
            .map((/** @type {any} */ track) => {
                let score = 0;
                if (current && track.type === current.type) score += 3;
                if (current && track.artist && current.artist && track.artist === current.artist) score += 4;
                if (!historySet.has(track.id)) score += 2;
                score += Math.min(3, Number(track.playCount || 0) / 5);
                return { track, score };
            })
            .sort((/** @type {any} */ a, /** @type {any} */ b) => b.score - a.score);

        return scored.length ? scored[0].track : list[0];
    }
}
