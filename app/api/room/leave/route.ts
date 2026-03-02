import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import {
  isValidRoomPlayerToken,
  revokeRoomPlayerToken,
  upsertRoomGeminiKey,
} from "@/lib/room-security";

const redis = Redis.fromEnv();
const ROOM_TTL = 86400;
const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;

type LeaveResult = {
  status?: string;
  hostChanged?: boolean;
  newHostId?: string | null;
  leftNickname?: string;
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
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
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
  const rawResult = (await redis["eval"](LEAVE_SCRIPT, [key, heartbeatKey], [playerId, String(ROOM_TTL)])) as string;

  let result: LeaveResult = {};
  try {
    result = JSON.parse(rawResult) as LeaveResult;
  } catch {
    result = {};
  }

  await revokeRoomPlayerToken(c, playerId);

  switch (result.status) {
    case "NOT_IN_ROOM":
      return NextResponse.json({ ok: true, alreadyLeft: true });
    case "ROOM_NOT_FOUND":
      return NextResponse.json({ error: "room_not_found" }, { status: 404 });
    case "ROOM_CLOSED":
      await upsertRoomGeminiKey(c, "");
      return NextResponse.json({ ok: true, roomClosed: true, leftNickname: result.leftNickname || "" });
    case "LEFT":
      return NextResponse.json({
        ok: true,
        hostChanged: Boolean(result.hostChanged),
        newHostId: typeof result.newHostId === "string" ? result.newHostId : null,
        leftNickname: result.leftNickname || "",
      });
    default:
      return NextResponse.json({ error: "unknown_error" }, { status: 500 });
  }
}
