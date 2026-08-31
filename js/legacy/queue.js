/* Legacy queue management, queue overlay, drag/drop ordering, and backup operations.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

// --- QUEUE MANAGEMENT ---
/**
 * Append a track to the play queue.  Called from the + button on a track.
 * Accepts either the track id or the click event and id; event propagation is
 * stopped to avoid triggering the loadTrack() handler on the parent.
 */
function addToQueue(e, id) {
    if (e && e.stopPropagation) e.stopPropagation();
    queueTrackToEnd(id);
}

/**
 * Move a queue item up by swapping with the previous element.
 */
function moveQueueItemUp(idx) {
    withQueueUpdateLock(() => {
        if (currentMediaType() === 'audio') {
            const helper = getAudioQueueHelper();
            const bucket = getUnifiedAudioQueueState();
            rememberQueueUndoState('audio');
            const nextState = typeof helper.moveEntry === 'function'
                ? helper.moveEntry(bucket, { fromIndex: idx, toIndex: idx - 1, mode: 'ordered' })
                : bucket;
            commitUnifiedAudioQueue({
                ...nextState,
                queueSource: bucket.queueSource || 'manual',
                failedEntryIds: Array.isArray(bucket.failedEntryIds) ? bucket.failedEntryIds.slice() : []
            });
            return true;
        }
        if (!state.queue || idx <= 0 || idx >= state.queue.length) return false;
        rememberQueueUndoState();
        const tmp = state.queue[idx - 1];
        state.queue[idx - 1] = state.queue[idx];
        state.queue[idx] = tmp;
        if (state.activeTab === 'queue') renderQueue();
        if (state.isQueueOverlayOpen) renderQueueOverlay();
        renderMiniQueuePeek();
        saveActiveQueueBucket();
        return true;
    }, false);
}

/**
 * Move a queue item down by swapping with the next element.
 */
function moveQueueItemDown(idx) {
    withQueueUpdateLock(() => {
        if (currentMediaType() === 'audio') {
            const helper = getAudioQueueHelper();
            const bucket = getUnifiedAudioQueueState();
            rememberQueueUndoState('audio');
            const nextState = typeof helper.moveEntry === 'function'
                ? helper.moveEntry(bucket, { fromIndex: idx, toIndex: idx + 1, mode: 'ordered' })
                : bucket;
            commitUnifiedAudioQueue({
                ...nextState,
                queueSource: bucket.queueSource || 'manual',
                failedEntryIds: Array.isArray(bucket.failedEntryIds) ? bucket.failedEntryIds.slice() : []
            });
            return true;
        }
        if (!state.queue || idx < 0 || idx >= state.queue.length - 1) return false;
        rememberQueueUndoState();
        const tmp = state.queue[idx + 1];
        state.queue[idx + 1] = state.queue[idx];
        state.queue[idx] = tmp;
        if (state.activeTab === 'queue') renderQueue();
        if (state.isQueueOverlayOpen) renderQueueOverlay();
        renderMiniQueuePeek();
        saveActiveQueueBucket();
        return true;
    }, false);
}

/**
 * Remove a queue item at the provided index.
 */
function removeQueueItem(idx) {
    withQueueUpdateLock(() => {
        if (currentMediaType() === 'audio') {
            const helper = getAudioQueueHelper();
            const bucket = getUnifiedAudioQueueState();
            const display = getUnifiedAudioQueueDisplayList();
            const entry = display.entries[idx] || null;
            if (!entry) return false;
            rememberQueueUndoState('audio');
            const nextState = typeof helper.removeEntry === 'function'
                ? helper.removeEntry(bucket, entry.id)
                : bucket;
            commitUnifiedAudioQueue({
                ...nextState,
                queueSource: nextState.entries?.length ? (bucket.queueSource || 'manual') : 'auto',
                failedEntryIds: Array.isArray(bucket.failedEntryIds) ? bucket.failedEntryIds.filter((entryId) => entryId !== entry.id) : []
            });
            return true;
        }
        if (!state.queue || idx < 0 || idx >= state.queue.length) return false;
        rememberQueueUndoState();
        state.queue.splice(idx, 1);
        if (state.queue.length === 0 && state.queueSource !== 'radio') state.queueSource = 'auto';
        if (state.activeTab === 'queue') renderQueue();
        if (state.isQueueOverlayOpen) {
            renderQueueOverlay();
        }
        renderMiniQueuePeek();
        saveActiveQueueBucket();
        return true;
    }, false);
}

function removeShuffleQueueItem(idx) {
    withQueueUpdateLock(() => {
        if (currentMediaType() === 'audio') {
            const helper = getAudioQueueHelper();
            const bucket = getUnifiedAudioQueueState();
            const display = getUnifiedAudioQueueDisplayList();
            const entry = display.entries[idx] || null;
            if (!entry) return false;
            rememberQueueUndoState('audio');
            const nextState = typeof helper.removeEntry === 'function'
                ? helper.removeEntry(bucket, entry.id)
                : bucket;
            commitUnifiedAudioQueue({
                ...nextState,
                queueSource: nextState.entries?.length ? (bucket.queueSource || 'manual') : 'auto',
                failedEntryIds: Array.isArray(bucket.failedEntryIds) ? bucket.failedEntryIds.filter((entryId) => entryId !== entry.id) : []
            });
            return true;
        }
        if (!state.shuffleQueue || idx < 0 || idx >= state.shuffleQueue.length) return false;
        rememberQueueUndoState();
        const removed = state.shuffleQueue.splice(idx, 1)[0];
        if (state.shuffleIndex >= state.shuffleQueue.length) state.shuffleIndex = state.shuffleQueue.length - 1;
        if (removed === state.currentTrackId) {
            const next = nextFromShuffleQueue();
            if (next) loadTrack(next);
        }
        renderMiniQueuePeek();
        if (state.isQueueOverlayOpen) renderQueueOverlay();
        if (state.activeTab === 'queue') renderQueue();
        saveActiveQueueBucket();
        return true;
    }, false);
}

function moveShuffleItemUp(idx) {
    withQueueUpdateLock(() => {
        if (currentMediaType() === 'audio') {
            const helper = getAudioQueueHelper();
            const bucket = getUnifiedAudioQueueState();
            const currentEntry = getUnifiedAudioQueueCurrentEntry();
            const currentPos = currentEntry ? bucket.shuffleOrder.indexOf(currentEntry.id) : -1;
            const absoluteIndex = Math.max(0, currentPos + 1 + idx);
            rememberQueueUndoState('audio');
            const nextState = typeof helper.moveEntry === 'function'
                ? helper.moveEntry(bucket, { fromIndex: absoluteIndex, toIndex: absoluteIndex - 1, mode: 'shuffle' })
                : bucket;
            commitUnifiedAudioQueue({
                ...nextState,
                queueSource: bucket.queueSource || 'manual',
                failedEntryIds: Array.isArray(bucket.failedEntryIds) ? bucket.failedEntryIds.slice() : []
            });
            return true;
        }
        if (!state.shuffleQueue || idx <= 0 || idx >= state.shuffleQueue.length) return false;
        rememberQueueUndoState();
        const tmp = state.shuffleQueue[idx - 1];
        state.shuffleQueue[idx - 1] = state.shuffleQueue[idx];
        state.shuffleQueue[idx] = tmp;
        if (state.shuffleIndex === idx) state.shuffleIndex -= 1;
        else if (state.shuffleIndex === idx - 1) state.shuffleIndex += 1;
        renderMiniQueuePeek();
        if (state.isQueueOverlayOpen) renderQueueOverlay();
        if (state.activeTab === 'queue') renderQueue();
        saveActiveQueueBucket();
        return true;
    }, false);
}
function moveShuffleItemDown(idx) {
    withQueueUpdateLock(() => {
        if (currentMediaType() === 'audio') {
            const helper = getAudioQueueHelper();
            const bucket = getUnifiedAudioQueueState();
            const currentEntry = getUnifiedAudioQueueCurrentEntry();
            const currentPos = currentEntry ? bucket.shuffleOrder.indexOf(currentEntry.id) : -1;
            const absoluteIndex = Math.max(0, currentPos + 1 + idx);
            rememberQueueUndoState('audio');
            const nextState = typeof helper.moveEntry === 'function'
                ? helper.moveEntry(bucket, { fromIndex: absoluteIndex, toIndex: absoluteIndex + 1, mode: 'shuffle' })
                : bucket;
            commitUnifiedAudioQueue({
                ...nextState,
                queueSource: bucket.queueSource || 'manual',
                failedEntryIds: Array.isArray(bucket.failedEntryIds) ? bucket.failedEntryIds.slice() : []
            });
            return true;
        }
        if (!state.shuffleQueue || idx < 0 || idx >= state.shuffleQueue.length - 1) return false;
        rememberQueueUndoState();
        const tmp = state.shuffleQueue[idx + 1];
        state.shuffleQueue[idx + 1] = state.shuffleQueue[idx];
        state.shuffleQueue[idx] = tmp;
        if (state.shuffleIndex === idx) state.shuffleIndex += 1;
        else if (state.shuffleIndex === idx + 1) state.shuffleIndex -= 1;
        renderMiniQueuePeek();
        if (state.isQueueOverlayOpen) renderQueueOverlay();
        if (state.activeTab === 'queue') renderQueue();
        saveActiveQueueBucket();
        return true;
    }, false);
}

