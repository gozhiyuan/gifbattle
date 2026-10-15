import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LocalAsset } from './catalog';
import { captionSvg } from './meme-layout';
export async function readTemplateImage(template: LocalAsset) {
  let bytes: Buffer;
  if (template.url.startsWith('/media/')) bytes = await readFile(resolve(process.cwd(), `public${template.url}`));
  else {
    const url = new URL(template.url);
    // The endpoint fetches only approved Blob stock, never user-supplied URLs.
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.public.blob.vercel-storage.com') || !url.pathname.startsWith('/stock/')) throw new Error('Template must be hosted locally or in Blob stock');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Template is unavailable');
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of response.body as any) { size += chunk.length; if (size > 20 * 1024 * 1024) throw new Error('Template too large'); chunks.push(chunk); }
    bytes = Buffer.concat(chunks);
  }
  return bytes;
}
export async function renderMeme(template: LocalAsset, captions: string[]) {
  const bytes = await readTemplateImage(template);
  const { data, info } = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const overlay = Buffer.from(captionSvg(info.width, info.height, captions, template.captionLayout));
  const image = await sharp(data).composite([{ input: overlay }]).webp({ quality: 85 }).toBuffer();
  return { image, width: info.width, height: info.height };
}
