import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {withProcessLock} from './process-lock.mjs';
export class UploadBudgetError extends Error {}
const location=workspace=>resolve(workspace,'media-work/upload-budget.json');
async function save(path,data){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(data,null,2)+'\n');await rename(path+'.tmp',path);}
export async function uploadBudget(workspace,now=Date.now()){
 let data;try{data=JSON.parse(await readFile(location(workspace),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {version:1,paused:true,available:0,reason:'not_configured'};}
 if(data.version!==1||![data.quota,data.baselineUsed,data.reservedForGameplay,data.attempted].every(n=>Number.isSafeInteger(n)&&n>=0))throw new UploadBudgetError('Invalid upload budget file');
 const valid=Date.parse(data.periodStart)<=now&&now<Date.parse(data.periodEnd);
 return {...data,available:!data.paused&&valid?Math.max(0,data.quota-data.baselineUsed-data.reservedForGameplay-data.attempted):0,reason:data.paused?'paused':!valid?'quota_window_expired':'configured'};
}
export async function assertUploadBudget(workspace,operations){
 if(!Number.isSafeInteger(operations)||operations<0)throw new UploadBudgetError('Invalid operation count');
 const budget=await uploadBudget(workspace);if(operations>budget.available)throw new UploadBudgetError(`Stock upload budget blocked (${budget.reason}): need ${operations}, available ${budget.available}. Configure a verified quota window and usage baseline with upload-budget.`);return budget;
}
export async function reserveUpload(workspace,path){
 return withProcessLock(location(workspace)+'.lock',async()=>{const b=await assertUploadBudget(workspace,1);const {available,reason,...data}=b;data.attempted++;data.lastAttempt={path,at:new Date().toISOString()};await save(location(workspace),data);});
}
export function budgetedPut(workspace,put){return async(path,body,options)=>{
 if(!path.startsWith('stock/')||options?.multipart)throw new UploadBudgetError('Budget supports ordinary stock uploads only');
 await reserveUpload(workspace,path);
 // The installed SDK defaults to ten hidden retries. Count each explicit attempt,
 // including failures, and leave retries to a later checkpointed invocation.
 process.env.VERCEL_BLOB_RETRIES='0';
 return put(path,body,{...options,multipart:false});
};}
export async function configureUploadBudget(workspace,{periodStart,periodEnd,quota=2000,used,reserve=500},now=Date.now()){
 if(![quota,used,reserve].every(n=>Number.isSafeInteger(n)&&n>=0)||quota<1||used>quota||reserve>quota||!(Date.parse(periodStart)<=now&&now<Date.parse(periodEnd))||Date.parse(periodEnd)-Date.parse(periodStart)>32*86400000)throw new UploadBudgetError('Use a current verified quota window, quota, observed used count, and gameplay reserve');
 return withProcessLock(location(workspace)+'.lock',async()=>{
  const old=await uploadBudget(workspace,now);
  if(old.periodStart&&Date.parse(periodStart)<Date.parse(old.periodEnd)&&used<(old.baselineUsed+old.attempted))throw new UploadBudgetError('Overlapping quota window cannot lower accounted usage');
  const data={version:1,periodStart:new Date(periodStart).toISOString(),periodEnd:new Date(periodEnd).toISOString(),quota,baselineUsed:used,reservedForGameplay:reserve,attempted:0,paused:false,configuredAt:new Date(now).toISOString()};await save(location(workspace),data);return uploadBudget(workspace,now);
 });
}
export async function budgetCommand(options,workspace){
 const action=options.action||'status';
 if(action==='configure')console.log(JSON.stringify(await configureUploadBudget(workspace,{periodStart:options['period-start'],periodEnd:options['period-end'],quota:Number(options.quota||2000),used:Number(options.used),reserve:Number(options.reserve??500)}),null,2));
 else if(action==='status')console.log(JSON.stringify(await uploadBudget(workspace),null,2));
 else throw new Error('Use upload-budget --action status|configure');
}