// Derived queue helpers
function manualQueueItems() {
    if (currentMediaType() === 'audio') {
        return getUnifiedAudioQueueDisplayList().list;
    }
    return (state.queue || []).map((id) => resolveQueueDisplayTrack(id)).filter(Boolean);
}
function shuffleUpcomingItems() {
    if (currentMediaType() === 'audio') {
        return { list: getUnifiedAudioQueueDisplayList().list, offset: 0 };
    }
    if (!state.isShuffle) return { list: [], offset: 0 };
    const q = state.shuffleQueue || [];
    if (q.length === 0) return { list: [], offset: 0 };
    let idx = typeof state.shuffleIndex === 'number' ? state.shuffleIndex : -1;
    if (idx < 0 || idx >= q.length) {
        const curIdx = q.indexOf(state.currentTrackId);
        idx = curIdx >= 0 ? curIdx : -1;
    }
    const start = Math.max(0, idx + 1);
    return {
        list: q.slice(start).map((id) => resolveQueueDisplayTrack(id)).filter(Boolean),
        offset: start
    };
}
function getQueueDisplayList() {
    if (currentMediaType() === 'audio') {
        const display = getUnifiedAudioQueueDisplayList();
        return { type: display.type, list: display.list, offset: 0 };
    }
    const manual = manualQueueItems();
    if (manual.length > 0) return { type: 'manual', list: manual, offset: 0 };
    const { list, offset } = shuffleUpcomingItems();
    if (list.length > 0) return { type: 'shuffle', list, offset };
    return { type: state.isShuffle ? 'shuffle' : 'manual', list: [], offset: 0 };
}

	        // Render a compact preview of the next few queued tracks in the mini player
function renderMiniQueuePeek() {
    ensureQueueForType(currentMediaType());
    const el = document.getElementById('mini-queue-peek');
    if (!el) return;
    el.classList.remove('hidden');
    const { type, list } = getQueueDisplayList();
    if (!list || list.length === 0) {
        el.textContent = type === 'shuffle' ? 'Shuffle queue empty' : 'Queue empty';
        return;
    }
    const t = list[0];
    el.textContent = `Next: ${formatPlayerTrackLine(t)}`;
	        }

	                function isInteractiveTarget(target) {
    return !!target?.closest?.('button, input, textarea, select, a, label, [role="button"], [data-action]');
}

function syncSelectedTrackUI(selectedSet = null, newlyAddedSet = null) {
    const container = els.tracksContainer;
    if (!container) return;
    const selected = selectedSet instanceof Set ? selectedSet : new Set(state.selectedTrackIds || []);
    const newlyAdded = newlyAddedSet instanceof Set ? newlyAddedSet : null;
    getTrackElements(container).forEach(el => {
        const id = el.dataset.trackId;
        const isSelected = selected.has(id);
        el.classList.toggle('track-selected', isSelected);
        el.classList.toggle('track-selected-new', !!(isSelected && newlyAdded && newlyAdded.has(id)));
        const cb = el.querySelector('input[data-select-checkbox="true"]');
        if (cb) cb.checked = isSelected;
        const btn = el.querySelector('button[data-select-button="true"]');
        if (btn) {
            btn.classList.toggle('accent-bg', isSelected);
            const checkIcon = btn.querySelector('.select-icon-check');
            const circleIcon = btn.querySelector('.select-icon-circle');
            if (checkIcon) checkIcon.classList.toggle('hidden', !isSelected);
            if (circleIcon) circleIcon.classList.toggle('hidden', isSelected);
        }
    });
}

function setSelectedTrackIds(ids, { syncDom = true } = {}) {
    const next = Array.from(new Set((ids || []).filter(Boolean)));
    state.selectedTrackIds = next;
    if (selectionController) {
        selectionController.syncFromState(next, { syncDom });
    } else if (syncDom) {
        syncSelectedTrackUI();
    }
    updateBulkBar();
}

function selectSingleTrack(id) {
    if (!id) return;
    setSelectedTrackIds([id]);
}

function getTrackElements(container = els.tracksContainer) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('[data-track-id][data-view]'));
}

function getVisibleTrackIds() {
    return getTrackElements().map(el => el.dataset.trackId).filter(Boolean);
}

function syncMultiSelectUI() {
    if (!state.multiSelectMode) {
        state.multiSelectLassoMode = false;
    }
    const container = els.tracksContainer;
    const toggle = els.multiSelectToggle;
    const panel = els.multiSelectPanel;
    const status = els.multiSelectStatus;
    const lassoToggle = els.multiSelectLassoToggle;
    const visibleTrackIds = getVisibleTrackIds();
    const hasTrackCards = visibleTrackIds.length > 0;
    if (!hasTrackCards && state.multiSelectLassoMode) {
        state.multiSelectLassoMode = false;
    }
    const isActive = !!state.multiSelectMode;
    const lassoActive = !!(isActive && state.multiSelectLassoMode && hasTrackCards);
    const selectedCount = Array.isArray(state.selectedTrackIds) ? state.selectedTrackIds.length : 0;

    if (toggle) {
        toggle.className = `px-4 py-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition ${
            isActive
                ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.18)]'
                : 'border-white/10 text-gray-300 hover:text-white hover:border-white/40'
        }`;
        toggle.textContent = isActive ? 'Done Selecting' : 'Multi-Select';
    }

    if (container) {
        container.classList.toggle('multi-select-active', isActive && hasTrackCards);
        container.classList.toggle('multi-select-lasso-ready', lassoActive);
    }

    if (panel) {
        panel.classList.toggle('hidden', !(isActive && hasTrackCards));
    }

    if (lassoToggle) {
        lassoToggle.className = `px-3 py-2 rounded-xl border text-[11px] font-bold uppercase tracking-[0.16em] transition ${
            lassoActive
                ? 'border-cyan-400/60 bg-cyan-400/14 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.14)]'
                : 'border-white/10 text-gray-300 hover:text-white hover:border-white/30'
        }`;
        lassoToggle.textContent = lassoActive ? 'Lasso On' : 'Lasso Off';
    }

    if (status) {
        const summary = selectedCount === 1 ? '1 track selected.' : `${selectedCount} tracks selected.`;
        status.textContent = lassoActive
            ? `${summary} Drag across the library to draw a box. Each new lasso adds to what you already selected.`
            : `${summary} Click tracks to add or remove them. Turn on Lasso when you want to draw a box.`;
    }
}

