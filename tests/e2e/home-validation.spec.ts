import { expect, test } from "@playwright/test";

test("home screen validates nickname and room code", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /create room/i }).click();
  await expect(page.getByText("Enter a nickname")).toBeVisible();

  await page.getByPlaceholder("Your nickname").fill("Tester");
  await page.getByRole("button", { name: /join room/i }).click();
  await expect(page.getByText("Enter a valid room code")).toBeVisible();
});
