import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { dataDirectory } from './hosting.js';
import { createHash, randomUUID } from 'node:crypto';
import { sourceDefinitions, searchSource } from './sources.js';
import { remote, mapLimited } from './remote.js';
import { MODEL_ID, loadModels, imageEmbedding, textEmbedding, average, distance, cleanImage, modelStatus } from './embeddings.js';

const dataDir = dataDirectory;
const indexFile = `${dataDir}index-v1.json`;
await mkdir(`${dataDir}images`, { recursive: true });
let index = new Map();
try { const saved = JSON.parse(await readFile(indexFile, 'utf8')); index = new Map(saved.records.map(record => [record.id, record])); }
catch (error) { if (error.code !== 'ENOENT') throw new Error(`Cannot read the local image index: ${error.message}`); }
let workQueue = Promise.resolve();
const jobs = new Map();
const searches = new Map();
const VECTOR_VERSION = `${MODEL_ID}:q8:v1`;

async function saveIndex() {
  const temporary = `${indexFile}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: 1, records: [...index.values()] }));
  await rename(temporary, indexFile);
}

export function validateSearch(body) {
  if (!body || typeof body !== 'object') throw new Error('Send a search configuration.');
  const known = new Set(sourceDefinitions.map(s => s.id));
  if (!Array.isArray(body.databases) || !body.databases.length || body.databases.length > 20 || body.databases.some(id => !known.has(id))) throw new Error('Select valid museum databases.');
  if (!['clip', 'raw', 'metadata'].includes(body.method)) throw new Error('This search model is not installed. Choose CLIP, color/pixels, or museum metadata.');
  if (!['cosine', 'euclidean', 'manhattan'].includes(body.distance)) throw new Error('Invalid distance measure.');
  if (![25, 50, 75, 100].includes(body.results)) throw new Error('Invalid result count.');
  if (!['combined', 'museum'].includes(body.grouping)) throw new Error('Invalid result grouping.');
  if (typeof body.query !== 'string' || body.query.length > 2000) throw new Error('The query must be text under 2,000 characters.');
  const images = body.images ?? []; const referenceIds = body.referenceIds ?? [];
  if (!Array.isArray(images) || !Array.isArray(referenceIds) || images.length + referenceIds.length > 6) throw new Error('Use up to six reference images.');
  if (images.some(image => typeof image !== 'string' || image.length > 3_000_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image))) throw new Error('Invalid reference image.');
  if (referenceIds.some(id => typeof id !== 'string' || !index.has(id))) throw new Error('A reference artwork is no longer in the index.');
  if (body.method === 'raw' && images.length + referenceIds.length === 0) throw new Error('Add a reference image for color/pixel search.');
  if (body.method === 'metadata' && (images.length || referenceIds.length)) throw new Error('Choose CLIP or color/pixels to search with reference images.');
  return { databases: [...new Set(body.databases)], method: body.method, distance: body.distance, results: body.results, grouping: body.grouping, query: body.query.trim(), images, referenceIds };
}

export function getStatus() {
  return { model: modelStatus, sources: sourceDefinitions.map(source => ({ ...source, indexed: [...index.values()].filter(r => r.source === source.id).length, visualIndexed: [...index.values()].filter(r => r.source === source.id && r.clipVersion === VECTOR_VERSION).length })), indexed: index.size };
}

export function getJob(id) { return jobs.get(id); }
export function cancelJob(id) { const job = jobs.get(id); if (job && !['done', 'error', 'cancelled'].includes(job.state)) { job.cancelled = true; job.state = 'cancelled'; job.message = 'Search cancelled.'; } return job; }
export function imagePath(id) { if (!/^[a-f0-9]{24}$/.test(id) || !index.has(id)) return null; return `${dataDir}images/${id}.jpg`; }
export function getArtwork(id) { const item = index.get(id); return item ? publicRecord(item) : null; }
function publicRecord(item) { const { clip, raw, clipVersion, ...metadata } = item; return { ...metadata, image: `/api/images/${item.id}` }; }

export function startSearch(body) {
  const config = validateSearch(body);
  if ([...jobs.values()].filter(job => ['queued', 'running'].includes(job.state)).length >= 3) throw new Error('The search queue is busy. Cancel an earlier search or wait for it to finish.');
  const job = { id: randomUUID(), state: 'queued', message: 'Waiting for the search engine…', processed: 0, total: 0, coverage: [], createdAt: Date.now() };
  jobs.set(job.id, job);
  for (const [id, old] of jobs) if (Date.now() - old.createdAt > 30 * 60 * 1000 && !['queued', 'running'].includes(old.state)) jobs.delete(id);
  workQueue = workQueue.then(async () => {
    if (job.cancelled) return;
    try { await runSearch(config, job); }
    catch (error) { if (!job.cancelled) { job.state = 'error'; job.message = error.message; } }
    finally { config.images.length = 0; }
  });
  return job;
}

async function materialize(record) {
  const id = createHash('sha256').update(`${record.source}:${record.sourceId}`).digest('hex').slice(0, 24);
  let existing = index.get(id);
  const imageFile = `${dataDir}images/${id}.jpg`;
  let buffer;
  try { buffer = await readFile(imageFile); } catch {}
  if (!buffer) {
    buffer = await cleanImage(await remote(record.imageUrl));
    await writeFile(imageFile, buffer);
  }
  const item = { ...existing, ...record, id, importedAt: existing?.importedAt || new Date().toISOString(), raw: existing?.raw || await imageEmbedding(buffer, 'raw') };
  index.set(id, item);
  return item;
}

async function runSearch(config, job) {
  job.state = 'running'; job.message = 'Retrieving records from selected museums…';
  const ready = config.databases.filter(id => sourceDefinitions.find(s => s.id === id)?.state === 'ready');
  job.coverage = config.databases.map(id => { const source = sourceDefinitions.find(s => s.id === id); return { id, state: source.state === 'ready' ? 'loading' : source.state, message: source.note, retrieved: 0, indexed: 0 }; });
  if (!ready.length) throw new Error('None of the selected museum connections are available. Choose a connected source; see the connection notes.');
  const perSource = Math.min(25, Math.max(8, Math.ceil(config.results / ready.length)));
  const imported = []; const directIds = new Set();
  await Promise.all(ready.map(async id => {
    const coverage = job.coverage.find(source => source.id === id);
    const cacheKey = `${id}:${config.method}:${config.query}:${perSource}`;
    try {
      let response = searches.get(cacheKey);
      if (!response || Date.now() - response.at > 10 * 60 * 1000) {
        let data = await searchSource(id, config.query, perSource);
        if (config.method !== 'metadata' && !data.records.length && ![...index.values()].some(r => r.source === id)) {
          data = await searchSource(id, '', perSource);
          data.note = `${data.note || ''} No keyword candidates; imported a starting selection for visual ranking.`;
        }
        response = { ...data, at: Date.now() }; searches.set(cacheKey, response);
      }
      coverage.retrieved = response.records.length; coverage.totalAtSource = response.total ?? null;
      coverage.message = [response.note, response.partialFailures ? `${response.partialFailures} record requests failed.` : ''].filter(Boolean).join(' ');
      const rows = await mapLimited(response.records, 3, async record => {
        if (job.cancelled) return null;
        const result = await materialize(record); directIds.add(result.id); return result;
      });
      const good = rows.filter(row => row?.id);
      const failed = rows.filter(row => row?.error).length;
      imported.push(...good); coverage.indexed = good.length;
      coverage.state = failed || response.partialFailures ? 'partial' : good.length ? 'ready' : 'empty';
      if (failed) coverage.message += ` ${failed} images could not be imported.`;
    } catch (error) { coverage.state = 'error'; coverage.message = error.message; }
  }));
  await saveIndex();
  if (job.cancelled) return;
  let candidates = [...index.values()].filter(item => config.databases.includes(item.source));
  // Metadata queries use source search matches plus literal matches in previously indexed records.
  if (config.method === 'metadata' && config.query) {
    const terms = config.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    candidates = candidates.filter(item => directIds.has(item.id) || terms.every(term => `${item.title} ${item.artist} ${item.description} ${item.medium} ${item.culture}`.toLocaleLowerCase().includes(term)));
  }
  job.total = candidates.length;
  if (config.method === 'clip') {
    job.message = 'Loading the CLIP model…';
    await loadModels();
    for (const item of candidates) {
      if (job.cancelled) return;
      if (item.clipVersion !== VECTOR_VERSION) {
        job.message = `Indexing artwork images with CLIP · ${job.processed + 1} of ${job.total}`;
        try { item.clip = await imageEmbedding(await readFile(imagePath(item.id))); item.clipVersion = VECTOR_VERSION; }
        catch (error) { item.indexError = error.message; }
      }
      job.processed += 1;
    }
    await saveIndex();
    candidates = candidates.filter(item => item.clipVersion === VECTOR_VERSION && item.clip?.length === 512);
  }
  if (job.cancelled) return;
  job.message = 'Comparing artworks and preparing results…';
  const vectors = [];
  if (config.method === 'clip' && config.query) vectors.push(await textEmbedding(config.query));
  for (const encoded of config.images) {
    const buffer = await cleanImage(Buffer.from(encoded.split(',')[1], 'base64'));
    vectors.push(await imageEmbedding(buffer, config.method));
  }
  for (const id of config.referenceIds) vectors.push(await imageEmbedding(await readFile(imagePath(id)), config.method));
  const queryVector = vectors.length ? average(vectors) : null;
  const ranked = candidates.filter(item => !config.referenceIds.includes(item.id)).map(item => {
    const value = queryVector ? distance(queryVector, config.method === 'raw' ? item.raw : item.clip, config.distance) : null;
    return { ...publicRecord(item), distance: value, relevance: directIds.has(item.id) ? 1 : 0 };
  }).sort((a, b) => queryVector ? a.distance - b.distance : b.relevance - a.relevance || a.title.localeCompare(b.title));
  const sourceCounts = config.databases.map(id => ({ id, indexed: candidates.filter(item => item.source === id).length }));
  const items = ranked.slice(0, config.results);
  job.result = { items, returned: items.length, searched: candidates.length, imported: imported.length, query: config.query, method: config.method, distance: config.distance, grouping: config.grouping, coverage: job.coverage, sourceCounts, model: config.method === 'clip' ? MODEL_ID : null, note: config.method === 'metadata' ? 'Museum metadata search plus matches in the server index.' : 'Visual ranking searches the images imported into this server index, not every image held by the museums.' };
  const allFailed = job.coverage.every(source => !['ready', 'partial', 'empty'].includes(source.state));
  if (!items.length && allFailed) throw new Error('The selected museum services could not return records. See the source status details and try another connected collection.');
  job.state = 'done'; job.message = `${items.length} artworks found.`;
}