function createSelectionController({ container, getMode, getLassoEnabled, getVisibleIds, onCommit, onPlayRequest }) {
    const DRAG_THRESHOLD = 12;
    const EDGE_SCROLL_THRESHOLD = 48;
    const MAX_EDGE_SCROLL_STEP = 30;

    const selectionState = {
        selectedIds: new Set(),
        baseSelected: new Set(),
        initialSelected: [],
        anchorId: null,
        phase: "idle",
        dragRect: null,
        pointerId: null,
        startClientX: 0,
        startClientY: 0,
        lastClientX: 0,
        lastClientY: 0,
        startLocalX: 0,
        startLocalY: 0,
        lastLocalX: 0,
        lastLocalY: 0,
        scrollTopAtSnapshot: 0,
        snapshot: [],
        entryById: new Map(),
        tops: [],
        maxHeight: 1,
        rafId: 0,
        autoScrollRaf: 0,
        suppressClick: false,
        rectEl: null,
        bound: false
    };

    const listeners = [];

    function addListener(target, type, handler, opts) {
        target.addEventListener(type, handler, opts);
        listeners.push(() => target.removeEventListener(type, handler, opts));
    }

    function getOrCreateSelectionRect() {
        let el = document.getElementById('selection-rect');
        if (el) return el;
        el = document.createElement('div');
        el.id = "selection-rect";
        el.className = "selection-rect hidden";
        document.body.appendChild(el);
        return el;
    }

    function toLocalPoint(clientX, clientY) {
        const bounds = container.getBoundingClientRect();
        return { x: clientX - bounds.left, y: clientY - bounds.top };
    }

    function rectFromPoints(x1, y1, x2, y2) {
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const right = Math.max(x1, x2);
        const bottom = Math.max(y1, y2);
        return { left, top, right, bottom, width: right - left, height: bottom - top };
    }

    function rectsIntersect(a, b) {
        return !(b.left > a.right || b.right < a.left || b.top > a.bottom || b.bottom < a.top);
    }

    function lowerBound(arr, value) {
        let lo = 0;
        let hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] < value) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    function setSelectingClass(active) {
        container.classList.toggle('tracks-drag-selecting', active);
        container.classList.toggle('is-selecting', active);
        document.body.classList.toggle('is-selecting', active);
    }

    function updateRowSelection(entry, isSelected, isNew = false) {
        if (!entry || !entry.el) return;
        entry.el.classList.toggle('track-selected', isSelected);
        entry.el.classList.toggle('track-selected-new', !!(isSelected && isNew));
        // During drag we only paint row highlights; control-icon updates are deferred to commit.
        if (selectionState.phase === "dragging") return;
        if (entry.checkbox) entry.checkbox.checked = isSelected;
        if (entry.selectButton) {
            entry.selectButton.classList.toggle('accent-bg', isSelected);
            if (entry.checkIcon) entry.checkIcon.classList.toggle('hidden', !isSelected);
            if (entry.circleIcon) entry.circleIcon.classList.toggle('hidden', isSelected);
        }
    }

    function renderRect() {
        if (!selectionState.rectEl || !selectionState.dragRect) return;
        const rect = rectFromPoints(selectionState.startClientX, selectionState.startClientY, selectionState.lastClientX, selectionState.lastClientY);
        selectionState.rectEl.style.left = `${rect.left}px`;
        selectionState.rectEl.style.top = `${rect.top}px`;
        selectionState.rectEl.style.width = `${Math.max(0, rect.width)}px`;
        selectionState.rectEl.style.height = `${Math.max(0, rect.height)}px`;
        selectionState.rectEl.classList.remove('hidden');
    }

    function clearRect() {
        if (!selectionState.rectEl) return;
        selectionState.rectEl.classList.add('hidden');
    }

    function buildSnapshot() {
        const bounds = container.getBoundingClientRect();
        const list = [];
        const entryById = new Map();
        let maxHeight = 1;
        getTrackElements(container).forEach((el, index) => {
            const id = el.dataset.trackId;
            if (!id) return;
            const r = el.getBoundingClientRect();
            const entry = {
                id,
                domIndex: index,
                el,
                left: r.left - bounds.left,
                top: r.top - bounds.top,
                right: r.right - bounds.left,
                bottom: r.bottom - bounds.top,
                checkbox: el.querySelector('input[data-select-checkbox="true"]'),
                selectButton: el.querySelector('button[data-select-button="true"]'),
                checkIcon: el.querySelector('.select-icon-check'),
                circleIcon: el.querySelector('.select-icon-circle')
            };
            maxHeight = Math.max(maxHeight, entry.bottom - entry.top);
            list.push(entry);
            entryById.set(id, entry);
        });
        list.sort((a, b) => a.top - b.top);
        selectionState.snapshot = list;
        selectionState.entryById = entryById;
        selectionState.tops = list.map(item => item.top);
        selectionState.maxHeight = maxHeight;
        selectionState.scrollTopAtSnapshot = container.scrollTop;
    }

    function shiftSnapshotForScroll() {
        const delta = container.scrollTop - selectionState.scrollTopAtSnapshot;
        if (!delta) return;
        selectionState.snapshot.forEach(item => {
            item.top -= delta;
            item.bottom -= delta;
        });
        selectionState.tops = selectionState.snapshot.map(item => item.top);
        selectionState.scrollTopAtSnapshot = container.scrollTop;
    }

    function computeIntersectedIds(localRect) {
        const result = new Set();
        if (!selectionState.snapshot.length) return result;
        const startIdx = lowerBound(selectionState.tops, localRect.top - selectionState.maxHeight);
        for (let i = startIdx; i < selectionState.snapshot.length; i++) {
            const item = selectionState.snapshot[i];
            if (item.top > localRect.bottom) break;
            if (item.right < localRect.left) continue;
            if (item.left > localRect.right) continue;
            if (item.bottom < localRect.top) continue;
            if (!rectsIntersect(localRect, item)) continue;
            result.add(item.id);
        }
        return result;
    }

    function applyPreviewSelection(nextIds) {
        const prev = selectionState.selectedIds;
        let changed = false;
        prev.forEach(id => {
            if (nextIds.has(id)) return;
            changed = true;
            const entry = selectionState.entryById.get(id);
            if (entry) updateRowSelection(entry, false, false);
        });
        nextIds.forEach(id => {
            const entry = selectionState.entryById.get(id);
            if (!entry) return;
            if (!prev.has(id)) changed = true;
            updateRowSelection(entry, true, !prev.has(id));
        });
        selectionState.selectedIds = new Set(nextIds);
        return changed;
    }

    function getIdsInDomOrder(idSet) {
        const ordered = [];
        getTrackElements(container).forEach(el => {
            const id = el.dataset.trackId;
            if (id && idSet.has(id)) ordered.push(id);
        });
        return ordered;
    }

    function updateDragPreview() {
        if (selectionState.phase !== "dragging") return;
        selectionState.rafId = 0;
        shiftSnapshotForScroll();
        const localRect = rectFromPoints(selectionState.startLocalX, selectionState.startLocalY, selectionState.lastLocalX, selectionState.lastLocalY);
        selectionState.dragRect = localRect;
        renderRect();
        const hits = computeIntersectedIds(localRect);
        const nextIds = new Set(selectionState.baseSelected);
        hits.forEach(id => nextIds.add(id));
        const changed = applyPreviewSelection(nextIds);
        if (changed) {
            state.selectedTrackIds = Array.from(nextIds);
            updateBulkBar();
        }
    }

    function schedulePreviewUpdate() {
        if (selectionState.rafId) return;
        selectionState.rafId = requestAnimationFrame(updateDragPreview);
    }

    function runAutoScroll() {
        if (selectionState.phase !== "dragging") {
            selectionState.autoScrollRaf = 0;
            return;
        }
        const bounds = container.getBoundingClientRect();
        let delta = 0;
        if (selectionState.lastClientY < bounds.top + EDGE_SCROLL_THRESHOLD) {
            const force = bounds.top + EDGE_SCROLL_THRESHOLD - selectionState.lastClientY;
            delta = -Math.min(MAX_EDGE_SCROLL_STEP, Math.max(2, Math.floor(force / 2)));
        } else if (selectionState.lastClientY > bounds.bottom - EDGE_SCROLL_THRESHOLD) {
            const force = selectionState.lastClientY - (bounds.bottom - EDGE_SCROLL_THRESHOLD);
            delta = Math.min(MAX_EDGE_SCROLL_STEP, Math.max(2, Math.floor(force / 2)));
        }
        if (delta !== 0) {
            const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
            const previous = container.scrollTop;
            container.scrollTop = Math.max(0, Math.min(maxScroll, previous + delta));
            if (container.scrollTop !== previous) schedulePreviewUpdate();
        }
        selectionState.autoScrollRaf = requestAnimationFrame(runAutoScroll);
    }

    function startAutoScroll() {
        if (selectionState.autoScrollRaf) return;
        selectionState.autoScrollRaf = requestAnimationFrame(runAutoScroll);
    }

    function stopAutoScroll() {
        if (!selectionState.autoScrollRaf) return;
        cancelAnimationFrame(selectionState.autoScrollRaf);
        selectionState.autoScrollRaf = 0;
    }

    function stopPreviewLoop() {
        if (!selectionState.rafId) return;
        cancelAnimationFrame(selectionState.rafId);
        selectionState.rafId = 0;
    }

    function resetInteraction() {
        selectionState.phase = "idle";
        selectionState.baseSelected = new Set();
        selectionState.initialSelected = [];
        selectionState.dragRect = null;
        selectionState.pointerId = null;
        selectionState.anchorId = null;
        selectionState.snapshot = [];
        selectionState.entryById = new Map();
        selectionState.tops = [];
        stopPreviewLoop();
        stopAutoScroll();
        setSelectingClass(false);
        clearRect();
    }

    function beginDragging() {
        selectionState.phase = "dragging";
        selectionState.selectedIds = new Set(selectionState.baseSelected);
        buildSnapshot();
        syncSelectedTrackUI(new Set(selectionState.baseSelected));
        setSelectingClass(true);
        startAutoScroll();
        schedulePreviewUpdate();
    }

    function finishInteraction({ commit }) {
        const wasDragging = selectionState.phase === "dragging";
        const pointerId = selectionState.pointerId;
        if (wasDragging) updateDragPreview();
        if (pointerId != null) {
            try { container.releasePointerCapture(pointerId); } catch (_) {}
        }
        if (wasDragging) {
            if (commit) {
                const visibleIds = new Set(typeof getVisibleIds === "function" ? getVisibleIds() : []);
                const commitIds = new Set();
                if (visibleIds.size) {
                    selectionState.selectedIds.forEach(id => { if (visibleIds.has(id)) commitIds.add(id); });
                } else {
                    selectionState.selectedIds.forEach(id => commitIds.add(id));
                }
                onCommit(getIdsInDomOrder(commitIds));
                selectionState.suppressClick = true;
            } else {
                state.selectedTrackIds = selectionState.initialSelected.slice();
                syncFromState(state.selectedTrackIds || []);
                updateBulkBar();
            }
        }
        resetInteraction();
    }

    function onPointerDown(e) {
        if (e.button !== 0) return;
        if (!getMode()) return;
        if (typeof getLassoEnabled === "function" && !getLassoEnabled()) return;
        if (isInteractiveTarget(e.target) || e.target.closest('.track-actions')) return;
        if (!container.contains(e.target)) return;
        e.preventDefault();
        const local = toLocalPoint(e.clientX, e.clientY);
        selectionState.phase = "armed";
        selectionState.initialSelected = (state.selectedTrackIds || []).slice();
        selectionState.baseSelected = new Set(state.selectedTrackIds || []);
        selectionState.pointerId = e.pointerId;
        selectionState.anchorId = e.target.closest('[data-track-id]')?.dataset?.trackId || null;
        selectionState.startClientX = e.clientX;
        selectionState.startClientY = e.clientY;
        selectionState.lastClientX = e.clientX;
        selectionState.lastClientY = e.clientY;
        selectionState.startLocalX = local.x;
        selectionState.startLocalY = local.y;
        selectionState.lastLocalX = local.x;
        selectionState.lastLocalY = local.y;
        try { container.setPointerCapture(e.pointerId); } catch (_) {}
    }

    function onPointerMove(e) {
        if (selectionState.phase === "idle") return;
        if (selectionState.pointerId != null && e.pointerId !== selectionState.pointerId) return;
        const local = toLocalPoint(e.clientX, e.clientY);
        selectionState.lastClientX = e.clientX;
        selectionState.lastClientY = e.clientY;
        selectionState.lastLocalX = local.x;
        selectionState.lastLocalY = local.y;
        if (selectionState.phase === "armed") {
            const dx = Math.abs(selectionState.lastClientX - selectionState.startClientX);
            const dy = Math.abs(selectionState.lastClientY - selectionState.startClientY);
            if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) beginDragging();
        }
        if (selectionState.phase !== "dragging") return;
        e.preventDefault();
        schedulePreviewUpdate();
    }

    function onPointerUp(e) {
        if (selectionState.phase === "idle") return;
        if (selectionState.pointerId != null && e.pointerId !== selectionState.pointerId) return;
        finishInteraction({ commit: true });
    }

    function onPointerCancel(e) {
        if (selectionState.phase === "idle") return;
        if (selectionState.pointerId != null && e.pointerId !== selectionState.pointerId) return;
        finishInteraction({ commit: false });
    }

    function onBlur() {
        if (selectionState.phase === "idle") return;
        finishInteraction({ commit: false });
    }

    function bind() {
        if (selectionState.bound) return;
        selectionState.rectEl = getOrCreateSelectionRect();
        clearRect();
        addListener(container, "pointerdown", onPointerDown);
        addListener(window, "pointermove", onPointerMove, { passive: false });
        addListener(window, "pointerup", onPointerUp);
        addListener(window, "pointercancel", onPointerCancel);
        addListener(window, "blur", onBlur);
        selectionState.bound = true;
    }

    function refreshGeometry() {
        if (selectionState.phase === "dragging") buildSnapshot();
    }

    function syncFromState(selectedIds, { syncDom = true } = {}) {
        selectionState.selectedIds = new Set((selectedIds || []).filter(Boolean));
        if (syncDom) syncSelectedTrackUI(selectionState.selectedIds);
    }

    function destroy() {
        listeners.splice(0).forEach(unsub => {
            try { unsub(); } catch (_) {}
        });
        resetInteraction();
        selectionState.bound = false;
    }

    function consumeSuppressedClick(event) {
        if (!selectionState.suppressClick) return false;
        selectionState.suppressClick = false;
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        return true;
    }

    function play(id, event = null) {
        if (!id || typeof onPlayRequest !== "function") return;
        onPlayRequest(id, event);
    }

    function cancel() {
        if (selectionState.phase === "idle") return;
        finishInteraction({ commit: false });
    }

    return {
        bind,
        refreshGeometry,
        syncFromState,
        destroy,
        consumeSuppressedClick,
        play,
        cancel,
        state: selectionState
    };
}

