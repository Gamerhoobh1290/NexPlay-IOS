const CACHE_NAMESPACE = 'nexplay-web-';
const LEGACY_CACHE_NAMESPACES = Object.freeze(['nexplay-shell-']);
const CACHE_VERSION = '__NEXPLAY_CACHE_VERSION__';
const CACHE_NAME = `${CACHE_NAMESPACE}shell-${CACHE_VERSION}`;
const NAVIGATION_TIMEOUT_MS = 4500;
const CRITICAL_ASSETS = Object.freeze(__NEXPLAY_CRITICAL_ASSETS__);
const SCOPE_URL = new URL(self.registration.scope);
const CRITICAL_PATHS = new Set(
  CRITICAL_ASSETS.map((asset) => new URL(asset, SCOPE_URL).pathname)
);
const MEDIA_DESTINATIONS = new Set(['audio', 'video']);
const MEDIA_EXTENSION_PATTERN = /\.(?:aac|flac|m3u8|m4a|mp3|mp4|oga|ogg|opus|ts|wav|webm)(?:$|[?#])/i;

function isYouTubeHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'youtu.be'
    || host === 'youtube.com'
    || host.endsWith('.youtube.com')
    || host === 'youtube-nocookie.com'
    || host.endsWith('.youtube-nocookie.com')
    || host === 'googlevideo.com'
    || host.endsWith('.googlevideo.com')
    || host === 'ytimg.com'
    || host.endsWith('.ytimg.com');
}

function isMediaOrRangeRequest(request, requestUrl) {
  const headers = request.headers;
  if (headers && typeof headers.has === 'function' && headers.has('range')) return true;
  if (MEDIA_DESTINATIONS.has(request.destination)) return true;
  const accept = headers && typeof headers.get === 'function' ? String(headers.get('accept') || '') : '';
  return /(?:audio|video)\//i.test(accept) || MEDIA_EXTENSION_PATTERN.test(requestUrl.pathname);
}

function isCriticalRequest(requestUrl) {
  return CRITICAL_PATHS.has(requestUrl.pathname);
}

async function installCriticalShell() {
  const cache = await caches.open(CACHE_NAME);
  const requests = CRITICAL_ASSETS.map((asset) => new Request(
    new URL(asset, SCOPE_URL).href,
    { cache: 'reload', credentials: 'same-origin' }
  ));
  try {
    await cache.addAll(requests);
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
  await self.skipWaiting();
}

self.addEventListener('install', (event) => {
  event.waitUntil(installCriticalShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => (
        (name.startsWith(CACHE_NAMESPACE) && name !== CACHE_NAME)
        || LEGACY_CACHE_NAMESPACES.some((namespace) => name.startsWith(namespace))
      ))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function fetchWithTimeout(request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function navigationNetworkFirst(request) {
  try {
    const response = await fetchWithTimeout(request);
    if (Number(response?.status || 0) >= 500) {
      throw new Error(`Navigation server error: ${response.status}`);
    }
    return response;
  } catch (_) {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(request, { ignoreSearch: true })
      || await cache.match(new URL('./NexPlay.html', SCOPE_URL).href)
      || await cache.match(new URL('./index.html', SCOPE_URL).href)
      || await cache.match(new URL('./NexPlay.mobile.html', SCOPE_URL).href)
      || new Response('NexPlay is offline and no cached shell is available.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
  }
}

async function criticalCacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  return cached || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') return;
  if (requestUrl.origin !== self.location.origin) return;
  if (isYouTubeHost(requestUrl.hostname)) return;
  if (isMediaOrRangeRequest(request, requestUrl)) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  if (isCriticalRequest(requestUrl)) {
    event.respondWith(criticalCacheFirst(request));
  }
});
