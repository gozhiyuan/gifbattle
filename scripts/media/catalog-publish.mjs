import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';import {resolve,dirname,basename} from 'node:path';import {createHash} from 'node:crypto';
import {budgetedPut} from './upload-budget.mjs';
import {Redis} from '@upstash/redis';import {put,head} from '@vercel/blob';
import {catalogPath,workingCatalogPath} from './catalog-store.mjs';import {storeStock} from './stock-storage.mjs';
import {CURRENT_KEY,REVISION_PREFIX,validPointer,validateLiveCatalog,MAX_CATALOG_BYTES} from '../../lib/media/live-catalog.cjs';
async function save(path,value){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(value,null,2)+'\n');await rename(path+'.tmp',path);}
async function readBounded(response){if(Number(response.headers.get('content-length'))>MAX_CATALOG_BYTES)throw Error('Catalog snapshot too large');let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>MAX_CATALOG_BYTES)throw Error('Catalog snapshot too large');chunks.push(chunk);}return Buffer.concat(chunks);}
export const CATALOG_SWAP_SCRIPT=`local old=redis.call('GET',KEYS[1]); local revision=''; if old then revision=cjson.decode(old).revision end; if revision~=ARGV[1] then return 0 end; if old then redis.call('SET',ARGV[3]..revision,old,'EX',604800) end; redis.call('SET',KEYS[2],ARGV[2],'EX',604800); redis.call('SET',KEYS[1],ARGV[2]); return 1;`;
export function runtimeCatalog(catalog){return {version:1,assets:catalog.assets.map(({visualFingerprint,...asset})=>asset)};}
export async function syncCatalog(workspace,{redis=Redis.fromEnv(),upload=budgetedPut(workspace,put),inspect=head,fetcher=fetch,allowRemovals=false}={}){
 const catalog=validateLiveCatalog(runtimeCatalog(JSON.parse(await readFile(catalogPath(workspace),'utf8'))));
 const bytes=Buffer.from(JSON.stringify(catalog));if(bytes.length>MAX_CATALOG_BYTES)throw Error('Live catalog exceeds the snapshot size limit');
 const revision=createHash('sha256').update(bytes).digest('hex'),current=await redis.get(CURRENT_KEY);
 if(current&& !validPointer(current))throw Error('Invalid current catalog pointer');
 if(current?.revision===revision){console.log(`Live catalog already current: ${catalog.assets.length} templates`);return current;}
 if(current&&!allowRemovals){
  const response=await fetcher(current.url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Could not compare the current catalog');
  const body=await readBounded(response);if(body.length>MAX_CATALOG_BYTES||createHash('sha256').update(body).digest('hex')!==current.revision)throw Error('Invalid current catalog snapshot');
  const old=validateLiveCatalog(JSON.parse(body.toString('utf8'))),ids=new Set(catalog.assets.map(a=>a.id));
  if(old.assets.some(a=>!ids.has(a.id)))throw Error('Publication would remove current stock; pull the latest catalog or explicitly allow reviewed removals');
 }
 const path=`stock/catalog/${revision}.json`;let url;
 try{url=(await upload(path,bytes,{access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:31536000})).url;}
 catch(error){if(!/already exists|precondition|overwrite/i.test(error.message||''))throw error;const existing=await inspect(path);if(!validPointer({revision,url:existing.url,count:catalog.assets.length}))throw Error('Existing snapshot has an invalid location');const response=await fetcher(existing.url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Snapshot verification failed');const content=await readBounded(response);if(content.length>MAX_CATALOG_BYTES||createHash('sha256').update(content).digest('hex')!==revision)throw Error('Snapshot verification failed');url=existing.url;}
 const pointer={revision,url,count:catalog.assets.length,publishedAt:new Date().toISOString()};if(!validPointer(pointer))throw Error('Uploaded catalog has an invalid location');
 const swapped=await redis.eval(CATALOG_SWAP_SCRIPT,[CURRENT_KEY,REVISION_PREFIX+revision],[current?.revision||'',JSON.stringify(pointer),REVISION_PREFIX]);if(Number(swapped)!==1)throw Error('Another publisher changed the live catalog; checkpoint saved, pull and retry');
 await save(resolve(workspace,'media-work/live-catalog.json'),pointer);console.log(`Live catalog published: ${pointer.count} templates, revision ${revision.slice(0,12)}`);return pointer;
}
export async function migrateCatalog(workspace){
 const original=JSON.parse(await readFile(catalogPath(workspace),'utf8'));const catalog=structuredClone(original);
 for(const asset of catalog.assets)for(const field of ['url','previewUrl'])if(asset[field].startsWith('/media/')){
  if(!/^\/media\/[a-zA-Z0-9_-]+\.webp$/.test(asset[field]))throw Error('Invalid local fixture path');
  const bytes=await readFile(resolve(workspace,'public',asset[field].slice(1)));asset[field]=await storeStock('stock/'+basename(asset[field]),bytes,{put:budgetedPut(workspace,put),head});
 }
 validateLiveCatalog(catalog);await save(workingCatalogPath(workspace),catalog);return syncCatalog(workspace);
}
export async function catalogCommand(command,options,workspace){
 if(command==='catalog-migrate')return migrateCatalog(workspace);
 if(command==='catalog-sync')return syncCatalog(workspace,{allowRemovals:options['allow-removals']==='true'});
 if(command==='catalog-pull'){
  const pointer=await Redis.fromEnv().get(CURRENT_KEY);if(!validPointer(pointer))throw Error('Live catalog not configured');const response=await fetch(pointer.url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Catalog download failed');const bytes=await readBounded(response);if(bytes.length>MAX_CATALOG_BYTES||createHash('sha256').update(bytes).digest('hex')!==pointer.revision)throw Error('Catalog checksum failed');
  const catalog=validateLiveCatalog(JSON.parse(bytes.toString('utf8')));await save(workingCatalogPath(workspace),catalog);console.log(`Pulled ${catalog.assets.length} live templates`);
 }
}
