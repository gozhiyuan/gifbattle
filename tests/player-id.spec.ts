import { expect, test } from "@playwright/test";
import { isValidPlayerId } from "../lib/player-id";

test("player IDs must be exact, so look-alikes cannot alias another player's token", () => {
  for (const ok of ["k3j9x2ab", "authchk-host", "p_1"]) expect(isValidPlayerId(ok)).toBe(true);
  for (const bad of [" host", "host ", "ho st", "host\n", "", "x".repeat(65), 42, null, undefined]) expect(isValidPlayerId(bad)).toBe(false);
});
