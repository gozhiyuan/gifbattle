import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { getRoomState, isValidRoomPlayerToken, checkRoomRateLimit } from '@/lib/room-security';
import { findTemplate } from '@/lib/media/catalog-server';
import { renderMeme } from '@/lib/media/render-meme';
import { trackMeme } from '@/lib/media/meme-storage';
import { createMeme, MemeRequestError } from '@/lib/media/meme-service';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  let body;
  try {
    const text = await request.text();
    if (text.length > 16384) return NextResponse.json({ error: 'invalid_request' }, { status: 413 });
    body = JSON.parse(text);
  } catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }); }
  try {
    const meme = await createMeme(body, {
      getRoom: getRoomState, validToken: isValidRoomPlayerToken, findTemplate,
      storageConfigured: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      rateLimit: code => checkRoomRateLimit(code, 'meme'), render: renderMeme,
      upload: async (path, image) => (await put(path, image,
        { access: 'public', addRandomSuffix: false, contentType: 'image/webp', cacheControlMaxAge: 60 })).url,
      track: trackMeme, remove: del,
    });
    return NextResponse.json(meme);
  } catch (error) {
    if (error instanceof MemeRequestError) return NextResponse.json({ error: error.code }, {
      status: error.status, ...(error.retryAfter ? { headers: { 'Retry-After': String(error.retryAfter) } } : {}) });
    console.error('meme_creation_failed', { error: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'meme_creation_failed' }, { status: 503 });
  }
}
