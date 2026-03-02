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
