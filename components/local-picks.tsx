'use client';
import { useEffect, useState, useRef, CSSProperties, ReactNode } from 'react';
import { localProvider } from '@/lib/media/providers/local';
import { STOCK_CATEGORIES } from '@/lib/media/stock-categories.cjs';
import { PAGE_SIZE } from '@/lib/media/provider-config';
import { MediaResult } from '@/lib/media/types';
import { MediaCredit } from './media-credit';

export function LocalPicks({ onSubmit, colors, styles, captionableOnly = false, renderSelection, onExposure, onUnavailable, searchQuery, onSelect, selectedId, disabled = false }: {
  searchQuery?: string; onSelect?: (item: MediaResult) => void; selectedId?: string; disabled?: boolean;
  onSubmit: (item: MediaResult) => Promise<void>;
  captionableOnly?: boolean;
  onExposure?: (ids: string[]) => void;
  onUnavailable?: () => Promise<void>;
  renderSelection?: (item: MediaResult) => ReactNode;
  colors: { card2: string; text: string; muted: string; accent: string };
  styles: Record<string, CSSProperties>;
}) {
  const [internalQuery, setQuery] = useState('');
  const query = searchQuery ?? internalQuery;
  useEffect(() => { setCursor(undefined); }, [searchQuery]);
  const [category, setCategory] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [items, setItems] = useState<MediaResult[]>([]);

  const grid = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());
  const expose = useRef(onExposure); expose.current = onExposure;
  useEffect(() => {
    if (!grid.current || !expose.current) return;
    const pending = new Set<string>(); let timer: ReturnType<typeof setTimeout>;
    const flush = () => {
      const ids = [...pending]; pending.clear();
      for (let offset = 0; offset < ids.length; offset += 48) expose.current?.(ids.slice(offset, offset + 48));
    };
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const id = (entry.target as HTMLElement).dataset.asset;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && id && !seen.current.has(id)) {
          seen.current.add(id); pending.add(id); clearTimeout(timer); timer = setTimeout(flush, 250);
        }
      });
    }, { threshold: 0.5 });
    grid.current.querySelectorAll('[data-asset]').forEach(element => observer.observe(element));
    return () => { observer.disconnect(); clearTimeout(timer); flush(); };
  }, [items]);
  const [selected, setSelected] = useState<MediaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const unavailable = useRef(onUnavailable); unavailable.current = onUnavailable;
  const fallbackRequested = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    if (!cursor) setItems([]);
    const timer = setTimeout(() => {
      localProvider.search({ query, category, captionable: captionableOnly, pageSize: PAGE_SIZE, cursor,
        customerId: '', signal: controller.signal }).then(result => {
        if (controller.signal.aborted) return;
        setItems(previous => cursor ? [...previous, ...result.items] : result.items); setNextCursor(result.nextCursor);
        if (!query && !category && !cursor && !result.items.length && unavailable.current && !fallbackRequested.current) {
          fallbackRequested.current = true;
          void unavailable.current().catch(() => { fallbackRequested.current = false; setError('Could not enable written answers. Please retry.'); });
        }
      }).catch(error => {
        if (!controller.signal.aborted) setError(error.message || 'Templates are unavailable. Please try again.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [category, query, cursor, captionableOnly]);
  const choose = (value: string) => { setCategory(value); setCursor(undefined); };
  return <div>
    {searchQuery === undefined && <input style={styles.inp} placeholder={captionableOnly ? "Search meme templates" : "Search Our Picks"} value={query}
      onChange={event => { setQuery(event.target.value); setCursor(undefined); }} />}
    <div style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>{captionableOnly ? "Choose an image for your caption, or submit text only." : "Browse our collection of reaction images and animations."}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
      {['All', ...STOCK_CATEGORIES.map(category => category.label)].map(label => <button key={label} disabled={disabled} onClick={() => choose(label === 'All' ? '' : label.toLowerCase())}
        style={{ ...styles.btnSm, background: category === (label === 'All' ? '' : label.toLowerCase()) ? colors.accent : colors.card2, color: category === (label === 'All' ? '' : label.toLowerCase()) ? '#fff' : colors.text }}>{label}</button>)}
    </div>
    {error ? <div role="alert" style={styles.err}>{error}</div> : loading && !items.length ? <div style={styles.info}>Loading templates…</div> : !items.length ?
      <div style={styles.info}>{query || category ? 'No matching picks. Try another category or search.' : 'Meme templates are being prepared. You can still submit text only or generate an image with AI.'}</div> :
      <div ref={grid} style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
        {items.map(item => <button key={item.id} data-asset={item.providerId} aria-label={`Select ${item.title}`} aria-pressed={(selectedId ?? selected?.id) === item.id}
          disabled={disabled} onClick={() => { setSelected(item); onSelect?.(item); }} style={{ cursor: 'pointer', borderRadius: 8, padding: 4, background: colors.card2,
            color: colors.text, border: `2px solid ${(selectedId ?? selected?.id) === item.id ? colors.accent : 'transparent'}` }}>
          <img src={item.previewUrl} alt={item.title} loading="lazy" style={{ display: 'block', width: '100%', height: 90, objectFit: 'contain' }} />
          {!captionableOnly && <div style={{ fontSize: 11, marginTop: 4 }}>{item.title}{item.format === 'animation' ? ' · GIF' : ''}</div>}
        </button>)}
      </div>}
    {nextCursor && !loading && !error && <button style={{ ...styles.btn, ...styles.btnS }} onClick={() => setCursor(nextCursor)}>Load more picks</button>}
    {!onSelect && selected && (renderSelection ? renderSelection(selected) : <div style={{ textAlign: 'center', marginBottom: 12 }}>
      <img src={selected.displayUrl} alt={selected.title} style={{ maxWidth: '100%', height: 160, objectFit: 'contain', borderRadius: 8 }} />
      <MediaCredit attribution={selected.attribution} license={selected.license} />
    </div>)}
    {!onSelect && !renderSelection && <button disabled={!selected || submitting} style={{ ...styles.btn, ...(selected ? styles.btnP : styles.btnS) }} onClick={async () => {
      if (!selected || submitting) return;
      setSubmitting(true); setError('');
      try { await onSubmit(selected); } catch (error) { setError(error instanceof Error ? error.message : 'Submission failed. Please try again.'); }
      finally { setSubmitting(false); }
    }}>{submitting ? 'Submitting…' : selected ? 'Submit Pick' : 'Select a pick first'}</button>}
  </div>;
}
