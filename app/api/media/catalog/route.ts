import { NextRequest, NextResponse } from 'next/server';
import { catalog } from '@/lib/media/catalog-server';
import { searchCatalog } from '@/lib/media/catalog-search';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    return NextResponse.json(searchCatalog(catalog, { query: params.get('q') || '', category: params.get('category') || '',
      captionable: params.get('captionable') === 'true', pageSize: Number(params.get('limit') || 24), cursor: params.get('cursor') || undefined }),
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  } catch { return NextResponse.json({ error: 'invalid_catalog_search' }, { status: 400 }); }
}
