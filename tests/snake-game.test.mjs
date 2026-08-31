import test from 'node:test';
import assert from 'node:assert/strict';
import { readNexPlaySource } from './source-fixture.mjs';

const html = readNexPlaySource();

/**
 * @param {string} startNeedle
 * @param {string} endNeedle
 */
function sliceBetween(startNeedle, endNeedle) {
    const start = html.indexOf(startNeedle);
    const end = html.indexOf(endNeedle, start + startNeedle.length);
    assert.notEqual(start, -1, `Missing start marker: ${startNeedle}`);
    assert.notEqual(end, -1, `Missing end marker after ${startNeedle}: ${endNeedle}`);
    return html.slice(start, end);
}

test('Snake uses requestAnimationFrame timing and clears animation handles', () => {
    const clearTimer = sliceBetween('function clearMusicGameSnakeTimer', 'function clearMusicGameSongRaceTimer');
    assert.match(clearTimer, /clearInterval\(snake\.tickTimerId\)/);
    assert.match(clearTimer, /cancelAnimationFrame\(snake\.rafId\)/);
    assert.match(clearTimer, /snake\.lastStepAt = 0/);

    const loop = sliceBetween('function runMusicGameSnakeFrame', 'function startMusicGameSnake');
    assert.match(loop, /requestAnimationFrame\(runMusicGameSnakeFrame\)/);
    assert.match(loop, /now - snake\.lastStepAt >= stepMs/);
    assert.match(loop, /steps < 3/);
    assert.match(loop, /advanceMusicGameSnake\(\)/);

    const start = sliceBetween('function startMusicGameSnake', 'function pauseMusicGameSnake');
    assert.doesNotMatch(start, /setInterval\(\(\) => advanceMusicGameSnake/);
    assert.match(start, /startMusicGameSnakeLoop\(\)/);
});

test('Snake segments render from previous grid cells for smooth motion', () => {
    assert.match(html, /@keyframes musicSnakeSlideStep/);
    assert.match(html, /translate3d\(calc\(var\(--snake-shift-x/);
    assert.match(html, /--snake-gap-x/);
    assert.match(html, /--snake-gap-y/);

    const render = sliceBetween('function renderMusicGameSnakeRuntime', 'function syncSnakeGameDom');
    assert.match(render, /motionFrom/);
    assert.match(render, /getMusicGameSnakeSegmentMotionStyle\(segment, motionFrom\[segmentIndex\]\)/);
    assert.match(render, /--music-snake-step-ms:\$\{Math\.max\(140, Math\.floor\(Number\(snake\.speedMs/);

    const advance = sliceBetween('function advanceMusicGameSnake', 'function createMusicGameSongRaceLane');
    assert.match(advance, /previousSnakeCells = snake\.snake\.map/);
    assert.match(advance, /snake\.motionFrom = snake\.snake\.map/);
    assert.match(advance, /snake\.motionSerial = Number\(snake\.motionSerial \|\| 0\) \+ 1/);
});
