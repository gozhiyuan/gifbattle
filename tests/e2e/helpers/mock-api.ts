import type { BrowserContext, Request, Route } from "@playwright/test";
import { normalizeQuestionTopics, questionTopicsRejection } from "../../../lib/questions";
import { voteKey, voteRejection } from "../../../lib/votes";
import { isValidPlayerId } from "../../../lib/player-id";

const STORE_PATH = "/api/store";
const GEMINI_KEY_PATH = "/api/gemini-key";
const CLEANUP_PATH = "/api/cleanup-images";
const ROOM_STATE_PATH = "/api/room/state";
const ROOM_LEAVE_PATH = "/api/room/leave";

const json = async (route: Route, status: number, body: unknown) => {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
};

const handleStoreRequest = async (
  route: Route,
  request: Request,
  store: Map<string, string>
) => {
  const reqUrl = new URL(request.url());
  const method = request.method();

  if (method === "GET") {
    const key = reqUrl.searchParams.get("key");
    if (!key) return json(route, 200, null);
    const value = store.get(key);
    return json(route, 200, value == null ? null : { value });
  }

  // The real /api/store is read-only; votes go through /api/vote
  return json(route, 405, { error: "method_not_allowed" });
};

// Mirrors authorizeRoomPlayer: a pid is not enough, the request must carry that player's room token.
const hasRoomToken = (roomTokens: Map<string, string>, code: unknown, pid: unknown, token: unknown) =>
  typeof code === "string" && typeof pid === "string" && typeof token === "string" && !!token &&
  roomTokens.get(`${code.trim().toUpperCase()}:${pid}`) === token;

const handleVoteRequest = async (route: Route, request: Request, store: Map<string, string>, roomTokens: Map<string, string>) => {
  if (request.method() !== "POST") return json(route, 405, { error: "method_not_allowed" });
  const body = request.postDataJSON() as { code?: string; pid?: string; token?: string; round?: number; matchup?: number; side?: string };
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!hasRoomToken(roomTokens, code, body?.pid, body?.token)) return json(route, 403, { error: "forbidden" });
  const raw = store.get(`gifbattle:room:${code}`);
  const room = raw ? JSON.parse(raw) : null;
  const rejection = voteRejection(room, body.pid!, body.round, body.matchup, body.side, Date.now());
  if (rejection) return json(route, rejection === "invalid_request" ? 400 : rejection === "not_eligible" ? 403 : 409, { error: rejection });
  const key = voteKey(code, room.submitDeadline, body.round!, body.matchup!, body.pid!);
  if (store.has(key) && store.get(key) !== body.side) return json(route, 409, { error: "already_voted" });
  store.set(key, body.side!);
  return json(route, 200, { ok: true });
};

const handleGeminiKeyRequest = async (route: Route, request: Request, roomTokens: Map<string, string>) => {
  if (request.method() === "GET") {
    const url = new URL(request.url());
    const token = request.headers()["x-room-token"];
    if (!hasRoomToken(roomTokens, url.searchParams.get("code"), url.searchParams.get("pid"), token)) return json(route, 403, { error: "forbidden" });
    return json(route, 200, { exists: false });
  }
  if (request.method() === "POST") {
    const raw = request.postDataJSON() as { key?: unknown; code?: unknown; pid?: unknown; token?: unknown };
    if (!hasRoomToken(roomTokens, raw?.code, raw?.pid, raw?.token)) return json(route, 403, { error: "forbidden" });
    const key = typeof raw?.key === "string" ? raw.key.trim() : "";
    return json(route, 200, { ok: true, exists: Boolean(key) });
  }
  return json(route, 405, { error: "method_not_allowed" });
};

const handleRoomCreateRequest = async (
  route: Route,
  request: Request,
  store: Map<string, string>,
  roomTokens: Map<string, string>
) => {
  if (request.method() !== "POST") return json(route, 405, { error: "method_not_allowed" });
  const body = request.postDataJSON() as { pid?: unknown; nickname?: unknown };
  const pid = typeof body?.pid === "string" ? body.pid : "";
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
  if (!isValidPlayerId(pid)) return json(route, 400, { error: "invalid_pid" });
  if (!nickname) return json(route, 400, { error: "invalid_input" });

  for (let i = 0; i < 5; i++) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const key = `gifbattle:room:${code}`;
    if (store.has(key)) continue;
    const roomState = {
      phase: "lobby", host: pid, code,
      players: [{ id: pid, nickname, score: 0 }],
      prompts: [], submissions: {}, doneSubmitting: [], votingRound: 0,
      matchups: [], currentMatchup: 0, roundMatchupWins: {},
      submitDeadline: null, voteDeadline: null, usedPrompts: [], roundPlan: [],
      maxCompetitors: 4, submitSecs: 60, voteSecs: 12, rounds: 3,
      namePromptRounds: 1, customPrompts: [],
    };
    store.set(key, JSON.stringify(roomState));
    const token = `tok_${code}_${pid}`;
    roomTokens.set(`${code}:${pid}`, token);
    return json(route, 200, { code, token });
  }
  return json(route, 503, { error: "code_generation_failed" });
};

