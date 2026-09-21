import { japanArt } from './asian-sources.js';
import * as cheerio from 'cheerio';
import { remote, mapLimited } from './remote.js';

const clean = value => cheerio.load(String(value || '')).text().replace(/\s+/g, ' ').trim();
const array = value => Array.isArray(value) ? value : value ? [value] : [];
const notation = value => { const items = array(value?.notation); return items.find(v => v['@language'] === 'en')?.['@value'] || items[0]?.['@value'] || value?._label || ''; };
const ENGLISH = 'http://vocab.getty.edu/aat/300388277';
const name = values => { const items = array(values).filter(v => v.type === 'Name'); return items.find(v => v.language?.some(l => l.id === ENGLISH))?.content || items[0]?.content || ''; };

export const sourceDefinitions = [
  {'id': 'japan_art', 'state': 'ready', 'note': 'Imports only downloadable NoC-CR images with attribution and a modification notice. Five museums; keyword search required for new imports.', 'catalogUrl': 'https://search.artmuseums.go.jp/search_e/', 'termsUrl': 'https://search.artmuseums.go.jp/search_e/terms.html'},
  {'id': 'tomuco', 'state': 'access_blocked', 'note': 'Documented metadata API; last direct request returned HTTP 403. Image permissions are per object; most unlabeled images have third-party rights. No access restriction is bypassed.', 'catalogUrl': 'https://museumcollection.tokyo/', 'termsUrl': 'https://museumcollection.tokyo/terms/'},
  {'id': 'palace_beijing', 'state': 'permission_review', 'note': 'Official terms require attribution, written permission for modifications, and written permission for commercial use. Local image transformation/indexing is not enabled pending clarification.', 'catalogUrl': 'https://digicol.dpm.org.cn/', 'termsUrl': 'https://www.dpm.org.cn/bottom/privacy/236341.html'},
  {'id': 'national_china', 'state': 'permission_review', 'note': 'Official catalog available. Bulk access and image-indexing permission have not been established; no image import adapter enabled.', 'catalogUrl': 'https://www.chnmuseum.cn/zp/', 'termsUrl': 'https://www.chnmuseum.cn/shxg/bqsm/'},
  {'id': 'shanghai', 'state': 'permission_review', 'note': 'Terms require attribution, prohibit modification without written permission, and require permission for commercial use. Image indexing is not enabled pending clarification.', 'catalogUrl': 'https://www.shanghaimuseum.cn/', 'termsUrl': 'https://www.shanghaimuseum.net/mu/frontend/pg/en/infomation/download-claim'},
  {'id': 'ekoku', 'state': 'permission_required', 'note': 'The site requires explicit permission to copy content to other websites, including noncommercial uses. Catalog links only; no image imports.', 'catalogUrl': 'https://emuseum.nich.go.jp/?langId=en', 'termsUrl': 'https://emuseum.nich.go.jp/about?langId=en&webView=0'},
  {'id': 'sema', 'state': 'permission_review', 'note': 'Official metadata API exists. Dataset lists KOGL Type 4 (attribution, noncommercial, no derivatives) and third-party rights; image indexing requires further clearance and API setup.', 'catalogUrl': 'https://sema.seoul.go.kr/kr/knowledge_research/collection/list', 'termsUrl': 'https://data.seoul.go.kr/dataList/OA-15321/S/1/datasetView.do'},

  { id: 'smk', state: 'ready', note: 'Public SMK API; public-domain images only. Danish and English catalog metadata.' },
  { id: 'mia', state: 'ready', note: 'Public Mia collection search; public-domain images only, including Asian art.' },
  { id: 'npm', state: 'ready', note: 'Public open-data catalog; original Chinese and English metadata.' },
  { id: 'colbase', state: 'unavailable', note: 'ColBase currently rejects this application’s API requests (HTTP 403). No access restriction is bypassed.' },
  { id: 'emuseum', catalogUrl: 'https://www.emuseum.go.kr/', termsUrl: 'https://www.emuseum.go.kr/openApi', keyUrl: 'https://www.data.go.kr/data/15159017/openapi.do', state: process.env.EMUSEUM_API_KEY ? 'validation_required' : 'key_required', note: 'Requires an approved EMUSEUM_API_KEY and authenticated schema / image-rights validation.' },
  { id: 'rijks', state: 'ready', note: 'Public Linked Art API.' },
  { id: 'met', state: 'ready', note: 'Public collection API; open-access images only.' },
  { id: 'moma', state: 'unavailable', note: 'Image-search adapter not connected; collection metadata alone does not provide reusable image access.' },
  { id: 'getty', state: 'unavailable', note: 'Collection adapter not yet connected.' },
  { id: 'smithsonian', state: process.env.SMITHSONIAN_API_KEY ? 'ready' : 'key_required', note: 'Requires SMITHSONIAN_API_KEY from api.data.gov.' },
  { id: 'artic', state: 'ready', note: 'Public API and IIIF; public-domain images.' },
  { id: 'cleveland', state: 'ready', note: 'Public Open Access API; CC0 images.' },
];

