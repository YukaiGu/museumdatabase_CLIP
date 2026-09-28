const allowedHosts = new Set([
  'whitney.org', 'whitneymedia.org',
  'query.wikidata.org', 'commons.wikimedia.org', 'upload.wikimedia.org',
  'artplatform.go.jp', 'inventory.yokohama.art.museum',
  'search.artmuseums.go.jp',
  'api.smk.dk', 'iip.smk.dk', 'iip-thumb.smk.dk', 'search.artsmia.org', 'img.artsmia.org',
  'collectionapi.metmuseum.org', 'images.metmuseum.org', 'api.artic.edu', 'www.artic.edu',
  'openaccess-api.clevelandart.org', 'openaccess-cdn.clevelandart.org',
  'digitalarchive.npm.gov.tw', 'data.rijksmuseum.nl', 'id.rijksmuseum.nl', 'iiif.micr.io',
  'api.si.edu', 'ids.si.edu', 'apis.data.go.kr', 'www.emuseum.go.kr', 'emuseum.go.kr',
]);

export function validateRemoteURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !allowedHosts.has(url.hostname)) throw new Error('Unsupported museum resource URL.');
  return url;
}

const wikimediaHosts = new Set(['query.wikidata.org', 'commons.wikimedia.org', 'upload.wikimedia.org']);
let wikimediaQueue = Promise.resolve();
let nextWikimediaRequest = 0;
let wikimediaCooldown = 0;

export async function remote(value, options = {}) {
  const url = validateRemoteURL(value);
  if (!wikimediaHosts.has(url.hostname)) return requestRemote(url, options);
  const task = wikimediaQueue.then(async () => {
    if (Date.now() < wikimediaCooldown) throw new Error('Wikimedia is temporarily rate limiting requests. Wait a minute (or longer if the provider requests it), then search again. Already indexed images remain searchable.');
    const delay = Math.max(0, nextWikimediaRequest - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    try { return await requestRemote(url, options); }
    finally { nextWikimediaRequest = Date.now() + 1000; }
  });
  wikimediaQueue = task.catch(() => {});
  return task;
}

async function requestRemote(value, { json = false, text = false, body, form, maxBytes = 12 * 1024 * 1024 } = {}) {
  let url = validateRemoteURL(value);
  for (let redirects = 0; redirects < 5; redirects += 1) {
    const response = await fetch(url, {
      method: body === undefined && form === undefined ? 'GET' : 'POST', body: form !== undefined ? new URLSearchParams(form).toString() : body === undefined ? undefined : JSON.stringify(body),
      headers: { 'User-Agent': 'CollectionAtlas/0.3 (+https://github.com/YukaiGu/museumdatabase_CLIP; personal museum research)', Accept: json ? 'application/json' : '*/*', ...(form !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      signal: AbortSignal.timeout(25000), redirect: 'manual',
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) { await response.body?.cancel(); url = validateRemoteURL(new URL(response.headers.get('location'), url)); continue; }
    if (response.status === 429 && wikimediaHosts.has(url.hostname)) {
      const retry = response.headers.get('retry-after');
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : Math.max(0, (Date.parse(retry) - Date.now()) / 1000) || 60;
      wikimediaCooldown = Date.now() + Math.max(60, seconds) * 1000;
      await response.body?.cancel();
      throw new Error('Wikimedia is temporarily rate limiting requests (HTTP 429). Wait before searching again; already indexed images remain searchable.');
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Museum service returned HTTP ${response.status}.`); }
    const chunks = []; let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > maxBytes) throw new Error('Museum resource exceeds the download limit.');
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return json ? JSON.parse(buffer.toString()) : text ? buffer.toString() : buffer;
  }
  throw new Error('Too many museum redirects.');
}

export async function mapLimited(items, limit, mapper) {
  let next = 0;
  const result = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; try { result[i] = await mapper(items[i], i); } catch (error) { result[i] = { error: error.message }; } }
  }));
  return result;
}
