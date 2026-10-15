export const LOBBY_HOST_STALE_MS=120000;
export const ACTIVE_HOST_STALE_MS=40000;
export const hostGraceMs=(phase?:string)=>phase==='lobby'?LOBBY_HOST_STALE_MS:ACTIVE_HOST_STALE_MS;
export function heartbeatIsFresh(value:any,host:string,now:number,phase?:string):boolean {
 return value?.pid===host&&Number.isFinite(value.ts)&&now-value.ts>=-5000&&now-value.ts<hostGraceMs(phase);
}
// Both heartbeat writes and claims check the current room inside Redis so an
// old host cannot renew its lease after another player has won a takeover.
export const HOST_PRESENCE_SCRIPT=`
local raw=redis.call('GET',KEYS[1])
if not raw then return 'MISSING' end
local ok,room=pcall(cjson.decode,raw)
if not ok then return 'MISSING' end
local member=false
for _,p in ipairs(room.players or {}) do if p.id==ARGV[2] then member=true end end
if not member then return 'FORBIDDEN' end
if room.phase=='game_over' then return 'ENDED' end
local now=tonumber(ARGV[4])
local grace=room.phase=='lobby' and 120000 or 40000
local ttl=room.phase=='lobby' and tonumber(ARGV[5]) or tonumber(ARGV[6])
if ARGV[1]=='heartbeat' then
 if room.host~=ARGV[2] then return 'FORBIDDEN' end
 redis.call('SET',KEYS[2],cjson.encode({pid=ARGV[2],ts=now}),'EX',math.ceil(grace/500))
 redis.call('DEL',KEYS[3])
 redis.call('EXPIRE',KEYS[1],ttl)
 return 'ALIVE'
end
if room.host~=ARGV[3] or room.host==ARGV[2] then return 'CHANGED' end
local last=nil
local hbRaw=redis.call('GET',KEYS[2])
if hbRaw then
 local valid,hb=pcall(cjson.decode,hbRaw)
 if valid and hb.pid==room.host and type(hb.ts)=='number' and hb.ts<=now+5000 then last=hb.ts end
end
if not last then
 last=room.hostSince or room.createdAt
 if type(last)~='number' then
  last=tonumber(redis.call('GET',KEYS[3]))
  if not last then last=now redis.call('SET',KEYS[3],tostring(now),'EX',ttl) end
 end
end
if now-last<grace then return 'ALIVE' end
room.host=ARGV[2]
room.hostSince=now
redis.call('SET',KEYS[1],cjson.encode(room),'EX',ttl)
redis.call('SET',KEYS[2],cjson.encode({pid=ARGV[2],ts=now}),'EX',math.ceil(grace/500))
redis.call('DEL',KEYS[3])
return 'CLAIMED'
`;
// Preserve the current host atomically when a client saves an older snapshot.
export const SAVE_ROOM_HOST_SCRIPT=`
local raw=redis.call('GET',KEYS[1])
if not raw then return '' end
local current=cjson.decode(raw)
local next=cjson.decode(ARGV[1])
local member=false
for _,p in ipairs(current.players or {}) do if p.id==ARGV[3] then member=true end end
if not member then return '!forbidden' end
if next.host~=current.host then next.players=current.players end
next.host=current.host
next.hostSince=current.hostSince
next.createdAt=current.createdAt
local saved=cjson.encode(next)
redis.call('SET',KEYS[1],saved,'EX',tonumber(ARGV[2]))
return saved
`;
