export class StorageAdapter {
    /** @type {(...args: any[]) => Promise<any>} */
    async getState() {
        throw new Error('StorageAdapter.getState must be implemented');
    }

    /** @type {(...args: any[]) => Promise<any>} */
    async saveState(_partial) {
        throw new Error('StorageAdapter.saveState must be implemented');
    }

    /** @type {(...args: any[]) => Promise<any>} */
    async migrateFromLegacy() {
        throw new Error('StorageAdapter.migrateFromLegacy must be implemented');
    }

    /** @type {(...args: any[]) => Promise<any>} */
    async upsertTracks(_tracks) {
        throw new Error('StorageAdapter.upsertTracks must be implemented');
    }

    /** @type {(...args: any[]) => Promise<any>} */
    async upsertPlaylists(_playlists) {
        throw new Error('StorageAdapter.upsertPlaylists must be implemented');
    }

    /** @type {(...args: any[]) => Promise<any>} */
    async appendHistory(_historyItems) {
        throw new Error('StorageAdapter.appendHistory must be implemented');
    }

    /** @type {(...args: any[]) => any} */
    supportsFileSystemAccess() {
        return typeof window.showOpenFilePicker === 'function';
    }
}
