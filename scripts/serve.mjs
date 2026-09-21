import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(`${projectRoot}.env`)) process.loadEnvFile(`${projectRoot}.env`);
const { startSearch, getJob, cancelJob, getStatus, imagePath, getArtwork } = await import('../server/search.js');
const { allowedOrigins, requestAllowed, createSearchLimiter } = await import('../server/hosting.js');
const publicRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 5173);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Use a valid port, for example: npm run dev -- --port 5174');
const bindHost = process.env.HOST || '127.0.0.1';
allowedOrigins(port); // Validate deployment configuration before accepting traffic.
const allowSearch = createSearchLimiter();
function sendJSON(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(value)); }
async function readJSON(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('Send application/json.');
  const chunks = []; let bytes = 0;
  for await (const chunk of request) { bytes += chunk.length; if (bytes > 18 * 1024 * 1024) throw new Error('The upload is too large. Use smaller images.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString());
}
const server = http.createServer(async (request, response) => {
  const localPort = server.address()?.port;
  if (!requestAllowed(request.headers, allowedOrigins(localPort))) { sendJSON(response, 403, { error: 'Use the configured application address.' }); return; }
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/health' && request.method === 'GET') { sendJSON(response, 200, { status: 'ok' }); return; }
      if (pathname === '/api/status' && request.method === 'GET') { sendJSON(response, 200, getStatus()); return; }
      if (pathname === '/api/search' && request.method === 'POST') {
        if (!allowSearch()) { response.setHeader('Retry-After', '60'); sendJSON(response, 429, { error: 'Too many searches. Please try again in a minute.' }); return; }
        try { const job = startSearch(await readJSON(request)); sendJSON(response, 202, { id: job.id, state: job.state }); }
        catch (error) { sendJSON(response, 400, { error: error.message }); } return;
      }
      const jobMatch = pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})$/);
      if (jobMatch && ['GET', 'DELETE'].includes(request.method)) {
        const job = request.method === 'DELETE' ? cancelJob(jobMatch[1]) : getJob(jobMatch[1]);
        sendJSON(response, job ? 200 : 404, job || { error: 'Search expired. Please search again.' }); return;
      }
      const imageMatch = pathname.match(/^\/api\/images\/([a-f0-9]{24})$/);
      if (imageMatch && request.method === 'GET') {
        const file = imagePath(imageMatch[1]); if (!file) { sendJSON(response, 404, { error: 'Artwork not found.' }); return; }
        const bytes = await readFile(file); response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' }); response.end(bytes); return;
      }
      const artworkMatch = pathname.match(/^\/api\/artworks\/([a-f0-9]{24})$/);
      if (artworkMatch && request.method === 'GET') { const artwork = getArtwork(artworkMatch[1]); sendJSON(response, artwork ? 200 : 404, artwork || { error: 'Artwork not found.' }); return; }
      sendJSON(response, 404, { error: 'API route not found.' }); return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Method not allowed'); return; }
    const target = path.resolve(publicRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(publicRoot) || !(await stat(target)).isFile()) throw new Error('Not found');
    const content = await readFile(target);
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { if (!response.headersSent) sendJSON(response, 404, { error: 'Resource not found.' }); else response.end(); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Try: npm run dev -- --port 5174` : error.message); process.exitCode = 1; });
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.listen(port, bindHost, () => console.log(`Collection Atlas listening on ${bindHost}:${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
