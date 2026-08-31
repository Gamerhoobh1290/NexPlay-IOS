// @ts-nocheck -- This test evaluates the CommonJS Electron entrypoint in a dynamic VM sandbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const electronMainUrl = new URL('../electron-main.cjs', import.meta.url);
const electronMainPath = fileURLToPath(electronMainUrl);
const electronMainDir = path.dirname(electronMainPath);
const electronMainSource = fs.readFileSync(electronMainUrl, 'utf8');
const requireFromElectronMain = createRequire(electronMainUrl);

function loadElectronMain({
  hasSingleInstanceLock = true,
  windows = [],
  fetchImpl = globalThis.fetch,
  userDataPath = electronMainDir,
  sessionMock = null,
  appVersion = 'test',
  packageMetadata = { build: { buildVersion: 'test-build' } }
} = {}) {
  const appEvents = new Map();
  const calls = {
    lockRequests: 0,
    quit: 0,
    whenReady: 0
  };
  const app = {
    isPackaged: false,
    requestSingleInstanceLock() {
      calls.lockRequests += 1;
      return hasSingleInstanceLock;
    },
    quit() {
      calls.quit += 1;
    },
    on(eventName, handler) {
      appEvents.set(eventName, handler);
    },
    whenReady() {
      calls.whenReady += 1;
      return { then() {} };
    },
    getVersion() {
      return appVersion;
    },
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    }
  };

  class BrowserWindowMock {
    static getAllWindows() {
      return windows;
    }
  }

  const electronMock = {
    app,
    BrowserWindow: BrowserWindowMock,
    dialog: {},
    ipcMain: { handle() {} },
    session: { defaultSession: sessionMock || {} }
  };
  const moduleRecord = { exports: {} };
  const sandbox = {
    module: moduleRecord,
    exports: moduleRecord.exports,
    require(specifier) {
      if (specifier === './package.json') return packageMetadata;
      return specifier === 'electron' ? electronMock : requireFromElectronMain(specifier);
    },
    __dirname: electronMainDir,
    __filename: electronMainPath,
    process,
    Buffer,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    AbortController,
    fetch: fetchImpl
  };
  const instrumentedSource = `${electronMainSource}\nmodule.exports.__hardeningTestApi = { MIME_TYPES, getDesktopSecurityHeaders, requestHandler, resolveRequestToFile, isWithinRoot, focusExistingWindow, fetchApprovedRemoteJson, migrateDesktopShellCache };`;
  vm.runInNewContext(instrumentedSource, sandbox, { filename: electronMainPath });

  return {
    api: moduleRecord.exports.__hardeningTestApi,
    appEvents,
    calls
  };
}

function invokeRequest(requestHandler, url) {
  const response = {
    statusCode: null,
    headers: null,
    body: '',
    ended: false,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body += String(body || '');
      this.ended = true;
    }
  };
  requestHandler({ method: 'GET', url, headers: {} }, response);
  return response;
}

test('local HTTP routes return 400 for malformed percent encoding', () => {
  const { api } = loadElectronMain();
  const malformedUrls = [
    '/%',
    '/__nexplay_media__?path=%25',
    '/__nexplay_online_stream__/%'
  ];

  for (const url of malformedUrls) {
    const response = invokeRequest(api.requestHandler, url);
    assert.equal(response.statusCode, 400, url);
    assert.equal(response.body, 'Bad Request', url);
    assert.equal(response.ended, true, url);
  }
});

test('static file resolution rejects a sibling path that shares the app root prefix', () => {
  const { api } = loadElectronMain();
  const siblingName = `${path.basename(electronMainDir)}-outside`;
  const traversalRequest = `/..%2F${encodeURIComponent(siblingName)}%2Fsecret.txt`;

  assert.equal(api.resolveRequestToFile(traversalRequest), null);
  assert.equal(api.isWithinRoot(path.join(electronMainDir, 'index.html'), electronMainDir), true);
  assert.equal(api.isWithinRoot(path.join(path.dirname(electronMainDir), siblingName, 'secret.txt'), electronMainDir), false);
});

