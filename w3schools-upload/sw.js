const CACHE_NAME = 'nexplay-shell-v4';
const CORE_ASSETS = [
    './',
    './NexPlay.html',
    './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CORE_ASSETS))
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

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const request = event.request;
    const isSameOrigin = request.url.startsWith(self.location.origin);
    if (!isSameOrigin) return;
    const isNavigation = request.mode === 'navigate';

    if (isNavigation) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put('./NexPlay.html', copy)).catch(() => {});
                    return response;
                })
                .catch(async () => {
                    const cache = await caches.open(CACHE_NAME);
                    return cache.match('./NexPlay.html') || cache.match('./');
                })
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            const networkFetch = fetch(request)
                .then((response) => {
                    if (response && response.ok && request.url.startsWith(self.location.origin)) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
                    }
                    return response;
                })
                .catch(() => cached || new Response('', { status: 504, statusText: 'Offline' }));

            return cached || networkFetch;
        })
    );
});
