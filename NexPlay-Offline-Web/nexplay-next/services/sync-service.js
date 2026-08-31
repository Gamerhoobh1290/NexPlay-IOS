export class SyncService {
    /** @type {(...args: any[]) => Promise<any>} */
    async pull() {
        throw new Error('SyncService.pull must be implemented');
    }

    /** @type {(...args: any[]) => Promise<any>} */
    async push(_changes) {
        throw new Error('SyncService.push must be implemented');
    }

    /** @type {(...args: any[]) => any} */
    resolveConflicts(_localRecords, _remoteRecords) {
        throw new Error('SyncService.resolveConflicts must be implemented');
    }

    /** @type {(...args: any[]) => any} */
    getStatus() {
        throw new Error('SyncService.getStatus must be implemented');
    }
}
