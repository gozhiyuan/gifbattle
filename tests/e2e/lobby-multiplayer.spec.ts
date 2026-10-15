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

test('a short lobby heartbeat delay does not remove the creator Start button', async ({ browser }) => {
  const store = new Map<string, string>();
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  try {
    await installGameApiMocks(hostContext, store); await installGameApiMocks(guestContext, store);
    const hostPage = await hostContext.newPage(); await hostPage.goto('/');
    await hostPage.getByPlaceholder('Your nickname').fill('Creator');
    await hostPage.getByRole('button', { name: /create room/i }).click();
    await expect(hostPage.getByText('LOBBY', { exact: true })).toBeVisible();
    const code = await hostPage.evaluate(() => localStorage.getItem('gifbattle_last_room')!);
    const key = `gifbattle:room:${code}`; const originalHost = JSON.parse(store.get(key)!).host;
    await hostPage.route('**/api/room/host-presence', route => route.request().postDataJSON().action === 'heartbeat' ? route.fulfill({json:{ok:true}}) : route.fallback());
    store.set(`gifbattle:hb:${code}`, JSON.stringify({ pid: originalHost, ts: Date.now() - 60000 }));
    const guestPage = await guestContext.newPage(); await guestPage.clock.install(); await guestPage.goto('/');
    await guestPage.getByPlaceholder('Your nickname').fill('Guest');
    await guestPage.getByPlaceholder('Room code (e.g. AB12CD)').fill(code);
    await guestPage.getByRole('button', { name: /join room/i }).click();
    await expect(guestPage.getByText('LOBBY', { exact: true })).toBeVisible();
    await guestPage.clock.fastForward(4000); await guestPage.clock.fastForward(8000);
    await expect(guestPage.getByText(/Waiting for host to start/)).toBeVisible();
    expect(JSON.parse(store.get(key)!).host).toBe(originalHost);
    await expect(hostPage.getByRole('button', { name: /start game/i })).toBeEnabled();
  } finally { await hostContext.close(); await guestContext.close(); }
});

test('a frozen lobby host is replaced and the remaining player can start the game',async({browser})=>{
 const store=new Map<string,string>();const hostContext=await browser.newContext(),guestContext=await browser.newContext();
 try{
  await installGameApiMocks(hostContext,store);await installGameApiMocks(guestContext,store);
  const host=await hostContext.newPage();await host.route('**/api/room/host-presence',route=>route.fulfill({json:{ok:true}}));
  await host.goto('/');await host.getByPlaceholder('Your nickname').fill('Frozen Host');await host.getByRole('button',{name:/create room/i}).click();
  await expect(host.getByText('LOBBY',{exact:true})).toBeVisible();
  const code=await host.evaluate(()=>localStorage.getItem('gifbattle_last_room')!);const key=`gifbattle:room:${code}`,originalHost=JSON.parse(store.get(key)!).host;
  store.set(`gifbattle:hb:${code}`,JSON.stringify({pid:originalHost,ts:Date.now()-180000}));
  const guest=await guestContext.newPage();await guest.clock.install();await guest.goto('/');await guest.getByPlaceholder('Your nickname').fill('New Host');await guest.getByPlaceholder('Room code (e.g. AB12CD)').fill(code);await guest.getByRole('button',{name:/join room/i}).click();
  await expect(guest.getByText('LOBBY',{exact:true})).toBeVisible();await guest.clock.fastForward(4000);await guest.clock.fastForward(8000);
  await expect(guest.getByRole('button',{name:/start game/i})).toBeEnabled();
  expect(JSON.parse(store.get(key)!).host).not.toBe(originalHost);
  await expect(host.getByRole('button',{name:/start game/i})).toHaveCount(0);
 }finally{await hostContext.close();await guestContext.close();}
});

test('temporary room-read failures preserve the lobby, while confirmed room deletion returns home',async({page})=>{
 const store=new Map<string,string>();await installGameApiMocks(page.context(),store);await page.clock.install();
 await page.goto('/');await page.getByPlaceholder('Your nickname').fill('Host');await page.getByRole('button',{name:/create room/i}).click();await expect(page.getByText('LOBBY',{exact:true})).toBeVisible();
 const code=await page.evaluate(()=>localStorage.getItem('gifbattle_last_room')!);let offline=true;
 await page.route('**/api/store?**',route=>offline&&decodeURIComponent(route.request().url()).includes(`gifbattle:room:${code}`)?route.fulfill({status:503,json:{error:'unavailable'}}):route.fallback());
 for(let i=0;i<3;i++){await page.clock.fastForward(2000);await page.waitForTimeout(100);}
 await expect(page.getByText('LOBBY',{exact:true})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('gifbattle_last_room'))).toBe(code);
 offline=false;store.delete(`gifbattle:room:${code}`);
 for(let i=0;i<2;i++){await page.clock.fastForward(2000);await page.waitForTimeout(100);}
 await expect(page.getByRole('button',{name:/create room/i})).toBeVisible();
});
