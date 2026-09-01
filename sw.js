const CACHE_NAME = 'nexplay-shell-v11';
const CORE_ASSETS = [
    './',
    './index.html',
    './NexPlay.html',
    './NexPlay.mobile.html',
    './404.html',
    './manifest.webmanifest',
    './manifest.iphone.webmanifest',
    './css/tailwind.generated.css',
    './css/base.css',
    './css/theme.css',
    './css/components.css',
    './css/animations.css',
    './assets/NexPlay_N_final_256.ico',
    './nexplay-icon-brand.png',
    './js/bootstrap.js',
    './js/app.js',
    './js/legacy-api.js',
    './js/core/error-boundary.js',
    './js/core/state.js',
    './js/core/storage.js',
    './js/core/audio-context.js',
    './js/core/audio.js',
    './js/ui/dom-utils.js',
    './js/ui/layout.js',
    './js/ui/theme.js',
    './js/ui/toast.js',
    './js/features/player.js',
    './js/features/sidebar.js',
    './js/features/queue.js',
    './js/features/playlists.js',
    './js/features/visualizer.js',
    './js/features/search.js',
    './js/features/stats.js',
    './js/features/modals.js',
    './js/utils/helpers.js',
    './js/utils/keyboard-shortcuts.js',
    './js/legacy/runtime-config.js',
    './js/legacy/runtime-state.js',
    './js/legacy/helpers.js',
    './js/legacy/online-playlists.js',
    './js/legacy/online-music.js',
    './js/legacy/app-init.js',
    './js/legacy/library.js',
    './js/legacy/player.js',
    './js/legacy/visualizer.js',
    './js/legacy/settings-and-video.js',
    './js/legacy/rendering.js',
    './js/legacy/smart-playlists.js',
    './js/legacy/queue.js',
    './js/legacy/theme-and-shortcuts.js',
    './js/legacy/modals-and-modes.js',
    './nexplay-next/bootstrap.js',
    './nexplay-next/bootstrap.file.js',
    './nexplay-next/loader.js',
    './nexplay-next/protocol-manifest.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => Promise.allSettled(
                CORE_ASSETS.map((asset) => cache.add(new Request(asset, { cache: 'reload' })))
            ))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )).then(() => self.clients.claim())
    );
});

function cacheResponse(request, response) {
    if (!response || !(response.ok || response.type === 'opaque')) return response;
    const copy = response.clone();
    caches.open(CACHE_NAME)
        .then((cache) => cache.put(request, copy))
        .catch(() => {});
    return response;
}

async function networkFirst(request, fallbackResponse) {
    try {
        const response = await fetch(request);
        return cacheResponse(request, response);
    } catch (_) {
        return fallbackResponse || new Response('', { status: 504, statusText: 'Offline' });
    }
}

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const request = event.request;
    const requestUrl = new URL(request.url);
    const isSameOrigin = requestUrl.origin === self.location.origin;
    const isNavigation = request.mode === 'navigate';

    // Cross-origin requests are left to the browser. Proxying them bought nothing
    // (their responses were never cached) and it put the YouTube iframe API behind
    // the worker, which a Home Screen launch always controls from the first byte.
    if (!isSameOrigin) return;

    if (isNavigation) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, copy).catch(() => {});
                    }).catch(() => {});
                    return response;
                })
                .catch(async () => {
                    const cache = await caches.open(CACHE_NAME);
                    return cache.match(request)
                        || cache.match('./NexPlay.mobile.html')
                        || cache.match('./index.html')
                        || cache.match('./NexPlay.html')
                        || cache.match('./')
                        || new Response('NexPlay is offline and no cached shell is available.', {
                            status: 503,
                            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                        });
                })
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => networkFirst(request, cached))
    );
});