function record(source, id, fields) { return { source, sourceId: String(id), title: 'Untitled', artist: '', date: '', medium: '', culture: '', description: '', rights: '', attribution: '', ...fields }; }

async function met(query, limit) {
  const result = await remote(`https://collectionapi.metmuseum.org/public/collection/v1.1/search?hasImages=true&q=${encodeURIComponent(query || 'art')}&limit=${Math.min(100, limit * 3)}`, { json: true });
  const rows = await mapLimited((result.objectIDs || []).slice(0, limit * 3), 4, async id => {
    const item = await remote(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, { json: true });
    if (!item.isPublicDomain || !item.primaryImageSmall) return null;
    return record('met', id, { title: item.title, artist: item.artistDisplayName, date: item.objectDate, medium: item.medium, culture: item.culture, description: (item.tags || []).map(t => t.term).join(', '), imageUrl: item.primaryImageSmall, sourceUrl: item.objectURL, rights: 'CC0 / Public domain', attribution: `${item.creditLine || ''} · The Metropolitan Museum of Art` });
  });
  return { records: rows.filter(r => r?.imageUrl).slice(0, limit), total: result.total, partialFailures: rows.filter(r => r?.error).length };
}

async function artic(query, limit) {
  const fields = 'id,title,image_id,artist_display,date_display,medium_display,place_of_origin,description,is_public_domain,credit_line';
  const url = new URL('https://api.artic.edu/api/v1/artworks/search');
  url.searchParams.set('q', query || '*'); url.searchParams.set('limit', String(Math.min(limit * 2, 100))); url.searchParams.set('fields', fields);
  url.searchParams.set('query[term][is_public_domain]', 'true');
  const result = await remote(url, { json: true });
  return { total: result.pagination?.total, records: (result.data || []).filter(item => item.is_public_domain && item.image_id).slice(0, limit).map(item => record('artic', item.id, { title: item.title, artist: item.artist_display, date: item.date_display, medium: item.medium_display, culture: item.place_of_origin, description: clean(item.description), imageUrl: `https://www.artic.edu/iiif/2/${item.image_id}/full/843,/0/default.jpg`, sourceUrl: `https://www.artic.edu/artworks/${item.id}`, rights: 'CC0 / Public domain', attribution: `${item.credit_line || ''} · Art Institute of Chicago` })) };
}

async function cleveland(query, limit) {
  const result = await remote(`https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(query)}&has_image=1&limit=${Math.min(limit * 2, 100)}`, { json: true });
  return { total: result.info?.total, records: (result.data || []).filter(item => item.images?.web?.url && item.share_license_status === 'CC0').slice(0, limit).map(item => record('cleveland', item.id, { title: item.title, artist: (item.creators || []).map(c => c.description).join('; '), date: item.creation_date, medium: item.technique, culture: (item.culture || []).join('; '), description: clean(item.description), imageUrl: item.images.web.url, sourceUrl: item.url, rights: 'CC0', attribution: `${item.creditline || ''} · Cleveland Museum of Art` })) };
}

