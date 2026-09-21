const allowedHosts = new Set([
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

export async function remote(value, { json = false, text = false, body, form, maxBytes = 12 * 1024 * 1024 } = {}) {
  let url = validateRemoteURL(value);
  for (let redirects = 0; redirects < 5; redirects += 1) {
    const response = await fetch(url, {
      method: body === undefined && form === undefined ? 'GET' : 'POST', body: form !== undefined ? new URLSearchParams(form).toString() : body === undefined ? undefined : JSON.stringify(body),
      headers: { 'User-Agent': 'CollectionAtlas/0.2 (local museum research)', Accept: json ? 'application/json' : '*/*', ...(form !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      signal: AbortSignal.timeout(25000), redirect: 'manual',
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) { await response.body?.cancel(); url = validateRemoteURL(new URL(response.headers.get('location'), url)); continue; }
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
