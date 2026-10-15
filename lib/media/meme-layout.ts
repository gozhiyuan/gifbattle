export type CaptionLayout = 'top-bottom' | 'bottom';
export type CaptionLine = { text: string; x: number; y: number; fontSize: number; strokeWidth: number };
export function normalizeCaptions(value: unknown, layout: CaptionLayout, limit: number): string[] {
  if (!Array.isArray(value) || value.length !== (layout === 'bottom' ? 1 : 2) || value.some(text => typeof text !== 'string')) throw new Error('Invalid captions');
  const captions = value.map(text => text.replace(/\s+/g, ' ').trim());
  if (!captions.some(Boolean) || captions.some(text => text.length > limit || /[\x00-\x08\x0e-\x1f]/.test(text))) throw new Error('Enter a caption within the template limit');
  return captions;
}
// Shared geometry for the browser Canvas preview and server text overlays.
export function captionLines(width: number, height: number, captions: string[], layout: CaptionLayout): CaptionLine[] {
  const padding = Math.min(width, height) * 0.04;
  const availableWidth = width - padding * 2;
  const wrap = (text: string, size: number) => {
    const lines: string[] = []; let line = '';
    // Conservative character widths keep long words and non-Latin text inside the image.
    const measure = (value: string) => Array.from(value).reduce((sum, character) => sum + size * (/[MW@#\u0080-\uffff]/u.test(character) ? 1 : 0.67), 0);
    for (const word of text.toUpperCase().split(' ').filter(Boolean)) {
      if (line && measure(`${line} ${word}`) > availableWidth) { lines.push(line); line = ''; }
      for (const character of word) {
        if (measure(line + character) > availableWidth && line) { lines.push(line); line = ''; }
        line += character;
      }
      line += ' ';
    }
    if (line.trim()) lines.push(line.trim());
    return lines.map(text => text.trim());
  };
  return captions.flatMap((text, index) => {
    if (!text.trim()) return [];
    let size = Math.min(width * 0.07, height * 0.12);
    let lines = wrap(text, size);
    while (lines.length * size * 1.2 > height * (captions.filter(text => text.trim()).length === 1 ? 0.48 : 0.34) && size > width * 0.012) { size *= 0.9; lines = wrap(text, size); }
    const bottom = layout === 'bottom' || index === 1;
    const startY = bottom ? height - padding - (lines.length - 1) * size * 1.2 - size * 0.2 : padding + size;
    return lines.map((text, row) => ({ text, x: width / 2, y: startY + row * size * 1.2, fontSize: size, strokeWidth: Math.max(1, size * 0.085) }));
  });
}
export const escapeXml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
export function captionSvg(width: number, height: number, captions: string[], layout: CaptionLayout) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${captionLines(width, height, captions, layout).map(line => `<text x="${line.x}" y="${line.y}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="${line.fontSize}" fill="white" stroke="black" stroke-width="${line.strokeWidth}" stroke-linejoin="round" paint-order="stroke">${escapeXml(line.text)}</text>`).join('')}</svg>`;
}
