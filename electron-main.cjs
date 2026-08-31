const { app, BrowserWindow, dialog, ipcMain, session } = require('electron');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { URL } = require('url');
const {
  classifyOnlineMusicSearchResultEligibility,
  isLikelyShortFormOnlineMusicResult,
  scoreOnlineMusicTrackCandidate
} = require('./nexplay-next/legacy-online-music-helpers.cjs');
const APP_PACKAGE_METADATA = require('./package.json');

const HOST = 'localhost';
const FIXED_PORT = 5000;
const APP_ROOT = __dirname;
const PRELOAD_PATH = path.join(APP_ROOT, 'nexplay-next', 'electron-preload.cjs');
const ONLINE_TRACK_DOWNLOAD_CHANNEL = 'nexplay:download-online-track';
const ONLINE_TRACK_DOWNLOAD_PROGRESS_CHANNEL = 'nexplay:online-track-download-progress';
const ONLINE_TRACK_RESOLVE_CHANNEL = 'nexplay:resolve-online-track-playback';
const ONLINE_AUDIO_STREAM_RESOLVE_CHANNEL = 'nexplay:resolve-online-audio-stream';
const ONLINE_MUSIC_SEARCH_CHANNEL = 'nexplay:search-youtube-music';
const ONLINE_RELEASE_DOWNLOAD_CHANNEL = 'nexplay:download-online-release';
const ONLINE_DOWNLOAD_CANCEL_CHANNEL = 'nexplay:cancel-online-download';
const ONLINE_DOWNLOAD_CLEAR_CHANNEL = 'nexplay:clear-online-download-queue';
const ONLINE_DOWNLOAD_QUEUE_CHANNEL = 'nexplay:online-download-queue-update';
const WATCH_FOLDERS_PICK_CHANNEL = 'nexplay:pick-watch-folders';
const WATCH_FOLDERS_START_CHANNEL = 'nexplay:start-library-watch';
const WATCH_FOLDERS_STOP_CHANNEL = 'nexplay:stop-library-watch';
const WATCH_FOLDERS_SCAN_CHANNEL = 'nexplay:scan-watch-folders';
const WATCH_FOLDERS_UPDATE_CHANNEL = 'nexplay:library-watch-update';
const LOCAL_MEDIA_PICK_CHANNEL = 'nexplay:pick-local-media-files';
const LOCAL_LIBRARY_SAVE_INDEX_CHANNEL = 'nexplay:save-local-library-index';
const LOCAL_LIBRARY_LOAD_INDEX_CHANNEL = 'nexplay:load-local-library-index';
const LOCAL_MEDIA_RESOLVE_PATHS_CHANNEL = 'nexplay:resolve-local-media-paths';
const REMOTE_JSON_FETCH_CHANNEL = 'nexplay:fetch-approved-remote-json';
const EXTERNAL_MEDIA_ROUTE = '/__nexplay_media__';
const ONLINE_AUDIO_STREAM_ROUTE = '/__nexplay_online_stream__';
const ONLINE_PLAYBACK_RESOLVE_TIMEOUT_MS = 6500;
const ONLINE_PLAYBACK_TOTAL_TIMEOUT_MS = 15000;
const ONLINE_PLAYBACK_SEARCH_LIMIT = 8;
const ONLINE_PLAYBACK_PRIMARY_SEARCH_TIMEOUT_MS = 2400;
const ONLINE_PLAYBACK_EARLY_ACCEPT_SCORE = 610;
const ONLINE_PLAYBACK_RESOLUTION_CACHE_TTL_MS = 5 * 60 * 1000;
const ONLINE_PLAYBACK_RESOLUTION_CACHE_MAX_ENTRIES = 96;
const ONLINE_AUDIO_STREAM_RESOLVE_TIMEOUT_MS = 9000;
const ONLINE_AUDIO_STREAM_TOKEN_TTL_MS = 90 * 60 * 1000;
const ONLINE_MUSIC_SEARCH_TIMEOUT_MS = 9000;
const YT_DLP_FAST_NETWORK_ARGS = ['--socket-timeout', '6', '--extractor-retries', '1', '--fragment-retries', '1'];
const LOCAL_LIBRARY_INDEX_FILE = 'nexplay-local-library-index.json';
const DESKTOP_SHELL_CACHE_MARKER_FILE = 'nexplay-desktop-shell-cache.json';
const DESKTOP_SHELL_CACHE_SCHEMA_VERSION = 2;
const REMOTE_JSON_MAX_BYTES = 2 * 1024 * 1024;
const REMOTE_JSON_MAX_REDIRECTS = 4;
const APPROVED_REMOTE_JSON_HOSTS = new Set([
  'itunes.apple.com',
  'api.deezer.com',
  'suggestqueries.google.com'
]);
const hasSingleInstanceLock = app.requestSingleInstanceLock();

let localServer = null;
let localPort = null;
let lastOnlineTrackDownloadDir = '';
let onlineTrackDownloadChain = Promise.resolve();
let activeOnlineDownloadChild = null;
let onlineDownloadJobs = [];
let onlineDownloadJobSeq = 0;
let onlineDownloadActiveJobId = '';
let watchRoots = [];
let watchDisposers = [];
let watchScanTimer = null;
let electronNodeWrapperPath = '';
const allowedExternalMediaPaths = new Set();
const onlineAudioStreamTokens = new Map();
const onlinePlaybackResolutionCache = new Map();
const onlinePlaybackResolutionInFlight = new Map();
const activeOnlineMusicSearchBySender = new Map();
let localLibraryIndexSaveChain = Promise.resolve();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.opus': 'audio/ogg',
  '.alac': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg'
};

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

class MalformedRequestEncodingError extends Error {
  constructor() {
    super('Malformed URL encoding.');
    this.name = 'MalformedRequestEncodingError';
  }
}

function decodeRequestComponent(value = '') {
  try {
    return decodeURIComponent(String(value ?? ''));
  } catch (_) {
    throw new MalformedRequestEncodingError();
  }
}

function writeBadRequest(res) {
  res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Bad Request');
}

function resolveRequestToFile(requestUrl = '/') {
  let pathname = '/';
  try {
    pathname = new URL(requestUrl, `http://${HOST}`).pathname || '/';
  } catch (_) {
    pathname = '/';
  }
  let safePath = decodeRequestComponent(pathname);
  if (safePath === '/') safePath = '/index.html';
  safePath = safePath.replace(/^\/+/, '');
  const candidate = path.resolve(APP_ROOT, safePath);
  const root = path.resolve(APP_ROOT);
  if (!isWithinRoot(candidate, root)) return null;
  return candidate;
}

function parseByteRange(rangeHeader = '', size = 0) {
  const raw = String(rangeHeader || '').trim();
  if (!raw || !Number.isFinite(size) || size < 0) return null;
  const match = raw.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, startText, endText] = match;
  if (!startText && !endText) return null;
  if (size === 0) return null;

  let start = startText ? Number(startText) : NaN;
  let end = endText ? Number(endText) : NaN;

  if (!Number.isFinite(start)) {
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    if (!Number.isFinite(end)) end = size - 1;
    end = Math.min(end, size - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
    return null;
  }
  return { start, end, length: end - start + 1 };
}

function getDesktopSecurityHeaders(filePath = '') {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    // YouTube iframe clients require an HTTP Referer (or equivalent client
    // identity). Send only NexPlay's local origin on cross-origin requests.
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
  if (path.extname(String(filePath || '')).toLowerCase() === '.html') {
    headers['Content-Security-Policy'] = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.youtube.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob: https:",
      "connect-src 'self' https:",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.dailymotion.com https://geo.dailymotion.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; ');
  }
  return headers;
}

function serveFile(req, res, filePath, stat) {
  const size = Number(stat?.size || 0);
  const rangeHeader = req.headers.range;
  const baseHeaders = {
    'Content-Type': getContentType(filePath),
    'Cache-Control': 'no-cache',
    'Accept-Ranges': 'bytes',
    ...getDesktopSecurityHeaders(filePath)
  };
  const range = rangeHeader ? parseByteRange(rangeHeader, size) : null;

  if (rangeHeader && !range) {
    res.writeHead(416, {
      ...baseHeaders,
      'Content-Range': `bytes */${Math.max(0, size)}`
    });
    res.end();
    return;
  }

  const statusCode = range ? 206 : 200;
  const headers = range
    ? {
        ...baseHeaders,
        'Content-Length': String(range.length),
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`
      }
    : {
        ...baseHeaders,
        'Content-Length': String(Math.max(0, size))
      };

  res.writeHead(statusCode, headers);
  if (req.method === 'HEAD' || size === 0) {
    res.end();
    return;
  }

  const stream = range
    ? fs.createReadStream(filePath, { start: range.start, end: range.end })
    : fs.createReadStream(filePath);
  stream.once('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
      return;
    }
    res.destroy();
  });
  stream.pipe(res);
}

function cleanupOnlineAudioStreamTokens() {
  const now = Date.now();
  for (const [token, record] of onlineAudioStreamTokens.entries()) {
    if (!record || Number(record.expiresAt || 0) <= now) {
      onlineAudioStreamTokens.delete(token);
    }
  }
}

function createOnlineAudioStreamToken(record = {}) {
  cleanupOnlineAudioStreamTokens();
  const token = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(18).toString('hex');
  onlineAudioStreamTokens.set(token, {
    url: String(record.url || '').trim(),
    headers: record.headers && typeof record.headers === 'object' ? { ...record.headers } : {},
    title: String(record.title || '').trim(),
    videoId: String(record.videoId || '').trim(),
    contentType: String(record.contentType || '').trim(),
    createdAt: Date.now(),
    expiresAt: Date.now() + ONLINE_AUDIO_STREAM_TOKEN_TTL_MS
  });
  return token;
}

function getOnlineAudioStreamUrl(token = '') {
  const safeToken = String(token || '').trim();
  return safeToken ? `http://${HOST}:${localPort || FIXED_PORT}${ONLINE_AUDIO_STREAM_ROUTE}/${encodeURIComponent(safeToken)}` : '';
}

function resolveOnlineAudioStreamRecord(token = '') {
  cleanupOnlineAudioStreamTokens();
  const safeToken = String(token || '').trim();
  if (!safeToken) return null;
  const record = onlineAudioStreamTokens.get(safeToken) || null;
  if (!record?.url || Number(record.expiresAt || 0) <= Date.now()) {
    onlineAudioStreamTokens.delete(safeToken);
    return null;
  }
  return record;
}

function buildOnlineAudioProxyHeaders(record = {}, req = {}) {
  const headers = {};
  const sourceHeaders = record.headers && typeof record.headers === 'object' ? record.headers : {};
  for (const [key, value] of Object.entries(sourceHeaders)) {
    const name = String(key || '').trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (['host', 'connection', 'content-length', 'accept-encoding', 'range'].includes(lower)) continue;
    if (value === undefined || value === null || value === '') continue;
    headers[name] = String(value);
  }
  headers['User-Agent'] = headers['User-Agent']
    || headers['user-agent']
    || 'Mozilla/5.0 NexPlay/1.0';
  headers.Accept = headers.Accept || '*/*';
  const range = String(req?.headers?.range || '').trim();
  if (range) headers.Range = range;
  return headers;
}

function writeOnlineAudioProxyError(res, statusCode, message) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(message);
}

function pipeOnlineAudioStream(req, res, token, redirectCount = 0) {
  const record = resolveOnlineAudioStreamRecord(token);
  if (!record) {
    writeOnlineAudioProxyError(res, 404, 'Online audio stream expired.');
    return;
  }

  let targetUrl = null;
  try {
    targetUrl = new URL(record.url);
  } catch (_) {
    writeOnlineAudioProxyError(res, 502, 'Online audio stream URL was invalid.');
    return;
  }

  const client = targetUrl.protocol === 'https:' ? https : (targetUrl.protocol === 'http:' ? http : null);
  if (!client) {
    writeOnlineAudioProxyError(res, 502, 'Online audio stream protocol was unsupported.');
    return;
  }

  const upstream = client.request(targetUrl, {
    method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: buildOnlineAudioProxyHeaders(record, req)
  }, (upstreamRes) => {
    const statusCode = Number(upstreamRes.statusCode || 0) || 502;
    const location = upstreamRes.headers.location;
    if ([301, 302, 303, 307, 308].includes(statusCode) && location && redirectCount < 4) {
      upstreamRes.resume();
      try {
        const nextUrl = new URL(location, targetUrl);
        record.url = nextUrl.toString();
        pipeOnlineAudioStream(req, res, token, redirectCount + 1);
      } catch (_) {
        writeOnlineAudioProxyError(res, 502, 'Online audio stream redirect was invalid.');
      }
      return;
    }

    const headers = {
      'Content-Type': String(upstreamRes.headers['content-type'] || record.contentType || 'audio/mp4'),
      'Cache-Control': 'no-store',
      'Accept-Ranges': String(upstreamRes.headers['accept-ranges'] || 'bytes')
    };
    for (const key of ['content-length', 'content-range']) {
      if (upstreamRes.headers[key]) headers[key.replace(/(^|-)([a-z])/g, (_, prefix, char) => `${prefix}${char.toUpperCase()}`)] = String(upstreamRes.headers[key]);
    }
    res.writeHead(statusCode, headers);
    if (req.method === 'HEAD') {
      upstreamRes.resume();
      res.end();
      return;
    }
    upstreamRes.pipe(res);
  });

  upstream.setTimeout(30000, () => {
    upstream.destroy(new Error('Online audio stream timed out.'));
  });
  upstream.once('error', () => {
    writeOnlineAudioProxyError(res, 502, 'Online audio stream could not be reached.');
  });
  req.once('close', () => {
    try { upstream.destroy(); } catch (_) {}
  });
  upstream.end();
}

function requestHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }
  let pathname = '/';
  let requestUrl = null;
  try {
    requestUrl = new URL(req.url || '/', `http://${HOST}`);
    pathname = requestUrl.pathname || '/';
  } catch (_) {
    requestUrl = null;
    pathname = '/';
  }
  if (pathname === EXTERNAL_MEDIA_ROUTE && requestUrl) {
    let requestedPath = '';
    try {
      requestedPath = decodeRequestComponent(requestUrl.searchParams.get('path') || '');
    } catch (error) {
      if (!(error instanceof MalformedRequestEncodingError)) throw error;
      writeBadRequest(res);
      return;
    }
    if (!requestedPath || !isAllowedExternalMediaPath(requestedPath)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    fs.stat(requestedPath, (statErr, stat) => {
      if (statErr || !stat || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      serveFile(req, res, requestedPath, stat);
    });
    return;
  }
  if (pathname.startsWith(`${ONLINE_AUDIO_STREAM_ROUTE}/`)) {
    let token = '';
    try {
      token = decodeRequestComponent(pathname.slice(ONLINE_AUDIO_STREAM_ROUTE.length + 1));
    } catch (error) {
      if (!(error instanceof MalformedRequestEncodingError)) throw error;
      writeBadRequest(res);
      return;
    }
    pipeOnlineAudioStream(req, res, token);
    return;
  }
  let filePath = null;
  try {
    filePath = resolveRequestToFile(req.url || '/');
  } catch (error) {
    if (!(error instanceof MalformedRequestEncodingError)) throw error;
    writeBadRequest(res);
    return;
  }
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    serveFile(req, res, filePath, stat);
  });
}

function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(requestHandler);
    server.once('error', (err) => {
      try { server.close(); } catch (_) {}
      reject(err);
    });
    server.listen(port, HOST, () => resolve(server));
  });
}

async function startLocalServer() {
  if (localServer && localPort === FIXED_PORT) return localPort;
  try {
    const server = await listenOnPort(FIXED_PORT);
    localServer = server;
    localPort = FIXED_PORT;
    return localPort;
  } catch (err) {
    if (err?.code === 'EADDRINUSE') {
      throw new Error(`NexPlay could not start because http://${HOST}:${FIXED_PORT}/ is already in use.`);
    }
    throw err;
  }
}

function stopLocalServer() {
  if (!localServer) return;
  try {
    localServer.close();
  } catch (_) {}
  localServer = null;
  localPort = null;
}

async function migrateDesktopShellCache(port) {
  const origin = `http://${HOST}:${port}`;
  const markerPath = path.join(app.getPath('userData'), DESKTOP_SHELL_CACHE_MARKER_FILE);
  const targetVersion = String(app.getVersion() || 'unknown');
  const targetBuildVersion = String(APP_PACKAGE_METADATA?.build?.buildVersion || '');
  try {
    const marker = JSON.parse(await fs.promises.readFile(markerPath, 'utf8'));
    if (marker?.version === targetVersion
      && marker?.buildVersion === targetBuildVersion
      && Number(marker?.schemaVersion || 0) === DESKTOP_SHELL_CACHE_SCHEMA_VERSION
      && marker?.origin === origin) {
      return false;
    }
  } catch (_) {}

  try {
    await session.defaultSession.clearStorageData({
      origin,
      storages: ['serviceworkers', 'cachestorage']
    });
  } catch (error) {
    console.warn('[NexPlay] Failed to migrate the desktop shell cache', error);
    return false;
  }

  try {
    await fs.promises.writeFile(markerPath, JSON.stringify({
      version: targetVersion,
      buildVersion: targetBuildVersion,
      schemaVersion: DESKTOP_SHELL_CACHE_SCHEMA_VERSION,
      origin,
      migratedAt: new Date().toISOString()
    }), 'utf8');
  } catch (error) {
    console.warn('[NexPlay] Failed to save the desktop shell cache marker', error);
  }
  return true;
}

function resolveCommandPath(command) {
  if (!command) return null;
  if (path.isAbsolute(command)) {
    return fs.existsSync(command) ? command : null;
  }
  const probe = process.platform === 'win32'
    ? spawnSync('where.exe', [command], {
      encoding: 'utf8',
      windowsHide: true,
      cwd: getChildProcessWorkingDirectory(),
      env: buildSpawnEnv()
    })
    : spawnSync('which', [command], {
      encoding: 'utf8',
      windowsHide: true,
      cwd: getChildProcessWorkingDirectory(),
      env: buildSpawnEnv()
    });
  if (probe.status !== 0 || !probe.stdout) return null;
  return probe.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
}

function resolveExistingPath(candidates = []) {
  for (const candidate of candidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim() : '';
    if (!normalized) continue;
    const resolved = resolveCommandPath(normalized);
    if (resolved) return resolved;
  }
  return null;
}

function resolveExistingPaths(candidates = []) {
  const seen = new Set();
  const resolvedPaths = [];
  for (const candidate of candidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim() : '';
    if (!normalized) continue;
    const resolved = resolveCommandPath(normalized);
    if (!resolved) continue;
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    resolvedPaths.push(resolved);
  }
  return resolvedPaths;
}

function sanitizeFileSegment(value = '', fallback = 'Track') {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function sanitizePlainText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniquePlainText(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    const clean = sanitizePlainText(value);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function getChildProcessWorkingDirectory() {
  const candidates = [
    (app && app.isPackaged) ? path.dirname(process.execPath) : '',
    process.cwd(),
    APP_ROOT,
    os.tmpdir()
  ];
  for (const candidate of candidates) {
    const safeCandidate = typeof candidate === 'string' ? candidate.trim() : '';
    if (!safeCandidate) continue;
    try {
      if (fs.existsSync(safeCandidate) && fs.statSync(safeCandidate).isDirectory()) {
        return safeCandidate;
      }
    } catch (_) {}
  }
  return os.tmpdir();
}

function isWithinRoot(candidatePath, rootPath) {
  const target = path.resolve(String(candidatePath || ''));
  const root = path.resolve(String(rootPath || ''));
  const relativePath = path.relative(root, target);
  return relativePath === '' || (
    relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath)
  );
}

function normalizeFileSystemPath(rawPath = '') {
  const safePath = String(rawPath || '').trim();
  if (!safePath) return '';
  try {
    return path.resolve(safePath);
  } catch (_) {
    return '';
  }
}

function toNormalizedPathKey(rawPath = '') {
  const normalized = normalizeFileSystemPath(rawPath);
  if (!normalized) return '';
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function allowExternalMediaPath(filePath = '') {
  const normalized = normalizeFileSystemPath(filePath);
  if (!normalized) return '';
  const key = toNormalizedPathKey(normalized);
  if (!key) return '';
  allowedExternalMediaPaths.add(key);
  return normalized;
}

function isExplicitlyAllowedExternalMediaPath(filePath = '') {
  const key = toNormalizedPathKey(filePath);
  return !!key && allowedExternalMediaPaths.has(key);
}

function isAllowedExternalMediaPath(filePath) {
  if (isExplicitlyAllowedExternalMediaPath(filePath)) return true;
  return watchRoots.some((root) => isWithinRoot(filePath, root.path));
}

function buildExternalMediaUrl(filePath) {
  return `${EXTERNAL_MEDIA_ROUTE}?path=${encodeURIComponent(String(filePath || ''))}`;
}

function isMediaFilePath(filePath = '') {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return [
    '.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.opus', '.alac',
    '.mp4', '.webm', '.ogv', '.mov', '.m4v', '.mkv', '.avi', '.mpeg', '.mpg'
  ].includes(ext);
}

function safeStat(filePath) {
  return fs.promises.stat(filePath).catch(() => null);
}

async function collectMediaFilesFromDirectory(rootPath) {
  const root = path.resolve(String(rootPath || ''));
  const results = [];

  async function walk(dirPath) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (!entry.isFile() || !isMediaFilePath(entryPath)) continue;
      const stats = await safeStat(entryPath);
      if (!stats || !stats.isFile()) continue;
      const resolvedPath = allowExternalMediaPath(entryPath) || entryPath;
      results.push({
        path: resolvedPath,
        name: entry.name,
        size: stats.size,
        lastModified: Math.round(stats.mtimeMs),
        mediaUrl: buildExternalMediaUrl(resolvedPath)
      });
    }
  }

  await walk(root);
  return results;
}

function getLocalLibraryIndexPath() {
  return path.join(app.getPath('userData'), LOCAL_LIBRARY_INDEX_FILE);
}

function sanitizeLocalLibrarySnapshot(input = {}) {
  const id = String(input.id || '').trim();
  const fingerprint = String(input.fingerprint || '').trim();
  const fileName = String(input.fileName || '').trim();
  if (!id || !fingerprint || !fileName) return null;
  const sourcePath = normalizeFileSystemPath(input.sourcePath || input.path || '');
  const sourceFingerprint = String(input.sourceFingerprint || fingerprint).trim() || fingerprint;
  return {
    id,
    fingerprint,
    fileName,
    size: Math.max(0, Number(input.size) || 0),
    addedAt: Math.max(0, Number(input.addedAt) || 0),
    type: String(input.type || '').toLowerCase() === 'video' ? 'video' : 'audio',
    title: String(input.title || '').trim(),
    artist: String(input.artist || '').trim() || 'Unknown',
    sourcePath,
    sourceFingerprint,
    lastModified: Math.max(0, Number(input.lastModified) || 0)
  };
}

function sanitizeLocalLibrarySnapshotList(list = []) {
  return (Array.isArray(list) ? list : [])
    .map((entry) => sanitizeLocalLibrarySnapshot(entry))
    .filter(Boolean);
}

async function buildLocalMediaDialogResultEntry(filePath = '') {
  const normalizedPath = normalizeFileSystemPath(filePath);
  if (!normalizedPath || !isMediaFilePath(normalizedPath)) return null;
  const stats = await safeStat(normalizedPath);
  if (!stats || !stats.isFile()) return null;
  const allowedPath = allowExternalMediaPath(normalizedPath) || normalizedPath;
  const ext = path.extname(allowedPath).toLowerCase();
  const type = ['.mp4', '.webm', '.ogv', '.mov', '.m4v', '.mkv', '.avi', '.mpeg', '.mpg'].includes(ext)
    ? 'video'
    : 'audio';
  return {
    path: allowedPath,
    name: path.basename(allowedPath),
    size: stats.size,
    lastModified: Math.round(stats.mtimeMs),
    mediaUrl: buildExternalMediaUrl(allowedPath),
    type
  };
}

async function pickLocalMediaFiles(webContents = null) {
  const browserWindow = webContents ? BrowserWindow.fromWebContents(webContents) : BrowserWindow.getFocusedWindow();
  const selection = await dialog.showOpenDialog(browserWindow || null, {
    title: 'Import Media Files',
    buttonLabel: 'Import Selected',
    properties: ['openFile', 'multiSelections'],
    filters: [{
      name: 'Media Files',
      extensions: [
        'mp3', 'aac', 'flac', 'wav', 'ogg', 'oga', 'm4a', 'opus', 'alac',
        'mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv', 'avi', 'mpeg', 'mpg'
      ]
    }]
  });
  if (selection.canceled || !selection.filePaths?.length) {
    return { cancelled: true, entries: [] };
  }
  const entries = [];
  for (const selectedPath of selection.filePaths) {
    const mediaEntry = await buildLocalMediaDialogResultEntry(selectedPath);
    if (mediaEntry) entries.push(mediaEntry);
  }
  return { cancelled: false, entries };
}

async function readLocalLibraryIndexFile(indexPath) {
  const raw = await fs.promises.readFile(indexPath, 'utf8');
  if (!raw.trim()) throw new SyntaxError('Local library index is empty.');
  const parsed = JSON.parse(raw);
  return sanitizeLocalLibrarySnapshotList(
    Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.snapshots) ? parsed.snapshots : [])
  );
}