let trackSelectionHandlersBound = false;
let selectionController = null;

function runTrackAction(action, trackId, event = null) {
    if (!action || !trackId) return;
    switch (action) {
        case "play-track":
            loadTrack(trackId, true, event);
            break;
        case "play-next":
            queueTrackNext(trackId);
            break;
        case "toggle-select":
            toggleTrackSelection(event, trackId);
            break;
        case "toggle-favorite":
            toggleFavorite(event, trackId);
            break;
        case "add-queue":
            queueTrackToEnd(trackId);
            break;
        case "add-playlist":
            if (event && event.stopPropagation) event.stopPropagation();
            openPlaylistModal(trackId);
            break;
        case "edit-track":
            if (event && event.stopPropagation) event.stopPropagation();
            openEditModal(trackId);
            break;
        case "delete-track":
            confirmDeleteTrack(event, trackId);
            break;
        default:
            break;
    }
}
function openTrackContextPalette(trackId) {
    if (!trackId) return;
    const selectedIds = Array.from(new Set(state.selectedTrackIds || []));
    const useSelectionContext = selectedIds.length > 1 && selectedIds.includes(trackId);
    let contextSelectionIds = selectedIds;
    if (!useSelectionContext && (state.multiSelectMode || selectedIds.length > 0)) {
        const shouldRetargetSelection = selectedIds.length !== 1 || selectedIds[0] !== trackId;
        if (shouldRetargetSelection) {
            contextSelectionIds = [trackId];
            setSelectedTrackIds(contextSelectionIds);
        }
    }
    openCommandPalette({
        context: useSelectionContext
            ? { kind: 'selection', trackId, selectionIds: selectedIds }
            : { kind: 'track', trackId, selectionIds: contextSelectionIds }
    });
}
function openLibraryContextPalette() {
    const selectedIds = Array.from(new Set(state.selectedTrackIds || []));
    if (selectedIds.length > 1) {
        openCommandPalette({ context: { kind: 'selection', selectionIds: selectedIds } });
        return;
    }
    openCommandPalette({ context: { kind: 'library' } });
}

function setupTrackSelectionInteractions() {
    if (trackSelectionHandlersBound) return;
    const container = els.tracksContainer;
    if (!container) return;
    trackSelectionHandlersBound = true;

    selectionController = createSelectionController({
        container,
        getMode: () => !!state.multiSelectMode,
        getLassoEnabled: () => !!state.multiSelectLassoMode,
        getVisibleIds: () => getVisibleTrackIds(),
        onCommit: (ids) => setSelectedTrackIds(ids),
        onPlayRequest: (id, event) => loadTrack(id, true, event)
    });
    selectionController.bind();

    container.addEventListener("click", (e) => {
        if (selectionController && selectionController.consumeSuppressedClick(e)) return;

        const actionEl = e.target.closest('[data-action]');
        if (actionEl && container.contains(actionEl)) {
            const action = actionEl.dataset.action;
            const actionTrackId = actionEl.dataset.trackId || actionEl.closest('[data-track-id]')?.dataset?.trackId;
            if (action && actionTrackId) {
                e.preventDefault();
                e.stopPropagation();
                runTrackAction(action, actionTrackId, e);
            }
            return;
        }

        const trackEl = e.target.closest('[data-track-id]');
        if (!trackEl || !container.contains(trackEl)) return;
        const trackId = trackEl.dataset.trackId;
        if (!trackId) return;

        if (state.multiSelectMode) {
            if (e.detail > 1) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            toggleTrackSelection(e, trackId);
            return;
        }

        loadTrack(trackId, true, e);
    }, true);

    container.addEventListener("dblclick", (e) => {
        if (!state.multiSelectMode) return;
        if (isInteractiveTarget(e.target) || e.target.closest('.track-actions')) return;
        const trackEl = e.target.closest('[data-track-id]');
        if (!trackEl || !container.contains(trackEl)) return;
        const trackId = trackEl.dataset.trackId;
        if (!trackId) return;
        e.preventDefault();
        e.stopPropagation();
        if (selectionController) selectionController.consumeSuppressedClick(e);
        if (selectionController && selectionController.play) {
            selectionController.play(trackId, e);
        } else {
            loadTrack(trackId, true, e);
        }
    }, true);

    container.addEventListener("contextmenu", (e) => {
        const trackEl = e.target.closest('[data-track-id]');
        if (trackEl && container.contains(trackEl)) {
            const trackId = trackEl.dataset.trackId;
            if (!trackId) return;
            e.preventDefault();
            e.stopPropagation();
            openTrackContextPalette(trackId);
            return;
        }
        if (!container.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        openLibraryContextPalette();
    }, true);
}

function toggleMultiSelectMode(force = null) {
    const nextMode = typeof force === 'boolean' ? force : !state.multiSelectMode;
    if (!nextMode && selectionController && selectionController.cancel) {
        selectionController.cancel();
    }
    state.multiSelectMode = nextMode;
    if (!state.multiSelectMode) {
        state.multiSelectLassoMode = false;
        setSelectedTrackIds([]);
        return;
    }
    state.multiSelectLassoMode = false;
    updateBulkBar();
    if (selectionController) {
        selectionController.syncFromState(state.selectedTrackIds || [], { syncDom: false });
        selectionController.refreshGeometry();
    } else {
        syncSelectedTrackUI();
    }
}

function toggleMultiSelectLasso(force = null) {
    if (!state.multiSelectMode) return;
    const nextMode = typeof force === 'boolean' ? force : !state.multiSelectLassoMode;
    if (!nextMode && selectionController && selectionController.cancel) {
        selectionController.cancel();
    }
    state.multiSelectLassoMode = !!nextMode;
    syncMultiSelectUI();
}

function selectAllVisibleTracks() {
    if (!state.multiSelectMode) return;
    const ids = getVisibleTrackIds();
    if (!ids.length) {
        showToast('No tracks are visible right now.', 'info');
        return;
    }
    setSelectedTrackIds(ids);
}

function toggleTrackSelection(e, id) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!id) return;
    const next = new Set(state.selectedTrackIds || []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTrackIds(Array.from(next));
}

	        function updateBulkBar() {
	            const bar = document.getElementById('bulk-bar');
	            const count = document.getElementById('bulk-count');
	            if (!bar || !count) {
            syncMultiSelectUI();
            return;
        }
	            const n = state.selectedTrackIds.length;
        const hasTrackCards = getVisibleTrackIds().length > 0;
	            count.textContent = `${n} selected`;
	            const show = hasTrackCards && n > 0 && (state.multiSelectMode || n > 1);
	            bar.classList.toggle('hidden', !show);
        syncMultiSelectUI();
	        }

	        function clearSelection() {
	            setSelectedTrackIds([]);
	        }

