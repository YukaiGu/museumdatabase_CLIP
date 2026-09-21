import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const dataDirectory = path.resolve(process.env.DATA_DIR || fileURLToPath(new URL('../data/', import.meta.url))) + path.sep;
export function allowedOrigins(port, environment = process.env) {
  const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  for (const value of [environment.PUBLIC_ORIGIN, environment.RENDER_EXTERNAL_URL].filter(Boolean)) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path.');
    origins.push(url.origin);
  }
  return origins;
}
export function requestAllowed(headers, origins) {
  return origins.some(origin => new URL(origin).host === headers.host) && (!headers.origin || origins.includes(headers.origin));
}
// A global cap does not trust visitor-supplied forwarding headers.
export function createSearchLimiter(limit = 20, windowMs = 60_000) {
  let started = 0; let count = 0;
  return (now = Date.now()) => {
    if (now - started >= windowMs) { started = now; count = 0; }
    return ++count <= limit;
  };
}