const handleRoomJoinRequest = async (
  route: Route,
  request: Request,
  store: Map<string, string>,
  roomTokens: Map<string, string>
) => {
  if (request.method() !== "POST") return json(route, 405, { error: "method_not_allowed" });
  const body = request.postDataJSON() as { code?: unknown; pid?: unknown; nickname?: unknown; token?: unknown };
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const pid = typeof body?.pid === "string" ? body.pid : "";
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
  if (!isValidPlayerId(pid)) return json(route, 400, { error: "invalid_pid" });
  if (!code || !nickname) return json(route, 400, { error: "invalid_input" });

  const key = `gifbattle:room:${code}`;
  const raw = store.get(key);
  if (!raw) return json(route, 404, { error: "room_not_found" });

  let room: Record<string, unknown>;
  try { room = JSON.parse(raw); } catch { return json(route, 404, { error: "room_not_found" }); }

  if (room.phase !== "lobby") return json(route, 409, { error: "not_in_lobby" });

  const players = Array.isArray(room.players) ? room.players as Array<Record<string, unknown>> : [];
  if (players.find((p) => p["id"] === pid)) {
    // Mirrors the real route: no new token for an existing player without their current one
    if (!hasRoomToken(roomTokens, code, pid, body?.token)) return json(route, 409, { error: "already_joined" });
    return json(route, 200, { ok: true, code, token: body.token });
  }

  if (players.length >= 12) return json(route, 409, { error: "room_full" });

  players.push({ id: pid, nickname, score: 0 });
  room.players = players;
  store.set(key, JSON.stringify(room));
  const token = `tok_${code}_${pid}`;
  roomTokens.set(`${code}:${pid}`, token);
  return json(route, 200, { ok: true, code, token });
};

const handleRoomStateRequest = async (
  route: Route,
  request: Request,
  store: Map<string, string>,
  roomTokens: Map<string, string>
) => {
  if (request.method() !== "POST") return json(route, 405, { error: "method_not_allowed" });
  const body = request.postDataJSON() as {
    code?: unknown;
    pid?: unknown;
    token?: unknown;
    state?: unknown;
  };
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const pid = typeof body?.pid === "string" ? body.pid : "";
  const token = typeof body?.token === "string" ? body.token : "";
  const state = typeof body?.state === "string" ? body.state : "";
  if (!code || !pid || !token || !state) return json(route, 400, { error: "invalid_request" });

  if (roomTokens.get(`${code}:${pid}`) !== token) return json(route, 403, { error: "forbidden" });
  const key = `gifbattle:room:${code}`;
  const raw = store.get(key);
  if (!raw) return json(route, 403, { error: "forbidden" });
  let room: Record<string, unknown>;
  try { room = JSON.parse(raw); } catch { return json(route, 403, { error: "forbidden" }); }
  const players = Array.isArray(room.players) ? room.players as Array<Record<string, unknown>> : [];
  if (!players.some((p) => p["id"] === pid)) return json(route, 403, { error: "forbidden" });

  const parsed = JSON.parse(state);
  const topicError = questionTopicsRejection(room, pid, parsed.questionTopics);
  if (topicError) return json(route, topicError === 'host_only_setting' ? 403 : topicError === 'question_topics_locked' ? 409 : 400, { error: topicError });
  parsed.questionTopics = normalizeQuestionTopics(parsed.questionTopics === undefined ? room.questionTopics : parsed.questionTopics);
  store.set(key, JSON.stringify(parsed));
  return json(route, 200, { ok: true });
};

