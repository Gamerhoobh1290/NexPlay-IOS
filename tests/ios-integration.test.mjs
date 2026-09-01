import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

/** @param {string} relativePath */
const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const mobile = read('NexPlay.mobile.html');
const app = read('ios/NexPlay/NexPlay/NexPlayApp.swift');
const contentView = read('ios/NexPlay/NexPlay/ContentView.swift');
const webView = read('ios/NexPlay/NexPlay/NexPlayWebView.swift');
const playbackBridge = read('ios/NexPlay/NexPlay/NexPlayPlaybackBridge.swift');
const bridgeScripts = read('ios/NexPlay/NexPlay/NexPlayIOSBridgeScripts.swift');
const infoPlist = read('ios/NexPlay/NexPlay/Info.plist');
const project = read('ios/NexPlay/NexPlay.xcodeproj/project.pbxproj');

const iphoneSiteBuild = read('scripts/build-iphone-site.cjs');

const MOBILE_ALLOWED_TABS_SOURCE = mobile.match(/const MOBILE_ALLOWED_TABS = new Set\(\[[^\]]*\]\)/)?.[0] || '';

test('every top-level directory the shells reference is staged by the iPhone site build', () => {
    // The build validates that sources exist, not that references resolve, so a
    // shell can silently ship with a dangling ./vendor or ./css reference.
    const referenced = new Set();
    for (const html of [mobile, read('index.html')]) {
        for (const match of html.matchAll(/(?:src|href)="\.\/([^/"]+)\//g)) {
            referenced.add(match[1]);
        }
    }
    assert.ok(referenced.has('vendor'), 'shells should reference the vendored libraries');
    for (const directory of referenced) {
        assert.ok(
            iphoneSiteBuild.includes(`'${directory}'`),
            `build-iphone-site.cjs must stage ./${directory}/`
        );
    }
});

test('iOS build bundles every local dependency used by the mobile shell', () => {
    for (const path of ['css', 'js', 'components', 'assets', 'vendor', 'nexplay-next']) {
        assert.match(project, new RegExp(`\\$\\(SRCROOT\\)/\\.\\./\\.\\./${path}`));
        assert.match(project, new RegExp(`for item in [^;]*\\b${path}\\b`));
    }
    assert.match(project, /NexPlay\.mobile\.html/);
});

test('iPhone shell loads fonts, icons, and charts from the bundle rather than a CDN', () => {
    assert.doesNotMatch(mobile, /fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdn\.jsdelivr\.net/);
    assert.match(mobile, /\.\/vendor\/lucide\/lucide\.min\.js/);
    assert.match(mobile, /\.\/vendor\/chart\/chart\.umd\.min\.js/);
    assert.match(mobile, /\.\/vendor\/fonts\/outfit\/300\.css/);
    assert.match(mobile, /\.\/vendor\/fonts\/space-mono\/700\.css/);
});

test('iPhone shell exposes safe areas, system appearance, and native runtime identity', () => {
    assert.match(mobile, /viewport-fit=cover/);
    assert.match(mobile, /env\(safe-area-inset-top\)/);
    assert.match(mobile, /env\(safe-area-inset-bottom\)/);
    assert.match(mobile, /function isIOSNativeRuntime\(\)/);
    assert.match(mobile, /isIOSNativeRuntime\(\) \? 'iPhone App' : 'Web Build'/);
    assert.doesNotMatch(app, /preferredColorScheme\(\.dark\)/);
    assert.match(contentView, /Color\(uiColor: \.systemBackground\)/);
});

test('no provider API key is baked into a publicly served source file', () => {
    // The web build serves js/ verbatim, so a committed key is world-readable
    // the moment the site deploys. Keys belong in Settings > Online Music.
    const googleApiKey = /AIza[0-9A-Za-z_-]{30,}/;
    for (const source of ['js/legacy/runtime-config.js', 'NexPlay.mobile.html', 'index.html']) {
        assert.doesNotMatch(read(source), googleApiKey, `${source} must not contain an API key`);
    }
    assert.match(read('js/legacy/runtime-config.js'), /const YOUTUBE_DATA_API_KEY = '';/);
});

