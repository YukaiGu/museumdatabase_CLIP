import test from 'node:test';
import assert from 'node:assert/strict';
import {licensedImage,candidatesFromBindings,collectionQuery,searchContemporary} from '../server/contemporary.js';
const value=value=>({value});
const row={item:value('http://www.wikidata.org/entity/Q123'),itemLabel:value('A Blue Sculpture'),creatorLabel:value('Artist'),date:value('2001-01-01T00:00:00Z'),typeLabel:value('sculpture'),image:value('http://commons.wikimedia.org/wiki/Special:FilePath/Blue%20sculpture.jpg')};
const info={mime:'image/jpeg',thumburl:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Blue_sculpture.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Blue_sculpture.jpg',extmetadata:{LicenseShortName:value('CC BY-SA 4.0'),LicenseUrl:value('https://creativecommons.org/licenses/by-sa/4.0/'),Artist:value('<b>Photographer</b>'),Credit:value('Own work'),Restrictions:value('')}};
test('image licensing excludes NC/ND, unlicensed files, mismatched license URLs, and foreign hosts',()=>{
 assert.equal(licensedImage(info).license,'CC BY-SA 4.0');
 for(const license of ['CC BY-NC 4.0','CC BY-ND 4.0','In copyright',''])assert.equal(licensedImage({...info,extmetadata:{...info.extmetadata,LicenseShortName:value(license)}}),null);
 assert.equal(licensedImage({...info,thumburl:'https://example.com/image.jpg'}),null);
 assert.equal(licensedImage({...info,extmetadata:{...info.extmetadata,LicenseUrl:value('https://example.com')}}),null);
 assert.equal(licensedImage({...info,extmetadata:{...info.extmetadata,Restrictions:value('permission required')}}),null);
 assert.equal(licensedImage({...info,mime:'application/pdf'}),null);
 assert.equal(licensedImage({...info,extmetadata:{LicenseShortName:value('Public domain'),Copyrighted:value('True')}}),null);
});
test('candidate parsing deduplicates works and rejects unrelated image hosts',()=>{
 assert.equal(candidatesFromBindings([row,row]).length,1);
 assert.deepEqual(candidatesFromBindings([{...row,image:value('https://example.com/a.jpg')}]),[]);
 assert.equal(candidatesFromBindings([row])[0].filename,'File:Blue sculpture.jpg');
 assert.throws(()=>collectionQuery('arbitrary'),/Unknown/);
 assert.match(collectionQuery('moma'),/wdt:P195 wd:Q188740/);
 assert.doesNotMatch(collectionQuery('moma'),/wdt:P276/);
});
test('full adapter retains attribution and supports visual-search records without exposing unlicensed images',async()=>{
 let calls=0;
 const request=async(url)=>{calls++;return url.hostname==='query.wikidata.org'?{results:{bindings:[row]}}:{query:{pages:{1:{title:'File:Blue sculpture.jpg',imageinfo:[info]}}}};};
 const result=await searchContemporary('tate','blue',5,request);
 assert.equal(calls,2);assert.equal(result.records.length,1);const r=result.records[0];
 assert.equal(r.source,'tate');assert.ok(r.imageUrl);assert.equal(r.metadataOnly,undefined);assert.match(r.rights,/CC BY-SA/);assert.match(r.attribution,/Photographer/);assert.match(r.attribution,/Resized and recompressed/);assert.match(r.attribution,/same license/);assert.equal(r.sourceLinkLabel,'Artwork data on Wikidata');
 assert.equal((await searchContemporary('tate','no match',5,request)).records.length,0);
});

import {remote} from '../server/remote.js';
test('Wikimedia 429 honors cooldown instead of sending queued requests repeatedly',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('Slow down',{status:429,headers:{'Retry-After':'120'}});};
 try {
  await assert.rejects(remote('https://commons.wikimedia.org/w/api.php'),/429/);
  await assert.rejects(remote('https://upload.wikimedia.org/wikipedia/commons/a/ab/file.jpg'),/rate limiting/);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});


test('license filtering scans beyond the former first 50 candidate cutoff', async()=>{
 const rows=Array.from({length:60},(_,i)=>({...row,item:value(`http://www.wikidata.org/entity/Q${1000+i}`),image:value(`http://commons.wikimedia.org/wiki/Special:FilePath/Work${i}.jpg`)}));
 const result=await searchContemporary('moma','',1,async url=>{
  if(url.hostname==='query.wikidata.org')return {results:{bindings:rows}};
  return {query:{pages:Object.fromEntries(url.searchParams.get('titles').split('|').map((title,i)=>[i,{title,imageinfo:title==='File:Work55.jpg'?[info]:[]}]))}};
 });
 assert.equal(result.records.length,1);
 assert.equal(result.records[0].sourceId,'Q1055');
});
