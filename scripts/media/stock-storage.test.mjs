import {test} from 'node:test';import assert from 'node:assert/strict';import {storeStock} from './stock-storage.mjs';
const bytes=Buffer.from('image bytes'),path='stock/one-hash.webp',url='https://store.public.blob.vercel-storage.com/'+path;
const dependencies={put:async()=>{throw Error('Blob already exists');},head:async()=>({pathname:path,size:bytes.length,contentType:'image/webp',url}),fetcher:async()=>new Response(bytes)};
test('interrupted stock uploads reuse only matching immutable bytes',async()=>{
 assert.equal(await storeStock(path,bytes,dependencies),url);
 await assert.rejects(storeStock(path,bytes,{...dependencies,fetcher:async()=>new Response(Buffer.from('wrong bytes'))}),/different content/);
 await assert.rejects(storeStock(path,bytes,{...dependencies,head:async()=>({pathname:path,size:1,contentType:'image/webp',url})}),/does not match/);
 await assert.rejects(storeStock(path,bytes,{...dependencies,put:async()=>{throw Error('Unauthorized');}}),/Unauthorized/);
});
