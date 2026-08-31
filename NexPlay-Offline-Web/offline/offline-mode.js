(function bootNexPlayOfflineEdition() {
    'use strict';

    const REMOTE_BLOCK_MESSAGE = 'NexPlay Offline only allows trusted cover and lyrics lookups when you are online.';
    const METADATA_OFFLINE_MESSAGE = 'That cover or lyrics lookup is not cached yet. Connect once to save it for offline use.';
    const METADATA_CACHE_NAME = 'nexplay-offline-metadata-v1';
    const OFFLINE_TABS = new Set(['online-videos', 'online-music']);
    const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
    const LOCAL_PROTOCOLS = new Set(['file:', 'data:', 'blob:', 'about:']);
    const METADATA_HOSTS = new Set([
        'itunes.apple.com',
        'api.deezer.com',
        'lrclib.net',
        'api.lyrics.ovh'
    ]);
    const METADATA_HOST_SUFFIXES = [
        '.mzstatic.com',
        '.dzcdn.net'
    ];

    window.NEXPLAY_OFFLINE_EDITION = true;
    window.NEXPLAY_ALLOW_NETWORK = 'metadata-only';
    window.NEXPLAY_ALLOW_METADATA_NETWORK = true;
    window.NEXPLAY_SUPABASE_URL = '';
    window.NEXPLAY_SUPABASE_ANON_KEY = '';
    window.NEXPLAY_SUPABASE_ACCESS_TOKEN = '';
    window.NEXPLAY_SYNC_PROXY_URL = '';
    window.NEXPLAY_TELEMETRY_ENDPOINT = '';
    window.NEXPLAY_FLAGS = {
        ...(window.NEXPLAY_FLAGS || {}),
        enable_next_bootstrap: false,
        use_command_palette: false,
        offline_edition: true
    };

    function toUrl(input) {
        try {
            const raw = input instanceof Request ? input.url : String(input || '');
            return new URL(raw, window.location.href);
        } catch (_) {
            return null;
        }
    }

    function isLocalHttpUrl(url) {
        if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return false;
        if (url.origin === window.location.origin) return true;
        return LOCAL_HOSTS.has(url.hostname);
    }

    function isTrustedMetadataUrl(input) {
        const url = input instanceof URL ? input : toUrl(input);
        if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return false;
        const hostname = String(url.hostname || '').toLowerCase();
        if (hostname.endsWith('.mzstatic.com') || hostname.endsWith('.dzcdn.net')) return true;
        if (hostname === 'lrclib.net') return url.pathname.startsWith('/api/');
        if (hostname === 'api.lyrics.ovh') return url.pathname.startsWith('/v1/');
        if (hostname === 'itunes.apple.com') {
            return url.pathname === '/search'
                && url.searchParams.has('callback')
                && url.searchParams.get('media') === 'music'
                && url.searchParams.get('limit') === '1';
        }
        if (hostname === 'api.deezer.com') {
            return url.pathname === '/search'
                && url.searchParams.get('output') === 'jsonp'
                && url.searchParams.has('callback')
                && url.searchParams.get('limit') === '1';
        }
        return false;
    }

    function isAllowedUrl(input) {
        const url = toUrl(input);
        if (!url) return true;
        if (LOCAL_PROTOCOLS.has(url.protocol)) return true;
        if (isLocalHttpUrl(url)) return true;
        if (isTrustedMetadataUrl(url)) return true;
        return false;
    }

    function isAllowedElementUrl(input, tagName) {
        const normalizedTagName = String(tagName || '').toUpperCase();
        if ((normalizedTagName === 'IMG' || normalizedTagName === 'SOURCE') && isTrustedMetadataUrl(input)) {
            return false;
        }
        return isAllowedUrl(input);
    }

    function describeInput(input) {
        const url = toUrl(input);
        return url ? url.href : String(input || '');
    }

    let lastToastAt = 0;
    function showOfflineNotice(message = REMOTE_BLOCK_MESSAGE) {
        const now = Date.now();
        if (now - lastToastAt < 900) return;
        lastToastAt = now;
        if (typeof window.showToast === 'function') {
            try {
                window.showToast(message, 'warn');
                return;
            } catch (_) {}
        }

        let toast = document.getElementById('nexplay-offline-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'nexplay-offline-toast';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('is-visible');
        window.clearTimeout(showOfflineNotice.timeoutId);
        showOfflineNotice.timeoutId = window.setTimeout(() => {
            toast.classList.remove('is-visible');
        }, 3200);
    }

    function emitBlocked(input, apiName, message = REMOTE_BLOCK_MESSAGE, quiet = false) {
        const url = describeInput(input);
        window.dispatchEvent(new CustomEvent('nexplay:offline-blocked', {
            detail: { apiName, url }
        }));
        if (!quiet) {
            console.warn(`[NexPlay Offline] Blocked ${apiName}: ${url}`);
            showOfflineNotice(message);
        }
    }

    function getRequestMethod(input, init) {
        return String((init && init.method) || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
    }

    async function readCachedMetadata(input) {
        if (!('caches' in window)) return null;
        const url = toUrl(input);
        if (!url) return null;
        try {
            const cache = await window.caches.open(METADATA_CACHE_NAME);
            return await cache.match(url.href);
        } catch (_) {
            return null;
        }
    }

    function canCacheResponse(response) {
        if (!response) return false;
        return response.ok || response.type === 'opaque' || response.type === 'cors' || response.type === 'basic';
    }

    async function storeCachedMetadata(input, response) {
        if (!('caches' in window) || !canCacheResponse(response)) return;
        const url = toUrl(input);
        if (!url) return;
        try {
            const cache = await window.caches.open(METADATA_CACHE_NAME);
            await cache.put(url.href, response.clone());
        } catch (_) {}
    }

    const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
    if (nativeFetch) {
        window.fetch = async function offlineFetch(input, init) {
            if (isTrustedMetadataUrl(input) && getRequestMethod(input, init) === 'GET') {
                if (navigator.onLine !== false) {
                    try {
                        const response = await nativeFetch(input, init);
                        storeCachedMetadata(input, response).catch(() => {});
                        return response;
                    } catch (error) {
                        const cached = await readCachedMetadata(input);
                        if (cached) return cached;
                        throw error;
                    }
                }

                const cached = await readCachedMetadata(input);
                if (cached) return cached;
                emitBlocked(input, 'fetch', METADATA_OFFLINE_MESSAGE);
                throw new TypeError('NexPlay Offline has no cached metadata response for this request.');
            }

            if (!isAllowedUrl(input)) {
                emitBlocked(input, 'fetch');
                return Promise.reject(new TypeError('NexPlay Offline blocked a network request.'));
            }
            return nativeFetch(input, init);
        };
    }

    if (window.XMLHttpRequest) {
        const nativeOpen = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function offlineXhrOpen(method, url) {
            if (!isAllowedUrl(url)) {
                emitBlocked(url, 'XMLHttpRequest');
                throw new TypeError('NexPlay Offline blocked a network request.');
            }
            return nativeOpen.apply(this, arguments);
        };
    }

    function neutralizeRemoteElement(node) {
        if (!node || node.nodeType !== 1) return false;
        const tagName = String(node.tagName || '').toUpperCase();
        const attrName = tagName === 'LINK' || tagName === 'A' ? 'href' : 'src';
        const value = node.getAttribute(attrName);
        if (!value || isAllowedElementUrl(value, tagName)) return false;

        const quiet = (tagName === 'IMG' || tagName === 'SOURCE') && isTrustedMetadataUrl(value);
        emitBlocked(value, tagName.toLowerCase(), REMOTE_BLOCK_MESSAGE, quiet);
        node.dataset.nexplayOfflineBlocked = 'true';

        if (tagName === 'SCRIPT') {
            node.removeAttribute('src');
            node.type = 'application/x-nexplay-offline-blocked';
            window.setTimeout(() => node.dispatchEvent(new Event('error')), 0);
            return true;
        }

        if (tagName === 'IFRAME') {
            node.setAttribute('src', 'about:blank');
            window.setTimeout(() => node.dispatchEvent(new Event('error')), 0);
            return true;
        }

        if (tagName === 'IMG' || tagName === 'SOURCE') {
            node.removeAttribute('src');
            window.setTimeout(() => node.dispatchEvent(new Event('error')), 0);
            return true;
        }

        if (tagName === 'LINK') {
            node.removeAttribute('href');
            return true;
        }

        return false;
    }

    const nativeAppendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function offlineAppendChild(child) {
        neutralizeRemoteElement(child);
        return nativeAppendChild.call(this, child);
    };

    const nativeInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function offlineInsertBefore(child, reference) {
        neutralizeRemoteElement(child);
        return nativeInsertBefore.call(this, child, reference);
    };

    const nativeSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function offlineSetAttribute(name, value) {
        const tagName = String(this.tagName || '').toUpperCase();
        const attr = String(name || '').toLowerCase();
        const watchesSrc = ['SCRIPT', 'IFRAME', 'IMG', 'SOURCE'].includes(tagName) && attr === 'src';
        const watchesHref = ['LINK', 'A'].includes(tagName) && attr === 'href';
        if ((watchesSrc || watchesHref) && value && !isAllowedElementUrl(value, tagName)) {
            const quiet = (tagName === 'IMG' || tagName === 'SOURCE') && isTrustedMetadataUrl(value);
            emitBlocked(value, `${tagName.toLowerCase()}.${attr}`, REMOTE_BLOCK_MESSAGE, quiet);
            this.dataset.nexplayOfflineBlocked = 'true';
            if (tagName === 'A') return nativeSetAttribute.call(this, name, '#');
            if (tagName === 'IFRAME') return nativeSetAttribute.call(this, name, 'about:blank');
            return undefined;
        }
        return nativeSetAttribute.call(this, name, value);
    };

    function markOfflineRuntime() {
        document.documentElement.dataset.nexplayOffline = 'true';
        if (document.body) document.body.dataset.nexplayOffline = 'true';
    }

    function disableRemoteAnchors() {
        document.querySelectorAll('a[href]').forEach((anchor) => {
            const href = anchor.getAttribute('href') || '';
            if (!href || isAllowedUrl(href)) return;
            anchor.dataset.nexplayOfflineBlocked = 'true';
            anchor.setAttribute('title', REMOTE_BLOCK_MESSAGE);
            anchor.setAttribute('aria-disabled', 'true');
        });
    }

    function sanitizeOfflineState() {
        const legacy = window.NexPlayLegacy;
        const state = legacy && typeof legacy.getState === 'function' ? legacy.getState() : null;
        if (!state) return;

        if (OFFLINE_TABS.has(state.activeTab)) {
            state.activeTab = 'all';
        }

        if (state.appSettings && state.appSettings.appearance && OFFLINE_TABS.has(state.appSettings.appearance.defaultStartTab)) {
            state.appSettings.appearance.defaultStartTab = 'all';
        }

        if (Array.isArray(state.tracks)) {
            state.tracks = state.tracks.filter((track) => track && track.source !== 'online-music');
        }

        try {
            if (legacy.actions && typeof legacy.actions.renderNav === 'function') legacy.actions.renderNav();
            if (legacy.actions && typeof legacy.actions.renderTracks === 'function') legacy.actions.renderTracks({ preserveScroll: true });
        } catch (_) {}
    }

    function wrapOnlineRoutes() {
        if (typeof window.changeTab === 'function' && !window.changeTab.__nexplayOfflineWrapped) {
            const originalChangeTab = window.changeTab;
            window.changeTab = function offlineChangeTab(id) {
                if (OFFLINE_TABS.has(String(id || ''))) {
                    showOfflineNotice();
                    return originalChangeTab.call(this, 'all');
                }
                return originalChangeTab.apply(this, arguments);
            };
            window.changeTab.__nexplayOfflineWrapped = true;
        }

        if (typeof window.openMobileSearchExperience === 'function' && !window.openMobileSearchExperience.__nexplayOfflineWrapped) {
            const originalOpenMobileSearch = window.openMobileSearchExperience;
            window.openMobileSearchExperience = function offlineMobileSearch(mode) {
                if (mode === 'online') {
                    showOfflineNotice();
                    return originalOpenMobileSearch.call(this, 'local');
                }
                return originalOpenMobileSearch.apply(this, arguments);
            };
            window.openMobileSearchExperience.__nexplayOfflineWrapped = true;
        }
    }

    function registerOfflineServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (window.location.protocol !== 'https:' && !isLocalhost) return;
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(() => {});
        }, { once: true });
    }

    document.addEventListener('click', (event) => {
        const anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (!anchor) return;
        const href = anchor.getAttribute('href') || '';
        if (!href || isAllowedUrl(href)) return;
        event.preventDefault();
        event.stopPropagation();
        showOfflineNotice();
    }, true);

    window.addEventListener('nexplay:legacy-api-ready', () => {
        wrapOnlineRoutes();
        sanitizeOfflineState();
        disableRemoteAnchors();
    });

    document.addEventListener('DOMContentLoaded', () => {
        markOfflineRuntime();
        disableRemoteAnchors();
        wrapOnlineRoutes();
    });

    registerOfflineServiceWorker();
})();
