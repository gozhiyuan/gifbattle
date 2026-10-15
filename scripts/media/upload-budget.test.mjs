import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {configureUploadBudget,assertUploadBudget,uploadBudget,budgetedPut} from './upload-budget.mjs';
async function workspace(t){const dir=await mkdtemp(join(tmpdir(),'stock-budget-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
const config=()=>({periodStart:new Date(Date.now()-1000).toISOString(),periodEnd:new Date(Date.now()+86400000).toISOString(),quota:2000,used:1498,reserve:500});
test('unconfigured and expired budgets block uploads and reserve gameplay capacity',async t=>{
 const dir=await workspace(t);await assert.rejects(assertUploadBudget(dir,1),/not_configured/);
 const c=config();assert.equal((await configureUploadBudget(dir,c)).available,2);await assert.rejects(assertUploadBudget(dir,3),/need 3/);
 assert.equal((await uploadBudget(dir,Date.parse(c.periodEnd)+1)).available,0);
});
test('concurrent upload attempts consume the local allowance atomically, including failures',async t=>{
 const dir=await workspace(t);await configureUploadBudget(dir,config());let calls=0;
 const put=budgetedPut(dir,async(path,body,options)=>{calls++;assert.equal(process.env.VERCEL_BLOB_RETRIES,'0');assert.equal(options.multipart,false);throw Error('network failed');});
 const results=await Promise.allSettled([1,2,3].map(i=>put(`stock/${i}.webp`,Buffer.from('bytes'),{})));
 assert.equal(calls,2);assert.equal(results.filter(r=>r.status==='rejected').length,3);assert.equal((await uploadBudget(dir)).available,0);
 const reset={...config(),used:1498};await assert.rejects(configureUploadBudget(dir,reset),/cannot lower/);
});
