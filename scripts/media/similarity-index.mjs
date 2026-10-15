import {catalogPath} from './catalog-store.mjs';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fingerprint,sceneSimilarity} from './similarity.mjs';
import {inferDetail,sceneText} from '../../lib/media/stock-diversity.cjs';
import {inferSubject} from '../../lib/media/stock-subjects.cjs';
import {safeHttps} from '../../lib/media/catalog-schema.cjs';
async function save(path,data){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(data,null,2)+'\n');await rename(path+'.tmp',path);}
export async function readCatalogImage(asset,workspace){
 const url=asset.previewUrl||asset.url;
 if(/^\/media\/[a-zA-Z0-9/_-]+\.(webp|gif|png|jpe?g)$/.test(url))return readFile(resolve(workspace,'public',url.slice(1)));
 if(!safeHttps(url)||!new URL(url).hostname.endsWith('.public.blob.vercel-storage.com'))throw new Error('Catalog audit only reads local media or published Blob previews');
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok||!/^image\/(jpeg|png|webp|gif)(;|$)/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw new Error('Catalog preview unavailable');}
 let length=0;const chunks=[];
 for await(const chunk of response.body){length+=chunk.length;if(length>2*1024*1024)throw new Error('Catalog preview exceeds 2 MB');chunks.push(chunk);}
 return Buffer.concat(chunks);
}
export async function catalogReferences(workspace,{read=readCatalogImage}={}){
 const assets=JSON.parse(await readFile(catalogPath(workspace),'utf8')).assets;
 const path=resolve(workspace,'media-work/catalog-fingerprints.json');let cache={version:1,assets:{}};
 try{cache=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(cache.version!==1||!cache.assets)throw new Error('Unsupported catalog fingerprint cache');
 const references=[];
 for(const asset of assets){
  const imageKey=asset.previewUrl||asset.url;let record=cache.assets[asset.id];
  if(record?.imageKey!==imageKey||record.fingerprint?.version!==1){record={imageKey,fingerprint:await fingerprint(await read(asset,workspace))};cache.assets[asset.id]=record;await save(path,cache);}
  references.push({id:asset.id,fingerprint:record.fingerprint,creator:asset.creator,subject:inferSubject(asset),detail:inferDetail(asset,inferSubject(asset)),scene:sceneText(asset)});
 }
 return references;
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function auditCatalog(workspace){
 const catalog=JSON.parse(await readFile(catalogPath(workspace),'utf8'));
 const refs=await catalogReferences(workspace),pairs=[];
 let distinctPairs=[];try{distinctPairs=JSON.parse(await readFile(resolve(workspace,'lib/media/stock-exclusions.json'),'utf8')).distinctPairs||[];}catch(e){if(e.code!=='ENOENT')throw e;}
 for(let i=0;i<refs.length;i++)for(let j=i+1;j<refs.length;j++){const match=sceneSimilarity(refs[i].fingerprint,refs[j].fingerprint,{creator:refs[i].creator,referenceCreator:refs[j].creator,subject:refs[i].subject,referenceSubject:refs[j].subject});if(match){const reviewed=distinctPairs.find(pair=>[pair.a,pair.b].includes(refs[i].id)&&[pair.a,pair.b].includes(refs[j].id));pairs.push({a:refs[i].id,b:refs[j].id,...match,...(reviewed?{reviewStatus:'distinct',reviewReason:reviewed.reason}:{reviewStatus:'pending'})});}}
 const report={version:1,checkedAt:new Date().toISOString(),assets:refs.length,pairs,policy:'Exact matches are duplicates; near and similar-scene matches need visual review. No files or catalog entries are deleted.'};
 await save(resolve(workspace,'media-work/catalog-similarity.json'),report);
 const byId=new Map(catalog.assets.map(a=>[a.id,a]));
 const image=a=>/^\/media\//.test(a.previewUrl)?'../public'+a.previewUrl:a.previewUrl;
 await writeFile(resolve(workspace,'media-work/catalog-similarity.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>Catalog similarity review</title><style>body{font:16px system-ui;margin:24px;background:#f5f5f8}section{background:white;padding:16px;margin:16px 0}.pair{display:flex;gap:24px;flex-wrap:wrap}figure{margin:0;width:320px}img{width:320px;height:240px;object-fit:contain}figcaption{overflow-wrap:anywhere}</style><h1>${pairs.length} visually similar pairs in ${refs.length} templates</h1><p>${escape(report.policy)}</p>${pairs.map(pair=>`<section><h2>${escape(pair.kind)} · ${escape(pair.reviewStatus)} · hash distance ${pair.distance}</h2><div class="pair">${[pair.a,pair.b].map(id=>{const a=byId.get(id);return `<figure><img loading="lazy" src="${escape(image(a))}" alt="${escape(a.title)}"><figcaption>${escape(a.title)}<br>${escape(id)}<br><a href="${escape(a.sourceUrl)}" target="_blank" rel="noreferrer">Source</a></figcaption></figure>`;}).join('')}</div></section>`).join('')}</html>`);
 console.log(`Audited ${refs.length} published templates: ${pairs.filter(p=>p.kind==='exact').length} exact, ${pairs.filter(p=>p.kind!=='exact'&&p.reviewStatus!=='distinct').length} unreviewed near-duplicate pairs; ${pairs.filter(p=>p.reviewStatus==='distinct').length} reviewed distinct pairs. Report: media-work/catalog-similarity.html`);
 return report;
}
