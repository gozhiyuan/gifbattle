import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getRoomState, isRoomPlayer, isValidRoomPlayerToken, checkRoomRateLimit } from '@/lib/room-security';
import { getCatalog } from '@/lib/media/catalog-server';
import { voteKey } from '@/lib/votes';
import { stockEventAssets } from '@/lib/media/stock-metrics';
const redis = Redis.fromEnv();

export async function POST(request: NextRequest) {
  let body;
  try {
    const text = await request.text(); if (text.length > 8192) throw new Error(); body = JSON.parse(text);
    if (!body || typeof body.code !== 'string' || !/^[A-Z0-9]{6}$/.test(body.code) || typeof body.pid !== 'string' || body.pid.length > 100 || typeof body.token !== 'string' || body.token.length > 200 ||
      !Number.isSafeInteger(body.gameId) || !Number.isInteger(body.roundIndex) || body.roundIndex < 0 || body.roundIndex > 100 ||
      !['exposed', 'selected', 'vote_exposed', 'voted'].includes(body.event) || !Array.isArray(body.assetIds) || body.assetIds.length > 48 || body.assetIds.some(id => typeof id !== 'string' || id.length > 100) ||
      (['vote_exposed', 'voted'].includes(body.event) && (!Number.isInteger(body.matchup) || body.matchup < 0))) throw new Error();
  } catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }); }
  try {
    const room = await getRoomState(body.code);
    if (!isRoomPlayer(room, body.pid) || room.submitDeadline !== body.gameId || !await isValidRoomPlayerToken(body.code, body.pid, body.token)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (!(await checkRoomRateLimit(body.code, 'media-event')).allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    const ids=new Set((await getCatalog()).catalog.assets.map(a=>a.id));
    if(body.assetIds.some(id=>!ids.has(id)))return NextResponse.json({error:'invalid_request'},{status:400});
    const vote = body.event === 'voted' ? await redis.get<string>(voteKey(body.code, body.gameId, body.roundIndex, body.matchup, body.pid)) : undefined;
    const assets = stockEventAssets(room, body.pid, body.roundIndex, body.matchup, body.event, body.assetIds, vote);
    for (const asset of new Set(assets)) {
      const identity = createHash('sha256').update(`${body.code}:${body.gameId}:${body.pid}:${body.roundIndex}:${['vote_exposed', 'voted'].includes(body.event) ? body.matchup : ''}:${asset}:${body.event}`).digest('hex');
      await redis.eval(`if redis.call('SET', KEYS[1], '1', 'EX', 86400, 'NX') then redis.call('HINCRBY', KEYS[2], ARGV[1], 1); redis.call('EXPIRE', KEYS[2], 7776000); return 1; end; return 0;`,
        [`gifbattle:stock-dedupe:${identity}`, `gifbattle:stock-metric:${asset}`], [body.event]);
    }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'metrics_unavailable' }, { status: 503 }); }
}
