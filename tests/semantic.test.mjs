import test from 'node:test';
import assert from 'node:assert/strict';

import { SemanticIntelligenceService } from '../nexplay-next/services/semantic-intelligence.js';

test('semantic query parser extracts tab/tag/sort and free text', () => {
    const service = new SemanticIntelligenceService();
    const parsed = service.parseNaturalQuery('video tag:live recent artist mix');

    assert.equal(parsed.mediaTab, 'videos');
    assert.equal(parsed.tag, 'live');
    assert.equal(parsed.sortType, 'date');
    assert.equal(parsed.sortDirection, 'desc');
    assert.equal(parsed.freeText, 'artist mix');
});

test('semantic tag suggestions include media and inferred tags', () => {
    const service = new SemanticIntelligenceService();
    const tags = service.suggestTags({
        title: 'Live Concert Remix',
        artist: 'Ambient Unit',
        type: 'audio',
        fileName: 'live_remix_track.mp3'
    });

    assert.equal(tags.includes('audio'), true);
    assert.equal(tags.includes('live'), true);
    assert.equal(tags.includes('remix'), true);
});
