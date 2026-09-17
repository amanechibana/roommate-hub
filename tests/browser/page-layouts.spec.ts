import { test, expect } from "@playwright/test";
import { demoData } from "../../lib/model";
import { mockBackground } from "./mock-background";

for (const [width, height] of [
  [1440, 900],
  [1280, 720],
  [1024, 600],
  [800, 568],
  [390, 844],
  [320, 568],
]) {
  test(`navigation and primary content stay reachable at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    if (process.env.PW_SHARED_API) {
      await mockBackground(page);
      const data = demoData();
      // Exercise the actual signed-in frame, including setup and sign-out.
      data.members.push(
        ...Array.from({ length: 9 }, (_, i) => ({
          user_id: `extra-${i}`,
          household_id: data.household.id,
          name: `Housemate ${i}`,
        })),
      );
      await page.route("**/api/session", (route) =>
        route.fulfill({ json: { authenticated: true, member_id: "you" } }),
      );
      await page.route("**/api/home{,?*}", (route) =>
        route.fulfill({
          json: { ...data, member_id: "you", next_cursor: null },
        }),
      );
      await page.route("**/api/expenses{,?*}", (route) =>
        route.fulfill({ json: { expenses: [], balances: {}, summaries: [] } }),
      );
      await page.route("**/api/handbook", (route) =>
        route.fulfill({ json: { entries: [], files: [] } }),
      );
    }
    await page.goto("/?tab=expenses");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("button")).toHaveCount(8);
    await expect(
      nav.getByRole("button", { name: "House handbook" }),
    ).toHaveCount(0);
    const topbar = page.locator(".topbar");
    for (const name of [
      "Needs your attention",
      "House handbook",
      "Search the household",
      "Open household settings",
    ])
      await expect(
        topbar.getByRole("button", { name, exact: true }),
      ).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("heading", { name: "Activity", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("searchbox", { name: "Search expenses" }),
    ).toBeInViewport({ ratio: 1 });
    expect(
      await nav.evaluate((el) => ({
        fits:
          el.scrollHeight <= el.clientHeight + 1 &&
          el.scrollWidth <= el.clientWidth + 1,
      })),
    ).toEqual({ fits: true });
    for (const button of await nav.getByRole("button").all())
      await expect(button).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const summary = page.getByRole("region", {
      name: "Monthly spending summary",
    });
    await expect(summary).toBeVisible();
    expect((await summary.boundingBox())!.height).toBeLessThan(
      width <= 650 ? 180 : 140,
    );
    await page.screenshot({
      path: `test-results/layout-expenses-${width}.png`,
    });
    await topbar
      .getByRole("button", { name: "Needs your attention", exact: true })
      .click();
    await expect(page).toHaveURL(/tab=attention/);
    await topbar
      .getByRole("button", { name: "House handbook", exact: true })
      .click();
    await expect(
      page.getByRole("searchbox", { name: "Search handbook" }),
    ).toBeInViewport({ ratio: 1 });
    await nav.getByRole("button", { name: /^To-dos/ }).click();
    await expect(
      page.getByRole("button", { name: /^Complete / }).first(),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("region", { name: "Weekly chore effort" }),
    ).not.toBeVisible();
    await page
      .getByText("Weekly chore balance and fair assignments", { exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Weekly chore effort" }),
    ).toBeVisible();
  });
}

test("expense details and export remain available below the ledger", async ({
  page,
}) => {
  test.skip(!!process.env.PW_SHARED_API, "Uses the demo ledger.");
  await page.goto("/?tab=expenses");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("What was it for?").fill("Layout groceries");
  await page.getByLabel("Amount ($)", { exact: true }).fill("12.00");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  const row = page.getByRole("button", { name: /Layout groceries/ });
  await expect(row).toBeInViewport({ ratio: 1 });
  const search = page.getByRole("searchbox", { name: "Search expenses" });
  const rowBox = (await row.boundingBox())!;
  expect((await search.boundingBox())!.y).toBeLessThan(rowBox.y);
  expect(
    (await page.getByRole("button", { name: "Export CSV" }).boundingBox())!.y,
  ).toBeGreaterThan(rowBox.y);
  await page.getByText("Spending breakdown", { exact: true }).click();
  await expect(page.getByText("You paid:", { exact: false })).toBeVisible();
  const month = page.getByLabel("Summary month");
  await month.fill("2000-01");
  await expect(
    page.getByRole("region", { name: "Monthly spending summary" }),
  ).toContainText("Jan 2000");
  await expect(
    page
      .getByRole("region", { name: "Monthly spending summary" })
      .locator("strong")
      .first(),
  ).toContainText("$0.00");
  await search.fill("no such expense");
  await expect(row).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe(
    "common-ground-expenses.csv",
  );
});
