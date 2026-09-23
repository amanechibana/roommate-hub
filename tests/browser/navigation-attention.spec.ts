import { test, expect, type Page } from "@playwright/test";
import { mockBackground } from "./mock-background";
import { demoData, type Entry } from "../../lib/model";
import { defaultHouseTerms, type Agreement } from "../../lib/agreements";

test.skip(!process.env.PW_SHARED_API, "Run with the mocked shared API build.");
test.use({ timezoneId: "Pacific/Honolulu" });

async function mockHome(page: Page, timezone = "America/New_York") {
  const data = demoData();
  data.members = data.members.slice(0, 2);
  const base = data.entries[0];
  const entry = (id: string, fields: Partial<Entry>): Entry => ({
    ...base,
    id,
    title: id,
    kind: "task",
    category: "Chore",
    assignee: "you",
    created_by: "you",
    date: "2026-09-18",
    done: false,
    series_id: null,
    ...fields,
  });
  data.entries = [
    entry("Your kitchen chore", {}),
    entry("Other person's chore", { assignee: "alex" }),
    entry("Your unpaid bill", {
      kind: "event",
      category: "Bill",
      amount: 24,
      payment_members: ["you", "alex"],
      paid_by: ["alex"],
    }),
  ];
  const agreement: Agreement = {
    id: "rules",
    household_id: data.household.id,
    slug: "house",
    title: "House agreement awaiting you",
    status: "proposed",
    terms: defaultHouseTerms(["you", "alex"]),
    signed_by: ["alex"],
    proposed_by: "alex",
    proposed_at: "2026-09-17T12:00:00Z",
    created_at: "2026-09-17T12:00:00Z",
    updated_at: "2026-09-17T12:00:00Z",
  };
  let coverage = [
    {
      id: "cover",
      entry_id: data.entries[0].id,
      original: "alex",
      candidate: "you",
      requester: "alex",
      date: "2026-09-19",
      status: "open",
    },
  ];
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json: {
        expenses: [],
        agreements: [],
        amendments: [],
        events: [],
        logs: [],
        departures: [],
        entries: [],
        files: [],
        temperature: 70,
        icon: "sun",
        condition: "Clear",
      },
    }),
  );
  await mockBackground(page);
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { authenticated: true, member_id: "you" } }),
  );
  await page.route("**/api/home{,?*}", (route) => {
    if (route.request().method() === "POST") {
      const { operation, payload } = route.request().postDataJSON();
      if (operation === "edit" || operation === "update")
        data.entries = data.entries.map((e) =>
          e.id === payload.id ? { ...e, ...payload } : e,
        );
      if (operation === "payment")
        data.entries = data.entries.map((e) =>
          e.id === payload.id
            ? {
                ...e,
                paid_by: payload.paid
                  ? [...(e.paid_by ?? []), "you"]
                  : (e.paid_by ?? []).filter((id) => id !== "you"),
              }
            : e,
        );
      return route.fulfill({ json: { entries: data.entries, activity: [] } });
    }
    return route.fulfill({
      json: { ...data, member_id: "you", next_cursor: null },
    });
  });
  await page.route("**/api/agreements", (route) =>
    route.fulfill({
      json: { agreements: [agreement], amendments: [], events: [], logs: [] },
    }),
  );
  await page.route("**/api/improvements", (route) => {
    if (route.request().method() === "POST") {
      const { operation, payload } = route.request().postDataJSON();
      if (operation === "decide_coverage")
        coverage = coverage.filter((r) => r.id !== payload.id);
    }
    return route.fulfill({
      json: { household: { timezone }, reminders: {}, coverage },
    });
  });
  return data;
}

