import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import {
  getRoomState,
  isRoomPlayer,
  isValidRoomPlayerToken,
} from "@/lib/room-security";

const redis = Redis.fromEnv();
const ROOM_TTL = 86400;

const sanitizeRoomJson = (json: string): string => {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && "geminiKey" in parsed) {
      delete (parsed as Record<string, unknown>).geminiKey;
    }
    return JSON.stringify(parsed);
  } catch {
    return json;
  }
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

  const sanitized = sanitizeRoomJson(state);
  await redis.set(`gifbattle:room:${code}`, sanitized, { ex: ROOM_TTL });
  return NextResponse.json({ ok: true });
}
