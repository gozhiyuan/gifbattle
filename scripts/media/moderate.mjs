import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { writeReview } from './library.mjs';
export async function moderationCommand(options, workspace) {
  const endpoint = new URL(options.action === 'stats' ? '/api/media/stats' : '/api/media/moderation', options.site || 'http://localhost:3000');
  if (!['https:', 'http:'].includes(endpoint.protocol) || (endpoint.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw new Error('Use HTTPS or localhost');
  const secret = process.env.MEDIA_ADMIN_SECRET;
  if (!secret || secret.length < 24) throw new Error('Set MEDIA_ADMIN_SECRET (at least 24 characters) locally and on the deployment');
  const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
  const action = options.action || 'list';
  if (['approve', 'reject'].includes(action)) {
    if (!/^[a-f0-9]{32}$/.test(options.id || '')) throw new Error('Use --id from the review list');
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ id: options.id, action }), redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Moderation failed (${response.status})`);
    console.log(`${action}: ${options.id}`); return;
  }
  if (!['list', 'export', 'stats'].includes(action)) throw new Error('Moderation action must be list, approve, reject, export or stats');
  endpoint.searchParams.set('offset', options.offset || '0');
  const response = await fetch(endpoint, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Review list unavailable (${response.status})`);
  const result = await response.json();
  const { records, nextOffset } = result;
  const out = resolve(workspace, options.out || 'media-work/contributions.json'); await mkdir(dirname(out), { recursive: true });
  if (action === 'stats') { await writeFile(out, JSON.stringify(result, null, 2)); console.log(`Saved usage counts and exposure rates to ${out}`); return; }
  if (action === 'list') {
    await writeFile(out, JSON.stringify({ records, nextOffset }, null, 2));
    await writeReview(`${out}.html`, records.map(r => ({ ...r.template, id: r.id, title: `${r.status}: ${r.captions.join(' / ')}`, thumbnailUrl: r.url })));
    console.log(`Saved ${records.length} review records. Next offset: ${nextOffset ?? 'none'}`); return;
  }
  const candidates = [];
  for (const record of records.filter(record => record.status === 'approved')) {
    const url = new URL(record.url);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.public.blob.vercel-storage.com') || !/^\/contributions\/[a-f0-9]{32}\.webp$/.test(url.pathname)) throw new Error('Invalid contribution image URL');
    const imageResponse = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!imageResponse.ok) throw new Error('Contribution download failed');
    const chunks = []; let size = 0;
    for await (const chunk of imageResponse.body) { size += chunk.length; if (size > 20 * 1024 * 1024) throw new Error('Contribution exceeds 20 MB'); chunks.push(chunk); }
    const localFile = resolve(dirname(out), `contribution-${record.id}.webp`); await writeFile(localFile, Buffer.concat(chunks));
    const { url: originalUrl, previewUrl, width, height, format, ...template } = record.template;
    candidates.push({ ...template, id: `contribution-${record.id}`, title: record.captions.join(' / ').slice(0, 160), localFile,
      captionable: false, reviewStatus: 'approved', creator: `${template.creator}; anonymous player captions`,
      attribution: { ...template.attribution, label: `${template.attribution.label} · anonymous player captions` },
      permissionRecord: `${template.permissionRecord}; player consent ${record.consentVersion}; moderation approval ${record.id}` });
  }
  await writeFile(out, JSON.stringify({ version: 1, candidates, nextOffset }, null, 2));
  console.log(`Exported ${candidates.length} approved contributions. Import this file into stock; next offset: ${nextOffset ?? 'none'}`);
}
