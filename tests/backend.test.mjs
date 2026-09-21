import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, average, distance } from '../server/embeddings.js';
import { validateSearch } from '../server/search.js';
import { validateRemoteURL } from '../server/remote.js';

const valid = { databases: ['met'], method: 'clip', distance: 'cosine', results: 25, grouping: 'combined', query: 'dragon' };
test('backend rejects unsupported models, unknown sources, and empty scope', () => {
  for (const change of [{ databases: [] }, { databases: ['invented'] }, { method: 'poses' }, { results: 999 }, { distance: 'invented' }]) assert.throws(() => validateSearch({ ...valid, ...change }));
});
test('uploaded data must be an image and visual-only search requires a reference', () => {
  assert.throws(() => validateSearch({ ...valid, images: ['file:///etc/passwd'] }));
  assert.throws(() => validateSearch({ ...valid, method: 'raw' }), /reference image/);
  assert.throws(() => validateSearch({ ...valid, referenceIds: ['not-indexed'] }), /no longer/);
});
test('metadata search never silently ignores reference images', () => {
  assert.throws(() => validateSearch({ ...valid, method: 'metadata', images: ['data:image/jpeg;base64,YQ=='] }), /CLIP/);
});
test('similarity metrics rank identical vectors ahead of orthogonal vectors', () => {
  const a = normalize([3, 0, 0]), b = normalize([0, 3, 0]);
  for (const metric of ['cosine', 'manhattan', 'euclidean']) { assert.equal(distance(a, a, metric), 0); assert.ok(distance(a, b, metric) > 0); }
  assert.deepEqual(average([a, a]), a); assert.throws(() => distance([1], [1, 2]), /Incompatible/);
});
test('museum downloads cannot target arbitrary hosts, local services, or credentials', () => {
  for (const url of ['http://images.metmuseum.org/a.jpg', 'https://127.0.0.1/a', 'https://images.metmuseum.org:123/a', 'https://user:secret@images.metmuseum.org/a', 'https://images.metmuseum.org.evil.example/a']) assert.throws(() => validateRemoteURL(url));
  assert.equal(validateRemoteURL('https://images.metmuseum.org/CRDImages/a.jpg').hostname, 'images.metmuseum.org');
});

test('new museum adapters exclude restricted and missing images and retain attribution', async () => {
  const { miaRecords, smkRecords } = await import('../server/sources.js');
  const mia = { id: 910, Cache_Location: '000000/900/10/910', Primary_RenditionNumber: 'mia_2005401.jpg', title: 'Dragon pendant', rights_type: 'Public Domain', image: 'valid', country: 'China', creditline: 'Museum gift' };
  const mapped = miaRecords([{ _source: mia }, { _source: { ...mia, rights_type: 'In Copyright' } }, { _source: { ...mia, image: 'invalid' } }]);
  assert.equal(mapped.length, 1); assert.equal(mapped[0].culture, 'China'); assert.match(mapped[0].attribution, /Museum gift/); assert.match(mapped[0].imageUrl, /mia_2005401_800\.jpg$/);
  const smk = { object_number: 'KMS1', public_domain: true, has_image: true, image_thumbnail: 'https://iip-thumb.smk.dk/test.jpg', titles: [{ title: 'Flowers' }], rights: 'https://creativecommons.org/publicdomain/mark/1.0/' };
  const images = smkRecords([smk, { ...smk, public_domain: false }, { ...smk, image_thumbnail: '' }]);
  assert.equal(images.length, 1); assert.equal(images[0].title, 'Flowers'); assert.match(images[0].attribution, /SMK/);
});

test('Japanese catalog requires an explicit rights marker and download permission; missing dates stay empty', async () => {
  const { parseJapanRecord } = await import('../server/asian-sources.js');
  const html = '<img src="../img/licences/rs/NoC-CR.svg"><a class="dl_button" data-edaban="1"></a><img src="../jpeg/mid/momat/test.jpg"><table><tr><td class="det1">Artist</td></tr><tr><td class="det_title">Landscape</td></tr><tr><td class="det1">&nbsp;</td></tr><tr><td class="det1"></td></tr><tr><td class="det1">Ink on silk</td></tr><tr><td class="det1">The National Museum of Modern Art, Tokyo</td></tr></table>';
  const item = parseJapanRecord(html, '123'); assert.equal(item.date, ''); assert.equal(item.medium, 'Ink on silk'); assert.match(item.attribution, /resized and recompressed/);
  assert.equal(parseJapanRecord(html.replace('NoC-CR', 'InC'), '123'), null);
  assert.equal(parseJapanRecord(html.replace('dl_button', 'ordinary'), '123'), null);
});
test('Asian catalog-only entries cannot be mistaken for working search adapters', async () => {
  const { searchSource } = await import('../server/sources.js');
  for (const id of ['palace_beijing', 'national_china', 'shanghai', 'tomuco', 'ekoku', 'sema']) await assert.rejects(searchSource(id, 'dragon', 1));
});
