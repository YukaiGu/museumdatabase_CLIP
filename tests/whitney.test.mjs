import test from 'node:test';
import assert from 'node:assert/strict';
import { whitneyRecords, searchWhitney } from '../server/whitney.js';

const row = { id: '123', type: 'artwork', attributes: {
  title: 'Moon', display_artist_text: 'Artist', display_date: '2014', medium: 'Oil',
  description: '<p>Artist, <em>Moon</em>. © Artist / ARS. All rights reserved.</p>',
  images: [{ url: 'https://whitneymedia.org/assets/artwork/123/image.jpg' }],
} };
test('Whitney keeps copyright captions and admits only artwork image URLs', () => {
  const [record] = whitneyRecords([row, row]);
  assert.match(record.attribution, /© Artist \/ ARS. All rights reserved/);
  assert.match(record.rights, /not CC0/);
  assert.equal(record.usageRestriction, 'personal-noncommercial-educational');
  assert.ok(record.imageUrl);
  assert.equal(whitneyRecords([row,row]).length, 1);
  for (const image of ['http://whitneymedia.org/assets/artwork/123/a.jpg', 'https://example.com/a.jpg', 'https://whitneymedia.org/assets/artwork/123/a.pdf']) {
    assert.equal(whitneyRecords([{...row, attributes:{...row.attributes,images:[{url:image}]}}]).length,0);
  }
  assert.equal(whitneyRecords([{...row,attributes:{...row.attributes,is_virtual:true}}]).length,0);
});
test('Whitney follows bounded pages and preserves user text as a query value', async () => {
  const urls=[];
  const response = await searchWhitney('Frank Stella & moon', 1, async url => {
    urls.push(url);
    return urls.length===1 ? { data:[],links:{next:'https://untrusted.example/'},meta:{total:2} } : { data:[row],meta:{total:2} };
  });
  assert.equal(response.records.length,1);
  assert.equal(urls.length,2);
  assert.ok(urls.every(url=>url.hostname==='whitney.org'));
  assert.equal(urls[0].searchParams.get('q[title_or_display_artist_text_or_medium_or_description_cont_all_split]'),'Frank Stella & moon');
  assert.equal(urls[1].searchParams.get('page'),'2');
  let count=0;
  await searchWhitney('',25,async()=>{count++;return {data:[],links:{next:'more'}};});
  assert.equal(count,3);
  await assert.rejects(searchWhitney('',25,async()=>({errors:['bad']})),/invalid collection/);
});
