import * as cheerio from 'cheerio';
import { remote, mapLimited } from './remote.js';
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const base = 'https://search.artmuseums.go.jp/';
export function parseJapanRecord(html, id) {
  const $ = cheerio.load(html);
  if (!$('img[src*="NoC-CR"]').length || !$('.dl_button[data-edaban]').length) return null;
  const title = clean($('.det_title').first().text());
  const table = $('.det_title').first().closest('table');
  const cells = table.find('td.det1').map((_, e) => clean($(e).text())).get().filter(Boolean);
  const after = $('.det_title').first().closest('tr').nextAll('tr').map((_, e) => clean($(e).children('td.det1').text())).get();
  const image = $('img[src*="/jpeg/mid/"]').first().attr('src');
  if (!title || !image) return null;
  const museum = cells.find(t => /^The National Museum|^National Crafts Museum/.test(t)) || 'National Museum of Art, Japan';
  return { source: 'japan_art', sourceId: String(id), title, artist: cells[0] || '', date: after[1] || '', medium: after[2] || '', culture: '', description: '', imageUrl: new URL(image, `${base}search_e/`).href, sourceUrl: `${base}search_e/records.php?sakuhin=${id}`, rights: 'No Copyright – Contractual Restrictions (NoC-CR). Attribution and modification notice required.', attribution: `${museum} · Source: Union Catalog of the National Museum of Art, Japan. Image resized and recompressed by Collection Atlas for local search.`, institution: museum };
}
export async function japanArt(query, limit) {
  if (!query) return { records: [], note: 'Enter an English or Japanese keyword to import new records; image-only searches use the existing local index.' };
  const form = { key: query, type: 'keywords', OP: 'AND', momat: 'on', momak: 'on', nmwa: 'on', nmao: 'on', ncm: 'on' };
  const html = await remote(`${base}search_e/sakuhin_list.php`, { text: true, form });
  const ids = [...new Set([...html.matchAll(/records\.php\?sakuhin=(\d+)/g)].map(m => m[1]))].slice(0, 20);
  const rows = await mapLimited(ids, 2, async id => parseJapanRecord(await remote(`${base}search_e/records.php?sakuhin=${id}`, { text: true }), id));
  return { records: rows.filter(r => r?.imageUrl).slice(0, limit), partialFailures: rows.filter(r => r?.error).length, note: 'Searches five national art museums. Imports only downloadable images explicitly labeled NoC-CR; examines up to 20 candidates per query. Others are excluded.' };
}
