/** @import { AutomationRule, AutomationTrigger, AutomationAction } from '../core/types.js' */

export class AutomationEngine {
    constructor() {
        /** @type {AutomationRule[]} */
        this.rules = [];
        /** @type {Map<string, (payload:any) => Promise<void>|void>} */
        this.actionHandlers = new Map();
    }

    /**
     * @param {AutomationRule} rule
     */
    registerRule(rule) {
        const cleaned = {
            ...rule,
            enabled: rule.enabled !== false,
            priority: Number(rule.priority || 0),
            updatedAt: Date.now()
        };
        const index = this.rules.findIndex((/** @type {any} */ item) => item.id === cleaned.id);
        if (index === -1) this.rules.push(cleaned);
        else this.rules[index] = cleaned;
        this.rules.sort((/** @type {any} */ a, /** @type {any} */ b) => (a.priority || 0) - (b.priority || 0));
    }

    /**
     * @param {AutomationRule[]} rules
     */
    setRules(rules) {
        this.rules = [];
        (Array.isArray(rules) ? rules : []).forEach((/** @type {any} */ rule) => this.registerRule(rule));
    }

    /** @type {(...args: any[]) => any} */
    listRules() {
        return this.rules.slice();
    }

    /**
     * @param {AutomationAction['type']} actionType
     * @param {(payload:any) => Promise<void>|void} handler
     */
    registerActionHandler(actionType, handler) {
        this.actionHandlers.set(actionType, handler);
    }

    /**
     * @param {AutomationTrigger['type']} triggerType
     * @param {any=} payload
     */
    async evaluate(triggerType, payload = {}) {
        const candidates = this.rules
            .filter((/** @type {any} */ rule) => rule.enabled !== false)
            .filter((/** @type {any} */ rule) => rule.trigger && rule.trigger.type === triggerType)
            .sort((/** @type {any} */ a, /** @type {any} */ b) => (a.priority || 0) - (b.priority || 0));

        for (const rule of candidates) {
            for (const action of rule.actions || []) {
                await this.runAction(action);
            }
        }
    }

    /**
     * @param {AutomationAction} action
     */
    async runAction(action) {
        const handler = this.actionHandlers.get(action.type);
        if (!handler) return;
        await handler(action.payload || {});
    }
}

/**
 * @param {AutomationEngine} engine
 * @param {any} legacy
 */
export function registerDefaultAutomationHandlers(engine, legacy) {
    engine.registerActionHandler('set_speed', async (/** @type {any} */ payload) => {
        const speed = Number(payload.speed || 1);
        legacy.dispatchAction('set_speed', { speed });
    });

    engine.registerActionHandler('toggle_mode', async (/** @type {any} */ payload) => {
        const mode = payload.mode || 'windowed';
        legacy.dispatchAction('toggle_mode', { mode });
    });

    engine.registerActionHandler('start_playlist', async (/** @type {any} */ payload) => {
        const playlistId = payload.playlistId;
        if (!playlistId) return;
        if (typeof legacy.actions.openPlaylist === 'function') {
            legacy.actions.openPlaylist(playlistId);
        }
        const state = legacy.getState();
        const playlist = (state.playlists || []).find((/** @type {any} */ item) => item.id === playlistId);
        const firstTrack = playlist && Array.isArray(playlist.tracks) ? playlist.tracks[0] : null;
        if (firstTrack && typeof legacy.actions.loadTrack === 'function') {
            legacy.actions.loadTrack(firstTrack, true);
        }
    });

    engine.registerActionHandler('apply_tags', async (/** @type {any} */ payload) => {
        const tags = Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [];
        if (!tags.length) return;
        const state = legacy.getState();
        const currentTrackId = state.currentTrackId;
        const track = (state.tracks || []).find((/** @type {any} */ item) => item.id === currentTrackId);
        if (!track) return;
        const merged = Array.from(new Set([...(track.tags || []), ...tags]));
        track.tags = merged;
        if (typeof legacy.actions.renderTracks === 'function') {
            legacy.actions.renderTracks({ preserveScroll: true });
        }
    });

    engine.registerActionHandler('enqueue_filter', async (/** @type {any} */ payload) => {
        const state = legacy.getState();
        const query = String(payload.query || '').toLowerCase();
        if (!query) return;
        const matching = (state.tracks || []).filter((/** @type {any} */ track) => {
            const title = (track.title || '').toLowerCase();
            const artist = (track.artist || '').toLowerCase();
            return title.includes(query) || artist.includes(query);
        });
        matching.forEach((/** @type {any} */ track) => {
            if (typeof legacy.actions.addToQueue === 'function') {
                legacy.actions.addToQueue(null, track.id);
            }
        });
    });
}