async function npm(query, limit) {
  const html = await remote('https://digitalarchive.npm.gov.tw/opendata/Pub/Search', { text: true, body: { SearchContent: query, PageInfo: { PageIndex: 1, PageSize: Math.min(30, limit) } } });
  const $ = cheerio.load(html);
  const links = $('a[href*="/Pub/Detail/"]').map((_, element) => {
    const link = $(element); const card = link.parent();
    return { url: new URL(link.attr('href'), 'https://digitalarchive.npm.gov.tw').href, title: clean(card.find('.card-title').text()), image: card.find('.card-img img').attr('src') };
  }).get().filter(row => row.image).slice(0, limit);
  const rows = await mapLimited(links, 3, async row => {
    const detail = cheerio.load(await remote(row.url, { text: true }));
    const metadata = {};
    detail('table').first().find('tr').each((_, tr) => { const cells = detail(tr).find('td'); if (cells.length >= 2) metadata[clean(cells.eq(0).text())] = clean(cells.eq(1).text()); });
    return record('npm', new URL(row.url).pathname.split('/').pop() + '-' + new URL(row.url).searchParams.get('dep'), { title: metadata['品名'] || row.title, date: metadata['時代'] || '', medium: metadata['分類'] || '', culture: '', description: metadata['說明'] || '', imageUrl: new URL(row.image, row.url).href, sourceUrl: row.url, rights: 'Image: CC0 (low resolution); text: CC BY 4.0', attribution: `${row.title} · The National Palace Museum, Taipei, CC BY 4.0 @ www.npm.gov.tw` });
  });
  return { records: rows.filter(r => r?.imageUrl), partialFailures: rows.filter(r => r?.error).length, note: 'Searches the original-language catalog. Chinese keywords usually retrieve more records; no automatic translation is applied.' };
}

async function rijks(query, limit) {
  const url = new URL('https://data.rijksmuseum.nl/search/collection');
  url.searchParams.set('imageAvailable', 'true');
  if (query) url.searchParams.set('title', query);
  const result = await remote(url, { json: true });
  const rows = await mapLimited((result.orderedItems || []).slice(0, limit), 3, async entry => {
    const item = await remote(`${entry.id}?_profile=la-framed`, { json: true });
    if (!item.shows?.[0]?.id) return null;
    const visual = await remote(`${item.shows[0].id}?_profile=la-framed`, { json: true });
    const rights = visual.subject_to?.[0];
    const license = rights?.classified_as?.[0]?.id || '';
    if (!license.includes('publicdomain') && !license.includes('/by/')) return null;
    if (!visual.digitally_shown_by?.[0]?.id) return null;
    const digital = await remote(`${visual.digitally_shown_by[0].id}?_profile=la-framed`, { json: true });
    const imageUrl = digital.access_point?.[0]?.id?.replace('/full/max/', '/full/800,/');
    if (!imageUrl) return null;
    return record('rijks', entry.id.split('/').pop(), { title: name(item.identified_by), artist: (item.produced_by?.part || []).flatMap(part => part.carried_out_by || []).map(notation).join('; '), date: name(item.produced_by?.timespan?.identified_by), medium: (item.made_of || []).map(notation).join(', '), description: (item.referred_to_by || []).filter(r => r.language?.some(l => l.id === ENGLISH)).map(r => r.content).filter(Boolean).join(' '), imageUrl, sourceUrl: item.subject_of?.flatMap(s => s.digitally_carried_by || []).flatMap(s => s.access_point || []).find(s => s.id?.includes('www.rijksmuseum.nl'))?.id || entry.id, rights: name(rights?.identified_by) || license, attribution: 'Rijksmuseum, Amsterdam' });
  });
  return { records: rows.filter(r => r?.imageUrl), total: result.partOf?.totalItems, partialFailures: rows.filter(r => r?.error).length, note: 'Title search; Dutch catalog terms have the broadest coverage.' };
}

async function smithsonian(query, limit) {
  const url = new URL('https://api.si.edu/openaccess/api/v1.0/search');
  url.searchParams.set('api_key', process.env.SMITHSONIAN_API_KEY); url.searchParams.set('q', query || '*:*'); url.searchParams.set('rows', String(limit));
  const result = await remote(url, { json: true });
  return { total: result.response?.rowCount, records: (result.response?.rows || []).flatMap(item => {
    const content = item.content || {}; const media = content.descriptiveNonRepeating?.online_media?.media || [];
    const image = media.find(m => m.type === 'Images' && m.usage?.access === 'CC0');
    if (!image) return [];
    return [record('smithsonian', item.id, { title: item.title, imageUrl: image.thumbnail || image.content, sourceUrl: content.descriptiveNonRepeating?.record_link, description: JSON.stringify(content.freetext || {}), rights: 'CC0', attribution: content.descriptiveNonRepeating?.data_source || 'Smithsonian Institution' })];
  }) };
}

