export class SyncService {
    async pull() {
        throw new Error('SyncService.pull must be implemented');
    }

    async push(_changes) {
        throw new Error('SyncService.push must be implemented');
    }

    resolveConflicts(_localRecords, _remoteRecords) {
        throw new Error('SyncService.resolveConflicts must be implemented');
    }

    getStatus() {
        throw new Error('SyncService.getStatus must be implemented');
    }
}
