import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname, '..');
const port = Number(process.env.PORT || process.env.NEXPLAY_OFFLINE_PORT || 5177);
const host = process.env.HOST || '127.0.0.1';

const contentTypes = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.cjs', 'text/javascript; charset=utf-8'],
    ['.mjs', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.webmanifest', 'application/manifest+json; charset=utf-8'],
    ['.png', 'image/png'],
    ['.ico', 'image/x-icon'],
    ['.svg', 'image/svg+xml; charset=utf-8'],
    ['.mp3', 'audio/mpeg'],
    ['.wav', 'audio/wav'],
    ['.ogg', 'audio/ogg'],
    ['.mp4', 'video/mp4'],
    ['.webm', 'video/webm']
]);

function sendText(response, statusCode, text) {
    response.writeHead(statusCode, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store'
    });
    response.end(text);
}

function resolveRequestPath(urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0] || '/');
    const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
    const relative = normalized === sep ? 'index.html' : normalized.replace(/^[/\\]+/, '');
    const target = resolve(join(root, relative));
    if (target !== root && !target.startsWith(root + sep)) return null;
    return target;
}

const server = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendText(response, 405, 'Method not allowed.');
        return;
    }

    const target = resolveRequestPath(request.url || '/');
    if (!target) {
        sendText(response, 403, 'Forbidden.');
        return;
    }

    let filePath = target;
    try {
        const info = await stat(filePath);
        if (info.isDirectory()) filePath = join(filePath, 'index.html');
    } catch (_) {
        filePath = join(root, '404.html');
    }

    try {
        const info = await stat(filePath);
        if (!info.isFile()) {
            sendText(response, 404, 'Not found.');
            return;
        }

        const type = contentTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream';
        response.writeHead(filePath.endsWith('404.html') ? 404 : 200, {
            'content-type': type,
            'content-length': info.size,
            'cache-control': 'no-cache'
        });
        if (request.method === 'HEAD') {
            response.end();
            return;
        }
        createReadStream(filePath).pipe(response);
    } catch (error) {
        sendText(response, 500, error?.message || 'Server error.');
    }
});

server.listen(port, host, () => {
    console.log(`NexPlay Offline Web is running at http://${host}:${port}/`);
    console.log(`Serving only local files from ${root}`);
});
