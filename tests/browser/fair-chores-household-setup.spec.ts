import { test, expect, type Page } from "@playwright/test";
import { demoData, dateKey, seriesDates, type Entry } from "../../lib/model";
import { mockBackground } from "./mock-background";
test.skip(!process.env.PW_SHARED_API, "Uses a mocked shared household.");
async function mock(page: Page, empty = false, shared = false) {
  await mockBackground(page);
  const data = demoData();
  if (empty) data.entries = [];
  const today = dateKey(new Date());
  if (!empty)
    data.entries = [
      {
        ...data.entries[0],
        id: "bathroom",
        kind: "task",
        category: "Chore",
        title: "Bathroom clean",
        date: today,
        assignee: "you",
        effort_minutes: 45,
        done: false,
        series_id: null,
      },
      {
        ...data.entries[0],
        id: "trash",
        kind: "task",
        category: "Chore",
        title: "Take out trash",
        date: today,
        assignee: "you",
        effort_minutes: 5,
        done: false,
        series_id: null,
      },
    ];
  if (shared)
    data.members.push({
      user_id: "shared",
      household_id: "demo",
      name: "Housemates",
    });
  const writes: any[] = [];
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { authenticated: true } }),
  );
  await page.route("**/api/expenses{,?*}", (route) =>
    route.fulfill({ json: { expenses: [], summaries: [], balances: {} } }),
  );
  let reminders: any = {};
  await page.route("**/api/improvements", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (body.operation === "save_reminders")
        reminders = body.payload.settings;
    }
    return route.fulfill({ json: { household: {}, reminders, coverage: [] } });
  });
  await page.route("**/api/home{,?*}", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (body.operation === "member") {
        data.members.push({
          user_id: "fourth",
          household_id: "demo",
          name: body.payload.name,
        });
        return route.fulfill({ json: { member_id: "fourth" } });
      }
      if (body.operation === "create") {
        const p = body.payload;
        const dates = p.repeat
          ? seriesDates(p.date, p.repeat, p.repeat_until)
          : [p.date];
        const created: Entry[] = dates.map((date, i) => ({
          ...demoData().entries[0],
          ...p,
          date,
          id: p.client_ids[i],
          series_id: p.repeat ? "new-series" : null,
          assignee:
            p.rotation_members?.[i % p.rotation_members.length] ?? p.assignee,
        }));
        data.entries.push(...created);
        return route.fulfill({ json: { entries: created } });
      }
      if (body.operation === "update") {
        data.entries = data.entries.map((e) =>
          e.id === body.payload.id ? { ...e, ...body.payload } : e,
        );
        return route.fulfill({
          json: {
            entries: data.entries.filter((e) => e.id === body.payload.id),
          },
        });
      }
    }
    return route.fulfill({
      json: {
        ...data,
        member_id: shared ? "shared" : "you",
        next_cursor: null,
      },
    });
  });
  return { data, writes };
}
for (const width of [1440, 390]) {
  test(`weekly effort and assignment review work at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mock(page);
    await page.goto("/?tab=To-dos");
    const balance = page.getByRole("region", { name: "Weekly chore effort" });
    await expect(balance).toContainText("50 min planned");
    await expect(balance).toContainText("Take out trash · 5 min");
    await balance
      .getByRole("button", { name: "Review assignment" })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("Who’s on it?")).not.toHaveValue("you");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Next chore week" }).click();
    await expect(balance).toContainText("No chores scheduled");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/roommate-hub-effort-${width}.png`,
      fullPage: true,
    });
  });
}
test("setup links open prefilled recurring bill and chore forms and save a multi-person rotation", async ({
  page,
}) => {
  const { writes } = await mock(page, true);
  await page.goto("/?tab=Our%20household");
  const setup = page.getByRole("region", { name: "Household setup checklist" });
  await expect(setup).toContainText("1 of 4 steps complete");
  await setup
    .getByRole("listitem")
    .filter({ hasText: "Add a recurring bill" })
    .getByRole("button")
    .click();
  await expect(
    page.getByRole("combobox", { name: "Category", exact: true }),
  ).toHaveValue("Bill");
  await expect(
    page.getByRole("combobox", { name: "Repeats", exact: true }),
  ).toHaveValue("monthly");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Our household/ }).click();
  await setup
    .getByRole("listitem")
    .filter({ hasText: "Plan recurring chores" })
    .getByRole("button")
    .click();
  await page.getByLabel("What’s on your mind?").fill("Weekly bathroom");
  await page.getByLabel("Estimated effort (minutes)").fill("45");
  await page
    .getByRole("group", { name: "Take turns with" })
    .getByLabel("Alex", { exact: true })
    .check();
  await page
    .getByRole("group", { name: "Take turns with" })
    .getByLabel("Sam", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save to our home", exact: true })
    .click();
  await expect
    .poll(
      () =>
        writes.find((w) => w.operation === "create")?.payload.rotation_members,
    )
    .toEqual(["you", "alex", "sam"]);
  await page.getByRole("button", { name: /Our household/ }).click();
  await expect(setup).toContainText("2 of 4 steps complete");
  await page.getByLabel("Housemate’s name").fill("Taylor");
  await page
    .getByRole("button", { name: "Invite housemate", exact: true })
    .click();
  await expect(
    page.locator(".member-row").filter({ hasText: "Taylor" }),
  ).toBeVisible();
  await page.getByLabel("Morning digest", { exact: true }).uncheck();
  await page.getByLabel("Evening heads-up", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Save notification choices", exact: true })
    .click();
  await expect(setup).toContainText("3 of 4 steps complete");
  await page.reload();
  await page.getByRole("button", { name: /Our household/ }).click();
  await expect(setup).toContainText("3 of 4 steps complete");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/roommate-hub-setup-390.png",
    fullPage: true,
  });
});
test("shared screens show workload and setup without assignment or setup actions", async ({
  page,
}) => {
  await mock(page, false, true);
  await page.goto("/?tab=To-dos");
  await expect(
    page.getByRole("region", { name: "Weekly chore effort" }),
  ).toContainText("50 min planned");
  for (const button of await page
    .getByRole("button", { name: "Review assignment" })
    .all())
    await expect(button).toBeDisabled();
  await page.getByRole("button", { name: /Our household/ }).click();
  for (const button of await page
    .getByRole("region", { name: "Household setup checklist" })
    .getByRole("button")
    .all())
    await expect(button).toBeDisabled();
});
