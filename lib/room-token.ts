// Secret per-room player token issued by /api/room/create and /api/room/join.
// Every request that acts as a player must send it with the pid; see authorizeRoomPlayer.
const ROOM_TOKEN_KEY_PREFIX = "gifbattle_room_token:";
const roomTokenKey = (code: string) => `${ROOM_TOKEN_KEY_PREFIX}${code}`;

export const getRoomToken = (code: string) => {
  if (!code) return "";
  try { return localStorage.getItem(roomTokenKey(code)) || ""; } catch { return ""; }
};
export const setRoomToken = (code: string, token: string) => {
  if (!code) return;
  try { localStorage.setItem(roomTokenKey(code), token || ""); } catch {}
};
export const clearRoomToken = (code: string) => {
  if (!code) return;
  try { localStorage.removeItem(roomTokenKey(code)); } catch {}
};
