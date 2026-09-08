import { test, expect, type Page } from "@playwright/test";
import { demoData } from "../../lib/model";
import type { Expense } from "../../lib/expenses";

test.skip(
  !process.env.PW_SHARED_API,
  "Uses mocked shared household endpoints.",
);

async function household(page: Page, member = "you") {
  const data = demoData();
  data.members = data.members.slice(0, 2);
  data.members[0].name = "Amane";
  data.members[1].name = "Barnatt";
  data.entries = [
    {
      ...data.entries[0],
      id: "barnatt",
      title: "Barnatt chore",
      assignee: "alex",
      date: "2026-09-01",
    },
    {
      ...data.entries[0],
      id: "together",
      title: "Shared chore",
      assignee: null,
      date: "2026-09-02",
    },
    {
      ...data.entries[0],
      id: "mine",
      title: "Amane chore",
      assignee: "you",
      date: "2026-09-09",
    },
  ].map((entry) => ({ ...entry, kind: "task" as const, done: false }));
  await page.route("**/api/session", (route) => {
    if (route.request().method() === "PATCH")
      member = route.request().postDataJSON().member_id;
    return route.fulfill({ json: { authenticated: true, member_id: member } });
  });
  await page.route("**/api/home", (route) =>
    route.fulfill({ json: { ...data, member_id: member } }),
  );
}

test("noticeboard greets the selected person and moves their chores first after switching", async ({
  page,
}) => {
  await household(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome home, Amane." }),
  ).toBeVisible();
  await expect(page.locator(".board-task .board-entry-title")).toHaveText([
    "Amane chore",
    "Barnatt chore",
    "Shared chore",
  ]);
  await page.getByRole("button", { name: "Switch person" }).click();
  await page.getByRole("button", { name: "Barnatt", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome home, Barnatt." }),
  ).toBeVisible();
  await expect(page.locator(".board-task .board-entry-title")).toHaveText([
    "Barnatt chore",
    "Shared chore",
    "Amane chore",
  ]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome home, Barnatt." }),
  ).toBeVisible();
});

for (const member of ["you", "alex"]) {
  test(`wall loads expenses directly and refreshes repayments for ${member}`, async ({
    page,
  }) => {
    await household(page, member);
    await page.clock.install();
    const expense: Expense = {
      id: "expense",
      household_id: "demo",
      kind: "expense",
      title: "Groceries",
      date: "2026-09-07",
      amount_cents: 4600,
      paid_by: "you",
      shares: { you: 2300, alex: 2300 },
      recipient: null,
      created_by: "you",
      created_at: "2026-09-07T12:00:00Z",
    };
    let records = [expense];
    let fail = false;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/expenses", async (route) => {
      await held;
      return fail
        ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
        : route.fulfill({ json: { expenses: records } });
    });
    await page.goto("/?display=1");
    const balance = page.getByLabel("Expense balance");
    await expect(balance).toHaveText("Loading expenses…");
    release();
    const expected =
      member === "you" ? "Barnatt owes you $23.00" : "You owe Amane $23.00";
    await expect(balance).toHaveText(expected);
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(balance).toBeInViewport();
    expect(
      await balance.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    fail = true;
    await page.clock.fastForward(16000);
    await expect(balance).toHaveText("Expense updates unavailable");
    fail = false;
    records = [
      expense,
      {
        ...expense,
        id: "repayment",
        kind: "settlement",
        paid_by: "alex",
        recipient: "you",
        shares: {},
        amount_cents: 2300,
      },
    ];
    await page.clock.fastForward(16000);
    await expect(balance).toHaveText("You’re all settled up");
    records = [];
    await page.clock.fastForward(16000);
    await expect(balance).toHaveText("No shared expenses yet");
  });
}
