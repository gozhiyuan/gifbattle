'use client';
import { CSSProperties, useEffect, useRef, useState } from 'react';
import { MediaResult } from '@/lib/media/types';
import { captionLines, normalizeCaptions } from '@/lib/media/meme-layout';
import { MediaCredit } from './media-credit';
export interface CreatedMeme {
  url: string; templateId: string; captions: string[]; width: number; height: number;
  attribution: MediaResult['attribution']; license: MediaResult['license'];
}
export function MemeEditor({ template, code, pid, gameId, roundIndex, token, onSubmit, styles, initialCaption = '', aiEnabled = true, caption, submitLabel = 'Submit Meme', onBusyChange }: {
  template: MediaResult; code: string; pid: string; gameId: number; roundIndex: number; token: string;
  onSubmit: (meme: CreatedMeme) => Promise<void>; styles: Record<string, CSSProperties>;
  onBusyChange?: (busy: boolean) => void;
  caption?: string; submitLabel?: string;
  initialCaption?: string; aiEnabled?: boolean;
}) {
  const layout = template.captionLayout || 'top-bottom';
  const [draftCaptions, setCaptions] = useState(layout === 'bottom' ? [initialCaption.slice(0, template.captionMaxLength || 120)] : ['', initialCaption.slice(0, template.captionMaxLength || 120)]);
  const captions = caption === undefined ? draftCaptions : layout === 'bottom' ? [caption] : ['', caption];
  useEffect(() => { setCreated(null); setError(''); }, [caption]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  const [error, setError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[][]>([]);
  const [share, setShare] = useState(false);
  const [sharedUrl, setSharedUrl] = useState('');
  const aiAbort = useRef<AbortController | null>(null);
  useEffect(() => () => aiAbort.current?.abort(), []);
  const [created, setCreated] = useState<CreatedMeme | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const limit = template.captionMaxLength || 120;
  const draw = (source: HTMLImageElement) => {
    const element = canvas.current; if (!element) return;
    const scale = Math.min(1, 1200 / source.naturalWidth, 1200 / source.naturalHeight);
    element.width = Math.round(source.naturalWidth * scale); element.height = Math.round(source.naturalHeight * scale);
    const context = element.getContext('2d'); if (!context) return;
    context.drawImage(source, 0, 0, element.width, element.height);
    context.textAlign = 'center'; context.lineJoin = 'round';
    captionLines(element.width, element.height, captions.map(text => text.replace(/\s+/g, ' ').trim()), layout).forEach(line => {
      context.font = `bold ${line.fontSize}px Arial, sans-serif`;
      context.lineWidth = line.strokeWidth; context.strokeStyle = 'black'; context.fillStyle = 'white';
      context.strokeText(line.text, line.x, line.y); context.fillText(line.text, line.x, line.y);
    });
  };
  useEffect(() => {
    let active = true;
    setReady(false); setError(''); image.current = null;
    const source = new Image(); source.crossOrigin = 'anonymous';
    source.onload = () => { if (active) { image.current = source; setReady(true); } };
    source.onerror = () => { if (active) setError('This template could not load. Choose another template.'); };
    source.src = template.displayUrl;
    return () => { active = false; };
  }, [template.displayUrl]);
  useEffect(() => { if (ready && image.current) draw(image.current); }, [ready, captions, layout]);
  let valid = false;
  try { normalizeCaptions(captions, layout, limit); valid = true; } catch {}
  return <div style={{ marginTop: 12 }}>
    {caption === undefined && <div style={{ fontSize: 14, marginBottom: 8, fontWeight: 700 }}>{template.title}</div>}
    {caption === undefined && captions.map((caption, index) => <label key={index} style={{ display: 'block', marginBottom: 8 }}>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{layout === 'bottom' || index === 1 ? 'Bottom caption' : 'Top caption'} · {caption.length}/{limit}</div>
      <textarea placeholder={layout === 'bottom' || index === 1 ? 'Bottom caption' : 'Top caption'} value={caption} maxLength={limit} disabled={busy}
        style={{ ...styles.inp, resize: 'vertical', marginBottom: 0 }} onChange={event => {
          setCaptions(previous => previous.map((text, i) => i === index ? event.target.value : text)); setCreated(null); setError('');
        }} />
    </label>)}
    {caption === undefined && <><button type="button" disabled={busy || aiBusy || !aiEnabled} style={{ ...styles.btn, ...styles.btnS, marginBottom: 8 }} onClick={async () => {
      aiAbort.current?.abort(); const controller = new AbortController(); aiAbort.current = controller;
      setAiBusy(true); setError(''); setSuggestions([]);
      try {
        const response = await fetch('/api/meme-captions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ code, pid, token, gameId, roundIndex, templateId: template.providerId }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error === 'ai_not_configured' ? 'The host needs to enable AI with a Gemini key in the lobby.' : data.error === 'round_closed' ? 'This submission round has ended.' : 'Caption suggestions are unavailable. You can still write your own.');
        const choices = Array.isArray(data.suggestions) ? data.suggestions.slice(0, 3).flatMap(value => {
          try { return [normalizeCaptions(value, layout, limit)]; } catch { return []; }
        }) : [];
        if (!choices.length) throw new Error('No suggestions available. Try again or write your own.');
        if (!controller.signal.aborted) setSuggestions(choices);
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Caption suggestions are unavailable.'); }
      finally { if (!controller.signal.aborted) setAiBusy(false); }
    }}>{aiBusy ? 'Thinking…' : 'Suggest captions with AI'}</button>
    {suggestions.map((choice, i) => <button type="button" key={i} disabled={busy} style={{ ...styles.btn, ...styles.btnS, marginBottom: 6 }} onClick={() => {
      setCaptions(choice); setCreated(null); setError('');
    }}>{choice.join(' / ')}</button>)}
    </>}
    {caption !== undefined && caption.length > limit && <div role="alert" style={styles.err}>Shorten your caption to {limit} characters to use this image. Your full text is preserved.</div>}
    <canvas ref={canvas} aria-label="Meme preview" role="img" style={{ display: ready ? 'block' : 'none', width: '100%', maxHeight: 380, objectFit: 'contain', borderRadius: 8 }} />
    {!ready && !error && <div style={styles.info}>Loading template…</div>}
    <MediaCredit attribution={template.attribution} license={template.license}/>
    <label style={{ display: 'block', fontSize: 12, marginTop: 12 }}>
      <input type="checkbox" checked={share} disabled={busy} onChange={event => setShare(event.target.checked)}/>{' '}
      Share this meme for the template collection. I created these captions and allow GIF Battles to keep, edit and share them under this image’s license.
    </label>
    <div style={{ fontSize: 11, marginTop: 4 }}>Sharing is optional. Reviewed contributions may remain public; unshared memes are temporary game files.</div>
    {error && <div role="alert" style={styles.err}>{error}</div>}
    <button disabled={busy || !ready || !valid} style={{ ...styles.btn, ...(valid ? styles.btnP : styles.btnS), marginTop: 12 }} onClick={async () => {
      if (busy || !valid) return;
      setBusy(true); setError('');
      try {
        let meme = created;
        if (!meme) {
          const response = await fetch('/api/memes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, pid, token, gameId, templateId: template.providerId, captions: normalizeCaptions(captions, layout, limit) }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error === 'storage_not_configured' ? 'Meme storage is unavailable. Your captions are still editable; please retry.' : data.error === 'round_closed' ? 'This submission round has ended.' : data.error === 'rate_limited' ? 'Too many meme submissions. Please wait and try again.' : 'Could not save the meme. Please try again.');
          meme = data; setCreated(meme);
        }
        if (share && sharedUrl !== meme.url) {
          const response = await fetch('/api/meme-contributions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, pid, token, gameId, url: meme.url, consent: true }) });
          if (!response.ok) throw new Error('Could not share for review. Retry, or uncheck sharing to submit only to this game.');
          setSharedUrl(meme.url);
        }
        await onSubmit(meme);
      } catch (error) { setError(error instanceof Error ? error.message : 'Could not submit the meme. Please try again.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Saving meme…' : submitLabel}</button>
  </div>;
}
