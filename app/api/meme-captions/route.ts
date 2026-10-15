import { NextRequest, NextResponse } from 'next/server';
import { getRoomState, isRoomPlayer, isValidRoomPlayerToken, getRoomGeminiKey, checkRoomRateLimit } from '@/lib/room-security';
import { findTemplate } from '@/lib/media/catalog-server';
import { readTemplateImage } from '@/lib/media/render-meme';
import { suggestCaptions } from '@/lib/media/caption-suggestions';
import sharp from 'sharp';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  let body;
  try {
    const text = await request.text(); if (text.length > 4096) throw new Error(); body = JSON.parse(text);
    if (!body || typeof body.code !== 'string' || !/^[A-Z0-9]{6}$/.test(body.code) || typeof body.pid !== 'string' || body.pid.length > 100 || typeof body.token !== 'string' || body.token.length > 200 || typeof body.templateId !== 'string' || body.templateId.length > 100 || !Number.isSafeInteger(body.gameId) || !Number.isInteger(body.roundIndex) || body.roundIndex < 0) throw new Error();
  } catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }); }
  try {
    const room = await getRoomState(body.code);
    if (!isRoomPlayer(room, body.pid) || !await isValidRoomPlayerToken(body.code, body.pid, body.token)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const prompt = room.prompts?.[body.roundIndex];
    if (room.phase !== 'submitting' || room.submitDeadline !== body.gameId || room.submitDeadline <= Date.now() || !prompt || (room.roundPlan?.length && !room.roundPlan[body.roundIndex]?.participants?.includes(body.pid))) return NextResponse.json({ error: 'round_closed' }, { status: 409 });
    const template = findTemplate(body.templateId);
    if (!template) return NextResponse.json({ error: 'invalid_template' }, { status: 400 });
    const key = await getRoomGeminiKey(body.code);
    if (!key) return NextResponse.json({ error: 'ai_not_configured' }, { status: 400 });
    const limit = await checkRoomRateLimit(body.code, 'caption');
    if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    const image = await sharp(await readTemplateImage(template)).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
    return NextResponse.json({ suggestions: await suggestCaptions(template, prompt, key, image) });
  } catch { return NextResponse.json({ error: 'caption_suggestions_unavailable' }, { status: 503 }); }
}