test('the viewport scale is pinned so iOS cannot zoom the shell', () => {
    assert.match(mobile, /name="viewport"[^>]*maximum-scale=1\.0[^>]*user-scalable=no/);
    assert.match(mobile, /touch-action:\s*pan-x pan-y/);

    // iOS force-zooms on focusing any control under 16px and never returns, so
    // the override must beat Tailwind's .text-sm/.text-xs class specificity.
    const coarseBlocks = [...mobile.matchAll(/@media \(pointer: coarse\) \{[\s\S]*?\n        \}/g)].map((match) => match[0]);
    const inputBlock = coarseBlocks.find((block) => /\binput,/.test(block));
    assert.ok(inputBlock, 'expected a pointer:coarse block sizing form controls');
    assert.match(inputBlock, /font-size:\s*16px\s*!important/);

    // Safari ignores user-scalable=no; only these gesture events stop a pinch,
    // and they are inert unless the listener is non-passive.
    assert.match(mobile, /'gesturestart', 'gesturechange', 'gestureend'/);
    assert.match(mobile, /\{ passive: false \}/);
    assert.match(mobile, /lockViewportScale\(\);/);
    // A touchend preventDefault would swallow the click on transport buttons.
    assert.doesNotMatch(mobile, /addEventListener\('touchend'[\s\S]{0,200}preventDefault/);
});

test('iOS is told to tap the embed rather than shown a stalling connect message', () => {
    // iOS blocks playVideo() from script, so the generic "connecting" copy just
    // stalls before failing. Both the status line and the timeout warning must
    // name the real action, and only until a tap has unlocked the frame.
    assert.match(mobile, /isConnecting\) status\.textContent = \(isIOSWebKitRuntime\(\) && !onlineMusicEmbedGestureUnlocked\)/);
    assert.match(mobile, /Tap play on the video once/);
    assert.match(mobile, /iOS only lets the video itself start the first stream/);
    assert.match(mobile, /const blockedHint = \(isIOSWebKitRuntime\(\) && !onlineMusicEmbedGestureUnlocked\)/);
});

test('the YouTube embed is never re-parented and stays reachable off the Online tab', () => {
    // Moving an iframe in the DOM discards its browsing context, which drops the
    // YT player object and the iOS in-frame gesture that permits playback.
    assert.doesNotMatch(mobile, /anchor\.appendChild\(shell\)/);
    assert.match(mobile, /function positionOnlineMusicPlayerShell\(\)/);
    assert.match(mobile, /id="online-music-embed-dock"/);
    assert.match(mobile, /function shouldShowOnlineMusicEmbedDock\(current\)/);
    // A tap inside the frame unlocks script-driven playback for the rest of the session.
    assert.match(mobile, /onlineMusicEmbedGestureUnlocked = true;/);
});

test('online playback cannot hang forever waiting on the YouTube embed', () => {
    // onReady is the only thing that settles the player promise. A Home Screen web
    // app where it never arrives used to sit on "Connecting..." indefinitely, because
    // the connect timeout was armed only after that await.
    assert.match(mobile, /const ONLINE_MUSIC_PLAYER_READY_TIMEOUT_MS = \d+;/);
    assert.match(mobile, /}, ONLINE_MUSIC_PLAYER_READY_TIMEOUT_MS\);/);
    const play = mobile.slice(mobile.indexOf('async function playOnlineMusicTrack('));
    const armIndex = play.indexOf('scheduleOnlineMusicConnectTimeout(resolved.id, sessionId)');
    const awaitIndex = play.indexOf('await playerPromise');
    assert.ok(armIndex > -1 && awaitIndex > -1, 'both the stall guard and the await must exist');
    assert.ok(armIndex < awaitIndex, 'the stall guard must be armed before the player await');
});

test('a dead scripted player falls back to a tappable embed', () => {
    // The plain embed needs neither the iframe API nor an onReady handshake, so it
    // still plays where the scripted player cannot be driven at all.
    assert.match(mobile, /function mountOnlineMusicFallbackEmbed\(track\)/);
    assert.match(mobile, /id="online-music-fallback-frame"|frame\.id = 'online-music-fallback-frame'/);
    assert.match(mobile, /if \(onlineMusicFallbackEmbedActive\) return true;/);
    // No inspector exists on a Home Screen app, so the engine stage is the only readout.
    assert.match(mobile, /id="online-music-engine-stage"/);
    assert.match(mobile, /function setOnlineMusicEngineStage\(stage, detail = ''\)/);
});

test('the bundled worker leaves cross-origin requests to the browser', () => {
    // This is the worker the iOS bundle and the local iPhone server ship; the Netlify
    // build generates its own, which already bypasses YouTube. Keep the two agreed so
    // the iframe API is never served from a cache on either path.
    const worker = read('sw.js');
    assert.match(worker, /if \(!isSameOrigin\) return;/);
    assert.doesNotMatch(worker, /isSameOrigin\s*\?\s*networkFirst/);
});

