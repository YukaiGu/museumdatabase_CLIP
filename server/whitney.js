import * as cheerio from 'cheerio';
import { remote } from './remote.js';

const termsUrl = 'https://whitney.org/about/website/api';
const clean = value => {
  const $ = cheerio.load(String(value || ''));
  $('script,style').remove();
  return $.text().replace(/\s+/g, ' ').trim();
};

export function whitneyRecords(rows) {
  const records = new Map();
  for (const row of rows) {
    const item = row.attributes;
    if (row.type !== 'artwork' || !/^\d+$/.test(String(row.id)) || !item || item.is_virtual || item.is_portfolio) continue;
    const image = (item.images || []).find(image => {
      try {
        const url = new URL(image.url);
        return url.protocol === 'https:' && url.hostname === 'whitneymedia.org' && !url.username && !url.password && !url.port && url.pathname.startsWith('/assets/artwork/') && /\.(jpe?g|png|webp)$/i.test(url.pathname);
      } catch { return false; }
    });
    if (!image) continue;
    // The API permits personal/noncommercial educational use, not unrestricted reuse.
    // Its full caption carries copyright notices that must survive local indexing.
    const caption = clean(item.description);
    const artist = clean(item.display_artist_text);
    const title = clean(item.title) || 'Untitled';
    records.set(String(row.id), {
      source: 'whitney', sourceId: String(row.id), title, artist,
      date: clean(item.display_date), medium: clean(item.medium), culture: '',
      holdingMuseum: 'Whitney Museum of American Art',
      description: [caption, clean(item.object_label), clean(item.visual_description || item.alt_text)].filter(Boolean).join(' '),
      imageUrl: image.url, sourceUrl: `https://whitney.org/collection/works/${row.id}`,
      dataProvider: 'Whitney Museum of American Art public API',
      rights: `Personal / noncommercial educational use under Whitney API terms (${termsUrl}). Images are not CC0; copyright and other rights retained.`,
      attribution: `${caption || `${artist}, ${title}. ${clean(item.credit_line)}. Whitney Museum of American Art, New York`}. Source: https://whitney.org/collection/works/${row.id}. Image resized for local research.`,
      usageRestriction: 'personal-noncommercial-educational',
    });
  }
  return [...records.values()];
}

export async function searchWhitney(query, limit, request = remote) {
  const records = new Map();
  let total; let pages = 0;
  const count = Math.min(25, Math.max(1, limit));
  for (let page = 1; page <= 3; page++) {
    const url = new URL('https://whitney.org/api/artworks');
    url.searchParams.set('page', String(page));
    url.searchParams.set('q[s]', 'popularity desc');
    if (query.trim()) url.searchParams.set('q[title_or_display_artist_text_or_medium_or_description_cont_all_split]', query.trim());
    const response = await request(url, { json: true });
    if (!Array.isArray(response.data) || response.errors) throw new Error('Whitney returned an invalid collection response.');
    total = response.meta?.total; pages++;
    for (const record of whitneyRecords(response.data)) records.set(record.sourceId, record);
    if (records.size >= count || !response.links?.next) break;
  }
  return { records: [...records.values()].slice(0, count), total,
    note: `Official Whitney public API; searched ${pages} page(s), importing at most ${count} images per search. AI ranks imported images and the existing local index, not the entire collection. For personal/noncommercial educational use; full copyright captions retained.` };
}
