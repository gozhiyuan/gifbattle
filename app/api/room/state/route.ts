import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import { ANSWER_MODE_POLICY, CHOICE_MODE_POLICY, validSubmissionModes } from '@/lib/answer-modes';
import {SAVE_ROOM_HOST_SCRIPT} from '@/lib/host-presence';
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

  if (room.phase === 'lobby' && parsedState.alternateModes !== room.alternateModes && room.host !== pid)
    return NextResponse.json({error:'host_only_setting'},{status:403});
  if (room.phase === 'lobby' && parsedState.phase === 'submitting') {
    if (room.host !== pid) return NextResponse.json({error:'host_only_setting'},{status:403});
    parsedState.alternateModes = room.alternateModes !== false;
    parsedState.answerModePolicy = parsedState.alternateModes ? ANSWER_MODE_POLICY : CHOICE_MODE_POLICY;
  }
  if ([ANSWER_MODE_POLICY,CHOICE_MODE_POLICY,'rotate-v1'].includes(room.answerModePolicy) && room.submitDeadline === parsedState.submitDeadline && parsedState.phase !== 'lobby') {
    parsedState.answerModePolicy = room.answerModePolicy;
    parsedState.alternateModes = room.alternateModes !== false;
    parsedState.roundPlan = room.roundPlan;
    parsedState.answerModeOverrides = { ...(room.answerModeOverrides || {}), ...((parsedState.answerModeOverrides as object) || {}) };
  }
  if (!validSubmissionModes(room, parsedState)) return NextResponse.json({ error: 'wrong_answer_mode' }, { status: 400 });

  const sanitized = JSON.stringify(parsedState);
  const saved=await redis.eval<(string | number)[], string>(SAVE_ROOM_HOST_SCRIPT,[`gifbattle:room:${code}`],[sanitized,ttlForPhase(parsedState),pid]);
  if(saved==='!forbidden')return NextResponse.json({error:'forbidden'},{status:403});
  if(!saved)return NextResponse.json({error:'room_not_found'},{status:404});
  return NextResponse.json({ ok: true, state: typeof saved==='string'?JSON.parse(saved):saved });
}
