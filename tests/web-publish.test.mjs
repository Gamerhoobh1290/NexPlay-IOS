// @ts-nocheck -- Integration test exercises filesystem and subprocess boundaries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildWebSite, rewriteStagedDesktopWeb } = require('../scripts/build-web-site.cjs');
const { verifyWebBuild } = require('../scripts/verify-web-build.cjs');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function runRouteScript(relativePath, href, windowOverrides = {}) {
  const document = readProjectFile(relativePath);
  const script = document.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(script, `${relativePath} route script should exist`);
  const current = new URL(href);
  let destination = '';
  const window = {
    location: {
      href: current.href,
      origin: current.origin,
      search: current.search,
      hash: current.hash,
      replace(value) {
        destination = value;
      },
    },
    ...windowOverrides,
  };
  vm.runInNewContext(script, { URL, window });
  return destination;
}

function runLauncher({
  href = 'https://nexplay.example/NexPlay.html?source=test#queue',
  userAgent = '',
  platform = '',
  maxTouchPoints = 0,
  coarsePointer = false,
  narrowScreen = false,
} = {}) {
  return runRouteScript('NexPlay.html', href, {
    navigator: { userAgent, platform, maxTouchPoints },
    matchMedia(query) {
      return {
        matches: query === '(pointer: coarse)' ? coarsePointer : narrowScreen,
      };
    },
  });
}

function runNotFoundRouter(href) {
  return runRouteScript('404.html', href);
}

function createHeaders(entries = {}) {
  const values = new Map(Object.entries(entries).map(([name, value]) => [name.toLowerCase(), String(value)]));
  return {
    get(name) {
      return values.get(String(name).toLowerCase()) || null;
    },
    has(name) {
      return values.has(String(name).toLowerCase());
    },
  };
}

function createRequest(url, {
  method = 'GET',
  mode = 'cors',
  destination = '',
  headers = {},
} = {}) {
  return { url, method, mode, destination, headers: createHeaders(headers) };
}

function createServiceWorkerHarness(source, options = {}) {
  const listeners = new Map();
  const openedCaches = [];
  const deletedCaches = [];
  const addedRequests = [];
  const fetchCalls = [];
  const timeoutDelays = [];
  let skipWaitingCalls = 0;
  let claimCalls = 0;
  let clearTimeoutCalls = 0;

  class WorkerRequest {
    constructor(input, init = {}) {
      this.url = typeof input === 'string' ? input : input.url;
      this.cache = init.cache;
      this.credentials = init.credentials;
    }
  }

  class WorkerResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.headers = init.headers || {};
    }
  }

  class WorkerAbortController {
    constructor() {
      this.signal = { aborted: false };
    }

    abort() {
      this.signal.aborted = true;
    }
  }

  const cache = {
    async addAll(requests) {
      addedRequests.push(...requests);
      if (options.addAllError) throw options.addAllError;
    },
    async match(request, matchOptions) {
      return options.matchCache ? options.matchCache(request, matchOptions) : null;
    },
  };
  const caches = {
    async open(name) {
      openedCaches.push(name);
      return cache;
    },
    async keys() {
      return typeof options.cacheKeys === 'function' ? options.cacheKeys() : (options.cacheKeys || []);
    },
    async delete(name) {
      deletedCaches.push(name);
      return true;
    },
  };
  const self = {
    registration: { scope: 'https://nexplay.example/app/' },
    location: { origin: 'https://nexplay.example' },
    clients: {
      async claim() {
        claimCalls += 1;
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async skipWaiting() {
      skipWaitingCalls += 1;
    },
  };
  const fetchImpl = options.fetchImpl || (async (request) => ({ ok: true, request }));

  vm.runInNewContext(source, {
    AbortController: WorkerAbortController,
    Request: WorkerRequest,
    Response: WorkerResponse,
    URL,
    caches,
    clearTimeout() {
      clearTimeoutCalls += 1;
    },
    fetch(request, init) {
      fetchCalls.push({ request, init });
      return fetchImpl(request, init);
    },
    self,
    setTimeout(_callback, delay) {
      timeoutDelays.push(delay);
      return timeoutDelays.length;
    },
  });

  return {
    addedRequests,
    deletedCaches,
    fetchCalls,
    openedCaches,
    timeoutDelays,
    get claimCalls() {
      return claimCalls;
    },
    get clearTimeoutCalls() {
      return clearTimeoutCalls;
    },
    get skipWaitingCalls() {
      return skipWaitingCalls;
    },
    dispatchFetch(request) {
      let responsePromise;
      listeners.get('fetch')({
        request,
        respondWith(value) {
          responsePromise = Promise.resolve(value);
        },
      });
      return { responded: Boolean(responsePromise), responsePromise };
    },
    dispatchLifecycle(type) {
      let lifetimePromise;
      listeners.get(type)({
        waitUntil(value) {
          lifetimePromise = Promise.resolve(value);
        },
      });
      assert.ok(lifetimePromise, `${type} should register lifetime work`);
      return lifetimePromise;
    },
  };
}

function listRelativeFiles(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(path.relative(directory, absolute).split(path.sep).join('/'));
    }
  };
  visit(directory);
  return files.sort();
}

