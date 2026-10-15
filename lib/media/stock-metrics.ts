import type { RoomState } from '../room-security';
export type StockEvent = 'exposed' | 'selected' | 'vote_exposed' | 'voted';
export function stockEventAssets(room: RoomState, pid: string, round: number, matchup: number, event: StockEvent, requested: string[], vote?: string) {
  const id = (sub: { source?: string; assetId?: string }) => sub?.source === 'local' && sub.assetId?.startsWith('local:') ? sub.assetId.slice(6) : null;
  if (event === 'exposed') return room.phase === 'submitting' && room.submitDeadline > Date.now() &&
    (!room.prompts?.length || Boolean(room.prompts[round])) && (!room.roundPlan?.length || room.roundPlan[round]?.participants?.includes(pid)) ? requested : [];
  if (event === 'selected') {
    const asset = id(room.submissions?.[pid]?.[round]); return asset && requested.includes(asset) ? [asset] : [];
  }
  if (room.phase !== 'voting' || room.votingRound !== round || room.currentMatchup !== matchup) return [];
  const players = room.matchups?.[matchup]; if (!players || players.includes(pid)) return [];
  const assets = players.map(player => id(room.submissions?.[player]?.[round]));
  if (event === 'vote_exposed') return assets.filter(asset => asset && requested.includes(asset));
  const asset = assets[vote === 'left' ? 0 : vote === 'right' ? 1 : -1];
  return asset && requested.includes(asset) ? [asset] : [];
}
export function recordStockEvent(context: { code: string; pid: string; token: string; gameId: number; roundIndex: number; matchup?: number }, event: StockEvent, assetIds: string[]) {
  if (!assetIds.length) return;
  void fetch('/api/media/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ ...context, event, assetIds }) }).catch(() => {});
}
