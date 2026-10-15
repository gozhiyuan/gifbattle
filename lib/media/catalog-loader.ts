import {createHash} from 'node:crypto';
import {LocalCatalog} from './catalog';
import {validPointer,validateLiveCatalog,MAX_CATALOG_BYTES} from './live-catalog.cjs';
import {safetyPassed} from './safety-policy.cjs';
export type CatalogPointer={revision:string;url:string;count:number;publishedAt:string};
export type CatalogSnapshot={revision:string;catalog:LocalCatalog};
export class CatalogUnavailable extends Error {}
export class CatalogRevisionExpired extends Error {}
export function createCatalogLoader({pointer,fetcher=fetch,now=Date.now}: {
 pointer:(revision?:string)=>Promise<CatalogPointer|null>;fetcher?:typeof fetch;now?:()=>number;
}){
 const snapshots=new Map<string,CatalogSnapshot>();let current:CatalogSnapshot|undefined,checkedAt=0,inflight:Promise<CatalogSnapshot>|undefined;
 const fetchSnapshot=async(p:CatalogPointer)=>{
  if(!validPointer(p))throw new CatalogUnavailable('Invalid catalog pointer');
  if(snapshots.has(p.revision))return snapshots.get(p.revision)!;
  const response=await fetcher(p.url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok||Number(response.headers.get('content-length'))>MAX_CATALOG_BYTES)throw new CatalogUnavailable('Catalog download failed');
  let length=0;const chunks:Uint8Array[]=[];for await(const chunk of response.body as any){length+=chunk.length;if(length>MAX_CATALOG_BYTES)throw new CatalogUnavailable('Catalog is too large');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);if(createHash('sha256').update(bytes).digest('hex')!==p.revision)throw new CatalogUnavailable('Catalog checksum failed');
  const catalog=validateLiveCatalog(JSON.parse(bytes.toString('utf8'))) as LocalCatalog;
  if(catalog.assets.length!==p.count)throw new CatalogUnavailable('Catalog count mismatch');
  const snapshot={revision:p.revision,catalog:{...catalog,assets:catalog.assets.filter(safetyPassed)}};snapshots.set(p.revision,snapshot);
  while(snapshots.size>3)snapshots.delete(snapshots.keys().next().value!);return snapshot;
 };
 const load=async({revision,force=false}:{revision?:string;force?:boolean}={}):Promise<CatalogSnapshot>=>{
  if(revision){if(!/^[a-f0-9]{64}$/.test(revision))throw new CatalogRevisionExpired('Invalid catalog version');if(snapshots.has(revision))return snapshots.get(revision)!;const p=await pointer(revision);if(!p)throw new CatalogRevisionExpired('Catalog version expired');return fetchSnapshot(p);}
  if(current&&!force&&now()-checkedAt<15000)return current;
  if(inflight)return inflight;
  inflight=(async()=>{try{const p=await pointer();if(!p)throw new CatalogUnavailable('Catalog has not been published');const snapshot=await fetchSnapshot(p);current=snapshot;checkedAt=now();return snapshot;}catch(error){if(current&&now()-checkedAt<300000)return current;throw new CatalogUnavailable('Catalog temporarily unavailable');}finally{inflight=undefined;}})();return inflight;
 };
 return load;
}
