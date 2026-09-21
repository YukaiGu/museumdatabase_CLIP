import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { textEmbedding, distance, MODEL_ID } from '../server/embeddings.js';
import { multilingualTextEmbedding, MULTILINGUAL_MODEL_ID } from '../server/multilingual.js';
import { dataDirectory } from '../server/hosting.js';
const groups = [
 ['landscape painting', '山水画', '風景画', '풍경화'],
 ['blue and white porcelain', '青花瓷', '染付', '청화백자'],
 ['a portrait of a person', '人物肖像', '人物の肖像', '인물 초상화'],
];
const index = JSON.parse(await readFile(`${dataDirectory}index-v1.json`, 'utf8')).records.filter(r => r.clipVersion === `${MODEL_ID}:q8:v1` && r.clip?.length === 512);
const rows=[]; const start=performance.now();
for(const queries of groups) {
 const baseline = await textEmbedding(queries[0]);
 const reference = index.map(r=>({id:r.id,d:distance(baseline,r.clip)})).sort((a,b)=>a.d-b.d).slice(0,10).map(r=>r.id);
 for (const [i,query] of queries.entries()) {
  const originalText = await textEmbedding(query);
  const originalTop = index.map(r=>({id:r.id,d:distance(originalText,r.clip)})).sort((a,b)=>a.d-b.d).slice(0,10);
  const t=performance.now(); const v=await multilingualTextEmbedding(query); const elapsed=performance.now()-t;
  if(v.length!==512||v.some(x=>!Number.isFinite(x)))throw new Error('Invalid embeddings');
  const ranked=index.map(r=>({id:r.id,title:r.title,source:r.source,d:distance(v,r.clip)})).sort((a,b)=>a.d-b.d).slice(0,10);
  rows.push({language:['en','zh','ja','ko'][i],query,latencyMs:Math.round(elapsed),cosineToEnglishCLIP:Number((1-distance(v,baseline)).toFixed(4)),originalClipCosineToEnglish:Number((1-distance(originalText,baseline)).toFixed(4)),originalClipTop10Overlap:originalTop.filter(r=>reference.includes(r.id)).length,top10OverlapWithEnglishCLIP:ranked.filter(r=>reference.includes(r.id)).length,top3:ranked.slice(0,3)});
  console.log(query,rows.at(-1).cosineToEnglishCLIP,`${Math.round(elapsed)} ms`);
 }
}
const report={model:MULTILINGUAL_MODEL_ID,imageModel:MODEL_ID,indexedImages:index.length,elapsedSeconds:(performance.now()-start)/1000,peakRssMB:process.resourceUsage().maxRSS/1024,limitations:'Smoke and ranking-consistency evaluation on the existing index, not a human-labeled retrieval-quality benchmark. First query includes multilingual model loading. Specialized terms may differ in meaning across languages.',rows};
await mkdir('research',{recursive:true}); await writeFile('research/multilingual-evaluation.json',JSON.stringify(report,null,2));
console.log(`Evaluated ${rows.length} queries against ${index.length} cached image vectors; report: research/multilingual-evaluation.json`);
