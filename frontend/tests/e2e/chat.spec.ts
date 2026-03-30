import { test, expect } from "@playwright/test";

test.describe("Chat", () => {
  test.skip("send message → bot response renders", async ({ page }) => {
    await page.goto("/chat");
    await page.click("text=Chat");
    await page.fill("textarea", "Hello");
    await page.keyboard.press("Enter");
    await expect(page.locator(".message-bubble")).toHaveCount(2, { timeout: 15000 });
  });
});
