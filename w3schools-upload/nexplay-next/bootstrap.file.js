(function () {
    'use strict';

    var DEFAULT_FLAGS = Object.freeze({
        use_new_store: true,
        use_virtual_list: false,
        use_sync: false,
        use_command_palette: true,
        use_automation: true,
        use_plugins: false,
        use_observability: false,
        use_macro_recorder: true,
        use_smart_search: false,
        use_worker_enrichment: false,
        use_fs_library: false,
        use_pwa: false
    });
    var FLAG_STORAGE_KEY = 'nexplay_feature_flags';
    var RULES_STORAGE_KEY = 'nexplay_next_file_automation_rules_v1';
    var TRIGGERS = ['on_track_end', 'on_import_complete', 'on_app_start', 'scheduled_time'];
    var ACTIONS = ['enqueue_filter', 'set_speed', 'toggle_mode', 'apply_tags', 'start_playlist'];
    var DEV_TOOLS_UNLOCK_KEY = 'nexplay_next_ops_unlocked';
    var DEV_TOOLS_SECRET = 'nexplay::ops::6174';

    bootstrap().catch(function (error) {
        console.error('[NexPlayNext:file] bootstrap failed', error);
    });

    async function bootstrap() {
        var flags = resolveFeatureFlags();
        var legacy = await waitForLegacyApi();
        if (!legacy) {
            console.warn('[NexPlayNext:file] Legacy API was not found.');
            return;
        }

        var automationEngine = new AutomationEngine();
        registerDefaultAutomationHandlers(automationEngine, legacy);
        automationEngine.setRules(loadRules());

        if (flags.use_automation) {
            wireAutomationEvents(automationEngine);
            automationEngine.evaluate('on_app_start', { source: 'file_bootstrap' }).catch(function () {
                return;
            });
        }

        var rulesPanel = createRulesPanel({
            getRules: function () {
                return automationEngine.listRules();
            },
            saveRules: function (rules) {
                automationEngine.setRules(rules);
                saveRules(rules);
                notify('Automation rules saved.', 'success');
            }
        });

        var automation = {
            engine: automationEngine,
            openRulesPanel: function () {
                rulesPanel.open();
            },
            listRules: function () {
                return automationEngine.listRules();
            }
        };

        var commandPalette = flags.use_command_palette ? createCommandPalette(legacy, automation) : null;
        var actionRegistry = wireHeaderActions(commandPalette, automation);

        window.NexPlayNext = {
            mode: 'file-fallback',
            flags: flags,
            storage: {
                getAutomationRules: async function () { return loadRules(); },
                upsertAutomationRules: async function (rules) {
                    saveRules(rules);
                }
            },
            sync: {
                enabled: false,
                getStatus: function () { return { state: 'disabled', reason: 'file_mode' }; },
                syncNow: async function () {
                    notify('Cloud sync is disabled in file mode. Use http/https to enable sync.', 'info');
                    return { disabled: true };
                }
            },
            automation: automation,
            commandPalette: commandPalette,
            actionRegistry: actionRegistry
        };

        notify('NexPlay Next loaded in file mode.', 'info');
    }

    function wireAutomationEvents(engine) {
        window.addEventListener('nexplay:app-ready', function (event) {
            engine.evaluate('on_app_start', event.detail || {}).catch(function (error) {
                console.warn('[NexPlayNext:file] on_app_start failed', error);
            });
        });
        window.addEventListener('nexplay:track-ended', function (event) {
            engine.evaluate('on_track_end', event.detail || {}).catch(function (error) {
                console.warn('[NexPlayNext:file] on_track_end failed', error);
            });
        });
        window.addEventListener('nexplay:import-complete', function (event) {
            engine.evaluate('on_import_complete', event.detail || {}).catch(function (error) {
                console.warn('[NexPlayNext:file] on_import_complete failed', error);
            });
        });
        setInterval(function () {
            engine.evaluate('scheduled_time', { now: Date.now() }).catch(function (error) {
                console.warn('[NexPlayNext:file] scheduled_time failed', error);
            });
        }, 60000);
    }

    function resolveFeatureFlags() {
        var stored = {};
        try {
            var raw = localStorage.getItem(FLAG_STORAGE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') stored = parsed;
            }
        } catch (_) {
            stored = {};
        }

        var globalFlags = (window.NEXPLAY_FLAGS && typeof window.NEXPLAY_FLAGS === 'object') ? window.NEXPLAY_FLAGS : {};
        var merged = Object.assign({}, DEFAULT_FLAGS, stored, globalFlags);
        var normalized = {};
        Object.keys(merged).forEach(function (key) {
            normalized[key] = Boolean(merged[key]);
        });
        return normalized;
    }

    function loadRules() {
        try {
            var raw = localStorage.getItem(RULES_STORAGE_KEY);
            if (!raw) return [];
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function saveRules(rules) {
        var safeRules = Array.isArray(rules) ? rules : [];
        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(safeRules));
    }

    function waitForLegacyApi() {
        if (window.NexPlayLegacy) return Promise.resolve(window.NexPlayLegacy);
        return new Promise(function (resolve) {
            var settled = false;
            function done() {
                if (settled) return;
                settled = true;
                window.removeEventListener('nexplay:legacy-api-ready', onReady);
                resolve(window.NexPlayLegacy || null);
            }
            function onReady() {
                done();
            }
            window.addEventListener('nexplay:legacy-api-ready', onReady);
            setTimeout(done, 2500);
        });
    }

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            try {
                window.showToast(message, type || 'info');
                return;
            } catch (_) {}
        }
        console.info('[NexPlayNext:file] ' + message);
    }

    function normalizeRule(rule, priority) {
        var normalized = {
            id: (rule && rule.id) || ('rule-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
            name: (rule && rule.name) || 'Untitled Rule',
            enabled: rule && rule.enabled === false ? false : true,
            priority: Number(priority || (rule && rule.priority) || 1),
            trigger: {
                type: rule && rule.trigger && rule.trigger.type ? rule.trigger.type : 'on_track_end',
                config: rule && rule.trigger && rule.trigger.config ? rule.trigger.config : {}
            },
            actions: Array.isArray(rule && rule.actions) ? rule.actions : [],
            updatedAt: Date.now()
        };
        if (!normalized.actions.length) {
            normalized.actions = [{ type: 'set_speed', payload: { speed: 1 } }];
        }
        return normalized;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function AutomationEngine() {
        this.rules = [];
        this.actionHandlers = new Map();
    }

    AutomationEngine.prototype.registerRule = function (rule) {
        var cleaned = normalizeRule(rule, rule.priority);
        var index = this.rules.findIndex(function (item) { return item.id === cleaned.id; });
        if (index === -1) this.rules.push(cleaned);
        else this.rules[index] = cleaned;
        this.rules.sort(function (a, b) { return (a.priority || 0) - (b.priority || 0); });
    };

    AutomationEngine.prototype.setRules = function (rules) {
        var self = this;
        this.rules = [];
        (Array.isArray(rules) ? rules : []).forEach(function (rule, index) {
            self.registerRule(normalizeRule(rule, index + 1));
        });
    };

    AutomationEngine.prototype.listRules = function () {
        return this.rules.slice();
    };

    AutomationEngine.prototype.registerActionHandler = function (actionType, handler) {
        this.actionHandlers.set(actionType, handler);
    };

    AutomationEngine.prototype.evaluate = async function (triggerType, payload) {
        var candidates = this.rules
            .filter(function (rule) { return rule.enabled !== false; })
            .filter(function (rule) { return rule.trigger && rule.trigger.type === triggerType; })
            .sort(function (a, b) { return (a.priority || 0) - (b.priority || 0); });
        for (var i = 0; i < candidates.length; i += 1) {
            var actions = Array.isArray(candidates[i].actions) ? candidates[i].actions : [];
            for (var j = 0; j < actions.length; j += 1) {
                await this.runAction(actions[j], payload || {});
            }
        }
    };

    AutomationEngine.prototype.runAction = async function (action) {
        var handler = this.actionHandlers.get(action.type);
        if (!handler) return;
        await handler(action.payload || {});
    };

    function registerDefaultAutomationHandlers(engine, legacy) {
        engine.registerActionHandler('set_speed', async function (payload) {
            var speed = Number(payload.speed || 1);
            legacy.dispatchAction('set_speed', { speed: speed });
        });

        engine.registerActionHandler('toggle_mode', async function (payload) {
            var mode = payload.mode || 'windowed';
            legacy.dispatchAction('toggle_mode', { mode: mode });
        });

        engine.registerActionHandler('start_playlist', async function (payload) {
            var playlistId = payload.playlistId;
            if (!playlistId) return;
            if (legacy.actions && typeof legacy.actions.openPlaylist === 'function') {
                legacy.actions.openPlaylist(playlistId);
            }
            var state = legacy.getState();
            var playlist = (state.playlists || []).find(function (item) { return item.id === playlistId; });
            var firstTrack = playlist && Array.isArray(playlist.tracks) ? playlist.tracks[0] : null;
            if (firstTrack && legacy.actions && typeof legacy.actions.loadTrack === 'function') {
                legacy.actions.loadTrack(firstTrack, true);
            }
        });

        engine.registerActionHandler('apply_tags', async function (payload) {
            var tags = Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [];
            if (!tags.length) return;
            var state = legacy.getState();
            var currentTrack = (state.tracks || []).find(function (item) { return item.id === state.currentTrackId; });
            if (!currentTrack) return;
            currentTrack.tags = Array.from(new Set((currentTrack.tags || []).concat(tags)));
            if (legacy.actions && typeof legacy.actions.renderTracks === 'function') {
                legacy.actions.renderTracks({ preserveScroll: true });
            }
        });

        engine.registerActionHandler('enqueue_filter', async function (payload) {
            var query = String(payload.query || '').toLowerCase();
            if (!query) return;
            var state = legacy.getState();
            var matching = (state.tracks || []).filter(function (track) {
                var title = String(track.title || '').toLowerCase();
                var artist = String(track.artist || '').toLowerCase();
                return title.indexOf(query) >= 0 || artist.indexOf(query) >= 0;
            });
            matching.forEach(function (track) {
                if (legacy.actions && typeof legacy.actions.addToQueue === 'function') {
                    legacy.actions.addToQueue(null, track.id);
                }
            });
        });
    }

    function ActionRegistry(root) {
        this.root = root || document;
        this.handlers = new Map();
        this.bound = false;
    }

    ActionRegistry.prototype.register = function (action, handler) {
        this.handlers.set(action, handler);
        if (!this.bound) this.bind();
    };

    ActionRegistry.prototype.bind = function () {
        var self = this;
        this.bound = true;
        this.root.addEventListener('click', function (event) {
            var target = event.target instanceof HTMLElement ? event.target.closest('[data-action]') : null;
            if (!target) return;
            var action = target.getAttribute('data-action');
            if (!action) return;
            var handler = self.handlers.get(action);
            if (!handler) return;
            event.preventDefault();
            handler(event, target);
        });
    };

    function wireHeaderActions(commandPalette, automation) {
        var registry = new ActionRegistry(document);
        registry.register('open-command-palette', function () {
            if (commandPalette) commandPalette.open();
        });
        registry.register('open-automation-rules', function () {
            automation.openRulesPanel();
        });
        registry.register('sync-now', function () {
            notify('Cloud sync is disabled in file mode.', 'info');
        });

        var host = document.querySelector('header');
        var actionsWrap = document.getElementById('nexplay-next-actions');
        if (host && !actionsWrap) {
            var wrap = document.createElement('div');
            wrap.id = 'nexplay-next-actions';
            wrap.className = 'hidden items-center gap-2 ml-3';
            wrap.innerHTML = [
                '<button data-action="open-command-palette" class="px-3 py-2 rounded-lg border border-white/10 text-xs text-gray-300 hover:text-white hover:bg-white/10">Cmd</button>',
                '<button data-action="open-automation-rules" class="px-3 py-2 rounded-lg border border-white/10 text-xs text-gray-300 hover:text-white hover:bg-white/10">Rules</button>',
                '<button data-action="sync-now" class="px-3 py-2 rounded-lg border border-white/10 text-xs text-gray-300 hover:text-white hover:bg-white/10">Sync</button>'
            ].join('');
            host.appendChild(wrap);
            actionsWrap = wrap;
        }

        installDevToolsConsoleGate(actionsWrap);
        return registry;
    }

    function installDevToolsConsoleGate(actionsWrap) {
        function syncVisibility() {
            applyDevToolsVisibility(actionsWrap, isDevToolsUnlocked());
        }

        syncVisibility();

        window.NexPlayOps = {
            unlock: function (secret) {
                if (secret !== DEV_TOOLS_SECRET) {
                    console.warn('[NexPlayNext:file] Invalid unlock key.');
                    return false;
                }
                localStorage.setItem(DEV_TOOLS_UNLOCK_KEY, '1');
                syncVisibility();
                return true;
            },
            hide: function () {
                localStorage.removeItem(DEV_TOOLS_UNLOCK_KEY);
                syncVisibility();
                return true;
            },
            status: function () {
                return {
                    unlocked: isDevToolsUnlocked(),
                    command: "NexPlayOps.unlock('<key>')"
                };
            }
        };
    }

    function isDevToolsUnlocked() {
        try {
            return localStorage.getItem(DEV_TOOLS_UNLOCK_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function applyDevToolsVisibility(actionsWrap, unlocked) {
        if (!actionsWrap) return;
        if (unlocked) {
            actionsWrap.classList.remove('hidden');
            actionsWrap.classList.add('md:flex');
        } else {
            actionsWrap.classList.add('hidden');
            actionsWrap.classList.remove('md:flex');
        }
    }

    function CommandPalette() {
        this.commands = [];
        this.isOpen = false;
        this.activeIndex = 0;
        this.filterText = '';

        this.root = document.createElement('div');
        this.root.id = 'nexplay-command-palette';
        this.root.className = 'fixed inset-0 z-[120] hidden items-start justify-center p-4 bg-black/70 backdrop-blur-sm';
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-modal', 'true');
        this.root.innerHTML = [
            '<div class="w-full max-w-2xl mt-[12vh] rounded-2xl border border-white/10 bg-[#0b0f17] text-white shadow-2xl overflow-hidden">',
            '<div class="px-4 py-3 border-b border-white/10">',
            '<input id="nexplay-command-input" aria-label="Command palette" placeholder="Type a command..." class="w-full bg-transparent outline-none text-sm placeholder:text-gray-500" />',
            '</div>',
            '<div id="nexplay-command-list" class="max-h-[45vh] overflow-y-auto"></div>',
            '<div class="px-4 py-2 text-[11px] text-gray-400 border-t border-white/10">Enter: run  |  Esc: close  |  Arrow keys: navigate</div>',
            '</div>'
        ].join('');

        document.body.appendChild(this.root);
        this.input = this.root.querySelector('#nexplay-command-input');
        this.list = this.root.querySelector('#nexplay-command-list');

        var self = this;
        this.root.addEventListener('click', function (event) {
            if (event.target === self.root) self.close();
        });

        this.input.addEventListener('input', function () {
            self.filterText = String(self.input.value || '').trim().toLowerCase();
            self.activeIndex = 0;
            self.render();
        });

        this.input.addEventListener('keydown', function (event) {
            var visible = self.filteredCommands();
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                self.activeIndex = Math.min(visible.length - 1, self.activeIndex + 1);
                self.render();
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                self.activeIndex = Math.max(0, self.activeIndex - 1);
                self.render();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                var command = visible[self.activeIndex];
                if (command) self.run(command);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                self.close();
            }
        });

        window.addEventListener('keydown', function (event) {
            var target = event.target;
            var inEditable = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                self.toggle();
            } else if (event.key === 'Escape' && self.isOpen && !inEditable) {
                self.close();
            }
        });
    }

    CommandPalette.prototype.register = function (command) {
        var index = this.commands.findIndex(function (item) {
            return item.id === command.id;
        });
        if (index === -1) this.commands.push(command);
        else this.commands[index] = command;
        this.render();
    };

    CommandPalette.prototype.filteredCommands = function () {
        var self = this;
        if (!self.filterText) return self.commands.slice();
        return self.commands.filter(function (command) {
            var haystack = [command.title].concat(command.keywords || []).join(' ').toLowerCase();
            return haystack.indexOf(self.filterText) >= 0;
        });
    };

    CommandPalette.prototype.toggle = function () {
        if (this.isOpen) this.close();
        else this.open();
    };

    CommandPalette.prototype.open = function () {
        this.isOpen = true;
        this.activeIndex = 0;
        this.filterText = '';
        this.input.value = '';
        this.root.classList.remove('hidden');
        this.root.classList.add('flex');
        this.render();
        this.input.focus();
    };

    CommandPalette.prototype.close = function () {
        this.isOpen = false;
        this.root.classList.add('hidden');
        this.root.classList.remove('flex');
    };

    CommandPalette.prototype.render = function () {
        if (!this.isOpen) return;
        var self = this;
        var visible = this.filteredCommands();
        if (visible.length === 0) {
            this.list.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400">No matching commands.</div>';
            return;
        }

        this.list.innerHTML = visible.map(function (command, index) {
            var active = index === self.activeIndex;
            return '<button data-command-id="' + escapeHtml(command.id) + '" class="w-full text-left px-4 py-3 text-sm border-b border-white/5 ' + (active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5') + '">' + escapeHtml(command.title) + '</button>';
        }).join('');

        this.list.querySelectorAll('button[data-command-id]').forEach(function (button) {
            button.addEventListener('click', function () {
                var id = button.getAttribute('data-command-id');
                var command = visible.find(function (item) { return item.id === id; });
                if (command) self.run(command);
            });
        });
    };

    CommandPalette.prototype.run = async function (command) {
        await command.run();
        this.close();
    };

    function createCommandPalette(legacy, automation) {
        var palette = new CommandPalette();
        palette.register({ id: 'play-toggle', title: 'Playback: Toggle Play/Pause', keywords: ['play', 'pause'], run: function () { legacy.dispatchAction('play_pause'); } });
        palette.register({ id: 'play-next', title: 'Playback: Next Track', keywords: ['next'], run: function () { legacy.dispatchAction('next'); } });
        palette.register({ id: 'play-prev', title: 'Playback: Previous Track', keywords: ['prev', 'back'], run: function () { legacy.dispatchAction('prev'); } });
        palette.register({ id: 'queue-open', title: 'View: Toggle Queue Overlay', keywords: ['queue'], run: function () { if (legacy.actions && legacy.actions.toggleQueueOverlay) legacy.actions.toggleQueueOverlay(); } });
        palette.register({ id: 'mode-windowed', title: 'Mode: Toggle Windowed Mode', keywords: ['windowed'], run: function () { legacy.dispatchAction('toggle_mode', { mode: 'windowed' }); } });
        palette.register({ id: 'mode-fs', title: 'Mode: Toggle Immersive Mode', keywords: ['fs', 'fullscreen'], run: function () { legacy.dispatchAction('toggle_mode', { mode: 'fs' }); } });
        palette.register({ id: 'mode-video', title: 'Mode: Toggle Video Mode', keywords: ['video'], run: function () { legacy.dispatchAction('toggle_mode', { mode: 'video' }); } });
        palette.register({ id: 'tab-library', title: 'Navigate: Library', keywords: ['tab', 'all'], run: function () { legacy.dispatchAction('change_tab', { tab: 'all' }); } });
        palette.register({ id: 'tab-audio', title: 'Navigate: Audio', keywords: ['tab'], run: function () { legacy.dispatchAction('change_tab', { tab: 'audio' }); } });
        palette.register({ id: 'tab-videos', title: 'Navigate: Videos', keywords: ['tab'], run: function () { legacy.dispatchAction('change_tab', { tab: 'videos' }); } });
        palette.register({ id: 'tab-playlists', title: 'Navigate: Playlists', keywords: ['tab'], run: function () { legacy.dispatchAction('change_tab', { tab: 'playlists' }); } });
        palette.register({ id: 'tab-stats', title: 'Navigate: Stats', keywords: ['tab'], run: function () { legacy.dispatchAction('change_tab', { tab: 'stats' }); } });
        palette.register({ id: 'automation-open', title: 'Automation: Open Rules Panel', keywords: ['automation', 'rules'], run: function () { automation.openRulesPanel(); } });
        palette.register({
            id: 'automation-quick',
            title: 'Automation: Add Track-End Speed Rule',
            keywords: ['automation', 'speed', 'rule'],
            run: async function () {
                var existing = automation.listRules();
                var next = existing.slice();
                next.push({
                    id: 'rule-' + Date.now(),
                    name: 'Track End -> 1.25x',
                    enabled: true,
                    priority: next.length + 1,
                    trigger: { type: 'on_track_end', config: {} },
                    actions: [{ type: 'set_speed', payload: { speed: 1.25 } }],
                    updatedAt: Date.now()
                });
                saveRules(next);
                automation.engine.setRules(next);
                notify('Quick automation rule added.', 'success');
            }
        });
        return palette;
    }

    function createRulesPanel(options) {
        var state = {
            rules: [],
            editId: null,
            root: document.createElement('div')
        };

        state.root.className = 'fixed inset-0 z-[115] hidden items-center justify-center p-4 bg-black/75 backdrop-blur-sm';
        state.root.setAttribute('role', 'dialog');
        state.root.setAttribute('aria-modal', 'true');
        state.root.innerHTML = [
            '<div class="w-full max-w-4xl rounded-2xl bg-[#0b0f17] border border-white/10 text-white overflow-hidden">',
            '<div class="flex items-center justify-between px-4 py-3 border-b border-white/10">',
            '<h2 class="text-sm font-bold uppercase tracking-wider">Automation Rules</h2>',
            '<button data-close class="px-3 py-1 rounded bg-white/10 hover:bg-white/20">Close</button>',
            '</div>',
            '<div class="grid md:grid-cols-2 gap-0">',
            '<div class="border-r border-white/10 p-4"><div id="automation-rules-list" class="space-y-2 max-h-[55vh] overflow-y-auto"></div></div>',
            '<div class="p-4 space-y-3">',
            '<h3 class="text-xs uppercase text-gray-400 tracking-wider">Create / Edit Rule</h3>',
            '<input id="automation-name" class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" placeholder="Rule name" />',
            '<select id="automation-trigger" class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm"></select>',
            '<select id="automation-action" class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm"></select>',
            '<textarea id="automation-payload" class="w-full h-32 bg-black/40 border border-white/10 rounded px-3 py-2 text-xs font-mono" placeholder="{&quot;speed&quot;:1.25}"></textarea>',
            '<div class="flex gap-2">',
            '<button id="automation-add" class="px-3 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-sm">Add Rule</button>',
            '<button id="automation-reset" class="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">Reset</button>',
            '<button id="automation-save" class="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">Save All</button>',
            '</div>',
            '</div>',
            '</div>',
            '</div>'
        ].join('');

        document.body.appendChild(state.root);

        var listEl = state.root.querySelector('#automation-rules-list');
        var nameInput = state.root.querySelector('#automation-name');
        var triggerInput = state.root.querySelector('#automation-trigger');
        var actionInput = state.root.querySelector('#automation-action');
        var payloadInput = state.root.querySelector('#automation-payload');
        var addButton = state.root.querySelector('#automation-add');

        triggerInput.innerHTML = TRIGGERS.map(function (v) { return '<option value="' + v + '">' + v + '</option>'; }).join('');
        actionInput.innerHTML = ACTIONS.map(function (v) { return '<option value="' + v + '">' + v + '</option>'; }).join('');

        function reindex() {
            state.rules = state.rules.map(function (rule, index) {
                rule.priority = index + 1;
                rule.updatedAt = Date.now();
                return rule;
            });
        }

        function resetForm() {
            state.editId = null;
            nameInput.value = '';
            triggerInput.value = 'on_track_end';
            actionInput.value = 'set_speed';
            payloadInput.value = '';
            addButton.textContent = 'Add Rule';
        }

        function renderList() {
            if (!state.rules.length) {
                listEl.innerHTML = '<div class="text-sm text-gray-400">No rules configured yet.</div>';
                return;
            }
            listEl.innerHTML = state.rules.map(function (rule, idx) {
                var action = rule.actions && rule.actions[0] ? rule.actions[0].type : 'none';
                return [
                    '<div class="rounded border border-white/10 bg-white/5 p-3">',
                    '<div class="flex items-start justify-between gap-2">',
                    '<div>',
                    '<div class="text-sm font-semibold">' + escapeHtml(rule.name) + '</div>',
                    '<div class="text-[11px] text-gray-400">P' + (idx + 1) + ' | ' + escapeHtml(rule.trigger.type) + ' -> ' + escapeHtml(action) + '</div>',
                    '</div>',
                    '<label class="text-xs flex items-center gap-2"><input data-rule-toggle="' + escapeHtml(rule.id) + '" type="checkbox" ' + (rule.enabled ? 'checked' : '') + ' /> Enabled</label>',
                    '</div>',
                    '<div class="mt-3 flex gap-2">',
                    '<button data-rule-action="edit" data-rule-id="' + escapeHtml(rule.id) + '" class="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs">Edit</button>',
                    '<button data-rule-action="move-up" data-rule-id="' + escapeHtml(rule.id) + '" class="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs">Up</button>',
                    '<button data-rule-action="move-down" data-rule-id="' + escapeHtml(rule.id) + '" class="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs">Down</button>',
                    '<button data-rule-action="delete" data-rule-id="' + escapeHtml(rule.id) + '" class="px-2 py-1 rounded bg-red-600/80 hover:bg-red-500 text-xs">Delete</button>',
                    '</div>',
                    '</div>'
                ].join('');
            }).join('');
        }

        function open() {
            state.rules = options.getRules().map(function (rule, index) {
                return normalizeRule(rule, index + 1);
            });
            resetForm();
            renderList();
            state.root.classList.remove('hidden');
            state.root.classList.add('flex');
            nameInput.focus();
        }

        function close() {
            state.root.classList.add('hidden');
            state.root.classList.remove('flex');
            resetForm();
        }

        state.root.querySelector('[data-close]').addEventListener('click', close);
        state.root.addEventListener('click', function (event) {
            if (event.target === state.root) close();
        });
        state.root.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
            }
        });

        state.root.querySelector('#automation-add').addEventListener('click', function () {
            var name = String(nameInput.value || '').trim();
            if (!name) {
                notify('Rule name is required.', 'warning');
                return;
            }
            var payload = {};
            if (String(payloadInput.value || '').trim()) {
                try { payload = JSON.parse(payloadInput.value); } catch (_) { payload = {}; }
            }
            var rule = normalizeRule({
                id: state.editId || undefined,
                name: name,
                enabled: true,
                trigger: { type: triggerInput.value || 'on_track_end', config: {} },
                actions: [{ type: actionInput.value || 'set_speed', payload: payload }],
                updatedAt: Date.now()
            }, 1);
            var index = state.rules.findIndex(function (item) { return item.id === rule.id; });
            if (index >= 0) state.rules[index] = rule;
            else state.rules.push(rule);
            reindex();
            resetForm();
            renderList();
        });

        state.root.querySelector('#automation-reset').addEventListener('click', resetForm);
        state.root.querySelector('#automation-save').addEventListener('click', function () {
            reindex();
            options.saveRules(state.rules.slice());
            close();
        });

        listEl.addEventListener('click', function (event) {
            var target = event.target instanceof HTMLElement ? event.target.closest('[data-rule-action]') : null;
            if (!target) return;
            var action = target.getAttribute('data-rule-action');
            var id = target.getAttribute('data-rule-id');
            if (!action || !id) return;
            if (action === 'edit') {
                var rule = state.rules.find(function (item) { return item.id === id; });
                if (!rule) return;
                var firstAction = rule.actions && rule.actions[0] ? rule.actions[0] : { type: 'set_speed', payload: {} };
                state.editId = rule.id;
                nameInput.value = rule.name || '';
                triggerInput.value = rule.trigger && rule.trigger.type ? rule.trigger.type : 'on_track_end';
                actionInput.value = firstAction.type || 'set_speed';
                payloadInput.value = JSON.stringify(firstAction.payload || {}, null, 2);
                addButton.textContent = 'Update Rule';
            } else if (action === 'delete') {
                state.rules = state.rules.filter(function (item) { return item.id !== id; });
                reindex();
                if (state.editId === id) resetForm();
                renderList();
            } else if (action === 'move-up' || action === 'move-down') {
                var currentIndex = state.rules.findIndex(function (item) { return item.id === id; });
                if (currentIndex < 0) return;
                var nextIndex = currentIndex + (action === 'move-up' ? -1 : 1);
                if (nextIndex < 0 || nextIndex >= state.rules.length) return;
                var temp = state.rules[currentIndex];
                state.rules[currentIndex] = state.rules[nextIndex];
                state.rules[nextIndex] = temp;
                reindex();
                renderList();
            }
        });

        listEl.addEventListener('change', function (event) {
            var target = event.target;
            if (!(target instanceof HTMLInputElement)) return;
            var id = target.getAttribute('data-rule-toggle');
            if (!id) return;
            var rule = state.rules.find(function (item) { return item.id === id; });
            if (rule) rule.enabled = target.checked;
        });

        return { open: open, close: close };
    }
})();