async function writeLocalLibraryIndexAtomically(indexPath, document) {
  const backupPath = `${indexPath}.bak`;
  const tempPath = `${indexPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(document, null, 2), 'utf8');
  try {
    try {
      await readLocalLibraryIndexFile(indexPath);
      await fs.promises.copyFile(indexPath, backupPath);
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    await fs.promises.rename(tempPath, indexPath);
  } finally {
    await fs.promises.unlink(tempPath).catch(() => {});
  }
}

function saveLocalLibraryIndex(payload = {}) {
  const rawSnapshots = Array.isArray(payload) ? payload : payload.snapshots;
  const snapshots = sanitizeLocalLibrarySnapshotList(rawSnapshots);
  const operation = localLibraryIndexSaveChain.catch(() => {}).then(async () => {
    const indexPath = getLocalLibraryIndexPath();
    await fs.promises.mkdir(path.dirname(indexPath), { recursive: true });
    await writeLocalLibraryIndexAtomically(indexPath, {
      version: 1,
      updatedAt: Date.now(),
      snapshots
    });
    snapshots.forEach((snapshot) => {
      if (snapshot.sourcePath) allowExternalMediaPath(snapshot.sourcePath);
    });
    return {
      saved: true,
      count: snapshots.length
    };
  });
  localLibraryIndexSaveChain = operation;
  return operation;
}

async function loadLocalLibraryIndex() {
  const indexPath = getLocalLibraryIndexPath();
  let snapshots = [];
  try {
    snapshots = await readLocalLibraryIndexFile(indexPath);
  } catch (error) {
    const primaryMissing = error?.code === 'ENOENT';
    const primaryCorrupt = error instanceof SyntaxError;
    if (!primaryMissing && !primaryCorrupt) throw error;
    try {
      snapshots = await readLocalLibraryIndexFile(`${indexPath}.bak`);
      snapshots.forEach((snapshot) => {
        if (snapshot.sourcePath) allowExternalMediaPath(snapshot.sourcePath);
      });
      return { snapshots, recovered: true, primaryCorrupt };
    } catch (backupError) {
      if (backupError?.code !== 'ENOENT' && !(backupError instanceof SyntaxError)) throw backupError;
      return { snapshots: [], primaryCorrupt, recoveryUnavailable: primaryCorrupt };
    }
  }
  snapshots.forEach((snapshot) => {
    if (snapshot.sourcePath) allowExternalMediaPath(snapshot.sourcePath);
  });
  return { snapshots };
}

function normalizeApprovedRemoteJsonUrl(rawUrl = '') {
  const url = new URL(String(rawUrl || '').trim());
  if (url.protocol !== 'https:' || !APPROVED_REMOTE_JSON_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('This metadata provider is not approved.');
  }
  if (url.username || url.password || url.toString().length > 4096) {
    throw new Error('The metadata request URL is invalid.');
  }
  url.searchParams.delete('callback');
  if (url.searchParams.get('output')?.toLowerCase() === 'jsonp') {
    url.searchParams.delete('output');
  }
  return url;
}

async function fetchApprovedRemoteJson(payload = {}) {
  let url = normalizeApprovedRemoteJsonUrl(payload?.url);
  const timeoutMs = Math.max(1000, Math.min(15000, Number(payload?.timeoutMs) || 5000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = null;
    for (let redirectCount = 0; redirectCount <= REMOTE_JSON_MAX_REDIRECTS; redirectCount += 1) {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': `NexPlay/${app.getVersion()}`
        },
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal
      });

      if (![301, 302, 303, 307, 308].includes(Number(response.status || 0))) break;
      if (redirectCount >= REMOTE_JSON_MAX_REDIRECTS) {
        throw new Error('The metadata provider redirected too many times.');
      }
      const location = String(response.headers.get('location') || '').trim();
      if (!location) {
        throw new Error('The metadata provider returned an invalid redirect.');
      }
      url = normalizeApprovedRemoteJsonUrl(new URL(location, url).toString());
    }

    if (!response) throw new Error('The metadata provider did not return a response.');
    if (!response.ok) {
      throw new Error(`Metadata provider returned HTTP ${response.status}.`);
    }
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > REMOTE_JSON_MAX_BYTES) {
      throw new Error('Metadata response was too large.');
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > REMOTE_JSON_MAX_BYTES) {
      throw new Error('Metadata response was too large.');
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function isTrustedRendererSender(event) {
  let senderUrl = '';
  try {
    senderUrl = String(event?.senderFrame?.url || event?.sender?.getURL?.() || '');
    const parsed = new URL(senderUrl);
    return parsed.protocol === 'http:'
      && parsed.hostname === HOST
      && parsed.port === String(localPort || FIXED_PORT);
  } catch (_) {
    return false;
  }
}

function registerTrustedIpcHandler(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedRendererSender(event)) {
      throw new Error('Unauthorized NexPlay desktop request.');
    }
    return handler(event, ...args);
  });
}

async function resolveLocalMediaPaths(payload = {}) {
  const rawSnapshots = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload.snapshots)
      ? payload.snapshots
      : (Array.isArray(payload.paths) ? payload.paths : []).map((filePath) => ({ sourcePath: filePath })));
  const entries = [];
  const missing = [];
  const seen = new Set();
  for (const snapshot of rawSnapshots) {
    const sourcePath = normalizeFileSystemPath(snapshot?.sourcePath || snapshot?.path || snapshot);
    if (!sourcePath) continue;
    const sourceKey = toNormalizedPathKey(sourcePath);
    if (!sourceKey || seen.has(sourceKey)) continue;
    seen.add(sourceKey);
    if (!isMediaFilePath(sourcePath)) {
      missing.push({ sourcePath, reason: 'unsupported' });
      continue;
    }
    const stats = await safeStat(sourcePath);
    if (!stats || !stats.isFile()) {
      missing.push({ sourcePath, reason: 'missing' });
      continue;
    }
    const resolvedPath = allowExternalMediaPath(sourcePath) || sourcePath;
    const ext = path.extname(resolvedPath).toLowerCase();
    entries.push({
      path: resolvedPath,
      name: path.basename(resolvedPath),
      size: stats.size,
      lastModified: Math.round(stats.mtimeMs),
      mediaUrl: buildExternalMediaUrl(resolvedPath),
      type: ['.mp4', '.webm', '.ogv', '.mov', '.m4v', '.mkv', '.avi', '.mpeg', '.mpg'].includes(ext) ? 'video' : 'audio'
    });
  }
  return { entries, missing };
}

function normalizeWatchRoot(input = {}) {
  const rootPath = path.resolve(String(input.path || input.rootPath || '')).trim();
  if (!rootPath) return null;
  return {
    id: String(input.id || rootPath).trim() || rootPath,
    name: String(input.name || path.basename(rootPath) || rootPath).trim() || rootPath,
    path: rootPath
  };
}

function serializeOnlineDownloadJob(job = {}) {
  return {
    id: String(job.id || ''),
    kind: String(job.kind || 'single'),
    status: String(job.status || 'queued'),
    title: String(job.title || ''),
    message: String(job.message || ''),
    createdAt: Number(job.createdAt) || Date.now(),
    updatedAt: Number(job.updatedAt) || Date.now(),
    totalCount: Number(job.totalCount) || 0,
    completedCount: Number(job.completedCount) || 0,
    failedCount: Number(job.failedCount) || 0,
    currentIndex: Number(job.currentIndex) || 0,
    tracks: Array.isArray(job.tracks) ? job.tracks.map((track) => ({
      trackId: String(track.trackId || ''),
      title: String(track.title || ''),
      artist: String(track.artist || ''),
      status: String(track.status || 'queued'),
      message: String(track.message || ''),
      savedPath: String(track.savedPath || '')
    })) : []
  };
}

function broadcastOnlineDownloadQueue() {
  const payload = {
    jobs: onlineDownloadJobs.map((job) => serializeOnlineDownloadJob(job)),
    activeJobId: onlineDownloadActiveJobId || ''
  };
  BrowserWindow.getAllWindows().forEach((windowRef) => {
    const contents = windowRef.webContents;
    if (!contents || contents.isDestroyed()) return;
    try {
      contents.send(ONLINE_DOWNLOAD_QUEUE_CHANNEL, payload);
    } catch (_) {}
  });
}

function broadcastLibraryWatchUpdate(payload = {}) {
  BrowserWindow.getAllWindows().forEach((windowRef) => {
    const contents = windowRef.webContents;
    if (!contents || contents.isDestroyed()) return;
    try {
      contents.send(WATCH_FOLDERS_UPDATE_CHANNEL, payload);
    } catch (_) {}
  });
}

function sendOnlineTrackDownloadProgress(webContents, payload = {}) {
  if (!webContents || webContents.isDestroyed()) return;
  try {
    webContents.send(ONLINE_TRACK_DOWNLOAD_PROGRESS_CHANNEL, payload);
  } catch (_) {}
}

function buildSpawnEnv() {
  const env = { ...process.env };
  const systemRoot = env.SystemRoot || env.WINDIR || (process.platform === 'win32' ? 'C:\\Windows' : '');
  if (systemRoot) {
    env.SystemRoot = systemRoot;
    env.WINDIR = env.WINDIR || systemRoot;
    env.ComSpec = env.ComSpec || path.join(systemRoot, 'System32', 'cmd.exe');
  }
  if (!env.PATH && env.Path) env.PATH = env.Path;
  if (!env.Path && env.PATH) env.Path = env.PATH;
  return env;
}

function isUsableYtDlpLauncherPath(command = '') {
  const safeCommand = typeof command === 'string' ? command.trim() : '';
  if (!safeCommand || !path.isAbsolute(safeCommand)) return true;
  const baseName = path.basename(safeCommand).toLowerCase();
  if (baseName !== 'yt-dlp.exe' && baseName !== 'yt-dlp') return true;
  const scriptsDir = path.dirname(safeCommand);
  if (path.basename(scriptsDir).toLowerCase() !== 'scripts') return true;
  const pythonDir = path.dirname(scriptsDir);
  if (!/^python\d+/i.test(path.basename(pythonDir))) return true;
  const siblingPython = path.join(pythonDir, 'python.exe');
  return fs.existsSync(siblingPython);
}

function describeCommandStrategy(strategy = {}) {
  const command = String(strategy.command || '').trim();
  if (!command) return 'yt-dlp';
  const prefix = Array.isArray(strategy.prefixArgs) && strategy.prefixArgs.length
    ? ` ${strategy.prefixArgs.join(' ')}`
    : '';
  return `${command}${prefix}`.trim();
}

function buildYtDlpJsRuntimeDescriptor(runtimeName = '', runtimePath = '') {
  const safeRuntimeName = String(runtimeName || '').trim();
  const safeRuntimePath = String(runtimePath || '').trim();
  if (!safeRuntimeName || !safeRuntimePath) return '';
  return `${safeRuntimeName}:${safeRuntimePath}`;
}

function getBundledElectronBinaryPath() {
  const candidates = [
    process.execPath,
    path.join(APP_ROOT, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
  ];
  for (const candidate of candidates) {
    const safeCandidate = typeof candidate === 'string' ? candidate.trim() : '';
    if (!safeCandidate) continue;
    if (!fs.existsSync(safeCandidate)) continue;
    return safeCandidate;
  }
  return '';
}

function ensureElectronNodeWrapperPath() {
  if (electronNodeWrapperPath && fs.existsSync(electronNodeWrapperPath)) {
    return electronNodeWrapperPath;
  }

  const electronBinaryPath = getBundledElectronBinaryPath();
  if (!electronBinaryPath) return '';

  const wrapperPath = path.join(os.tmpdir(), process.platform === 'win32'
    ? 'nexplay-electron-node.cmd'
    : 'nexplay-electron-node.sh');
  const wrapperContents = process.platform === 'win32'
    ? `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${electronBinaryPath}" %*\r\n`
    : `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${electronBinaryPath.replace(/"/g, '\\"')}" "$@"\n`;

  try {
    fs.writeFileSync(wrapperPath, wrapperContents, {
      encoding: 'utf8',
      mode: 0o755
    });
    electronNodeWrapperPath = wrapperPath;
    return electronNodeWrapperPath;
  } catch (_) {
    return '';
  }
}

