import test from 'node:test';
import assert from 'node:assert/strict';
import { readNexPlaySource } from './source-fixture.mjs';

const html = readNexPlaySource();

test('private session launches from settings as a dedicated route, not a nav tab', () => {
    assert.doesNotMatch(html, /id:\s*'private-session'/);
    assert.doesNotMatch(html, /changeTab\('private-session'\)/);
    assert.doesNotMatch(html, /id="private-session-hub"/);
    assert.match(html, /Start Private Session/);
    assert.match(html, /id="settings-private-session-launcher"/);
    assert.match(html, /id="settings-private-session-hero-launcher"/);
    assert.match(html, /window\.location\.hash\s*=\s*'private-session'/);
});

test('private session has explicit hash-route wiring and a dedicated page renderer', () => {
    assert.match(html, /function getAppRouteFromHash\(hash = ''\)/);
    assert.match(html, /function applyAppRoute\(route = 'app', options = \{\}\)/);
    assert.match(html, /window\.addEventListener\('hashchange', handlePrivateSessionRouteChange\)/);
    assert.match(html, /function renderPrivateSessionPage\(\)/);
    assert.match(html, /if \(isPrivateSessionRoute\) \{\s*renderPrivateSessionPage\(\);\s*return;\s*\}/s);
});

test('private session no longer uses the removed preview player flow', () => {
    assert.doesNotMatch(html, /privateSessionPreviewAudio/);
    assert.doesNotMatch(html, /private-session-preview-panel/);
    assert.doesNotMatch(html, /previewPrivateSessionTrack\(/);
    assert.doesNotMatch(html, /togglePrivateSessionPreviewPlayback\(/);
    assert.match(html, /function playPrivateSessionTrack\(trackId = '', collectionKey = 'temporary'\)/);
});

test('private session guards persistence and uses a private shared-player context', () => {
    assert.match(html, /function shouldBypassStorageWriteForPrivateSession\(\)/);
    assert.match(html, /function persistSessionSnapshot\(options = \{\}\) \{\s*if \(shouldBypassStorageWriteForPrivateSession\(\)\) return false;/s);
    assert.match(html, /function persistTrackResumeEntry\(track, time, duration\) \{\s*if \(shouldSuppressMusicGameMetrics\(\)\) return;\s*if \(shouldBypassPrivateSessionTrackPersistence\(track\)\) return;/s);
    assert.match(html, /function persistOnlineMusicState\(\) \{\s*if \(shouldBypassStorageWriteForPrivateSession\(\)\) return false;/s);
    assert.match(html, /normalizeOnlineMusicPlaybackContext\(value = ''\) \{\s*const raw = sanitizeText\(value \|\| ''\)\.toLowerCase\(\);\s*if \(\['library', 'artist', 'release', 'search', 'private-session'\]\.includes\(raw\)\) return raw;/s);
});

test('private async imports commit results back to the route-scoped state object', () => {
    assert.doesNotMatch(html, /privateState\.searchResults\s*=\s*mergeOnlineMusicSearchResults/);
    assert.match(html, /const nextSearchResults = mergeOnlineMusicSearchResults/s);
    assert.match(html, /state\.privateSession = \{\s*\.\.\.getPrivateSessionState\(\),\s*searchQuery: query,\s*searchResults: nextSearchResults,\s*onlineView: 'search'/s);
    assert.match(html, /const nextPlaylist = \{\s*id: generateId\(\),[\s\S]*?tracks: mappedTracks\s*\};/);
    assert.match(html, /state\.privateSession = \{\s*\.\.\.getPrivateSessionState\(\),\s*playlistInput: nextInput,\s*playlists: \[/s);
});

test('private session search inputs keep readable private-mode contrast', () => {
    assert.match(html, /\.private-route-input\s*\{/);
    assert.match(html, /color:\s*#fff7ed !important;/);
    assert.match(html, /background:\s*rgba\(8, 8, 9, 0\.9\) !important;/);
    assert.match(html, /id="private-session-search-input"[\s\S]*?class="private-route-input/);
    assert.match(html, /id="private-session-playlist-url-input"[\s\S]*?class="private-route-input/);
});

test('private session renders vault status without duplicate inline playback controls', () => {
    assert.match(html, /function renderPrivateSessionPlayerDeck\(\)/);
    assert.match(html, /id="private-session-player-deck"/);
    assert.doesNotMatch(html, /id="private-player-play-btn"/);
    assert.doesNotMatch(html, /id="private-player-prev-btn"/);
    assert.doesNotMatch(html, /id="private-player-next-btn"/);
    assert.doesNotMatch(html, /id="private-player-seek"/);
    assert.doesNotMatch(html, /Play First/);
    assert.doesNotMatch(html, /private-player-progress-fill/);
    assert.match(html, /function togglePrivateSessionPlayerPlayback\(\)/);
    assert.match(html, /function seekPrivateSessionPlayerTo\(rawValue = 0\)/);
    assert.match(html, /NexPlay Vault/);
});

test('private online mode mirrors safe online browsing and queue controls only', () => {
    assert.match(html, /function openPrivateSessionOnlineArtist\(trackId = ''\)/);
    assert.match(html, /function openPrivateSessionOnlineRelease\(playlistId = ''\)/);
    assert.match(html, /function renderPrivateSessionOnlineArtistView\(\)/);
    assert.match(html, /function renderPrivateSessionOnlineReleaseView\(\)/);
    assert.match(html, /function queuePrivateSessionTrack\(trackId = '', placement = 'end', collectionKey = 'temporary'\)/);
    assert.match(html, /playPrivateSessionOnlineCollection\('release','shuffle'\)/);
    assert.match(html, /Add Release Temp/);
    assert.match(html, /Add All Temp/);

    const privateOnlineRows = html.slice(
        html.indexOf('function renderPrivateSessionOnlineTrackRows'),
        html.indexOf('function renderPrivateSessionPlaylists')
    );
    assert.doesNotMatch(privateOnlineRows, /saveOnlineMusicTrackToLibrary/);
    assert.doesNotMatch(privateOnlineRows, /downloadOnlineMusicTrack/);
    assert.doesNotMatch(privateOnlineRows, /toggleOnlineMusicFavorite/);
});

test('private local imports remain local tracks for the shared player', () => {
    assert.match(html, /const hasLocalIdentity = !!\(/);
    assert.match(html, /rawUrl\.startsWith\('blob:'\)/);
    assert.match(html, /rawUrl\.startsWith\('\/__nexplay_media__'\)/);
    assert.match(html, /const isOnlineTrack = !!onlineSnapshot && hasOnlineIdentity && explicitPrivateSource !== 'local';/);
    assert.match(html, /source:\s*'local',\s*sourceLabel:\s*'Imported song',\s*privateSessionSource:\s*'local'/s);
    assert.match(html, /source:\s*'local',\s*sourceLabel:\s*'Desktop picker',[\s\S]*?privateSessionSource:\s*'local'/s);
    assert.match(html, /function enrichPrivateSessionImportedTracks\(items = \[\]\)/);
    assert.match(html, /function extractPrivateSessionEmbeddedCoverFromFile\(file = null\)/);
    assert.match(html, /function updatePrivateSessionTrackReferences\(trackId = '', patch = \{\}\)/);
    assert.match(html, /enrichPrivateSessionImportedTracks\(pendingImports\)\.catch/);
    assert.match(html, /duration:\s*Math\.max\(0, Number\(raw\.duration \|\| base\.duration \|\| 0\) \|\| 0\)/);
    assert.match(html, /const durationPromise = !\(Number\(target\.duration\) > 0\)/);
    assert.match(html, /durationPromise\.then\(\(duration\) => \{/);
    assert.match(html, /setTimeout\(\(\) => finish\(0\), 3500\)/);
});

test('private online queue playback keeps private context on next and previous', () => {
    assert.match(html, /const isPrivateQueueTrack = isPrivateSessionTrackRecord\(track\)[\s\S]*?findPrivateSessionTrackById\(track\.id, \{ includeSearchResults: true \}\)/);
    assert.match(html, /const playbackContext = isPrivateQueueTrack \? 'private-session' : 'library';/);
    assert.match(html, /queueContextView: playbackContext,/);
    assert.match(html, /privateSession: isPrivateQueueTrack/);
    assert.match(html, /isPrivateSessionTrackRecord\(track\)\s*\?\s*track\s*:\s*\(isOnlineMusicTrackRecord\(track\)/s);
});

test('private local queue next/previous can switch tracks while playNext/playPrev lock is active', () => {
    assert.match(html, /function loadTrack\(id, autoPlay = true, evt = null, options = \{\}\)/);
    assert.match(html, /const allowQueueSwitch = !!opts\.allowQueueSwitch;/);
    assert.match(html, /shouldIgnoreTrackSwitchRequest\(id, \{ allowQueueSwitch \}\)/);
    assert.match(html, /loadTrack\(track\.id, opts\.autoplay !== false, null, \{ allowQueueSwitch: true \}\);/);
});

test('private seeking uses the shared duration fallback path for lyrics and shared player controls', () => {
    assert.match(html, /function safeSeekMedia\(media = null, seconds = 0, options = \{\}\)/);
    assert.match(html, /getMediaDurationSafe\(media, Number\(opts\.fallbackDuration \|\| 0\)\)/);
    assert.match(html, /safeSeekMedia\(els\.audio, seconds, \{ fallbackDuration: Number\(track\.duration \|\| 0\) \}\)/);
    assert.match(html, /safeSeekMedia\(aud, target, \{ fallbackDuration: Number\(activeTrack\?\.duration \|\| 0\) \}\)/);
    assert.match(html, /syncPrivateSessionPlayerDeck\(\);/);
});
