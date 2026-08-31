export class PluginRegistry {
    constructor() {
        /** @type {Map<string, any>} */
        this.plugins = new Map();
    }

    /**
     * @param {{ id: string, name?: string, setup?: (context: any) => (void|Promise<void>) }} plugin
     */
    register(plugin) {
        if (!plugin || !plugin.id) {
            throw new Error('Plugin must include an id');
        }

        const existing = this.plugins.get(plugin.id);
        const next = {
            id: plugin.id,
            name: plugin.name || plugin.id,
            setup: typeof plugin.setup === 'function' ? plugin.setup : null,
            enabled: existing ? existing.enabled : true,
            installedAt: existing ? existing.installedAt : Date.now()
        };

        this.plugins.set(plugin.id, next);
        return next;
    }

    /**
     * @param {string} id
     * @param {boolean} enabled
     */
    setEnabled(id, enabled) {
        const plugin = this.plugins.get(id);
        if (!plugin) return false;
        plugin.enabled = Boolean(enabled);
        return true;
    }

    /**
     * @param {any} context
     */
    async initialize(context) {
        for (const plugin of this.plugins.values()) {
            if (!plugin.enabled || !plugin.setup) continue;
            await plugin.setup(context);
        }
    }

    list() {
        return Array.from(this.plugins.values()).map((plugin) => ({
            id: plugin.id,
            name: plugin.name,
            enabled: plugin.enabled,
            installedAt: plugin.installedAt
        }));
    }
}