function getYtDlpJsRuntimeDescriptor() {
  const explicitDescriptor = String(process.env.NEXPLAY_YTDLP_JS_RUNTIME || '').trim();
  if (explicitDescriptor) return explicitDescriptor;

  const denoPath = resolveExistingPath([
    process.env.NEXPLAY_DENO_PATH,
    'deno.exe',
    'deno'
  ]);
  if (denoPath) return buildYtDlpJsRuntimeDescriptor('deno', denoPath);

  const nodePath = resolveExistingPath([
    process.env.NEXPLAY_NODE_PATH,
    path.join(process.env.ProgramFiles || '', 'nodejs', 'node.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'nodejs', 'node.exe'),
    'node.exe',
    'node'
  ]);
  if (nodePath) return buildYtDlpJsRuntimeDescriptor('node', nodePath);

  const bundledElectronNodePath = ensureElectronNodeWrapperPath();
  if (bundledElectronNodePath) return buildYtDlpJsRuntimeDescriptor('node', bundledElectronNodePath);

  const bunPath = resolveExistingPath([
    process.env.NEXPLAY_BUN_PATH,
    'bun.exe',
    'bun'
  ]);
  if (bunPath) return buildYtDlpJsRuntimeDescriptor('bun', bunPath);

  const quickJsPath = resolveExistingPath([
    process.env.NEXPLAY_QUICKJS_PATH,
    'qjs.exe',
    'qjs',
    'quickjs'
  ]);
  if (quickJsPath) return buildYtDlpJsRuntimeDescriptor('quickjs', quickJsPath);

  return '';
}

function getYtDlpDefaultArgs(inputArgs = []) {
  const safeArgs = Array.isArray(inputArgs) ? inputArgs.map((value) => String(value || '')) : [];
  const hasExplicitJsRuntime = safeArgs.some((value) => value === '--js-runtimes' || value.startsWith('--js-runtimes='));
  if (hasExplicitJsRuntime) return [];
  const runtimeDescriptor = getYtDlpJsRuntimeDescriptor();
  return runtimeDescriptor ? ['--js-runtimes', runtimeDescriptor] : [];
}

function describeYtDlpFailure(rawText = '', fallbackMessage = 'yt-dlp failed.') {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dedupedLines = [];
  const seen = new Set();
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedLines.push(line);
  }

  const joined = dedupedLines.join('\n');
  const errorLines = dedupedLines.filter((line) => /^ERROR:/i.test(line));
  const primaryError = errorLines.length
    ? errorLines[errorLines.length - 1].replace(/^ERROR:\s*/i, '').trim()
    : '';

  if (/No supported JavaScript runtime could be found/i.test(joined)) {
    return 'Desktop online playback needs Deno or Node.js 20+ for YouTube playback. Install one, then restart NexPlay.';
  }
  if (/This video is not available/i.test(primaryError || joined)) {
    return 'NexPlay could not find a playable YouTube match for this track.';
  }
  if (primaryError) return primaryError;
  if (dedupedLines.length) {
    return dedupedLines[dedupedLines.length - 1].replace(/^WARNING:\s*/i, '').trim();
  }
  return fallbackMessage;
}

function getYtDlpLaunchStrategies() {
  const strategies = [];
  const seen = new Set();
  const pushStrategy = (command, prefixArgs = []) => {
    const normalizedCommand = typeof command === 'string' ? command.trim() : '';
    if (!normalizedCommand) return;
    if (!isUsableYtDlpLauncherPath(normalizedCommand)) return;
    const normalizedArgs = Array.isArray(prefixArgs) ? prefixArgs.map((value) => String(value || '').trim()).filter(Boolean) : [];
    const keyBase = `${normalizedCommand}::${normalizedArgs.join('\u0000')}`;
    const key = process.platform === 'win32' ? keyBase.toLowerCase() : keyBase;
    if (seen.has(key)) return;
    seen.add(key);
    strategies.push({ command: normalizedCommand, prefixArgs: normalizedArgs });
  };

  const explicitYtDlp = resolveExistingPath([process.env.NEXPLAY_YTDLP_PATH]);
  if (explicitYtDlp) pushStrategy(explicitYtDlp);

  const pythonCandidates = resolveExistingPaths([
    process.env.NEXPLAY_PYTHON_PATH,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
    'python',
    'py'
  ]);
  pythonCandidates.forEach((command) => pushStrategy(command, ['-m', 'yt_dlp']));

  resolveExistingPaths([
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'Scripts', 'yt-dlp.exe'),
    'yt-dlp.exe',
    'yt-dlp'
  ]).forEach((command) => pushStrategy(command));

  return strategies;
}

