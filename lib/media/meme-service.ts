import { LocalAsset } from './catalog';
import { normalizeCaptions } from './meme-layout';
export class MemeRequestError extends Error {
  constructor(public code: string, public status: number, public retryAfter?: number) { super(code); }
}
export interface MemeDependencies {
  getRoom: (code: string) => Promise<{ phase?: string; submitDeadline?: number; players?: { id: string }[] } | null>;
  validToken: (code: string, pid: string, token: string) => Promise<boolean>;
  findTemplate: (id: string) => LocalAsset | undefined;
  storageConfigured: () => boolean;
  rateLimit: (code: string) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  render: (template: LocalAsset, captions: string[]) => Promise<{ image: Buffer; width: number; height: number }>;
  upload: (path: string, bytes: Buffer) => Promise<string>;
  track: (code: string, gameId: number, url: string, receipt: { pid: string; templateId: string; captions: string[] }) => Promise<void>;
  remove: (url: string) => Promise<void>;
}
export async function createMeme(body: any, deps: MemeDependencies) {
  if (!body || typeof body.code !== 'string' || !/^[A-Z0-9]{6}$/.test(body.code) || typeof body.pid !== 'string' ||
    !body.pid || body.pid.length > 100 || typeof body.token !== 'string' || !body.token || body.token.length > 200 ||
    typeof body.templateId !== 'string' || body.templateId.length > 100 || !Number.isSafeInteger(body.gameId)) throw new MemeRequestError('invalid_request', 400);
  const room = await deps.getRoom(body.code);
  const isPlayer = (state: typeof room) => state?.players?.some(player => player.id === body.pid);
  if (!isPlayer(room) || !await deps.validToken(body.code, body.pid, body.token)) throw new MemeRequestError('forbidden', 403);
  const isOpen = (state: typeof room) => state?.phase === 'submitting' && state.submitDeadline === body.gameId && state.submitDeadline > Date.now();
  if (!isOpen(room)) throw new MemeRequestError('round_closed', 409);
  const template = deps.findTemplate(body.templateId);
  if (!template || !template.captionable || template.format !== 'image') throw new MemeRequestError('invalid_template', 400);
  let captions: string[];
  try { captions = normalizeCaptions(body.captions, template.captionLayout, template.captionMaxLength); }
  catch { throw new MemeRequestError('invalid_captions', 400); }
  if (!deps.storageConfigured()) throw new MemeRequestError('storage_not_configured', 503);
  const limit = await deps.rateLimit(body.code);
  if (!limit.allowed) throw new MemeRequestError('rate_limited', 429, limit.retryAfterSec);
  const rendered = await deps.render(template, captions);
  const fresh = await deps.getRoom(body.code);
  if (!isOpen(fresh) || !isPlayer(fresh)) throw new MemeRequestError('round_closed', 409);
  const url = await deps.upload(`memes/${body.code}/${body.gameId}/${crypto.randomUUID()}.webp`, rendered.image);
  try { await deps.track(body.code, body.gameId, url, { pid: body.pid, templateId: template.id, captions }); }
  catch (error) { await deps.remove(url).catch(() => {}); throw error; }
  return { url, templateId: template.id, captions, width: rendered.width, height: rendered.height,
    attribution: { ...template.attribution, label: `${template.attribution.label} · captions added by player` },
    license: { label: template.license, url: template.licenseUrl } };
}
