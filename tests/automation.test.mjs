import test from 'node:test';
import assert from 'node:assert/strict';

import { AutomationEngine } from '../nexplay-next/services/automation-engine.js';

test('automation executes enabled rules in priority order', async () => {
    const engine = new AutomationEngine();
    /** @type {any[]} */
    const calls = [];

    engine.registerActionHandler('set_speed', async (/** @type {any} */ payload) => {
        calls.push(`speed:${payload.speed}`);
    });

    engine.setRules([
        {
            id: 'r2',
            name: 'Second',
            enabled: true,
            priority: 2,
            trigger: { type: 'on_app_start' },
            actions: [{ type: 'set_speed', payload: { speed: 1.5 } }],
            updatedAt: Date.now()
        },
        {
            id: 'r1',
            name: 'First',
            enabled: true,
            priority: 1,
            trigger: { type: 'on_app_start' },
            actions: [{ type: 'set_speed', payload: { speed: 1.25 } }],
            updatedAt: Date.now()
        },
        {
            id: 'disabled',
            name: 'Disabled',
            enabled: false,
            priority: 0,
            trigger: { type: 'on_app_start' },
            actions: [{ type: 'set_speed', payload: { speed: 2 } }],
            updatedAt: Date.now()
        }
    ]);

    await engine.evaluate('on_app_start', {});
    assert.deepEqual(calls, ['speed:1.25', 'speed:1.5']);
});