const handleRoomLeaveRequest = async (
  route: Route,
  request: Request,
  store: Map<string, string>,
  roomTokens: Map<string, string>
) => {
  if (request.method() !== "POST") return json(route, 405, { error: "method_not_allowed" });
  const body = request.postDataJSON() as {
    code?: unknown;
    pid?: unknown;
    token?: unknown;
  };
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const pid = typeof body?.pid === "string" ? body.pid : "";
  const token = typeof body?.token === "string" ? body.token : "";
  if (!code || !pid || !token) return json(route, 400, { error: "invalid_request" });

  if (roomTokens.get(`${code}:${pid}`) !== token) return json(route, 403, { error: "forbidden" });
  roomTokens.delete(`${code}:${pid}`);

  const key = `gifbattle:room:${code}`;
  const raw = store.get(key);
  if (!raw) return json(route, 404, { error: "room_not_found" });
  let room: Record<string, unknown>;
  try { room = JSON.parse(raw); } catch { return json(route, 404, { error: "room_not_found" }); }

  const players = Array.isArray(room.players) ? room.players as Array<Record<string, unknown>> : [];
  const index = players.findIndex((p) => p["id"] === pid);
  if (index < 0) return json(route, 200, { ok: true, alreadyLeft: true });

  players.splice(index, 1);
  if (players.length === 0) {
    store.delete(key);
    return json(route, 200, { ok: true, roomClosed: true });
  }

  const wasHost = room.host === pid;
  room.players = players;
  if (wasHost) room.host = players[0]?.["id"] || null;
  store.set(key, JSON.stringify(room));
  return json(route, 200, {
    ok: true,
    hostChanged: wasHost,
    newHostId: wasHost ? room.host : null,
  });
};

export const installGameApiMocks = async (
  context: BrowserContext,
  store: Map<string, string>
) => {
  // Gameplay checks should not wait for an external font stylesheet.
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  const roomTokens = new Map<string, string>();
  await context.route('**/api/media/events', route => json(route, 200, { ok: true }));
  await context.route(`**${STORE_PATH}**`, (route, request) =>
    handleStoreRequest(route, request, store)
  );
  await context.route("**/api/vote", (route, request) => handleVoteRequest(route, request, store, roomTokens));
  await context.route(`**${GEMINI_KEY_PATH}**`, (route, request) =>
    handleGeminiKeyRequest(route, request, roomTokens)
  );
  await context.route(`**${CLEANUP_PATH}**`, (route) =>
    json(route, 200, { ok: true, deleted: 0 })
  );
  await context.route('**/api/room/host-presence', (route,request) => {
    const body=request.postDataJSON();
    if(roomTokens.get(`${body.code}:${body.pid}`)!==body.token)return json(route,403,{error:'forbidden'});
    const key=`gifbattle:room:${body.code}`,raw=store.get(key);if(!raw)return json(route,404,{error:'room_not_found'});
    const room=JSON.parse(raw);if(!room.players.some(player=>player.id===body.pid))return json(route,403,{error:'forbidden'});
    if(room.phase==='game_over')return json(route,200,{ok:true,migrated:false});
    if(body.action==='heartbeat'){
      if(room.host!==body.pid)return json(route,403,{error:'forbidden'});
      store.set(`gifbattle:hb:${body.code}`,JSON.stringify({pid:body.pid,ts:Date.now()}));return json(route,200,{ok:true});
    }
    if(room.host!==body.expectedHost)return json(route,200,{ok:true,migrated:false});
    let hb;try{hb=JSON.parse(store.get(`gifbattle:hb:${body.code}`)||'null');}catch{}
    const grace=room.phase==='lobby'?120000:40000;
    const last=hb?.pid===room.host?hb.ts:room.hostSince||room.createdAt||Date.now();
    if(Date.now()-last<grace)return json(route,200,{ok:true,migrated:false});
    room.host=body.pid;room.hostSince=Date.now();store.set(key,JSON.stringify(room));
    store.set(`gifbattle:hb:${body.code}`,JSON.stringify({pid:body.pid,ts:Date.now()}));return json(route,200,{ok:true,migrated:true});
  });
  await context.route(`**/api/room/create**`, (route, request) =>
    handleRoomCreateRequest(route, request, store, roomTokens)
  );
  await context.route(`**/api/room/join**`, (route, request) =>
    handleRoomJoinRequest(route, request, store, roomTokens)
  );
  await context.route(`**${ROOM_STATE_PATH}**`, (route, request) =>
    handleRoomStateRequest(route, request, store, roomTokens)
  );
  await context.route(`**${ROOM_LEAVE_PATH}**`, (route, request) =>
    handleRoomLeaveRequest(route, request, store, roomTokens)
  );
};
