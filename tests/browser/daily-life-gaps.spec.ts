import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.skip(
  !!process.env.PW_SHARED_API,
  "Demo flows; SQL tests verify persistence and conflict protection.",
);

test("weekday chores can be searched, edited, and undone", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "To-do", exact: true }).click();
  await page.getByLabel("What’s on your mind?").fill("Trash collection");
  await page.getByLabel("Due date (optional)").fill("2026-09-15");
  await page
    .getByRole("combobox", { name: "Repeats", exact: true })
    .selectOption("weekdays");
  await page.getByLabel("Repeat until", { exact: true }).fill("2026-09-29");
  // The initial day follows the dialog's original start; select only Tue/Fri.
  for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
    await page
      .getByRole("checkbox", { name: day, exact: true })
      .setChecked(["Tue", "Fri"].includes(day));
  }
  await expect(page.getByText(/5 occurrences/)).toBeVisible();
  await page
    .getByRole("button", { name: "Save to our home", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^To-dos/ })
    .click();
  await page
    .getByRole("searchbox", { name: "Search to-dos" })
    .fill("trash collection");
  await expect(page.locator(".task-row")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Actions for Trash collection", exact: true })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await page.getByLabel("What’s on your mind?").fill("Wrong collection");
  await page
    .getByRole("button", { name: "Save to our home", exact: true })
    .click();
  await page
    .locator(".toast")
    .filter({ hasText: "Saved changes" })
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(page.locator(".task-row")).toHaveCount(5);
  await page
    .getByRole("searchbox", { name: "Search to-dos" })
    .fill("missing collection");
  await expect(page.locator(".task-row")).toHaveCount(0);
});

test("ledger export includes full purchases even while search filters the screen; edit undo restores balances", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Expenses", exact: true })
    .click();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("What was it for?").fill("Dinner records");
  await page.getByLabel("Amount ($)", { exact: true }).fill("2.01");
  await page.getByRole("checkbox", { name: /Sam/ }).uncheck();
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await page.getByRole("button", { name: /Dinner records/ }).click();
  await page.getByLabel("Amount ($)", { exact: true }).fill("3.01");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await page
    .locator(".toast")
    .filter({ hasText: "Saved changes" })
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search expenses" })
    .fill("missing");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const file = await download;
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(data.expenses).toHaveLength(1);
  expect(data.expenses[0].amount_cents).toBe(201);
});

test("handbook searches saved values and notes", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "House handbook", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search handbook" })
    .fill("router shelf");
  await expect(
    page.getByRole("heading", { name: "Home Wi-Fi", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Collection", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search handbook" })
    .fill("welcome-home");
  await expect(
    page.getByRole("heading", { name: "Home Wi-Fi", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search handbook" })
    .fill("dishwasher");
  await expect(
    page.getByRole("heading", { name: "Home Wi-Fi", exact: true }),
  ).toHaveCount(0);
});

test("weather outlook opens without consuming the short display's board space", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.route("**/api/weather**", (route) =>
    route.fulfill({
      json: {
        temperature: 70,
        feelsLike: 70,
        description: "Clear",
        icon: "sun",
        high: 80,
        low: 60,
        precipitation: 0,
        forecast: [
          {
            date: "2026-09-16",
            high: 80,
            low: 60,
            precipitation: 0,
            description: "Clear",
          },
          {
            date: "2026-09-17",
            high: 75,
            low: 58,
            precipitation: 60,
            description: "Rain",
          },
          {
            date: "2026-09-19",
            high: 72,
            low: 55,
            precipitation: 20,
            description: "Cloudy",
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Tomorrow & weekend weather", exact: true })
    .click();
  await expect(
    page.getByText("Tomorrow: Rain", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Sat: Cloudy", { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: "Close forecast", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
});

test("agreement notification links land on household settings", async ({
  page,
}) => {
  await page.goto("/?tab=Our%20household");
  await expect(
    page.getByRole("heading", { name: "Our household", exact: true }),
  ).toBeVisible();
});
