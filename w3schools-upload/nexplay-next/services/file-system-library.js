const DB_NAME = 'nexplay_fs_handles';
const DB_VERSION = 1;
const STORE = 'handles';

export class FileSystemLibraryService {
    constructor() {
        this.dbPromise = null;
    }

    isSupported() {
        return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
    }

    async pickFiles(options = {}) {
        if (!this.isSupported()) {
            return { supported: false, handles: [] };
        }

        const handles = await window.showOpenFilePicker({
            multiple: options.multiple !== false,
            types: options.types || undefined,
            excludeAcceptAllOption: false
        });

        await this.saveHandles(handles);
        return { supported: true, handles };
    }

    async saveHandles(handles) {
        const list = Array.isArray(handles) ? handles : [];
        const db = await this.#openDb();

        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            store.clear();
            list.forEach((handle, index) => {
                store.put({
                    id: `${Date.now()}-${index}`,
                    name: handle && handle.name ? handle.name : `handle-${index}`,
                    handle,
                    updatedAt: Date.now()
                });
            });
            tx.oncomplete = () => resolve(undefined);
            tx.onerror = () => reject(tx.error || new Error('Failed storing file handles'));
        });
    }

    async loadHandles() {
        const db = await this.#openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const request = tx.objectStore(STORE).getAll();
            request.onsuccess = () => {
                const records = Array.isArray(request.result) ? request.result : [];
                resolve(records.map((record) => record.handle).filter(Boolean));
            };
            request.onerror = () => reject(request.error || new Error('Failed loading file handles'));
        });
    }

    async #openDb() {
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Failed opening file handle DB'));
        });

        return this.dbPromise;
    }
}