test('desktop server serves browser-loaded CommonJS helpers as JavaScript', () => {
  const { api } = loadElectronMain();

  assert.equal(api.MIME_TYPES['.cjs'], 'application/javascript; charset=utf-8');
});

test('desktop HTML preserves an origin referrer for YouTube iframe client identity', () => {
  const { api } = loadElectronMain();
  const headers = api.getDesktopSecurityHeaders(path.join(electronMainDir, 'index.html'));
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.notEqual(headers['Referrer-Policy'], 'no-referrer');
});

test('desktop shell cache migration is release-and-schema-gated and never clears the global HTTP cache', async () => {
  const userDataPath = fs.mkdtempSync(path.join(electronMainDir, '.cache-migration-test-'));
  const calls = { clearStorageData: 0, clearCache: 0 };
  const sessionMock = {
    async clearStorageData(options) {
      calls.clearStorageData += 1;
      assert.equal(options.origin, 'http://localhost:5000');
      assert.deepEqual(Array.from(options.storages), ['serviceworkers', 'cachestorage']);
    },
    async clearCache() {
      calls.clearCache += 1;
    }
  };

  try {
    const { api } = loadElectronMain({
      userDataPath,
      sessionMock,
      appVersion: '2.1.0',
      packageMetadata: { build: { buildVersion: '2.1.0.1' } }
    });
    assert.equal(await api.migrateDesktopShellCache(5000), true);
    assert.equal(await api.migrateDesktopShellCache(5000), false);
    const nextBuild = loadElectronMain({
      userDataPath,
      sessionMock,
      appVersion: '2.1.0',
      packageMetadata: { build: { buildVersion: '2.1.0.2' } }
    });
    assert.equal(await nextBuild.api.migrateDesktopShellCache(5000), true);
    assert.equal(await nextBuild.api.migrateDesktopShellCache(5000), false);
    assert.deepEqual(calls, { clearStorageData: 2, clearCache: 0 });
  } finally {
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});

test('second-instance event restores, shows, and focuses the existing window', () => {
  const windowCalls = { restore: 0, show: 0, focus: 0 };
  const existingWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    isVisible: () => false,
    restore: () => { windowCalls.restore += 1; },
    show: () => { windowCalls.show += 1; },
    focus: () => { windowCalls.focus += 1; }
  };
  const { appEvents, calls } = loadElectronMain({ windows: [existingWindow] });

  assert.equal(calls.lockRequests, 1);
  assert.equal(typeof appEvents.get('second-instance'), 'function');
  appEvents.get('second-instance')();
  assert.deepEqual(windowCalls, { restore: 1, show: 1, focus: 1 });
});

test('a process without the single-instance lock quits before scheduling startup', () => {
  const { appEvents, calls } = loadElectronMain({ hasSingleInstanceLock: false });

  assert.equal(calls.lockRequests, 1);
  assert.equal(calls.quit, 1);
  assert.equal(calls.whenReady, 0);
  assert.equal(appEvents.has('second-instance'), false);
});

test('metadata redirects are validated before any redirected request is sent', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      status: 302,
      ok: false,
      headers: new Headers({ location: 'https://example.com/private.json' })
    };
  };
  const { api } = loadElectronMain({ fetchImpl });

  await assert.rejects(
    api.fetchApprovedRemoteJson({ url: 'https://itunes.apple.com/search?term=test' }),
    /not approved/i
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, 'manual');
});

test('metadata redirects stay on the approved host list and are followed manually', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return {
        status: 302,
        ok: false,
        headers: new Headers({ location: 'https://api.deezer.com/search?q=test&output=jsonp&callback=bad' })
      };
    }
    return {
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"data":[]}'
    };
  };
  const { api } = loadElectronMain({ fetchImpl });

  const result = await api.fetchApprovedRemoteJson({ url: 'https://itunes.apple.com/search?term=test' });
  assert.equal(JSON.stringify(result), '{"data":[]}');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.redirect, 'manual');
  assert.equal(calls[1].url.includes('callback='), false);
  assert.equal(calls[1].url.includes('output='), false);
});
