/**
 * @typedef {{
 *  id: string,
 *  title: string,
 *  keywords?: string[],
 *  run: () => void | Promise<void>
 * }} CommandEntry
 */

const MACROS_STORAGE_KEY = 'nexplay_command_macros_v1';

export class CommandPalette {
    constructor() {
        /** @type {CommandEntry[]} */
        this.commands = [];
        this.isOpen = false;
        this.activeIndex = 0;
        this.filterText = '';

        /** @type {Map<string, string>} */
        this.keyBindings = new Map();
        this.activeScope = 'global';

        this.isRecordingMacro = false;
        /** @type {string[]} */
        this.currentMacro = [];
        this.macros = this.#loadMacros();

        this.root = document.createElement('div');
        this.root.id = 'nexplay-command-palette';
        this.root.className = 'fixed inset-0 z-[120] hidden items-start justify-center p-4 bg-black/70 backdrop-blur-sm';
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-modal', 'true');
        this.root.innerHTML = `
            <div class="w-full max-w-2xl mt-[12vh] rounded-2xl border border-white/10 bg-[#0b0f17] text-white shadow-2xl overflow-hidden">
                <div class="px-4 py-3 border-b border-white/10">
                    <input id="nexplay-command-input" aria-label="Command palette" placeholder="Type a command..." class="w-full bg-transparent outline-none text-sm placeholder:text-gray-500" />
                </div>
                <div id="nexplay-command-list" role="listbox" aria-label="Command results" class="max-h-[45vh] overflow-y-auto"></div>
                <div class="px-4 py-2 text-[11px] text-gray-400 border-t border-white/10">Enter: run  •  Esc: close  •  Arrow keys: navigate</div>
            </div>
        `;

        document.body.appendChild(this.root);

        this.input = /** @type {HTMLInputElement} */ (this.root.querySelector('#nexplay-command-input'));
        this.list = /** @type {HTMLElement} */ (this.root.querySelector('#nexplay-command-list'));

        this.root.addEventListener('click', (event) => {
            if (event.target === this.root) {
                this.close();
            }
        });

        this.input.addEventListener('input', () => {
            this.filterText = this.input.value.trim().toLowerCase();
            this.activeIndex = 0;
            this.render();
        });

        this.input.addEventListener('keydown', (event) => {
            const visible = this.#filteredCommands();
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.activeIndex = Math.min(visible.length - 1, this.activeIndex + 1);
                this.render();
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.activeIndex = Math.max(0, this.activeIndex - 1);
                this.render();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                const command = visible[this.activeIndex];
                if (command) {
                    this.#run(command, 'palette');
                }
            } else if (event.key === 'Escape') {
                event.preventDefault();
                this.close();
            }
        });

