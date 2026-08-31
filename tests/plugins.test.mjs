import test from 'node:test';
import assert from 'node:assert/strict';

import { PluginRegistry } from '../nexplay-next/core/plugin-registry.js';

test('plugin registry registers and initializes enabled plugins', async () => {
    const registry = new PluginRegistry();
    /** @type {any[]} */
    const calls = [];

    registry.register({
        id: 'one',
        name: 'One',
        setup: async (/** @type {any} */ ctx) => {
            calls.push(ctx.value);
        }
    });

    registry.register({ id: 'two', name: 'Two' });
    registry.setEnabled('two', false);

    await registry.initialize({ value: 'ok' });

    assert.deepEqual(calls, ['ok']);
    assert.equal(registry.list().length, 2);
});
