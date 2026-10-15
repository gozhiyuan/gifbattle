import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {SAFETY_POLICY} from '../../lib/media/safety-policy.cjs';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class CandidateArchive {
 constructor(path){mkdirSync(dirname(path),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY,source_url TEXT UNIQUE NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS assessments(candidate_id TEXT NOT NULL REFERENCES candidates(id),hash TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(candidate_id,hash));
 CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,policy TEXT NOT NULL,max_calls INTEGER NOT NULL,max_cost INTEGER NOT NULL,unit_cost INTEGER NOT NULL,calls INTEGER NOT NULL DEFAULT 0,reserved_cost INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'active');
 CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES runs(id),candidate_id TEXT NOT NULL REFERENCES candidates(id),status TEXT NOT NULL,usage TEXT,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS review_events(candidate_id TEXT NOT NULL REFERENCES candidates(id),reviewer TEXT NOT NULL,note TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS discovery_tasks(cohort TEXT NOT NULL,task TEXT NOT NULL,status TEXT NOT NULL,PRIMARY KEY(cohort,task));
 CREATE TABLE IF NOT EXISTS worker_lock(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS attempts_candidate ON attempts(candidate_id);`);}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
 upsert(candidate){
  if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(candidate.id)||!candidate.sourceUrl)throw new Error('Archive candidate needs ID and source URL');
  const source=new URL(candidate.sourceUrl);if(source.protocol!=='https:'||source.username||source.password)throw new Error('Archive source URL must be HTTPS');source.hash='';
  return this.transaction(()=>{
   const row=this.db.prepare('SELECT id,data FROM candidates WHERE id=? OR source_url=?').get(candidate.id,source.href);
   const old=row?JSON.parse(row.data):{},id=row?.id||candidate.id;
   const incoming={...candidate};if(old.aiSuggestions?.safety?.policy===SAFETY_POLICY&&!incoming.aiSuggestions?.safety)delete incoming.aiSuggestions;
   const data={trainingRights:{status:'unreviewed'},...old,...incoming,id,curatorFlags:[...new Set([...(old.curatorFlags||[]),...(incoming.curatorFlags||[])])]};
   if(old.catalogAsset&&!incoming.catalogAsset)data.catalogAsset=old.catalogAsset;
   this.db.prepare('INSERT INTO candidates VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(id,source.href,JSON.stringify(data),new Date().toISOString());
   if(candidate.aiSuggestions)this.db.prepare('INSERT OR IGNORE INTO assessments VALUES(?,?,?,?)').run(id,sha(candidate.aiSuggestions),JSON.stringify(candidate.aiSuggestions),new Date().toISOString());return id;
  });
 }
 acquireLock(owner){return this.transaction(()=>{const lock=this.db.prepare('SELECT * FROM worker_lock WHERE id=1').get();if(lock&&lock.owner!==owner&&lock.expires_at>Date.now())return false;this.db.prepare('INSERT INTO worker_lock VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at').run(owner,Date.now()+180000);return true;});}
 heartbeat(owner){this.db.prepare('UPDATE worker_lock SET expires_at=? WHERE id=1 AND owner=?').run(Date.now()+180000,owner);}
 releaseLock(owner){this.db.prepare('DELETE FROM worker_lock WHERE id=1 AND owner=?').run(owner);}
 review(id,{reviewer,note,clearCuratorFlags=false,trainingRights}={}){if(!reviewer?.trim()||!note?.trim()||!['approved','rejected',undefined].includes(trainingRights))throw new Error('Review needs reviewer, note and valid training-rights decision');return this.transaction(()=>{const data=this.get(id);if(!data)throw new Error('Candidate not found');if(clearCuratorFlags)data.curatorFlags=[];if(trainingRights)data.trainingRights={status:trainingRights,reviewer,note,reviewedAt:new Date().toISOString()};this.db.prepare('UPDATE candidates SET data=?,updated_at=? WHERE id=?').run(JSON.stringify(data),new Date().toISOString(),id);this.db.prepare('INSERT INTO review_events VALUES(?,?,?,?,?)').run(id,reviewer,note,JSON.stringify({clearCuratorFlags,trainingRights}),new Date().toISOString());return data;});}
 getBySource(url){const row=this.db.prepare('SELECT data FROM candidates WHERE source_url=?').get(new URL(url).href);return row?JSON.parse(row.data):null;}
 get(id){const row=this.db.prepare('SELECT data FROM candidates WHERE id=?').get(id);return row?JSON.parse(row.data):null;}
 *entries(){for(const row of this.db.prepare('SELECT data FROM candidates ORDER BY id').iterate())yield JSON.parse(row.data);}
 createRun({id=randomUUID(),maxCalls=1000,maxUsd=5,costPerCall=0.01}={}){
  if(!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>100000||![maxUsd,costPerCall].every(v=>Number.isFinite(v)&&v>0)||maxUsd>1000||costPerCall<0.01)throw new Error('Invalid request/estimated-spend limits');
  this.db.prepare('INSERT INTO runs(id,policy,max_calls,max_cost,unit_cost) VALUES(?,?,?,?,?)').run(id,SAFETY_POLICY,maxCalls,Math.floor(maxUsd*1e6),Math.ceil(costPerCall*1e6));return id;
 }
 run(id){return this.db.prepare('SELECT * FROM runs WHERE id=?').get(id);}
 reserve(runId,candidateId){return this.transaction(()=>{const run=this.run(runId);if(!run||run.policy!==SAFETY_POLICY)throw new Error('Unknown run or stale policy');if(run.status!=='active'||run.calls>=run.max_calls||run.reserved_cost+run.unit_cost>run.max_cost)return null;
  const id=randomUUID();this.db.prepare('UPDATE runs SET calls=calls+1,reserved_cost=reserved_cost+unit_cost WHERE id=?').run(runId);this.db.prepare('INSERT INTO attempts VALUES(?,?,?,?,?,?)').run(id,runId,candidateId,'reserved',null,new Date().toISOString());return id;
 });}
 completeAttempt(id,status,usage={}){this.transaction(()=>{
 const attempt=this.db.prepare('SELECT * FROM attempts WHERE id=?').get(id);if(!attempt||attempt.status!=='reserved')throw new Error('Attempt already completed or missing');
 const run=this.run(attempt.run_id);this.db.prepare('UPDATE attempts SET status=?,usage=? WHERE id=?').run(status,JSON.stringify(usage),id);
 // Standard gemini-3.5-flash-lite rates checked against Google's pricing docs; thoughts are billed output.
 if(usage.model==='gemini-3.5-flash-lite' && Number.isInteger(usage.promptTokenCount) && Number.isInteger(usage.candidatesTokenCount)){
  const actual=Math.ceil(usage.promptTokenCount*0.30+(usage.candidatesTokenCount+(usage.thoughtsTokenCount||0))*2.50);
  this.db.prepare("UPDATE runs SET reserved_cost=reserved_cost+?,status=CASE WHEN reserved_cost+?>max_cost THEN 'budget_overrun' ELSE status END WHERE id=?").run(actual-run.unit_cost,actual-run.unit_cost,run.id);
 }
 });}
 pending(limit,{catalogOnly=false,cohort}={}){return this.db.prepare(`SELECT data FROM candidates WHERE COALESCE(json_extract(data,'$.aiSuggestions.safety.policy'),'')<>? AND json_extract(data,'$.source') IN ('commons','pexels','met','flickr') AND json_extract(data,'$.duplicateOf') IS NULL ${catalogOnly?"AND json_extract(data,'$.catalogAsset') IS NOT NULL":""} ${cohort?"AND json_extract(data,'$.archiveCohort')=?":""} ORDER BY CASE WHEN json_extract(data,'$.catalogAsset') IS NOT NULL THEN 0 ELSE 1 END,id LIMIT ?`).all(...[SAFETY_POLICY,...(cohort?[cohort]:[]),limit]).map(row=>JSON.parse(row.data));}
 finish(id,status){this.db.prepare('UPDATE runs SET status=? WHERE id=?').run(status,id);}
 stats(){return {candidates:this.db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n,assessments:this.db.prepare('SELECT COUNT(*) AS n FROM assessments').get().n,runs:this.db.prepare('SELECT id,policy,calls,max_calls,reserved_cost,max_cost,status FROM runs ORDER BY rowid DESC LIMIT 10').all()};}
 close(){this.db.close();}
}
