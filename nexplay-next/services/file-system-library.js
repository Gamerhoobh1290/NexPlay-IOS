const DB_NAME = 'nexplay_fs_handles';
const DB_VERSION = 1;
const STORE = 'handles';

export class FileSystemLibraryService {
    constructor() {
        this.dbPromise = null;
    }

    /** @type {(...args: any[]) => any} */
    isSupported() {
        return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
    }

    /** @type {(...args: any[]) => Promise<any>} */
    async pickFiles(options = {}) {
        if (!this.isSupported()) {
            return { supported: false, handles: [] };
        }

        const openPicker = window.showOpenFilePicker;
        if (typeof openPicker !== 'function') {
            return { supported: false, handles: [] };
        }

        const handles = await openPicker({
            multiple: options.multiple !== false,
            types: options.types || undefined,
            excludeAcceptAllOption: false
        });

        await this.saveHandles(handles);
        return { supported: true, handles };
    }

    /** @type {(...args: any[]) => Promise<any>} */
    async saveHandles(handles) {
        const list = Array.isArray(handles) ? handles : [];
        const db = await this.#openDb();

        await new Promise((/** @type {any} */ resolve, /** @type {any} */ reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            store.clear();
            list.forEach((/** @type {any} */ handle, /** @type {any} */ index) => {
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

    /** @type {(...args: any[]) => Promise<any>} */
    async loadHandles() {
        const db = await this.#openDb();
        return new Promise((/** @type {any} */ resolve, /** @type {any} */ reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const request = tx.objectStore(STORE).getAll();
            request.onsuccess = () => {
                const records = Array.isArray(request.result) ? request.result : [];
                resolve(records.map((/** @type {any} */ record) => record.handle).filter(Boolean));
            };
            request.onerror = () => reject(request.error || new Error('Failed loading file handles'));
        });
    }

    /** @type {(...args: any[]) => Promise<any>} */
    async #openDb() {
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((/** @type {any} */ resolve, /** @type {any} */ reject) => {
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
