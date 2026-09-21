import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigins, requestAllowed, createSearchLimiter } from '../server/hosting.js';

test('local defaults reject external hosts and cross-origin requests', () => {
  const origins = allowedOrigins(5173, {});
  assert.equal(requestAllowed({ host: '127.0.0.1:5173' }, origins), true);
  assert.equal(requestAllowed({ host: 'evil.example' }, origins), false);
  assert.equal(requestAllowed({ host: 'localhost:5173', origin: 'https://evil.example' }, origins), false);
});
test('deployment permits only configured public origins', () => {
  const origins = allowedOrigins(10000, { PUBLIC_ORIGIN: 'https://atlas.example', RENDER_EXTERNAL_URL: 'https://atlas.onrender.com' });
  assert.equal(requestAllowed({ host: 'atlas.example', origin: 'https://atlas.example' }, origins), true);
  assert.equal(requestAllowed({ host: 'atlas.onrender.com' }, origins), true);
  assert.equal(requestAllowed({ host: 'atlas.example.evil.test' }, origins), false);
  assert.equal(requestAllowed({ host: 'atlas.example', origin: 'https://evil.test' }, origins), false);
  assert.throws(() => allowedOrigins(10000, { PUBLIC_ORIGIN: 'https://atlas.example/path' }));
});
test('search submission cap resets after its time window', () => {
  const allow = createSearchLimiter(2, 1000);
  assert.equal(allow(1000), true); assert.equal(allow(1001), true);
  assert.equal(allow(1002), false); assert.equal(allow(2000), true);
});
