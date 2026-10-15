import { NextRequest, NextResponse } from 'next/server';
import { getRoomState, isRoomHost, isValidRoomPlayerToken } from '@/lib/room-security';
import { cleanupMemes } from '@/lib/media/meme-storage';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
// Scheduled cleanup catches rooms that expire or are abandoned, including unsubmitted uploads.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try { return NextResponse.json({ deleted: await cleanupMemes() }); }
  catch { return NextResponse.json({ error: 'cleanup_failed' }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
    if (!body || typeof body.code !== 'string' || !/^[A-Z0-9]{6}$/.test(body.code) || typeof body.pid !== 'string' || typeof body.token !== 'string' || !Number.isSafeInteger(body.gameId)) throw new Error();
  } catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }); }
  try {
    const room = await getRoomState(body.code);
    if (!isRoomHost(room, body.pid) || !await isValidRoomPlayerToken(body.code, body.pid, body.token)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (room.phase !== 'game_over' || room.submitDeadline !== body.gameId) return NextResponse.json({ error: 'game_not_finished' }, { status: 409 });
    return NextResponse.json({ deleted: await cleanupMemes(body.code, body.gameId) });
  } catch { return NextResponse.json({ error: 'cleanup_failed' }, { status: 503 }); }
}
