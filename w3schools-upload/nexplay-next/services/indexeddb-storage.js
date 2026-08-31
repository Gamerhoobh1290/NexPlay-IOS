import { StorageAdapter } from './storage-adapter.js';

const DB_NAME = 'nexplay_pro_v2';
const DB_VERSION = 1;
const STATE_KEY = 'root_state';
const LEGACY_MIGRATION_KEY = 'legacy_migrated_v1';

export class IndexedDbStorageAdapter extends StorageAdapter {
    constructor() {
        super();
        /** @type {Promise<IDBDatabase>|null} */
        this.dbPromise = null;
    }

    async getState() {
        const db = await this.#openDb();
        return this.#getRecord(db, 'app_state', STATE_KEY);
    }

    async saveState(partial) {
        const db = await this.#openDb();
        const current = await this.#getRecord(db, 'app_state', STATE_KEY) || {};
        const next = {
            ...current,
            ...partial,
            updatedAt: Date.now()
        };
        await this.#putRecord(db, 'app_state', { key: STATE_KEY, value: next, updatedAt: next.updatedAt });
        return next;
    }

    async migrateFromLegacy() {
        const db = await this.#openDb();
        const marker = await this.#getRecord(db, 'app_state', LEGACY_MIGRATION_KEY);
        if (marker && marker.value === true) {
            return { migrated: false, reason: 'already_migrated' };
        }

        const safeParse = (key, fallback) => {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return fallback;
                return JSON.parse(raw);
            } catch (_) {
                return fallback;
            }
        };

        const legacyState = safeParse('nexplay_pro_state', {});
        const legacyPlaylists = safeParse('nexplay_pro_playlists', []);
        const legacyMetadata = safeParse('nexplay_pro_metadata', {});
        const legacyLyrics = safeParse('nexplay_pro_lyrics', {});
        const legacyOfflineLyrics = safeParse('nexplay_pro_offline_lyrics', {});

        const migratedState = {
            settings: {
                volume: legacyState.volume ?? 0.8,
                isDarkMode: legacyState.isDarkMode ?? true,
                sortType: legacyState.sortType ?? 'date',
                sortDirection: legacyState.sortDirection ?? 'desc',
                playbackSpeed: legacyState.playbackSpeed ?? 1,
                accentColor: legacyState.accentColor ?? '#06b6d4',
                visualizerStyle: legacyState.visualizerStyle ?? 'bars',
                crossfadeDuration: legacyState.crossfadeDuration ?? 0,
                autoAccentFromArt: legacyState.autoAccentFromArt ?? false,
                autoQueueEnabled: legacyState.autoQueueEnabled ?? true,
                keyBindings: legacyState.keyBindings || {}
            },
            listeningHistory: legacyState.listeningHistory || {},
            metadata: legacyMetadata,
            lyrics: {
                custom: legacyLyrics,
                offline: legacyOfflineLyrics
            },
            playlists: legacyPlaylists,
            updatedAt: Date.now()
        };

        await this.#putRecord(db, 'app_state', { key: STATE_KEY, value: migratedState, updatedAt: Date.now() });
        await this.#putRecord(db, 'app_state', { key: LEGACY_MIGRATION_KEY, value: true, updatedAt: Date.now() });
        await this.upsertPlaylists(Array.isArray(legacyPlaylists) ? legacyPlaylists : []);

        return { migrated: true, playlistCount: Array.isArray(legacyPlaylists) ? legacyPlaylists.length : 0 };
    }

    async upsertTracks(tracks) {
        const list = Array.isArray(tracks) ? tracks : [];
        const db = await this.#openDb();
        await this.#runWrite(db, 'tracks_meta', (store) => {
            list.forEach((track) => {
                if (!track || !track.id) return;
                store.put({ ...track, updatedAt: Date.now() });
            });
        });
    }

    async upsertPlaylists(playlists) {
        const list = Array.isArray(playlists) ? playlists : [];
        const db = await this.#openDb();
        await this.#runWrite(db, 'playlists', (store) => {
            list.forEach((playlist) => {
                if (!playlist || !playlist.id) return;
                store.put({ ...playlist, updatedAt: Date.now() });
            });
        });
    }

    async appendHistory(historyItems) {
        const list = Array.isArray(historyItems) ? historyItems : [];
        const db = await this.#openDb();
        await this.#runWrite(db, 'history_events', (store) => {
            list.forEach((item, index) => {
                const id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
                store.put({ id, item, createdAt: Date.now() });
            });
        });
    }

    async getAutomationRules() {
        const db = await this.#openDb();
        return this.#getAllRecords(db, 'automation_rules');
    }

    async upsertAutomationRules(rules) {
        const list = Array.isArray(rules) ? rules : [];
        const db = await this.#openDb();
        await this.#runWrite(db, 'automation_rules', (store) => {
            list.forEach((rule) => {
                if (!rule || !rule.id) return;
                store.put({ ...rule, updatedAt: Date.now() });
            });
        });
    }

    async getSyncRecords() {
        const db = await this.#openDb();
        return this.#getAllRecords(db, 'sync_records');
    }

    async upsertSyncRecords(records) {
        const list = Array.isArray(records) ? records : [];
        const db = await this.#openDb();
        await this.#runWrite(db, 'sync_records', (store) => {
            list.forEach((record) => {
                const id = `${record.entity}:${record.entityId}`;
                store.put({ ...record, id });
            });
        });
    }

    async #openDb() {
        if (this.dbPromise) return this.dbPromise;
        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('app_state')) {
                    db.createObjectStore('app_state', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('tracks_meta')) {
                    db.createObjectStore('tracks_meta', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('playlists')) {
                    db.createObjectStore('playlists', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('history_events')) {
                    db.createObjectStore('history_events', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('lyrics_cache')) {
                    db.createObjectStore('lyrics_cache', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('automation_rules')) {
                    db.createObjectStore('automation_rules', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('sync_records')) {
                    db.createObjectStore('sync_records', { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
        });
        return this.dbPromise;
    }

    async #getRecord(db, storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => {
                const value = request.result;
                resolve(value ? value.value ?? value : null);
            };
            request.onerror = () => reject(request.error || new Error(`Failed reading ${storeName}`));
        });
    }

    async #getAllRecords(db, storeName) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error || new Error(`Failed reading ${storeName}`));
        });
    }

    async #putRecord(db, storeName, value) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.oncomplete = () => resolve(undefined);
            tx.onerror = () => reject(tx.error || new Error(`Failed writing ${storeName}`));
            tx.objectStore(storeName).put(value);
        });
    }

    async #runWrite(db, storeName, writer) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.oncomplete = () => resolve(undefined);
            tx.onerror = () => reject(tx.error || new Error(`Failed writing ${storeName}`));
            const store = tx.objectStore(storeName);
            writer(store);
        });
    }
}
