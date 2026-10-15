import { createHash } from 'node:crypto';
import { LocalAsset } from './catalog';
import { isManagedMemeUrl } from './meme-cleanup';
import { MemeRequestError } from './meme-service';
export const CONTRIBUTION_CONSENT = 'caption-sharing-v1';
export interface MemeReceipt { code: string; gameId: number; pid: string; templateId: string; captions: string[]; url: string }
export interface ContributionRecord {
  id: string; status: 'pending' | 'approved'; createdAt: number; consentVersion: string;
  url: string; template: LocalAsset; captions: string[];
}
export interface ContributionDependencies {
  authorized: (code: string, pid: string, token: string, gameId: number) => Promise<boolean>;
  receipt: (url: string) => Promise<MemeReceipt | null>;
  template: (id: string) => LocalAsset | undefined | Promise<LocalAsset | undefined>;
  existing: (id: string) => Promise<{ id: string; status: 'pending' | 'approved' | 'rejected' } | null>;
  lock: (id: string) => Promise<boolean>; unlock: (id: string) => Promise<void>;
  limit: (code: string) => Promise<boolean>;
  copy: (url: string, path: string) => Promise<string>;
  save: (record: ContributionRecord) => Promise<void>; remove: (url: string) => Promise<void>;
}
export async function contributeMeme(body: any, deps: ContributionDependencies) {
  if (!body || body.consent !== true || typeof body.code !== 'string' || !/^[A-Z0-9]{6}$/.test(body.code) ||
    typeof body.pid !== 'string' || body.pid.length > 100 || typeof body.token !== 'string' || body.token.length > 200 ||
    !Number.isSafeInteger(body.gameId) || typeof body.url !== 'string' || !isManagedMemeUrl(body.url)) throw new MemeRequestError('invalid_request', 400);
  if (!await deps.authorized(body.code, body.pid, body.token, body.gameId)) throw new MemeRequestError('forbidden', 403);
  const receipt = await deps.receipt(body.url);
  if (!receipt || receipt.code !== body.code || receipt.gameId !== body.gameId || receipt.pid !== body.pid || receipt.url !== body.url) throw new MemeRequestError('forbidden', 403);
  const template = await deps.template(receipt.templateId);
  if (!template) throw new MemeRequestError('invalid_template', 400);
  // Identity is tied to the server receipt, never client-provided text or source metadata.
  const id = createHash('sha256').update(body.url).digest('hex').slice(0, 32);
  const existing = await deps.existing(id);
  if (existing?.status === 'rejected') throw new MemeRequestError('contribution_rejected', 409);
  if (existing) return { id, status: existing.status };
  if (!await deps.limit(body.code)) throw new MemeRequestError('rate_limited', 429);
  if (!await deps.lock(id)) throw new MemeRequestError('try_again', 409);
  let url: string | undefined;
  try {
    const duplicate = await deps.existing(id);
    if (duplicate?.status === 'rejected') throw new MemeRequestError('contribution_rejected', 409);
    if (duplicate) return { id, status: duplicate.status };
    url = await deps.copy(receipt.url, `contributions/${id}.webp`);
    await deps.save({ id, status: 'pending', createdAt: Date.now(), consentVersion: CONTRIBUTION_CONSENT,
      url, template, captions: receipt.captions });
    return { id, status: 'pending' };
  } catch (error) { if (url) await deps.remove(url).catch(() => {}); throw error; }
  finally { await deps.unlock(id).catch(() => {}); }
}
