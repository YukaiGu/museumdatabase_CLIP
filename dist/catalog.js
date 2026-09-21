/** Display names. Live connection status and indexed counts come from /api/status. */
export const museums = Object.freeze([
  {'id': 'palace_beijing', 'name': 'Palace Museum, Beijing', 'short': 'Palace Museum', 'location': 'Beijing, China', 'region': 'Asia'},
  {'id': 'national_china', 'name': 'National Museum of China', 'short': 'National Museum of China', 'location': 'Beijing, China', 'region': 'Asia'},
  {'id': 'shanghai', 'name': 'Shanghai Museum', 'short': 'Shanghai Museum', 'location': 'Shanghai, China', 'region': 'Asia'},
  {'id': 'tomuco', 'name': 'Tokyo Museum Collection (ToMuCo)', 'short': 'ToMuCo', 'location': 'Tokyo, Japan · six museums', 'region': 'Asia'},
  {'id': 'japan_art', 'name': 'National Art Museums of Japan', 'short': 'National Art Museums, Japan', 'location': 'Japan · five museums', 'region': 'Asia'},
  {'id': 'ekoku', 'name': 'e-Museum National Treasures, Japan', 'short': 'e-Museum Japan', 'location': 'Japan · national heritage museums', 'region': 'Asia'},
  {'id': 'sema', 'name': 'Seoul Museum of Art', 'short': 'SeMA', 'location': 'Seoul, South Korea', 'region': 'Asia'},
  { id: 'npm', name: 'National Palace Museum', short: 'National Palace Museum', location: 'Taipei', region: 'Asia' },
  { id: 'colbase', name: 'ColBase', short: 'ColBase', location: 'Japan · multiple institutions', region: 'Asia' },
  { id: 'emuseum', name: 'eMuseum', short: 'eMuseum', location: 'South Korea · multiple museums', region: 'Asia' },
  { id: 'smk', name: 'National Gallery of Denmark (SMK)', short: 'SMK', location: 'Copenhagen', region: 'Europe' },
  { id: 'mia', name: 'Minneapolis Institute of Art', short: 'Mia', location: 'Minneapolis', region: 'North America' },
  { id: 'rijks', name: 'Rijksmuseum', short: 'Rijksmuseum', location: 'Amsterdam', region: 'Europe' },
  { id: 'met', name: 'The Metropolitan Museum', short: 'The Met', location: 'New York', region: 'North America' },
  { id: 'moma', name: 'MoMA', short: 'MoMA', location: 'New York', region: 'North America' },
  { id: 'getty', name: 'Getty', short: 'Getty', location: 'Los Angeles', region: 'North America' },
  { id: 'smithsonian', name: 'Smithsonian', short: 'Smithsonian', location: 'United States · multiple museums', region: 'North America' },
  { id: 'artic', name: 'Art Institute of Chicago', short: 'Art Institute of Chicago', location: 'Chicago', region: 'North America' },
  { id: 'cleveland', name: 'Cleveland Museum of Art', short: 'Cleveland Museum of Art', location: 'Cleveland', region: 'North America' },
]);

export const methods = Object.freeze({
  multilingual: { label: 'Multilingual text + images (CLIP)', defaultDistance: 'cosine', supportsText: true },
  clip: { label: 'Text + visual meaning (CLIP)', defaultDistance: 'cosine', supportsText: true },
  raw: { label: 'Color and pixels (Raw)', defaultDistance: 'manhattan', supportsText: false },
  metadata: { label: 'Museum metadata (keywords)', defaultDistance: 'cosine', supportsText: true },
});

export const defaultPreferences = Object.freeze({ databases: ['npm', 'rijks', 'met', 'artic', 'cleveland'], method: 'clip', distance: 'cosine', results: 50, grouping: 'combined' });

export function normalizePreferences(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const validIds = new Set(museums.map(museum => museum.id));
  return {
    databases: Array.isArray(input.databases) ? [...new Set(input.databases.filter(id => validIds.has(id)))] : [...defaultPreferences.databases],
    method: Object.hasOwn(methods, input.method) ? input.method : defaultPreferences.method,
    distance: ['cosine', 'manhattan', 'euclidean'].includes(input.distance) ? input.distance : defaultPreferences.distance,
    results: [25, 50, 75, 100].includes(input.results) ? input.results : defaultPreferences.results,
    grouping: ['combined', 'museum'].includes(input.grouping) ? input.grouping : defaultPreferences.grouping,
  };
}

export function buildSearchConfiguration({ preferences, query = '', imageCount = 0 }) {
  const normalized = normalizePreferences(preferences);
  if (!normalized.databases.length) throw new Error('Select at least one database.');
  if (!Number.isInteger(imageCount) || imageCount < 0) throw new Error('Invalid reference image count.');
  if (!methods[normalized.method].supportsText && imageCount === 0) throw new Error('Add a reference image for this search method, or choose Text + visual meaning (CLIP).');
  return {
    ...normalized,
    query: methods[normalized.method].supportsText ? String(query).trim().slice(0, 2000) : '',
    imageCount,
    mode: 'search',
  };
}
