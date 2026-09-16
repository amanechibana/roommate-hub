import { test, expect, type Page } from "@playwright/test";
import { demoData, type Entry } from "../../lib/model";
import { mockBackground } from "./mock-background";
test.skip(
  !process.env.PW_SHARED_API,
  "Requires a build with mock public Supabase settings; no live data is used.",
);
async function mockHousehold(page: Page) {
  await mockBackground(page);
  const data = demoData();
  data.members = data.members.slice(0, 2);
  data.members[0].name = "Amane";
  data.members[1].name = "Barnatt";
  let selected = "you";
  const writes: any[] = [];
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { authenticated: true } }),
  );
  await page.route("**/api/expenses{,?*}", (route) =>
    route.fulfill({
      json: { expenses: [], balances: { you: 0, alex: 0 }, summaries: [] },
    }),
  );
  await page.route("**/api/home{,?*}", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { ...data, member_id: selected, next_cursor: null },
      });
    const body = route.request().postDataJSON();
    writes.push(body);
    let entries: Entry[] = [];
    if (body.operation === "create") {
      const entry: Entry = {
        ...data.entries[0],
        ...body.payload,
        id: body.payload.client_ids[0],
        created_by: selected,
      };
      data.entries.unshift(entry);
      entries = [entry];
    } else if (body.operation === "update")
      data.entries = data.entries.map((entry) =>
        entry.id === body.payload.id ? { ...entry, ...body.payload } : entry,
      );
    return route.fulfill({ json: { entries } });
  });
  return {
    data,
    writes,
    changePerson: () => {
      selected = "alex";
    },
  };
}
test("offline creates and completion survive reload and replay with the original stable ID", async ({
  page,
  context,
}) => {
  const mocked = await mockHousehold(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "To-do", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.getByRole("button", { name: "To-do", exact: true }).click();
  await page.getByLabel("What’s on your mind?").fill("Offline plant care");
  await page.getByRole("button", { name: "Save to our home" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^To-dos/ })
    .click();
  await page
    .getByRole("button", { name: "Complete Offline plant care", exact: true })
    .click();
  await expect(page.locator(".offline-banner")).toContainText(
    "2 changes waiting",
  );
  expect(mocked.writes).toHaveLength(0);
  await page.reload();
  await expect(page.locator(".offline-banner")).toContainText(
    "2 changes waiting",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^To-dos/ })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Reopen Offline plant care",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await context.setOffline(false);
  await expect.poll(() => mocked.writes.length).toBe(2);
  expect(mocked.writes[1].payload.id).toBe(
    mocked.writes[0].payload.client_ids[0],
  );
  expect(mocked.writes[0].payload.mutation_id).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.locator(".offline-banner")).toHaveCount(0);
});
test("a changed selected person pauses offline replay until changes are reviewed", async ({
  page,
  context,
}) => {
  const mocked = await mockHousehold(page);
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^To-dos/ })
    .click();
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Complete Take out recycling", exact: true })
    .click();
  await expect(page.locator(".offline-banner")).toContainText(
    "1 change waiting",
  );
  mocked.changePerson();
  await context.setOffline(false);
  await expect(page.locator(".offline-banner")).toContainText(
    "selected person changed",
  );
  expect(mocked.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Review queued changes" }).click();
  await page.getByRole("button", { name: "Discard change" }).click();
  await expect(page.locator(".offline-banner")).toHaveCount(0);
});
