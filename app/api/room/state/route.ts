import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import {
  ACTIVE_ROOM_TTL_SECS,
  GAME_OVER_ROOM_TTL_SECS,
  getRoomState,
  isRoomPlayer,
  isValidRoomPlayerToken,
  LOBBY_ROOM_TTL_SECS,
} from "@/lib/room-security";

const redis = Redis.fromEnv();

const parseRoomState = (json: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const ttlForPhase = (state: Record<string, unknown>): number => {
  if (state.phase === "lobby") return LOBBY_ROOM_TTL_SECS;
  if (state.phase === "game_over") return GAME_OVER_ROOM_TTL_SECS;
  return ACTIVE_ROOM_TTL_SECS;
};

export async function POST(req: NextRequest) {
  let code = "";
  let pid = "";
  let token = "";
  let state = "";
  try {
    const body = await req.json();
    code = (body.code || "").trim().toUpperCase();
    pid = body.pid || "";
    token = body.token || "";
    state = typeof body.state === "string" ? body.state : "";
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!code || !pid || !token || !state) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const validToken = await isValidRoomPlayerToken(code, pid, token);
  if (!validToken) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const room = await getRoomState(code);
  if (!isRoomPlayer(room, pid)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedState = parseRoomState(state);
  if (!parsedState) {
    return NextResponse.json({ error: "invalid_state_json" }, { status: 400 });
  }
  if ("geminiKey" in parsedState) {
    delete parsedState.geminiKey;
  }

  const sanitized = JSON.stringify(parsedState);
  await redis.set(`gifbattle:room:${code}`, sanitized, { ex: ttlForPhase(parsedState) });
  return NextResponse.json({ ok: true });
}