async function emuseum(query, limit) {
  const url = new URL('https://apis.data.go.kr/1371027/openapi/list');
  url.searchParams.set('serviceKey', process.env.EMUSEUM_API_KEY); url.searchParams.set('name', query); url.searchParams.set('numOfRows', String(limit)); url.searchParams.set('pageNo', '1');
  const xml = await remote(url, { text: true });
  const $ = cheerio.load(xml, { xml: true });
  if ($('resultCode').text() && !['00', '0'].includes($('resultCode').text())) throw new Error('eMuseum rejected the API request. Check the API key and service approval.');
  // Source schema and image rights must be verified with an approved key before indexing.
  throw new Error('eMuseum key is configured, but this adapter still needs an authenticated schema and image-rights validation.');
}

export function smkRecords(items) {
  return items.filter(item => item.public_domain === true && item.has_image && item.image_thumbnail).map(item => record('smk', item.object_number, {
    title: [...new Set((item.titles || []).map(t => t.title).filter(Boolean))].join(' / ') || 'Untitled',
    artist: (item.artist || []).join('; '), date: (item.production_date || []).map(d => d.period).filter(Boolean).join('; '),
    medium: [...new Set([...(item.techniques || []), ...(item.materials || [])])].join('; '),
    description: (item.object_history_note || []).join(' '),
    imageUrl: item.image_thumbnail, sourceUrl: item.frontend_url,
    rights: `Public domain · ${item.rights || 'https://creativecommons.org/publicdomain/mark/1.0/'}`,
    attribution: `${item.object_number} · SMK – National Gallery of Denmark`,
  }));
}
async function smk(query, limit) {
  const url = new URL('https://api.smk.dk/api/v1/art/search/');
  url.searchParams.set('keys', query || '*'); url.searchParams.set('filters', '[public_domain:true],[has_image:true]');
  url.searchParams.set('rows', String(limit)); url.searchParams.set('offset', '0');
  const result = await remote(url, { json: true });
  return { records: smkRecords(result.items || []).slice(0, limit), total: result.found, note: 'Danish and English catalog metadata; public-domain images only.' };
}
export function miaRecords(hits) {
  return hits.map(hit => hit._source).filter(item => item && item.rights_type === 'Public Domain' && item.image === 'valid' && Number.isInteger(item.id) && item.Cache_Location && item.Primary_RenditionNumber).map(item => record('mia', item.id, {
    title: item.title, artist: item.artist || '', date: item.dated || '', medium: item.medium || '',
    culture: [item.culture, item.country].filter(Boolean).join('; '), description: clean(item.text || item.description),
    imageUrl: `https://img.artsmia.org/web_objects_cache/${item.Cache_Location.replace(/\\/g, '/')}/${item.Primary_RenditionNumber.replace(/\.jpg$/i, '')}_800.jpg`, sourceUrl: `https://collections.artsmia.org/art/${item.id}`,
    rights: 'Public domain (CC PDM); metadata CC0', attribution: `${item.creditline || ''} · Minneapolis Institute of Art`,
  }));
}
async function mia(query, limit) {
  // Escape search syntax so user words cannot replace the source's rights filters.
  const terms = query.match(/[\p{L}\p{N}]+/gu) || [];
  const keywords = terms.length ? '(' + terms.map(t => '"' + t + '"').join(' AND ') + ')' : '*';
  const expression = `${keywords} AND rights_type:"Public Domain" AND image:valid`;
  const result = await remote(`https://search.artsmia.org/${encodeURIComponent(expression)}?size=${limit}`, { json: true });
  if (result.error || result.timed_out) throw new Error('Mia search is temporarily unavailable.');
  return { records: miaRecords(result.hits?.hits || []).slice(0, limit), total: result.hits?.total?.value ?? result.hits?.total };
}

const adapters = { japan_art: japanArt, npm, met, rijks, artic, cleveland, smithsonian, emuseum, smk, mia };
export async function searchSource(id, query, limit) {
  const source = sourceDefinitions.find(s => s.id === id);
  if (!source || source.state !== 'ready') throw new Error(source?.note || 'Unknown museum.');
  return adapters[id](query, limit);
}
