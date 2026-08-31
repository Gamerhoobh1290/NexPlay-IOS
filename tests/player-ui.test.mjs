import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readNexPlaySource } from './source-fixture.mjs';

const html = readNexPlaySource();
const electronMain = fs.readFileSync(new URL('../electron-main.cjs', import.meta.url), 'utf8');
const electronPreload = fs.readFileSync(new URL('../nexplay-next/electron-preload.cjs', import.meta.url), 'utf8');
const windowsUpdater = fs.readFileSync(new URL('../tools/NexPlayUpdaterExe/Program.cs', import.meta.url), 'utf8');

test('mini player next label formats track text without mojibake dash symbols', () => {
    const start = html.indexOf('function renderMiniQueuePeek()');
    const end = html.indexOf('function isInteractiveTarget', start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);

    const body = html.slice(start, end);
    assert.match(body, /formatPlayerTrackLine\(t\)/);
    assert.doesNotMatch(body, /\u00e2\u20ac[\u201c\u201d]/);
    assert.doesNotMatch(body, /Next:\s*\$\{t\.title\}/);
});

test('runtime queue normalization preserves the no-current-item sentinel', () => {
    const normalizeStart = html.indexOf('function normalizeRuntimeState');
    const normalizeEnd = html.indexOf('function ensureSourceConsistency', normalizeStart);
    assert.notEqual(normalizeStart, -1);
    assert.notEqual(normalizeEnd, -1);

    const body = html.slice(normalizeStart, normalizeEnd);
    assert.match(body, /audioBucket\.currentIndex < -1/);
    assert.match(body, /clamp\(audioBucket\.currentIndex, -1, audioBucket\.entries\.length - 1\)/);
    assert.match(body, /const activeEntryIndex = \(audioBucket\.entries \|\| \[\]\)\.findIndex/);
});

test('player display helper normalizes common encoded punctuation before rendering', () => {
    const start = html.indexOf('function cleanPlayerDisplayText');
    const end = html.indexOf('function escapeSvgText', start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);

    const helpers = html.slice(start, end);
    assert.match(helpers, /\\u00e2\\u20ac\[\\u201c\\u201d\]/);
    assert.match(helpers, /function formatPlayerTrackLine\(track = null\)/);
});

