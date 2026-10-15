import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import fixture from '../public/media/catalog.json';
import type {LocalAsset} from '../lib/media/catalog';
import {createCatalogLoader,CatalogRevisionExpired} from '../lib/media/catalog-loader';
import {searchCatalog} from '../lib/media/catalog-search';
import {catalogSeed} from '../lib/media/catalog-seed';
import {decodeCatalogCursor,encodeCatalogCursor,queryIdentity} from '../lib/media/catalog-cursor';
const asset={...(fixture.assets[0] as unknown as LocalAsset),url:'https://test.public.blob.vercel-storage.com/stock/cat.webp',previewUrl:'https://test.public.blob.vercel-storage.com/stock/cat-preview.webp'};
function snapshot(count:number){const catalog={version:1 as const,assets:Array.from({length:count},(_,i)=>({...asset,id:`asset-${i}`}))};const bytes=Buffer.from(JSON.stringify(catalog)),revision=createHash('sha256').update(bytes).digest('hex');return {catalog,bytes,pointer:{revision,url:`https://test.public.blob.vercel-storage.com/stock/catalog/${revision}.json`,count,publishedAt:new Date().toISOString()}};}
test('live catalogs refresh without a build and old revisions remain available for pagination',async()=>{
 const one=snapshot(50),two=snapshot(51);let current=one.pointer,now=0,calls=0;const revisions=new Map([one,two].map(s=>[s.pointer.revision,s]));
 const load=createCatalogLoader({pointer:async revision=>revision?revisions.get(revision)?.pointer||null:current,now:()=>now,fetcher:async url=>{calls++;const snap=[one,two].find(s=>s.pointer.url===url)!;return new Response(snap.bytes);}});
 expect((await load()).catalog.assets).toHaveLength(50);current=two.pointer;now=16000;
 expect((await load()).catalog.assets).toHaveLength(51);expect((await load({revision:one.pointer.revision})).catalog.assets).toHaveLength(50);expect(calls).toBe(2);
 await expect(load({revision:'a'.repeat(64)})).rejects.toBeInstanceOf(CatalogRevisionExpired);
});
test('catalog loading validates trusted paths/checksums and keeps a bounded last-good fallback',async()=>{
 const one=snapshot(1);let now=0,broken=false;
 const load=createCatalogLoader({now:()=>now,pointer:async()=>{if(broken)throw Error('Redis down');return one.pointer;},fetcher:async()=>new Response(one.bytes)});
 expect((await load()).catalog.assets).toHaveLength(1);broken=true;now=16000;expect((await load()).catalog.assets).toHaveLength(1);now=301000;await expect(load()).rejects.toThrow();
 const invalid=createCatalogLoader({pointer:async()=>({...one.pointer,url:'https://example.com/catalog.json'}),fetcher:async()=>{throw Error('Must not fetch');}});await expect(invalid()).rejects.toThrow();
 const corrupt=createCatalogLoader({pointer:async()=>one.pointer,fetcher:async()=>new Response('{}')});await expect(corrupt()).rejects.toThrow();
});
test('shuffle is stable per player/question, differs across contexts, and keeps pagination unique',()=>{
 const catalog=snapshot(100).catalog,seed=catalogSeed('ROOM:player:game:question');
 const first=searchCatalog(catalog,{query:'',pageSize:24,seed});const again=searchCatalog(catalog,{query:'',pageSize:24,seed});expect(first.items).toEqual(again.items);
 const second=searchCatalog(catalog,{query:'',pageSize:24,seed,cursor:first.nextCursor});expect(new Set([...first.items,...second.items].map(a=>a.id)).size).toBe(48);
 const other=searchCatalog(catalog,{query:'',pageSize:24,seed:catalogSeed('ROOM:another-player:game:question')});expect(other.items.map(a=>a.id)).not.toEqual(first.items.map(a=>a.id));
});
test('search relevance precedes shuffle and cursors bind the snapshot and filter identity',()=>{
 const catalog=snapshot(10).catalog;catalog.assets[9]={...catalog.assets[9],title:'Office meltdown',tags:['office','meltdown'],description:'An office meltdown'};
 const result=searchCatalog(catalog,{query:'office meltdown',pageSize:2,seed:'one'});expect(result.items[0].providerId).toBe('asset-9');
 const f=queryIdentity({query:'office meltdown',category:'',captionable:true,pageSize:24}),c={v:1 as const,r:'a'.repeat(64),o:24,s:'one',f};expect(decodeCatalogCursor(encodeCatalogCursor(c))).toEqual(c);expect(()=>decodeCatalogCursor('not-json')).toThrow();
});
test('ten thousand templates stay server-side and return only a stable requested page',()=>{
 const catalog=snapshot(10000).catalog;
 const page=searchCatalog(catalog,{query:'',pageSize:24,seed:'large-library'});
 expect(page.total).toBe(10000);expect(page.items).toHaveLength(24);expect(page.nextCursor).toBe('24');
 expect(JSON.stringify(page).length).toBeLessThan(50000);
 expect(searchCatalog(catalog,{query:'',pageSize:24,seed:'large-library'})).toEqual(page);
});
