(function attachAudioQueueHelpers(/** @type {any} */ globalScope, /** @type {any} */ factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (globalScope && typeof globalScope === 'object') {
        globalScope.NexPlayAudioQueueHelpers = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createAudioQueueHelpers() {
    /** @type {(...args: any[]) => any} */
    function sanitizeText(value) {
        return String(value || '').trim();
    }

    /** @type {(...args: any[]) => any} */
    function sanitizeRepeatMode(value) {
        const mode = sanitizeText(value).toLowerCase();
        return ['none', 'all', 'one'].includes(mode) ? mode : 'none';
    }

    /** @type {(...args: any[]) => any} */
    function sanitizeSourceKind(value) {
        return sanitizeText(value).toLowerCase() === 'online' ? 'online' : 'local';
    }

    /** @type {(...args: any[]) => any} */
    function clampIndex(index, length, fallback = -1) {
        if (!Number.isFinite(index)) return fallback;
        if (length <= 0) return -1;
        const next = Math.trunc(index);
        if (next < 0) return fallback;
        if (next >= length) return length - 1;
        return next;
    }

    /** @type {(...args: any[]) => any} */
    function normalizeEntry(entry, index = 0) {
        if (!entry || typeof entry !== 'object') return null;
        const trackId = sanitizeText(entry.trackId || entry.id || '');
        const id = sanitizeText(entry.id || trackId || `audio_queue_entry_${index}`);
        if (!id || !trackId) return null;
        return {
            id,
            trackId,
            sourceKind: sanitizeSourceKind(entry.sourceKind || entry.source || ''),
            mediaType: 'audio',
            title: sanitizeText(entry.title || 'Untitled'),
            artist: sanitizeText(entry.artist || ''),
            cover: sanitizeText(entry.cover || ''),
            provider: sanitizeText(entry.provider || ''),
            videoId: sanitizeText(entry.videoId || ''),
            isSavedOnline: !!entry.isSavedOnline,
            trackSnapshot: entry.trackSnapshot && typeof entry.trackSnapshot === 'object'
                ? { ...entry.trackSnapshot }
                : null
        };
    }

    /** @type {(...args: any[]) => any} */
    function normalizeEntries(entries) {
        const seenIds = new Set();
        /** @type {any[]} */
        const list = [];
        (Array.isArray(entries) ? entries : []).forEach((/** @type {any} */ entry, /** @type {any} */ index) => {
            const normalized = normalizeEntry(entry, index);
            if (!normalized || seenIds.has(normalized.id)) return;
            seenIds.add(normalized.id);
            list.push(normalized);
        });
        return list;
    }

    /** @type {(...args: any[]) => any} */
    function moveIdInList(ids, id, targetIndex) {
        const next = (Array.isArray(ids) ? ids : []).filter((/** @type {any} */ item) => item !== id);
        const boundedTarget = Math.max(0, Math.min(Number(targetIndex) || 0, next.length));
        next.splice(boundedTarget, 0, id);
        return next;
    }

    /** @type {(...args: any[]) => any} */
    function buildShuffleOrder(entries, currentIndex = -1, randomFn = Math.random) {
        const normalizedEntries = normalizeEntries(entries);
        const ids = normalizedEntries.map((/** @type {any} */ entry) => entry.id);
        if (!ids.length) return [];
        const safeCurrentIndex = clampIndex(Number(currentIndex), normalizedEntries.length, -1);
        const currentId = safeCurrentIndex >= 0 ? normalizedEntries[safeCurrentIndex].id : '';
        const upcoming = ids.filter((/** @type {any} */ id) => id !== currentId);
        for (let index = upcoming.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.max(0, Math.min(index, Math.floor((Number(randomFn()) || 0) * (index + 1))));
            [upcoming[index], upcoming[swapIndex]] = [upcoming[swapIndex], upcoming[index]];
        }
        return currentId ? [currentId, ...upcoming] : upcoming;
    }

    /** @type {(...args: any[]) => any} */
    function normalizeShuffleOrder(entries, shuffleOrder) {
        const normalizedEntries = normalizeEntries(entries);
        const entryIds = normalizedEntries.map((/** @type {any} */ entry) => entry.id);
        const valid = new Set(entryIds);
        const seen = new Set();
        /** @type {any[]} */
        const normalizedOrder = [];
        (Array.isArray(shuffleOrder) ? shuffleOrder : []).forEach((/** @type {any} */ id) => {
            const cleanId = sanitizeText(id);
            if (!cleanId || seen.has(cleanId) || !valid.has(cleanId)) return;
            seen.add(cleanId);
            normalizedOrder.push(cleanId);
        });
        entryIds.forEach((/** @type {any} */ id) => {
            if (!seen.has(id)) normalizedOrder.push(id);
        });
        return normalizedOrder;
    }

    /** @type {(...args: any[]) => any} */
    function normalizeState(rawState) {
        const state = rawState && typeof rawState === 'object' ? rawState : {};
        const entries = normalizeEntries(state.entries);
        const currentIndex = clampIndex(Number(state.currentIndex), entries.length, -1);
        const isShuffle = !!state.isShuffle;
        return {
            entries,
            currentIndex,
            isShuffle,
            repeatMode: sanitizeRepeatMode(state.repeatMode),
            shuffleOrder: isShuffle
                ? ((Array.isArray(state.shuffleOrder) && state.shuffleOrder.length)
                    ? normalizeShuffleOrder(entries, state.shuffleOrder)
                    : buildShuffleOrder(entries, currentIndex))
                : []
        };
    }

    /** @type {(...args: any[]) => any} */
    function currentEntry(state) {
        const normalized = normalizeState(state);
        return normalized.currentIndex >= 0 ? normalized.entries[normalized.currentIndex] || null : null;
    }

    /** @type {(...args: any[]) => any} */
    function upcomingEntries(state) {
        const normalized = normalizeState(state);
        if (!normalized.entries.length) return [];
        if (!normalized.isShuffle) {
            const start = normalized.currentIndex >= 0 ? normalized.currentIndex + 1 : 0;
            return normalized.entries.slice(start);
        }
        const active = currentEntry(normalized);
        const order = normalizeShuffleOrder(normalized.entries, normalized.shuffleOrder);
        const orderStart = active ? Math.max(0, order.indexOf(active.id) + 1) : 0;
        const byId = new Map(normalized.entries.map((/** @type {any} */ entry) => [entry.id, entry]));
        return order.slice(orderStart).map((/** @type {any} */ id) => byId.get(id)).filter(Boolean);
    }

    /** @type {(...args: any[]) => any} */
    function removeDuplicatesForInsert(entries, entryId, trackId, currentEntryId) {
        return (Array.isArray(entries) ? entries : []).filter((/** @type {any} */ entry) => {
            if (!entry || typeof entry !== 'object') return false;
            if (currentEntryId && entry.id === currentEntryId) return true;
            if (entry.id === entryId) return false;
            if (trackId && entry.trackId === trackId) return false;
            return true;
        });
    }

    /** @type {(...args: any[]) => any} */
    function insertEntry(state, entry, placement = 'end') {
        const normalized = normalizeState(state);
        const nextEntry = normalizeEntry(entry, normalized.entries.length);
        if (!nextEntry) return normalized;
        const active = currentEntry(normalized);
        const filteredEntries = removeDuplicatesForInsert(
            normalized.entries,
            nextEntry.id,
            nextEntry.trackId,
            active?.id || ''
        );
        const nextCurrentIndex = active
            ? filteredEntries.findIndex((/** @type {any} */ item) => item.id === active.id)
            : -1;
        const targetIndex = placement === 'next'
            ? Math.max(0, Math.min(filteredEntries.length, nextCurrentIndex + 1))
            : filteredEntries.length;
        const entries = filteredEntries.slice();
        entries.splice(targetIndex, 0, nextEntry);
        const queueState = {
            ...normalized,
            entries,
            currentIndex: nextCurrentIndex
        };
        if (!queueState.isShuffle) return queueState;
        const currentId = active?.id || '';
        let order = normalizeShuffleOrder(entries, normalized.shuffleOrder);
        order = order.filter((/** @type {any} */ id) => id !== nextEntry.id);
        const anchorIndex = currentId ? order.indexOf(currentId) : -1;
        const orderTarget = placement === 'next'
            ? Math.max(0, Math.min(order.length, anchorIndex + 1))
            : order.length;
        order.splice(orderTarget, 0, nextEntry.id);
        return {
            ...queueState,
            shuffleOrder: order
        };
    }

    /** @type {(...args: any[]) => any} */
    function insertPlayNext(state, entry) {
        return insertEntry(state, entry, 'next');
    }

    /** @type {(...args: any[]) => any} */
    function insertToEnd(state, entry) {
        return insertEntry(state, entry, 'end');
    }

    /** @type {(...args: any[]) => any} */
    function removeEntry(state, entryId) {
        const normalized = normalizeState(state);
        const targetId = sanitizeText(entryId);
        if (!targetId) return normalized;
        const removeIndex = normalized.entries.findIndex((/** @type {any} */ entry) => entry.id === targetId);
        if (removeIndex === -1) return normalized;
        const entries = normalized.entries.filter((/** @type {any} */ entry) => entry.id !== targetId);
        let currentIndex = normalized.currentIndex;
        if (removeIndex < currentIndex) currentIndex -= 1;
        else if (removeIndex === currentIndex) currentIndex = Math.min(currentIndex, entries.length - 1);
        if (!entries.length) currentIndex = -1;
        const next = {
            ...normalized,
            entries,
            currentIndex
        };
        if (!normalized.isShuffle) return next;
        return {
            ...next,
            shuffleOrder: normalized.shuffleOrder.filter((/** @type {any} */ id) => id !== targetId)
        };
    }

    /** @type {(...args: any[]) => any} */
    function moveEntry(state, options = {}) {
        const normalized = normalizeState(state);
        const mode = sanitizeText(options.mode || 'ordered').toLowerCase() === 'shuffle' ? 'shuffle' : 'ordered';
        const fromIndex = Math.trunc(Number(options.fromIndex));
        const toIndex = Math.trunc(Number(options.toIndex));
        if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex) || fromIndex === toIndex) return normalized;

        if (mode === 'shuffle') {
            const order = normalizeShuffleOrder(normalized.entries, normalized.shuffleOrder);
            if (fromIndex < 0 || toIndex < 0 || fromIndex >= order.length || toIndex >= order.length) return normalized;
            const nextOrder = order.slice();
            const [entryId] = nextOrder.splice(fromIndex, 1);
            nextOrder.splice(toIndex, 0, entryId);
            return {
                ...normalized,
                shuffleOrder: nextOrder
            };
        }

        const baseIndex = normalized.currentIndex >= 0 ? normalized.currentIndex + 1 : 0;
        const sourceIndex = baseIndex + fromIndex;
        const targetIndex = baseIndex + toIndex;
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex >= normalized.entries.length || targetIndex >= normalized.entries.length) {
            return normalized;
        }
        const entries = normalized.entries.slice();
        const [entry] = entries.splice(sourceIndex, 1);
        entries.splice(targetIndex, 0, entry);
        const active = currentEntry(normalized);
        const currentIndex = active ? entries.findIndex((/** @type {any} */ item) => item.id === active.id) : -1;
        return {
            ...normalized,
            entries,
            currentIndex,
            shuffleOrder: normalized.isShuffle ? normalizeShuffleOrder(entries, normalized.shuffleOrder) : []
        };
    }

    /** @type {(...args: any[]) => any} */
    function advance(state, options = {}) {
        const normalized = normalizeState(state);
        const skipEntryIds = new Set((Array.isArray(options.skipEntryIds) ? options.skipEntryIds : [])
            .map((/** @type {any} */ id) => sanitizeText(id))
            .filter(Boolean));
        const active = currentEntry(normalized);
        if (!normalized.entries.length) {
            return { action: 'stop', state: normalized, entry: null };
        }
        if (normalized.repeatMode === 'one' && active && !skipEntryIds.has(active.id)) {
            return { action: 'restart', state: normalized, entry: active };
        }
        const byId = new Map(normalized.entries.map((/** @type {any} */ entry) => [entry.id, entry]));
        let orderIds;
        if (normalized.isShuffle) {
            const order = normalizeShuffleOrder(normalized.entries, normalized.shuffleOrder);
            const position = active ? order.indexOf(active.id) : -1;
            orderIds = position >= 0 ? order.slice(position + 1) : order.slice();
            if (normalized.repeatMode === 'all') {
                orderIds = orderIds.concat(position >= 0 ? order.slice(0, position + 1) : []);
            }
        } else {
            const start = normalized.currentIndex >= 0 ? normalized.currentIndex + 1 : 0;
            orderIds = normalized.entries.slice(start).map((/** @type {any} */ entry) => entry.id);
            if (normalized.repeatMode === 'all') {
                orderIds = orderIds.concat(normalized.entries.slice(0, Math.max(0, start)).map((/** @type {any} */ entry) => entry.id));
            }
        }
        for (const candidateId of orderIds) {
            if (!candidateId || skipEntryIds.has(candidateId)) continue;
            const entry = byId.get(candidateId) || null;
            if (!entry) continue;
            const nextIndex = normalized.entries.findIndex((/** @type {any} */ item) => item.id === candidateId);
            return {
                action: active && active.id === candidateId ? 'restart' : 'play',
                state: {
                    ...normalized,
                    currentIndex: nextIndex
                },
                entry
            };
        }
        return { action: 'stop', state: normalized, entry: null };
    }

    /** @type {(...args: any[]) => any} */
    function rewind(state, options = {}) {
        const normalized = normalizeState(state);
        const skipEntryIds = new Set((Array.isArray(options.skipEntryIds) ? options.skipEntryIds : [])
            .map((/** @type {any} */ id) => sanitizeText(id))
            .filter(Boolean));
        const active = currentEntry(normalized);
        if (!active) {
            return { action: 'stop', state: normalized, entry: null };
        }
        if (normalized.repeatMode === 'one' && !skipEntryIds.has(active.id)) {
            return { action: 'restart', state: normalized, entry: active };
        }
        const byId = new Map(normalized.entries.map((/** @type {any} */ entry) => [entry.id, entry]));
        let orderIds;
        if (normalized.isShuffle) {
            const order = normalizeShuffleOrder(normalized.entries, normalized.shuffleOrder);
            const position = order.indexOf(active.id);
            orderIds = position > 0 ? order.slice(0, position).reverse() : [];
            if (normalized.repeatMode === 'all') {
                orderIds = orderIds.concat(order.slice(position + 1).reverse());
            }
        } else {
            orderIds = normalized.currentIndex > 0
                ? normalized.entries.slice(0, normalized.currentIndex).map((/** @type {any} */ entry) => entry.id).reverse()
                : [];
            if (normalized.repeatMode === 'all') {
                orderIds = orderIds.concat(normalized.entries.slice(normalized.currentIndex + 1).map((/** @type {any} */ entry) => entry.id).reverse());
            }
        }
        for (const candidateId of orderIds) {
            if (!candidateId || skipEntryIds.has(candidateId)) continue;
            const entry = byId.get(candidateId) || null;
            if (!entry) continue;
            const nextIndex = normalized.entries.findIndex((/** @type {any} */ item) => item.id === candidateId);
            return {
                action: 'play',
                state: {
                    ...normalized,
                    currentIndex: nextIndex
                },
                entry
            };
        }
        return { action: 'restart', state: normalized, entry: active };
    }

    return {
        advance,
        buildShuffleOrder,
        currentEntry,
        insertPlayNext,
        insertToEnd,
        moveEntry,
        normalizeEntries,
        normalizeState,
        removeEntry,
        rewind,
        upcomingEntries
    };
}));