function bulkAddToQueue() {
    if (!state.selectedTrackIds.length) { showToast('No tracks selected.', 'error'); return; }
    let addedCount = 0;
    let blockedCount = 0;
    state.selectedTrackIds.forEach((id) => {
        const added = queueTrackToEnd(id, { quiet: true });
        if (added) addedCount += 1;
        else blockedCount += 1;
    });
    if (addedCount > 0) {
        const suffix = blockedCount > 0 ? ` ${blockedCount} blocked by Queue Source.` : '';
        showToast(`Queued ${addedCount} track(s).${suffix}`, 'info');
    } else if (blockedCount > 0) {
        const sampleTrack = resolveQueueDisplayTrack(state.selectedTrackIds[0] || '');
        notifyQueueSourceBlocked(sampleTrack);
    }
    clearSelection();
}

function openPlaylistModalForSelection() {
    if (!state.selectedTrackIds.length) { showToast('No tracks selected.', 'error'); return; }
    state.pendingPlaylistTrackId = null;
    openPlaylistModal();
}

function bulkDelete() {
    if (!state.selectedTrackIds.length) { showToast('No tracks selected.', 'error'); return; }
    confirmDeleteTrack(null, [...state.selectedTrackIds]);
}

/**
 * Toggle the visibility of the floating queue overlay.  When opening the overlay,
 * the current queue is rendered into the panel.  A boolean flag tracks whether
 * the overlay is open to allow incremental updates when tracks are added or
 * removed.
 */
function toggleQueueOverlay(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const panel = document.getElementById('queue-overlay');
    if (!panel) return;
    state.isQueueOverlayOpen = !state.isQueueOverlayOpen;
    if (state.isQueueOverlayOpen) {
        closeTransientPanels({ queue: false, eq: true, menus: true });
        renderQueueOverlay();
        panel.classList.remove('hidden');
        panel.classList.add('flex');
    } else {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
    }
}

/**
 * Render the queue items into the floating overlay.  Builds rows with cover art,
 * track information, a drag handle and a remove button.  Each row is draggable to reorder the queue.
 */
function renderQueueOverlay() {
    ensureQueueForType(currentMediaType());
    const container = document.getElementById('queue-overlay-list');
    if (!container) return;
    refreshQueueSnapshotPicker();
    const { type, list, offset } = getQueueDisplayList();
    const meta = getQueueSurfaceMeta(type, list);
    if (!list || list.length === 0) {
        container.innerHTML = `${renderQueueHeader(meta)}<div class="text-center text-gray-400 py-6 text-sm">${type === 'shuffle' ? 'Shuffle queue is empty' : 'Queue is empty'}</div>`;
        return;
    }
    container.innerHTML = `${renderQueueHeader(meta)}<div id="queue-overlay-rows" class="mt-3 space-y-0"></div>`;
    const rowsContainer = document.getElementById('queue-overlay-rows');
    if (!rowsContainer) return;
    list.forEach((track, idx) => {
        const actualIdx = (offset || 0) + idx;
        const reason = getAutoplayRadioReason(track.id);
        const row = document.createElement('div');
        row.className = 'queue-item flex items-center gap-3 py-2 px-2 border-b border-white/10 last:border-b-0';
        row.innerHTML = `
            <img src="${track.cover || ''}" class="w-8 h-8 rounded-md object-cover ${track.cover ? '' : 'hidden'}">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 min-w-0">
                    <div class="text-sm font-medium text-white truncate">${track.title}</div>
                    ${renderQueueSourceBadge(track)}
                </div>
                <div class="text-xs text-gray-400 truncate">${track.artist || ''}${reason ? ` | ${escapeHtml(reason)}` : ''}</div>
            </div>
            ${type === 'manual' ? `<button onclick="event.stopPropagation();removeQueueItem(${idx})" class="text-gray-400 hover:text-red-500 transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>` : `<button onclick="event.stopPropagation();removeShuffleQueueItem(${actualIdx})" class="text-gray-400 hover:text-red-500 transition-colors" aria-label="Remove from shuffle queue"><i data-lucide="x" class="w-4 h-4"></i></button>`}
        `;
        if (type === 'manual' || type === 'shuffle') {
            row.setAttribute('draggable', 'true');
            row.dataset.index = actualIdx;
            row.dataset.queueType = type;
            row.addEventListener('dragstart', queueDragStart);
            row.addEventListener('dragover', queueDragOver);
            row.addEventListener('drop', queueDrop);
            row.addEventListener('dragend', () => { state.queueDragging = false; });
        }
        rowsContainer.appendChild(row);
    });
    refreshLucideIcons();
    applyFeatureVisibility();
}

function buildQueueSnapshot(name = '') {
    if (currentMediaType() === 'audio') {
        const bucket = getUnifiedAudioQueueState();
        return {
            id: generateId(),
            name: sanitizeText(name || `Snapshot ${new Date().toLocaleTimeString()}`),
            queue: (bucket.entries || []).map((entry) => ({ ...entry })),
            currentIndex: Number(bucket.currentIndex ?? -1),
            currentTrackId: state.currentTrackId || '',
            mediaType: 'audio',
            isShuffle: !!bucket.isShuffle,
            repeatMode: bucket.repeatMode || 'none',
            source: bucket.queueSource || 'auto',
            createdAt: Date.now()
        };
    }
    const queueRef = state.isShuffle ? (state.shuffleQueue || []) : (state.queue || []);
    const currentIndex = queueRef.indexOf(state.currentTrackId);
    return {
        id: generateId(),
        name: sanitizeText(name || `Snapshot ${new Date().toLocaleTimeString()}`),
        queue: [...queueRef],
        currentIndex,
        currentTrackId: state.currentTrackId || '',
        mediaType: currentMediaType(),
        isShuffle: !!state.isShuffle,
        repeatMode: state.repeatMode || 'none',
        source: state.queueSource || 'auto',
        createdAt: Date.now()
    };
}

function refreshQueueSnapshotPicker() {
    const picker = document.getElementById('queue-snapshot-picker');
    if (!picker) return;
    const snapshots = sanitizeQueueSnapshots(state.queueSnapshots);
    state.queueSnapshots = snapshots;
    const opts = ['<option value="">Load snapshot...</option>'].concat(
        snapshots.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} (${new Date(item.createdAt).toLocaleDateString()})</option>`)
    );
    picker.innerHTML = opts.join('');
}

async function saveQueueSnapshotPrompt() {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_queue_snapshots)) return;
    const name = await openTextPromptModal({
        title: 'Save queue snapshot',
        label: 'Snapshot name',
        placeholder: 'Snapshot name',
        confirmLabel: 'Save',
        allowEmpty: true
    });
    if (name === null) return;
    const snapshot = buildQueueSnapshot(name);
    state.queueSnapshots.unshift(snapshot);
    state.queueSnapshots = sanitizeQueueSnapshots(state.queueSnapshots);
    persistExtendedStores();
    refreshQueueSnapshotPicker();
    showToast('Queue snapshot saved.', 'info');
}

