import { expect, test } from "@playwright/test";
import { installGameApiMocks } from "./helpers/mock-api";

// Votes go through /api/vote with the voter's room token; /api/store no longer accepts writes.
test("a vote is recorded through the token-checked vote route", async ({ context, page }) => {
  const store = new Map<string, string>();
  await installGameApiMocks(context, store);
  await page.goto("/");
  await page.getByPlaceholder("Your nickname").fill("Host");
  await page.getByRole("button", { name: /create room/i }).click();
  await expect(page.getByText("LOBBY", { exact: true })).toBeVisible();
  const code = await page.evaluate(() => localStorage.getItem("gifbattle_last_room")!);
  const key = `gifbattle:room:${code}`;
  const room = JSON.parse(store.get(key)!);
  const host = room.players[0].id;
  Object.assign(room, {
    phase: "voting", votingRound: 0, currentMatchup: 0, matchups: [["pA", "pB"]], voteDeadline: Date.now() + 60000, voteSecs: 60,
    prompts: ["When the meeting could have been an email"], roundPlan: [{ cycle: 0, heat: 0, heatsInCycle: 1, participants: [host, "pA", "pB"] }],
    players: [...room.players, { id: "pA", nickname: "Alex", score: 0 }, { id: "pB", nickname: "Sam", score: 0 }],
    submissions: { pA: [{ type: "text", textAnswer: "Reply all" }], pB: [{ type: "text", textAnswer: "Camera off" }] },
  });
  store.set(key, JSON.stringify(room));

  const vote = page.waitForResponse(response => response.url().includes("/api/vote"));
  await page.getByRole("button", { name: /vote for the left answer/i }).click();
  expect((await vote).status()).toBe(200);
  expect(store.get(`gifbattle:vote:${code}:0:0:${host}`)).toBe("left");

  const forged = await page.evaluate(async c => {
    const write = await fetch("/api/store", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: `gifbattle:vote:${c}:0:0:pA`, value: "right" }) });
    const vote = await fetch("/api/vote", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: c, pid: "pA", token: "guessed", round: 0, matchup: 0, side: "right" }) });
    return [write.status, vote.status];
  }, code);
  expect(forged).toEqual([405, 403]);
  expect(store.has(`gifbattle:vote:${code}:0:0:pA`)).toBe(false);
});
