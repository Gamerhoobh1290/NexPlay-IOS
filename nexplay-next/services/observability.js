const DEFAULT_BUFFER_LIMIT = 200;

export class ObservabilityService {
    /**
     * @param {{
     *   endpoint?: string,
     *   flushIntervalMs?: number,
     *   bufferLimit?: number,
     *   enabled?: boolean
     * }=} options
     */
    constructor(options = {}) {
        this.endpoint = options.endpoint || '';
        this.flushIntervalMs = Math.max(15000, Number(options.flushIntervalMs || 30000));
        this.bufferLimit = Math.max(50, Number(options.bufferLimit || DEFAULT_BUFFER_LIMIT));
        this.enabled = options.enabled !== false;
        /** @type {{type:string, name:string, at:number, payload?:any}[]} */
        this.buffer = [];
        /** @type {ReturnType<typeof setInterval>|null} */
        this.interval = null;

        this.#wireGlobalHandlers();

        if (this.enabled) {
            this.interval = setInterval(() => {
                this.flush().catch(() => {});
            }, this.flushIntervalMs);
        }
    }

    /** @type {(...args: any[]) => any} */
    mark(name) {
        if (!this.enabled || !name || typeof performance === 'undefined') return;
        performance.mark(name);
        this.track('mark', name);
    }

    /** @type {(...args: any[]) => any} */
    measure(name, startMark, endMark) {
        if (!this.enabled || !name || typeof performance === 'undefined') return null;
        try {
            performance.measure(name, startMark, endMark);
            const entries = performance.getEntriesByName(name, 'measure');
            const latest = entries[entries.length - 1];
            const duration = latest ? latest.duration : null;
            this.track('measure', name, { duration, startMark, endMark });
            return duration;
        } catch (_) {
            return null;
        }
    }

    /** @type {(...args: any[]) => any} */
    track(type, name, payload = {}) {
        if (!this.enabled) return;
        this.buffer.push({ type, name, at: Date.now(), payload });
        if (this.buffer.length >= this.bufferLimit) {
            this.flush().catch(() => {});
        }
    }

    /** @type {(...args: any[]) => any} */
    captureError(error, context = {}) {
        const message = error instanceof Error ? error.message : String(error || 'Unknown error');
        const stack = error instanceof Error ? error.stack || '' : '';
        this.track('error', message, { stack, context });
    }

    /** @type {(...args: any[]) => any} */
    getBufferedEvents() {
        return this.buffer.slice();
    }

    /** @type {(...args: any[]) => Promise<any>} */
    async flush() {
        if (!this.enabled || this.buffer.length === 0) return { sent: 0, skipped: true };
        const payload = this.buffer.slice();
        this.buffer = [];

        if (!this.endpoint || typeof fetch !== 'function') {
            // Local fallback: dispatch a diagnostic event when a browser window exists.
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
                window.dispatchEvent(new CustomEvent('nexplay:telemetry', { detail: payload }));
            }
            return { sent: payload.length, skipped: true };
        }

        try {
            await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: payload })
            });
            return { sent: payload.length, skipped: false };
        } catch (error) {
            this.buffer = payload.concat(this.buffer);
            throw error;
        }
    }

    /** @type {(...args: any[]) => any} */
    destroy() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    #wireGlobalHandlers() {
        if (typeof window === 'undefined') return;

        window.addEventListener('error', (/** @type {any} */ event) => {
            this.captureError(event.error || event.message || 'Window error', {
                source: 'window.error',
                file: event.filename,
                line: event.lineno,
                col: event.colno
            });
        });

        window.addEventListener('unhandledrejection', (/** @type {any} */ event) => {
            this.captureError(event.reason || 'Unhandled promise rejection', {
                source: 'window.unhandledrejection'
            });
        });
    }
}