test("refresh, direct URLs, Back and Forward restore the selected page", async ({
  page,
}) => {
  await mockHome(page);
  await page.goto("/?tab=notes");
  await expect(
    page.getByRole("heading", { name: "House notes", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Expenses", exact: true })
    .click();
  await expect(page).toHaveURL(/tab=expenses/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Expenses", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Calendar", exact: true })
    .click();
  await expect(page).toHaveURL(/tab=calendar/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Expenses", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "House notes", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Expenses", exact: true }),
  ).toBeVisible();
});
test("legacy shortcut URLs keep their page after consuming the add request", async ({
  page,
}) => {
  await mockHome(page);
  await page.goto("/?tab=Shopping%20list&add=request&title=Travel%20milk");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/tab=Shopping/);
  await expect(page).not.toHaveURL(/add=/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Shopping list", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("attention uses household today while traveling and supports completing chores and bills", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-18T04:01:00Z"));
  await mockHome(page);
  await page.goto("/?tab=attention");
  const list = page.getByRole("region", { name: "Personal attention list" });
  await expect(list).toContainText("America/New_York");
  await expect(list).toContainText("Due today");
  await expect(list).toContainText("Your share $12");
  await expect(list).not.toContainText("Other person's chore");
  const chore = list
    .locator("li")
    .filter({ hasText: "Your kitchen chore" })
    .filter({
      has: page.getByRole("button", { name: "Mark done", exact: true }),
    });
  await chore.getByRole("button", { name: "Mark done", exact: true }).click();
  await expect(chore).toHaveCount(0);
  const bill = list.locator("li").filter({ hasText: "Your unpaid bill" });
  await bill.getByRole("button", { name: "Mark my share paid" }).click();
  await expect(bill).toHaveCount(0);
});
test("coverage decisions refresh the list and agreement review opens the exact agreement", async ({
  page,
}) => {
  await mockHome(page);
  await page.goto("/?tab=attention");
  await page
    .getByRole("button", { name: "Approve coverage", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve coverage", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review agreement", exact: true })
    .click();
  await expect(page).toHaveURL(/tab=household.*agreement=house/);
  await expect(
    page.getByRole("heading", { name: /THE CLEAN SPLIT — House Living/ }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Needs your attention", exact: true }),
  ).toBeVisible();
});
test("configured timezone controls the overview clock, calendar today and expense defaults", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-17T18:31:00Z"));
  await mockHome(page, "Asia/Kolkata");
  await page.goto("/?display=1");
  await expect(page.locator(".flip-date")).toHaveAttribute(
    "datetime",
    "2026-09-18",
  );
  await page.goto("/?tab=calendar");
  await expect(page.locator(".calendar-cell.is-today")).toContainText("18");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Expenses", exact: true })
    .click();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(
    "2026-09-18",
  );
});
test("visibility choice and person picker explain shared-code access on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockHome(page);
  await page.goto("/?tab=todos");
  await page.getByRole("button", { name: /Add to-do/ }).click();
  await page
    .getByRole("combobox", { name: /^Category/ })
    .selectOption("Personal");
  await expect(
    page.getByRole("checkbox", { name: /Personal view only/ }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "Only your signed-in account can open this item",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Open household settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Change person on this device", exact: true })
    .click();
  await expect(page.getByText(/Enter your own password/)).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});

test("an open attention page rolls over at household midnight without a refresh", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-18T03:59:30Z") });
  await mockHome(page);
  await page.goto("/?tab=attention");
  const bill = page
    .getByRole("region", { name: "Personal attention list" })
    .locator("li")
    .filter({ hasText: "Your unpaid bill" });
  await expect(bill).toContainText("Upcoming");
  await page.clock.fastForward(61000);
  await expect(bill).toContainText("Due today");
});

test("request failures show an incomplete list and can be retried", async ({
  page,
}) => {
  await mockHome(page);
  await page.route("**/api/improvements", (route) =>
    route.fulfill({ status: 503, json: { error: "Temporary failure" } }),
  );
  await page.goto("/?tab=attention");
  await expect(
    page.getByRole("alert").filter({ hasText: "This list may be incomplete" }),
  ).toBeVisible();
  await expect(
    page.getByText("You’re all caught up. Nothing needs your attention."),
  ).toHaveCount(0);
  await page.route("**/api/improvements", (route) =>
    route.fulfill({ json: { household: {}, reminders: {}, coverage: [] } }),
  );
  await page
    .getByRole("button", { name: "Retry requests", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry requests", exact: true }),
  ).toHaveCount(0);
});
