import { test, expect } from "@playwright/test";

// These tests assume a logged-in state. In CI, set up auth state in a fixture.
test.describe("Table operations", () => {
  test.skip("create table → appears in sidebar", async ({ page }) => {
    await page.goto("/chat");
    await page.click("text=+ New Table");
    await page.fill('input[placeholder="Enter table name"]', "test_e2e_table");
    await page.click("text=Create Table");
    await expect(page.locator("text=test_e2e_table")).toBeVisible();
  });

  test.skip("add row → row count increases", async ({ page }) => {
    await page.goto("/chat");
    // Select first table
    await page.locator('[data-testid="sidebar-entry"]').first().click();
    const before = await page.locator("tbody tr").count();
    await page.click("text=+ Row");
    await expect(page.locator("tbody tr")).toHaveCount(before + 1);
  });
});
