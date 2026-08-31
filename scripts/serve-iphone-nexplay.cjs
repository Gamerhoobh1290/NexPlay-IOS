const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || process.argv[2] || 5000);
const host = process.env.HOST || '0.0.0.0';

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.cjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json'],
  ['.ico', 'image/x-icon'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.gif', 'image/gif'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
  ['.oga', 'audio/ogg'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.flac', 'audio/flac'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.mov', 'video/quicktime'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

function localIPv4Addresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

function safeFilePath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath || '/');
  const normalizedPath = decodedPath === '/' ? '/NexPlay.mobile.html' : decodedPath;
  const relativePath = normalizedPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);

  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    return null;
  }

  return filePath;
}

function writeResponse(res, statusCode, headers, body) {
  res.writeHead(statusCode, {
    'Cache-Control': 'no-cache',
    ...headers,
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url || '/';
  const urlPath = rawUrl.split('?')[0];
  const method = String(req.method || 'GET').toUpperCase();

  if (method !== 'GET' && method !== 'HEAD') {
    writeResponse(res, 405, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Only GET and HEAD are supported');
    return;
  }

  if (urlPath === '/__nexplay_health') {
    writeResponse(res, 200, { 'Content-Type': 'application/json; charset=utf-8' }, method === 'HEAD' ? '' : JSON.stringify({ status: 'ok', app: 'nexplay-iphone-web', port }));
    return;
  }

  const filePath = safeFilePath(urlPath);
  if (!filePath) {
    writeResponse(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, method === 'HEAD' ? '' : 'Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      const notFoundPath = path.join(root, '404.html');
      fs.readFile(notFoundPath, (fallbackError, fallback) => {
        if (fallbackError) {
          writeResponse(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, method === 'HEAD' ? '' : 'Not found');
          return;
        }

        writeResponse(res, 404, { 'Content-Type': 'text/html; charset=utf-8' }, method === 'HEAD' ? '' : fallback);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    writeResponse(
      res,
      200,
      { 'Content-Type': mimeTypes.get(ext) || 'application/octet-stream' },
      method === 'HEAD' ? '' : data
    );
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try: npm run serve:iphone -- 5001`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log('NexPlay iPhone test server is running.');
  console.log(`Local:   http://localhost:${port}/NexPlay.mobile.html`);
  for (const address of localIPv4Addresses()) {
    console.log(`iPhone:  http://${address}:${port}/NexPlay.mobile.html`);
  }
  console.log('');
  console.log('Keep this window open while testing on your iPhone.');
});
