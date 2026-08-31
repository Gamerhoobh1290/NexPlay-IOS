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

test('NexBeat Tiles is registered inside Music Games with persisted state', () => {
    assert.match(html, /id:\s*'piano-tiles'/);
    assert.match(html, /title:\s*'NexBeat Tiles'/);
    assert.match(html, /beatmaps:\s*'nexplay_piano_tiles_beatmaps_v2'/);
    assert.match(html, /scores:\s*'nexplay_piano_tiles_scores_v1'/);
    assert.match(html, /keyBindings:\s*'nexplay_piano_tiles_keybindings_v1'/);
    assert.match(html, /const PIANO_TILES_LANE_COUNT = 3/);
    assert.match(html, /const PIANO_TILES_DEFAULT_KEYS = Object\.freeze\(\['Numpad1', 'Numpad2', 'Numpad3'\]\)/);
    assert.match(html, /const PIANO_TILES_DEFAULT_BINDINGS = Object\.freeze/);
    assert.match(html, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(html, /music-games-piano-key-strip/);

    const viewSwitch = sliceBetween('function renderMusicGamesGameView()', 'function renderMusicGames()');
    assert.match(viewSwitch, /case 'piano-tiles':\s*return renderPianoTilesGame\(\);/);

    const keydown = sliceBetween('function handleMusicGamesKeydown', 'function buildMemoryPlaylistRoundData');
    assert.match(keydown, /handlePianoTilesKeydown\(event\)/);

    const teardown = sliceBetween('async function teardownMusicGamesSession', 'async function openMusicGame');
    assert.match(teardown, /stopPianoTilesSession\(\{ restorePlayback: false, resetPhase: false \}\)/);
});

test('NexBeat Tiles beatmaps use audio-derived analysis with cache and streaming fallback', () => {
    const decodedAnalysis = sliceBetween('async function buildPianoTilesBeatmapFromAudioBuffer', 'function generateFallbackPianoTilesBeatmap');
    assert.match(decodedAnalysis, /energies/);
    assert.match(decodedAnalysis, /onsets/);
    assert.match(decodedAnalysis, /rawPeaks/);
    assert.match(decodedAnalysis, /bpmEstimate/);
    assert.match(decodedAnalysis, /candidates\.sort/);
    assert.match(decodedAnalysis, /buildPianoTilesPatternedTiles\(candidates/);
    assert.doesNotMatch(decodedAnalysis, /Math\.random/);

    const patternPlanner = sliceBetween('function createPianoTilesLanePlanner', 'function quantizePianoTilesNoteTime');
    assert.match(patternPlanner, /fastWideGap/);
    assert.match(patternPlanner, /bounceGap/);
    assert.match(patternPlanner, /maxSameRun/);
    assert.match(html, /const PIANO_TILES_PATTERN_LIBRARY = Object\.freeze/);

    const analyzeTrack = sliceBetween('async function analyzePianoTilesTrack', 'async function startPianoTilesFromSelection');
    assert.match(analyzeTrack, /getCachedPianoTilesBeatmap\(track\)/);
    assert.match(analyzeTrack, /persistPianoTilesBeatmap\(track, beatmap\)/);
    assert.match(analyzeTrack, /generateFallbackPianoTilesBeatmap\(track,/);
    assert.match(analyzeTrack, /'streaming-tempo-grid'/);
});

test('NexBeat Tiles gameplay protects playback restore, scoring, and cleanup paths', () => {
    const start = sliceBetween('async function startPianoTilesFromSelection', 'function selectPianoTilesTrack');
    const snapshotIndex = start.indexOf('captureMusicGamePlaybackSnapshot()');
    const analyzeIndex = start.indexOf('analyzePianoTilesTrack(track');
    assert.ok(snapshotIndex >= 0 && analyzeIndex > snapshotIndex, 'playback snapshot must be captured before analysis starts');
    assert.match(start, /games\.preview\.suppressMetrics = true/);
    assert.match(start, /safePauseMedia\(els\.audio\)/);
    assert.match(start, /deactivateOnlineMusicTransport/);
    assert.match(start, /restoreMusicGamePlayback\(\)/);

    const finish = sliceBetween('async function finishPianoTilesRun', 'function tickPianoTilesGameplay');
    assert.match(finish, /previousScore = getPianoTilesScoreForTrack\(track\)/);
    assert.match(finish, /piano\.newHighScore = Number\(piano\.score \|\| 0\) > Number\(previousScore\.highScore \|\| 0\)/);
    assert.match(finish, /persistPianoTilesScore\(track,/);

    const cleanup = sliceBetween('function clearPianoTilesRuntimeDom', 'async function stopPianoTilesSession');
    assert.match(cleanup, /cancelAnimationFrame/);
    assert.match(cleanup, /clearTimeout/);
    assert.match(cleanup, /activeKeyTimers\.clear\(\)/);
    assert.match(cleanup, /tileElements\.clear\(\)/);
    assert.match(cleanup, /pianoTilesRuntime\.tiles = \[\]/);
});

test('NexBeat Tiles keymaps are editable from the lane strip and persist automatically', () => {
    const keyStrip = sliceBetween('function renderPianoTilesKeyStrip', 'function renderPianoTilesStartScreen');
    assert.match(keyStrip, /editable: false/);
    assert.match(keyStrip, /startPianoTilesKeyCapture\(\$\{lane\}\)/);
    assert.match(keyStrip, /data-piano-key-lane="\$\{lane\}"/);
    assert.match(keyStrip, /is-capturing/);
    assert.match(keyStrip, /Press any key\.\.\./);
    assert.match(keyStrip, /piano\.bindingLaneIndex !== null && Number\(piano\.bindingLaneIndex\) === lane/);

    const startScreen = sliceBetween('function renderPianoTilesStartScreen', 'function renderPianoTilesAnalyzingScreen');
    assert.match(startScreen, /Controls/);
    assert.match(startScreen, /Duplicate lane keys are blocked/);
    assert.match(startScreen, /renderPianoTilesKeyStrip\(bindings, \{ editable: true \}\)/);
    assert.match(startScreen, /resetPianoTilesKeyBindings\(\)/);

    const capture = sliceBetween('function startPianoTilesKeyCapture', 'function resetPianoTilesKeyBindings');
    assert.match(capture, /piano\.phase === 'gameplay' \|\| piano\.isRunning/);
    assert.match(capture, /piano\.bindingLaneIndex = Math\.max/);
    assert.match(capture, /Press any key for Lane/);

    const assign = sliceBetween('function assignPianoTilesKeyBinding', 'function pulsePianoTilesLane');
    assert.match(assign, /persistPianoTilesKeyBindings\(result\.bindings\)/);
    assert.match(assign, /conflictLane/);

    const persist = sliceBetween('function persistPianoTilesKeyBindings', 'function getPianoTilesKeyLabel');
    assert.match(persist, /getPianoTilesKeyBindingManager\(\)\.save\(bindings\)/);

    const keydown = sliceBetween('function handlePianoTilesKeydown', 'async function waitForMusicGamePreviewToEnd');
    assert.match(keydown, /piano\.bindingLaneIndex !== null && piano\.phase !== 'gameplay' && !piano\.isRunning/);
    assert.match(keydown, /assignPianoTilesKeyBinding\(piano\.bindingLaneIndex, event\)/);
    assert.match(keydown, /getPianoTilesLaneForKeyboardEvent\(event\)/);
});

test('NexBeat Tiles keybinding manager prevents duplicates and stores full binding records', () => {
    const manager = sliceBetween('function createNexPlayKeybindingManager', 'let pianoTilesKeyBindingManager = null');
    assert.match(manager, /allowDuplicates !== true/);
    assert.match(manager, /conflictLane/);
    assert.match(manager, /display: getReadableKeyBindingLabel/);
    assert.match(manager, /findLaneForEvent/);
    assert.match(manager, /sanitizeKeyBindingToken/);
});
