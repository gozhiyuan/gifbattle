import { expect, test } from "@playwright/test";

test("home page loads and shows entry controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("GIF BATTLES")).toBeVisible();
  await expect(page.getByPlaceholder("Your nickname")).toBeVisible();
  await expect(page.getByRole("button", { name: /create room/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /join room/i })).toBeVisible();
});

test("privacy notice is available from the public site", async ({ page }) => {
  await page.goto("/privacy");

  await expect(page.getByRole("heading", { name: "Privacy Notice" })).toBeVisible();
  await expect(page.getByText(/Vercel Web Analytics/)).toBeVisible();
});
