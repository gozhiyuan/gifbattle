import type { BrowserContext, Request, Route } from "@playwright/test";

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

const parseStoreBody = (request: Request): { key: string; value: string } => {
  const raw = request.postDataJSON() as { key?: unknown; value?: unknown };
  const key = typeof raw?.key === "string" ? raw.key : "";
  const value = typeof raw?.value === "string" ? raw.value : "";
  return { key, value };
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

  if (method === "POST") {
    const { key, value } = parseStoreBody(request);
    if (!key) return json(route, 400, { error: "invalid_request" });
    store.set(key, value);
    return json(route, 200, { ok: true });
  }

  if (method === "DELETE") {
    if (reqUrl.searchParams.has("prefix")) {
      return json(route, 403, { error: "prefix_delete_disabled" });
    }
    const key = reqUrl.searchParams.get("key");
    if (key) store.delete(key);
    return json(route, 200, { ok: true });
  }

  return json(route, 405, { error: "method_not_allowed" });
};

const handleGeminiKeyRequest = async (route: Route, request: Request) => {
  if (request.method() === "GET") return json(route, 200, { exists: false });
  if (request.method() === "POST") {
    const raw = request.postDataJSON() as { key?: unknown };
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
  if (!nickname || !pid) return json(route, 400, { error: "invalid_input" });

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
  const body = request.postDataJSON() as { code?: unknown; pid?: unknown; nickname?: unknown };
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const pid = typeof body?.pid === "string" ? body.pid : "";
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
  if (!code || !pid || !nickname) return json(route, 400, { error: "invalid_input" });

  const key = `gifbattle:room:${code}`;
  const raw = store.get(key);
  if (!raw) return json(route, 404, { error: "room_not_found" });

  let room: Record<string, unknown>;
  try { room = JSON.parse(raw); } catch { return json(route, 404, { error: "room_not_found" }); }

  if (room.phase !== "lobby") return json(route, 409, { error: "not_in_lobby" });

  const players = Array.isArray(room.players) ? room.players as Array<Record<string, unknown>> : [];
  if (players.find((p) => p["id"] === pid)) {
    const token = `tok_${code}_${pid}`;
    roomTokens.set(`${code}:${pid}`, token);
    return json(route, 200, { ok: true, code, token });
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

  store.set(key, state);
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
  const roomTokens = new Map<string, string>();
  await context.route(`**${STORE_PATH}**`, (route, request) =>
    handleStoreRequest(route, request, store)
  );
  await context.route(`**${GEMINI_KEY_PATH}**`, (route, request) =>
    handleGeminiKeyRequest(route, request)
  );
  await context.route(`**${CLEANUP_PATH}**`, (route) =>
    json(route, 200, { ok: true, deleted: 0 })
  );
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
