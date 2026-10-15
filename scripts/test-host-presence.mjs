// Live integration against a local server and its configured Redis. Creates one
// owned test room, never logs credentials, and removes its records afterwards.
import nextEnv from '@next/env';
import {Redis} from '@upstash/redis';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const redis=Redis.fromEnv(),site=process.env.HOST_TEST_SITE||'http://127.0.0.1:3102';
const players=Array.from({length:3},(_,i)=>({pid:`presence-test-${i}-${randomUUID()}`,nickname:`Recovery test ${i}`,token:''}));
let code='';
async function request(path,body,status=200){const response=await fetch(site+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});assert.equal(response.status,status,`${path} status`);return response.json();}
async function state(){const response=await fetch(`${site}/api/store?key=${encodeURIComponent(`gifbattle:room:${code}`)}`);const data=await response.json();return data?.value?JSON.parse(data.value):null;}
async function presence(player,action,expectedHost,status=200){return request('/api/room/host-presence',{code,pid:player.pid,token:player.token,action,expectedHost},status);}
try{
 const created=await request('/api/room/create',players[0]);code=created.code;players[0].token=created.token;
 for(const player of players.slice(1)){const joined=await request('/api/room/join',{...player,code});player.token=joined.token;}
 await presence(players[0],'heartbeat');
 const ttl=await redis.ttl(`gifbattle:room:${code}`);assert.ok(ttl>1700&&ttl<=1800,'lobby heartbeat renews the room lease');
 const before=await state();
 assert.equal((await presence(players[1],'claim',players[0].pid)).migrated,false,'a healthy host cannot be replaced');
 await redis.set(`gifbattle:hb:${code}`,JSON.stringify({pid:players[0].pid,ts:Date.now()-121000}),{ex:240});
 const claims=await Promise.all(players.slice(1).map(player=>presence(player,'claim',players[0].pid)));
 assert.equal(claims.filter(result=>result.migrated).length,1,'only one simultaneous claim wins');
 const current=await state(),winner=players.find(player=>player.pid===current.host);assert.ok(winner&&winner!==players[0]);
 await presence(players[0],'heartbeat',undefined,403);
 const saved=await request('/api/room/state',{code,pid:players[0].pid,token:players[0].token,state:JSON.stringify(before)});
 assert.equal(saved.state.host,winner.pid,'an old snapshot cannot restore the frozen host');
 await request('/api/room/leave',{code,pid:players[0].pid,token:players[0].token});
 const left=await request('/api/room/leave',{code,pid:winner.pid,token:winner.token});assert.equal(left.hostChanged,true);
 const last=players.find(player=>player!==winner&&player!==players[0]);assert.equal((await state()).host,last.pid);
 const closed=await request('/api/room/leave',{code,pid:last.pid,token:last.token});assert.equal(closed.roomClosed,true);
 assert.equal(await redis.get(`gifbattle:room:${code}`),null);assert.equal(await redis.get(`gifbattle:hb:${code}`),null);
 console.log('Live Redis/API checks passed: healthy host, single atomic takeover, stale-host protection, immediate leave transfer, last-player room deletion.');
}finally{
 if(code)await redis.del(`gifbattle:room:${code}`,`gifbattle:hb:${code}`,`gifbattle:hb-missing:${code}`,`gifbattle:gemini:${code}`,...players.map(player=>`gifbattle:ptoken:${code}:${player.pid}`));
}
