import { SyncService } from './sync-service.js';

/**
 * @typedef {{
 *   url?: string,
 *   anonKey?: string,
 *   accessToken?: string,
 *   pullPath?: string,
 *   pushPath?: string,
 *   timeoutMs?: number
 * }} SupabaseSyncConfig
 */

export class SupabaseSyncService extends SyncService {
    /**
     * @param {SupabaseSyncConfig} config
     */
    constructor(config = {}) {
        super();
        this.config = {
            pullPath: '/functions/v1/nexplay-sync/pull',
            pushPath: '/functions/v1/nexplay-sync/push',
            timeoutMs: 8000,
            ...config
        };
        /** @type {{state:string,lastPulledAt:number|null,lastPushedAt:number|null,lastError:string|null}} */
        this.status = {
            state: 'idle',
            lastPulledAt: null,
            lastPushedAt: null,
            lastError: null
        };
    }

    /** @type {(...args: any[]) => Promise<any>} */
    async pull() {
        if (!this.#isConfigured()) {
            this.status.state = 'disabled';
            return { changes: [], disabled: true };
        }

        this.status.state = 'pulling';
        try {
            const response = await this.#request(this.config.pullPath, { method: 'GET' });
            const payload = response || { changes: [] };
            this.status.state = 'idle';
            this.status.lastPulledAt = Date.now();
            this.status.lastError = null;
            return payload;
        } catch (error) {
            this.status.state = 'error';
            this.status.lastError = error instanceof Error ? error.message : String(error);
            throw error;
        }
    }

    /** @type {(...args: any[]) => Promise<any>} */
    async push(changes) {
        if (!this.#isConfigured()) {
            this.status.state = 'disabled';
            return { applied: 0, disabled: true };
        }

        this.status.state = 'pushing';
        try {
            const response = await this.#request(this.config.pushPath, {
                method: 'POST',
                body: JSON.stringify({ changes: changes || [] })
            });
            this.status.state = 'idle';
            this.status.lastPushedAt = Date.now();
            this.status.lastError = null;
            return response || { applied: 0 };
        } catch (error) {
            this.status.state = 'error';
            this.status.lastError = error instanceof Error ? error.message : String(error);
            throw error;
        }
    }

    /** @type {(...args: any[]) => any} */
    resolveConflicts(localRecords, remoteRecords) {
        const byEntityKey = new Map();
        const normalize = (/** @type {any} */ record) => {
            const updatedAt = Number(record.updatedAt || 0);
            return { ...record, updatedAt };
        };

        (Array.isArray(localRecords) ? localRecords : []).forEach((/** @type {any} */ record) => {
            const normalized = normalize(record);
            const key = `${normalized.entity}:${normalized.entityId}`;
            byEntityKey.set(key, normalized);
        });

        (Array.isArray(remoteRecords) ? remoteRecords : []).forEach((/** @type {any} */ record) => {
            const normalized = normalize(record);
            const key = `${normalized.entity}:${normalized.entityId}`;
            const existing = byEntityKey.get(key);
            if (!existing || normalized.updatedAt >= existing.updatedAt) {
                byEntityKey.set(key, normalized);
            }
        });

        return Array.from(byEntityKey.values());
    }

    /** @type {(...args: any[]) => any} */
    getStatus() {
        return { ...this.status };
    }

    #isConfigured() {
        return Boolean(this.config.url && this.config.anonKey);
    }

    /** @type {(...args: any[]) => Promise<any>} */
    async #request(path, options) {
        if (!this.config.url || !this.config.anonKey) {
            throw new Error('Supabase sync is not configured');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        try {
            const response = await fetch(`${this.config.url}${path}`, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    apikey: this.config.anonKey,
                    Authorization: `Bearer ${this.config.accessToken || this.config.anonKey}`,
                    ...(options && options.headers ? options.headers : {})
                }
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Sync request failed (${response.status}): ${text || 'Unknown error'}`);
            }

            return response.headers.get('content-type')?.includes('application/json')
                ? response.json()
                : {};
        } finally {
            clearTimeout(timeout);
        }
    }
}
