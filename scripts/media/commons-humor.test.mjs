import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {collectHumor,categoryPage} from './commons-humor.mjs';
const candidate=id=>({id,source:'commons',sourceUrl:`https://commons.wikimedia.org/wiki/File:${id}.jpg`,downloadUrl:`https://upload.wikimedia.org/${id}.jpg`,creator:'Creator',attribution:{label:'Creator · CC0'},license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',width:800,height:800,mime:'image/jpeg'});
test('humor collection follows subcategories, persists pagination, deduplicates and resumes without repeating completed pages',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gifbattle-humor-'));const path=join(dir,'c.json');const seen=[];
 const read=async(category,cursor)=>{seen.push([category,cursor]);if(category==='Category:Root'&&!cursor.gcmcontinue)return {candidates:[candidate('a')],subcategories:['Category:Child','Category:Root'],continuation:{gcmcontinue:'next'}};if(category==='Category:Root')return {candidates:[candidate('a'),candidate('b')],subcategories:[],continuation:null};return {candidates:[candidate('b'),candidate('c')],subcategories:['Category:Too deep'],continuation:null};};
 try{
  const first=await collectHumor({path,roots:['Category:Root'],limit:10,depth:1,maxRequests:1,delayMs:0,read,exclude:[candidate('a')]});assert.equal(first.candidates.length,0);assert.equal(first.collection.queue.length,2);
  const next=await collectHumor({path,roots:['Category:Root'],limit:10,depth:1,maxRequests:3,delayMs:0,read,exclude:[candidate('a')]});assert.deepEqual(next.candidates.map(c=>c.id),['b','c']);assert.equal(seen.length,3);assert.equal(next.collection.visited.includes('Category:Too deep'),false);assert.ok(next.candidates.every(c=>c.reviewStatus==='pending'&&c.categories.length===0&&c.humorSource.root==='Category:Root'));
  await collectHumor({path,roots:['Category:Root'],limit:10,depth:1,delayMs:0,read});assert.equal(seen.length,3);assert.equal(JSON.parse(await readFile(path,'utf8')).candidates.length,2);
 }finally{await rm(dir,{recursive:true});}
});
test('Commons 429 stops collection, retains queue, and requires an explicit retry',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gifbattle-humor-'));let calls=0;const path=join(dir,'c.json');const read=async()=>{calls++;throw Object.assign(new Error('Rate limited'),{httpStatus:429});};
 try{const settings={path,roots:['Category:Root'],limit:10,depth:1,maxRequests:3,delayMs:0,read};const d=await collectHumor(settings);assert.equal(d.collection.blockedReason,'rate_limited');assert.equal(d.collection.queue.length,1);await collectHumor(settings);assert.equal(calls,1);await collectHumor({...settings,retrySources:true});assert.equal(calls,2);}finally{await rm(dir,{recursive:true});}
});
test('category API uses bounded generator metadata and passes continuation tokens',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async url=>{assert.equal(url.searchParams.get('generator'),'categorymembers');assert.equal(url.searchParams.get('gcmtitle'),'Category:Humor photos');assert.equal(url.searchParams.get('gcmcontinue'),'next');assert.equal(url.searchParams.get('gcmlimit'),'10');return Response.json({query:{pages:{1:{ns:14,title:'Category:Child'},2:{ns:6,title:'File:Funny.jpg',imageinfo:[{mime:'image/jpeg',url:'https://upload.wikimedia.org/f.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Funny.jpg',width:800,height:800,extmetadata:{Artist:{value:'<b>Creator</b>'},LicenseShortName:{value:'CC0'},LicenseUrl:{value:'https://creativecommons.org/publicdomain/zero/1.0/'}}}]}}},continue:{gcmcontinue:'later',continue:'gcmcontinue||'}});};const result=await categoryPage('Category:Humor photos',{gcmcontinue:'next'},10);assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].creator,'Creator');assert.deepEqual(result.subcategories,['Category:Child']);assert.equal(result.continuation.gcmcontinue,'later');}finally{globalThis.fetch=original;}
});

test('subcategory continuation is followed while marking completed files to avoid replay',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async url=>{assert.equal(url.searchParams.get('cmtype'),'subcat');return Response.json({query:{categorymembers:[{ns:14,title:'Category:Child'}],pages:{}},continue:{cmcontinue:'more-subcategories',continue:'cmcontinue||'}});};const result=await categoryPage('Category:Humor');assert.deepEqual(result.subcategories,['Category:Child']);assert.equal(result.continuation.filesDone,true);assert.equal(result.continuation.cmcontinue,'more-subcategories');}finally{globalThis.fetch=original;}
});

test('continuing only subcategories omits the completed file generator',async()=>{const original=globalThis.fetch;try{globalThis.fetch=async url=>{assert.equal(url.searchParams.has('generator'),false);assert.equal(url.searchParams.get('cmcontinue'),'next');return Response.json({query:{categorymembers:[{ns:14,title:'Category:More'}]}});};const result=await categoryPage('Category:Humor',{filesDone:true,cmcontinue:'next'});assert.equal(result.continuation,null);assert.deepEqual(result.candidates,[]);assert.deepEqual(result.subcategories,['Category:More']);}finally{globalThis.fetch=original;}});

test('automatic cooldown retry keeps the same category and respects the query attempt limit',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'humor-auto-'));let calls=0;const original=Date.now;let now=1000;Date.now=()=>now;
 try{const result=await collectHumor({path:join(dir,'c.json'),roots:['Category:Root'],limit:10,depth:0,maxRequests:2,delayMs:0,autoResume:true,sleep:async ms=>{now+=ms;},read:async()=>{calls++;if(calls===1)throw Object.assign(Error('Rate limited'),{httpStatus:429,retryAfterMs:2000});return {candidates:[candidate('a')],subcategories:[],continuation:null};}});assert.equal(calls,2);assert.equal(result.candidates.length,1);assert.equal(result.collection.blockedReason,undefined);assert.equal(now,3000);}finally{Date.now=original;await rm(dir,{recursive:true});}
});

test('automatic resume also recovers a transient connection failure',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'humor-network-'));let calls=0;const original=Date.now;let now=1000;Date.now=()=>now;
 try{const result=await collectHumor({path:join(dir,'c.json'),roots:['Category:Root'],limit:10,depth:0,maxRequests:2,delayMs:0,autoResume:true,sleep:async ms=>{now+=ms;},read:async()=>{if(++calls===1)throw new TypeError('fetch failed');return {candidates:[candidate('a')],subcategories:[],continuation:null};}});assert.equal(result.candidates.length,1);assert.equal(result.collection.blockedReason,undefined);assert.equal(calls,2);}finally{Date.now=original;await rm(dir,{recursive:true});}
});

test('collection prioritizes photo categories and retains rejected source evidence for metadata audits',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'humor-audit-'));const seen=[];
 try{const result=await collectHumor({path:join(dir,'c.json'),roots:['Category:Caricatures','Category:Humor photos'],limit:10,depth:0,maxRequests:2,delayMs:0,read:async category=>{seen.push(category);return {candidates:[{...candidate(category.includes('photos')?'photo':'art'),licenseUrl:''}],subcategories:[],continuation:null};}});
 assert.deepEqual(seen,['Category:Humor photos','Category:Caricatures']);assert.equal(Object.keys(result.collection.rejectedCandidates).length,2);assert.equal(result.collection.rejectedCandidates.photo.candidate.sourceUrl,'https://commons.wikimedia.org/wiki/File:photo.jpg');assert.ok(result.collection.rejectedCandidates.photo.reasons.includes('missing_source_or_license_url'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
