import * as cheerio from 'cheerio';
import { remote } from './remote.js';

const text = value => String(value || '').replace(/\s+/g, ' ').trim();
const joined = values => [...new Set(values.map(text).filter(Boolean))].join(' / ');
function base(source, sourceId, fields) {
  return { source, sourceId, title: 'Untitled', artist: '', date: '', medium: '', culture: '', description: '', metadataOnly: true, ...fields };
}

export function parseShuzo(html, limit = 25) {
  const $ = cheerio.load(html); const groups = new Map(); const seen = new Set();
  $('a.apjID').each((_, link) => {
    const path = $(link).attr('href');
    if (!/^\/collections\/W\d+$/.test(path || '') || seen.has(path)) return;
    seen.add(path);
    const row = $(link).closest('.item-left');
    const field = selector => { const part = row.find(selector).clone(); part.find('.item-label').remove(); return text(part.text()).replace(/^:\s*/, ''); };
    const holdingMuseum = text(row.find('.isMuseums').text());
    const item = base('shuzo', path.split('/').pop(), {
      title: joined([row.find('.work-title-en').text(), row.find('.work-title-ja').text()]) || 'Untitled',
      artist: joined([row.find('.artist .en').text(), row.find('.artist .ja').text()]),
      date: field('.isYear'), medium: field('.isMedium'), holdingMuseum,
      sourceUrl: `https://artplatform.go.jp${path}`,
      rights: 'Art Platform Japan terms of use; third-party rights may apply. Images excluded',
      attribution: `Source: Art Platform Japan, Cultural Affairs Agency (https://artplatform.go.jp${path}), modified from original: selected fields combined and normalized. Holding museum: ${holdingMuseum}`,
    });
    if (!groups.has(holdingMuseum)) groups.set(holdingMuseum, []);
    groups.get(holdingMuseum).push(item);
  });
  // Diversify the first result page across holding museums, without crawling additional pages.
  const records = [];
  while (records.length < Math.min(limit, 25) && [...groups.values()].some(rows => rows.length)) {
    for (const rows of groups.values()) { if (rows.length && records.length < Math.min(limit, 25)) records.push(rows.shift()); }
  }
  if (!records.length && !/0\s*(?:results|件)|No results|No matching artworks were found|該当.*ありません/i.test($.text())) throw new Error('SHŪZŌ returned no recognizable records. Check the official catalog.');
  return records;
}

export async function shuzo(query, limit) {
  if (!query.trim()) return { records: [], note: 'Enter a keyword for SHŪZŌ metadata search.' };
  const url = new URL('https://artplatform.go.jp/collections'); url.searchParams.set('keyword', query);
  const html = await remote(url, { text: true });
  return { records: parseShuzo(html, limit), note: 'Metadata only; a selection from the first result page. Holding museums retained. No image analysis. Server cache limited to 250 SHŪZŌ records.' };
}

export function parseYokohama(html, limit = 25) {
  const $ = cheerio.load(html); const records = [];
  $('.tbody > ul').each((_, element) => {
    const row = $(element); const link = row.find('a.permalink').first();
    const url = link.attr('href'); const id = url?.match(/^https:\/\/inventory\.yokohama\.art\.museum\/(?:eng\/)?(\d+)$/)?.[1];
    if (!id) return;
    const field = selector => { const part = row.children(selector).clone(); part.find('.sp').remove(); return text(part.text()); };
    records.push(base('yokohama', id, {
      title: text(link.text()) || 'Untitled', artist: field('.name'), date: field('.year'), medium: field('.material'),
      accessionNumber: field('.no'), holdingMuseum: 'Yokohama Museum of Art', sourceUrl: url,
      rights: 'Basic metadata: CC BY 4.0. Images and work descriptions excluded',
      attribution: `Yokohama Museum of Art (${url}); https://creativecommons.org/licenses/by/4.0/ . Selected fields normalized by Collection Atlas.`,
    }));
  });
  if (!records.length && !/Search Results\s*\(0\)|検索結果.*0件/i.test($.text())) throw new Error('Yokohama returned no recognizable records. Check the official catalog.');
  return records.slice(0, Math.min(limit, 25));
}

export async function yokohama(query, limit) {
  const japanese = /[\u3040-\u30ff\u3400-\u9fff]/.test(query);
  const url = new URL(`https://inventory.yokohama.art.museum/${japanese ? '' : 'eng/'}`);
  url.searchParams.set('at', 's/search'); url.searchParams.set('s_word', query); url.searchParams.set('mode', 'list');
  const html = await remote(url, { text: true });
  return { records: parseYokohama(html, limit), note: 'Basic collection metadata only (CC BY 4.0). No images, descriptions, or Triennale exhibition inventory imported.' };
}