test('desktop shell uses packaged vendor assets and the compatibility launcher routes deterministically', () => {
  const desktop = readProjectFile('index.html');
  const launcher = readProjectFile('NexPlay.html');
  const notFound = readProjectFile('404.html');
  const packageMetadata = JSON.parse(readProjectFile('package.json'));
  assert.doesNotMatch(desktop, /node_modules[\\/]/i);
  assert.match(desktop, /\.\/vendor\/fonts\/outfit\/300\.css/);
  assert.match(desktop, /\.\/vendor\/lucide\/lucide\.min\.js/);
  assert.match(desktop, /\.\/vendor\/chart\/chart\.umd\.min\.js/);
  assert.doesNotMatch(launcher, /http-equiv=["']refresh["']/i);
  assert.match(launcher, /NexPlay\.mobile\.html/);
  assert.match(launcher, /['"]\/index\.html['"]/);
  assert.match(launcher, /['"]\/NexPlay\.mobile\.html['"]/);
  assert.match(launcher, /destination\.search = window\.location\.search/);
  assert.match(launcher, /destination\.hash = window\.location\.hash/);
  assert.match(launcher, /&middot;/);
  assert.doesNotMatch(launcher, /[ÂÃ]|�/);
  assert.match(notFound, /http-equiv="refresh" content="0; url=\/NexPlay\.html"/);
  assert.match(notFound, /href="\/assets\/NexPlay_N_final_256\.ico"/);
  assert.match(notFound, /href="\/NexPlay\.html"/);
  assert.match(notFound, /destination\.search = window\.location\.search/);
  assert.match(notFound, /destination\.hash = window\.location\.hash/);
  assert.ok(packageMetadata.build.files.includes('vendor/**/*'));

  assert.equal(
    runLauncher(),
    'https://nexplay.example/index.html?source=test#queue'
  );
  assert.equal(
    runLauncher({ coarsePointer: true, narrowScreen: true }),
    'https://nexplay.example/NexPlay.mobile.html?source=test#queue'
  );
  assert.equal(
    runLauncher({ platform: 'MacIntel', maxTouchPoints: 5 }),
    'https://nexplay.example/NexPlay.mobile.html?source=test#queue'
  );
  assert.equal(
    runLauncher({
      href: 'https://nexplay.example/deep/missing/NexPlay.html?source=nested#online-music',
    }),
    'https://nexplay.example/index.html?source=nested#online-music'
  );
  assert.equal(
    runLauncher({
      href: 'https://nexplay.example/deep/missing/NexPlay.html?source=nested#online-music',
      coarsePointer: true,
      narrowScreen: true,
    }),
    'https://nexplay.example/NexPlay.mobile.html?source=nested#online-music'
  );
  assert.equal(
    runNotFoundRouter('https://nexplay.example/deep/missing/song?source=404#queue'),
    'https://nexplay.example/NexPlay.html?source=404#queue'
  );
});

test('mobile shell ships fully local assets and web staging produces a verifiable manifest', () => {
  const canonicalDesktopPath = path.join(projectRoot, 'index.html');
  const canonicalDesktopBefore = fs.readFileSync(canonicalDesktopPath, 'utf8');
  const canonicalMobilePath = path.join(projectRoot, 'NexPlay.mobile.html');
  const canonicalBefore = fs.readFileSync(canonicalMobilePath, 'utf8');
  const canonicalWorkerPath = path.join(projectRoot, 'sw.js');
  const canonicalWorkerBefore = fs.readFileSync(canonicalWorkerPath, 'utf8');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexplay-web-publish-'));
  const outDir = path.join(tempRoot, 'site');
  try {
    const lfDesktopOutDir = path.join(tempRoot, 'lf-desktop');
    fs.mkdirSync(lfDesktopOutDir, { recursive: true });
    fs.writeFileSync(
      path.join(lfDesktopOutDir, 'index.html'),
      canonicalDesktopBefore.replace(/\r\n/g, '\n'),
      'utf8'
    );
    rewriteStagedDesktopWeb(lfDesktopOutDir);
    const rewrittenLfDesktop = fs.readFileSync(path.join(lfDesktopOutDir, 'index.html'), 'utf8');
    assert.doesNotMatch(rewrittenLfDesktop, /\r\n/);
    assert.match(rewrittenLfDesktop, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
    assert.match(rewrittenLfDesktop, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);

    const result = buildWebSite({ outDir, quiet: true });
    const verification = verifyWebBuild({ outDir, quiet: true });
    assert.equal(result.outDir, outDir);
    assert.ok(verification.fileCount > 100);
    assert.equal(fs.readFileSync(canonicalDesktopPath, 'utf8'), canonicalDesktopBefore);
    assert.equal(fs.readFileSync(canonicalMobilePath, 'utf8'), canonicalBefore);
    assert.equal(fs.readFileSync(canonicalWorkerPath, 'utf8'), canonicalWorkerBefore);

    const stagedMobile = fs.readFileSync(path.join(outDir, 'NexPlay.mobile.html'), 'utf8');
    assert.doesNotMatch(stagedMobile, /fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdn\.jsdelivr\.net/);
    assert.match(stagedMobile, /\.\/vendor\/fonts\/space-mono\/700\.css/);
    assert.match(stagedMobile, /\.\/vendor\/lucide\/lucide\.min\.js/);
    assert.match(stagedMobile, /\.\/vendor\/chart\/chart\.umd\.min\.js/);

    const stagedDesktop = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
    assert.match(stagedDesktop, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
    const registrationScript = stagedDesktop.match(/<script data-nexplay-web-worker>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(registrationScript, 'staged desktop shell should contain its worker registration');
    let loadListener = null;
    const registrationCalls = [];
    vm.runInNewContext(registrationScript, {
      console: { warn() {} },
      navigator: {
        serviceWorker: {
          register(url) {
            registrationCalls.push(url);
            return Promise.resolve({});
          },
        },
      },
      window: {
        addEventListener(type, listener, options) {
          assert.equal(type, 'load');
          assert.equal(options?.once, true);
          loadListener = listener;
        },
      },
    });
    assert.equal(registrationCalls.length, 0, 'registration should wait for the page load event');
    assert.equal(typeof loadListener, 'function');
    loadListener();
    assert.deepEqual(registrationCalls, ['./sw.js']);

    const stagedWorkerPath = path.join(outDir, 'sw.js');
    const stagedWorker = fs.readFileSync(stagedWorkerPath, 'utf8');
    assert.notEqual(stagedWorker, canonicalWorkerBefore);
    assert.doesNotMatch(stagedWorker, /__NEXPLAY_(?:CACHE_VERSION|CRITICAL_ASSETS)__/);

    fs.writeFileSync(
      stagedWorkerPath,
      stagedWorker.replace('"./index.html"', '"./missing-critical-shell.html"'),
      'utf8'
    );
    assert.throws(
      () => verifyWebBuild({ outDir, quiet: true }),
      /sw\.js references missing asset: \.\/missing-critical-shell\.html/
    );
    fs.writeFileSync(stagedWorkerPath, stagedWorker, 'utf8');

    fs.appendFileSync(path.join(outDir, '404.html'), '\n<!-- checksum test -->\n', 'utf8');
    assert.throws(
      () => verifyWebBuild({ outDir, quiet: true }),
      /Manifest checksum mismatch: 404\.html/
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('staged web worker atomically installs a complete bounded same-origin shell', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexplay-web-worker-'));
  const outDir = path.join(tempRoot, 'site');
  try {
    buildWebSite({ outDir, quiet: true });
    const workerSource = fs.readFileSync(path.join(outDir, 'sw.js'), 'utf8');
    const criticalRootFiles = new Set([
      '404.html',
      'index.html',
      'manifest.iphone.webmanifest',
      'manifest.webmanifest',
      'NexPlay.html',
      'NexPlay.mobile.html',
      'nexplay-icon-brand.png',
    ]);
    const expectedFiles = listRelativeFiles(outDir).filter((relative) => {
      const extension = path.extname(relative).toLowerCase();
      if (criticalRootFiles.has(relative)) return true;
      if (relative.startsWith('assets/')) {
        return ['.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp'].includes(extension);
      }
      if (relative.startsWith('components/')) return extension === '.html';
      if (relative.startsWith('css/')) return extension === '.css';
      if (relative.startsWith('js/')) return extension === '.js';
      if (relative.startsWith('nexplay-next/')) return ['.cjs', '.js', '.mjs'].includes(extension);
      if (relative.startsWith('vendor/')) {
        return ['.css', '.js', '.woff', '.woff2'].includes(extension);
      }
      return false;
    });
    const expectedUrls = new Set([
      'https://nexplay.example/app/',
      ...expectedFiles.map((relative) => `https://nexplay.example/app/${relative}`),
    ]);

    assert.match(workerSource, /const CACHE_NAMESPACE = 'nexplay-web-'/);
    assert.match(workerSource, /const NAVIGATION_TIMEOUT_MS = 4500/);
    assert.match(workerSource, /headers\.has\('range'\)/);
    assert.match(workerSource, /googlevideo\.com/);

    const install = createServiceWorkerHarness(workerSource);
    await install.dispatchLifecycle('install');
    assert.equal(install.skipWaitingCalls, 1);
    assert.equal(install.openedCaches.length, 1);
    assert.match(install.openedCaches[0], /^nexplay-web-shell-[a-f0-9]{16}$/);
    assert.equal(install.addedRequests.length, expectedUrls.size);
    assert.deepEqual(new Set(install.addedRequests.map((request) => request.url)), expectedUrls);
    assert.ok(install.addedRequests.every((request) => (
      request.cache === 'reload' && request.credentials === 'same-origin'
    )));
    assert.ok(expectedUrls.has('https://nexplay.example/app/vendor/lucide/lucide.min.js'));
    assert.ok(expectedUrls.has('https://nexplay.example/app/vendor/chart/chart.umd.min.js'));
    assert.ok(expectedUrls.has('https://nexplay.example/app/nexplay-next/legacy-online-music-helpers.cjs'));
    assert.ok(expectedUrls.has('https://nexplay.example/app/nexplay-next/audio-queue-engine.cjs'));
    assert.ok(expectedUrls.has('https://nexplay.example/app/vendor/fonts/outfit/300.css'));
    assert.ok(expectedUrls.has('https://nexplay.example/app/vendor/fonts/outfit/files/outfit-latin-300-normal.woff2'));
    assert.ok(expectedUrls.has('https://nexplay.example/app/vendor/fonts/space-mono/files/space-mono-latin-700-normal.woff2'));

    const installFailure = createServiceWorkerHarness(workerSource, {
      addAllError: new Error('critical precache failed'),
    });
    await assert.rejects(
      installFailure.dispatchLifecycle('install'),
      /critical precache failed/
    );
    assert.equal(installFailure.skipWaitingCalls, 0);
    assert.deepEqual(installFailure.deletedCaches, [installFailure.openedCaches[0]]);

    const currentCache = install.openedCaches[0];
    const activation = createServiceWorkerHarness(workerSource, {
      cacheKeys: [
        currentCache,
        'nexplay-web-shell-retired',
        'nexplay-web-runtime-retired',
        'nexplay-shell-v10',
        'another-app-cache',
      ],
    });
    await activation.dispatchLifecycle('activate');
    assert.deepEqual(
      activation.deletedCaches.sort(),
      ['nexplay-shell-v10', 'nexplay-web-runtime-retired', 'nexplay-web-shell-retired']
    );
    assert.equal(activation.claimCalls, 1);

    const offlineLauncher = { source: 'precache', path: 'NexPlay.html' };
    const navigation = createServiceWorkerHarness(workerSource, {
      async fetchImpl() {
        throw new Error('offline');
      },
      matchCache(request) {
        const url = typeof request === 'string' ? request : request.url;
        return url.endsWith('/NexPlay.html') ? offlineLauncher : null;
      },
    });
    const navigationResult = navigation.dispatchFetch(createRequest(
      'https://nexplay.example/app/library?from=test',
      { mode: 'navigate', destination: 'document' }
    ));
    assert.equal(navigationResult.responded, true);
    assert.equal(await navigationResult.responsePromise, offlineLauncher);
    assert.deepEqual(navigation.timeoutDelays, [4500]);
    assert.equal(navigation.clearTimeoutCalls, 1);

    const maintenanceFallback = { source: 'precache', path: 'NexPlay.html', reason: 'server-503' };
    const maintenance = createServiceWorkerHarness(workerSource, {
      async fetchImpl() {
        return { ok: false, status: 503 };
      },
      matchCache(request) {
        const url = typeof request === 'string' ? request : request.url;
        return url.endsWith('/NexPlay.html') ? maintenanceFallback : null;
      },
    });
    const maintenanceResult = maintenance.dispatchFetch(createRequest(
      'https://nexplay.example/app/library?from=maintenance',
      { mode: 'navigate', destination: 'document' }
    ));
    assert.equal(maintenanceResult.responded, true);
    assert.equal(await maintenanceResult.responsePromise, maintenanceFallback);

    const realNotFound = { ok: false, status: 404, source: 'network' };
    const notFoundNavigation = createServiceWorkerHarness(workerSource, {
      async fetchImpl() {
        return realNotFound;
      },
      matchCache() {
        throw new Error('a real 4xx navigation must not be replaced by the cached shell');
      },
    });
    const notFoundResult = notFoundNavigation.dispatchFetch(createRequest(
      'https://nexplay.example/app/real-404',
      { mode: 'navigate', destination: 'document' }
    ));
    assert.equal(await notFoundResult.responsePromise, realNotFound);

    const bypass = createServiceWorkerHarness(workerSource);
    assert.equal(bypass.dispatchFetch(createRequest(
      'https://www.youtube.com/watch?v=test',
      { mode: 'navigate', destination: 'document' }
    )).responded, false);
    assert.equal(bypass.dispatchFetch(createRequest(
      'https://nexplay.example/app/audio/song.mp3',
      { destination: 'audio' }
    )).responded, false);
    assert.equal(bypass.dispatchFetch(createRequest(
      'https://nexplay.example/app/audio/chunk',
      { headers: { Range: 'bytes=0-1023' } }
    )).responded, false);
    assert.equal(bypass.dispatchFetch(createRequest(
      'https://nexplay.example/app/unbounded-runtime-data.json'
    )).responded, false);
    assert.equal(bypass.fetchCalls.length, 0);

    const cachedLucide = { source: 'precache', path: 'lucide' };
    const criticalAsset = createServiceWorkerHarness(workerSource, {
      matchCache(request) {
        const url = typeof request === 'string' ? request : request.url;
        return url.endsWith('/vendor/lucide/lucide.min.js') ? cachedLucide : null;
      },
    });
    const criticalResult = criticalAsset.dispatchFetch(createRequest(
      'https://nexplay.example/app/vendor/lucide/lucide.min.js',
      { destination: 'script' }
    ));
    assert.equal(criticalResult.responded, true);
    assert.equal(await criticalResult.responsePromise, cachedLucide);
    assert.equal(criticalAsset.fetchCalls.length, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('Netlify publishes the verified web staging output through the compatibility launcher', () => {
  const config = readProjectFile('netlify.toml');
  assert.match(config, /command\s*=\s*"npm run build:web-site"/);
  assert.match(config, /publish\s*=\s*"output\/nexplay-web-site"/);
  assert.match(config, /from\s*=\s*"\/"[\s\S]*?to\s*=\s*"\/NexPlay\.html"[\s\S]*?status\s*=\s*200/);
});
