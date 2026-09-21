// A curated glossary for candidate retrieval, not a general translation service.
const concepts = [
  ['landscape', 'landscapes', '山水', '风景', '風景', '풍경', '산수'],
  ['portrait', 'portraits', '肖像', '초상'],
  ['dragon', 'dragons', '龙', '龍', '竜', '용'],
  ['blue and white porcelain', '青花瓷', '青花', '染付', '청화백자'],
  ['ceramics', 'ceramic', '陶瓷', '陶磁器', '도자기'],
  ['Buddha', '佛像', '仏像', '불상'],
  ['flowers', 'flower', '花卉', '花', '꽃'],
  ['bird', 'birds', '鸟', '鳥', '새'],
  ['horse', 'horses', '马', '馬', '말'],
  ['bronze', '青铜', '青銅', '청동'],
  ['calligraphy', '书法', '書法', '書道', '서예'],
  ['ink painting', '水墨画', '水墨畫', '수묵화'],
];
export function expandedQueries(query, source) {
  const original = query.trim(); if (!original) return [''];
  const matched = concepts.filter(aliases => aliases.some(alias => {
    if (/^[a-z ]+$/i.test(alias)) return new RegExp(`\\b${alias}\\b`, 'i').test(original);
    return original === alias || (alias.length > 1 && original.includes(alias));
  }));
  const english = matched.map(aliases => aliases[0]).join(' ');
  const variants = [original];
  if (english) variants.push(english);
  // Add a local-language alias for the connected Asian catalogs.
  if (matched.length === 1 && source === 'npm') variants.push(matched[0][matched[0].findIndex(a => /[\u3400-\u9fff]/.test(a))]);
  if (matched.length === 1 && source === 'japan_art') {
    const japanese = { landscape: '風景', portrait: '肖像', dragon: '龍', 'blue and white porcelain': '染付', ceramics: '陶磁器', Buddha: '仏像', flowers: '花', bird: '鳥', horse: '馬', bronze: '青銅', calligraphy: '書道', 'ink painting': '水墨画' };
    variants.push(japanese[matched[0][0]]);
  }
  return [...new Set(variants.filter(Boolean))].slice(0, 3);
}
export async function retrieveExpanded(search, source, query, limit) {
  const queries = expandedQueries(query, source); const records = new Map(); const notes = []; let succeeded = 0; let failures = 0;
  for (const term of queries) {
    try { const response = await search(source, term, Math.max(3, Math.ceil(limit / queries.length))); succeeded++; notes.push(response.note); for (const record of response.records) records.set(`${record.source}:${record.sourceId}`, record); failures += response.partialFailures || 0; }
    catch { failures++; }
  }
  if (!succeeded) throw new Error('Museum retrieval failed for all query variants.');
  return { records: [...records.values()].slice(0, limit), partialFailures: failures, note: [...new Set(notes.filter(Boolean)), `Museum queries: ${queries.join(' / ')}. Expanded terms use a limited art glossary; visual ranking uses your original query.`].join(' ') };
}
