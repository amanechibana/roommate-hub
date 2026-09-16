import { test, expect } from "@playwright/test";
import { mockBackground } from "./mock-background";
test.skip(
  !!process.env.PW_SHARED_API,
  "Demo feature interactions; SQL verifies persisted settings and isolation.",
);
test.beforeEach(async ({ page }) => {
  await mockBackground(page);
});
test("shopping quantities and stores persist, and bundled entries split into individual rows", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Item", exact: true }).click();
  await page.getByLabel("What’s on your mind?").fill("Breakfast: Milk, Eggs");
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByLabel("Unit", { exact: true }).fill("packs");
  await page.getByLabel("Store", { exact: true }).fill("Corner shop");
  await page.getByRole("button", { name: "Save to our home" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^Shopping list/ })
    .click();
  await page
    .getByRole("combobox", { name: "Group shopping by store" })
    .selectOption("Corner shop");
  await expect(page.locator(".shopping-row")).toHaveCount(1);
  await expect(page.locator(".shopping-row")).toContainText(
    "2 packs · Corner shop",
  );
  await page
    .getByRole("button", { name: "Actions for Breakfast: Milk, Eggs" })
    .click();
  await page
    .getByRole("menuitem", { name: "Split into separate items" })
    .click();
  await expect(page.locator(".shopping-row")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Mark as bought: Milk", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mark as bought: Eggs", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});
test("chore templates and individual checklist progress can be reused", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "To-do", exact: true }).click();
  await page.getByLabel("Use a reusable template").selectOption("kitchen");
  await expect(page.getByLabel("What’s on your mind?")).toHaveValue(
    "Clean kitchen",
  );
  await page.getByLabel("Complete checklist step 1").check();
  await page.getByRole("button", { name: "Save as reusable template" }).click();
  await expect(
    page.getByText("Template saved for this household."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save to our home" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^To-dos/ })
    .click();
  await expect(
    page.locator(".task-row").filter({ hasText: "Clean kitchen" }),
  ).toContainText("1/4 steps");
  await page.getByRole("button", { name: "Actions for Clean kitchen" }).click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Complete checklist step 1")).toBeChecked();
});
test("percentage expenses validate totals and retain categories on edit", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Expenses", exact: true })
    .click();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("What was it for?").fill("Weekend groceries");
  await page.getByLabel("Amount ($)", { exact: true }).fill("1.01");
  await page.getByLabel("Spending category").selectOption("Groceries");
  await page.getByRole("checkbox", { name: /Sam/ }).uncheck();
  await page.getByRole("checkbox", { name: "Split by percentage" }).check();
  await page.getByLabel("You’s percentage (%)").fill("60");
  await page.getByLabel("Alex’s percentage (%)").fill("60");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Percentages must add up to 100",
  );
  await page.getByLabel("Alex’s percentage (%)").fill("40");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await page.getByRole("button", { name: /Weekend groceries/ }).click();
  await expect(page.getByLabel("Spending category")).toHaveValue("Groceries");
  await expect(page.getByLabel("You’s percentage (%)")).toHaveValue("60");
  await expect(page.getByText(/Save this expense, then reopen/)).toHaveCount(0);
  await page.screenshot({
    path: "test-results/improvements-expense-dialog.png",
  });
});
test("guests overlapping quiet hours require review before saving", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByLabel("What’s on your mind?").fill("Late guests");
  await page.getByRole("combobox", { name: /^Category/ }).selectOption("Guest");
  await page.getByLabel("Starts", { exact: true }).fill("2026-09-17");
  await page.getByLabel("Ends", { exact: true }).fill("2026-09-17");
  await page.getByLabel("Start time (optional)").fill("21:00");
  await page.getByLabel("End time (optional)").fill("23:00");
  await page.getByRole("button", { name: "Save to our home" }).click();
  await expect(page.getByText("Overlaps household quiet hours")).toBeVisible();
  await page
    .getByRole("checkbox", { name: /I’ve reviewed these conflicts/ })
    .check();
  await page.getByRole("button", { name: "Save to our home" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("global search opens matching chores and remains usable on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Search the household" }).click();
  await page
    .getByRole("searchbox", {
      name: "Search all household records",
    })
    .fill("recycling");
  await page.getByRole("button", { name: /Take out recycling/ }).click();
  await page.getByRole("button", { name: /Go to To-dos/ }).click();
  await expect(page.getByRole("dialog", { name: "Edit to-do" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/improvements-mobile-chore.png" });
});
test("household time and personal notification choices survive tab navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Our household", exact: true })
    .first()
    .click();
  await page.getByLabel("Household timezone").fill("America/Los_Angeles");
  await page.getByLabel("Quiet hours start").fill("23:00");
  await page.getByLabel("Quiet hours end").fill("07:00");
  await page.getByRole("button", { name: "Save household time" }).click();
  await expect(page.getByText("Household time settings saved.")).toBeVisible();
  await page.getByLabel("Morning reminder time").fill("09:17");
  await page.getByRole("checkbox", { name: "Shopping", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save notification choices" }).click();
  await expect(
    page.getByText("Your notification preferences saved."),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Our household", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Household timezone")).toHaveValue(
    "America/Los_Angeles",
  );
  await expect(page.getByLabel("Morning reminder time")).toHaveValue("09:17");
  await expect(
    page.getByRole("checkbox", { name: "Shopping", exact: true }),
  ).not.toBeChecked();
});
