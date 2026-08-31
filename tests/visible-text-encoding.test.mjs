import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';

const scopedFiles = new Map([
    ['command palette', new URL('../nexplay-next/ui/command-palette.js', import.meta.url)],
    ['runtime config', new URL('../js/legacy/runtime-config.js', import.meta.url)],
    ['theme and shortcuts', new URL('../js/legacy/theme-and-shortcuts.js', import.meta.url)],
    ['rendering', new URL('../js/legacy/rendering.js', import.meta.url)],
    ['online music', new URL('../js/legacy/online-music.js', import.meta.url)],
    ['online playlists', new URL('../js/legacy/online-playlists.js', import.meta.url)]
]);

const scopedSources = new Map(
    Array.from(scopedFiles, ([name, url]) => [name, fs.readFileSync(url, 'utf8')])
);
const desktopHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/**
 * Return executable string and template literal text while excluding comments.
 * @param {string} source
 * @param {string} fileName
 */
function getLiteralText(source, fileName) {
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    /** @type {string[]} */
    const literals = [];

    /** @param {import('typescript').Node} node */
    function visit(node) {
        if (
            ts.isStringLiteral(node)
            || ts.isNoSubstitutionTemplateLiteral(node)
            || node.kind === ts.SyntaxKind.TemplateHead
            || node.kind === ts.SyntaxKind.TemplateMiddle
            || node.kind === ts.SyntaxKind.TemplateTail
        ) {
            literals.push(node.getText(sourceFile));
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return literals.join('\n');
}

test('confirmed desktop and web labels use the intended characters exactly', () => {
    const commandPalette = scopedSources.get('command palette') || '';
    const runtimeConfig = scopedSources.get('runtime config') || '';
    const themeAndShortcuts = scopedSources.get('theme and shortcuts') || '';
    const rendering = scopedSources.get('rendering') || '';
    const onlineMusic = scopedSources.get('online music') || '';
    const onlinePlaylists = scopedSources.get('online playlists') || '';

    assert.match(commandPalette, /Enter: run  •  Esc: close  •  Arrow keys: navigate/);
    assert.match(runtimeConfig, /title: 'Who’s That Artist\?'/);
    assert.match(themeAndShortcuts, /badge\.textContent = state\.repeatMode === 'one' \? '1' : '∞';/);
    assert.match(rendering, /\$\{tracks\.length\} tracks\$\{importedPl \? ` · \$\{escapeHtml\(importSourceLabel\)\}` : ''\}/);
    assert.match(rendering, /prompt: `\(\$\{left\} × \$\{right\}\) \+ \$\{extra\}`/);
    assert.match(onlineMusic, /importBtn\.textContent = 'Importing…';/);
    assert.match(onlineMusic, /albums · \$\{escapeHtml\(\(artist\.singlesEps \|\| \[\]\)\.length\)\} singles \/ eps ·/);
    assert.match(onlinePlaylists, /titleText\.match\(\/\^\(\[\^\|\]\{1,80\}\?\)\\s\[-–—\]\\s/);
    assert.match(desktopHtml, />Buffering…<\/div>/);
});

test('scoped executable and template text contains no replacement or mojibake marker characters', () => {
    for (const [name, source] of scopedSources) {
        const literalText = getLiteralText(source, `${name}.js`);
        assert.doesNotMatch(
            literalText,
            /[�ÃÂâ]/u,
            `${name} contains a replacement character or a common UTF-8 mojibake lead character`
        );
    }
});

test('saved video titles render a deliberate separator without replacement text', () => {
    const onlinePlaylists = scopedSources.get('online playlists') || '';
    const start = onlinePlaylists.indexOf('function deriveVideoLinkTitle');
    const end = onlinePlaylists.indexOf('function sanitizeStoredVideoLinks', start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    const context = vm.createContext({
        URL,
        decodeURIComponent,
        sanitizeText: /** @param {unknown} value */ (value) => String(value ?? '')
    });
    vm.runInContext(`${onlinePlaylists.slice(start, end)}; globalThis.derive = deriveVideoLinkTitle;`, context);

    assert.equal(context.derive({ platformLabel: 'YouTube', videoId: 'abc123' }), 'YouTube \u00B7 abc123');
    assert.equal(
        context.derive({ platformLabel: 'Direct', canonicalUrl: 'https://media.example/song.webm' }),
        'Direct \u00B7 song.webm'
    );
});
