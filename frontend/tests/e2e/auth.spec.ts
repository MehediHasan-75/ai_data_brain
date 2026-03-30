import { test, expect } from "@playwright/test";

test.describe("Authentication flow", () => {
  test("unauthenticated /chat redirects to /signin", async ({ page }) => {
    // Clear cookies so no session
    await page.context().clearCookies();
    await page.goto("/chat");
    await expect(page).toHaveURL(/signin/);
  });

  test("sign-in page loads", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.locator("form")).toBeVisible();
  });

  test("landing page is publicly accessible", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/");
  });
});
