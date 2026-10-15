import fixture from '@/public/media/catalog.json';
import {Redis} from '@upstash/redis';
import {createHash} from 'node:crypto';
import {validateCatalog} from './catalog-schema.cjs';
import {safetyPassed} from './safety-policy.cjs';
import {LocalCatalog} from './catalog';
import {CURRENT_KEY,REVISION_PREFIX} from './live-catalog.cjs';
import {createCatalogLoader,CatalogPointer,CatalogRevisionExpired} from './catalog-loader';
const loadLive=createCatalogLoader({pointer:async revision=>{const redis=Redis.fromEnv();const pointer=await redis.get<CatalogPointer>(revision?REVISION_PREFIX+revision:CURRENT_KEY);if(pointer||!revision)return pointer;const current=await redis.get<CatalogPointer>(CURRENT_KEY);return current?.revision===revision?current:null;}});
export async function getCatalog(options:{revision?:string;force?:boolean}={}){
 if(process.env.MEDIA_CATALOG_SOURCE==='blob')return loadLive(options);
 if(process.env.VERCEL_ENV==='production')throw new Error('Production requires a live Blob catalog');
 const catalog=validateCatalog(fixture) as LocalCatalog;
 const revision=createHash('sha256').update(JSON.stringify(catalog)).digest('hex');if(options.revision&&options.revision!==revision)throw new CatalogRevisionExpired('Fixture version expired');
 return {revision,catalog:{...catalog,assets:catalog.assets.filter(safetyPassed)}};
}
export async function findTemplate(id:string){
 let snapshot=await getCatalog();let found=snapshot.catalog.assets.find(a=>a.id===id&&a.captionable&&a.format==='image');
 if(!found&&process.env.MEDIA_CATALOG_SOURCE==='blob'){snapshot=await getCatalog({force:true});found=snapshot.catalog.assets.find(a=>a.id===id&&a.captionable&&a.format==='image');}
 return found;
}
