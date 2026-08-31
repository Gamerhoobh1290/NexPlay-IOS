// @ts-nocheck -- Focused VM harness uses minimal DOM and timer doubles.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/legacy/online-playlists.js', import.meta.url), 'utf8');

function sliceRequired(startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.notEqual(start, -1, `Missing ${startMarker}`);
    assert.notEqual(end, -1, `Missing ${endMarker}`);
    return source.slice(start, end);
}

test('timed-out JSONP requests absorb one-minute late responses without leaking callbacks forever', async () => {
    const scheduled = new Map();
    let timerId = 0;
    let appendedScript = null;
    const window = {
        location: { href: 'http://127.0.0.1:8765/index.html' },
        NexPlayDesktop: null,
        setTimeout(callback, delay) {
            const id = ++timerId;
            scheduled.set(id, { callback, delay });
            return id;
        }
    };
    const body = {
        appendChild(script) {
            appendedScript = script;
            script.parentNode = body;
        },
        removeChild(script) {
            if (appendedScript === script) appendedScript = null;
            script.parentNode = null;
        }
    };
    const document = {
        body,
        createElement() {
            return { parentNode: null, async: false, onerror: null, src: '' };
        }
    };
    const context = vm.createContext({
        URL,
        clearTimeout(id) {
            scheduled.delete(id);
        },
        console,
        document,
        window
    });
    const functionSource = sliceRequired('function fetchJsonpPayload', 'async function fetchJsonPayload');
    new vm.Script(`${functionSource}; globalThis.__fetchJsonpPayload = fetchJsonpPayload;`).runInContext(context);

    const request = context.__fetchJsonpPayload('https://itunes.apple.com/search?term=test', {
        callbackPrefix: 'nexplay_test_',
        timeoutMs: 1000,
        errorMessage: 'Timed out.'
    });
    const callbackName = new URL(appendedScript.src).searchParams.get('callback');
    assert.ok(callbackName);

    const timeoutRecord = Array.from(scheduled.values()).find((record) => record.delay === 1000);
    assert.ok(timeoutRecord, 'request timeout should be armed');
    timeoutRecord.callback();
    await assert.rejects(request, /Timed out/);

    assert.equal(typeof window[callbackName], 'function');
    assert.doesNotThrow(() => window[callbackName]({ results: [] }));
    const retirementRecord = Array.from(scheduled.values()).find((record) => record.delay === 60_000);
    assert.ok(retirementRecord, 'late callback should have a bounded retirement timer');
    retirementRecord.callback();
    assert.equal(Object.hasOwn(window, callbackName), false);
});
