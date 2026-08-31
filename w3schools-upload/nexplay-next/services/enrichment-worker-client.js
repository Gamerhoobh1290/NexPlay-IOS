export class EnrichmentWorkerClient {
    constructor() {
        this.worker = null;
        /** @type {Map<string, {resolve: (value:any)=>void, reject:(error:any)=>void, timer:any}>} */
        this.pending = new Map();
    }

    isSupported() {
        return typeof Worker !== 'undefined';
    }

    async run(task, payload, timeoutMs = 2500) {
        if (!this.isSupported()) {
            throw new Error('Worker is not supported in this environment');
        }

        const worker = this.#ensureWorker();
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Worker task timed out: ${task}`));
            }, timeoutMs);

            this.pending.set(id, { resolve, reject, timer });
            worker.postMessage({ id, task, payload });
        });
    }

    suggestTags(track) {
        return this.run('suggest_tags', track);
    }

    fingerprint(text) {
        return this.run('fingerprint', { text });
    }

    coverLookup(provider, track) {
        return this.run('cover_lookup', {
            provider,
            title: track && track.title ? track.title : '',
            artist: track && track.artist ? track.artist : ''
        }, 3200);
    }

    lyricsLookup(artist, title) {
        return this.run('lyrics_lookup', {
            artist: artist || '',
            title: title || ''
        }, 3800);
    }

    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }

        this.pending.forEach((entry) => {
            clearTimeout(entry.timer);
            entry.reject(new Error('Worker destroyed'));
        });
        this.pending.clear();
    }

    #ensureWorker() {
        if (this.worker) return this.worker;

        const url = new URL('../workers/enrichment.worker.js', import.meta.url);
        this.worker = new Worker(url, { type: 'module' });
        this.worker.onmessage = (event) => {
            const { id, ok, result, error } = event.data || {};
            const entry = this.pending.get(id);
            if (!entry) return;
            clearTimeout(entry.timer);
            this.pending.delete(id);
            if (ok) entry.resolve(result);
            else entry.reject(new Error(error || 'Worker task failed'));
        };
        this.worker.onerror = (event) => {
            const reason = event && event.message ? event.message : 'Worker error';
            this.pending.forEach((entry) => {
                clearTimeout(entry.timer);
                entry.reject(new Error(reason));
            });
            this.pending.clear();
        };

        return this.worker;
    }
}
