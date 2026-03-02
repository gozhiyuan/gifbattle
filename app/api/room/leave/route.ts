import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import {
  ACTIVE_ROOM_TTL_SECS,
  GAME_OVER_ROOM_TTL_SECS,
  isValidRoomPlayerToken,
  LOBBY_ROOM_TTL_SECS,
  revokeRoomPlayerToken,
  upsertRoomGeminiKey,
} from "@/lib/room-security";

const redis = Redis.fromEnv();
const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;

type LeaveResult = {
  status?: string;
  hostChanged?: boolean;
  newHostId?: string | null;
  leftNickname?: string;
};

const revokeTokenOrError = async (code: string, playerId: string) => {
  try {
    await revokeRoomPlayerToken(code, playerId);
    return null;
  } catch (error) {
    console.error("room_leave_revoke_token_failed", { code, playerId, error });
    return NextResponse.json({ error: "leave_failed" }, { status: 500 });
  }
};

// Atomic Lua script: remove player, optionally migrate host, persist room.
// Returns JSON: status=ROOM_NOT_FOUND|NOT_IN_ROOM|ROOM_CLOSED|LEFT
const LEAVE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw == false then
  return cjson.encode({status='ROOM_NOT_FOUND'})
end
local ok, room = pcall(cjson.decode, raw)
if not ok then
  return cjson.encode({status='ROOM_NOT_FOUND'})
end
local players = room['players'] or {}
local idx = -1
local leftNickname = ''
for i, p in ipairs(players) do
  if p['id'] == ARGV[1] then
    idx = i
    leftNickname = p['nickname'] or ''
    break
  end
end
if idx == -1 then
  return cjson.encode({status='NOT_IN_ROOM'})
end
local wasHost = room['host'] == ARGV[1]
table.remove(players, idx)
room['players'] = players
if #players == 0 then
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[2])
  return cjson.encode({status='ROOM_CLOSED', leftNickname=leftNickname})
end
local hostChanged = false
local newHostId = room['host']
if wasHost then
  hostChanged = true
  newHostId = players[1]['id']
  room['host'] = newHostId
  redis.call('DEL', KEYS[2])
end
redis.call('SET', KEYS[1], cjson.encode(room))
local ttl = tonumber(ARGV[2])
if room['phase'] == 'lobby' then
  ttl = tonumber(ARGV[3])
elseif room['phase'] == 'game_over' then
  ttl = tonumber(ARGV[4])
end
redis.call('EXPIRE', KEYS[1], ttl)
return cjson.encode({status='LEFT', hostChanged=hostChanged, newHostId=newHostId, leftNickname=leftNickname})
`;

export async function POST(req: NextRequest) {
  let body: { code?: unknown; pid?: unknown; token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { code, pid, token } = body;

  if (typeof code !== "string" || !ROOM_CODE_RE.test(code.trim().toUpperCase())) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }
  if (typeof pid !== "string" || !pid.trim()) {
    return NextResponse.json({ error: "invalid_pid" }, { status: 400 });
  }
  if (typeof token !== "string" || !token.trim()) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const c = code.trim().toUpperCase();
  const playerId = pid.trim();
  const validToken = await isValidRoomPlayerToken(c, playerId, token);
  if (!validToken) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const key = `gifbattle:room:${c}`;
  const heartbeatKey = `gifbattle:hb:${c}`;
  let rawResult = "";
  try {
    rawResult = (await redis["eval"](
      LEAVE_SCRIPT,
      [key, heartbeatKey],
      [
        playerId,
        String(ACTIVE_ROOM_TTL_SECS),
        String(LOBBY_ROOM_TTL_SECS),
        String(GAME_OVER_ROOM_TTL_SECS),
      ]
    )) as string;
  } catch (error) {
    console.error("room_leave_eval_failed", { code: c, playerId, error });
    return NextResponse.json({ error: "leave_failed" }, { status: 500 });
  }
  if (typeof rawResult !== "string") {
    console.error("room_leave_eval_unexpected_result", { code: c, playerId, rawResult });
    return NextResponse.json({ error: "leave_failed" }, { status: 500 });
  }

  let result: LeaveResult;
  try {
    result = JSON.parse(rawResult) as LeaveResult;
  } catch (error) {
    console.error("room_leave_parse_failed", { code: c, playerId, rawResult, error });
    return NextResponse.json({ error: "leave_failed" }, { status: 500 });
  }

  switch (result.status) {
    case "NOT_IN_ROOM": {
      const revokeError = await revokeTokenOrError(c, playerId);
      if (revokeError) return revokeError;
      return NextResponse.json({ ok: true, alreadyLeft: true });
    }
    case "ROOM_NOT_FOUND": {
      const revokeError = await revokeTokenOrError(c, playerId);
      if (revokeError) return revokeError;
      return NextResponse.json({ error: "room_not_found" }, { status: 404 });
    }
    case "ROOM_CLOSED": {
      try {
        await upsertRoomGeminiKey(c, "");
      } catch (error) {
        console.error("room_leave_gemini_cleanup_failed", { code: c, playerId, error });
        return NextResponse.json({ error: "leave_failed" }, { status: 500 });
      }
      const revokeError = await revokeTokenOrError(c, playerId);
      if (revokeError) return revokeError;
      return NextResponse.json({ ok: true, roomClosed: true, leftNickname: result.leftNickname || "" });
    }
    case "LEFT": {
      const revokeError = await revokeTokenOrError(c, playerId);
      if (revokeError) return revokeError;
      return NextResponse.json({
        ok: true,
        hostChanged: Boolean(result.hostChanged),
        newHostId: typeof result.newHostId === "string" ? result.newHostId : null,
        leftNickname: result.leftNickname || "",
      });
    }
    default:
      console.error("room_leave_unknown_status", { code: c, playerId, status: result.status });
      return NextResponse.json({ error: "unknown_error" }, { status: 500 });
  }
}
