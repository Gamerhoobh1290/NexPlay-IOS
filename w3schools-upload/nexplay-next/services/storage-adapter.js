export class StorageAdapter {
    async getState() {
        throw new Error('StorageAdapter.getState must be implemented');
    }

    async saveState(_partial) {
        throw new Error('StorageAdapter.saveState must be implemented');
    }

    async migrateFromLegacy() {
        throw new Error('StorageAdapter.migrateFromLegacy must be implemented');
    }

    async upsertTracks(_tracks) {
        throw new Error('StorageAdapter.upsertTracks must be implemented');
    }

    async upsertPlaylists(_playlists) {
        throw new Error('StorageAdapter.upsertPlaylists must be implemented');
    }

    async appendHistory(_historyItems) {
        throw new Error('StorageAdapter.appendHistory must be implemented');
    }

    supportsFileSystemAccess() {
        return typeof window.showOpenFilePicker === 'function';
    }
}
