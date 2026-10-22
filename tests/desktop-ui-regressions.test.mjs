import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync(new URL('../css/components.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Returns the declarations of every rule whose selector list matches `selectorPattern`.
 * @param {RegExp} selectorPattern
 */
function declarationsFor(selectorPattern) {
    const blocks = [];
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = rulePattern.exec(css))) {
        if (selectorPattern.test(match[1].trim())) blocks.push(match[2]);
    }
    return blocks.join('\n');
}

test('narrow library list rows keep a readable title column instead of collapsing it', () => {
    const row = declarationsFor(/^\.library-track-item\[data-view="list"\]$/);
    assert.match(row, /flex-wrap:\s*wrap/, 'actions should be able to drop below the title');

    const titleCluster = declarationsFor(/^\.library-track-item\[data-view="list"\]\s*>\s*:first-child$/);
    const basis = titleCluster.match(/flex:\s*1\s+1\s+(\d+(?:\.\d+)?)rem/);
    assert.ok(basis, 'title cluster needs a rem flex-basis so it cannot shrink to zero');
    // Checkbox gutter (1.25rem) + cover (3rem) + two 1rem gaps leave the title at least 6rem.
    assert.ok(Number(basis[1]) >= 12, `title cluster basis ${basis[1]}rem leaves the title too narrow`);

    const actions = declarationsFor(/^\.library-track-item\[data-view="list"\]\s*>\s*:last-child$/);
    assert.match(actions, /margin-left:\s*auto/, 'wrapped actions should stay right-aligned');
});
