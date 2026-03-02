import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import { checkIpRateLimit } from "@/lib/room-security";

const redis = Redis.fromEnv();
const ROOM_TTL = 86400;
const MAX_RETRIES = 5;

const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "0.0.0.0";
  const rl = await checkIpRateLimit("create", ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      { status: 429 }
    );
  }

  let body: { pid?: unknown; nickname?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { pid, nickname } = body;

  if (typeof nickname !== "string" || !nickname.trim()) {
    return NextResponse.json({ error: "invalid_nickname" }, { status: 400 });
  }
  if (typeof pid !== "string" || !pid) {
    return NextResponse.json({ error: "invalid_pid" }, { status: 400 });
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = genCode();
    const roomState = {
      phase: "lobby",
      host: pid,
      code,
      players: [{ id: pid, nickname: nickname.trim(), score: 0 }],
      prompts: [],
      submissions: {},
      doneSubmitting: [],
      votingRound: 0,
      matchups: [],
      currentMatchup: 0,
      roundMatchupWins: {},
      submitDeadline: null,
      voteDeadline: null,
      usedPrompts: [],
      roundPlan: [],
      maxCompetitors: 4,
      submitSecs: 60,
      voteSecs: 12,
      rounds: 3,
      namePromptRounds: 1,
      customPrompts: [],
    };

    const key = `gifbattle:room:${code}`;
    const result = await redis.set(key, JSON.stringify(roomState), { nx: true, ex: ROOM_TTL });
    if (result !== null) {
      return NextResponse.json({ code });
    }
  }

  return NextResponse.json({ error: "code_generation_failed" }, { status: 503 });
}
