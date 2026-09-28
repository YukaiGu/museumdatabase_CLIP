import * as cheerio from 'cheerio';
import { remote } from './remote.js';

export const contemporaryMuseums = Object.freeze({
  moma: { entity: 'Q188740', name: 'Museum of Modern Art', catalog: 'https://www.moma.org/collection/' },
  tate: { entity: 'Q430682', name: 'Tate', catalog: 'https://www.tate.org.uk/art' },
  pompidou: { entity: 'Q1895953', name: "Musée National d’Art Moderne / Centre Pompidou", catalog: 'https://www.centrepompidou.fr/en/collection' },
});
const clean = value => { const $ = cheerio.load(String(value || '')); $('style,script').remove(); return $.text().replace(/\s+/g, ' ').trim(); };
const normalize = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
const cache = new Map();
const MAX_CANDIDATES = 160;

export function collectionQuery(source) {
  const museum = contemporaryMuseums[source];
  if (!museum) throw new Error('Unknown contemporary collection.');
  // Collection membership, rather than exhibition/location, defines the holding institution.
  // Direct artwork classes exclude people, buildings, and movie publicity photographs.
  return `SELECT DISTINCT ?item ?itemLabel ?image ?creatorLabel ?date ?typeLabel WHERE {
    ?item wdt:P195 wd:${museum.entity}; wdt:P18 ?image; wdt:P31 ?type; wdt:P571 ?date.
    VALUES ?type { wd:Q3305213 wd:Q860861 wd:Q125191 wd:Q212431 }
    FILTER(?date >= "1900-01-01T00:00:00Z"^^xsd:dateTime)
    OPTIONAL { ?item wdt:P170 ?creator }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,nl". }
  } ORDER BY DESC(?date) ?item LIMIT ${MAX_CANDIDATES}`;
}

export function candidatesFromBindings(bindings) {
  const records = new Map();
  for (const row of bindings) {
    const id = row.item?.value?.match(/^https?:\/\/www\.wikidata\.org\/entity\/(Q\d+)$/)?.[1];
    const title = clean(row.itemLabel?.value);
    let image;
    try {
      const url = new URL(row.image?.value);
      if (url.hostname !== 'commons.wikimedia.org' || !url.pathname.startsWith('/wiki/Special:FilePath/')) continue;
      image = decodeURIComponent(url.pathname.slice('/wiki/Special:FilePath/'.length));
    } catch { continue; }
    if (!id || !title || title === id || !/\.(jpe?g|png|webp)$/i.test(image)) continue;
    if (records.has(id)) continue;
    records.set(id, { id, title, artist: clean(row.creatorLabel?.value), date: row.date?.value?.slice(0,4) || '', medium: clean(row.typeLabel?.value), filename: `File:${image}` });
  }
  return [...records.values()];
}

export function licensedImage(info) {
  const metadata = info?.extmetadata;
  if (!metadata || !['image/jpeg','image/png','image/webp'].includes(info.mime)) return null;
  const license = clean(metadata.LicenseShortName?.value);
  const url = clean(metadata.LicenseUrl?.value).replace(/^http:/,'https:');
  // Reject missing/ambiguous licensing, NC/ND licences, and additional restrictions.
  if (clean(metadata.Restrictions?.value)) return null;
  const cc = license.match(/^CC BY(-SA)? (1\.0|2\.0|2\.5|3\.0|4\.0)$/);
  let licenseUrl;
  if (cc && url.replace(/\/$/,'') === `https://creativecommons.org/licenses/by${cc[1]?'-sa':''}/${cc[2]}`) licenseUrl = url;
  else if (license === 'CC0' && /^https:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\/?$/.test(url)) licenseUrl=url;
  else if (license === 'Public domain' && metadata.Copyrighted?.value === 'False') licenseUrl='https://creativecommons.org/publicdomain/mark/1.0/';
  else return null;
  const image = info.thumburl || info.url;
  let parsed;
  try { parsed=new URL(image); } catch { return null; }
  if (parsed.protocol!=='https:' || parsed.hostname!=='upload.wikimedia.org' || parsed.username || parsed.password || !parsed.pathname.startsWith('/wikipedia/commons/')) return null;
  let sourceURL;
  try { sourceURL=new URL(info.descriptionurl); } catch { return null; }
  if(sourceURL.protocol!=='https:' || sourceURL.hostname!=='commons.wikimedia.org' || !sourceURL.pathname.startsWith('/wiki/File:'))return null;
  return { imageUrl: parsed.href, imageSourceUrl: sourceURL.href, license, licenseUrl,
    credit: [clean(metadata.Artist?.value),clean(metadata.Credit?.value)].filter(Boolean).join(' · ') };
}

