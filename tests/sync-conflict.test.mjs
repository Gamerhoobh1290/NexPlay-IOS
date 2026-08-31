import test from 'node:test';
import assert from 'node:assert/strict';

import { SupabaseSyncService } from '../nexplay-next/services/supabase-sync-service.js';

test('sync conflict resolution prefers latest updated_at', () => {
    const service = new SupabaseSyncService({});
    const resolved = service.resolveConflicts(
        [
            { entity: 'tracks_meta', entityId: 'a', updatedAt: 100, status: 'pending' },
            { entity: 'tracks_meta', entityId: 'b', updatedAt: 50, status: 'pending' }
        ],
        [
            { entity: 'tracks_meta', entityId: 'a', updatedAt: 101, status: 'synced' },
            { entity: 'tracks_meta', entityId: 'c', updatedAt: 10, status: 'synced' }
        ]
    );

    const byId = new Map(resolved.map((/** @type {any} */ item) => [item.entityId, item]));
    assert.equal(byId.get('a')?.updatedAt, 101);
    assert.equal(byId.get('b')?.updatedAt, 50);
    assert.equal(byId.get('c')?.updatedAt, 10);
});
