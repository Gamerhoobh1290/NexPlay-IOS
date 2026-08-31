import fs from 'node:fs';

const SOURCE_PARTS = [
    '../index.html',
    '../css/base.css',
    '../css/theme.css',
    '../css/components.css',
    '../css/animations.css',
    '../js/legacy/runtime-config.js',
    '../js/legacy/runtime-state.js',
    '../js/legacy/helpers.js',
    '../js/legacy/online-playlists.js',
    '../js/legacy/online-music.js',
    '../js/legacy/app-init.js',
    '../js/legacy/library.js',
    '../js/legacy/player.js',
    '../js/legacy/visualizer.js',
    '../js/legacy/settings-and-video.js',
    '../js/legacy/rendering.js',
    '../js/legacy/smart-playlists.js',
    '../js/legacy/queue.js',
    '../js/legacy/theme-and-shortcuts.js',
    '../js/legacy/modals-and-modes.js',
    '../js/legacy-api.js',
    '../js/bootstrap.js',
    '../js/app.js'
];

export function readNexPlaySource() {
    return SOURCE_PARTS
        .map((part) => fs.readFileSync(new URL(part, import.meta.url), 'utf8'))
        .join('\n\n');
}
