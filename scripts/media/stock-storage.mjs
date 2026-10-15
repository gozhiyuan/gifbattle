import {createHash} from 'node:crypto';
// Deterministic content-hash paths make a partially completed upload resumable.
// Reuse an existing object only after checking the actual bytes, never overwrite it.
export async function storeStock(path,bytes,{put,head,fetcher=fetch}){
 try{return (await put(path,bytes,{access:'public',addRandomSuffix:false,contentType:'image/webp',allowOverwrite:false})).url;}
 catch(error){
  if(!/already exists|precondition|overwrite/i.test(error.message||''))throw error;
  const existing=await head(path);
  if(existing.pathname!==path||existing.size!==bytes.length||existing.contentType!=='image/webp'||!new URL(existing.url).hostname.endsWith('.public.blob.vercel-storage.com'))throw new Error('Existing stock object does not match the upload');
  const response=await fetcher(existing.url,{redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Could not verify the existing stock object');
  let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>bytes.length){throw new Error('Existing stock object exceeds the expected size');}chunks.push(chunk);}
  const hash=value=>createHash('sha256').update(value).digest('hex');
  if(hash(Buffer.concat(chunks))!==hash(bytes))throw new Error('Existing stock object has different content');
  return existing.url;
 }
}