export function makeContemporaryRecord(source, candidate, image) {
  const museum=contemporaryMuseums[source];
  return { source, sourceId:candidate.id, title:candidate.title, artist:candidate.artist, date:candidate.date,
    medium:candidate.medium, culture:'', holdingMuseum:museum.name,
    description:'Collection membership and artwork details from Wikidata; image supplied by Wikimedia Commons. This may depict another cast or installation of the same work. This connection is an open-image selection, not the full museum catalog.',
    imageUrl:image.imageUrl, sourceUrl:`https://www.wikidata.org/wiki/${candidate.id}`, sourceLinkLabel:'Artwork data on Wikidata',
    imageSourceUrl:image.imageSourceUrl, licenseUrl:image.licenseUrl,
    rights:`${image.license} · ${image.licenseUrl}. Metadata: Wikidata CC0`,
    attribution:`${image.credit || candidate.artist} · ${museum.name} collection (Wikidata). Image: ${image.imageSourceUrl}. Resized and recompressed for local visual search; image license retained${image.license.includes('BY-SA')?'; adapted image shared under the same license':''}.`,
    dataProvider:'Wikidata / Wikimedia Commons' };
}

export async function searchContemporary(source, query, limit, request = remote) {
  if(!contemporaryMuseums[source])throw new Error('Unknown contemporary collection.');
  let candidates;
  const saved=cache.get(source);
  if(request===remote && saved && Date.now()-saved.at<10*60*1000)candidates=saved.records;
  else {
    const url=new URL('https://query.wikidata.org/sparql');url.searchParams.set('query',collectionQuery(source));url.searchParams.set('format','json');
    const result=await request(url,{json:true});
    if(!Array.isArray(result.results?.bindings))throw new Error('Wikidata returned an invalid collection response.');
    candidates=candidatesFromBindings(result.results.bindings);
    if(request===remote)cache.set(source,{at:Date.now(),records:candidates});
  }
  const terms=normalize(query).split(/\s+/).filter(Boolean);
  const selected=candidates.filter(r=>terms.every(t=>normalize(`${r.title} ${r.artist} ${r.date} ${r.medium}`).includes(t)));
  const records=[];let excluded=0;
  for(let offset=0;offset<selected.length;offset+=10){
    const batch=selected.slice(offset,offset+10);
    const url=new URL('https://commons.wikimedia.org/w/api.php');
    for(const [key,value] of Object.entries({action:'query',format:'json',prop:'imageinfo',titles:batch.map(r=>r.filename).join('|'),iiprop:'url|mime|extmetadata',iiurlwidth:'800',iiextmetadatafilter:'Artist|Credit|LicenseShortName|LicenseUrl|Copyrighted|Restrictions'}))url.searchParams.set(key,value);
    const response=await request(url,{json:true});if(response.error || !response.query?.pages)throw new Error('Commons image-license lookup failed.');
    const pages=Object.values(response.query.pages);
    const names=new Map((response.query.normalized||[]).map(n=>[n.from,n.to]));
    for(const item of batch){const title=names.get(item.filename)||item.filename;const page=pages.find(p=>p.title===title);const image=licensedImage(page?.imageinfo?.[0]);if(image)records.push(makeContemporaryRecord(source,item,image));else excluded++;}
    if(records.length>=limit)break;
  }
  return { records:records.slice(0,limit), note:`Wikidata / Wikimedia Commons open-image subset; not an official museum API or complete collection. Uses at most ${MAX_CANDIDATES} recent collection-linked rows dated 1900 onward. ${excluded} candidate images excluded by file/license checks. Text filters use title, creator, year, and artwork type; CLIP ranks the available images.`, candidateCount:candidates.length };
}
