const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');

const APP_ROOT = __dirname;
const START_PAGE = path.join(APP_ROOT, 'NexPlay.html');
const ICON_PATH = path.join(APP_ROOT, 'assets', 'nexplay-offline-icon.ico');
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

function isTrustedMetadataUrl(parsed) {
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) return false;
  const hostname = String(parsed.hostname || '').toLowerCase();
  if (hostname.endsWith('.mzstatic.com') || hostname.endsWith('.dzcdn.net')) return true;
  if (hostname === 'lrclib.net') return parsed.pathname.startsWith('/api/');
  if (hostname === 'api.lyrics.ovh') return parsed.pathname.startsWith('/v1/');
  if (hostname === 'itunes.apple.com') {
    return parsed.pathname === '/search'
      && parsed.searchParams.has('callback')
      && parsed.searchParams.get('media') === 'music'
      && parsed.searchParams.get('limit') === '1';
  }
  if (hostname === 'api.deezer.com') {
    return parsed.pathname === '/search'
      && parsed.searchParams.get('output') === 'jsonp'
      && parsed.searchParams.has('callback')
      && parsed.searchParams.get('limit') === '1';
  }
  return false;
}

function isAllowedRequest(url = '', resourceType = '') {
  try {
    const parsed = new URL(String(url || ''));
    if (['file:', 'data:', 'blob:', 'about:', 'devtools:'].includes(parsed.protocol)) return true;
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:')
    && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
      return true;
    }
    if (isTrustedMetadataUrl(parsed)) return resourceType !== 'image';
  } catch (_) {
    return true;
  }
  return false;
}

function installOfflineNetworkGuard() {
  const filter = { urls: ['*://*/*'] };
  session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    callback({ cancel: !isAllowedRequest(details.url, details.resourceType) });
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' data: blob: file: about:; script-src 'self' 'unsafe-inline' blob: https://itunes.apple.com https://api.deezer.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: file: https://*.mzstatic.com https://*.dzcdn.net; media-src 'self' data: blob: file:; connect-src 'self' https://itunes.apple.com https://api.deezer.com https://lrclib.net https://api.lyrics.ovh https://*.mzstatic.com https://*.dzcdn.net; worker-src 'self' blob:; frame-src 'none'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self';"
        ]
      }
    });
  });
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#050505',
    title: 'NexPlay Offline',
    icon: ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedRequest(url)) return { action: 'allow' };
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (isAllowedRequest(url)) return;
    event.preventDefault();
  });

  window.loadFile(START_PAGE);
  return window;
}

app.setName('NexPlay Offline');

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  installOfflineNetworkGuard();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedRequest(url)) return { action: 'allow' };
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (isAllowedRequest(url)) return;
    event.preventDefault();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
  event.preventDefault();
  callback(false);
});
