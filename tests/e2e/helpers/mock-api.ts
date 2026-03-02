import type { BrowserContext, Request, Route } from "@playwright/test";

const STORE_PATH = "/api/store";
const GEMINI_KEY_PATH = "/api/gemini-key";
const CLEANUP_PATH = "/api/cleanup-images";

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

export const installGameApiMocks = async (
  context: BrowserContext,
  store: Map<string, string>
) => {
  await context.route(`**${STORE_PATH}**`, (route, request) =>
    handleStoreRequest(route, request, store)
  );
  await context.route(`**${GEMINI_KEY_PATH}**`, (route, request) =>
    handleGeminiKeyRequest(route, request)
  );
  await context.route(`**${CLEANUP_PATH}**`, (route) =>
    json(route, 200, { ok: true, deleted: 0 })
  );
};
