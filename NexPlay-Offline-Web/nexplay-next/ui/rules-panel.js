/** @import { AutomationRule } from '../core/types.js' */

const TRIGGERS = ['on_track_end', 'on_import_complete', 'on_app_start', 'scheduled_time'];
const ACTIONS = ['enqueue_filter', 'set_speed', 'toggle_mode', 'apply_tags', 'start_playlist'];

export class RulesPanel {
    /**
     * @param {{
     *  getRules: () => AutomationRule[],
     *  onSave: (rules: AutomationRule[]) => Promise<void>|void
     * }} options
     */
    constructor(options) {
        this.getRules = options.getRules;
        this.onSave = options.onSave;
        this.root = document.createElement('div');
        this.root.className = 'fixed inset-0 z-[115] hidden items-center justify-center p-4 bg-black/75 backdrop-blur-sm';
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-modal', 'true');
        this.root.innerHTML = `
            <div class="w-full max-w-3xl rounded-2xl bg-[#0b0f17] border border-white/10 text-white overflow-hidden">
                <div class="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <h2 class="text-sm font-bold uppercase tracking-wider">Automation Rules</h2>
                    <button data-close class="px-3 py-1 rounded bg-white/10 hover:bg-white/20">Close</button>
                </div>
                <div class="grid md:grid-cols-2 gap-0">
                    <div class="border-r border-white/10 p-4">
                        <div id="automation-rules-list" class="space-y-2 max-h-[55vh] overflow-y-auto"></div>
                    </div>
                    <div class="p-4 space-y-3">
                        <h3 class="text-xs uppercase text-gray-400 tracking-wider">Create Rule</h3>
                        <input id="automation-name" class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" placeholder="Rule name" />
                        <select id="automation-trigger" class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm"></select>
                        <select id="automation-action" class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm"></select>
                        <textarea id="automation-payload" class="w-full h-32 bg-black/40 border border-white/10 rounded px-3 py-2 text-xs font-mono" placeholder='{"speed":1.25}'></textarea>
                        <div class="flex gap-2">
                            <button id="automation-add" class="px-3 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-sm">Add Rule</button>
                            <button id="automation-save" class="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(this.root);

        this.listEl = /** @type {HTMLElement} */ (this.root.querySelector('#automation-rules-list'));
        this.nameInput = /** @type {HTMLInputElement} */ (this.root.querySelector('#automation-name'));
        this.triggerInput = /** @type {HTMLSelectElement} */ (this.root.querySelector('#automation-trigger'));
        this.actionInput = /** @type {HTMLSelectElement} */ (this.root.querySelector('#automation-action'));
        this.payloadInput = /** @type {HTMLTextAreaElement} */ (this.root.querySelector('#automation-payload'));

        this.triggerInput.innerHTML = TRIGGERS.map((/** @type {any} */ value) => `<option value="${value}">${value}</option>`).join('');
        this.actionInput.innerHTML = ACTIONS.map((/** @type {any} */ value) => `<option value="${value}">${value}</option>`).join('');

        this.root.querySelector('[data-close]')?.addEventListener('click', () => this.close());
        this.root.addEventListener('click', (/** @type {any} */ event) => {
            if (event.target === this.root) this.close();
        });
        this.root.querySelector('#automation-add')?.addEventListener('click', () => this.#addRule());
        this.root.querySelector('#automation-save')?.addEventListener('click', () => this.#save());

        /** @type {AutomationRule[]} */
        this.buffer = [];
    }

    /** @type {(...args: any[]) => any} */
    open() {
        this.buffer = this.getRules().map((/** @type {any} */ rule) => ({ ...rule, actions: (rule.actions || []).slice() }));
        this.render();
        this.root.classList.remove('hidden');
        this.root.classList.add('flex');
        this.nameInput.focus();
    }

    /** @type {(...args: any[]) => any} */
    close() {
        this.root.classList.add('hidden');
        this.root.classList.remove('flex');
    }

    /** @type {(...args: any[]) => any} */
    render() {
        if (!this.buffer.length) {
            this.listEl.innerHTML = '<div class="text-sm text-gray-400">No rules configured yet.</div>';
            return;
        }

        this.listEl.innerHTML = this.buffer.map((/** @type {any} */ rule) => `
            <div class="rounded border border-white/10 bg-white/5 p-3">
                <div class="flex items-center justify-between gap-2">
                    <div>
                        <div class="text-sm font-semibold">${escapeHtml(rule.name)}</div>
                        <div class="text-[11px] text-gray-400">${rule.trigger.type} -> ${(rule.actions || []).map((/** @type {any} */ action) => action.type).join(', ')}</div>
                    </div>
                    <label class="text-xs flex items-center gap-2">
                        <input data-toggle="${rule.id}" type="checkbox" ${rule.enabled ? 'checked' : ''} />
                        Enabled
                    </label>
                </div>
            </div>
        `).join('');

        this.listEl.querySelectorAll('input[data-toggle]').forEach((/** @type {any} */ input) => {
            input.addEventListener('change', () => {
                const id = input.getAttribute('data-toggle');
                const rule = this.buffer.find((/** @type {any} */ item) => item.id === id);
                if (rule) rule.enabled = /** @type {HTMLInputElement} */ (input).checked;
            });
        });
    }

    #addRule() {
        const name = this.nameInput.value.trim();
        if (!name) return;

        let payload = {};
        if (this.payloadInput.value.trim()) {
            try {
                payload = JSON.parse(this.payloadInput.value);
            } catch (_) {
                payload = {};
            }
        }

        /** @type {any} */
        const rule = {
            id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            enabled: true,
            priority: this.buffer.length + 1,
            trigger: {
                type: this.triggerInput.value,
                config: {}
            },
            actions: [{
                type: this.actionInput.value,
                payload
            }],
            updatedAt: Date.now()
        };

        this.buffer.push(rule);
        this.nameInput.value = '';
        this.payloadInput.value = '';
        this.render();
    }

    async #save() {
        await this.onSave(this.buffer.map((/** @type {any} */ rule, /** @type {any} */ index) => ({ ...rule, priority: index + 1, updatedAt: Date.now() })));
        this.close();
    }
}

/** @type {(...args: any[]) => any} */
function escapeHtml(text) {
    return String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
