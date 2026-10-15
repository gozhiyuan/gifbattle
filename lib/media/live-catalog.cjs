const {validateCatalog}=require('./catalog-schema.cjs');
const {safetyPassed}=require('./safety-policy.cjs');
const CURRENT_KEY='gifbattle:stock:catalog:current',REVISION_PREFIX='gifbattle:stock:catalog:revision:';
const MAX_CATALOG_BYTES=32*1024*1024,MAX_ASSETS=20000;
function stockUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname.endsWith('.public.blob.vercel-storage.com')&&u.pathname.startsWith('/stock/');}catch{return false;}}
function validPointer(p){return p&&/^[a-f0-9]{64}$/.test(p.revision)&&Number.isInteger(p.count)&&p.count>=0&&p.count<=MAX_ASSETS&&stockUrl(p.url)&&new URL(p.url).pathname===`/stock/catalog/${p.revision}.json`;}
function validateLiveCatalog(value){const catalog=validateCatalog(value);if(catalog.assets.length>MAX_ASSETS)throw Error('Live catalog is too large');for(const a of catalog.assets)if(!stockUrl(a.url)||!stockUrl(a.previewUrl)||!safetyPassed(a))throw Error('Live stock requires approved safe Blob assets');return catalog;}
module.exports={CURRENT_KEY,REVISION_PREFIX,MAX_CATALOG_BYTES,MAX_ASSETS,stockUrl,validPointer,validateLiveCatalog};
