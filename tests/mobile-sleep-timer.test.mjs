import assert from 'node:assert/strict';
import fs from 'node:fs';
import test, { mock } from 'node:test';

const mobile = fs.readFileSync(new URL('../NexPlay.mobile.html', import.meta.url), 'utf8');

/**
 * Pull a top-level function's source out of the shell by brace matching so the
 * tests exercise the real implementation rather than a copy of it.
 * @param {string} name
 */
function extractFunction(name) {
    const start = mobile.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} should exist in the mobile shell`);
    let depth = 0;
    let seenBody = false;
    for (let i = start; i < mobile.length; i += 1) {
        const char = mobile[i];
        if (char === '{') {
            depth += 1;
            seenBody = true;
        } else if (char === '}') {
            depth -= 1;
            if (seenBody && depth === 0) return mobile.slice(start, i + 1);
        }
    }
    throw new Error(`Could not find the end of ${name}`);
}

/** Build an isolated scope holding the real setSleepTimer and its helper. */
function loadSleepTimer({ sleepLabel = null, pauseTransport } = {}) {
    const state = { sleepTimer: null, sleepTimerEndsAt: 0, sleepTimerMinutes: 0, isPlaying: true, activeTab: 'settings' };
    const els = { sleepLabel, audio: { paused: false, pause() { this.paused = true; } } };
    const calls = { pause: 0, updatePlayIcons: 0, toasts: [], renders: 0 };

    const factory = new Function(
        'state', 'els', 'document', 'showToast', 'updatePlayIcons',
        'renderSettingsTab', 'pauseActivePlaybackTransport', 'calls',
        `${extractFunction('setSleepTimer')}
         ${extractFunction('getSleepTimerRemainingMinutes')}
         ${extractFunction('syncSleepTimerSurface')}
         return { setSleepTimer, getSleepTimerRemainingMinutes };`
    );

    const api = factory(
        state,
        els,
        { getElementById: () => null },
        (message) => calls.toasts.push(message),
        () => { calls.updatePlayIcons += 1; },
        () => { calls.renders += 1; },
        pauseTransport === undefined
            ? undefined
            : () => { calls.pause += 1; pauseTransport?.(); },
        calls
    );
    return { ...api, state, els, calls };
}

test('setSleepTimer does not crash when the shell has no #sleep-label', () => {
    // The mobile shell omits #sleep-label; the desktop-era code dereferenced it
    // unconditionally, which threw before the timer was ever scheduled.
    const timer = loadSleepTimer({ sleepLabel: null, pauseTransport: () => {} });
    assert.doesNotThrow(() => timer.setSleepTimer(15));
    assert.equal(timer.state.sleepTimerMinutes, 15);
    assert.ok(timer.state.sleepTimer, 'a timeout should be scheduled');
    timer.setSleepTimer(0);
});

test('setSleepTimer still updates the label when one exists', () => {
    const sleepLabel = { textContent: '' };
    const timer = loadSleepTimer({ sleepLabel, pauseTransport: () => {} });
    timer.setSleepTimer(30);
    assert.equal(sleepLabel.textContent, '30m');
    timer.setSleepTimer(0);
    assert.equal(sleepLabel.textContent, 'Sleep');
});

test('an elapsed sleep timer pauses the active transport and clears its state', () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    try {
        const timer = loadSleepTimer({ pauseTransport: () => {} });
        timer.setSleepTimer(15);
        assert.equal(timer.calls.pause, 0, 'must not pause before the deadline');

        mock.timers.tick(15 * 60000);

        assert.equal(timer.calls.pause, 1, 'should pause through the shared transport');
        assert.equal(timer.state.isPlaying, false);
        assert.equal(timer.state.sleepTimer, null);
        assert.equal(timer.state.sleepTimerMinutes, 0);
        assert.equal(timer.state.sleepTimerEndsAt, 0);
        assert.equal(timer.calls.toasts.length, 1);
    } finally {
        mock.timers.reset();
    }
});

test('it falls back to the local element when no shared transport exists', () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    try {
        const timer = loadSleepTimer({ pauseTransport: undefined });
        timer.setSleepTimer(15);
        mock.timers.tick(15 * 60000);
        assert.equal(timer.els.audio.paused, true, 'local audio should be paused');
    } finally {
        mock.timers.reset();
    }
});

test('choosing a new duration replaces the pending timer instead of stacking', () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    try {
        const timer = loadSleepTimer({ pauseTransport: () => {} });
        timer.setSleepTimer(15);
        timer.setSleepTimer(45);
        assert.equal(timer.state.sleepTimerMinutes, 45);

        mock.timers.tick(15 * 60000);
        assert.equal(timer.calls.pause, 0, 'the replaced 15m timer must not fire');

        mock.timers.tick(30 * 60000);
        assert.equal(timer.calls.pause, 1, 'only the 45m timer should fire');
    } finally {
        mock.timers.reset();
    }
});

test('turning the timer off cancels a pending stop', () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    try {
        const timer = loadSleepTimer({ pauseTransport: () => {} });
        timer.setSleepTimer(15);
        timer.setSleepTimer(0);
        assert.equal(timer.state.sleepTimerMinutes, 0);

        mock.timers.tick(60 * 60000);
        assert.equal(timer.calls.pause, 0, 'a cancelled timer must never pause playback');
    } finally {
        mock.timers.reset();
    }
});

test('remaining minutes count down and never go negative', () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    try {
        const timer = loadSleepTimer({ pauseTransport: () => {} });
        timer.setSleepTimer(30);
        assert.equal(timer.getSleepTimerRemainingMinutes(), 30);

        mock.timers.tick(10 * 60000);
        assert.equal(timer.getSleepTimerRemainingMinutes(), 20);

        mock.timers.tick(30 * 60000);
        assert.equal(timer.getSleepTimerRemainingMinutes(), 0);
    } finally {
        mock.timers.reset();
    }
});

test('Playlists is reachable from the mobile library filters', () => {
    // renderPlaylists() was already wired for mobile, but the filter list gates
    // both the chip rendering and the setMobileLibraryTab guard.
    const filters = mobile.match(/const MOBILE_LIBRARY_FILTERS = Object\.freeze\(\[[\s\S]*?\]\);/);
    assert.ok(filters, 'expected MOBILE_LIBRARY_FILTERS to exist');
    assert.match(filters[0], /id: 'playlists', label: 'Playlists'/);
    assert.match(mobile, /state\.activeTab === 'playlists'\)\s*\{\s*renderPlaylists\(\);/);
});

test('the sleep timer is exposed in mobile settings, not only the command palette', () => {
    assert.match(mobile, /Sleep timer</);
    assert.match(mobile, /setSleepTimer\(\$\{minutes\}\)/);
    assert.match(mobile, /\[0, 15, 30, 45, 60\]/);
});
