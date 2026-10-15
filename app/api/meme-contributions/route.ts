import { NextRequest, NextResponse } from 'next/server';
import { copy, del } from '@vercel/blob';
import { getRoomState, isRoomPlayer, isValidRoomPlayerToken, checkRoomRateLimit } from '@/lib/room-security';
import { findTemplate } from '@/lib/media/catalog-server';
import { contributeMeme, MemeReceipt } from '@/lib/media/contribution-service';
import { contributionRedis as redis, getContribution, saveContribution } from '@/lib/media/contribution-storage';
import { memeReceiptKey } from '@/lib/media/meme-storage';
import { MemeRequestError } from '@/lib/media/meme-service';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  let body;
  try { const text = await request.text(); if (text.length > 4096) throw new Error(); body = JSON.parse(text); }
  catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }); }
  try {
    const result = await contributeMeme(body, {
      authorized: async (code, pid, token, gameId) => {
        const room = await getRoomState(code);
        return isRoomPlayer(room, pid) && room.submitDeadline === gameId && await isValidRoomPlayerToken(code, pid, token);
      },
      receipt: url => redis.get<MemeReceipt>(memeReceiptKey(url)), template: findTemplate, existing: getContribution,
      lock: async id => Boolean(await redis.set(`gifbattle:contribution-lock:${id}`, 'locked', { nx: true, ex: 120 })),
      unlock: async id => { await redis.del(`gifbattle:contribution-lock:${id}`); },
      limit: async code => (await checkRoomRateLimit(code, 'contribution')).allowed,
      copy: async (url, path) => (await copy(url, path, { access: 'public', addRandomSuffix: false, allowOverwrite: false, contentType: 'image/webp' })).url,
      save: saveContribution, remove: del,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof MemeRequestError ? error.code : 'contribution_unavailable' }, { status: error instanceof MemeRequestError ? error.status : 503 });
  }
}
