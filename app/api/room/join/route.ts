import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import { checkIpRateLimit } from "@/lib/room-security";

const redis = Redis.fromEnv();
const ROOM_TTL = 86400;

// Atomic Lua script: reads room, enforces phase + capacity, appends player, re-saves.
// Returns: ROOM_NOT_FOUND | NOT_IN_LOBBY | ALREADY_JOINED | ROOM_FULL | JOINED
const JOIN_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw == false then
  return 'ROOM_NOT_FOUND'
end
local ok, room = pcall(cjson.decode, raw)
if not ok then
  return 'ROOM_NOT_FOUND'
end
if room['phase'] ~= 'lobby' then
  return 'NOT_IN_LOBBY'
end
local players = room['players'] or {}
for _, p in ipairs(players) do
  if p['id'] == ARGV[1] then
    return 'ALREADY_JOINED'
  end
end
local maxP = tonumber(room['maxCompetitors'])
if maxP == nil then maxP = 12 end
if #players >= maxP then
  return 'ROOM_FULL'
end
table.insert(players, {id=ARGV[1], nickname=ARGV[2], score=0})
room['players'] = players
redis.call('SET', KEYS[1], cjson.encode(room))
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return 'JOINED'
`;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "0.0.0.0";
  const rl = await checkIpRateLimit("join", ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      { status: 429 }
    );
  }

  let body: { code?: unknown; pid?: unknown; nickname?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { code, pid, nickname } = body;

  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }
  if (typeof pid !== "string" || !pid.trim()) {
    return NextResponse.json({ error: "invalid_pid" }, { status: 400 });
  }
  if (typeof nickname !== "string" || !nickname.trim()) {
    return NextResponse.json({ error: "invalid_nickname" }, { status: 400 });
  }

  const c = code.trim().toUpperCase();
  const key = `gifbattle:room:${c}`;

  const result = (await redis["eval"](JOIN_SCRIPT, [key], [pid, nickname.trim(), String(ROOM_TTL)])) as string;

  switch (result) {
    case "JOINED":
    case "ALREADY_JOINED":
      return NextResponse.json({ ok: true, code: c });
    case "ROOM_NOT_FOUND":
      return NextResponse.json({ error: "room_not_found" }, { status: 404 });
    case "NOT_IN_LOBBY":
      return NextResponse.json({ error: "not_in_lobby" }, { status: 409 });
    case "ROOM_FULL":
      return NextResponse.json({ error: "room_full" }, { status: 409 });
    default:
      return NextResponse.json({ error: "unknown_error" }, { status: 500 });
  }
}