function applyQueueSnapshot(snapshot) {
    if (!snapshot) return;
    ensureQueueForType(snapshot.mediaType || 'audio');
    if ((snapshot.mediaType || 'audio') === 'audio') {
        const queueItems = Array.isArray(snapshot.queue) ? snapshot.queue : [];
        const hasEntryObjects = queueItems.some((item) => item && typeof item === 'object');
        if (hasEntryObjects) {
            const entries = queueItems
                .map((item) => item && typeof item === 'object'
                    ? {
                        ...item,
                        id: sanitizeText(item.id || generateId()) || generateId(),
                        trackId: sanitizeText(item.trackId || item.id || ''),
                        sourceKind: sanitizeText(item.sourceKind || item.source || '').toLowerCase() === 'online' ? 'online' : 'local',
                        mediaType: 'audio'
                    }
                    : null)
                .filter((item) => item && item.trackId);
            commitUnifiedAudioQueue({
                entries,
                currentIndex: Number.isFinite(snapshot.currentIndex) ? Number(snapshot.currentIndex) : entries.findIndex((entry) => entry.trackId === snapshot.currentTrackId),
                isShuffle: !!snapshot.isShuffle,
                repeatMode: ['none', 'all', 'one'].includes(snapshot.repeatMode) ? snapshot.repeatMode : 'none',
                shuffleOrder: !!snapshot.isShuffle ? entries.map((entry) => entry.id) : [],
                queueSource: snapshot.source || 'auto',
                failedEntryIds: []
            });
        } else {
            const legacyIds = queueItems.map((item) => sanitizeText(item || '')).filter(Boolean);
            const legacyOrder = snapshot.currentTrackId
                ? [snapshot.currentTrackId, ...legacyIds.filter((id) => id !== snapshot.currentTrackId)]
                : legacyIds.slice();
            const legacyTracks = legacyOrder.map((id) => resolveQueueDisplayTrack(id)).filter(Boolean);
            setUnifiedAudioQueueFromTrackList(legacyTracks, snapshot.currentTrackId || legacyTracks[0]?.id || '', {
                queueSource: snapshot.source || 'auto',
                isShuffle: !!snapshot.isShuffle,
                repeatMode: ['none', 'all', 'one'].includes(snapshot.repeatMode) ? snapshot.repeatMode : 'none',
                resetFailures: true
            });
        }
        let resumeTrackId = '';
        if (Number.isFinite(snapshot.currentIndex) && snapshot.currentIndex >= 0) {
            const bucket = getUnifiedAudioQueueState();
            resumeTrackId = bucket.entries[snapshot.currentIndex]?.trackId || '';
        }
        if (!resumeTrackId && typeof snapshot.currentTrackId === 'string' && snapshot.currentTrackId) {
            resumeTrackId = snapshot.currentTrackId;
        }
        if (resumeTrackId && resolveQueueDisplayTrack(resumeTrackId)) {
            playResolvedTrackFromQueue(resumeTrackId, { autoplay: true, allowCrossfade: false });
        }
        return;
    }
    const queueList = Array.isArray(snapshot.queue) ? snapshot.queue.filter(Boolean) : [];
    state.isShuffle = !!snapshot.isShuffle;
    state.repeatMode = ['none', 'all', 'one'].includes(snapshot.repeatMode) ? snapshot.repeatMode : 'none';
    state.queueSource = snapshot.source || 'auto';
    if (state.isShuffle) {
        state.shuffleQueue = [...queueList];
        const requestedIndex = Number(snapshot.currentIndex ?? 0);
        const safeIndex = Number.isFinite(requestedIndex) ? requestedIndex : 0;
        state.shuffleIndex = queueList.length
            ? Math.max(0, Math.min(queueList.length - 1, Math.floor(safeIndex)))
            : -1;
        state.queue = [];
    } else {
        state.queue = [...queueList];
        state.shuffleQueue = [];
        state.shuffleIndex = -1;
    }
    saveActiveQueueBucket();
    updateShuffleIcon();
    updateRepeatIcon();
    renderMiniQueuePeek();
    if (state.isQueueOverlayOpen) renderQueueOverlay();
    if (state.activeTab === 'queue') renderQueue();
    let resumeTrackId = '';
    if (Number.isFinite(snapshot.currentIndex) && snapshot.currentIndex >= 0 && queueList[snapshot.currentIndex]) {
        resumeTrackId = queueList[snapshot.currentIndex];
    } else if (typeof snapshot.currentTrackId === 'string' && snapshot.currentTrackId) {
        resumeTrackId = snapshot.currentTrackId;
    }
    if (resumeTrackId) {
        const id = resumeTrackId;
        if (state.tracks.find((t) => t.id === id)) loadTrack(id, true);
    }
}

function loadQueueSnapshotFromPicker(snapshotId) {
    if (!snapshotId) return;
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_queue_snapshots)) return;
    const snapshot = (state.queueSnapshots || []).find((item) => item.id === snapshotId);
    if (!snapshot) return;
    applyQueueSnapshot(snapshot);
    showToast(`Loaded snapshot "${snapshot.name}".`, 'info');
}

function deleteQueueSnapshotFromPicker() {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_queue_snapshots)) return;
    const picker = document.getElementById('queue-snapshot-picker');
    const id = picker?.value;
    if (!id) return;
    state.queueSnapshots = (state.queueSnapshots || []).filter((item) => item.id !== id);
    persistExtendedStores();
    refreshQueueSnapshotPicker();
    showToast('Snapshot deleted.', 'info');
}

function getCurrentBookmarks() {
    const trackId = state.currentTrackId;
    if (!trackId) return [];
    const entries = state.chapterBookmarks?.[trackId] || [];
    return entries.slice().sort((a, b) => a.time - b.time);
}

function renderCurrentBookmarkList() {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_chapter_bookmarks)) return '';
    const track = getCurrentTrack();
    if (!track) {
        return '<div class="text-xs text-gray-500">Play a track to use bookmarks.</div>';
    }
    const items = getCurrentBookmarks();
    if (!items.length) {
        return '<div class="text-xs text-gray-500">No bookmarks yet for this track.</div>';
    }
    return `<div class="space-y-2">${items.map((item) => `
        <div class="rounded-lg border border-white/10 bg-black/30 px-3 py-2 flex items-center gap-2">
            <button onclick="jumpToBookmark('${track.id}', '${item.id}')" class="text-xs text-cyan-300 hover:text-cyan-200">${formatTime(item.time)}</button>
            <span class="text-xs text-gray-300 truncate flex-1">${escapeHtml(item.label || 'Bookmark')}</span>
            <button onclick="renameBookmarkPrompt('${track.id}','${item.id}')" class="text-[10px] text-gray-400 hover:text-white">Edit</button>
            <button onclick="deleteBookmark('${track.id}','${item.id}')" class="text-[10px] text-red-300 hover:text-red-200">Del</button>
        </div>
    `).join('')}</div>`;
}

async function addCurrentBookmarkPrompt() {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_chapter_bookmarks)) return;
    const track = getCurrentTrack();
    if (!track) {
        showToast('No active track for bookmark.', 'info');
        return;
    }
    const time = Math.max(0, Number(els.audio.currentTime || 0));
    const label = await openTextPromptModal({
        title: 'Add bookmark',
        label: 'Bookmark label',
        placeholder: 'Optional label',
        confirmLabel: 'Add',
        allowEmpty: true
    });
    if (label === null) return;
    if (!state.chapterBookmarks[track.id]) state.chapterBookmarks[track.id] = [];
    state.chapterBookmarks[track.id].push({
        id: generateId(),
        time,
        label,
        updatedAt: Date.now()
    });
    state.chapterBookmarks = sanitizeChapterBookmarks(state.chapterBookmarks);
    persistExtendedStores();
    if (state.activeTab === 'settings') renderSettingsTab();
    showToast('Bookmark added.', 'info');
}

function findBookmark(trackId, bookmarkId) {
    const list = state.chapterBookmarks?.[trackId] || [];
    return list.find((item) => item.id === bookmarkId) || null;
}

function jumpToBookmark(trackId, bookmarkId) {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_chapter_bookmarks)) return;
    const bookmark = findBookmark(trackId, bookmarkId);
    if (!bookmark) return;
    const seekTo = () => {
        safeSeekMedia(els.audio, bookmark.time);
    };
    if (state.currentTrackId === trackId) {
        seekTo();
    } else {
        loadTrack(trackId, true);
        setTimeout(seekTo, 250);
    }
    showToast(`Jumped to ${formatTime(bookmark.time)}.`, 'info');
}

async function renameBookmarkPrompt(trackId, bookmarkId) {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_chapter_bookmarks)) return;
    const bookmark = findBookmark(trackId, bookmarkId);
    if (!bookmark) return;
    const next = await openTextPromptModal({
        title: 'Edit bookmark',
        label: 'Bookmark label',
        defaultValue: bookmark.label || '',
        confirmLabel: 'Save',
        allowEmpty: true
    });
    if (next === null) return;
    bookmark.label = next;
    bookmark.updatedAt = Date.now();
    state.chapterBookmarks = sanitizeChapterBookmarks(state.chapterBookmarks);
    persistExtendedStores();
    if (state.activeTab === 'settings') renderSettingsTab();
}

