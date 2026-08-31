const CACHE_NAME = 'nexplay-offline-web-v4';
const METADATA_CACHE_NAME = 'nexplay-offline-metadata-v1';
const CORE_ASSETS = [
    './',
    './index.html',
    './NexPlay.html',
    './NexPlay.mobile.html',
    './404.html',
    './manifest.webmanifest',
    './manifest.iphone.webmanifest',
    './tailwind.generated.css',
    './NexPlay_N_final_256.ico',
    './nexplay-icon-brand.png',
    './offline/offline-mode.css?v=4',
    './offline/offline-mode.js?v=4',
    './vendor/lucide.min.js',
    './vendor/chart.umd.js',
    './nexplay-next/legacy-online-music-helpers.cjs',
    './nexplay-next/audio-queue-engine.cjs'
];

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

function isLocalRequest(request) {
    const url = new URL(request.url);
    return url.origin === self.location.origin
        || url.protocol === 'data:'
        || url.protocol === 'blob:'
        || url.protocol === 'file:'
        || url.protocol === 'about:';
}

function isTrustedMetadataRequest(request) {
    const url = new URL(request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
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

function canCacheResponse(response) {
    if (!response) return false;
    return response.ok || response.type === 'opaque' || response.type === 'cors' || response.type === 'basic';
}

async function handleMetadataRequest(request) {
    const cache = await caches.open(METADATA_CACHE_NAME);
    try {
        const response = await fetch(request);
        if (canCacheResponse(response)) {
            cache.put(request, response.clone()).catch(() => {});
        }
        return response;
    } catch (_) {
        const cached = await cache.match(request);
        return cached || new Response('', {
            status: 504,
            statusText: 'Offline and metadata not cached'
        });
    }
}

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
        caches.keys()
            .then((keys) => Promise.all(keys
                .filter((key) => ![CACHE_NAME, METADATA_CACHE_NAME].includes(key))
                .map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    if (isTrustedMetadataRequest(request)) {
        if (request.destination === 'image') {
            event.respondWith(new Response('', {
                status: 451,
                statusText: 'Remote metadata images are converted in the background'
            }));
            return;
        }
        event.respondWith(handleMetadataRequest(request));
        return;
    }

    if (!isLocalRequest(request)) {
        event.respondWith(new Response('', {
            status: 451,
            statusText: 'Network blocked in NexPlay Offline'
        }));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
                    return response;
                })
                .catch(async () => {
                    const cache = await caches.open(CACHE_NAME);
                    return cache.match(request)
                        || cache.match('./NexPlay.html')
                        || cache.match('./index.html')
                        || cache.match('./');
                })
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request)
                .then((response) => {
                    if (response && response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
                    }
                    return response;
                })
                .catch(() => new Response('', {
                    status: 504,
                    statusText: 'Offline and not cached'
                }));
        })
    );
});
