import { museums, methods, normalizePreferences, buildSearchConfiguration } from './catalog.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'collection-atlas.preferences.v1';
let preferences;
try { preferences = normalizePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); }
catch { preferences = normalizePreferences(); }
let selected = new Set(preferences.databases);
let references = [];
let uploadGeneration = 0;
let uploadJobs = 0;
let engine = null;
let busy = false;
let activeJob = null;
let revision = 0;
let lastResult = null;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
const museumName = id => museums.find(m => m.id === id)?.short || id;
const connectedMuseums = () => museums.filter(m => engine?.sources.some(source => source.id === m.id && source.state === 'ready'));
function currentPreferences() {
  return normalizePreferences({ databases: museums.filter(m => selected.has(m.id)).map(m => m.id), method: $('method').value, distance: $('distance').value, results: Number($('result-count').value), grouping: $('grouping').value });
}
function savePreferences() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentPreferences())); } catch {} }
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The local server could not complete this request.');
  return result;
}
function setBusy(value) { busy = value; $('cancel-search').hidden = !value; $('search-button').textContent = value ? 'Searching…' : 'Search artworks ↗'; updateSearchButton(); }
function updateSearchButton() { $('search-button').disabled = selected.size === 0 || uploadJobs > 0 || busy || !engine; }
function cancelSearch() {
  revision += 1;
  if (activeJob) { void api(`/api/jobs/${activeJob}`, { method: 'DELETE' }).catch(() => {}); activeJob = null; }
  setBusy(false);
}
function invalidateResults() {
  if (busy) { cancelSearch(); $('search-progress').textContent = 'Search cancelled because the settings changed.'; }
  else revision += 1;
  $('stale-results').hidden = !lastResult;
  $('query-error').hidden = true;
}
function renderSelection() {
  const connected = connectedMuseums();
  const count = connected.filter(m => selected.has(m.id)).length;
  $('selected-count').textContent = `${count} / ${connected.length}`;
  $('source-total').textContent = engine ? `${connected.length}` : 'Loading…';
  $('select-all').disabled = !connected.length;
  $('select-all').checked = count > 0 && count === connected.length;
  $('select-all').indeterminate = count > 0 && count < connected.length;
  $('selection-announcement').textContent = `${count} selected`;
  $('scope-summary').textContent = count > 0 && count === connected.length ? 'All connected databases' : `${count} database${count === 1 ? '' : 's'} selected`;
  $('empty-scope').hidden = count !== 0;
  $('selected-chips').replaceChildren();
  connected.filter(m => selected.has(m.id)).forEach(museum => {
    const chip = node('div', undefined, 'selected-chip');
    const remove = node('button', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${museum.name} from search`);
    remove.addEventListener('click', () => {
      const position = [...$('selected-chips').children].indexOf(chip);
      selected.delete(museum.id); onScopeChange();
      const next = $('selected-chips').children[position] || $('selected-chips').lastElementChild;
      if (next) next.querySelector('button').focus(); else $('select-all').focus();
    });
    chip.append(node('span', museum.short), remove); $('selected-chips').append(chip);
  });
  for (const checkbox of $('museum-list').querySelectorAll('input')) checkbox.checked = selected.has(checkbox.value);
  updateSearchButton();
}
function renderMuseumList() {
  const query = $('museum-filter').value.trim().toLocaleLowerCase();
  const visible = connectedMuseums().filter(m => `${m.name} ${m.short} ${m.location} ${m.region}`.toLocaleLowerCase().includes(query));
  $('museum-list').replaceChildren(); $('no-museums').hidden = !engine || visible.length > 0;
  for (const region of [...new Set(museums.map(m => m.region))]) {
    const members = visible.filter(m => m.region === region); if (!members.length) continue;
    const section = node('section', undefined, 'museum-group'); section.setAttribute('aria-label', region); section.append(node('h3', region, 'region-heading'));
    for (const museum of members) {
      const label = node('label', undefined, 'museum-row'); const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.value = museum.id; checkbox.checked = selected.has(museum.id); checkbox.setAttribute('aria-label', museum.name);
      checkbox.addEventListener('change', () => { if (checkbox.checked) selected.add(museum.id); else selected.delete(museum.id); onScopeChange(); });
      const connection = engine?.sources.find(source => source.id === museum.id);
      const status = !connection ? 'Checking…' : connection.state === 'ready' ? `Connected · ${connection.indexed} indexed` : connection.state === 'key_required' ? 'API key required' : ({ access_blocked: 'Access blocked', permission_review: 'Reuse review needed', permission_required: 'Permission required', validation_required: 'Validation needed' }[connection.state] || 'Not connected');
      const copy = node('span', undefined, 'museum-copy'); copy.append(node('span', museum.name), node('small', museum.location), node('small', status, connection?.state === 'ready' ? 'source-connected' : 'source-unavailable'));
      label.append(checkbox, copy); section.append(label);
      if (connection?.catalogUrl) {
        const details = node('details', undefined, 'source-access-details'); details.append(node('summary', 'Access & reuse details'));
        details.append(node('p', connection.note));
        for (const [text, url] of [['Open official catalog', connection.catalogUrl], ['Read access / reuse terms', connection.termsUrl], ['Apply for API key', connection.keyUrl]]) {
          if (!url) continue; const link = node('a', text); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; details.append(link);
        }
        section.append(details);
      }
    }
    $('museum-list').append(section);
  }
}
function renderPotentialDatabases() {
  const potential = museums.filter(m => engine?.sources.some(source => source.id === m.id && source.state !== 'ready'));
  $('potential-databases').hidden = potential.length === 0;
  $('potential-count').textContent = `(${potential.length})`;
  $('potential-list').replaceChildren();
  const labels = { key_required: 'API key required', access_blocked: 'Access blocked', permission_review: 'Reuse review needed', permission_required: 'Permission required', validation_required: 'Validation needed' };
  for (const museum of potential) {
    const connection = engine.sources.find(source => source.id === museum.id);
    const entry = node('article', undefined, 'potential-source');
    entry.append(node('h3', museum.name), node('p', museum.location, 'small secondary'), node('p', labels[connection.state] || 'Not connected', 'potential-status'), node('p', connection.note, 'small secondary'));
    for (const [text, url] of [['Open official catalog', connection.catalogUrl], ['Read access / reuse terms', connection.termsUrl], ['Apply for API key', connection.keyUrl]]) {
      if (!url) continue;
      const link = node('a', text); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; entry.append(link);
    }
    $('potential-list').append(entry);
  }
}
function onScopeChange() { renderSelection(); invalidateResults(); savePreferences(); }
function setDatabases(ids) {
  if (!Array.isArray(ids) || ids.some(id => !connectedMuseums().some(m => m.id === id))) throw new Error('Select connected museum databases only.');
  selected = new Set(ids); onScopeChange();
}
function updateMethod() {
  const textEnabled = methods[$('method').value].supportsText;
  $('query').disabled = !textEnabled; $('query-help').hidden = textEnabled;
  $('distance').disabled = $('method').value === 'metadata';
}
async function refreshStatus() {
  try {
    engine = await api('/api/status');
    const available = connectedMuseums();
    selected = new Set([...selected].filter(id => available.some(m => m.id === id)));
    savePreferences();
    const connected = available.length;
    $('connection-summary').textContent = `${connected} connected databases · ${engine.indexed} artworks indexed. First visual searches may take longer while images are indexed.`;
    renderMuseumList(); renderPotentialDatabases(); renderSelection();
  } catch {
    $('connection-summary').textContent = 'Start the project server with npm run dev, then reload this page.';
    updateSearchButton();
  }
}
function discardReferences() { references.forEach(ref => { if (!ref.id) URL.revokeObjectURL(ref.url); }); references = []; }
function renderReferences() {
  $('reference-images').replaceChildren();
  for (const reference of references) {
    const wrapper = node('div', undefined, 'reference-image'); const img = document.createElement('img'); img.src = reference.url; img.alt = reference.name;
    const remove = node('button', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove reference image ${reference.name}`);
    remove.addEventListener('click', () => { if (!reference.id) URL.revokeObjectURL(reference.url); references = references.filter(item => item !== reference); renderReferences(); invalidateResults(); $('image-input').focus(); });
    wrapper.append(img, remove, node('small', reference.name)); $('reference-images').append(wrapper);
  }
  $('image-status').textContent = `${references.length} reference image${references.length === 1 ? '' : 's'} added.`;
}
async function addImages(files) {
  const generation = uploadGeneration; const errors = []; uploadJobs += 1; updateSearchButton();
  for (const file of files) {
    if (references.length >= 6) { errors.push('Use up to six reference images.'); break; }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type)) { errors.push(`${file.name}: choose a supported image format.`); continue; }
    if (file.size > 20 * 1024 * 1024) { errors.push(`${file.name}: images must be under 20 MB.`); continue; }
    const url = URL.createObjectURL(file); const image = new Image(); image.src = url;
    try {
      await image.decode();
      if (generation !== uploadGeneration) { URL.revokeObjectURL(url); continue; }
      const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      references.push({ name: file.name, url, data: canvas.toDataURL('image/jpeg', .88) });
    } catch { URL.revokeObjectURL(url); errors.push(`${file.name}: this image could not be opened.`); }
  }
  uploadJobs -= 1; updateSearchButton(); if (generation !== uploadGeneration) return;
  $('image-error').textContent = errors.join(' '); $('image-error').hidden = !errors.length;
  if (references.length && $('method').value === 'metadata') { $('method').value = 'clip'; updateMethod(); savePreferences(); }
  renderReferences(); invalidateResults();
}
function renderCoverage(coverage) {
  $('coverage-list').replaceChildren();
  const labels = { access_blocked: 'Access blocked', permission_review: 'Reuse review needed', permission_required: 'Permission required', ready: 'Connected', empty: 'No new matches', partial: 'Partial results', error: 'Service error', key_required: 'API key required', unavailable: 'Not connected', validation_required: 'Setup required', loading: 'Retrieving' };
  for (const source of coverage) {
    const row = node('li'); row.append(node('strong', `${museumName(source.id)} — ${labels[source.state] || source.state}`));
    row.append(node('span', ` ${source.indexed || 0} images imported for this query. ${source.message || ''}`)); $('coverage-list').append(row);
  }
  if (coverage.some(source => !['ready', 'empty', 'loading'].includes(source.state))) $('source-coverage').open = true;
}
function sourceLink(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
function openArtwork(artwork) {
  $('artwork-title').textContent = artwork.title; $('artwork-museum').textContent = museumName(artwork.source);
  $('artwork-image').src = artwork.image; $('artwork-image').alt = artwork.title;
  const fields = [['Creator', artwork.artist], ['Date / period', artwork.date], ['Material / type', artwork.medium], ['Culture / origin', artwork.culture]].filter(([, value]) => value);
  $('artwork-metadata').replaceChildren(...fields.flatMap(([label, value]) => [node('dt', label), node('dd', value)]));
  $('artwork-description').textContent = artwork.description || 'No description supplied by the museum.';
  $('artwork-rights').textContent = `${artwork.rights}. ${artwork.attribution}`;
  const link = sourceLink(artwork.sourceUrl); $('artwork-source').hidden = !link; if (link) $('artwork-source').href = link;
  $('artwork-similar').onclick = () => { $('artwork-dialog').close(); useReference(artwork); };
  $('artwork-dialog').showModal();
}
function useReference(artwork) {
  uploadGeneration += 1; discardReferences(); references = [{ id: artwork.id, url: artwork.image, name: artwork.title }];
  $('query').value = ''; $('method').value = 'clip'; $('distance').value = 'cosine'; updateMethod(); renderReferences(); savePreferences(); invalidateResults();
  void runSearch();
}
function renderResults(result) {
  lastResult = result; $('stale-results').hidden = false;
  $('result-count-label').textContent = `${result.returned} results`;
  $('index-coverage').textContent = `${result.searched} indexed images searched · ${result.imported} images retrieved this time. ${result.note}`;
  $('results-grid').replaceChildren();
  const items = [...result.items];
  if ($('grouping').value === 'museum') items.sort((a, b) => museums.findIndex(m => m.id === a.source) - museums.findIndex(m => m.id === b.source));
  let group = null;
  for (const artwork of items) {
    if ($('grouping').value === 'museum' && group !== artwork.source) { group = artwork.source; $('results-grid').append(node('h3', museumName(group), 'result-group-heading')); }
    const card = node('article', undefined, 'artwork-card');
    const open = node('button', undefined, 'artwork-image-button'); open.type = 'button'; open.setAttribute('aria-label', `View details: ${artwork.title}`);
    const image = document.createElement('img'); image.src = artwork.image; image.alt = artwork.title; image.loading = 'lazy'; image.width = 300; image.height = 240;
    image.addEventListener('error', () => { image.hidden = true; open.append(node('span', 'Image unavailable')); }, { once: true });
    open.append(image); open.addEventListener('click', () => openArtwork(artwork));
    const body = node('div', undefined, 'artwork-card-body'); body.append(node('p', museumName(artwork.source), 'artwork-source-name'), node('h3', artwork.title), node('p', [artwork.artist, artwork.date].filter(Boolean).join(' · '), 'small secondary'));
    const similar = node('button', 'Find similar', 'text-button'); similar.type = 'button'; similar.addEventListener('click', () => useReference(artwork));
    const details = node('button', 'Details', 'text-button'); details.type = 'button'; details.addEventListener('click', () => openArtwork(artwork));
    const actions = node('div', undefined, 'card-actions'); actions.append(details, similar); body.append(actions); card.append(open, body); $('results-grid').append(card);
  }
  $('empty-results').hidden = items.length > 0; renderCoverage(result.coverage); $('stale-results').hidden = true;
}
async function runSearch() {
  if (busy || uploadJobs) return;
  let config;
  try { config = buildSearchConfiguration({ preferences: currentPreferences(), query: $('query').value, imageCount: references.length }); }
  catch (error) { $('query-error').textContent = error.message; $('query-error').hidden = false; return; }
  if (config.method === 'metadata' && references.length) { $('query-error').textContent = 'Choose CLIP or color/pixels to search with images.'; $('query-error').hidden = false; return; }
  const token = ++revision; setBusy(true); $('query-error').hidden = true; $('search-results').hidden = false; $('stale-results').hidden = true;
  $('search-progress').textContent = 'Contacting the selected museums…'; $('empty-results').hidden = true;
  $('search-results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  try {
    const job = await api('/api/search', { method: 'POST', body: JSON.stringify({ ...config, images: references.filter(ref => ref.data).map(ref => ref.data), referenceIds: references.filter(ref => ref.id).map(ref => ref.id) }) });
    if (token !== revision) { void api(`/api/jobs/${job.id}`, { method: 'DELETE' }).catch(() => {}); return; }
    activeJob = job.id;
    while (token === revision) {
      const state = await api(`/api/jobs/${job.id}`);
      if (token !== revision) return;
      $('search-progress').textContent = state.message; renderCoverage(state.coverage || []);
      if (state.state === 'error') throw new Error(state.message);
      if (state.state === 'cancelled') break;
      if (state.state === 'done') { renderResults(state.result); await refreshStatus(); break; }
      await new Promise(resolve => setTimeout(resolve, 850));
    }
  } catch (error) {
    if (token === revision) { $('query-error').textContent = error.message; $('query-error').hidden = false; $('search-progress').textContent = error.message; }
  } finally { if (token === revision) { activeJob = null; setBusy(false); } }
}

$('museum-filter').addEventListener('input', renderMuseumList);
$('select-all').addEventListener('change', event => setDatabases(event.target.checked ? connectedMuseums().map(m => m.id) : []));
$('clear-selection').addEventListener('click', () => setDatabases([]));
$('query').addEventListener('input', invalidateResults);
$('method').addEventListener('change', () => { $('distance').value = methods[$('method').value].defaultDistance; updateMethod(); invalidateResults(); savePreferences(); });
for (const id of ['distance', 'result-count']) $(id).addEventListener('change', () => { invalidateResults(); savePreferences(); });
$('grouping').addEventListener('change', () => { savePreferences(); if (lastResult) { const stale = !$('stale-results').hidden; renderResults(lastResult); $('stale-results').hidden = !stale; } });
$('image-input').addEventListener('change', event => { const files = [...event.target.files]; event.target.value = ''; void addImages(files); });
$('reset-query').addEventListener('click', () => { uploadGeneration += 1; discardReferences(); $('query').value = ''; $('image-error').hidden = true; renderReferences(); invalidateResults(); });
$('cancel-search').addEventListener('click', () => { cancelSearch(); $('search-progress').textContent = 'Search cancelled.'; });
$('search-form').addEventListener('submit', event => { event.preventDefault(); void runSearch(); });
$('close-artwork').addEventListener('click', () => $('artwork-dialog').close());
$('artwork-dialog').addEventListener('click', event => { if (event.target === $('artwork-dialog')) { const rect = $('artwork-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('artwork-dialog').close(); } });
$('method').value = preferences.method; $('distance').value = preferences.distance; $('result-count').value = String(preferences.results); $('grouping').value = preferences.grouping;
renderMuseumList(); renderSelection(); updateMethod(); void refreshStatus();

if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController(); window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const tool = { name: 'configure_museum_scope', title: 'Select museum databases', description: 'Select databases for the local museum search. ["all"] and ["connected"] select all connected databases. Potential databases cannot be selected until connected. This action only changes the selection and does not run a search.', inputSchema: { type: 'object', properties: { databases: { type: 'array', items: { type: 'string', enum: ['all', 'connected', ...museums.map(m => m.id)] } } }, required: ['databases'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) {
    if (!input || !Array.isArray(input.databases) || Object.keys(input).some(key => key !== 'databases')) throw new Error('Expected a databases array.');
    if (input.databases.some(id => ['all', 'connected'].includes(id)) && input.databases.length !== 1) throw new Error('Use all or connected alone.');
    if (['all', 'connected'].includes(input.databases[0]) && !engine) throw new Error('The local server is not available.');
    setDatabases(['all', 'connected'].includes(input.databases[0]) ? connectedMuseums().map(m => m.id) : input.databases);
    return { databases: currentPreferences().databases, count: selected.size };
  } };
  try { void Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
}