function deleteBookmark(trackId, bookmarkId) {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_chapter_bookmarks)) return;
    const list = state.chapterBookmarks?.[trackId];
    if (!Array.isArray(list)) return;
    state.chapterBookmarks[trackId] = list.filter((item) => item.id !== bookmarkId);
    if (state.chapterBookmarks[trackId].length === 0) delete state.chapterBookmarks[trackId];
    state.chapterBookmarks = sanitizeChapterBookmarks(state.chapterBookmarks);
    persistExtendedStores();
    if (state.activeTab === 'settings') renderSettingsTab();
}

async function captureMomentPrompt() {
    if (!isFeatureEnabled(FEATURE_REGISTRY.creative_moment_capture)) return;
    const track = getCurrentTrack();
    const note = await openTextPromptModal({
        title: 'Capture moment',
        label: 'Moment note',
        placeholder: 'Optional note',
        confirmLabel: 'Capture',
        allowEmpty: true
    });
    if (note === null) return;
    const context = sanitizeText(state.activeTab || 'library');
    let payload = null;
    if (track) {
        payload = {
            id: generateId(),
            kind: 'track',
            trackId: track.id,
            sourceUrl: '',
            mediaType: track.type === 'video' ? 'video' : 'audio',
            time: Math.max(0, Number(els.audio.currentTime || 0)),
            note,
            context,
            createdAt: Date.now()
        };
    } else if (state.currentUrlVideoSource) {
        payload = {
            id: generateId(),
            kind: 'online',
            trackId: '',
            sourceUrl: state.currentUrlVideoSource.canonicalUrl || state.currentUrlVideoSource.rawUrl || '',
            mediaType: 'video',
            time: 0,
            note,
            context,
            createdAt: Date.now()
        };
    }
    if (!payload) {
        showToast('No active media to capture.', 'info');
        return;
    }
    state.momentCaptures.unshift(payload);
    state.momentCaptures = sanitizeMomentCaptures(state.momentCaptures);
    persistExtendedStores();
    if (state.activeTab === 'settings') renderSettingsTab();
    showToast('Moment captured.', 'info');
}

function openMoment(momentId) {
    if (!isFeatureEnabled(FEATURE_REGISTRY.creative_moment_capture)) return;
    const moment = (state.momentCaptures || []).find((item) => item.id === momentId);
    if (!moment) return;
    if (moment.kind === 'track' && moment.trackId) {
        loadTrack(moment.trackId, true);
        setTimeout(() => {
            safeSeekMedia(els.audio, moment.time || 0);
        }, 250);
        showToast('Moment reopened.', 'info');
        return;
    }
    if (moment.kind === 'online' && moment.sourceUrl) {
        state.activeTab = 'online-videos';
        renderNav();
        renderTracks();
        const input = document.getElementById('video-url-input');
        if (input) input.value = moment.sourceUrl;
        loadPastedVideoUrl({ quiet: true });
        showToast('Online moment reopened.', 'info');
    }
}

function deleteMoment(momentId) {
    if (!isFeatureEnabled(FEATURE_REGISTRY.creative_moment_capture)) return;
    state.momentCaptures = (state.momentCaptures || []).filter((item) => item.id !== momentId);
    persistExtendedStores();
    if (state.activeTab === 'settings') renderSettingsTab();
}

function renderMomentList() {
    if (!isFeatureEnabled(FEATURE_REGISTRY.creative_moment_capture)) return '';
    if (!Array.isArray(state.momentCaptures) || state.momentCaptures.length === 0) {
        return '<div class="text-xs text-gray-500">No moments captured yet.</div>';
    }
    const rows = state.momentCaptures.slice(0, 10).map((item) => {
        const label = item.kind === 'track'
            ? (() => {
                const track = state.tracks.find((t) => t.id === item.trackId);
                return track ? `${track.title} @ ${formatTime(item.time || 0)}` : `Track moment @ ${formatTime(item.time || 0)}`;
            })()
            : `Online video moment`;
        const note = item.note ? ` - ${escapeHtml(item.note)}` : '';
        return `
            <div class="rounded-lg border border-white/10 bg-black/30 px-3 py-2 flex items-center gap-2">
                <button onclick="openMoment('${item.id}')" class="text-xs text-cyan-300 hover:text-cyan-200 truncate flex-1 text-left">${escapeHtml(label)}${note}</button>
                <button onclick="deleteMoment('${item.id}')" class="text-[10px] text-red-300 hover:text-red-200">Del</button>
            </div>
        `;
    }).join('');
    return `<div class="space-y-2">${rows}</div>`;
}

function buildBackupPayload() {
    return {
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        settings: {
            volume: state.volume,
            isDarkMode: state.isDarkMode,
            themeMode: getAppSettings().appearance.themeMode,
            sortType: state.sortType,
            sortDirection: state.sortDirection,
            playbackSpeed: state.playbackSpeed,
            accentColor: state.accentColor,
            visualizerStyle: state.visualizerStyle,
            crossfadeDuration: state.crossfadeDuration,
            autoAccentFromArt: state.autoAccentFromArt,
            notyPad: sanitizeNotyPadState(state.notyPad || createDefaultNotyPadState()),
            appSettings: sanitizeAppSettings(state.appSettings || createDefaultAppSettings())
        },
        featureToggles: sanitizeFeatureToggleMap(state.featureToggles),
        playlists: sanitizeStoredPlaylists(state.playlists || []),
        metadataStore: sanitizeStoredMetadata(state.metadataStore || {}),
        resumeStore: sanitizeResumeStore(state.resumeStore || createDefaultResumeStore()),
        playHistory: Array.isArray(state.playHistory) ? state.playHistory.slice(0, 500) : [],
        listeningHistory: state.listeningHistory || {},
        totalListeningTime: Math.max(0, Number(state.totalListeningTime) || 0),
        keyBindings: state.keyBindings || {},
        customLyricsCache: state.customLyricsCache || {},
        offlineLyricsCache: state.offlineLyricsCache || {},
        savedVideoLinks: sanitizeStoredVideoLinks(state.savedVideoLinks || []),
        linkCollections: sanitizeLinkCollections(state.linkCollections || createDefaultLinkCollections()),
        queueSnapshots: sanitizeQueueSnapshots(state.queueSnapshots || []),
        chapterBookmarks: sanitizeChapterBookmarks(state.chapterBookmarks || {}),
        momentCaptures: sanitizeMomentCaptures(state.momentCaptures || []),
        moodDialState: sanitizeMoodDialState(state.moodDialState || { value: 0 }),
        storyModeState: sanitizeStoryModeState(state.storyModeState || {}),
        scenePackState: sanitizeScenePackState(state.scenePackState || {}),
        coverWallState: sanitizeCoverWallState(state.coverWallState || {}),
        videoFilterStore: sanitizeVideoFilterStore(state.videoFilterStore || {})
    };
}

