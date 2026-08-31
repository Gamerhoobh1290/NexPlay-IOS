const encodedExpression = process.argv[2] || '';
if (!encodedExpression) {
    throw new Error('Pass a base64-encoded JavaScript expression.');
}
const requestedPort = Number(process.argv[3] || 9222);
const debugPort = Number.isInteger(requestedPort) && requestedPort >= 1 && requestedPort <= 65535
    ? requestedPort
    : 9222;

const expression = Buffer.from(encodedExpression, 'base64').toString('utf8');
const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json());
const page = targets.find((target) => target.type === 'page' && String(target.url || '').startsWith('http://localhost:5000/'));
if (!page?.webSocketDebuggerUrl) {
    throw new Error(`The NexPlay desktop page was not found on port ${debugPort}.`);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;

socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data || '{}'));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message || 'CDP request failed.'));
    else request.resolve(message.result || {});
});

await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
});

function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
}

try {
    await send('Runtime.enable');
    const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: false
    });
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed.');
    }
    process.stdout.write(`${JSON.stringify(result.result?.value ?? null, null, 2)}\n`);
} finally {
    socket.close();
}
