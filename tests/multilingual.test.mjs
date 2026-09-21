import test from 'node:test';
import assert from 'node:assert/strict';
import { poolAndProject, readProjection } from '../server/multilingual.js';
import { expandedQueries, retrieveExpanded } from '../server/query-expansion.js';
import { validateSearch } from '../server/search.js';
import { normalizePreferences, buildSearchConfiguration } from '../dist/catalog.js';

test('multilingual pooling excludes padding and applies the 768-to-512 projection', () => {
  const data = new Float32Array(3 * 768); data[0] = 2; data[768 + 1] = 4; data[1536] = 999;
  const weights = new Float32Array(512 * 768); weights[0] = 1; weights[768 + 1] = 1;
  const vector = poolAndProject({ dims: [1, 3, 768], data }, { data: [1n, 1n, 0n] }, weights);
  assert.equal(vector.length, 512); assert.ok(Math.abs(vector[0] - 1 / Math.sqrt(5)) < 1e-6); assert.ok(Math.abs(vector[1] - 2 / Math.sqrt(5)) < 1e-6);
  assert.throws(() => readProjection(Buffer.alloc(8)));
});
test('multilingual scope and original query survive frontend and backend validation', () => {
  const preferences = normalizePreferences({ method: 'multilingual', databases: ['npm'] });
  const config = buildSearchConfiguration({ preferences, query: '青花瓷', imageCount: 1 });
  assert.equal(config.method, 'multilingual'); assert.equal(validateSearch(config).query, '青花瓷');
});
test('glossary preserves originals, expands known art terms, and leaves unknown queries intact', () => {
  assert.deepEqual(expandedQueries('청화백자', 'met'), ['청화백자', 'blue and white porcelain']);
  assert.deepEqual(expandedQueries('landscape', 'japan_art'), ['landscape', '風景']);
  assert.deepEqual(expandedQueries('Unlisted artist name', 'met'), ['Unlisted artist name']);
  assert.deepEqual(expandedQueries('', 'met'), ['']);
});
test('retrieval deduplicates multilingual results and reports partial API failures', async () => {
  const result = await retrieveExpanded(async (source, query) => {
    if (query === '風景') throw new Error('API unavailable');
    return { records: [{source, sourceId: '1'}, {source, sourceId: '1'}] };
  }, 'japan_art', 'landscape', 8);
  assert.equal(result.records.length, 1); assert.equal(result.partialFailures, 1); assert.match(result.note, /landscape \/ 風景/);
});
