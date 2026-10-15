import sharp, { OverlayOptions } from 'sharp';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LocalAsset } from './catalog';
import { captionLines, escapeXml } from './meme-layout';

// Keep font discovery and caches self-contained on serverless hosts.
process.env.FONTCONFIG_FILE ||= resolve(process.cwd(), 'public/fonts/fonts.conf');
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
  // Explicit font files work in serverless environments with no system fonts.
  const overlays: OverlayOptions[] = [];
  for (const line of captionLines(info.width, info.height, captions, template.captionLayout)) {
    const stroke = Math.ceil(line.strokeWidth);
    const glyph = await sharp({ text: { text: `<span foreground="white">${escapeXml(line.text)}</span>`,
      font: `Noto Sans Bold ${line.fontSize}`, fontfile: resolve(process.cwd(), 'public/fonts/NotoSans-Bold.ttf'), rgba: true, dpi: 72 } })
      .png().toBuffer({ resolveWithObject: true });
    const padded = await sharp(glyph.data).extend({ top: stroke, bottom: stroke, left: stroke, right: stroke, background: '#00000000' }).png().toBuffer();
    const alpha = await sharp(padded).extractChannel('alpha').png().toBuffer();
    // libvips morphology treats dark pixels as foreground: erode expands the white alpha mask.
    const mask = await sharp(alpha).erode(stroke).toBuffer();
    const width = glyph.info.width + stroke * 2, height = glyph.info.height + stroke * 2;
    const outline = await sharp({ create: { width, height, channels: 3, background: 'black' } })
      .joinChannel(mask).png().toBuffer();
    const outlined = await sharp(outline).composite([{ input: padded }]).png().toBuffer();
    overlays.push({ input: outlined, left: Math.max(0, Math.round((info.width - width) / 2)),
      top: Math.max(0, Math.round(line.y - glyph.info.height - stroke)) });
  }
  const image = await sharp(data).composite(overlays).webp({ quality: 85 }).toBuffer();
  return { image, width: info.width, height: info.height };
}
