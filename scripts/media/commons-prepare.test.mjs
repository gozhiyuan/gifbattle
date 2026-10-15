import {test} from 'node:test';import assert from 'node:assert/strict';
import {repairCommonsMetadata} from './commons-metadata.mjs';
import {prioritizeCommons} from './commons-priority.mjs';
import {buildCommonsQueues} from './commons-prepare.mjs';
import {queuedCandidates} from './archive-runner.mjs';
import {normalizeSafety,SAFETY_CATEGORIES} from '../../lib/media/safety-policy.cjs';
const safe=normalizeSafety({safeForChildren:true,safeForWork:true,checks:Object.fromEntries(SAFETY_CATEGORIES.map(k=>[k,'clear']))});
const c=(id,category='Humor photos')=>({id,source:'commons',sourceUrl:`https://commons.wikimedia.org/wiki/File:${id}.jpg`,title:'Funny photo',description:'A strange situation',creator:'Creator',attribution:{label:'Creator · CC BY 4.0',url:`https://commons.wikimedia.org/wiki/File:${id}.jpg`},license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',downloadUrl:'https://upload.wikimedia.org/'+id+'.jpg',mime:'image/jpeg',width:1000,height:800,humorSource:{category:'Category:'+category}});
test('Commons metadata repairs exact CC evidence without inventing public-domain links or credits',()=>{
 assert.equal(repairCommonsMetadata({...c('a'),licenseUrl:''}).licenseUrl,'https://creativecommons.org/licenses/by/4.0/');
 assert.equal(repairCommonsMetadata({...c('a'),license:''}).license,'CC BY 4.0');
 assert.equal(repairCommonsMetadata({...c('a'),license:'Public domain',licenseUrl:''}).licenseUrl,'');
 assert.equal(repairCommonsMetadata({...c('a'),creator:''}).creator,'');
 assert.equal(repairCommonsMetadata({...c('a'),license:'CC BY-SA 4.0'}).metadataConflict,'license_name_url_conflict');
 assert.equal(repairCommonsMetadata(c('a')).metadataRecovery,undefined);
});
test('Commons priorities favor photos/interactions and rotate categories ahead of art and common pets',()=>{
 const ordered=prioritizeCommons([c('art','Caricatures'),c('cat','Humorous cats'),c('a','Humor photos'),c('b','Humor photos'),c('c','Forced perspectives')]);
 assert.deepEqual(ordered.map(c=>c.id),['c','a','b','cat','art']);
});
test('Commons queues reuse assessments, preserve risk holds, and remove already published and exact duplicates before model calls',()=>{
 const scored={...c('scored'),aiSuggestions:{safety:safe,reactionScore:90,title:'A funny situation',description:'An unusual situation',tags:['funny'],categories:['awkward'],primarySubject:'situations',subjectDetail:'social',captionable:true,captionLayout:'bottom',riskFlags:[]}};
 const duplicate={...c('duplicate'),visualFingerprint:{exactHash:'same'}},live={...c('live'),visualFingerprint:{exactHash:'same'}};
 const result=buildCommonsQueues({candidates:[c('pending'),c('scored'),duplicate,c('live'),{...c('bad'),title:'Taxidermy scene'}, {...c('no-credit'),creator:''}]},{archived:[scored,duplicate],catalog:{assets:[live]}});
 assert.deepEqual(result.screening.map(c=>c.id),['pending']);assert.deepEqual(result.publication.map(c=>c.id),['scored']);assert.equal(result.summary.reusedAssessments,1);
 assert.equal(result.holds.find(c=>c.id==='duplicate').reason,'exact_duplicate');assert.equal(result.holds.find(c=>c.id==='bad').reason,'family_metadata_hold');assert.equal(result.holds.find(c=>c.id==='no-credit').reason,'metadata_hold');
});
test('execution follows the saved queue and skips completed assessments before applying the batch limit',()=>{
 const rows=new Map([['first',c('first')],['done',{...c('done'),aiSuggestions:{safety:safe}}],['next',c('next')]]),archive={get:id=>rows.get(id)};
 assert.deepEqual(queuedCandidates(archive,['done','next','first'],1).map(c=>c.id),['next']);assert.throws(()=>queuedCandidates(archive,['missing'],1),/missing from archive/);
});

test('license inference does not trust credentialed or non-HTTPS source URLs',()=>{
 assert.equal(repairCommonsMetadata({...c('a'),license:'',licenseUrl:'ftp://creativecommons.org/licenses/by/4.0/'}).license,'');
 assert.equal(repairCommonsMetadata({...c('a'),license:'',licenseUrl:'https://user:password@creativecommons.org/licenses/by/4.0/'}).license,'');
});