        window.addEventListener('keydown', (event) => {
            const target = /** @type {HTMLElement|null} */ (event.target);
            const inEditable = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                this.toggle();
                return;
            }
            if (event.key === 'Escape' && this.isOpen && !inEditable) {
                this.close();
                return;
            }

            if (!this.isOpen && !inEditable) {
                const key = this.#normalizeKeyboardEvent(event);
                const commandId = this.keyBindings.get(`${this.activeScope}:${key}`) || this.keyBindings.get(`global:${key}`);
                if (!commandId) return;
                const command = this.commands.find((entry) => entry.id === commandId);
                if (!command) return;
                event.preventDefault();
                this.#run(command, 'hotkey');
            }
        });
    }

    /**
     * @param {CommandEntry} command
     */
    register(command) {
        const index = this.commands.findIndex((item) => item.id === command.id);
        if (index === -1) this.commands.push(command);
        else this.commands[index] = command;
        this.render();
    }

    /**
     * @param {string} keyCombo
     * @param {string} commandId
     * @param {string=} scope
     */
    registerKeybinding(keyCombo, commandId, scope = 'global') {
        const normalized = this.#normalizeKeyCombo(keyCombo);
        this.keyBindings.set(`${scope}:${normalized}`, commandId);
    }

    /**
     * @param {string} scope
     */
    setScope(scope) {
        this.activeScope = scope || 'global';
    }

    startMacroRecording() {
        this.isRecordingMacro = true;
        this.currentMacro = [];
    }

    /**
     * @param {string=} name
     * @returns {string|null}
     */
    stopMacroRecording(name) {
        this.isRecordingMacro = false;
        if (!this.currentMacro.length) return null;

        const id = `macro-${Date.now()}`;
        this.macros[id] = {
            id,
            name: (name || `Macro ${Object.keys(this.macros).length + 1}`).trim(),
            commands: this.currentMacro.slice(),
            updatedAt: Date.now()
        };
        this.#saveMacros();
        this.currentMacro = [];
        return id;
    }

    listMacros() {
        return Object.values(this.macros).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }

    /**
     * @param {string} macroId
     */
    async playMacro(macroId) {
        const macro = this.macros[macroId];
        if (!macro || !Array.isArray(macro.commands)) return false;

        for (const commandId of macro.commands) {
            const command = this.commands.find((entry) => entry.id === commandId);
            if (!command) continue;
            await this.#run(command, 'macro-playback');
        }

        return true;
    }

    /**
     * @param {string} macroId
     */
    deleteMacro(macroId) {
        if (!this.macros[macroId]) return false;
        delete this.macros[macroId];
        this.#saveMacros();
        return true;
    }

    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    }

    open() {
        this.isOpen = true;
        this.activeIndex = 0;
        this.filterText = '';
        this.input.value = '';
        this.root.classList.remove('hidden');
        this.root.classList.add('flex');
        this.render();
        this.input.focus();
    }

    close() {
        this.isOpen = false;
        this.root.classList.add('hidden');
        this.root.classList.remove('flex');
    }

    render() {
        if (!this.isOpen) return;
        const visible = this.#filteredCommands();
        if (visible.length === 0) {
            this.list.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400">No matching commands.</div>';
            return;
        }

        this.list.innerHTML = visible.map((command, index) => {
            const active = index === this.activeIndex;
            return `<button role="option" aria-selected="${active ? 'true' : 'false'}" data-command-id="${escapeHtml(command.id)}" class="w-full text-left px-4 py-3 text-sm border-b border-white/5 ${active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'}">${escapeHtml(command.title)}</button>`;
        }).join('');

        this.list.querySelectorAll('button[data-command-id]').forEach((button) => {
            button.addEventListener('click', () => {
                const command = visible.find((item) => item.id === button.getAttribute('data-command-id'));
                if (command) this.#run(command, 'palette');
            });
        });
    }

    #filteredCommands() {
        if (!this.filterText) return this.commands.slice();
        return this.commands.filter((command) => {
            const haystack = [command.title, ...(command.keywords || [])].join(' ').toLowerCase();
            return haystack.includes(this.filterText);
        });
    }

    #normalizeKeyboardEvent(event) {
        const parts = [];
        if (event.ctrlKey) parts.push('ctrl');
        if (event.metaKey) parts.push('meta');
        if (event.altKey) parts.push('alt');
        if (event.shiftKey) parts.push('shift');
        parts.push(String(event.key || '').toLowerCase());
        return parts.join('+');
    }

    #normalizeKeyCombo(input) {
        return String(input || '')
            .split('+')
            .map((part) => part.trim().toLowerCase())
            .filter(Boolean)
            .join('+');
    }

    #loadMacros() {
        try {
            const raw = localStorage.getItem(MACROS_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    #saveMacros() {
        try {
            localStorage.setItem(MACROS_STORAGE_KEY, JSON.stringify(this.macros));
        } catch (_) {
            // best effort
        }
    }

    async #run(command, source = 'manual') {
        await command.run();
        if (this.isRecordingMacro && source !== 'macro-playback') {
            this.currentMacro.push(command.id);
        }
        this.close();
    }
}

function escapeHtml(text) {
    return String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
