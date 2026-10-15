import { Redis } from '@upstash/redis';
import { timingSafeEqual } from 'node:crypto';
import { ContributionRecord } from './contribution-service';
export const contributionRedis = Redis.fromEnv();
export const contributionKey = (id: string) => `gifbattle:contribution:${id}`;
export const contributionQueue = 'gifbattle:contributions';
export function isMediaAdmin(header: string | null) {
  const expected = process.env.MEDIA_ADMIN_SECRET;
  if (!expected || expected.length < 24) return false;
  const actual = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const left = Buffer.from(actual), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
export const getContribution = (id: string) => contributionRedis.get<ContributionRecord>(contributionKey(id));
export async function saveContribution(record: ContributionRecord) {
  const tx = contributionRedis.multi();
  tx.set(contributionKey(record.id), record);
  tx.zadd(contributionQueue, { score: record.createdAt, member: record.id });
  await tx.exec();
}
