import { test, expect, type Page } from "@playwright/test";
import { demoData } from "../../lib/model";
test.skip(
  !process.env.PW_SHARED_API,
  "Run against the mocked shared API server.",
);
async function mock(page: Page) {
  const data = demoData();
  data.members = data.members.slice(0, 2);
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
        polls: [],
        votes: [],
        pantry: [],
        maintenance: [],
        meals: [],
        photos: [],
        targets: [],
        categories: [],
      },
    }),
  );
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { authenticated: true, member_id: "you" } }),
  );
  await page.route("**/api/home{,?*}", (route) =>
    route.fulfill({ json: { ...data, member_id: "you", next_cursor: null } }),
  );
  return data;
}
test("household search finds old records, shows details and opens the exact entry", async ({
  page,
}) => {
  const data = await mock(page);
  const entry = {
    ...data.entries[0],
    id: "historic",
    title: "Historic chore",
    description: "Old kettle cleaning",
    done: true,
    last_done_at: "2026-09-12T15:00:00Z",
    last_done_by: "alex",
  };
  await page.route("**/api/search?*", (route) =>
    route.fulfill({
      json: {
        results: [
          {
            key: "entry:historic",
            tab: "To-dos",
            title: entry.title,
            detail: entry.description,
            entry,
          },
        ],
        next_offset: null,
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Search the household", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search all household records" })
    .fill("kettle");
  await page.getByRole("button", { name: /Historic chore/ }).click();
  await expect(
    page.getByRole("dialog").getByText("Old kettle cleaning", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open To-dos", exact: true }).click();
  await expect(page.getByLabel("What’s on your mind?")).toHaveValue(
    "Historic chore",
  );
});
test("custom bill shares validate totals and are sent to the server as cents", async ({
  page,
}) => {
  const data = await mock(page);
  let payload: any;
  await page.route("**/api/home", (route) => {
    if (route.request().method() === "POST") {
      payload = route.request().postDataJSON().payload;
      return route.fulfill({
        json: {
          entries: [
            { ...data.entries.find((e) => e.category === "Rent"), ...payload },
          ],
          activity: [],
        },
      });
    }
    return route.fulfill({ json: { ...data, member_id: "you" } });
  });
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Calendar", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Rent is due/ })
    .first()
    .click();
  await page.getByLabel("Adjust each person’s share").check();
  await page.getByLabel("You’s bill share ($)").fill("1400");
  await page.getByLabel("Alex’s bill share ($)").fill("900");
  await page
    .getByRole("button", { name: "Save to our home", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("add up");
  await page.getByLabel("Alex’s bill share ($)").fill("1000");
  await page
    .getByRole("button", { name: "Save to our home", exact: true })
    .click();
  await expect
    .poll(() => payload?.bill_shares)
    .toEqual({ you: 140000, alex: 100000 });
});
test("last done remains visible after a chore is reopened", async ({
  page,
}) => {
  const data = await mock(page);
  data.entries[0] = {
    ...data.entries[0],
    done: false,
    last_done_at: "2026-09-12T15:00:00Z",
    last_done_by: "alex",
  };
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^To-dos/ })
    .click();
  await expect(
    page.locator(".task-row").filter({ hasText: data.entries[0].title }),
  ).toContainText("Last done");
  await expect(
    page.locator(".task-row").filter({ hasText: data.entries[0].title }),
  ).toContainText("by Alex");
});
test("offline shopping survives reload and syncs a queued check-off once", async ({
  page,
  context,
}) => {
  const data = await mock(page);
  let posted = 0;
  await page.route("**/api/shopping/sync", (route) => {
    posted++;
    const body = route.request().postDataJSON();
    return route.fulfill({
      json: {
        ok: true,
        entry: {
          ...data.entries.find((e) => e.id === body.id),
          done: body.done,
          completed_at: new Date().toISOString(),
        },
      },
    });
  });
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(
        () => !!localStorage.getItem("common-ground-offline-shopping-v1"),
      ),
    )
    .toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.goto("/offline-shopping.html");
  await context.setOffline(true);
  await page
    .getByRole("checkbox", { name: "Bought Olive oil", exact: true })
    .check();
  await expect(page.getByRole("status")).toContainText("1 change");
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Bought Olive oil", exact: true }),
  ).toBeChecked();
  await context.setOffline(false);
  await expect.poll(() => posted).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("common-ground-offline-shopping-queue-v1") ||
              "[]",
          ).length,
      ),
    )
    .toBe(0);
  await page.getByRole("button", { name: "Sync now" }).click();
  expect(posted).toBe(1);
});

test("offline conflicts retain the local change until the latest household version is chosen", async ({
  page,
  context,
}) => {
  const data = await mock(page);
  await page.route("**/api/shopping/sync", (route) =>
    route.fulfill({
      json: {
        conflict: true,
        error: "This item changed while you were offline. Review it at home.",
        entry: { ...data.entries.find((e) => e.id === "6"), done: true },
      },
    }),
  );
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(
        () => !!localStorage.getItem("common-ground-offline-shopping-v1"),
      ),
    )
    .toBe(true);
  await page.goto("/offline-shopping.html");
  await context.setOffline(true);
  await page
    .getByRole("checkbox", { name: "Bought Olive oil", exact: true })
    .check();
  await context.setOffline(false);
  await expect(
    page.getByRole("button", { name: "Use latest household version" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("common-ground-offline-shopping-queue-v1") ||
              "[]",
          ).length,
      ),
    )
    .toBe(1);
  await page
    .getByRole("button", { name: "Use latest household version" })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("common-ground-offline-shopping-queue-v1") ||
              "[]",
          ).length,
      ),
    )
    .toBe(0);
  await expect(
    page.getByRole("checkbox", { name: "Bought Olive oil", exact: true }),
  ).toBeChecked();
});

test("shared screens read the saved shopping list without changing it", async ({
  page,
}) => {
  const data = await mock(page);
  data.members.push({
    user_id: "shared",
    household_id: "demo",
    name: "Housemates",
  });
  await page.route("**/api/home{,?*}", (route) =>
    route.fulfill({
      json: { ...data, member_id: "shared", next_cursor: null },
    }),
  );
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(
        () => !!localStorage.getItem("common-ground-offline-shopping-v1"),
      ),
    )
    .toBe(true);
  await page.goto("/offline-shopping.html");
  await expect(
    page.getByRole("checkbox", { name: "Bought Olive oil", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Shared screen");
});

test("search and saved shopping fit a narrow phone viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Search the household", exact: true })
    .click();
  await expect(
    page.getByRole("searchbox", { name: "Search all household records" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Close search" }).click();
  await page.goto("/offline-shopping.html");
  await expect(
    page.getByRole("checkbox", { name: "Bought Olive oil", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
