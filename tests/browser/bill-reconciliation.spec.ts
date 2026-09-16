import { test, expect } from "@playwright/test";
import { demoData } from "../../lib/model";
import { billPaymentValues } from "../../lib/bill-posting";
import type { Expense } from "../../lib/expenses";
test.skip(
  !process.env.PW_SHARED_API,
  "Run against the mocked shared API server.",
);

test("covering a partially paid bill posts only unpaid shares and deletion restores those checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  const data = demoData();
  data.members = data.members.slice(0, 2);
  let expenses: Expense[] = [];
  const bill = data.entries.find((e) => e.category === "Rent")!;
  bill.amount = 50.01;
  bill.paid_by = ["alex"];
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json: {
        departures: [],
        temperature: 70,
        icon: "sun",
        condition: "Clear",
        high: 73,
        low: 65,
        station: "Journal Square",
        agreements: [],
        amendments: [],
        events: [],
        logs: [],
      },
    }),
  );
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { authenticated: true, member_id: "you" } }),
  );
  await page.route("**/api/expenses", (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON().operation).toBe("delete");
      expenses = [];
      bill.paid_by = ["alex"];
    }
    return route.fulfill({ json: { expenses } });
  });
  await page.route("**/api/home{,?*}", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { ...data, member_id: "you", next_cursor: null },
      });
    const body = route.request().postDataJSON();
    expect(body.operation).toBe("payment");
    expect(body.payload).toEqual({ id: bill.id, paid: true, cover: true });
    const values = billPaymentValues(bill, "you", true)!;
    expenses = [
      {
        ...values,
        id: "linked-bill",
        household_id: data.household.id,
        created_by: "you",
        created_at: new Date().toISOString(),
      },
    ];
    bill.paid_by = ["you", "alex"];
    return route.fulfill({
      json: { ok: true, expense: expenses[0], entries: [bill] },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: bill.title, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Log my share to Expenses" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "I covered the remaining shares — split them",
    })
    .click();
  await expect.poll(() => expenses.length).toBe(1);
  expect(expenses[0].amount_cents).toBe(2500);
  expect(expenses[0].shares).toEqual({ you: 2500 });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Expenses", exact: true })
    .click();
  await page.getByRole("button", { name: new RegExp(bill.title) }).click();
  await page
    .getByRole("button", { name: "Delete expense", exact: true })
    .click();
  await expect.poll(() => expenses.length).toBe(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await page.getByRole("button", { name: bill.title, exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "I covered the remaining shares — split them",
    }),
  ).toBeVisible();
});
