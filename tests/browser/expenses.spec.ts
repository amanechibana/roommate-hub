import { test, expect } from "@playwright/test";
import { demoData } from "../../lib/model";
import type { Expense } from "../../lib/expenses";

test("expenses calculate, survive tab changes, edit and record repayments", async ({
  page,
}) => {
  test.skip(!!process.env.PW_SHARED_API);
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Expenses", exact: true })
    .click();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("What was it for?").fill("Weekly groceries");
  await page.getByLabel("Amount ($)", { exact: true }).fill("60.00");
  await page.getByRole("checkbox", { name: /Sam/ }).uncheck();
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByText("Owed to you", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Calendar", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Expenses", exact: true })
    .click();
  await page.getByRole("button", { name: /Weekly groceries/ }).click();
  await page.getByLabel("Amount ($)", { exact: true }).fill("80.00");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByText("$40.00", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Record paid", exact: true }).click();
  await expect(page.getByLabel("Amount ($)", { exact: true })).toHaveValue(
    "40.00",
  );
  await page
    .getByRole("button", { name: "Save repayment", exact: true })
    .click();
  await expect(
    page.getByText("You’re settled up", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("$80.00", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: /Alex paid You/ }).click();
  await page
    .getByRole("button", { name: "Delete repayment", exact: true })
    .click();
  await expect(page.getByText("Owed to you", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/expenses-desktop.png" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: /Weekly groceries/ }).click();
    await expect(page.getByRole("dialog")).toBeInViewport();
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: `test-results/expenses-${width}.png`,
      fullPage: true,
    });
  }
});

test("a bought shopping item turns its estimate into a real expense", async ({
  page,
}) => {
  test.skip(!!process.env.PW_SHARED_API);
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Expenses", exact: true })
    .click();
  await expect(page.getByText("Pending from the shopping list")).toBeVisible();
  await expect(
    page.getByText("$60.00 estimated", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Shopping list" })
    .click();
  await page.getByRole("button", { name: "Mark as bought: Olive oil" }).click();
  await expect(page.getByText(/Logged \$12\.00 to expenses/)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Expenses", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Olive oil/ })).toBeVisible();
  await expect(page.getByText("$12.00", { exact: true })).toHaveCount(2);
  await expect(
    page.getByText("$48.00 estimated", { exact: true }),
  ).toBeVisible();
});

test("shared expenses save optimistically without refetch and recover failed deletion", async ({
  page,
}) => {
  test.skip(!process.env.PW_SHARED_API);
  const data = demoData();
  data.members = data.members.slice(0, 2);
  let records: Expense[] = [];
  let gets = 0;
  let fail = false;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { authenticated: true, member_id: "you" } }),
  );
  await page.route("**/api/home", (route) =>
    route.fulfill({ json: { ...data, member_id: "you" } }),
  );
  await page.route("**/api/expenses", async (route) => {
    if (route.request().method() === "GET") {
      gets++;
      return route.fulfill({ json: { expenses: records } });
    }
    const { operation, payload } = route.request().postDataJSON();
    await held;
    if (fail)
      return route.fulfill({ status: 400, json: { error: "Could not save" } });
    if (operation === "create")
      records.push({
        ...payload,
        household_id: "demo",
        created_by: "you",
        created_at: new Date().toISOString(),
      });
    return route.fulfill({ json: { expense: records.at(-1) } });
  });
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Expenses", exact: true })
    .click();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("What was it for?").fill("Shared internet");
  await page.getByLabel("Amount ($)", { exact: true }).fill("50.01");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Shared internet/ }),
  ).toBeVisible();
  expect(records).toHaveLength(0);
  expect(gets).toBe(1);
  release();
  await expect.poll(() => records.length).toBe(1);
  expect(gets).toBe(1);
  fail = true;
  await page.getByRole("button", { name: /Shared internet/ }).click();
  await page
    .getByRole("button", { name: "Delete expense", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Couldn’t save" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Shared internet/ }),
  ).toBeVisible();
  expect(gets).toBe(2);
});
