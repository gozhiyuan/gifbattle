import { expect, test } from "@playwright/test";
import { installGameApiMocks } from "./helpers/mock-api";

// Player IDs are readable by anyone with the room code, so host-only and key-spending requests
// must carry the secret room token. The mock API rejects gemini-key calls without it.
test("host key and prompt requests carry the room token", async ({ context, page }) => {
  const store = new Map<string, string>();
  await installGameApiMocks(context, store);
  const promptBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/generate-prompts", route => {
    promptBodies.push(route.request().postDataJSON());
    return route.fulfill({ json: { prompts: ["When the Wi-Fi drops mid-sentence"] } });
  });
  const keyChecks: Array<string | undefined> = [];
  page.on("request", request => {
    if (request.url().includes("/api/gemini-key") && request.method() === "GET") keyChecks.push(request.headers()["x-room-token"]);
  });

  await page.goto("/");
  await page.getByPlaceholder("Your nickname").fill("Host");
  await page.getByRole("button", { name: /create room/i }).click();
  await expect(page.getByText("LOBBY", { exact: true })).toBeVisible();
  const code = await page.evaluate(() => localStorage.getItem("gifbattle_last_room")!);
  const token = await page.evaluate(c => localStorage.getItem(`gifbattle_room_token:${c}`), code);
  expect(token).toBeTruthy();

  await expect.poll(() => keyChecks.length).toBeGreaterThan(0);
  expect(keyChecks.every(sent => sent === token)).toBe(true);

  await page.getByRole("button", { name: "Set Key", exact: true }).click();
  await page.getByPlaceholder("AIza…").fill("AIza-test-key");
  const save = page.waitForResponse(response => response.url().includes("/api/gemini-key") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect((await save).status()).toBe(200);
  await expect(page.getByText("Failed to save Gemini key on server")).toHaveCount(0);

  await page.getByRole("button", { name: /enrich custom questions/i }).click();
  await expect.poll(() => promptBodies.length).toBe(1);
  expect(promptBodies[0]).toMatchObject({ roomCode: code, token });
});
