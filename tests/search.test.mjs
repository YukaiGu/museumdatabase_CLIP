import test from 'node:test';
import assert from 'node:assert/strict';
import { museums, normalizePreferences, buildSearchConfiguration } from '../dist/catalog.js';

test('a search can include every database and uses one total result limit', () => {
  const configuration = buildSearchConfiguration({ preferences: { databases: museums.map(m => m.id), results: 50 }, query: ' ceramics ' });
  assert.equal(configuration.databases.length, museums.length);
  assert.equal(configuration.results, 50);
  assert.equal(configuration.query, 'ceramics');
  assert.equal(configuration.mode, 'search');
});

test('an empty scope does not silently become all databases', () => {
  assert.throws(() => buildSearchConfiguration({ preferences: { databases: [] } }), /Select at least one database/);
});

test('stale saved IDs are removed without broadening the requested scope', () => {
  assert.deepEqual(normalizePreferences({ databases: ['npm', 'removed-source', 'npm', 'met'] }).databases, ['npm', 'met']);
  assert.deepEqual(normalizePreferences({ databases: ['removed-source'] }).databases, []);
});

test('visual-only methods require an image and exclude incompatible text', () => {
  assert.throws(() => buildSearchConfiguration({ preferences: { method: 'raw' }, query: 'a standing figure' }), /reference image/);
  const result = buildSearchConfiguration({ preferences: { method: 'raw' }, query: 'a standing figure', imageCount: 1 });
  assert.equal(result.query, '');
  assert.equal(result.imageCount, 1);
});
