import {Redis} from '@upstash/redis';
import {NextRequest,NextResponse} from 'next/server';
import {isValidRoomPlayerToken,LOBBY_ROOM_TTL_SECS,ACTIVE_ROOM_TTL_SECS} from '@/lib/room-security';
import {HOST_PRESENCE_SCRIPT} from '@/lib/host-presence';
const redis=Redis.fromEnv();
export async function POST(request:NextRequest){
 let body;try{body=await request.json();}catch{return NextResponse.json({error:'invalid_request'},{status:400});}
 if(!body||typeof body.code!=='string'||!/^[A-Z0-9]{6}$/.test(body.code)||typeof body.pid!=='string'||!body.pid||body.pid.length>100||typeof body.token!=='string'||!body.token||body.token.length>200||!['heartbeat','claim'].includes(body.action)||body.action==='claim'&&(typeof body.expectedHost!=='string'||!body.expectedHost||body.expectedHost.length>100))return NextResponse.json({error:'invalid_request'},{status:400});
 try{
  if(!await isValidRoomPlayerToken(body.code,body.pid,body.token))return NextResponse.json({error:'forbidden'},{status:403});
  const status=await redis.eval<(string | number)[], string>(HOST_PRESENCE_SCRIPT,[`gifbattle:room:${body.code}`,`gifbattle:hb:${body.code}`,`gifbattle:hb-missing:${body.code}`],[body.action,body.pid,body.expectedHost||'',Date.now(),LOBBY_ROOM_TTL_SECS,ACTIVE_ROOM_TTL_SECS]);
  if(status==='MISSING')return NextResponse.json({error:'room_not_found'},{status:404});
  if(status==='FORBIDDEN')return NextResponse.json({error:'forbidden'},{status:403});
  return NextResponse.json({ok:true,migrated:status==='CLAIMED'});
 }catch{return NextResponse.json({error:'presence_unavailable'},{status:503});}
}