test('the mobile library exposes playlists instead of bouncing back to All', () => {
    assert.match(mobile, /\{ id: 'playlists', label: 'Playlists' \}/);
    assert.ok(MOBILE_ALLOWED_TABS_SOURCE.includes("'playlists'"), 'playlists must be an allowed mobile tab');
    assert.doesNotMatch(
        mobile,
        /mobile-beginner'\) && state\.activeTab === 'playlists'/,
        'beginner mode must not silently rewrite the playlists tab to all'
    );
});

test('iPhone shell suppresses the WKWebView touch tells', () => {
    assert.match(mobile, /-webkit-text-size-adjust:\s*100%/);
    assert.match(mobile, /-webkit-tap-highlight-color:\s*transparent/);
    assert.match(mobile, /touch-action:\s*manipulation/);
    assert.match(mobile, /-webkit-touch-callout:\s*none/);
    assert.match(mobile, /overscroll-behavior:\s*contain/);
    // Text the user may want to copy must stay selectable.
    assert.match(mobile, /\[contenteditable="true"\][\s\S]{0,120}user-select:\s*text/);
});

test('transport controls meet the 44pt touch target minimum on touch devices', () => {
    // There is more than one pointer:coarse block, so select the one that
    // actually sizes the transport rather than assuming source order.
    const blocks = [...mobile.matchAll(/@media \(pointer: coarse\) \{[\s\S]*?\n        \}/g)].map((match) => match[0]);
    const coarse = blocks.find((block) => block.includes('#mini-play-toggle'));
    assert.ok(coarse, 'expected a pointer:coarse block sizing the transport controls');
    for (const id of ['#mini-play-toggle', '#mini-prev-btn', '#mini-next-btn', '#shuffle-btn', '#repeat-btn']) {
        assert.ok(coarse.includes(id), `${id} should get a 44pt touch target`);
    }
    assert.match(coarse, /min-width:\s*44px/);
    assert.match(coarse, /min-height:\s*44px/);
});

test('iOS Online Music uses device configuration and shared Desktop relevance logic', () => {
    assert.match(mobile, /const YOUTUBE_DATA_API_KEY = '';/);
    assert.match(mobile, /type="password"[^>]+aria-label="YouTube Data API key"[^>]+setOnlineMusicCustomApiKey/);
    assert.match(mobile, /scoreOnlineMusicSearchResultForQuery/);
    assert.match(mobile, /classifyOnlineMusicSearchResultEligibility/);
    assert.match(mobile, /mergeOnlineMusicSearchResults\(orderedResults, query\)/);
    assert.match(mobile, /navigator\.onLine === false/);
    assert.match(mobile, /addEventListener\('offline', handleOnlineMusicConnectivityChange\)/);
    assert.match(mobile, /addEventListener\('online', handleOnlineMusicConnectivityChange\)/);

    const configuredKeyStart = mobile.indexOf('function getConfiguredOnlineMusicApiKey');
    const configuredKeyEnd = mobile.indexOf('function syncConfiguredOnlineMusicApiKey', configuredKeyStart);
    const configuredKeySource = mobile.slice(configuredKeyStart, configuredKeyEnd);
    assert.doesNotMatch(configuredKeySource, /getOnlineMusicState\(\)\.apiKey/);
});

test('native playback bridge covers background audio lifecycle and lock-screen metadata', () => {
    assert.match(infoPlist, /<string>audio<\/string>/);
    assert.match(playbackBridge, /setCategory\(\.playback/);
    assert.match(playbackBridge, /configureAudioSession\(activate: false\)/);
    assert.match(playbackBridge, /AVAudioSession\.interruptionNotification/);
    assert.match(playbackBridge, /AVAudioSession\.routeChangeNotification/);
    assert.match(playbackBridge, /\.oldDeviceUnavailable/);
    assert.match(playbackBridge, /MPNowPlayingInfoCenter/);
    assert.match(playbackBridge, /MPMediaItemArtwork/);
    assert.match(playbackBridge, /MPRemoteCommandCenter/);
    assert.match(playbackBridge, /changePlaybackPositionCommand/);
    assert.match(playbackBridge, /data\.count <= 10_000_000/);

    for (const command of ['play', 'pause', 'toggle', 'next', 'previous', 'seekToMs']) {
        assert.match(bridgeScripts, new RegExp(`${command}: function`));
    }
    assert.match(bridgeScripts, /artworkUrl:/);
});

test('WKWebView keeps app navigation local and opens target-blank links externally', () => {
    assert.match(webView, /navigationAction\.targetFrame == nil/);
    assert.match(webView, /UIApplication\.shared\.open\(url\)/);
    assert.match(webView, /Self\.isLocalAppURL\(url\)/);
    assert.match(webView, /allowsInlineMediaPlayback = true/);
    assert.match(webView, /mediaTypesRequiringUserActionForPlayback = \[\]/);
});