function exportBackup() {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_offline_export_import)) {
        showToast('Enable Offline Export/Import first.', 'info');
        return null;
    }
    const payload = buildBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    link.href = URL.createObjectURL(blob);
    link.download = `nexplay_backup_${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    showToast('Backup exported.', 'info');
    return payload;
}

function applyImportedBackup(payload, options = {}) {
    const mode = options.mode || 'replace';
    if (mode !== 'replace') throw new Error('Only replace mode is currently supported.');
    if (!payload || payload.schemaVersion !== BACKUP_SCHEMA_VERSION) {
        throw new Error('Unsupported backup schema version.');
    }
    const settings = payload.settings || {};
    const importedVolume = Number(settings.volume);
    if (Number.isFinite(importedVolume)) {
        state.volume = Math.max(0, Math.min(1, importedVolume));
    }
    state.isDarkMode = typeof settings.isDarkMode === 'boolean' ? settings.isDarkMode : state.isDarkMode;
    state.appSettings = sanitizeAppSettings(settings.appSettings || {
        appearance: { themeMode: settings.themeMode || (settings.isDarkMode === false ? 'light' : 'dark') }
    });
    state.sortType = settings.sortType || state.sortType;
    state.sortDirection = settings.sortDirection || state.sortDirection;
    const importedSpeed = Number(settings.playbackSpeed);
    if (Number.isFinite(importedSpeed) && importedSpeed > 0) {
        state.playbackSpeed = Math.max(0.25, Math.min(4, importedSpeed));
    }
    state.accentColor = settings.accentColor || state.accentColor;
    state.visualizerStyle = normalizeVisualizerStyle(settings.visualizerStyle || state.visualizerStyle);
    const importedCrossfade = Number(settings.crossfadeDuration ?? state.crossfadeDuration);
    state.crossfadeDuration = Number.isFinite(importedCrossfade) ? Math.max(0, importedCrossfade) : 0;
    state.crossfadeEnabled = state.crossfadeDuration > 0;
    state.autoAccentFromArt = !!settings.autoAccentFromArt;
    state.notyPad = sanitizeNotyPadState(settings.notyPad || createDefaultNotyPadState());
    state.featureToggles = sanitizeFeatureToggleMap(payload.featureToggles || {});
    state.playlists = sanitizeStoredPlaylists(payload.playlists || []);
    state.metadataStore = sanitizeStoredMetadata(payload.metadataStore || {});
    state.resumeStore = sanitizeResumeStore(payload.resumeStore || createDefaultResumeStore());
    state.playHistory = Array.isArray(payload.playHistory) ? payload.playHistory.filter(Boolean) : [];
    state.listeningHistory = payload.listeningHistory && typeof payload.listeningHistory === 'object' ? payload.listeningHistory : {};
    restoreTotalListeningTime(payload);
    state.keyBindings = sanitizeKeyBindings(payload.keyBindings || state.keyBindings);
    state.customLyricsCache = payload.customLyricsCache && typeof payload.customLyricsCache === 'object' ? payload.customLyricsCache : {};
    state.offlineLyricsCache = payload.offlineLyricsCache && typeof payload.offlineLyricsCache === 'object' ? payload.offlineLyricsCache : {};
    state.savedVideoLinks = sanitizeStoredVideoLinks(payload.savedVideoLinks || []);
    state.linkCollections = sanitizeLinkCollections(payload.linkCollections || createDefaultLinkCollections());
    state.activeLinkCollectionId = 'all';
    state.queueSnapshots = sanitizeQueueSnapshots(payload.queueSnapshots || []);
    state.chapterBookmarks = sanitizeChapterBookmarks(payload.chapterBookmarks || {});
    state.momentCaptures = sanitizeMomentCaptures(payload.momentCaptures || []);
    state.moodDialState = sanitizeMoodDialState(payload.moodDialState || { value: 0, updatedAt: 0 });
    state.storyModeState = sanitizeStoryModeState(payload.storyModeState || { lastGeneratedAt: 0, lastSummary: null });
    state.scenePackState = sanitizeScenePackState(payload.scenePackState || { activePack: DEFAULT_SCENE_PACK, visualBias: 1, updatedAt: 0 });
    state.coverWallState = sanitizeCoverWallState(payload.coverWallState || { lastUpdatedAt: 0, cachedTrackIds: [] });
    state.videoFilterStore = sanitizeVideoFilterStore(payload.videoFilterStore || {});
    applyAppSettings({ syncViewMode: true });
    persistVideoUrlLibrary();
    persistFeatureToggles();
    persistExtendedStores();
    // Imported listening totals and history must survive an immediate restart,
    // just like the other stores restored by this operation.
    persistAppStateNow();
    refreshFeatureRuntime({ rerender: false });
    setAccentColor(state.accentColor, { fromAuto: state.autoAccentFromArt });
    setSpeed(state.playbackSpeed);
    syncVisualizerMenu(state.visualizerStyle);
    els.audio.volume = state.volume;
    updateVolumeUI(state.volume);
    updateVideoVolumeUI(state.volume);
    const sortSel = document.getElementById('sort-select');
    if (sortSel) sortSel.value = `${state.sortType}-${state.sortDirection}`;
    syncCrossfadeUI();
    renderVideoUrlLibrary();
    renderVideoUrlPlayer(state.currentUrlVideoSource);
    renderMiniQueuePeek();
    renderTracks({ preserveScroll: false });
    renderNav();
}

function importBackup(input, options = {}) {
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_offline_export_import)) {
        throw new Error('Enable Offline Export/Import first.');
    }
    const payload = typeof input === 'string' ? safeJsonParse(input, null) : input;
    if (!payload || typeof payload !== 'object') throw new Error('Invalid backup payload.');
    applyImportedBackup(payload, { mode: options.mode || 'replace' });
    showToast('Backup imported.', 'info');
    return true;
}

async function importBackupFromFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        importBackup(text, { mode: 'replace' });
    } catch (err) {
        showToast(err?.message || 'Failed to import backup.', 'error');
    } finally {
        if (event?.target) event.target.value = '';
    }
}

/**
 * Display a transient toast notification at the bottom of the screen.  This
 * helper creates a small floating message which fades out after a few
 * seconds.  Use the optional `type` parameter to control the color of
 * the toast: 'error' will use a red background, while the default
 * uses the current accent color.  To add new messages simply call
 * showToast('Your message', 'info'|'error').
 * @param {string} msg The text to display in the toast.
 * @param {string} type Optional type: 'info' or 'error'.
 */
function showToast(msg, type = 'info', options = {}) {
    const container = document.getElementById('toast-container');
    if (!container) return {};
    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto px-4 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center gap-3';
    // Determine background color based on type; error is red, otherwise use accent
    const accent = state.accentColor || '#06b6d4';
    toast.style.backgroundColor = type === 'error' ? '#b91c1c' : accent;
    toast.style.color = '#ffffff';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    const textSpan = document.createElement('span');
    textSpan.className = 'flex-1';
    textSpan.textContent = msg;
    toast.appendChild(textSpan);
    if (options.action && options.action.label) {
        const btn = document.createElement('button');
        btn.textContent = options.action.label;
        btn.className = 'px-3 py-1 rounded bg-white/20 text-white text-xs hover:bg-white/30';
        btn.onclick = () => {
            if (typeof options.action.handler === 'function') options.action.handler();
            closeToast();
        };
        toast.appendChild(btn);
    }
    container.appendChild(toast);
    requestAnimationFrame(() => toast.style.opacity = '1');
    const duration = typeof options.duration === 'number' ? options.duration : 3000;
    let timeoutId = null;
    if (duration !== 0) {
        timeoutId = setTimeout(() => closeToast(), duration);
    }
    function closeToast(delay = 0, newText = null) {
        if (newText) textSpan.textContent = newText;
        if (timeoutId) clearTimeout(timeoutId);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentElement === container) container.removeChild(toast);
            }, 250);
        }, delay);
    }
    return { close: closeToast };
}
/**
 * Drag start handler for queue items.  Stores the dragged index in the dataTransfer object.
 */
function queueDragStart(e) {
    // Prevent drag events from bubbling to the window so they don't trigger the global file drop handler
    e.stopPropagation();
    const idx = e.currentTarget.dataset.index;
    const qType = e.currentTarget.dataset.queueType || 'manual';
    e.dataTransfer.setData('text/plain', idx);
    e.dataTransfer.setData('queue-type', qType);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.dropEffect = 'move';
    state.queueDragging = true;
}
/**
 * Allow dropping by preventing default behaviour.
 */
function queueDragOver(e) {
    e.preventDefault();
    // Stop propagation to avoid activating the global dragover handler
    e.stopPropagation();
}
/**
 * Drop handler to reorder the queue based on drag source and target indices.
 */
function queueDrop(e) {
    e.preventDefault();
    // Stop propagation to avoid firing the window drop handler
    e.stopPropagation();
    withQueueUpdateLock(() => {
        try {
            const from = parseInt(e.dataTransfer.getData('text/plain'));
            const qType = e.dataTransfer.getData('queue-type') || 'manual';
            const to = parseInt(e.currentTarget.dataset.index);
            if (isNaN(from) || isNaN(to) || from === to) return false;
            if (currentMediaType() === 'audio') {
                const helper = getAudioQueueHelper();
                const bucket = getUnifiedAudioQueueState();
                let fromIndex = from;
                let toIndex = to;
                if (qType === 'shuffle') {
                    const currentEntry = getUnifiedAudioQueueCurrentEntry();
                    const currentPos = currentEntry ? bucket.shuffleOrder.indexOf(currentEntry.id) : -1;
                    fromIndex = Math.max(0, currentPos + 1 + from);
                    toIndex = Math.max(0, currentPos + 1 + to);
                }
                rememberQueueUndoState('audio');
                const nextState = typeof helper.moveEntry === 'function'
                    ? helper.moveEntry(bucket, { fromIndex, toIndex, mode: qType === 'shuffle' ? 'shuffle' : 'ordered' })
                    : bucket;
                commitUnifiedAudioQueue({
                    ...nextState,
                    queueSource: bucket.queueSource || 'manual',
                    failedEntryIds: Array.isArray(bucket.failedEntryIds) ? bucket.failedEntryIds.slice() : []
                });
                return true;
            }
            if (qType === 'shuffle') {
                if (!state.shuffleQueue || from < 0 || to < 0 || from >= state.shuffleQueue.length || to >= state.shuffleQueue.length) return false;
                rememberQueueUndoState();
                const item = state.shuffleQueue.splice(from, 1)[0];
                state.shuffleQueue.splice(to, 0, item);
                if (state.shuffleIndex === from) state.shuffleIndex = to;
                else if (state.shuffleIndex > from && state.shuffleIndex <= to) state.shuffleIndex -= 1;
                else if (state.shuffleIndex < from && state.shuffleIndex >= to) state.shuffleIndex += 1;
                renderQueueOverlay();
                if (state.activeTab === 'queue') renderQueue();
                renderMiniQueuePeek();
            } else {
                rememberQueueUndoState();
                const item = state.queue.splice(from, 1)[0];
                state.queue.splice(to, 0, item);
                // Re-render overlay and queue tab if needed
                renderQueueOverlay();
                if (state.activeTab === 'queue') {
                    renderQueue();
                }
                renderMiniQueuePeek();
            }
            saveActiveQueueBucket();
            return true;
        } finally {
            state.queueDragging = false;
        }
    }, false);
}

