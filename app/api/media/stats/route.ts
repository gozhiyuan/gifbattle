import { NextRequest, NextResponse } from 'next/server';
import { isMediaAdmin, contributionRedis as redis } from '@/lib/media/contribution-storage';
import { getCatalog } from '@/lib/media/catalog-server';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!isMediaAdmin(request.headers.get('authorization'))) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers });
  const offset = Number(request.nextUrl.searchParams.get('offset') || 0);
  if (!Number.isInteger(offset) || offset < 0) return NextResponse.json({ error: 'invalid_offset' }, { status: 400, headers });
  try {
    const {catalog}=await getCatalog();
    const assets = await Promise.all(catalog.assets.slice(offset, offset + 50).map(async asset => {
      const metric = await redis.hgetall<Record<string, number>>(`gifbattle:stock-metric:${asset.id}`) || {};
      const exposed = Number(metric.exposed || 0), selected = Number(metric.selected || 0);
      const voteExposed = Number(metric.vote_exposed || 0), voted = Number(metric.voted || 0);
      return { id: asset.id, title: asset.title, categories: asset.categories, exposed, selected, voteExposed, voted,
        selectionRate: exposed ? selected / exposed : null, voteRate: voteExposed ? voted / voteExposed : null };
    }));
    return NextResponse.json({ assets, nextOffset: offset + 50 < catalog.assets.length ? offset + 50 : null }, { headers });
  } catch { return NextResponse.json({ error: 'metrics_unavailable' }, { status: 503, headers }); }
}