async function spawnYtDlpProcess(args = [], options = {}) {
  const launchStrategies = getYtDlpLaunchStrategies();
  if (!launchStrategies.length) {
    throw new Error('yt-dlp was not found. Set NEXPLAY_YTDLP_PATH or install yt-dlp.');
  }

  const normalizedArgs = Array.isArray(args) ? args.map((value) => String(value)) : [];
  const spawnArgs = [...getYtDlpDefaultArgs(normalizedArgs), ...normalizedArgs];
  let lastError = null;

  for (const strategy of launchStrategies) {
    try {
      const child = await new Promise((resolve, reject) => {
        let settled = false;
        const childProcess = spawn(
          strategy.command,
          [...(strategy.prefixArgs || []), ...spawnArgs],
          {
            cwd: options.cwd || getChildProcessWorkingDirectory(),
            windowsHide: options.windowsHide !== false,
            stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
            env: options.env || buildSpawnEnv()
          }
        );

        childProcess.once('spawn', () => {
          if (settled) return;
          settled = true;
          resolve(childProcess);
        });

        childProcess.once('error', (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
      });

      return { child, strategy };
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError?.message ? ` Last error: ${lastError.message}` : '';
  throw new Error(`Unable to start yt-dlp with any supported launcher.${detail}`);
}

function getFfmpegBinary() {
  return resolveExistingPath([
    process.env.NEXPLAY_FFMPEG_PATH,
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    path.join(process.env.ProgramFiles || '', 'ffmpeg', 'bin', 'ffmpeg.exe'),
    'ffmpeg.exe',
    'ffmpeg'
  ]);
}

function normalizeOnlineTrackDownloadPayload(payload = {}) {
  return {
    trackId: String(payload.trackId || payload.videoId || '').trim(),
    videoId: String(payload.videoId || '').trim(),
    title: String(payload.title || 'Track').trim(),
    artist: String(payload.artist || 'Unknown Artist').trim(),
    cover: String(payload.cover || '').trim(),
    canonicalUrl: String(payload.canonicalUrl || '').trim(),
    releaseTitle: String(payload.releaseTitle || '').trim(),
    duration: Math.max(0, Number(payload.duration || 0) || 0)
  };
}

function parseYtDlpProgressLine(line = '') {
  const text = String(line || '').trim();
  if (!text) return null;
  if (/extracting audio|post-process|postprocess|ffmpeg/i.test(text)) {
    return {
      phase: 'converting',
      message: 'Converting download to MP3...'
    };
  }
  const percentMatch = text.match(/(\d+(?:\.\d+)?)%/);
  if (percentMatch) {
    const percent = Math.max(0, Math.min(100, Number(percentMatch[1]) || 0));
    return {
      phase: 'downloading',
      percent,
      message: `Downloading MP3 source... ${Math.round(percent)}%`
    };
  }
  return null;
}

function streamProcessOutput(child, onLine) {
  const attach = (stream) => {
    if (!stream) return;
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      lines.forEach((line) => onLine(line));
    });
    stream.on('end', () => {
      if (buffer.trim()) onLine(buffer.trim());
      buffer = '';
    });
  };
  attach(child.stdout);
  attach(child.stderr);
}

async function runYtDlpDownload({ request, outputTemplate, ffmpegLocation, sourceUrl, onProgress }) {
  const args = [
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--no-playlist',
    '--newline',
    '--no-part',
    '--output', outputTemplate
  ];
  if (ffmpegLocation) {
    args.push('--ffmpeg-location', ffmpegLocation);
  }
  args.push(sourceUrl);

  let lastPhase = '';
  let lastPercent = -1;
  if (typeof onProgress === 'function') {
    onProgress({
      trackId: request.trackId,
      phase: 'starting',
      message: `Starting MP3 download for "${request.title}".`
    });
  }

  const { child, strategy } = await spawnYtDlpProcess(args, {
    cwd: getChildProcessWorkingDirectory(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  activeOnlineDownloadChild = child;

  return new Promise((resolve, reject) => {
    let processOutput = '';
    streamProcessOutput(child, (line) => {
      processOutput += `${line}\n`;
      const progress = parseYtDlpProgressLine(line);
      if (!progress) return;
      if (progress.phase === 'converting') {
        if (lastPhase === 'converting') return;
        lastPhase = 'converting';
        if (typeof onProgress === 'function') {
          onProgress({
            trackId: request.trackId,
            phase: 'converting',
            message: progress.message
          });
        }
        return;
      }
      const roundedPercent = Math.round(progress.percent || 0);
      if (lastPhase === progress.phase && roundedPercent === lastPercent) return;
      lastPhase = progress.phase;
      lastPercent = roundedPercent;
      if (typeof onProgress === 'function') {
        onProgress({
          trackId: request.trackId,
          phase: 'downloading',
          percent: roundedPercent,
          message: progress.message
        });
      }
    });

    child.once('error', (error) => {
      if (activeOnlineDownloadChild === child) activeOnlineDownloadChild = null;
      const fallbackMessage = `yt-dlp failed via ${describeCommandStrategy(strategy)}.`;
      reject(new Error(describeYtDlpFailure(error?.message || processOutput, fallbackMessage)));
    });
    child.once('close', (code) => {
      if (activeOnlineDownloadChild === child) activeOnlineDownloadChild = null;
      if (code === 0) resolve();
      else {
        const fallbackMessage = `yt-dlp exited with code ${code} via ${describeCommandStrategy(strategy)}.`;
        reject(new Error(describeYtDlpFailure(processOutput, fallbackMessage)));
      }
    });
  });
}

function buildOnlineTrackSaveName(request = {}) {
  return `${sanitizeFileSegment(request.artist, 'Artist')} - ${sanitizeFileSegment(request.title, 'Track')}.mp3`;
}

async function ensureUniqueFilePath(filePath) {
  const ext = path.extname(filePath);
  const base = filePath.slice(0, ext.length ? -ext.length : undefined);
  let candidate = filePath;
  let suffix = 1;
  while (await safeStat(candidate)) {
    candidate = `${base} (${suffix})${ext}`;
    suffix += 1;
  }
  return candidate;
}

async function downloadTrackToPath(webContents, request, savePath, options = {}) {
  const ffmpegBinary = getFfmpegBinary();
  const ffmpegLocation = ffmpegBinary
    ? (path.isAbsolute(ffmpegBinary) ? path.dirname(ffmpegBinary) : ffmpegBinary)
    : '';
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nexplay-online-music-'));
  const outputTemplate = path.join(tempDir, 'track.%(ext)s');
  const sourceUrl = request.canonicalUrl || `https://www.youtube.com/watch?v=${request.videoId}`;

  try {
    await runYtDlpDownload({
      request,
      outputTemplate,
      ffmpegLocation,
      sourceUrl,
      onProgress: (payload) => {
        sendOnlineTrackDownloadProgress(webContents, payload);
        if (typeof options.onProgress === 'function') options.onProgress(payload);
      }
    });
    const tempFiles = await fs.promises.readdir(tempDir);
    const mp3Name = tempFiles.find((file) => file.toLowerCase().endsWith('.mp3'));
    if (!mp3Name) {
      throw new Error('yt-dlp finished without producing an MP3 file.');
    }
    const tempMp3Path = path.join(tempDir, mp3Name);
    await fs.promises.copyFile(tempMp3Path, savePath);
    const buffer = await fs.promises.readFile(savePath);
    const stats = await fs.promises.stat(savePath);
    return {
      cancelled: false,
      trackId: request.trackId,
      fileName: path.basename(savePath),
      savedPath: savePath,
      mimeType: 'audio/mpeg',
      base64: buffer.toString('base64'),
      size: buffer.byteLength,
      lastModified: Math.round(stats.mtimeMs)
    };
  } finally {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

async function performOnlineTrackDownload(webContents, rawPayload = {}) {
  const request = normalizeOnlineTrackDownloadPayload(rawPayload);
  if (!request.trackId || !request.videoId) {
    throw new Error('Missing YouTube track information for download.');
  }

  const browserWindow = BrowserWindow.fromWebContents(webContents);
  const defaultFolder = lastOnlineTrackDownloadDir || app.getPath('music') || app.getPath('downloads');
  const defaultBaseName = buildOnlineTrackSaveName(request);
  const saveSelection = await dialog.showSaveDialog(browserWindow || null, {
    title: 'Save MP3 Copy',
    defaultPath: path.join(defaultFolder, defaultBaseName),
    buttonLabel: 'Save MP3',
    filters: [{ name: 'MP3 Audio', extensions: ['mp3'] }]
  });

  if (saveSelection.canceled || !saveSelection.filePath) {
    return { cancelled: true, trackId: request.trackId };
  }

  const savePath = saveSelection.filePath.toLowerCase().endsWith('.mp3')
    ? saveSelection.filePath
    : `${saveSelection.filePath}.mp3`;
  lastOnlineTrackDownloadDir = path.dirname(savePath);
  return downloadTrackToPath(webContents, request, savePath);
}

function normalizeOnlineReleaseDownloadPayload(payload = {}) {
  const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
  return {
    title: String(payload.title || 'Release').trim() || 'Release',
    autoImport: payload.autoImport !== false,
    tracks: tracks
      .map((track) => normalizeOnlineTrackDownloadPayload(track))
      .filter((track) => track.trackId && track.videoId)
  };
}

function createOnlineDownloadJob(input = {}, webContents = null) {
  const now = Date.now();
  const tracks = Array.isArray(input.tracks) ? input.tracks : [];
  const jobId = `download_${now}_${++onlineDownloadJobSeq}`;
  const baseJob = {
    id: jobId,
    kind: String(input.kind || 'single'),
    title: String(input.title || 'Download').trim() || 'Download',
    status: 'queued',
    message: '',
    createdAt: now,
    updatedAt: now,
    currentIndex: 0,
    completedCount: 0,
    failedCount: 0,
    totalCount: tracks.length,
    autoImport: input.autoImport !== false,
    webContents,
    tracks: tracks.map((track) => ({
      ...track,
      status: 'queued',
      message: '',
      savedPath: ''
    }))
  };
  baseJob.promise = new Promise((resolve, reject) => {
    baseJob.resolve = resolve;
    baseJob.reject = reject;
  });
  return baseJob;
}

async function pickReleaseDownloadDirectory(job) {
  const browserWindow = job.webContents ? BrowserWindow.fromWebContents(job.webContents) : null;
  const defaultFolder = lastOnlineTrackDownloadDir || app.getPath('music') || app.getPath('downloads');
  const selection = await dialog.showOpenDialog(browserWindow || null, {
    title: `Save ${job.title} To`,
    defaultPath: defaultFolder,
    buttonLabel: 'Choose Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (selection.canceled || !selection.filePaths?.length) return '';
  const folder = selection.filePaths[0];
  lastOnlineTrackDownloadDir = folder;
  return folder;
}

function updateJobState(job, patch = {}) {
  Object.assign(job, patch, { updatedAt: Date.now() });
  broadcastOnlineDownloadQueue();
}

async function processOnlineDownloadJob(job) {
  const targetWindow = job.webContents;
  updateJobState(job, { status: 'running', message: `Preparing ${job.title}...`, currentIndex: 0 });

  let targetFolder = '';
  if (job.kind === 'release') {
    targetFolder = await pickReleaseDownloadDirectory(job);
    if (!targetFolder) {
      updateJobState(job, { status: 'cancelled', message: 'Download cancelled.' });
      job.resolve({ cancelled: true, jobId: job.id });
      return;
    }
  }

  const completed = [];
  for (let index = 0; index < job.tracks.length; index += 1) {
    if (job.status === 'cancelled') break;
    const track = job.tracks[index];
    job.currentIndex = index;
    track.status = 'running';
    updateJobState(job, {
      message: `Downloading ${index + 1}/${job.totalCount}: ${track.title}`
    });
    try {
      const savePath = job.kind === 'single'
        ? null
        : await ensureUniqueFilePath(path.join(targetFolder, buildOnlineTrackSaveName(track)));
      const result = savePath
        ? await downloadTrackToPath(targetWindow, track, savePath, {
          onProgress: (payload) => {
            track.message = payload.message || '';
            track.status = payload.phase === 'converting' ? 'converting' : 'running';
            updateJobState(job, {
              message: payload.message || job.message
            });
          }
        })
        : await performOnlineTrackDownload(targetWindow, track);
      if (result?.cancelled) {
        updateJobState(job, { status: 'cancelled', message: 'Download cancelled.' });
        job.resolve({ cancelled: true, jobId: job.id });
        return;
      }
      track.status = 'completed';
      track.savedPath = result.savedPath || '';
      track.message = 'Completed';
      completed.push({
        ...result,
        title: track.title,
        artist: track.artist,
        autoImport: job.autoImport,
        originProvider: String(track.originProvider || ''),
        originReleaseId: String(track.originReleaseId || '')
      });
      updateJobState(job, {
        completedCount: completed.length,
        message: `Completed ${completed.length}/${job.totalCount}`
      });
    } catch (error) {
      if (job.status === 'cancelled') {
        updateJobState(job, { message: 'Download cancelled.' });
        job.resolve({ cancelled: true, jobId: job.id });
        return;
      }
      track.status = 'error';
      track.message = error?.message || 'Download failed.';
      updateJobState(job, {
        failedCount: Number(job.failedCount || 0) + 1,
        message: track.message
      });
      if (job.kind === 'single') {
        job.reject(error);
        return;
      }
    }
  }

  if (job.status !== 'cancelled') {
    updateJobState(job, {
      status: job.failedCount > 0 ? 'completed_with_errors' : 'completed',
      message: job.failedCount > 0
        ? `Completed ${job.completedCount}/${job.totalCount} with ${job.failedCount} errors.`
        : `Completed ${job.completedCount}/${job.totalCount}.`
    });
    job.resolve({
      cancelled: false,
      jobId: job.id,
      items: completed,
      autoImport: job.autoImport
    });
  }
}

function pumpOnlineDownloadQueue() {
  if (onlineDownloadActiveJobId) return;
  const nextJob = onlineDownloadJobs.find((job) => job.status === 'queued');
  if (!nextJob) {
    broadcastOnlineDownloadQueue();
    return;
  }
  onlineDownloadActiveJobId = nextJob.id;
  broadcastOnlineDownloadQueue();
  processOnlineDownloadJob(nextJob)
    .catch((error) => {
      updateJobState(nextJob, {
        status: 'error',
        message: error?.message || 'Download failed.'
      });
      try { nextJob.reject(error); } catch (_) {}
    })
    .finally(() => {
      onlineDownloadActiveJobId = '';
      activeOnlineDownloadChild = null;
      broadcastOnlineDownloadQueue();
      setTimeout(() => pumpOnlineDownloadQueue(), 0);
    });
}

function enqueueOnlineDownloadJob(job) {
  onlineDownloadJobs.unshift(job);
  broadcastOnlineDownloadQueue();
  pumpOnlineDownloadQueue();
  return job.promise;
}

function enqueueOnlineTrackDownload(webContents, payload = {}) {
  const request = normalizeOnlineTrackDownloadPayload(payload);
  sendOnlineTrackDownloadProgress(webContents, {
    trackId: request.trackId,
    phase: 'queued',
    message: `Queued MP3 download for "${request.title || 'track'}".`
  });
  const job = createOnlineDownloadJob({
    kind: 'single',
    title: request.title || 'Track Download',
    autoImport: true,
    tracks: [request]
  }, webContents);
  const taskPromise = enqueueOnlineDownloadJob(job).then((result) => {
    const firstItem = Array.isArray(result?.items) ? result.items[0] : null;
    return firstItem || result;
  });
  onlineTrackDownloadChain = taskPromise.catch(() => {});
  return taskPromise;
}

function parseYtDlpDurationSeconds(value) {
  if (Number.isFinite(Number(value)) && Number(value) >= 0) return Number(value);
  const text = String(value || '').trim();
  if (!text) return 0;
  const parts = text.split(':').map((part) => Number(part));
  if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  return parts.reduce((total, part) => (total * 60) + part, 0);
}

function extractYouTubeVideoIdFromYtDlpEntry(entry = {}) {
  const rawUrl = sanitizePlainText(entry?.webpage_url || entry?.url || '');
  if (/^[A-Za-z0-9_-]{6,}$/.test(rawUrl)) return rawUrl;
  try {
    if (rawUrl) {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();
      if (host.includes('youtu.be')) return sanitizePlainText(parsed.pathname.replace(/^\/+/, ''));
      if (host.includes('youtube.com')) {
        const videoId = sanitizePlainText(parsed.searchParams.get('v') || '');
        return videoId && /^[A-Za-z0-9_-]{6,}$/.test(videoId) ? videoId : '';
      }
    }
  } catch (_) {}
  const directId = sanitizePlainText(entry?.id || entry?.display_id || '');
  if (/^[A-Za-z0-9_-]{6,}$/.test(directId)) return directId;
  return '';
}

function scoreYtDlpThumbnailCandidate(item = {}) {
  const width = Number(item?.width || 0) || 0;
  const height = Number(item?.height || 0) || 0;
  const area = width * height;
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const squareDelta = Math.abs(aspect - 1);
  const url = sanitizePlainText(item?.url || '').toLowerCase();
  let score = Math.log10(Math.max(1, area)) * 18;
  score += Math.max(0, 120 - (squareDelta * 180));
  if (squareDelta <= 0.12) score += 80;
  if (squareDelta > 0.35) score -= 70;
  if (/ytimg\.com\/(?:vi|vi_webp)\//i.test(url)) score -= 24;
  return score;
}

function getYtDlpEntryThumbnail(entry = {}) {
  const directThumbnail = sanitizePlainText(entry?.thumbnail || '');
  const thumbnails = Array.isArray(entry?.thumbnails) ? entry.thumbnails : [];
  const best = thumbnails
    .filter((item) => item && typeof item === 'object' && item.url)
    .sort((left, right) => {
      const scoreDiff = scoreYtDlpThumbnailCandidate(right) - scoreYtDlpThumbnailCandidate(left);
      if (scoreDiff !== 0) return scoreDiff;
      const leftSize = (Number(left.width || 0) || 0) * (Number(left.height || 0) || 0);
      const rightSize = (Number(right.width || 0) || 0) * (Number(right.height || 0) || 0);
      return rightSize - leftSize;
    })[0];
  return sanitizePlainText(best?.url || directThumbnail || '');
}

function getYouTubeThumbnailUrl(videoId = '') {
  const safeVideoId = sanitizePlainText(videoId);
  return safeVideoId ? `https://i.ytimg.com/vi/${safeVideoId}/hqdefault.jpg` : '';
}

function normalizeExcludedYouTubeVideoIds(value = []) {
  return new Set((Array.isArray(value) ? value : [value])
    .map((item) => sanitizePlainText(item))
    .filter((item) => /^[A-Za-z0-9_-]{6,}$/.test(item)));
}

function normalizePlaybackResolverCacheText(value = '') {
  return sanitizePlainText(value).normalize('NFKC').toLowerCase();
}

function createOnlinePlaybackResolverCacheKey(payload = {}, excludeVideoIds = new Set(), searchLimit = ONLINE_PLAYBACK_SEARCH_LIMIT) {
  return JSON.stringify([
    'v3',
    normalizePlaybackResolverCacheText(payload.title || ''),
    normalizePlaybackResolverCacheText(payload.artist || ''),
    Math.max(3, Math.min(Number(searchLimit || ONLINE_PLAYBACK_SEARCH_LIMIT) || ONLINE_PLAYBACK_SEARCH_LIMIT, 12)),
    Array.from(excludeVideoIds).map((item) => sanitizePlainText(item)).filter(Boolean).sort()
  ]);
}

function cloneOnlinePlaybackCandidateResolution(value = null) {
  if (!value || typeof value !== 'object') return value;
  return { ...value };
}

function createOnlinePlaybackCandidateResolution(best = {}) {
  return {
    videoId: best.videoId,
    canonicalUrl: best.canonicalUrl || `https://www.youtube.com/watch?v=${best.videoId}`,
    title: best.title || '',
    artist: best.artist || '',
    channelTitle: best.channelTitle || best.artist || '',
    channelId: best.channelId || '',
    thumbnail: best.thumbnail || '',
    duration: best.duration || 0,
    resolver: best.resolver || 'yt-dlp',
    sourceSurface: best.sourceSurface || '',
    playableInEmbed: typeof best.playableInEmbed === 'boolean' ? best.playableInEmbed : null,
    score: best.score
  };
}

function readOnlinePlaybackResolutionCache(cache, key, nowMs) {
  const record = cache.get(key);
  if (!record) return null;
  if (Number(record.expiresAt || 0) <= nowMs) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, record);
  return cloneOnlinePlaybackCandidateResolution(record.value);
}

function writeOnlinePlaybackResolutionCache(cache, key, value, options = {}) {
  const nowMs = Number(options.nowMs || 0) || 0;
  const ttlMs = Math.max(1, Number(options.ttlMs || ONLINE_PLAYBACK_RESOLUTION_CACHE_TTL_MS) || ONLINE_PLAYBACK_RESOLUTION_CACHE_TTL_MS);
  const maxEntries = Math.max(1, Number(options.maxEntries || ONLINE_PLAYBACK_RESOLUTION_CACHE_MAX_ENTRIES) || ONLINE_PLAYBACK_RESOLUTION_CACHE_MAX_ENTRIES);
  cache.delete(key);
  cache.set(key, {
    expiresAt: nowMs + ttlMs,
    value: cloneOnlinePlaybackCandidateResolution(value)
  });
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey === 'undefined') break;
    cache.delete(oldestKey);
  }
}

function createOnlinePlaybackResolverRuntime(options = {}) {
  return {
    cache: options.cache || new Map(),
    inFlight: options.inFlight || new Map(),
    runSearch: typeof options.runSearch === 'function' ? options.runSearch : runYtDlpJson,
    normalizeEntry: typeof options.normalizeEntry === 'function' ? options.normalizeEntry : normalizePlaybackResolverEntry,
    now: typeof options.now === 'function' ? options.now : Date.now,
    setTimer: typeof options.setTimer === 'function' ? options.setTimer : setTimeout,
    clearTimer: typeof options.clearTimer === 'function' ? options.clearTimer : clearTimeout,
    cacheTtlMs: Math.max(1, Number(options.cacheTtlMs || ONLINE_PLAYBACK_RESOLUTION_CACHE_TTL_MS) || ONLINE_PLAYBACK_RESOLUTION_CACHE_TTL_MS),
    cacheMaxEntries: Math.max(1, Number(options.cacheMaxEntries || ONLINE_PLAYBACK_RESOLUTION_CACHE_MAX_ENTRIES) || ONLINE_PLAYBACK_RESOLUTION_CACHE_MAX_ENTRIES),
    primarySearchTimeoutMs: Math.max(1, Number(options.primarySearchTimeoutMs || ONLINE_PLAYBACK_PRIMARY_SEARCH_TIMEOUT_MS) || ONLINE_PLAYBACK_PRIMARY_SEARCH_TIMEOUT_MS),
    searchAttemptTimeoutMs: Math.max(1, Number(options.searchAttemptTimeoutMs || ONLINE_PLAYBACK_RESOLVE_TIMEOUT_MS) || ONLINE_PLAYBACK_RESOLVE_TIMEOUT_MS)
  };
}

function isPlaylistLikeYtDlpEntry(entry = {}) {
  const ieKey = sanitizePlainText(entry?.ie_key || entry?.extractor_key || '').toLowerCase();
  const rawUrl = sanitizePlainText(entry?.url || entry?.webpage_url || '');
  return ieKey.includes('youtubetab') || /\/browse\//i.test(rawUrl) || /^VL[A-Za-z0-9_-]+$/.test(sanitizePlainText(entry?.id || ''));
}

function hasResolverAudioOrLyricMarker(value = '') {
  return /\b(?:official\s+audio|audio\s+only|lyric\s+video|lyrics?|visuali[sz]er|provided\s+to\s+youtube)\b/i.test(String(value || ''));
}

function hasResolverMusicVideoMarker(value = '') {
  const raw = String(value || '');
  if (!raw || hasResolverAudioOrLyricMarker(raw)) return false;
  return /\b(?:official\s+(?:music\s+)?video|official\s+video|music\s+video)\b/i.test(raw);
}

function getYtDlpEntryArtist(entry = {}, fallback = '') {
  const artists = Array.isArray(entry?.artists) ? entry.artists : [];
  return sanitizePlainText(
    artists[0]
      || entry?.artist
      || entry?.creator
      || entry?.uploader
      || entry?.channel
      || fallback
  );
}

function scorePlaybackResolverCandidate(candidate = {}, payload = {}) {
  const title = sanitizePlainText(candidate.title || '');
  const artist = sanitizePlainText(candidate.artist || candidate.channelTitle || '');
  const channelTitle = sanitizePlainText(candidate.channelTitle || candidate.artist || '');
  const surface = sanitizePlainText(candidate.sourceSurface || '');
  const rawText = `${title} ${artist} ${channelTitle} ${candidate.description || ''}`.trim();
  if (hasResolverMusicVideoMarker(title)) {
    return { include: false, score: -1000, reason: 'music-video' };
  }
  const eligibility = classifyOnlineMusicSearchResultEligibility({
    query: candidate.query,
    provider: 'youtube',
    videoId: candidate.videoId,
    title,
    artist,
    channelTitle,
    description: candidate.description || '',
    tags: candidate.tags || [],
    duration: candidate.duration || 0,
    canonicalUrl: candidate.canonicalUrl || '',
    sourceSurface: surface,
    resolver: candidate.resolver || ''
  });
  if (eligibility.include === false) return { include: false, score: -1000, reason: eligibility.reason || 'ineligible' };

  let score = scoreOnlineMusicTrackCandidate({
    targetTitle: payload.title,
    targetArtist: payload.artist,
    releaseTitle: payload.releaseTitle || '',
    candidateVideoId: candidate.videoId,
    candidateTitle: title,
    candidateArtist: artist,
    candidateChannel: channelTitle
  });
  score += Math.max(0, Number(eligibility.score || 0));
  if (surface === 'youtube-music') score += 80;
  if (candidate.playableInEmbed === true) score += 20;
  if (candidate.playableInEmbed === false) score -= 500;
  if (/\b(?:provided\s+to\s+youtube|topic|official\s+audio|audio|lyrics?|lyric\s+video|visuali[sz]er)\b/i.test(rawText)) score += 55;
  if (hasResolverMusicVideoMarker(title)) score -= 160;
  return { include: true, score, reason: eligibility.reason || '' };
}

function normalizePlaybackResolverIdentityText(value = '') {
  return sanitizePlainText(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\b(?:official\s+audio|audio\s+only|provided\s+to\s+youtube(?:\s+by)?)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isClearlyHighConfidencePrimaryPlaybackCandidate(candidate = {}, payload = {}) {
  if (
    !candidate.videoId
    || candidate.playableInEmbed === false
    || Number(candidate.score || 0) < ONLINE_PLAYBACK_EARLY_ACCEPT_SCORE
  ) return false;
  const targetTitle = normalizePlaybackResolverIdentityText(payload.title || '');
  const targetArtist = normalizePlaybackResolverIdentityText(payload.artist || '');
  if (!targetTitle || !targetArtist || targetArtist === 'unknown artist') return false;

  const candidateTitle = normalizePlaybackResolverIdentityText(candidate.title || '');
  const candidateArtist = normalizePlaybackResolverIdentityText(candidate.artist || '').replace(/\btopic\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const candidateChannel = normalizePlaybackResolverIdentityText(candidate.channelTitle || '').replace(/\btopic\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const titleMatches = candidateTitle === targetTitle
    || candidateTitle === `${targetArtist} ${targetTitle}`
    || candidateTitle === `${targetTitle} ${targetArtist}`;
  const artistMatches = candidateArtist === targetArtist || candidateChannel === targetArtist;
  const evidenceText = `${candidate.title || ''} ${candidate.artist || ''} ${candidate.channelTitle || ''} ${candidate.description || ''}`;
  const hasOfficialAudioEvidence = /\b(?:official\s+audio|audio\s+only|provided\s+to\s+youtube)\b/i.test(evidenceText)
    || /\btopic\b/i.test(String(candidate.channelTitle || candidate.artist || ''));
  return titleMatches && artistMatches && hasOfficialAudioEvidence;
}

function normalizePlaybackResolverEntry(entry = {}, options = {}) {
  if (!entry || typeof entry !== 'object' || isPlaylistLikeYtDlpEntry(entry)) return null;
  const videoId = extractYouTubeVideoIdFromYtDlpEntry(entry);
  if (!videoId || options.excludeVideoIds?.has(videoId)) return null;
  const title = sanitizePlainText(entry?.title || '');
  if (!title) return null;
  const artist = getYtDlpEntryArtist(entry, options.payload?.artist || 'YouTube Music');
  const channelTitle = sanitizePlainText(entry?.channel || entry?.uploader || artist || 'YouTube Music');
  const duration = parseYtDlpDurationSeconds(entry?.duration || entry?.duration_string || '');
  const sourceSurface = sanitizePlainText(options.sourceSurface || '');
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const candidate = {
    query: options.query || '',
    videoId,
    title,
    artist,
    channelTitle,
    channelId: sanitizePlainText(entry?.channel_id || entry?.uploader_id || ''),
    description: sanitizePlainText(entry?.description || ''),
    tags: Array.isArray(entry?.tags) ? entry.tags : [],
    duration,
    canonicalUrl,
    thumbnail: getYtDlpEntryThumbnail(entry) || getYouTubeThumbnailUrl(videoId),
    sourceSurface,
    resolver: sourceSurface === 'youtube-music' ? 'yt-dlp-music-search' : 'yt-dlp-search',
    playableInEmbed: typeof entry?.playable_in_embed === 'boolean' ? entry.playable_in_embed : null,
    viewCount: Number(entry?.view_count || 0) || 0
  };
  if (isLikelyShortFormOnlineMusicResult(candidate)) return null;
  const ranked = scorePlaybackResolverCandidate(candidate, options.payload || {});
  if (!ranked.include) return null;
  return {
    ...candidate,
    score: ranked.score,
    scoreReason: ranked.reason
  };
}

function normalizeYouTubeMusicSearchEntry(entry = {}, query = '') {
  if (isPlaylistLikeYtDlpEntry(entry)) return null;
  const videoId = extractYouTubeVideoIdFromYtDlpEntry(entry);
  if (!videoId) return null;
  const title = sanitizePlainText(entry?.title || '');
  if (!title) return null;
  const artist = sanitizePlainText(
    entry?.artists?.[0]
      || entry?.artist
      || entry?.uploader
      || entry?.channel
      || entry?.creator
      || 'YouTube Music'
  );
  const channelTitle = sanitizePlainText(entry?.channel || entry?.uploader || artist || 'YouTube Music');
  const duration = parseYtDlpDurationSeconds(entry?.duration || entry?.duration_string || '');
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const candidate = {
    query,
    provider: 'youtube',
    videoId,
    title,
    artist,
    channelTitle,
    description: sanitizePlainText(entry?.description || ''),
    tags: Array.isArray(entry?.tags) ? entry.tags : [],
    duration,
    canonicalUrl,
    sourceSurface: 'youtube-music',
    resolver: 'yt-dlp-ytmsearch',
    catalogProviderLabel: 'YouTube Music'
  };
  if (isLikelyShortFormOnlineMusicResult(candidate)) return null;
  if (classifyOnlineMusicSearchResultEligibility(candidate).include === false) return null;
  const thumbnail = getYtDlpEntryThumbnail(entry) || getYouTubeThumbnailUrl(videoId);
  return {
    id: videoId,
    videoId,
    title,
    artist,
    channelTitle,
    channelId: sanitizePlainText(entry?.channel_id || entry?.uploader_id || ''),
    thumbnail,
    cover: thumbnail,
    description: candidate.description,
    tags: candidate.tags,
    duration,
    canonicalUrl,
    publishedAt: sanitizePlainText(entry?.upload_date || entry?.release_date || entry?.timestamp || ''),
    viewCount: Number(entry?.view_count || 0) || 0,
    likeCount: Number(entry?.like_count || 0) || 0,
    provider: 'youtube',
    providerLabel: 'YouTube Music',
    catalogProvider: 'youtube',
    catalogProviderLabel: 'YouTube Music',
    transportProvider: 'youtube',
    transportProviderLabel: 'YouTube',
    sourceSurface: 'youtube-music',
    resolver: 'yt-dlp-ytmsearch',
    addedAt: Date.now()
  };
}

async function runYtDlpJson(args = [], options = {}) {
  const timeoutFloorMs = options.allowSubsecondTimeout === true ? 1 : 1000;
  const requestedTimeoutMs = Math.max(timeoutFloorMs, Number(options.timeoutMs || ONLINE_MUSIC_SEARCH_TIMEOUT_MS) || ONLINE_MUSIC_SEARCH_TIMEOUT_MS);
  const deadlineAt = Number(options.deadlineAt || 0) || 0;
  const abortSignal = options.signal || null;
  if (abortSignal?.aborted) {
    throw new Error('YouTube playback search was cancelled.');
  }
  if (deadlineAt > 0 && deadlineAt <= Date.now()) {
    throw new Error('YouTube playback search deadline expired.');
  }
  const { child, strategy } = await spawnYtDlpProcess(args, {
    cwd: getChildProcessWorkingDirectory(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const deadlineRemainingMs = deadlineAt > 0 ? Math.floor(deadlineAt - Date.now()) : requestedTimeoutMs;
  if (deadlineAt > 0 && deadlineRemainingMs <= 0) {
    try { child.kill('SIGTERM'); } catch (_) {}
    throw new Error('YouTube playback search deadline expired.');
  }
  if (abortSignal?.aborted) {
    try { child.kill('SIGTERM'); } catch (_) {}
    throw new Error('YouTube playback search was cancelled.');
  }
  const timeoutMs = Math.max(timeoutFloorMs, Math.min(requestedTimeoutMs, deadlineRemainingMs));
  const fallbackMessage = options.fallbackMessage || `yt-dlp failed via ${describeCommandStrategy(strategy)}.`;
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeoutId = null;
    const onStdout = (chunk) => { stdout += chunk.toString(); };
    const onStderr = (chunk) => { stderr += chunk.toString(); };
    const cleanup = () => {
      clearTimeout(timeoutId);
      abortSignal?.removeEventListener?.('abort', onAbort);
      child.stdout?.removeListener('data', onStdout);
      child.stderr?.removeListener('data', onStderr);
      child.removeListener('error', onError);
      child.removeListener('close', onClose);
    };
    const settleReject = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const settleResolve = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onError = (error) => {
      settleReject(new Error(describeYtDlpFailure(error?.message || stderr || stdout, fallbackMessage)));
    };
    const onAbort = () => {
      try { child.kill('SIGTERM'); } catch (_) {}
      settleReject(new Error('YouTube playback search was cancelled.'));
    };
    const onClose = (code) => {
      if (code !== 0) {
        settleReject(new Error(describeYtDlpFailure(stderr.trim() || stdout.trim(), fallbackMessage)));
        return;
      }
      try {
        settleResolve(JSON.parse(stdout || '{}'));
      } catch (error) {
        settleReject(new Error(error?.message || 'Unable to read YouTube Music search results.'));
      }
    };
    timeoutId = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch (_) {}
      settleReject(new Error(`YouTube Music search timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('error', onError);
    child.once('close', onClose);
    abortSignal?.addEventListener?.('abort', onAbort, { once: true });
    if (abortSignal?.aborted) onAbort();
  });
}

function getYtDlpEntryHttpHeaders(entry = {}) {
  const headers = entry?.http_headers && typeof entry.http_headers === 'object'
    ? { ...entry.http_headers }
    : {};
  return headers;
}

function getYtDlpFormatContentType(format = {}) {
  const explicitType = sanitizePlainText(format?.http_headers?.['Content-Type'] || format?.http_headers?.['content-type'] || '');
  if (explicitType) return explicitType;
  return sanitizePlainText(format?.protocol || '') === 'm3u8_native' ? 'application/vnd.apple.mpegurl' : '';
}

function isLikelyAudioYtDlpFormat(format = {}) {
  const url = sanitizePlainText(format?.url || '');
  if (!url) return false;
  const acodec = sanitizePlainText(format?.acodec || '').toLowerCase();
  const vcodec = sanitizePlainText(format?.vcodec || '').toLowerCase();
  if (acodec && acodec !== 'none' && (!vcodec || vcodec === 'none')) return true;
  return /audio/i.test(sanitizePlainText(format?.format || format?.format_note || ''));
}

function extractYtDlpAudioStream(parsed = {}) {
  const directCandidates = [
    parsed?.requested_downloads?.[0],
    parsed,
    ...(Array.isArray(parsed?.requested_formats) ? parsed.requested_formats : [])
  ].filter(Boolean);

  for (const candidate of directCandidates) {
    const url = sanitizePlainText(candidate?.url || '');
    if (!url) continue;
    return {
      url,
      headers: {
        ...getYtDlpEntryHttpHeaders(parsed),
        ...getYtDlpEntryHttpHeaders(candidate)
      },
      contentType: getYtDlpFormatContentType(candidate)
    };
  }

  const format = (Array.isArray(parsed?.formats) ? parsed.formats : [])
    .filter(isLikelyAudioYtDlpFormat)
    .sort((left, right) => {
      const leftBitrate = Number(left.abr || left.tbr || 0) || 0;
      const rightBitrate = Number(right.abr || right.tbr || 0) || 0;
      const leftM4a = sanitizePlainText(left.ext || '').toLowerCase() === 'm4a' ? 1 : 0;
      const rightM4a = sanitizePlainText(right.ext || '').toLowerCase() === 'm4a' ? 1 : 0;
      return (rightM4a - leftM4a) || (rightBitrate - leftBitrate);
    })[0];
  if (!format?.url) return null;
  return {
    url: sanitizePlainText(format.url),
    headers: {
      ...getYtDlpEntryHttpHeaders(parsed),
      ...getYtDlpEntryHttpHeaders(format)
    },
    contentType: getYtDlpFormatContentType(format)
  };
}

async function resolveOnlineTrackAudioStream(rawPayload = {}) {
  const payload = normalizeOnlineTrackDownloadPayload(rawPayload);
  let videoId = sanitizePlainText(payload.videoId || rawPayload.youtubeVideoId || '');
  let sourceUrl = sanitizePlainText(payload.canonicalUrl || '');

  if (!videoId && sourceUrl) {
    videoId = extractYouTubeVideoIdFromYtDlpEntry({ url: sourceUrl });
  }
  if (!sourceUrl && videoId) {
    sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;
  }
  if (!sourceUrl) {
    const resolved = await resolveOnlineTrackPlayback(rawPayload);
    videoId = sanitizePlainText(resolved?.videoId || '');
    sourceUrl = sanitizePlainText(resolved?.canonicalUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''));
  }
  if (!sourceUrl) {
    throw new Error('NexPlay could not resolve a YouTube audio stream for this track.');
  }

  const timeoutMs = Math.max(5000, Number(rawPayload.timeoutMs || ONLINE_AUDIO_STREAM_RESOLVE_TIMEOUT_MS) || ONLINE_AUDIO_STREAM_RESOLVE_TIMEOUT_MS);
  const parsed = await runYtDlpJson([
    ...YT_DLP_FAST_NETWORK_ARGS,
    '--no-playlist',
    '--dump-single-json',
    '--format', 'bestaudio[ext=m4a]/bestaudio/best',
    sourceUrl
  ], {
    timeoutMs,
    fallbackMessage: 'YouTube audio stream lookup failed.'
  });
  const stream = extractYtDlpAudioStream(parsed);
  if (!stream?.url) {
    throw new Error('NexPlay could not find a playable YouTube audio stream for this track.');
  }
  const streamVideoId = videoId || extractYouTubeVideoIdFromYtDlpEntry(parsed) || sanitizePlainText(parsed?.id || '');
  const token = createOnlineAudioStreamToken({
    url: stream.url,
    headers: stream.headers,
    title: sanitizePlainText(parsed?.title || payload.title || ''),
    videoId: streamVideoId,
    contentType: stream.contentType || 'audio/mp4'
  });
  return {
    videoId: streamVideoId,
    streamUrl: getOnlineAudioStreamUrl(token),
    streamToken: token,
    expiresAt: Date.now() + ONLINE_AUDIO_STREAM_TOKEN_TTL_MS,
    title: sanitizePlainText(parsed?.title || payload.title || ''),
    artist: getYtDlpEntryArtist(parsed, payload.artist),
    duration: parseYtDlpDurationSeconds(parsed?.duration || parsed?.duration_string || payload.duration || ''),
    resolver: 'yt-dlp-audio-stream',
    transportProvider: 'youtube-direct',
    transportProviderLabel: 'YouTube audio'
  };
}

async function searchYouTubeMusic(rawPayload = {}, options = {}) {
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : { query: rawPayload };
  const query = sanitizePlainText(payload.query || payload.q || '');
  if (!query) return { tracks: [], source: 'youtube-music' };
  const limit = Math.max(1, Math.min(50, Number(payload.limit || 24) || 24));
  const rawLimit = Math.min(50, Math.max(limit + 8, limit * 3));
  const searchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
  const timeoutMs = Math.max(3000, Math.min(ONLINE_MUSIC_SEARCH_TIMEOUT_MS, Number(payload.timeoutMs || ONLINE_MUSIC_SEARCH_TIMEOUT_MS) || ONLINE_MUSIC_SEARCH_TIMEOUT_MS));
  const parsed = await runYtDlpJson([
    ...YT_DLP_FAST_NETWORK_ARGS,
    '--ignore-errors',
    '--flat-playlist',
    '--dump-single-json',
    '--playlist-end', String(rawLimit),
    searchUrl
  ], {
    timeoutMs,
    signal: options.signal || null,
    fallbackMessage: 'YouTube Music search failed.'
  });
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  const seen = new Set();
  const tracks = [];
  for (const entry of entries) {
    const track = normalizeYouTubeMusicSearchEntry(entry, query);
    if (!track?.videoId || seen.has(track.videoId)) continue;
    seen.add(track.videoId);
    tracks.push(track);
    if (tracks.length >= limit) break;
  }
  return {
    tracks,
    source: 'youtube-music',
    query
  };
}

async function searchYouTubeMusicForSender(event, payload = {}) {
  const senderKey = String(event?.sender?.id || 'default');
  const previousController = activeOnlineMusicSearchBySender.get(senderKey);
  if (previousController && !previousController.signal.aborted) previousController.abort();
  const controller = new AbortController();
  activeOnlineMusicSearchBySender.set(senderKey, controller);
  try {
    return await searchYouTubeMusic(payload, { signal: controller.signal });
  } finally {
    if (activeOnlineMusicSearchBySender.get(senderKey) === controller) {
      activeOnlineMusicSearchBySender.delete(senderKey);
    }
  }
}

async function runOnlinePlaybackResolverSearch(spec, runtime, deadlineAt, signal = null) {
  const remainingMs = Math.floor(deadlineAt - runtime.now());
  if (remainingMs <= 0) {
    throw new Error('YouTube playback search deadline expired.');
  }
  const parsed = await runtime.runSearch(spec.args, {
    timeoutMs: remainingMs,
    deadlineAt,
    signal,
    allowSubsecondTimeout: true,
    fallbackMessage: 'YouTube playback search failed.'
  });
  return { spec, parsed };
}

function rankOnlinePlaybackResolverSearches(settledSearches, options = {}) {
  const searchErrors = settledSearches
    .filter((result) => result?.status === 'rejected')
    .map((result) => result.reason?.message || String(result.reason || ''))
    .filter(Boolean);
  const candidates = [];
  const normalizeEntry = typeof options.normalizeEntry === 'function' ? options.normalizeEntry : normalizePlaybackResolverEntry;
  for (const result of settledSearches) {
    if (result?.status !== 'fulfilled') continue;
    const entries = Array.isArray(result.value?.parsed?.entries) ? result.value.parsed.entries : [];
    for (const entry of entries) {
      const candidate = normalizeEntry(entry, {
        query: options.eligibilityQuery,
        sourceSurface: result.value.spec.sourceSurface,
        payload: options.payload,
        excludeVideoIds: options.excludeVideoIds
      });
      if (candidate) candidates.push(candidate);
    }
  }
  const seen = new Set();
  const ranked = candidates
    .filter((candidate) => {
      if (!candidate.videoId || seen.has(candidate.videoId)) return false;
      seen.add(candidate.videoId);
      return true;
    })
    .sort((left, right) => right.score - left.score);
  return { ranked, searchErrors };
}

const onlineTrackPlaybackResolverRuntime = createOnlinePlaybackResolverRuntime({
  cache: onlinePlaybackResolutionCache,
  inFlight: onlinePlaybackResolutionInFlight
});

async function resolveOnlineTrackPlayback(rawPayload = {}, resolverRuntime = onlineTrackPlaybackResolverRuntime) {
  const payload = normalizeOnlineTrackDownloadPayload(rawPayload);
  const excludeVideoIds = normalizeExcludedYouTubeVideoIds(rawPayload.excludeVideoIds || rawPayload.excludeVideoId || []);
  const composeResult = (candidateResolution) => {
    const best = cloneOnlinePlaybackCandidateResolution(candidateResolution);
    if (!best) return best;
    return {
      videoId: best.videoId,
      canonicalUrl: best.canonicalUrl || `https://www.youtube.com/watch?v=${best.videoId}`,
      title: payload.title,
      artist: payload.artist,
      resolvedTitle: best.title || '',
      resolvedArtist: best.artist || '',
      channelTitle: best.channelTitle || best.artist || payload.artist,
      channelId: best.channelId || '',
      thumbnail: best.thumbnail || '',
      cover: payload.cover || best.thumbnail || '',
      duration: best.duration || payload.duration || 0,
      resolver: best.resolver || 'yt-dlp',
      sourceSurface: best.sourceSurface || '',
      playableInEmbed: typeof best.playableInEmbed === 'boolean' ? best.playableInEmbed : null,
      playbackScore: best.score,
      excludedVideoIds: Array.from(excludeVideoIds)
    };
  };
  const searchLimit = Math.max(3, Math.min(Number(rawPayload.limit || ONLINE_PLAYBACK_SEARCH_LIMIT) || ONLINE_PLAYBACK_SEARCH_LIMIT, 12));
  const timeoutMs = Math.max(
    ONLINE_PLAYBACK_RESOLVE_TIMEOUT_MS,
    Math.min(30000, Number(rawPayload.timeoutMs || ONLINE_PLAYBACK_TOTAL_TIMEOUT_MS) || ONLINE_PLAYBACK_TOTAL_TIMEOUT_MS)
  );
  const cacheKey = createOnlinePlaybackResolverCacheKey(payload, excludeVideoIds, searchLimit);
  const inFlightKey = `${cacheKey}\n${timeoutMs}`;
  const cached = readOnlinePlaybackResolutionCache(resolverRuntime.cache, cacheKey, resolverRuntime.now());
  if (cached) return composeResult(cached);

  const activeRequest = resolverRuntime.inFlight.get(inFlightKey);
  if (activeRequest) {
    return activeRequest.then((result) => composeResult(result));
  }

  const baseQuery = [payload.artist, payload.title].filter(Boolean).join(' ');
  const queries = uniquePlainText([
    [payload.artist, payload.title, 'official audio'].filter(Boolean).join(' '),
    [payload.artist, payload.title].filter(Boolean).join(' ')
  ]);
  const musicQuery = baseQuery || queries[0] || '';
  const youtubeQueries = uniquePlainText([
    queries[0] || '',
    musicQuery
  ]).slice(0, 2);
  const eligibilityQuery = payload.title && payload.artist
    ? `${payload.title} by ${payload.artist}`
    : (baseQuery || musicQuery || youtubeQueries[0] || '');
  if (!eligibilityQuery) {
    throw new Error('Not enough metadata to resolve playback.');
  }

  const musicSearchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(musicQuery)}`;
  const searchSpecs = [
    {
      sourceSurface: 'youtube-music',
      query: musicQuery,
      args: [...YT_DLP_FAST_NETWORK_ARGS, '--ignore-errors', '--flat-playlist', '--dump-single-json', '--playlist-end', String(searchLimit), musicSearchUrl]
    },
    ...youtubeQueries.map((query) => ({
      sourceSurface: 'youtube',
      query,
      args: [...YT_DLP_FAST_NETWORK_ARGS, '--flat-playlist', '--dump-single-json', `ytsearch${searchLimit}:${query}`]
    }))
  ];
  const primarySearchSpec = searchSpecs.find((spec) => spec.sourceSurface === 'youtube');
  const secondarySearchSpec = searchSpecs.find((spec) => spec.sourceSurface === 'youtube' && spec !== primarySearchSpec) || null;
  const recoverySearchSpec = searchSpecs.find((spec) => spec.sourceSurface === 'youtube-music') || null;
  const resolutionTask = (async () => {
    const startedAt = resolverRuntime.now();
    const overallDeadlineAt = startedAt + timeoutMs;
    const attempts = new Set();
    const settledSearches = [];
    const rankSettledSearches = () => rankOnlinePlaybackResolverSearches(settledSearches, {
      eligibilityQuery,
      payload,
      excludeVideoIds,
      normalizeEntry: resolverRuntime.normalizeEntry
    });
    const startSearchAttempt = (spec) => {
      if (!spec) return null;
      const attemptStartedAt = resolverRuntime.now();
      const attemptDeadlineAt = Math.min(
        overallDeadlineAt,
        attemptStartedAt + resolverRuntime.searchAttemptTimeoutMs
      );
      if (attemptDeadlineAt <= attemptStartedAt) return null;
      const controller = new AbortController();
      const attempt = { controller, spec, promise: null };
      attempt.promise = runOnlinePlaybackResolverSearch(
        spec,
        resolverRuntime,
        attemptDeadlineAt,
        controller.signal
      ).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason })
      );
      attempts.add(attempt);
      return attempt;
    };
    const abortOutstandingAttempts = (except = null) => {
      attempts.forEach((attempt) => {
        if (attempt !== except) attempt.controller.abort();
      });
    };
    const settleNextAttempt = async () => {
      if (!attempts.size) return null;
      const completed = await Promise.race(Array.from(attempts, (attempt) => (
        attempt.promise.then((result) => ({ attempt, result }))
      )));
      attempts.delete(completed.attempt);
      settledSearches.push(completed.result);
      return completed.result;
    };

    try {
      const primaryAttempt = startSearchAttempt(primarySearchSpec);
      if (!primaryAttempt) throw new Error('YouTube playback search deadline expired.');

      // Preserve the normal fast path, but do not give a slow yt-dlp process the
      // whole resolver budget before starting one broader YouTube fallback.
      const softGateDelayMs = Math.max(0, Math.min(
        resolverRuntime.primarySearchTimeoutMs,
        overallDeadlineAt - resolverRuntime.now()
      ));
      let softGateTimerId = null;
      const softGatePromise = new Promise((resolve) => {
        softGateTimerId = resolverRuntime.setTimer(() => {
          softGateTimerId = null;
          resolve(null);
        }, softGateDelayMs);
      });
      const primaryBeforeGate = await Promise.race([
        primaryAttempt.promise.then((result) => ({ attempt: primaryAttempt, result })),
        softGatePromise
      ]);
      if (softGateTimerId !== null) {
        resolverRuntime.clearTimer(softGateTimerId);
        softGateTimerId = null;
      }
      if (primaryBeforeGate) {
        attempts.delete(primaryBeforeGate.attempt);
        settledSearches.push(primaryBeforeGate.result);
        const primaryBest = rankSettledSearches().ranked[0];
        if (isClearlyHighConfidencePrimaryPlaybackCandidate(primaryBest, payload)) {
          return createOnlinePlaybackCandidateResolution(primaryBest);
        }
      }

      startSearchAttempt(secondarySearchSpec);
      while (attempts.size) {
        await settleNextAttempt();
        const bestSoFar = rankSettledSearches().ranked[0];
        if (isClearlyHighConfidencePrimaryPlaybackCandidate(bestSoFar, payload)) {
          abortOutstandingAttempts();
          return createOnlinePlaybackCandidateResolution(bestSoFar);
        }
      }

      let ranking = rankSettledSearches();
      let best = ranking.ranked[0];
      if (!best?.videoId || best.score < 70) {
        // A final YouTube Music lookup receives its own bounded attempt window.
        // This is deliberately sequential so transient Windows process startup
        // does not create four competing yt-dlp instances under one deadline.
        const recoveryAttempt = startSearchAttempt(recoverySearchSpec);
        if (recoveryAttempt) await settleNextAttempt();
        ranking = rankSettledSearches();
        best = ranking.ranked[0];
      }

      if (!best?.videoId || best.score < 70) {
        const details = ranking.searchErrors.length ? ` ${ranking.searchErrors[ranking.searchErrors.length - 1]}` : '';
        throw new Error(`Unable to resolve a playable YouTube Music match for this track.${details}`.trim());
      }
      return createOnlinePlaybackCandidateResolution(best);
    } finally {
      abortOutstandingAttempts();
    }
  })();

  resolverRuntime.inFlight.set(inFlightKey, resolutionTask);
  try {
    const result = await resolutionTask;
    writeOnlinePlaybackResolutionCache(resolverRuntime.cache, cacheKey, result, {
      nowMs: resolverRuntime.now(),
      ttlMs: resolverRuntime.cacheTtlMs,
      maxEntries: resolverRuntime.cacheMaxEntries
    });
    return composeResult(result);
  } finally {
    if (resolverRuntime.inFlight.get(inFlightKey) === resolutionTask) {
      resolverRuntime.inFlight.delete(inFlightKey);
    }
  }
}

async function scanWatchFoldersNow() {
  const folders = [];
  for (const root of watchRoots) {
    const items = await collectMediaFilesFromDirectory(root.path);
    folders.push({
      ...root,
      items
    });
  }
  return {
    roots: watchRoots.map((root) => ({ ...root })),
    folders,
    scannedAt: Date.now()
  };
}

function clearWatchDisposers() {
  watchDisposers.splice(0).forEach((dispose) => {
    try { dispose(); } catch (_) {}
  });
}

function scheduleWatchScan(reason = 'change') {
  if (watchScanTimer) clearTimeout(watchScanTimer);
  watchScanTimer = setTimeout(async () => {
    watchScanTimer = null;
    const payload = await scanWatchFoldersNow();
    broadcastLibraryWatchUpdate({
      type: 'scan',
      reason,
      ...payload
    });
  }, 800);
}

async function startLibraryWatch(payload = {}) {
  const roots = Array.isArray(payload.roots) ? payload.roots : [];
  clearWatchDisposers();
  watchRoots = roots
    .map((root) => normalizeWatchRoot(root))
    .filter(Boolean);
  watchRoots.forEach((root) => {
    try {
      const watcher = fs.watch(root.path, { recursive: true }, () => {
        scheduleWatchScan('fs-watch');
      });
      watchDisposers.push(() => watcher.close());
    } catch (_) {}
  });
  const snapshot = await scanWatchFoldersNow();
  broadcastLibraryWatchUpdate({
    type: 'scan',
    reason: 'start',
    ...snapshot
  });
  return snapshot;
}

async function stopLibraryWatch() {
  clearWatchDisposers();
  watchRoots = [];
  return { stopped: true };
}

async function pickWatchFolders() {
  const selection = await dialog.showOpenDialog({
    title: 'Choose Watch Folders',
    buttonLabel: 'Watch Folders',
    properties: ['openDirectory', 'multiSelections', 'createDirectory']
  });
  if (selection.canceled || !selection.filePaths?.length) {
    return { cancelled: true, roots: [] };
  }
  return {
    cancelled: false,
    roots: selection.filePaths
      .map((folderPath) => normalizeWatchRoot({ path: folderPath }))
      .filter(Boolean)
  };
}

async function createWindow() {
  const port = await startLocalServer();
  await migrateDesktopShellCache(port);
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'NexPlay_N_final_256.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: PRELOAD_PATH
    }
  });
  const version = encodeURIComponent(app.getVersion());
  win.loadURL(`http://${HOST}:${port}/?nexplay_desktop_version=${version}`);
}

function focusExistingWindow() {
  const win = BrowserWindow.getAllWindows().find((candidate) => (
    candidate && (typeof candidate.isDestroyed !== 'function' || !candidate.isDestroyed())
  ));
  if (!win) return false;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
  return true;
}

registerTrustedIpcHandler(ONLINE_TRACK_DOWNLOAD_CHANNEL, async (event, payload) => {
  return enqueueOnlineTrackDownload(event.sender, payload);
});
registerTrustedIpcHandler(ONLINE_TRACK_RESOLVE_CHANNEL, async (_event, payload) => {
  return resolveOnlineTrackPlayback(payload);
});
registerTrustedIpcHandler(ONLINE_AUDIO_STREAM_RESOLVE_CHANNEL, async (_event, payload) => {
  return resolveOnlineTrackAudioStream(payload);
});
registerTrustedIpcHandler(ONLINE_MUSIC_SEARCH_CHANNEL, async (event, payload) => {
  return searchYouTubeMusicForSender(event, payload);
});
registerTrustedIpcHandler(ONLINE_RELEASE_DOWNLOAD_CHANNEL, async (event, payload) => {
  const request = normalizeOnlineReleaseDownloadPayload(payload);
  const job = createOnlineDownloadJob({
    kind: 'release',
    title: request.title,
    autoImport: request.autoImport,
    tracks: request.tracks
  }, event.sender);
  return enqueueOnlineDownloadJob(job);
});
registerTrustedIpcHandler(ONLINE_DOWNLOAD_CANCEL_CHANNEL, async (_event, jobId) => {
  const id = String(jobId || '').trim();
  const job = onlineDownloadJobs.find((candidate) => candidate.id === id);
  if (!job) return { cancelled: false };
  job.status = 'cancelled';
  job.message = 'Cancelling download...';
  job.updatedAt = Date.now();
  if (onlineDownloadActiveJobId === id && activeOnlineDownloadChild) {
    try { activeOnlineDownloadChild.kill('SIGTERM'); } catch (_) {}
  } else {
    try { job.resolve({ cancelled: true, jobId: id }); } catch (_) {}
  }
  broadcastOnlineDownloadQueue();
  return { cancelled: true, jobId: id };
});
registerTrustedIpcHandler(ONLINE_DOWNLOAD_CLEAR_CHANNEL, async (_event, mode) => {
  const requestedMode = String(mode || 'finished').trim().toLowerCase();
  if (requestedMode !== 'finished') {
    return { cleared: 0, remaining: onlineDownloadJobs.length, mode: requestedMode };
  }
  const terminalStatuses = new Set(['completed', 'completed_with_errors', 'error', 'cancelled']);
  const beforeCount = onlineDownloadJobs.length;
  onlineDownloadJobs = onlineDownloadJobs.filter((job) => !terminalStatuses.has(String(job?.status || '').trim()));
  const cleared = Math.max(0, beforeCount - onlineDownloadJobs.length);
  if (cleared > 0) broadcastOnlineDownloadQueue();
  return {
    cleared,
    remaining: onlineDownloadJobs.length,
    mode: requestedMode
  };
});
registerTrustedIpcHandler(WATCH_FOLDERS_PICK_CHANNEL, async () => {
  return pickWatchFolders();
});
registerTrustedIpcHandler(WATCH_FOLDERS_START_CHANNEL, async (_event, payload) => {
  return startLibraryWatch(payload);
});
registerTrustedIpcHandler(WATCH_FOLDERS_STOP_CHANNEL, async () => {
  return stopLibraryWatch();
});
registerTrustedIpcHandler(WATCH_FOLDERS_SCAN_CHANNEL, async () => {
  return scanWatchFoldersNow();
});
registerTrustedIpcHandler(LOCAL_MEDIA_PICK_CHANNEL, async (event) => {
  return pickLocalMediaFiles(event?.sender || null);
});
registerTrustedIpcHandler(LOCAL_LIBRARY_SAVE_INDEX_CHANNEL, async (_event, payload) => {
  return saveLocalLibraryIndex(payload || {});
});
registerTrustedIpcHandler(LOCAL_LIBRARY_LOAD_INDEX_CHANNEL, async () => {
  return loadLocalLibraryIndex();
});
registerTrustedIpcHandler(LOCAL_MEDIA_RESOLVE_PATHS_CHANNEL, async (_event, payload) => {
    return resolveLocalMediaPaths(payload || {});
});
registerTrustedIpcHandler(REMOTE_JSON_FETCH_CHANNEL, async (_event, payload) => {
  return fetchApprovedRemoteJson(payload || {});
});

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    focusExistingWindow();
  });

  app.whenReady().then(async () => {
    try {
      await createWindow();
    } catch (error) {
      dialog.showErrorBox('NexPlay startup failed', error?.message || 'Unable to start the local NexPlay server.');
      app.quit();
      return;
    }
    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        try {
          await createWindow();
        } catch (error) {
          dialog.showErrorBox('NexPlay startup failed', error?.message || 'Unable to start the local NexPlay server.');
          app.quit();
        }
      }
    });
  });
}

app.on('before-quit', () => {
  clearWatchDisposers();
  stopLocalServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
