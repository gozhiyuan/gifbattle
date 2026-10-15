import {open,readFile,unlink,mkdir,stat} from 'node:fs/promises';
import {dirname} from 'node:path';import {randomUUID} from 'node:crypto';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function withProcessLock(path,operation,{timeoutMs=300000}={}){
 await mkdir(dirname(path),{recursive:true});const token=randomUUID(),started=Date.now();
 while(true){
  try{const handle=await open(path,'wx');try{await handle.writeFile(JSON.stringify({pid:process.pid,token}));}finally{await handle.close();}break;}
  catch(error){if(error.code!=='EEXIST')throw error;let stale=false;
   try{const owner=JSON.parse(await readFile(path,'utf8'));try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH')stale=true;}}
   catch(e){if(e.code==='ENOENT')continue;try{stale=Date.now()-(await stat(path)).mtimeMs>300000;}catch{continue;}}
   if(stale){await unlink(path).catch(e=>{if(e.code!=='ENOENT')throw e;});continue;}
   if(Date.now()-started>timeoutMs)throw new Error('Source lock wait timed out; checkpoint and resume later');await pause(50);
  }
 }
 try{return await operation();}finally{try{const owner=JSON.parse(await readFile(path,'utf8'));if(owner.token===token)await unlink(path);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
