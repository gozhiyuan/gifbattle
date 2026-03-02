import { expect, test } from "@playwright/test";
import { installGameApiMocks } from "./helpers/mock-api";

test("host can create a room and a guest can join", async ({ browser }) => {
  const store = new Map<string, string>();

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  await installGameApiMocks(hostContext, store);
  await installGameApiMocks(guestContext, store);

  const hostPage = await hostContext.newPage();
  await hostPage.goto("/");
  await hostPage.getByPlaceholder("Your nickname").fill("Host");
  await hostPage.getByRole("button", { name: /create room/i }).click();
  await expect(hostPage.getByText("LOBBY")).toBeVisible();

  const roomCode = await hostPage.evaluate(() => localStorage.getItem("gifbattle_last_room") || "");
  expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

  const guestPage = await guestContext.newPage();
  await guestPage.goto("/");
  await guestPage.getByPlaceholder("Your nickname").fill("Guest");
  await guestPage.getByPlaceholder("Room code (e.g. AB12CD)").fill(roomCode);
  await guestPage.getByRole("button", { name: /join room/i }).click();

  await expect(guestPage.getByText("LOBBY")).toBeVisible();
  await expect(guestPage.getByText(/waiting for host to start/i)).toBeVisible();
  await expect(hostPage.getByText("PLAYERS (2/12)")).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test("cannot join after game has started", async ({ browser }) => {
  const store = new Map<string, string>();

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  await installGameApiMocks(hostContext, store);
  await installGameApiMocks(guestContext, store);

  // Host creates room
  const hostPage = await hostContext.newPage();
  await hostPage.goto("/");
  await hostPage.getByPlaceholder("Your nickname").fill("Host");
  await hostPage.getByRole("button", { name: /create room/i }).click();
  await expect(hostPage.getByText("LOBBY")).toBeVisible();

  const roomCode = await hostPage.evaluate(() => localStorage.getItem("gifbattle_last_room") || "");
  expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

  // Manually set room phase to "submitting" in the store (simulates game started)
  const key = `gifbattle:room:${roomCode}`;
  const raw = store.get(key);
  expect(raw).toBeDefined();
  const room = JSON.parse(raw!);
  room.phase = "submitting";
  store.set(key, JSON.stringify(room));

  // Guest tries to join — should fail
  const guestPage = await guestContext.newPage();
  await guestPage.goto("/");
  await guestPage.getByPlaceholder("Your nickname").fill("Guest");
  await guestPage.getByPlaceholder("Room code (e.g. AB12CD)").fill(roomCode);
  await guestPage.getByRole("button", { name: /join room/i }).click();

  await expect(guestPage.getByText(/game already in progress/i)).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test("lobby shows a notification when a player leaves", async ({ browser }) => {
  const store = new Map<string, string>();

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  await installGameApiMocks(hostContext, store);
  await installGameApiMocks(guestContext, store);

  const hostPage = await hostContext.newPage();
  await hostPage.goto("/");
  await hostPage.getByPlaceholder("Your nickname").fill("Host");
  await hostPage.getByRole("button", { name: /create room/i }).click();
  await expect(hostPage.getByText("LOBBY")).toBeVisible();

  const roomCode = await hostPage.evaluate(() => localStorage.getItem("gifbattle_last_room") || "");
  expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

  const guestPage = await guestContext.newPage();
  await guestPage.goto("/");
  await guestPage.getByPlaceholder("Your nickname").fill("Guest");
  await guestPage.getByPlaceholder("Room code (e.g. AB12CD)").fill(roomCode);
  await guestPage.getByRole("button", { name: /join room/i }).click();
  await expect(guestPage.getByText("LOBBY")).toBeVisible();
  await expect(hostPage.getByText("PLAYERS (2/12)")).toBeVisible();

  await guestPage.getByRole("button", { name: /leave/i }).click();
  await expect(guestPage.getByRole("button", { name: /create room/i })).toBeVisible();

  await expect(hostPage.getByText("PLAYERS (1/12)")).toBeVisible({ timeout: 10000 });
  await expect(hostPage.getByRole("status")).toContainText(/guest left the lobby/i);

  await hostContext.close();
  await guestContext.close();
});

test("host leaving during game reassigns host and notifies players", async ({ browser }) => {
  const store = new Map<string, string>();

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  await installGameApiMocks(hostContext, store);
  await installGameApiMocks(guestContext, store);

  const hostPage = await hostContext.newPage();
  await hostPage.goto("/");
  await hostPage.getByPlaceholder("Your nickname").fill("Host");
  await hostPage.getByRole("button", { name: /create room/i }).click();
  await expect(hostPage.getByText("LOBBY")).toBeVisible();

  const roomCode = await hostPage.evaluate(() => localStorage.getItem("gifbattle_last_room") || "");
  expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

  const guestPage = await guestContext.newPage();
  await guestPage.goto("/");
  await guestPage.getByPlaceholder("Your nickname").fill("Guest");
  await guestPage.getByPlaceholder("Room code (e.g. AB12CD)").fill(roomCode);
  await guestPage.getByRole("button", { name: /join room/i }).click();
  await expect(guestPage.getByText("LOBBY")).toBeVisible();
  await expect(hostPage.getByText("PLAYERS (2/12)")).toBeVisible();

  await hostPage.getByRole("button", { name: /start game/i }).click();
  await expect(hostPage.getByRole("button", { name: "← Leave" })).toBeVisible();
  await expect(guestPage.getByRole("button", { name: "← Leave" })).toBeVisible();

  hostPage.once("dialog", (dialog) => dialog.accept());
  await hostPage.getByRole("button", { name: "← Leave" }).click();
  await expect(hostPage.getByRole("button", { name: /create room/i })).toBeVisible();

  await expect(guestPage.getByRole("status")).toContainText(/is now host/i, { timeout: 10000 });

  const key = `gifbattle:room:${roomCode}`;
  const raw = store.get(key);
  expect(raw).toBeDefined();
  const room = JSON.parse(raw!);
  expect(room.players).toHaveLength(1);
  expect(room.players[0]?.nickname).toBe("Guest");
  expect(room.host).toBe(room.players[0]?.id);

  await hostContext.close();
  await guestContext.close();
});
