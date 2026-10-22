import assert from 'node:assert/strict';
import fs from 'node:fs';
import test, { mock } from 'node:test';

const source = fs.readFileSync(new URL('../js/legacy/settings-and-video.js', import.meta.url), 'utf8');

/** @param {string} name */
function extractFunction(name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} should exist in settings-and-video.js`);
    let depth = 0;
    let seenBody = false;
    for (let i = start; i < source.length; i += 1) {
        const char = source[i];
        if (char === '{') {
            depth += 1;
            seenBody = true;
        } else if (char === '}') {
            depth -= 1;
            if (seenBody && depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`Could not find the end of ${name}`);
}

/**
 * Run the real desktop setSleepTimer against a fake player.
 * @param {{ onlineActive: boolean, onlinePlaying: boolean }} options
 */
function loadSleepTimer({ onlineActive, onlinePlaying }) {
    const state = { sleepTimer: null, isPlaying: true };
    const els = { sleepLabel: { textContent: '' }, audio: { paused: false } };
    const calls = { localPause: 0, onlineToggle: 0 };
    const factory = new Function(
        'state', 'els', 'document', 'safePauseMedia', 'updatePlayIcons',
        'isOnlineMusicPlaybackActive', 'getOnlineMusicState', 'toggleOnlineMusicPlayback',
        `${extractFunction('setSleepTimer')}; return setSleepTimer;`
    );
    const setSleepTimer = factory(
        state,
        els,
        { getElementById: () => null },
        () => { calls.localPause += 1; },
        () => {},
        () => onlineActive,
        () => ({ isPlaying: onlinePlaying }),
        () => { calls.onlineToggle += 1; }
    );
    return { setSleepTimer, state, els, calls };
}

test('an elapsed desktop sleep timer pauses online playback, not just the local element', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const timer = loadSleepTimer({ onlineActive: true, onlinePlaying: true });
        timer.setSleepTimer(1);
        mock.timers.tick(60000);
        assert.equal(timer.calls.onlineToggle, 1, 'the YouTube transport should be paused');
        assert.equal(timer.els.sleepLabel.textContent, 'Sleep');
    } finally {
        mock.timers.reset();
    }
});

test('an elapsed desktop sleep timer pauses local playback without touching online playback', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const timer = loadSleepTimer({ onlineActive: false, onlinePlaying: false });
        timer.setSleepTimer(1);
        mock.timers.tick(60000);
        assert.equal(timer.calls.localPause, 1);
        assert.equal(timer.calls.onlineToggle, 0, 'toggling a paused online player would start it');
        assert.equal(timer.state.isPlaying, false);
    } finally {
        mock.timers.reset();
    }
});
