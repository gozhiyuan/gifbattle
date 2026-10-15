import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {syncCatalog,CATALOG_SWAP_SCRIPT} from './catalog-publish.mjs';
import {CURRENT_KEY} from '../../lib/media/live-catalog.cjs';
const fixture=JSON.parse(await readFile(new URL('../../public/media/catalog.json',import.meta.url),'utf8')).assets[0];
const asset={...fixture,url:'https://test.public.blob.vercel-storage.com/stock/cat.webp',previewUrl:'https://test.public.blob.vercel-storage.com/stock/cat-preview.webp'};
async function workspace(t,assets=[asset]){const dir=await mkdtemp(join(tmpdir(),'live-stock-'));t.after(()=>rm(dir,{recursive:true,force:true}));await mkdir(join(dir,'media-work'));await writeFile(join(dir,'media-work/catalog.json'),JSON.stringify({version:1,assets}));return dir;}
const pointer=bytes=>{const revision=createHash('sha256').update(bytes).digest('hex');return {revision,url:`https://test.public.blob.vercel-storage.com/stock/catalog/${revision}.json`,count:1};};
test('publication uploads a validated snapshot before atomically switching the Redis pointer',async t=>{
 const dir=await workspace(t),events=[];let saved;
 const p=await syncCatalog(dir,{redis:{get:async key=>{assert.equal(key,CURRENT_KEY);return null;},eval:async(script,keys,args)=>{assert.equal(script,CATALOG_SWAP_SCRIPT);assert.match(script,/604800/);assert.equal(args[0],'');saved=JSON.parse(args[1]);events.push('swap');return 1;}},upload:async(path,bytes)=>{events.push('upload');assert.equal(pointer(bytes).revision,path.split('/').pop().slice(0,-5));return {url:`https://test.public.blob.vercel-storage.com/${path}`};}});
 assert.deepEqual(events,['upload','swap']);assert.equal(saved.revision,p.revision);assert.equal(JSON.parse(await readFile(join(dir,'media-work/live-catalog.json'),'utf8')).count,1);
});
test('upload failures and concurrent publishers never overwrite the current pointer',async t=>{
 const dir=await workspace(t);let swaps=0;const redis={get:async()=>null,eval:async()=>{swaps++;return 0;}};
 await assert.rejects(syncCatalog(dir,{redis,upload:async()=>{throw Error('Blob unavailable');}}),/Blob unavailable/);assert.equal(swaps,0);
 await assert.rejects(syncCatalog(dir,{redis,upload:async path=>({url:`https://test.public.blob.vercel-storage.com/${path}`})}),/Another publisher/);assert.equal(swaps,1);
});
test('publication rejects local assets and accidental removal of existing live stock',async t=>{
 const dir=await workspace(t,[{...asset,url:'/media/cat.webp'}]);let network=0;
 await assert.rejects(syncCatalog(dir,{redis:{get:async()=>{network++;return null;}}}),/Blob assets/);assert.equal(network,0);
 const empty=await workspace(t,[]),bytes=Buffer.from(JSON.stringify({version:1,assets:[asset]}));
 await assert.rejects(syncCatalog(empty,{redis:{get:async()=>pointer(bytes)},fetcher:async()=>new Response(bytes),upload:async()=>{throw Error('Should not upload');}}),/would remove/);
});
