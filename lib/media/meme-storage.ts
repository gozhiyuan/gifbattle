import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { del } from '@vercel/blob';
import { deleteTrackedMemes } from './meme-cleanup';
const redis = Redis.fromEnv();
export const MEME_TTL_MS = 24 * 60 * 60 * 1000;
const expiryKey = 'gifbattle:memes:expiry';
export const roomMemeKey = (code: string, gameId: number) => `gifbattle:memes:${code}:${gameId}`;
export const memeReceiptKey = (url: string) => `gifbattle:meme-receipt:${createHash('sha256').update(url).digest('hex')}`;
export async function trackMeme(code: string, gameId: number, url: string, receipt: { pid: string; templateId: string; captions: string[] }) {
  const tx = redis.multi();
  tx.set(memeReceiptKey(url), { ...receipt, code, gameId, url }, { ex: 86400 });
  tx.sadd(roomMemeKey(code, gameId), url);
  tx.expire(roomMemeKey(code, gameId), 3 * 86400);
  // Persistent index survives room expiry and browser closure; remove entries only after Blob deletion.
  tx.zadd(expiryKey, { score: Date.now() + MEME_TTL_MS, member: url });
  await tx.exec();
}
export async function cleanupMemes(code?: string, gameId?: number) {
  const urls = code ? await redis.smembers<string[]>(roomMemeKey(code, gameId)) :
    await redis.zrange<string[]>(expiryKey, 0, Date.now(), { byScore: true, offset: 0, count: 1000 });
  const count = await deleteTrackedMemes(urls, del, safe => redis.zrem(expiryKey, ...safe));
  if (code) await redis.del(roomMemeKey(code, gameId));
  return count;
}
