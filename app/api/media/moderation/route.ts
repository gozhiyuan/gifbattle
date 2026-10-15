import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { contributionRedis as redis, contributionQueue, contributionKey, getContribution, isMediaAdmin, saveContribution } from '@/lib/media/contribution-storage';
export const dynamic = 'force-dynamic';
const response = (body: any, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: NextRequest) {
  if (!isMediaAdmin(request.headers.get('authorization'))) return response({ error: 'forbidden' }, 403);
  try {
    const offset = Number(request.nextUrl.searchParams.get('offset') || 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return response({ error: 'invalid_offset' }, 400);
    const ids = await redis.zrange<string[]>(contributionQueue, offset, offset + 49);
    const records = (await Promise.all(ids.map(getContribution))).filter(Boolean);
    return response({ records, nextOffset: ids.length === 50 ? offset + 50 : null });
  } catch { return response({ error: 'moderation_unavailable' }, 503); }
}
export async function POST(request: NextRequest) {
  if (!isMediaAdmin(request.headers.get('authorization'))) return response({ error: 'forbidden' }, 403);
  let lockedId: string | undefined;
  try {
    const text = await request.text(); if (text.length > 2048) return response({ error: 'invalid_request' }, 400);
    const body = JSON.parse(text);
    if (!/^[a-f0-9]{32}$/.test(body.id) || !['approve', 'reject'].includes(body.action)) return response({ error: 'invalid_request' }, 400);
    if (!await redis.set(`gifbattle:contribution-lock:${body.id}`, 'moderating', { nx: true, ex: 120 })) return response({ error: 'try_again' }, 409);
    lockedId = body.id;
    const record = await getContribution(body.id);
    if (!record?.url) return response({ error: 'not_found' }, 404);
    if (body.action === 'reject') {
      // Delete the copied image first; keep the queue record on Blob failure for retry.
      await del(record.url);
      const tx = redis.multi(); tx.set(contributionKey(body.id), { id: body.id, status: 'rejected' }); tx.zrem(contributionQueue, body.id); await tx.exec();
    } else await saveContribution({ ...record, status: 'approved' });
    return response({ ok: true });
  } catch { return response({ error: 'moderation_unavailable' }, 503); }
  finally { if (lockedId) await redis.del(`gifbattle:contribution-lock:${lockedId}`).catch(() => {}); }
}
