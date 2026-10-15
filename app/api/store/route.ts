import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import {
  ACTIVE_ROOM_TTL_SECS,
  GAME_OVER_ROOM_TTL_SECS,
  LOBBY_ROOM_TTL_SECS,
} from "@/lib/room-security";

const redis = Redis.fromEnv();
// Read-only. Room state is written via /api/room/state and votes via /api/vote, both of which
// check the player's room token; nothing is written through this generic key/value route.
const READ_PREFIXES = ["gifbattle:room:", "gifbattle:vote:", "gifbattle:hb:"];
const isAllowedReadKey = (key: string) => READ_PREFIXES.some((prefix) => key.startsWith(prefix));
const ROOM_PREFIX = "gifbattle:room:";

const sanitizeRoomJson = (json: string): string => {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && "geminiKey" in parsed) {
      delete (parsed as Record<string, unknown>).geminiKey;
      return JSON.stringify(parsed);
    }
  } catch {}
  return json;
};

const roomTtlForPhase = (roomJson: string): number => {
  try {
    const parsed = JSON.parse(roomJson) as { phase?: unknown };
    if (parsed?.phase === "lobby") return LOBBY_ROOM_TTL_SECS;
    if (parsed?.phase === "game_over") return GAME_OVER_ROOM_TTL_SECS;
    return ACTIVE_ROOM_TTL_SECS;
  } catch {
    return ACTIVE_ROOM_TTL_SECS;
  }
};

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json(null);
  if (!isAllowedReadKey(key)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let raw = await redis.get(key);
  if (raw != null && key.startsWith(ROOM_PREFIX)) {
    const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);
    const sanitized = sanitizeRoomJson(serialized);
    if (sanitized !== serialized) {
      raw = sanitized;
      await redis.set(key, sanitized, { ex: roomTtlForPhase(sanitized) });
    }
  }
  if (raw === null) return NextResponse.json(null);
  // @upstash/redis auto-deserializes valid JSON on retrieval, so re-serialize
  // if needed to ensure the client always receives { value: string }
  const value = typeof raw === "string" ? raw : JSON.stringify(raw);
  return NextResponse.json({ value });
}
