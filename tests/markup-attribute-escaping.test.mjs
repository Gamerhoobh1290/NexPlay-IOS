import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const legacyDir = new URL('../js/legacy/', import.meta.url);
const legacyFiles = fs.readdirSync(legacyDir).filter((name) => name.endsWith('.js'));

test('legacy markup never interpolates a raw value into a URL or style attribute', () => {
    // Cover URLs come from backups, provider APIs and stored metadata. A quote in
    // one closes the attribute and lets the rest of the value add an onerror
    // handler, so every interpolation into these attributes must be escaped.
    const rawAttribute = /\b(?:src|href|poster|style)="\$\{(?!escapeHtml\()[^}]*\}/g;
    /** @type {string[]} */
    const offenders = [];
    for (const name of legacyFiles) {
        const lines = fs.readFileSync(new URL(name, legacyDir), 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
            for (const match of line.matchAll(rawAttribute)) {
                offenders.push(`${name}:${index + 1} ${match[0]}`);
            }
        });
    }
    assert.deepEqual(offenders, []);
});

test('snake segment covers are emitted as a quoted CSS string', () => {
    const rendering = fs.readFileSync(new URL('rendering.js', legacyDir), 'utf8');
    assert.doesNotMatch(rendering, /background-image:url\('\$\{cover\}'\)/);
});