test('desktop online music search remains usable when the desktop resolver is unavailable', () => {
    const catalogStart = html.indexOf('async function fetchOnlineMusicCatalogSearchBundle');
    const catalogEnd = html.indexOf('async function fetchDesktopOnlineMusicSearchBundle', catalogStart);
    assert.notEqual(catalogStart, -1);
    assert.notEqual(catalogEnd, -1);

    const catalogBody = html.slice(catalogStart, catalogEnd);
    assert.match(catalogBody, /fetchItunesSearchTracks\(query, options\)/);
    assert.match(catalogBody, /fetchDeezerSearchTracks\(query, options\)/);
    assert.doesNotMatch(catalogBody, /fetchYouTubeOnlineMusicSearchTracks\(query\)/);

    const bundleStart = html.indexOf('async function fetchDesktopOnlineMusicSearchBundle');
    const bundleEnd = html.indexOf('function appendDesktopYouTubeMusicResultsToOnlineSearch', bundleStart);
    assert.notEqual(bundleStart, -1);
    assert.notEqual(bundleEnd, -1);

    const bundleBody = html.slice(bundleStart, bundleEnd);
    assert.match(bundleBody, /fetchOnlineMusicCatalogSearchBundle\(query\)/);
    assert.match(bundleBody, /fetchDesktopYouTubeMusicSearchTracks\(query\)/);
    assert.doesNotMatch(bundleBody, /fetchYouTubeOnlineMusicSearchTracks\(query\)/);

    const runStart = html.indexOf('async function runDesktopOnlineMusicSearch');
    const runEnd = html.indexOf('function startDesktopOnlineMusicSearch', runStart);
    assert.notEqual(runStart, -1);
    assert.notEqual(runEnd, -1);
    const runBody = html.slice(runStart, runEnd);
    assert.match(runBody, /if \(session\.useDesktopProvider\)/);
    assert.match(runBody, /fetchDesktopYouTubeMusicSearchTracks\(providerQuery, \{/);
    assert.match(runBody, /fetchItunesSearchTracks\(providerQuery, \{/);
    assert.match(runBody, /fetchDeezerSearchTracks\(providerQuery, \{/);
    assert.match(runBody, /fetchYouTubeOnlineMusicSearchTracks\(providerQuery, \{/);
    assert.match(runBody, /settleDesktopOnlineMusicSearchProvider\(session, descriptor\)/);
    assert.match(runBody, /await Promise\.all\(providerPromises\)/);

    const searchStart = html.indexOf('async function searchOnlineMusic(options = {})');
    const searchEnd = html.indexOf('async function handleOnlineMusicContentClick', searchStart);
    assert.notEqual(searchStart, -1);
    assert.notEqual(searchEnd, -1);
    const searchBody = html.slice(searchStart, searchEnd);
    assert.match(searchBody, /startDesktopOnlineMusicSearch\(query, \{/);
    assert.match(searchBody, /useDesktopProvider: canUseDesktopYouTubeMusicSearch\(\)/);
    assert.doesNotMatch(searchBody, /online\.searchResults = \[\]/);
});

test('Windows updater compares three-part manifests with four-part file versions', () => {
    const parseStart = windowsUpdater.indexOf('private static Version ParseVersion');
    const parseEnd = windowsUpdater.indexOf('private static string ResolveInstallDirectory', parseStart);
    assert.notEqual(parseStart, -1);
    assert.notEqual(parseEnd, -1);

    const parseBody = windowsUpdater.slice(parseStart, parseEnd);
    assert.match(parseBody, /Math\.Max\(0, version\.Build\)/);
    assert.match(parseBody, /Math\.Max\(0, version\.Revision\)/);
});

test('online music play silences active audio before resolving the playable source', () => {
    const playStart = html.indexOf('async function playOnlineMusicTrack');
    const resolveCall = html.indexOf('resolvePlayableOnlineMusicTrack(track', playStart);
    const silenceCall = html.indexOf('silenceActivePlaybackForOnlineSwitch(track', playStart);
    assert.notEqual(playStart, -1);
    assert.notEqual(resolveCall, -1);
    assert.notEqual(silenceCall, -1);
    assert.ok(silenceCall < resolveCall);

    const preResolve = html.slice(playStart, resolveCall);
    assert.match(preResolve, /const shouldAutoplay = options\.autoplay !== false;/);
    assert.match(preResolve, /if \(shouldAutoplay && !isolatePreviewUi\)/);

    const silenceStart = html.indexOf('function silenceActivePlaybackForOnlineSwitch');
    const silenceEnd = html.indexOf('function prewarmOnlineMusicPlayer', silenceStart);
    assert.notEqual(silenceStart, -1);
    assert.notEqual(silenceEnd, -1);
    const silenceBody = html.slice(silenceStart, silenceEnd);
    assert.match(silenceBody, /invalidateOnlineMusicSession\(\)/);
    assert.match(silenceBody, /setOnlineMusicConnectingAttempt\(trackId/);
    assert.match(silenceBody, /stopLocalMediaTransport\(\{ resetTime: false \}\)/);
    assert.match(silenceBody, /onlineMusicPlayer\.stopVideo/);
    assert.doesNotMatch(silenceBody, /pendingTrackId/);
});

test('windowed online cover crop applies to transient online playback tracks', () => {
    const helperStart = html.indexOf('function shouldCropWindowedCoverArt');
    const helperEnd = html.indexOf('function syncWindowedOnlineCoverCrop', helperStart);
    assert.notEqual(helperStart, -1);
    assert.notEqual(helperEnd, -1);
    const helperBody = html.slice(helperStart, helperEnd);
    assert.match(helperBody, /isOnlineMusicTrackRecord\(track\)/);
    assert.match(helperBody, /state\.currentPlaybackSource === 'online-music'/);
    assert.match(helperBody, /normalizeOnlineMusicTrackId\(online\.currentTrackId \|\| state\.currentTrackId \|\| ''\)/);

    const syncStart = html.indexOf('function syncWindowedOnlineCoverCrop');
    const syncEnd = html.indexOf('function applyNowPlayingMetadata', syncStart);
    assert.notEqual(syncStart, -1);
    assert.notEqual(syncEnd, -1);
    const syncBody = html.slice(syncStart, syncEnd);
    assert.match(syncBody, /const shouldCheckCrop = shouldCropWindowedCoverArt\(track\)/);
    assert.match(syncBody, /const forceThumbnailCrop = isLikelyYouTubeVideoThumbnailCover\(coverSrc\)/);
    assert.match(syncBody, /classList\.toggle\('windowed-online-cover-crop', shouldCrop\)/);
});

test('online playback keeps catalog cover artwork ahead of resolver thumbnails', () => {
    const resolverStart = html.indexOf('async function resolvePlayableOnlineMusicTrack');
    const resolverEnd = html.indexOf('async function playOnlineMusicTrack', resolverStart);
    assert.notEqual(resolverStart, -1);
    assert.notEqual(resolverEnd, -1);
    const resolverBody = html.slice(resolverStart, resolverEnd);
    assert.match(resolverBody, /title:\s*baseTrack\.title/);
    assert.match(resolverBody, /artist:\s*baseTrack\.artist/);
    assert.match(resolverBody, /lyricsTitle:\s*baseTrack\.lyricsTitle \|\| baseTrack\.title/);
    assert.match(resolverBody, /resolvedTitle:\s*sanitizeText\(resolved\.resolvedTitle \|\| resolved\.title \|\| ''\)/);
    assert.match(resolverBody, /thumbnail:\s*resolved\.thumbnail \|\| baseTrack\.thumbnail \|\| ''/);
    assert.match(resolverBody, /cover:\s*baseTrack\.cover \|\| resolved\.cover \|\| resolved\.thumbnail \|\| ''/);

    const playStart = html.indexOf('async function playOnlineMusicTrack');
    const playEnd = html.indexOf('async function toggleOnlineMusicPlayback', playStart);
    assert.notEqual(playStart, -1);
    assert.notEqual(playEnd, -1);
    const playBody = html.slice(playStart, playEnd);
    assert.match(playBody, /refreshOnlineMusicCatalogCover\(libraryTrack \|\| resolved\)\.catch\(\(\) => \{\}\)/);
});

test('online catalog cover refresh updates current playback surfaces', () => {
    const helperStart = html.indexOf('function isLikelyYouTubeVideoThumbnailCover');
    const helperEnd = html.indexOf('function upsertOnlineMusicTrackReferences', helperStart);
    assert.notEqual(helperStart, -1);
    assert.notEqual(helperEnd, -1);
    const helperBody = html.slice(helperStart, helperEnd);
    assert.match(helperBody, /fetchOnlineMusicCatalogSearchBundle\(query\)/);
    assert.match(helperBody, /mergeOnlineMusicSearchResults\(bundle\?\.tracks \|\| \[\], \{ query \}\)/);
    assert.match(helperBody, /state\.coverCache\[cacheKey\] = catalogCover/);
    assert.match(helperBody, /applyNowPlayingMetadata\(state\.currentTrack\)/);
    assert.match(helperBody, /syncOnlineMusicPlayerCard\(\)/);
});

test('online music connecting state is held through stale player state events', () => {
    const helperStart = html.indexOf('function shouldHoldOnlineMusicTransportEventDuringConnect');
    const helperEnd = html.indexOf('function getFailedOnlineMusicTrackRecord', helperStart);
    assert.notEqual(helperStart, -1);
    assert.notEqual(helperEnd, -1);
    const helperBody = html.slice(helperStart, helperEnd);
    assert.match(helperBody, /YTState\.PAUSED/);
    assert.match(helperBody, /YTState\.CUED/);
    assert.match(helperBody, /YTState\.ENDED/);
    assert.match(helperBody, /isOnlineMusicConnectingAttemptActive\(\{ trackId: connectingTrackId \}\)/);

    const handlerStart = html.indexOf('function handleOnlineMusicPlayerStateChange');
    const pausedBranch = html.indexOf('} else if (event?.data === YTState.PAUSED)', handlerStart);
    assert.notEqual(handlerStart, -1);
    assert.notEqual(pausedBranch, -1);
    const prePaused = html.slice(handlerStart, pausedBranch);
    assert.match(prePaused, /shouldHoldOnlineMusicTransportEventDuringConnect\(event\?\.data\)/);
    assert.match(prePaused, /syncOnlineMusicResultRows\(\)/);
    assert.doesNotMatch(prePaused, /online\.connectingTrackId = null/);
});

test('online music repeated same-track clicks keep the active resolver alive', () => {
    const playStart = html.indexOf('async function playOnlineMusicTrack');
    const beginCall = html.indexOf('beginOnlineMusicPlaybackAttempt(track.id)', playStart);
    assert.notEqual(playStart, -1);
    assert.notEqual(beginCall, -1);
    const preBegin = html.slice(playStart, beginCall);
    assert.match(preBegin, /const requestedTrackId = normalizeOnlineMusicTrackId\(track\.id \|\| trackId \|\| ''\)/);
    assert.match(preBegin, /isOnlineMusicConnectingAttemptActive\(\{ trackId: requestedTrackId \}\)/);
    assert.match(preBegin, /return true;/);
});

test('online music explicit play targets do not fall back to the first row', () => {
    const collectionStart = html.indexOf('async function startTrackCollectionPlayback');
    const collectionEnd = html.indexOf('function clearCurrentQueue', collectionStart);
    assert.notEqual(collectionStart, -1);
    assert.notEqual(collectionEnd, -1);
    const collectionBody = html.slice(collectionStart, collectionEnd);
    assert.match(collectionBody, /const requestedTrackId = sanitizeText\(currentTrackId \|\| ''\)/);
    assert.match(collectionBody, /const requestedOnlineTrackId = normalizeOnlineMusicTrackId\(requestedTrackId\)/);
    assert.match(collectionBody, /That track is no longer available in this view/);
    assert.match(collectionBody, /forcePlaybackResolution: !!options\.forcePlaybackResolution \|\| !!targetTrack\.pendingPlaybackResolution/);
    assert.doesNotMatch(collectionBody, /list\.find\(\(track\) => track\?\.[\s\S]*?\) \|\| list\[0\]/);

    const clickStart = html.indexOf('async function handleOnlineMusicContentClick');
    const clickEnd = html.indexOf('function renderOnlineMusicTab', clickStart);
    assert.notEqual(clickStart, -1);
    assert.notEqual(clickEnd, -1);
    const clickBody = html.slice(clickStart, clickEnd);
    assert.match(clickBody, /const preferredQueueTracks = getOnlineMusicPreferredQueueTracks/);
    assert.match(clickBody, /\[actionTarget\.track, \.\.\.preferredQueueTracks\]/);
    assert.match(clickBody, /forcePlaybackResolution: !!actionTarget\.track\?\.pendingPlaybackResolution/);
});

test('online music player initialization runs in parallel with playback resolution', () => {
    const playStart = html.indexOf('async function playOnlineMusicTrack');
    const playEnd = html.indexOf('async function toggleOnlineMusicPlayback', playStart);
    assert.notEqual(playStart, -1);
    assert.notEqual(playEnd, -1);
    const playBody = html.slice(playStart, playEnd);
    const playerPromise = playBody.indexOf('const playerPromise = track.playableInEmbed === false');
    const resolverCall = playBody.indexOf('resolvePlayableOnlineMusicTrack(track');
    assert.notEqual(playerPromise, -1);
    assert.notEqual(resolverCall, -1);
    assert.ok(playerPromise < resolverCall);
    assert.match(playBody, /forcePlaybackResolution/);
    assert.match(playBody, /excludeVideoIds/);

    const resolveStart = html.indexOf('async function resolvePlayableOnlineMusicTrack');
    const resolveEnd = html.indexOf('async function playOnlineMusicTrack', resolveStart);
    assert.notEqual(resolveStart, -1);
    assert.notEqual(resolveEnd, -1);
    const resolveBody = html.slice(resolveStart, resolveEnd);
    assert.match(resolveBody, /forceRefresh/);
    assert.match(resolveBody, /excludeVideoIds/);
    assert.match(resolveBody, /forgetFailedOnlineMusicTrack\(merged\.id\)/);
});

test('YouTube player prewarming is deferred until the online music surface is active and online', () => {
    const appInit = fs.readFileSync(new URL('../js/legacy/app-init.js', import.meta.url), 'utf8');
    assert.match(appInit, /state\.activeTab === 'online-music' && navigator\.onLine !== false[\s\S]*?prewarmOnlineMusicPlayer\(\)/);

    const playlists = fs.readFileSync(new URL('../js/legacy/online-playlists.js', import.meta.url), 'utf8');
    const prewarmStart = playlists.indexOf('function prewarmOnlineMusicPlayer');
    assert.notEqual(prewarmStart, -1);
    const prewarmBody = playlists.slice(prewarmStart, playlists.indexOf('\n}', prewarmStart) + 2);
    assert.match(prewarmBody, /navigator\.onLine === false/);

    const renderStart = html.indexOf('function renderOnlineMusicContent(options = {})');
    const renderEnd = html.indexOf('const DESKTOP_ONLINE_MUSIC_SEARCH_CACHE_TTL_MS', renderStart);
    assert.notEqual(renderStart, -1);
    assert.notEqual(renderEnd, -1);
    const renderBody = html.slice(renderStart, renderEnd);
    assert.match(renderBody, /state\.activeTab === 'online-music' && navigator\.onLine !== false[\s\S]*?prewarmOnlineMusicPlayer\(\)/);
});

test('online music iframe errors retry alternate YouTube sources before final failure', () => {
    const retryStart = html.indexOf('async function retryOnlineMusicPlaybackAfterPlayerError');
    const retryEnd = html.indexOf('async function handleOnlineMusicPlayerError', retryStart);
    assert.notEqual(retryStart, -1);
    assert.notEqual(retryEnd, -1);
    const retryBody = html.slice(retryStart, retryEnd);
    assert.match(retryBody, /isPlaybackIntentActive\(recoveryPlaybackIntent\)/);
    assert.match(retryBody, /playbackIntent:\s*recoveryPlaybackIntent/);
    assert.match(retryBody, /forcePlaybackResolution:\s*true/);
    assert.match(retryBody, /excludeVideoIds:\s*failedVideoIds/);
    assert.match(retryBody, /fromErrorRecovery:\s*true/);

    const errorStart = html.indexOf('async function handleOnlineMusicPlayerError');
    const errorEnd = html.indexOf('function handleOnlineMusicPlayerStateChange', errorStart);
    assert.notEqual(errorStart, -1);
    assert.notEqual(errorEnd, -1);
    const errorBody = html.slice(errorStart, errorEnd);
    assert.match(errorBody, /const recoveryPlaybackIntent = getActivePlaybackIntent\(\)/);
    assert.match(errorBody, /startOnlineMusicDirectAudioFallback\(current,[\s\S]*?playbackIntent:\s*recoveryPlaybackIntent/);
    assert.match(errorBody, /rememberFailedOnlineMusicTrack\(current,[\s\S]*?videoId:\s*current\?\.videoId/);
    assert.match(errorBody, /retryOnlineMusicPlaybackAfterPlayerError\(current/);
    assert.match(errorBody, /if \(retryStarted\) \{/);
    assert.match(errorBody, /153:\s*'YouTube could not verify the NexPlay player origin/);
});

test('online music iframe failures try desktop audio fallback before marking the song failed', () => {
    const fallbackStart = html.indexOf('async function startOnlineMusicDirectAudioFallback');
    const fallbackEnd = html.indexOf('async function handleOnlineMusicDirectAudioElementError', fallbackStart);
    assert.notEqual(fallbackStart, -1);
    assert.notEqual(fallbackEnd, -1);
    const fallbackBody = html.slice(fallbackStart, fallbackEnd);
    assert.match(fallbackBody, /resolveOnlineTrackAudioStream/);
    assert.match(fallbackBody, /timeoutMs: DESKTOP_ONLINE_MUSIC_AUDIO_STREAM_TIMEOUT_MS/);
    assert.match(fallbackBody, /timeoutMs: DESKTOP_ONLINE_MUSIC_AUDIO_READY_TIMEOUT_MS/);
    assert.match(fallbackBody, /state\.currentPlaybackSource = 'online-music'/);
    assert.match(fallbackBody, /startOnlineMusicProgressTimer\(\)/);
    assert.match(fallbackBody, /rememberOnlineMusicPlaybackResolverState\('healthy'/);

    const errorStart = html.indexOf('async function handleOnlineMusicPlayerError');
    const errorEnd = html.indexOf('function handleOnlineMusicPlayerStateChange', errorStart);
    assert.notEqual(errorStart, -1);
    assert.notEqual(errorEnd, -1);
    const errorBody = html.slice(errorStart, errorEnd);
    const directCall = errorBody.indexOf('startOnlineMusicDirectAudioFallback(current');
    const finalFailure = errorBody.indexOf("rememberOnlineMusicPlaybackResolverState('error'");
    assert.notEqual(directCall, -1);
    assert.notEqual(finalFailure, -1);
    assert.ok(directCall < finalFailure);

    const playStart = html.indexOf('async function playOnlineMusicTrack');
    const playEnd = html.indexOf('async function toggleOnlineMusicPlayback', playStart);
    const playBody = html.slice(playStart, playEnd);
    const knownBlockedBranch = playBody.indexOf('resolved.playableInEmbed === false');
    const playerWait = playBody.indexOf('player = await ensureOnlineMusicPlayerForPlayback');
    assert.notEqual(knownBlockedBranch, -1);
    assert.ok(knownBlockedBranch < playerWait);
    const knownBlockedBody = playBody.slice(knownBlockedBranch, playerWait);
    const pausedRestoreGuard = knownBlockedBody.indexOf('if (!shouldAutoplay)');
    const directFallback = knownBlockedBody.indexOf('startOnlineMusicDirectAudioFallback(resolved');
    assert.notEqual(pausedRestoreGuard, -1);
    assert.notEqual(directFallback, -1);
    assert.ok(pausedRestoreGuard < directFallback);
    assert.match(knownBlockedBody.slice(pausedRestoreGuard, directFallback), /return true;/);
    assert.match(knownBlockedBody, /clearOnlineMusicTransportOwner\(\{ force: true \}\)/);
});

test('online music connect timeout attempts desktop audio fallback before guarded failure handling', () => {
    const timeoutStart = html.indexOf('function armOnlineMusicConnectTimeout');
    const timeoutEnd = html.indexOf('function getMediaDurationSafe', timeoutStart);
    assert.notEqual(timeoutStart, -1);
    assert.notEqual(timeoutEnd, -1);
    const timeoutBody = html.slice(timeoutStart, timeoutEnd);
    const fallbackCall = timeoutBody.indexOf('startOnlineMusicDirectAudioFallback(current');
    const timeoutFailureCall = timeoutBody.indexOf('handleOnlineMusicConnectTimeoutFailure(expectedTrackId)');
    assert.notEqual(fallbackCall, -1);
    assert.notEqual(timeoutFailureCall, -1);
    assert.ok(fallbackCall < timeoutFailureCall);
    assert.match(timeoutBody, /canUseDesktopOnlineAudioStream\(\)/);
    assert.match(timeoutBody, /isPlaybackIntentActive\(expectedPlaybackIntent\)/);
    assert.match(timeoutBody, /playbackIntent:\s*expectedPlaybackIntent/);
    assert.match(timeoutBody, /DESKTOP_ONLINE_MUSIC_CONNECT_TIMEOUT_MS/);
    assert.doesNotMatch(timeoutBody, /scheduleOnlineMusicAdvanceAfterFailure\(expectedTrackId\)/);

    const handlerStart = html.indexOf('function handleOnlineMusicConnectTimeoutFailure');
    const handlerEnd = html.indexOf('function armOnlineMusicConnectTimeout', handlerStart);
    assert.notEqual(handlerStart, -1);
    assert.notEqual(handlerEnd, -1);
    const handlerBody = html.slice(handlerStart, handlerEnd);
    assert.match(handlerBody, /const shouldAdvanceAfterFailure = !!onlineMusicCurrentTrackStartedFromQueue/);
    assert.match(handlerBody, /scheduleOnlineMusicAdvanceAfterFailure\(expectedTrackId\)/);
    assert.match(handlerBody, /deactivateOnlineMusicTransport\(\{[\s\S]*?nextPlaybackSource: 'local'/);
    assert.match(handlerBody, /Stopped safely/);
});

test('online direct audio uses online state for media events and controls', () => {
    const eventsStart = html.indexOf('function setupEventListeners()');
    const eventsEnd = html.indexOf('// UI Interaction', eventsStart);
    assert.notEqual(eventsStart, -1);
    assert.notEqual(eventsEnd, -1);
    const eventsBody = html.slice(eventsStart, eventsEnd);
    assert.match(eventsBody, /isOnlineMusicDirectAudioActive\(\)/);
    assert.match(eventsBody, /state\.currentPlaybackSource = 'online-music'/);
    assert.match(eventsBody, /handleOnlineMusicDirectAudioElementError\(\)/);
    assert.match(eventsBody, /captureOnlineMusicProgress\(\)/);

    const errorStart = eventsBody.indexOf("els.audio.addEventListener('error'");
    const errorEnd = eventsBody.indexOf('// UI Interaction', errorStart);
    assert.notEqual(errorStart, -1);
    const errorBody = eventsBody.slice(errorStart, errorEnd);
    assert.match(errorBody, /if \(state\.currentPlaybackSource === 'online-music'\) return;/);
    assert.match(errorBody, /failedMediaSource/);
    assert.match(errorBody, /expectedTrackSource/);
    assert.match(errorBody, /normalizeSource\(failedMediaSource\) !== normalizeSource\(expectedTrackSource\)/);
    const capturedSource = errorBody.indexOf('const failedMediaSource');
    const directHandler = errorBody.indexOf('await handleOnlineMusicDirectAudioElementError()');
    const staleTrackGuard = errorBody.indexOf('failedTrackId !== activeTrackId');
    const staleSourceGuard = errorBody.indexOf('normalizeSource(failedMediaSource) !== normalizeSource(expectedTrackSource)');
    const finishLoad = errorBody.indexOf('finishSourceLoad();');
    assert.ok(capturedSource >= 0 && capturedSource < directHandler);
    assert.ok(staleTrackGuard >= 0 && staleTrackGuard < finishLoad);
    assert.ok(staleSourceGuard >= 0 && staleSourceGuard < finishLoad);

    const toggleStart = html.indexOf('async function toggleOnlineMusicPlayback');
    const toggleEnd = html.indexOf('async function seekOnlineMusicTo', toggleStart);
    assert.notEqual(toggleStart, -1);
    assert.notEqual(toggleEnd, -1);
    const toggleBody = html.slice(toggleStart, toggleEnd);
    assert.match(toggleBody, /isOnlineMusicDirectAudioActive\(\{ trackId: current\.id \}\)/);
    assert.match(toggleBody, /safePauseMedia\(els\.audio\)/);
    assert.match(toggleBody, /safePlayMedia\(els\.audio/);
    const knownBlockedToggle = toggleBody.indexOf('current.playableInEmbed === false');
    const playerWait = toggleBody.indexOf('await ensureOnlineMusicPlayer(current.videoId)');
    assert.notEqual(knownBlockedToggle, -1);
    assert.notEqual(playerWait, -1);
    assert.ok(knownBlockedToggle < playerWait);
    assert.match(toggleBody.slice(knownBlockedToggle, playerWait), /playOnlineMusicTrack\(current\.id, \{[\s\S]*?autoplay: true/);
});

test('online direct audio recovers from stalled or prematurely ended streams', () => {
    const configStart = html.indexOf('const DESKTOP_ONLINE_MUSIC_AUDIO_STREAM_TIMEOUT_MS');
    const configEnd = html.indexOf('const DIRECT_VIDEO_URL_EXTENSIONS', configStart);
    assert.notEqual(configStart, -1);
    assert.notEqual(configEnd, -1);
    const configBody = html.slice(configStart, configEnd);
    assert.match(configBody, /DESKTOP_ONLINE_MUSIC_AUDIO_STALL_TIMEOUT_MS = 12000/);

    const stateStart = html.indexOf('function isOnlineMusicDirectAudioActive');
    const stateEnd = html.indexOf('function getMediaDurationSafe', stateStart);
    assert.notEqual(stateStart, -1);
    assert.notEqual(stateEnd, -1);
    const stateBody = html.slice(stateStart, stateEnd);
    assert.match(stateBody, /onlineMusicDirectAudioStallTimer/);
    assert.match(stateBody, /function clearOnlineMusicDirectAudioStallTimer/);
    assert.match(stateBody, /function isOnlineMusicPlaybackEndPremature/);
    assert.match(stateBody, /function armOnlineMusicDirectAudioStallTimer/);
    assert.match(stateBody, /handleOnlineMusicDirectAudioStreamInterruption\(reason\)/);
    assert.match(stateBody, /retryOnlineMusicPlaybackAfterPlayerError\(current/);
    assert.match(stateBody, /reason === 'ended-early'/);

    const eventsStart = html.indexOf('function setupEventListeners()');
    const eventsEnd = html.indexOf('// UI Interaction', eventsStart);
    assert.notEqual(eventsStart, -1);
    assert.notEqual(eventsEnd, -1);
    const eventsBody = html.slice(eventsStart, eventsEnd);
    assert.match(eventsBody, /armOnlineMusicDirectAudioStallTimer\(ev\)/);
    assert.match(eventsBody, /clearOnlineMusicDirectAudioStallTimer\(\)/);
    assert.match(eventsBody, /isOnlineMusicPlaybackEndPremature\(current, position, duration\)/);
    assert.match(eventsBody, /handleOnlineMusicDirectAudioStreamInterruption\('ended-early'\)/);

    const playerStateStart = html.indexOf('function handleOnlineMusicPlayerStateChange');
    const playerStateEnd = html.indexOf('function loadYouTubeIframeApi', playerStateStart);
    assert.notEqual(playerStateStart, -1);
    assert.notEqual(playerStateEnd, -1);
    const playerStateBody = html.slice(playerStateStart, playerStateEnd);
    assert.match(playerStateBody, /isOnlineMusicPlaybackEndPremature\(current/);
    assert.match(playerStateBody, /online-player-ended-early/);
    assert.match(playerStateBody, /YouTube playback ended before the song finished/);
});

test('desktop updater exposes proxied YouTube audio stream resolution', () => {
    assert.match(electronMain, /ONLINE_AUDIO_STREAM_RESOLVE_CHANNEL/);
    assert.match(electronMain, /ONLINE_AUDIO_STREAM_ROUTE/);
    assert.match(electronMain, /function pipeOnlineAudioStream/);
    assert.match(electronMain, /headers\.Range = range/);
    assert.match(electronMain, /async function resolveOnlineTrackAudioStream/);
    assert.match(electronMain, /'--format', 'bestaudio\[ext=m4a\]\/bestaudio\/best'/);
    assert.match(electronMain, /registerTrustedIpcHandler\(ONLINE_AUDIO_STREAM_RESOLVE_CHANNEL/);

    assert.match(electronPreload, /resolveOnlineTrackAudioStream\(payload = \{\}\)/);
    assert.match(electronPreload, /ipcRenderer\.invoke\(ONLINE_AUDIO_STREAM_RESOLVE_CHANNEL, payload\)/);
});

test('session restore hydrates current track without blocking on media or YouTube readiness', () => {
    const restoreStart = html.indexOf('async function restoreSessionSnapshotSafely');
    const restoreEnd = html.indexOf('function persistAppStateNow', restoreStart);
    assert.notEqual(restoreStart, -1);
    assert.notEqual(restoreEnd, -1);
    const restoreBody = html.slice(restoreStart, restoreEnd);
    assert.doesNotMatch(restoreBody, /const started = await playOnlineMusicTrack/);
    assert.doesNotMatch(restoreBody, /await waitForMediaReady\(els\.audio,\s*5000\)/);
    assert.match(restoreBody, /online\.currentTrackId = restoredOnlineTrack\.id/);
    assert.match(restoreBody, /window\.setTimeout\(\(\) => \{[\s\S]*?playOnlineMusicTrack\(restoredOnlineTrack\.id/);
});

test('desktop playback resolver searches YouTube Music first and excludes failed video ids', () => {
    assert.match(electronMain, /const ONLINE_PLAYBACK_RESOLVE_TIMEOUT_MS = 6500/);
    assert.match(electronMain, /const ONLINE_MUSIC_SEARCH_TIMEOUT_MS = 9000/);
    assert.match(electronMain, /const YT_DLP_FAST_NETWORK_ARGS = \['--socket-timeout', '6', '--extractor-retries', '1', '--fragment-retries', '1'\]/);

    const resolverStart = electronMain.indexOf('async function resolveOnlineTrackPlayback');
    const resolverEnd = electronMain.indexOf('async function scanWatchFoldersNow', resolverStart);
    assert.notEqual(resolverStart, -1);
    assert.notEqual(resolverEnd, -1);
    const resolverBody = electronMain.slice(resolverStart, resolverEnd);
    assert.match(resolverBody, /normalizeExcludedYouTubeVideoIds/);
    assert.match(resolverBody, /music\.youtube\.com\/search/);
    assert.match(resolverBody, /const youtubeQueries = uniquePlainText/);
    assert.match(resolverBody, /`ytsearch\$\{searchLimit\}:\$\{query\}`/);
    assert.match(resolverBody, /YT_DLP_FAST_NETWORK_ARGS/);
    assert.ok(resolverBody.indexOf("sourceSurface: 'youtube-music'") < resolverBody.indexOf("sourceSurface: 'youtube'"));
    assert.match(resolverBody, /excludedVideoIds: Array\.from\(excludeVideoIds\)/);
    assert.match(resolverBody, /resolvedTitle:\s*best\.title \|\| ''/);
    assert.doesNotMatch(resolverBody, /title:\s*best\.title \|\| payload\.title/);
});

test('desktop playback resolver rejects music videos and rewards audio or lyrics sources', () => {
    const scoreStart = electronMain.indexOf('function scorePlaybackResolverCandidate');
    const scoreEnd = electronMain.indexOf('function normalizePlaybackResolverEntry', scoreStart);
    assert.notEqual(scoreStart, -1);
    assert.notEqual(scoreEnd, -1);
    const scoreBody = electronMain.slice(scoreStart, scoreEnd);
    assert.match(electronMain, /function hasResolverMusicVideoMarker/);
    assert.match(scoreBody, /return \{ include: false, score: -1000, reason: 'music-video' \}/);
    assert.match(scoreBody, /provided\\s\+to\\s\+youtube\|topic\|official\\s\+audio\|audio\|lyrics\?/);
    assert.match(scoreBody, /score \+= 55/);
});

test('desktop online resolver preserves payload artwork and prefers square thumbnails', () => {
    const thumbStart = electronMain.indexOf('function scoreYtDlpThumbnailCandidate');
    const thumbEnd = electronMain.indexOf('function getYouTubeThumbnailUrl', thumbStart);
    assert.notEqual(thumbStart, -1);
    assert.notEqual(thumbEnd, -1);
    const thumbBody = electronMain.slice(thumbStart, thumbEnd);
    assert.match(thumbBody, /squareDelta/);
    assert.match(thumbBody, /ytimg\\\.com/);
    assert.match(thumbBody, /scoreYtDlpThumbnailCandidate\(right\) - scoreYtDlpThumbnailCandidate\(left\)/);

    const resolverStart = electronMain.indexOf('async function resolveOnlineTrackPlayback');
    const resolverEnd = electronMain.indexOf('async function scanWatchFoldersNow', resolverStart);
    assert.notEqual(resolverStart, -1);
    assert.notEqual(resolverEnd, -1);
    const resolverBody = electronMain.slice(resolverStart, resolverEnd);
    assert.match(resolverBody, /cover:\s*payload\.cover \|\| best\.thumbnail \|\| ''/);
});

test('online music result row sync keeps pending playback labels stable', () => {
    const syncStart = html.indexOf('function syncOnlineMusicResultRows');
    const syncEnd = html.indexOf('function silenceActivePlaybackForOnlineSwitch', syncStart);
    assert.notEqual(syncStart, -1);
    assert.notEqual(syncEnd, -1);
    const syncBody = html.slice(syncStart, syncEnd);
    assert.match(syncBody, /track\?\.pendingPlaybackResolution/);
    assert.match(syncBody, /Resolve \+ Play/);
    assert.match(syncBody, /playBtn\.disabled = !!\(isConnecting \|\| !canQueueTrack\)/);
});

test('desktop online search keeps catalog authority ahead of playable-transport convenience', () => {
    const searchStart = html.indexOf('const DESKTOP_ONLINE_MUSIC_SEARCH_CACHE_TTL_MS');
    const searchEnd = html.indexOf('async function handleOnlineMusicContentClick', searchStart);
    assert.notEqual(searchStart, -1);
    assert.notEqual(searchEnd, -1);
    const searchBody = html.slice(searchStart, searchEnd);
    assert.match(searchBody, /desktopOnlineMusicSearchRequestSequence/);
    assert.match(searchBody, /activeDesktopOnlineMusicSearch\?\.id !== session\.id/);
    assert.match(searchBody, /fetchDesktopYouTubeMusicSearchTracks\(providerQuery, \{/);
    assert.match(searchBody, /fetchItunesSearchTracks\(providerQuery, \{/);
    assert.match(searchBody, /fetchDeezerSearchTracks\(providerQuery, \{/);
    assert.match(searchBody, /fetchYouTubeOnlineMusicSearchTracks\(providerQuery, \{/);
    assert.match(searchBody, /if \(session\.preferPlayableTransport\) mergeOptions\.preferPlayableTransport = true/);
    assert.match(searchBody, /preferPlayableTransport: useDesktopProvider/);
    assert.match(searchBody, /allowPlayerPrewarm: useDesktopProvider/);
    assert.match(searchBody, /commitDesktopOnlineMusicSearchResults\(session, \{ final: false \}\)/);
    assert.match(searchBody, /commitDesktopOnlineMusicSearchResults\(session, \{ final: true \}\)/);
    assert.match(searchBody, /await Promise\.all\(providerPromises\)/);
    assert.match(searchBody, /DESKTOP_ONLINE_MUSIC_SEARCH_CACHE_MAX_ENTRIES/);
    assert.match(searchBody, /activeDesktopOnlineMusicSearch\.controller\.abort\(\)/);
    assert.match(searchBody, /ensureOnlineMusicPlayer\(firstPlayable\.videoId, \{ quiet: true \}\)\.catch\(\(\) => \{\}\)/);
    assert.ok(searchBody.indexOf("name: 'youtube-music'") < searchBody.indexOf("name: 'itunes'"));
    assert.ok(searchBody.indexOf("name: 'itunes'") < searchBody.indexOf("name: 'deezer'"));
    assert.ok(searchBody.indexOf("name: 'deezer'") < searchBody.indexOf("name: 'youtube-discovery'"));
    assert.doesNotMatch(searchBody, /appendDesktopYouTubeMusicResultsToOnlineSearch\(query\)/);
    assert.doesNotMatch(searchBody, /fetchDesktopOnlineMusicSearchBundle\(query\)/);

    const scoreStart = html.indexOf('function scoreOnlineMusicSearchResult');
    const scoreEnd = html.indexOf('function mergeOnlineMusicSearchResults', scoreStart);
    assert.notEqual(scoreStart, -1);
    assert.notEqual(scoreEnd, -1);
    const scoreBody = html.slice(scoreStart, scoreEnd);
    assert.match(scoreBody, /preferPlayableTransport/);
    assert.match(scoreBody, /track\?\.videoId \? 55 : 0/);
    assert.match(scoreBody, /getOnlineMusicSearchResultAuthorityScore/);
    assert.match(scoreBody, /mergeOnlineMusicSearchCandidateRecords/);
    assert.doesNotMatch(scoreBody, /track\?\.videoId \? 900 : -260/);

    const bundleStart = html.indexOf('async function fetchDesktopOnlineMusicSearchBundle');
    const bundleEnd = html.indexOf('function appendDesktopYouTubeMusicResultsToOnlineSearch', bundleStart);
    assert.notEqual(bundleStart, -1);
    assert.notEqual(bundleEnd, -1);
    const bundleBody = html.slice(bundleStart, bundleEnd);
    assert.match(bundleBody, /Promise\.allSettled/);
    assert.ok(bundleBody.indexOf('fetchDesktopYouTubeMusicSearchTracks(query)') < bundleBody.indexOf('fetchOnlineMusicCatalogSearchBundle(query)'));
    assert.ok(bundleBody.indexOf('...youtubeMusicTracks') < bundleBody.indexOf('catalogBundle.tracks'));
});

test('online music empty states keep the desktop provider mix hidden', () => {
    assert.doesNotMatch(html, /Search YouTube and press play\./);
    assert.doesNotMatch(html, /catalog results from iTunes, Deezer, and YouTube/);
    assert.doesNotMatch(html, /iTunes, Deezer, and YouTube Music/);
    assert.doesNotMatch(html, /Catalog:/);
    assert.doesNotMatch(html, /Playback:\s*YouTube/);
});

test('online music artist pages can load catalog-backed artists without YouTube channel resolution', () => {
    const resolverStart = html.indexOf('async function resolveOnlineMusicArtistChannel');
    const resolverEnd = html.indexOf('async function fetchOnlineMusicVideoDetails', resolverStart);
    assert.notEqual(resolverStart, -1);
    assert.notEqual(resolverEnd, -1);
    const resolverBody = html.slice(resolverStart, resolverEnd);
    assert.match(resolverBody, /createCatalogOnlyOnlineMusicArtistChannel\(track\)/);
    assert.match(resolverBody, /getOnlineMusicCatalogArtistName\(catalogFallback \|\| \{\}, track\)/);
    assert.match(resolverBody, /withOnlineMusicCatalogArtistMetadata\(directChannel, track\)/);
    assert.ok(resolverBody.indexOf('if (directChannelId && catalogFallback)') < resolverBody.indexOf("fetchOnlineMusicYouTubeItems('channels'"));
    assert.match(resolverBody, /isCatalogBackedOnlineMusicTrack\(track\)/);
    assert.match(resolverBody, /return catalogFallback;/);

    const loaderStart = html.indexOf('async function loadOnlineMusicArtistCatalog');
    const loaderEnd = html.indexOf('function primeOnlineMusicArtistReleaseTracks', loaderStart);
    assert.notEqual(loaderStart, -1);
    assert.notEqual(loaderEnd, -1);
    const loaderBody = html.slice(loaderStart, loaderEnd);
    assert.match(loaderBody, /isCatalogOnlyOnlineMusicArtistChannel\(channel\)/);
    assert.match(loaderBody, /fetchOnlineMusicYouTubeItems\('playlists'[\s\S]*?\.catch\(\(\) => \[\]\)/);
    assert.match(loaderBody, /searchOnlineMusicArtistReleasePlaylists\(youtubeChannel\)\.catch\(\(\) => \[\]\)/);
    assert.match(loaderBody, /fetchItunesArtistCatalog\(channel\)\.catch/);
    assert.match(loaderBody, /fetchDeezerArtistCatalog\(channel\)\.catch/);
    assert.match(loaderBody, /fetchMusicBrainzArtistCatalog\(channel\)/);
    assert.match(loaderBody, /const cacheKey = buildOnlineMusicArtistCatalogCacheKey\(channel, track\)/);
    assert.match(loaderBody, /const catalogReleases = mergeUniqueOnlineMusicReleases/);
    assert.ok(loaderBody.indexOf('fetchItunesArtistCatalog(channel).catch') < loaderBody.indexOf("fetchOnlineMusicYouTubeItems('playlists'"));
    assert.ok(loaderBody.indexOf('fetchMusicBrainzArtistCatalog(channel)') < loaderBody.indexOf("fetchOnlineMusicYouTubeItems('playlists'"));
    assert.ok(loaderBody.indexOf('fetchMusicBrainzArtistCatalog(channel)') < loaderBody.indexOf('const catalogReleases = mergeUniqueOnlineMusicReleases'));
    assert.match(loaderBody, /if \(catalogReleases\.length\) \{/);
    assert.match(loaderBody, /catalogReleases, \[\]\)\)/);
    assert.match(loaderBody, /\.\.\.\(Array\.isArray\(musicBrainzCatalog\?\.releases\)/);
    assert.match(loaderBody, /isReusableOnlineMusicArtistCatalog\(existing\)/);
    assert.match(loaderBody, /let youtubeChannel = channel/);
    assert.match(loaderBody, /fetchOnlineMusicYouTubeItems\('channels'/);
    assert.match(loaderBody, /searchOnlineMusicArtistReleasePlaylists\(youtubeChannel\)/);
    assert.doesNotMatch(loaderBody, /const releases = catalogReleases\.length \? catalogReleases : youtubeReleases/);
    assert.doesNotMatch(loaderBody, /const stableUploadTracks = catalogReleases\.length/);
    assert.doesNotMatch(loaderBody, /Catalog: \$\{catalog\.catalogSources\.join/);

    const artistViewStart = html.indexOf('function renderOnlineMusicArtistLoadingSkeleton');
    const artistViewEnd = html.indexOf('function renderOnlineMusicReleaseView', artistViewStart);
    assert.notEqual(artistViewStart, -1);
    assert.notEqual(artistViewEnd, -1);
    const artistViewBody = html.slice(artistViewStart, artistViewEnd);
    assert.match(artistViewBody, /animate-pulse/);
    assert.match(artistViewBody, /renderOnlineMusicArtistLoadingSkeleton\(\)/);
    assert.match(artistViewBody, /Other Releases/);
    assert.match(artistViewBody, /publicArtist\.otherReleases/);
    assert.match(artistViewBody, /hasOnlineMusicArtistCatalogContent\(artist\)/);
    assert.match(artistViewBody, /getOnlineMusicArtistCatalogForPublicView\(artist\)/);
    assert.match(artistViewBody, /sortOnlineMusicArtistReleasesForView\(publicArtist\.albums/);
    assert.match(artistViewBody, /sortOnlineMusicArtistTracksForView\(artistTrackPool, sortMode\)/);
    assert.match(artistViewBody, /renderOnlineMusicArtistWorkSearchControl\(artistSearchQuery\)/);
    assert.match(artistViewBody, /renderOnlineMusicArtistWorkSortControl\(sortMode\)/);
    assert.match(artistViewBody, /filterOnlineMusicArtistReleasesForSearch\(sortedAlbums, artistSearchQuery\)/);
    assert.match(artistViewBody, /filterOnlineMusicArtistTracksForSearch\(sortedAllWork, artistSearchQuery\)/);
    assert.match(artistViewBody, /const artistSearchQuery = sanitizeOnlineMusicArtistWorkSearchInput/);
    assert.match(artistViewBody, /const artistTrackPool = getOnlineMusicArtistTrackSearchPool\(publicArtist\)/);
    assert.match(artistViewBody, /artistTrackPool\.length/);
    assert.match(artistViewBody, /Songs discovered from artist releases and playable matches/);
    assert.match(artistViewBody, /Showing \$\{escapeHtml\(matchCount\)\} artist result/);
    assert.match(artistViewBody, /No songs, albums, singles, or releases matched/);

    const sortHelpersStart = html.indexOf('function normalizeOnlineMusicArtistWorkSortMode');
    const sortHelpersEnd = html.indexOf('function mergeUniqueOnlineMusicTracks', sortHelpersStart);
    assert.notEqual(sortHelpersStart, -1);
    assert.notEqual(sortHelpersEnd, -1);
    const sortHelpersBody = html.slice(sortHelpersStart, sortHelpersEnd);
    assert.match(sortHelpersBody, /ONLINE_MUSIC_ARTIST_WORK_SORT_OPTIONS/);
    assert.match(sortHelpersBody, /date-desc/);
    assert.match(sortHelpersBody, /name-asc/);
    assert.match(sortHelpersBody, /tracks-desc/);
    assert.match(sortHelpersBody, /renderOnlineMusicArtistWorkSortControl/);
    assert.match(sortHelpersBody, /data-online-music-artist-sort-select/);
    assert.match(sortHelpersBody, /setPrivateSessionArtistWorkSortMode\(this\.value\)/);
    assert.match(sortHelpersBody, /function normalizeOnlineMusicArtistWorkSearchQuery/);
    assert.match(sortHelpersBody, /function filterOnlineMusicArtistReleasesForSearch/);
    assert.match(sortHelpersBody, /function filterOnlineMusicArtistTracksForSearch/);
    assert.match(sortHelpersBody, /function normalizeOnlineMusicArtistCreditText/);
    assert.match(sortHelpersBody, /function isKnownOnlineMusicArtistCredit/);
    assert.match(sortHelpersBody, /function isOnlineMusicArtistTrackCandidateEligible/);
    assert.match(sortHelpersBody, /function filterOnlineMusicArtistWorkTracksForArtist/);
    assert.match(sortHelpersBody, /function getOnlineMusicArtistTrackSearchPool/);
    assert.match(sortHelpersBody, /safeArtist\.allWork/);
    assert.match(sortHelpersBody, /publicArtist/);
    assert.match(sortHelpersBody, /online\.searchResults/);
    assert.match(sortHelpersBody, /getOnlineMusicReleaseTracksCache/);
    assert.match(sortHelpersBody, /isPublicOnlineMusicArtistReleaseCandidate\(release, publicArtist\)/);
    assert.match(sortHelpersBody, /isOnlineMusicReleaseOwnedByArtist\(release, publicArtist, releaseIds\)/);
    assert.match(sortHelpersBody, /isOnlineMusicArtistTrackCandidateEligible\(track, publicArtist/);
    assert.match(sortHelpersBody, /filterOnlineMusicArtistWorkTracksForArtist\(safeArtist\.allWork \|\| \[\], publicArtist/);
    assert.match(sortHelpersBody, /unknownartist/);
    assert.match(sortHelpersBody, /variousartists/);
    assert.match(sortHelpersBody, /hasDisallowedOnlineMusicArtistWorkModifier/);
    assert.match(sortHelpersBody, /hasUsableOnlineMusicCatalogArtwork\(clean\)/);
    assert.doesNotMatch(sortHelpersBody, /name\.includes\(key\)\s*\|\|\s*key\.includes\(name\)/);
    assert.doesNotMatch(sortHelpersBody, /track\?\.releaseTitle/);

    const onlineStateStart = html.indexOf('function createDefaultOnlineMusicState');
    const onlineStateEnd = html.indexOf('function createDefaultPrivateSessionState', onlineStateStart);
    assert.notEqual(onlineStateStart, -1);
    assert.notEqual(onlineStateEnd, -1);
    const onlineStateBody = html.slice(onlineStateStart, onlineStateEnd);
    assert.match(onlineStateBody, /artistWorkSortMode: 'best'/);
    assert.match(onlineStateBody, /artistWorkSearchQuery: ''/);

    const storedStateStart = html.indexOf('function sanitizeStoredOnlineMusicState');
    const storedStateEnd = html.indexOf('function sanitizeStoredOnlineMusicLibrary', storedStateStart);
    assert.notEqual(storedStateStart, -1);
    assert.notEqual(storedStateEnd, -1);
    const storedStateBody = html.slice(storedStateStart, storedStateEnd);
    assert.match(storedStateBody, /artistWorkSortMode: normalizeOnlineMusicArtistWorkSortMode/);
    assert.match(storedStateBody, /artistWorkSearchQuery: sanitizeText/);

    const artistChangeStart = html.indexOf('function handleOnlineMusicContentChange');
    const artistChangeEnd = html.indexOf('function renderOnlineMusicReleaseCardsLegacy', artistChangeStart);
    assert.notEqual(artistChangeStart, -1);
    assert.notEqual(artistChangeEnd, -1);
    const artistChangeBody = html.slice(artistChangeStart, artistChangeEnd);
    assert.match(artistChangeBody, /setOnlineMusicArtistWorkSortMode/);

    const artistInputStart = html.indexOf('function handleOnlineMusicContentInput');
    const artistInputEnd = html.indexOf('function handleOnlineMusicContentChange', artistInputStart);
    assert.notEqual(artistInputStart, -1);
    assert.notEqual(artistInputEnd, -1);
    const artistInputBody = html.slice(artistInputStart, artistInputEnd);
    assert.match(artistInputBody, /data-online-music-artist-work-search/);
    assert.match(artistInputBody, /setOnlineMusicArtistWorkSearchQuery/);

    const artistSearchSetterStart = html.indexOf('function sanitizeOnlineMusicArtistWorkSearchInput');
    const artistSearchSetterEnd = html.indexOf('function clearOnlineMusicArtistWorkSearchQuery', artistSearchSetterStart);
    assert.notEqual(artistSearchSetterStart, -1);
    assert.notEqual(artistSearchSetterEnd, -1);
    const artistSearchSetterBody = html.slice(artistSearchSetterStart, artistSearchSetterEnd);
    assert.match(artistSearchSetterBody, /replace\(\/\[<>\]\/g, ''\)/);
    assert.match(artistSearchSetterBody, /const nextQuery = sanitizeOnlineMusicArtistWorkSearchInput\(value \|\| ''\)/);
    assert.doesNotMatch(artistSearchSetterBody, /sanitizeText\(value \|\| ''\)/);
    assert.doesNotMatch(artistSearchSetterBody, /\.trim\(/);

    const primeStart = html.indexOf('function primeOnlineMusicArtistReleaseTracks');
    const primeEnd = html.indexOf('async function openOnlineMusicArtistFromTrack', primeStart);
    assert.notEqual(primeStart, -1);
    assert.notEqual(primeEnd, -1);
    const primeBody = html.slice(primeStart, primeEnd);
    assert.match(primeBody, /\['itunes', 'deezer', 'musicbrainz'\]\.includes\(provider\)/);
    assert.match(primeBody, /\.slice\(0, ONLINE_MUSIC_ARTIST_RELEASE_PREFETCH_LIMIT\)/);
    assert.match(primeBody, /ONLINE_MUSIC_ARTIST_RELEASE_PREFETCH_CONCURRENCY/);
    assert.match(primeBody, /Array\.from\(\{ length: workerCount \}, async \(\) =>/);
    assert.match(primeBody, /Promise\.all\(workers\)/);
    assert.doesNotMatch(primeBody, /\.slice\(0, 12\)/);
    assert.doesNotMatch(primeBody, /releases\.forEach/);
    assert.match(primeBody, /recoverySearchLimit: 4/);

    const artistSortSetterStart = html.indexOf('function setOnlineMusicArtistWorkSortMode');
    const artistSortSetterEnd = html.indexOf('function handleOnlineMusicContentChange', artistSortSetterStart);
    assert.notEqual(artistSortSetterStart, -1);
    assert.notEqual(artistSortSetterEnd, -1);
    const artistSortSetterBody = html.slice(artistSortSetterStart, artistSortSetterEnd);
    assert.match(artistSortSetterBody, /persistOnlineMusicState/);
    assert.match(artistSortSetterBody, /renderOnlineMusicContent/);

    const artistContextStart = html.indexOf('function getOnlineMusicTracksForContext');
    const artistContextEnd = html.indexOf('function resolveOnlineMusicActionTarget', artistContextStart);
    assert.notEqual(artistContextStart, -1);
    assert.notEqual(artistContextEnd, -1);
    const artistContextBody = html.slice(artistContextStart, artistContextEnd);
    assert.match(artistContextBody, /getOnlineMusicArtistTrackSearchPool\(online\.browserArtist\)/);
    assert.doesNotMatch(artistContextBody, /browserArtist\?\.allWork\) \? online\.browserArtist\.allWork/);

    const queueTracksStart = html.indexOf('function getOnlineMusicTracksForView');
    const queueTracksEnd = html.indexOf('function getOnlineMusicQueueContextKey', queueTracksStart);
    assert.notEqual(queueTracksStart, -1);
    assert.notEqual(queueTracksEnd, -1);
    const queueTracksBody = html.slice(queueTracksStart, queueTracksEnd);
    assert.match(queueTracksBody, /filterOnlineMusicArtistTracksForSearch/);
    assert.match(queueTracksBody, /getOnlineMusicArtistTrackSearchPool/);
    assert.match(queueTracksBody, /online\.artistWorkSearchQuery/);

    const appInitStart = html.indexOf('function setupEventListeners');
    const appInitEnd = html.indexOf('if (onlineMusicSeek)', appInitStart);
    assert.notEqual(appInitStart, -1);
    assert.notEqual(appInitEnd, -1);
    const appInitBody = html.slice(appInitStart, appInitEnd);
    assert.match(appInitBody, /onlineMusicContent\.addEventListener\('input', handleOnlineMusicContentInput\)/);
});

test('online music artist catalogs normalize Topic names before provider lookup', () => {
    const helpersStart = html.indexOf('function normalizeOnlineMusicCatalogArtistName');
    const helpersEnd = html.indexOf('function createCatalogOnlyOnlineMusicArtistChannel', helpersStart);
    assert.notEqual(helpersStart, -1);
    assert.notEqual(helpersEnd, -1);
    const helpersBody = html.slice(helpersStart, helpersEnd);
    assert.match(helpersBody, /topic\|official\\s\+artist\\s\+channel/);
    assert.match(helpersBody, /normalizeOnlineMusicArtistMatchText/);
    assert.match(helpersBody, /buildOnlineMusicArtistCatalogCacheKey/);
    assert.match(helpersBody, /artistCatalogKey/);
    assert.match(helpersBody, /\.toLowerCase\(\)[\s\S]*?\.replace\(\/\[\^a-z0-9\]\+/);

    const catalogOnlyEnd = html.indexOf('function isCatalogOnlyOnlineMusicArtistChannel', helpersEnd);
    assert.notEqual(catalogOnlyEnd, -1);
    const catalogOnlyBody = html.slice(helpersEnd, catalogOnlyEnd);
    assert.match(catalogOnlyBody, /providerArtistIds/);

    const ownershipStart = html.indexOf('function getOnlineMusicCatalogArtistOwnershipNames');
    const ownershipEnd = html.indexOf('function normalizeOnlineMusicReleaseTitle', ownershipStart);
    assert.notEqual(ownershipStart, -1);
    assert.notEqual(ownershipEnd, -1);
    const ownershipBody = html.slice(ownershipStart, ownershipEnd);
    assert.match(ownershipBody, /function splitOnlineMusicArtistCredits/);
    assert.match(ownershipBody, /function getOnlineMusicReleaseArtistCandidates/);
    assert.match(ownershipBody, /function shouldKeepOnlineMusicCatalogReleaseForArtist/);
    assert.match(ownershipBody, /candidate === expected \|\| creditParts\.includes\(expected\)/);
    assert.doesNotMatch(ownershipBody, /candidate\.includes\(expected\)/);

    const itunesStart = html.indexOf('async function resolveItunesArtist');
    const itunesEnd = html.indexOf('async function fetchItunesArtistCatalog', itunesStart);
    assert.notEqual(itunesStart, -1);
    assert.notEqual(itunesEnd, -1);
    const itunesBody = html.slice(itunesStart, itunesEnd);
    assert.match(itunesBody, /const artistName = getOnlineMusicCatalogArtistName\(channel\)/);
    assert.match(itunesBody, /shouldKeepOnlineMusicCatalogReleaseForArtist\(item, channel, artist\)/);
    assert.match(itunesBody, /shouldKeepOnlineMusicCatalogReleaseForArtist\(item, channel, \{ title: safeName \}\)/);
    assert.doesNotMatch(itunesBody, /const artistName = sanitizeText\(channel\?\.title/);

    const deezerStart = html.indexOf('async function resolveDeezerArtist');
    const deezerEnd = html.indexOf('async function fetchDeezerArtistAlbums', deezerStart);
    assert.notEqual(deezerStart, -1);
    assert.notEqual(deezerEnd, -1);
    const deezerBody = html.slice(deezerStart, deezerEnd);
    assert.match(deezerBody, /const artistName = getOnlineMusicCatalogArtistName\(channel\)/);
    assert.doesNotMatch(deezerBody, /const artistName = sanitizeText\(channel\?\.title/);

    const deezerCatalogStart = html.indexOf('async function searchDeezerAlbumReleasesByArtistName');
    const deezerCatalogEnd = html.indexOf('function formatMusicBrainzArtistCredit', deezerCatalogStart);
    assert.notEqual(deezerCatalogStart, -1);
    assert.notEqual(deezerCatalogEnd, -1);
    const deezerCatalogBody = html.slice(deezerCatalogStart, deezerCatalogEnd);
    assert.match(deezerCatalogBody, /shouldKeepOnlineMusicCatalogReleaseForArtist\(item, channel, \{ title: safeName \}\)/);
    assert.match(deezerCatalogBody, /shouldKeepOnlineMusicCatalogReleaseForArtist\(item, channel, artist\)/);

    const priorityStart = html.indexOf('function getOnlineMusicReleaseSourcePriority');
    const priorityEnd = html.indexOf('function buildOnlineMusicReleaseSourceKey', priorityStart);
    assert.notEqual(priorityStart, -1);
    assert.notEqual(priorityEnd, -1);
    const priorityBody = html.slice(priorityStart, priorityEnd);
    assert.ok(priorityBody.indexOf("provider === 'itunes'") < priorityBody.indexOf("provider === 'youtube'"));
    assert.match(priorityBody, /provider === 'musicbrainz'/);

    const bucketStart = html.indexOf('function normalizeOnlineMusicReleaseBucket');
    const bucketEnd = html.indexOf('function getOnlineMusicReleaseTitleVariantPenalty', bucketStart);
    assert.notEqual(bucketStart, -1);
    assert.notEqual(bucketEnd, -1);
    const bucketBody = html.slice(bucketStart, bucketEnd);
    assert.match(bucketBody, /function classifyOnlineMusicArtistReleaseBucket/);
    assert.match(bucketBody, /otherReleases/);
    assert.match(bucketBody, /compilation\|soundtrack\|live/);
    assert.match(bucketBody, /isReusableOnlineMusicArtistCatalog/);
    assert.match(bucketBody, /ONLINE_MUSIC_ARTIST_CATALOG_SCHEMA_VERSION/);

    const publicReleaseStart = html.indexOf('function hasOfficialOnlineMusicDiscographySource');
    const publicReleaseEnd = html.indexOf('function sortOnlineMusicReleases', publicReleaseStart);
    assert.notEqual(publicReleaseStart, -1);
    assert.notEqual(publicReleaseEnd, -1);
    const publicReleaseBody = html.slice(publicReleaseStart, publicReleaseEnd);
    assert.match(publicReleaseBody, /\['itunes', 'deezer', 'spotify'\]/);
    assert.match(publicReleaseBody, /hasUsableOnlineMusicReleaseArtwork\(release\)/);
    assert.match(publicReleaseBody, /hasDisallowedOnlineMusicArtistReleaseDescriptor\(release\)/);
    assert.match(publicReleaseBody, /isOnlineMusicReleaseOwnedByArtist\(release, artist\)/);
    assert.match(publicReleaseBody, /bucket === 'otherReleases'/);
    assert.match(publicReleaseBody, /getOnlineMusicArtistCatalogForPublicView/);
    assert.doesNotMatch(publicReleaseBody, /provider === 'youtube'/);

    const searchTrackStart = html.indexOf('function createItunesSearchTrack');
    const searchTrackEnd = html.indexOf('function canUseDesktopYouTubeMusicSearch', searchTrackStart);
    assert.notEqual(searchTrackStart, -1);
    assert.notEqual(searchTrackEnd, -1);
    const searchTrackBody = html.slice(searchTrackStart, searchTrackEnd);
    assert.match(searchTrackBody, /providerArtistId: sanitizeText\(item\?\.artistId/);
    assert.match(searchTrackBody, /providerReleaseId: sanitizeText\(item\?\.collectionId/);
    assert.match(searchTrackBody, /providerArtistId: sanitizeText\(item\?\.artist\?\.id/);
    assert.match(searchTrackBody, /providerReleaseId: sanitizeText\(item\?\.album\?\.id/);

    const musicBrainzStart = html.indexOf('async function fetchMusicBrainzArtistCatalog');
    const musicBrainzEnd = html.indexOf('function buildOnlineMusicArtistCatalog', musicBrainzStart);
    assert.notEqual(musicBrainzStart, -1);
    assert.notEqual(musicBrainzEnd, -1);
    const musicBrainzBody = html.slice(musicBrainzStart, musicBrainzEnd);
    assert.match(musicBrainzBody, /searchMusicBrainzArtistCandidate/);
    assert.match(musicBrainzBody, /fetchMusicBrainzReleaseGroups/);
    assert.match(musicBrainzBody, /createMusicBrainzReleaseFromGroup/);

    const artistCatalogBuilderStart = html.indexOf('function buildOnlineMusicArtistCatalog');
    const artistCatalogBuilderEnd = html.indexOf('function updateOnlineMusicArtistCatalog', artistCatalogBuilderStart);
    assert.notEqual(artistCatalogBuilderStart, -1);
    assert.notEqual(artistCatalogBuilderEnd, -1);
    const artistCatalogBuilderBody = html.slice(artistCatalogBuilderStart, artistCatalogBuilderEnd);
    assert.match(artistCatalogBuilderBody, /const catalogIdentity/);
    assert.match(artistCatalogBuilderBody, /filterOnlineMusicArtistWorkTracksForArtist\(uploadsTracks, catalogIdentity\)/);

    const artistCatalogMergeStart = html.indexOf('function mergeTracksIntoOnlineMusicArtistCatalog');
    const artistCatalogMergeEnd = html.indexOf('function getOnlineMusicArtistRelease', artistCatalogMergeStart);
    assert.notEqual(artistCatalogMergeStart, -1);
    assert.notEqual(artistCatalogMergeEnd, -1);
    const artistCatalogMergeBody = html.slice(artistCatalogMergeStart, artistCatalogMergeEnd);
    assert.match(artistCatalogMergeBody, /const filteredTracks = filterOnlineMusicArtistWorkTracksForArtist\(tracks, catalog\)/);
    assert.match(artistCatalogMergeBody, /allWork: mergeUniqueOnlineMusicTracks\(\[\.\.\.\(catalog\.allWork \|\| \[\]\), \.\.\.filteredTracks\]\)/);

    const musicBrainzFactoryStart = html.indexOf('function createMusicBrainzReleaseFromGroup');
    const musicBrainzFactoryEnd = html.indexOf('async function searchMusicBrainzArtistCandidate', musicBrainzFactoryStart);
    assert.notEqual(musicBrainzFactoryStart, -1);
    assert.notEqual(musicBrainzFactoryEnd, -1);
    const musicBrainzFactoryBody = html.slice(musicBrainzFactoryStart, musicBrainzFactoryEnd);
    assert.match(musicBrainzFactoryBody, /releaseBucket/);
    assert.match(musicBrainzFactoryBody, /releaseSubtypes/);

    const artistReleaseStart = html.indexOf('function getOnlineMusicArtistRelease');
    const artistReleaseEnd = html.indexOf('async function fetchItunesReleaseTrackCandidates', artistReleaseStart);
    assert.notEqual(artistReleaseStart, -1);
    assert.notEqual(artistReleaseEnd, -1);
    const artistReleaseBody = html.slice(artistReleaseStart, artistReleaseEnd);
    assert.match(artistReleaseBody, /getOnlineMusicArtistCatalogForPublicView\(online\.browserArtist\)/);
    assert.match(artistReleaseBody, /publicArtist\?\.otherReleases/);

    const privateReleaseStart = html.indexOf('function getPrivateSessionArtistRelease');
    const privateReleaseEnd = html.indexOf('function returnToPrivateSessionOnlineSearch', privateReleaseStart);
    assert.notEqual(privateReleaseStart, -1);
    assert.notEqual(privateReleaseEnd, -1);
    const privateReleaseBody = html.slice(privateReleaseStart, privateReleaseEnd);
    assert.match(privateReleaseBody, /browserArtist\?\.otherReleases/);

    const privateArtistViewStart = html.indexOf('function renderPrivateSessionOnlineArtistView');
    const privateArtistViewEnd = html.indexOf('function renderPrivateSessionOnlineReleaseView', privateArtistViewStart);
    assert.notEqual(privateArtistViewStart, -1);
    assert.notEqual(privateArtistViewEnd, -1);
    const privateArtistViewBody = html.slice(privateArtistViewStart, privateArtistViewEnd);
    assert.match(privateArtistViewBody, /sortOnlineMusicArtistReleasesForView\(artist\.albums/);
    assert.match(privateArtistViewBody, /sortOnlineMusicArtistTracksForView\(allWork/);
    assert.match(privateArtistViewBody, /renderOnlineMusicArtistWorkSortControl\(sortMode, \{ variant: 'private' \}\)/);

    const privateSortSetterStart = html.indexOf('function setPrivateSessionArtistWorkSortMode');
    const privateSortSetterEnd = html.indexOf('async function openPrivateSessionOnlineArtist', privateSortSetterStart);
    assert.notEqual(privateSortSetterStart, -1);
    assert.notEqual(privateSortSetterEnd, -1);
    const privateSortSetterBody = html.slice(privateSortSetterStart, privateSortSetterEnd);
    assert.match(privateSortSetterBody, /normalizeOnlineMusicArtistWorkSortMode/);
    assert.match(privateSortSetterBody, /renderPrivateSessionCollections/);

    const releaseSourceStart = html.indexOf('async function fetchOnlineMusicReleaseTracksFromSource');
    const releaseSourceEnd = html.indexOf('async function loadOnlineMusicReleaseTracks', releaseSourceStart);
    assert.notEqual(releaseSourceStart, -1);
    assert.notEqual(releaseSourceEnd, -1);
    const releaseSourceBody = html.slice(releaseSourceStart, releaseSourceEnd);
    assert.match(releaseSourceBody, /provider === 'musicbrainz'/);
    assert.match(releaseSourceBody, /fetchMusicBrainzReleaseTrackCandidates/);

    const identityStart = html.indexOf('function buildOnlineMusicReleaseIdentity');
    const identityEnd = html.indexOf('function getOnlineMusicReleaseSourcePriority', identityStart);
    assert.notEqual(identityStart, -1);
    assert.notEqual(identityEnd, -1);
    const identityBody = html.slice(identityStart, identityEnd);
    assert.match(identityBody, /normalizeOnlineMusicReleaseTitle\(release\?\.title/);
    assert.doesNotMatch(identityBody, /publishedAt/);

    const titleNormalizerStart = html.indexOf('function normalizeOnlineMusicReleaseTitle');
    const titleNormalizerEnd = html.indexOf('function buildOnlineMusicReleaseIdentity', titleNormalizerStart);
    assert.notEqual(titleNormalizerStart, -1);
    assert.notEqual(titleNormalizerEnd, -1);
    const titleNormalizerBody = html.slice(titleNormalizerStart, titleNormalizerEnd);
    assert.match(titleNormalizerBody, /super\\s\+deluxe\|deluxe\|expanded/);
    assert.ok(titleNormalizerBody.includes('\\b\\d{1,3}(?:st|nd|rd|th)?\\s+anniversary\\b'));
    assert.ok(titleNormalizerBody.includes('^(.{2,}?)\\s+\\d{2,3}$'));

    const variantPenaltyStart = html.indexOf('function getOnlineMusicReleaseTitleVariantPenalty');
    const displayScoreStart = html.indexOf('function getOnlineMusicReleaseDisplayScore', variantPenaltyStart);
    assert.notEqual(variantPenaltyStart, -1);
    assert.notEqual(displayScoreStart, -1);
    const variantPenaltyBody = html.slice(variantPenaltyStart, displayScoreStart);
    assert.match(variantPenaltyBody, /deluxe\|expanded\|super\\s\+deluxe\|anniversary/);
    assert.ok(variantPenaltyBody.includes('^(.{2,}?)\\s+\\d{2,3}$'));

    const displayScoreEnd = html.indexOf('function choosePreferredOnlineMusicRelease', displayScoreStart);
    assert.notEqual(displayScoreEnd, -1);
    const displayScoreBody = html.slice(displayScoreStart, displayScoreEnd);
    assert.match(displayScoreBody, /directTitle === normalizedTitle/);
    assert.match(displayScoreBody, /getOnlineMusicReleaseTitleVariantPenalty\(release\)/);

    const rankTrackCountStart = html.indexOf('function getOnlineMusicReleaseRankTrackCount');
    const mergeRecordsStart = html.indexOf('function mergeOnlineMusicReleaseRecords', rankTrackCountStart);
    assert.notEqual(rankTrackCountStart, -1);
    assert.notEqual(mergeRecordsStart, -1);
    const rankTrackCountBody = html.slice(rankTrackCountStart, mergeRecordsStart);
    assert.match(rankTrackCountBody, /healthyExactCount/);
    assert.match(rankTrackCountBody, /directTitle === normalizedTitle/);

    const rankStart = html.indexOf('function getOnlineMusicReleaseBrowseRank');
    const sortStart = html.indexOf('function sortOnlineMusicReleases', rankStart);
    assert.notEqual(rankStart, -1);
    assert.notEqual(sortStart, -1);
    const rankBody = html.slice(rankStart, sortStart);
    assert.match(rankBody, /provider === 'youtube'[\s\S]*?score -= 80/);
    assert.match(rankBody, /provider === 'deezer' && trackCount === 0/);
    assert.match(rankBody, /discography\|full\\s\+album\|playlist/);
    assert.match(rankBody, /greatest\\s\+hits\?\|best\\s\+of/);
    assert.match(rankBody, /remix\(\?:es\)\?\|mix\(\?:es\)\?\|stripped/);
    assert.match(rankBody, /getOnlineMusicReleaseRankTrackCount\(release\)/);
    assert.match(rankBody, /getOnlineMusicReleaseTitleVariantPenalty\(release\)/);

    const sortEnd = html.indexOf('function mergeUniqueOnlineMusicTracks', sortStart);
    assert.notEqual(sortEnd, -1);
    const sortBody = html.slice(sortStart, sortEnd);
    assert.match(sortBody, /getOnlineMusicReleaseBrowseRank\(right\) - getOnlineMusicReleaseBrowseRank\(left\)/);
});

test('desktop release views list catalog tracks before playback resolution', () => {
    const resolverStart = html.indexOf('async function resolveOnlineMusicProviderReleaseTrackCandidates');
    const fallbackSearch = html.indexOf('searchOnlineMusicFallbackTrackForPlaylistItem', resolverStart);
    const pendingFactory = html.indexOf('createPendingOnlineMusicTrackFromCatalogCandidate', resolverStart);
    assert.notEqual(resolverStart, -1);
    assert.notEqual(fallbackSearch, -1);
    assert.notEqual(pendingFactory, -1);
    assert.ok(pendingFactory < fallbackSearch);

    const resolverBody = html.slice(resolverStart, fallbackSearch);
    assert.match(resolverBody, /if \(isOnlineMusicPlaybackResolutionAvailable\(\)\)/);
    assert.match(resolverBody, /missingTrackCount: 0/);
    assert.match(resolverBody, /rawItems: candidates/);
});

test('top played cards and list rows show per-track play counts', () => {
    const helperStart = html.indexOf('function renderTopPlayedCountBadge');
    const helperEnd = html.indexOf('function renderTracks', helperStart);
    assert.notEqual(helperStart, -1);
    assert.notEqual(helperEnd, -1);
    const helperBody = html.slice(helperStart, helperEnd);
    assert.match(helperBody, /state\.activeTab !== 'top'/);
    assert.match(helperBody, /formatTrackPlayCountLabel\(track\)/);
    assert.match(helperBody, /data-top-played-count/);

    const renderStart = html.indexOf('function renderTracks');
    const renderEnd = html.indexOf('bindTrackCoverImageFallbacks(container)', renderStart);
    assert.notEqual(renderStart, -1);
    assert.notEqual(renderEnd, -1);
    const renderBody = html.slice(renderStart, renderEnd);
    assert.match(renderBody, /<h3 class="min-w-0 font-bold text-sm truncate/);
    assert.match(renderBody, /renderTopPlayedCountBadge\(track, \{ compact: true \}\)/);
    assert.match(renderBody, /renderTopPlayedCountBadge\(track\)/);
    assert.match(renderBody, /const animateTrackRows = filtered\.length <= 160/);
    assert.match(renderBody, /entranceDelayLimit = performanceTier === 'low' \? 8 : 16/);
    assert.match(renderBody, /entranceDelayStep = performanceTier === 'low' \? 0\.012 : 0\.018/);
    assert.doesNotMatch(renderBody, /i \* 0\.05/);
});
