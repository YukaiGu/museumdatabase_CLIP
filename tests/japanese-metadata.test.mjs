import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseShuzo, parseYokohama } from '../server/japanese-metadata.js';

const shuzoRow = (id, museum) => `<div class="item-left"><a class="apjID" href="/collections/W${id}">W${id}</a><div class="work-title-ja">風景</div><div class="work-title-en">Landscape</div><div class="artist"><span class="ja">画家</span><span class="en">Artist</span></div><div class="isMuseums">${museum}</div><div class="isYear"><span class="item-label">Year</span>: 1920</div><div class="isMedium"><span class="item-label">Medium:</span> ink</div><img src="https://restricted.example/art.jpg"></div>`;
const yokoRow = '<div class="tbody"><ul><li class="name">Artist</li><li class="nest"><h2><a class="permalink" href="https://inventory.yokohama.art.museum/eng/123">Landscape</a></h2><img src="https://inventory.yokohama.art.museum/art_images/restricted.jpg"></li><li class="year"><span class="sp">Date：</span>1920</li><li class="material"><span class="sp">Medium：</span>ink</li><li class="no"><span class="sp">Inventory：</span>A1</li></ul></div>';

test('Japanese metadata parsers retain provenance and exclude all images and descriptions', () => {
  const rows = parseShuzo(shuzoRow(1,'Museum A') + shuzoRow(2,'Museum A') + shuzoRow(3,'Museum B'), 2);
  assert.deepEqual(rows.map(r => r.holdingMuseum), ['Museum A','Museum B']);
  assert.equal(rows[0].title, 'Landscape / 風景'); assert.equal(rows[0].date,'1920');
  const yokohama = parseYokohama(yokoRow)[0]; assert.equal(yokohama.accessionNumber,'A1');
  for (const row of [...rows, yokohama]) { assert.equal(row.metadataOnly,true); assert.equal(row.imageUrl,undefined); assert.equal(row.description,''); assert.ok(row.attribution.includes(row.sourceUrl)); }
  assert.equal(parseYokohama(yokoRow.replace('inventory.yokohama.art.museum/eng/123','evil.example/123') + 'Search Results(0)').length,0);
});
test('empty searches are distinct from broken source markup', () => {
  assert.deepEqual(parseShuzo('No matching artworks were found.'),[]);
  assert.deepEqual(parseYokohama('検索結果(合計 0件)'),[]);
  for (const parse of [parseShuzo,parseYokohama]) assert.throws(() => parse('<h1>Service unavailable</h1>'), /no recognizable/);
});
test('metadata-only records complete search without image downloads or embeddings and cannot become visual references', async () => {
  const data = await mkdtemp(join(tmpdir(),'atlas-metadata-test-')); process.env.DATA_DIR=data;
  const previousFetch=globalThis.fetch; const urls=[];
  globalThis.fetch=async url=>{ urls.push(String(url)); return new Response(yokoRow); };
  try {
    const { startSearch, getJob, validateSearch, sourceSupportsMethod, imagePath }=await import('../server/search.js');
    const config={databases:['yokohama'],method:'metadata',query:'landscape',results:25,distance:'cosine',grouping:'combined'};
    const job=startSearch(config);
    for(let i=0;i<100 && !['done','error'].includes(getJob(job.id).state);i++) await new Promise(r=>setTimeout(r,10));
    assert.equal(job.state,'done',job.message); assert.equal(job.result.items.length,1);
    const item=job.result.items[0]; assert.equal(item.image,null);assert.equal(imagePath(item.id),null);
    assert.equal(urls.length,1); assert.match(urls[0],/s_word=landscape/);
    const saved=JSON.parse(await readFile(join(data,'index-v1.json'),'utf8'));
    assert.equal(saved.records[0].clip,undefined);assert.equal(saved.records[0].raw,undefined);
    assert.equal(sourceSupportsMethod('yokohama','clip'),false);assert.equal(sourceSupportsMethod('shuzo','multilingual'),false);
    assert.throws(()=>validateSearch({...config,method:'clip'}),/metadata only/);
    assert.throws(()=>validateSearch({...config,databases:['met'],method:'clip',referenceIds:[item.id]}),/no longer/);
  } finally { globalThis.fetch=previousFetch; await rm(data,{recursive:true,force:true}); }
});
