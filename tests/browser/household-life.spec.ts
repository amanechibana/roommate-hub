import { test, expect } from "@playwright/test";
import { mockBackground } from "./mock-background";
import { emptyLife } from "../../lib/household-life";
test.use({ timezoneId: "America/New_York" });
async function openLife(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Household life", exact: true })
    .click();
}
async function section(page: import("@playwright/test").Page, name: string) {
  await page
    .getByRole("toolbar", { name: "Household life sections" })
    .getByRole("button", { name, exact: true })
    .click();
}
test("poll votes can change, close at the deadline, and preserve a final decision across navigation", async ({
  page,
}) => {
  test.skip(!!process.env.PW_SHARED_API, "Demo flow");
  await page.clock.install({ time: new Date("2026-09-16T14:00:00Z") });
  await openLife(page);
  await page.getByRole("button", { name: "New poll", exact: true }).click();
  await page.getByLabel("Question", { exact: true }).fill("Buy the vacuum?");
  await page.getByLabel("Voting deadline").fill("2026-09-16T10:01");
  await page.getByRole("button", { name: "Save poll", exact: true }).click();
  const poll = page.getByRole("article", {
    name: "Buy the vacuum?",
    exact: true,
  });
  await expect(poll).toBeVisible();
  await poll.getByRole("button", { name: "Yes 0", exact: true }).click();
  await expect(
    poll.getByRole("button", { name: "Yes 1", exact: true }),
  ).toBeVisible();
  await poll.getByRole("button", { name: "No 0", exact: true }).click();
  await expect(
    poll.getByRole("button", { name: "Yes 0", exact: true }),
  ).toBeVisible();
  await expect(
    poll.getByText(/1 of 3 housemates voted anonymously/),
  ).toBeVisible();
  await expect(poll.locator("[aria-pressed]")).toHaveCount(0);
  await expect(poll.getByText("Amane", { exact: true })).toHaveCount(0);
  await page.clock.fastForward(61_000);
  await expect(
    poll.getByRole("button", { name: "No 1", exact: true }),
  ).toBeDisabled();
  await poll
    .getByLabel("Final decision")
    .fill("Keep our current vacuum and replace the filter.");
  await poll
    .getByRole("button", { name: "Save decision", exact: true })
    .click();
  await expect(
    poll.getByText("Keep our current vacuum and replace the filter."),
  ).toBeVisible();
  await section(page, "Pantry & supplies");
  await section(page, "Quick polls");
  await expect(
    poll.getByText("Keep our current vacuum and replace the filter."),
  ).toBeVisible();
});
test("low staples and missing dinner ingredients feed shopping once, and meals update the calendar", async ({
  page,
}) => {
  test.skip(!!process.env.PW_SHARED_API, "Demo flow");
  await openLife(page);
  await section(page, "Pantry & supplies");
  await page
    .getByRole("button", { name: "Track a staple", exact: true })
    .click();
  await page.getByLabel("Staple name").fill("Test rice");
  await page
    .getByRole("combobox", { name: "Stock level", exact: true })
    .selectOption("low");
  await page.getByRole("button", { name: "Save staple", exact: true }).click();
  const rice = page.getByRole("article", { name: "Test rice", exact: true });
  await rice
    .getByRole("button", { name: "Add to shopping", exact: true })
    .click();
  await expect(
    rice.getByText("On the shopping list", { exact: true }),
  ).toBeVisible();
  await section(page, "Meal planning");
  await page.getByRole("button", { name: "Plan dinner", exact: true }).click();
  await page.getByLabel("Dinner name").fill("Rice and beans dinner");
  await page.getByLabel("Dinner date").fill("2026-09-20");
  await page
    .getByLabel("Ingredients (one per line)")
    .fill("Test rice\nTest beans\nTest oil");
  await page.getByRole("checkbox", { name: "Test oil", exact: true }).check();
  await page.getByRole("button", { name: "Save dinner", exact: true }).click();
  const dinner = page.getByRole("article", {
    name: "Rice and beans dinner",
    exact: true,
  });
  await dinner
    .getByRole("button", {
      name: "Send missing ingredients to shopping",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Added 1 item to shopping." }),
  ).toBeVisible();
  await dinner
    .getByRole("button", {
      name: "Send missing ingredients to shopping",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Everything needed is already on the shopping list.",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open shopping list", exact: true })
    .click();
  await expect(
    page.locator(".shopping-row").filter({ hasText: "Test rice" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".shopping-row").filter({ hasText: "Test beans" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".shopping-row").filter({ hasText: "Test oil" }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Calendar", exact: true })
    .click();
  await expect(
    page.getByText("Rice and beans dinner", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Household life", exact: true })
    .click();
  await section(page, "Meal planning");
  await dinner
    .getByRole("button", { name: "Edit Rice and beans dinner", exact: true })
    .click();
  await page.getByLabel("Dinner name").fill("Updated shared dinner");
  await page.getByRole("button", { name: "Save dinner", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Calendar", exact: true })
    .click();
  await expect(
    page.getByText("Updated shared dinner", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Rice and beans dinner", { exact: true }),
  ).toHaveCount(0);
});
test("repairs attach photos, retain resolution, and can reopen", async ({
  page,
}) => {
  test.skip(!!process.env.PW_SHARED_API, "Demo flow");
  await openLife(page);
  await section(page, "Maintenance");
  await page
    .getByRole("button", { name: "Report a repair", exact: true })
    .click();
  await page.getByLabel("What needs fixing?").fill("Leaky washer");
  await page.getByLabel("Problem details").fill("Water near the drain");
  await page.getByLabel("Follow-up assigned to").selectOption({ label: "Sam" });
  await page.getByRole("button", { name: "Save request", exact: true }).click();
  const repair = page.getByRole("article", {
    name: "Leaky washer",
    exact: true,
  });
  await expect(repair.getByText(/Follow-up: Sam/)).toBeVisible();
  await repair.getByLabel("Attach photo to Leaky washer").setInputFiles({
    name: "leak.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(
    repair.getByRole("img", { name: "leak.png", exact: true }),
  ).toBeVisible();
  await repair
    .getByRole("button", { name: "Edit Leaky washer", exact: true })
    .click();
  await page.getByLabel("Repair status").selectOption("resolved");
  await page
    .getByLabel("Resolution / follow-up notes")
    .fill("Replaced the drain hose");
  await page.getByRole("button", { name: "Save request", exact: true }).click();
  await expect(
    repair.getByText("Replaced the drain hose", { exact: true }),
  ).toBeVisible();
  await repair
    .getByRole("button", { name: "Edit Leaky washer", exact: true })
    .click();
  await page.getByLabel("Repair status").selectOption("in_progress");
  await page.getByRole("button", { name: "Save request", exact: true }).click();
  await expect(repair.getByText(/In progress/)).toBeVisible();
  await repair
    .getByRole("button", { name: "Remove photo leak.png", exact: true })
    .click();
  await expect(repair.getByRole("img")).toHaveCount(0);
});
test("budget classifies existing expenses and keeps month-specific targets", async ({
  page,
}) => {
  test.skip(!!process.env.PW_SHARED_API, "Demo flow");
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Expenses", exact: true })
    .click();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("What was it for?").fill("Budget test groceries");
  await page.getByLabel("Amount ($)", { exact: true }).fill("12.34");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Household life", exact: true })
    .click();
  await section(page, "Budget");
  await page.getByLabel("Monthly groceries target ($)").fill("100");
  await page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: "Groceries", exact: true }),
    })
    .getByRole("button", { name: "Save target", exact: true })
    .click();
  await page
    .getByLabel("Budget category for Budget test groceries")
    .selectOption("groceries");
  await expect(
    page.getByText("$87.66 remaining", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Budget month").fill("2026-08");
  await expect(page.getByLabel("Monthly groceries target ($)")).toHaveValue("");
  await expect(
    page.getByLabel("Budget category for Budget test groceries"),
  ).toHaveCount(0);
});
test("mobile household life fits the viewport", async ({ page }) => {
  test.skip(!!process.env.PW_SHARED_API, "Demo flow");
  await page.setViewportSize({ width: 390, height: 844 });
  await openLife(page);
  for (const name of [
    "Pantry & supplies",
    "Maintenance",
    "Meal planning",
    "Budget",
    "Quick polls",
  ]) {
    await section(page, name);
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  }
  await page.screenshot({
    path: "/tmp/roommate-hub-life-mobile.png",
    fullPage: true,
  });
});
test("a shared screen reads household life without mutation controls", async ({
  page,
}) => {
  await mockBackground(page);
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { authenticated: true } }),
  );
  const household = { id: "house", name: "Test home" };
  const members = [
    { household_id: "house", user_id: "a", name: "Alex" },
    { household_id: "house", user_id: "screen", name: "Housemates" },
  ];
  await page.route("**/api/home*", (route) =>
    route.fulfill({
      json: { household, members, entries: [], member_id: "screen" },
    }),
  );
  await page.route("**/api/expenses", (route) =>
    route.fulfill({ json: { expenses: [] } }),
  );
  await page.route("**/api/household-life", (route) =>
    route.fulfill({
      json: {
        ...emptyLife(),
        pantry: [
          { id: "rice", title: "Shared rice", status: "low", notes: "" },
        ],
        photos_enabled: false,
      },
    }),
  );
  // A separate configured build enables signed-in route mocks.
  test.skip(
    !process.env.PW_SHARED_API,
    "Requires configured public Supabase environment",
  );
  await openLife(page);
  await expect(
    page.getByRole("button", { name: "New poll", exact: true }),
  ).toHaveCount(0);
  await section(page, "Pantry & supplies");
  await expect(
    page.getByRole("heading", { name: "Shared rice", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Track a staple", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add to shopping", exact: true }),
  ).toHaveCount(0);
});

test("saved household records load across reloads and a rejected write keeps the draft open", async ({
  page,
}) => {
  test.skip(
    !process.env.PW_SHARED_API,
    "Requires configured public Supabase environment",
  );
  await mockBackground(page);
  const household = { id: "house", name: "Test home" };
  const members = [
    { household_id: "house", user_id: "a", name: "Alex" },
    { household_id: "house", user_id: "b", name: "Sam" },
  ];
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { authenticated: true } }),
  );
  await page.route("**/api/home*", (route) =>
    route.fulfill({
      json: { household, members, entries: [], member_id: "a" },
    }),
  );
  await page.route("**/api/expenses", (route) =>
    route.fulfill({ json: { expenses: [] } }),
  );
  let snapshot = {
    ...emptyLife(),
    polls: [
      {
        id: "poll",
        title: "Saved vacuum question",
        options: ["Yes", "No"],
        deadline: "2026-01-01T12:00:00Z",
        decision: "Buy the quieter vacuum.",
        decided_by: "b",
        decided_at: "2026-01-01T12:01:00Z",
        created_by: "a",
        created_at: "2026-01-01T10:00:00Z",
      },
    ],
    pantry: [
      {
        id: "rice",
        title: "Saved rice",
        status: "low" as const,
        notes: "Large bag",
      },
    ],
  };
  let reject = true;
  await page.route("**/api/household-life", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.operation).toBe("pantry_save");
      expect(body.payload.actor).toBeUndefined();
      expect(body.payload.title).toBe("Updated rice");
      if (reject) {
        await route.fulfill({
          status: 400,
          json: { error: "This staple is already tracked.", rejected: true },
        });
        return;
      }
      snapshot = {
        ...snapshot,
        pantry: [
          {
            ...snapshot.pantry[0],
            title: body.payload.title,
            notes: body.payload.notes,
          },
        ],
      };
    }
    await route.fulfill({ json: { ...snapshot, photos_enabled: false } });
  });
  await openLife(page);
  await expect(
    page.getByText("Buy the quieter vacuum.", { exact: true }),
  ).toBeVisible();
  await section(page, "Pantry & supplies");
  await page
    .getByRole("button", { name: "Edit Saved rice", exact: true })
    .click();
  await page.getByLabel("Staple name").fill("Updated rice");
  await page.getByRole("button", { name: "Save staple", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Staple name")).toHaveValue("Updated rice");
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "This staple is already tracked.",
  );
  reject = false;
  await page.getByRole("button", { name: "Save staple", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Updated rice", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Household life", exact: true })
    .click();
  await section(page, "Pantry & supplies");
  await expect(
    page.getByRole("heading", { name: "Updated rice", exact: true }),
  ).toBeVisible();
});

test("anonymous poll totals survive voting, reload, and switching people without revealing ballots", async ({
  page,
}) => {
  test.skip(!process.env.PW_SHARED_API, "Requires mocked shared API build");
  await mockBackground(page);
  let member = "a";
  const members = [
    { household_id: "house", user_id: "a", name: "Alex" },
    { household_id: "house", user_id: "b", name: "Sam" },
    { household_id: "house", user_id: "screen", name: "Housemates" },
  ];
  await page.route("**/api/session", async (route) => {
    if (route.request().method() === "PATCH")
      member = route.request().postDataJSON().member_id;
    await route.fulfill({ json: { authenticated: true, member_id: member } });
  });
  await page.route("**/api/home{,?*}", (route) =>
    route.fulfill({
      json: {
        household: { id: "house", name: "Test home" },
        members,
        entries: [],
        member_id: member,
      },
    }),
  );
  await page.route("**/api/expenses", (route) =>
    route.fulfill({ json: { expenses: [] } }),
  );
  const snapshot = {
    ...emptyLife(),
    polls: [
      {
        id: "anonymous",
        title: "Anonymous vacuum poll",
        options: ["Yes", "No"],
        deadline: "2099-01-01T12:00:00Z",
        decision: null,
        decided_by: null,
        decided_at: null,
        created_by: "a",
        created_at: "2026-09-17T12:00:00Z",
      },
    ],
    votes: [{ poll_id: "anonymous", choice: 0, count: 2 }],
  };
  await page.route("**/api/household-life", async (route) => {
    if (route.request().method() === "POST") {
      const { operation, payload } = route.request().postDataJSON();
      expect(operation).toBe("poll_vote");
      expect(payload).toEqual({ id: "anonymous", choice: 1 });
      snapshot.votes = [
        { poll_id: "anonymous", choice: 0, count: 1 },
        { poll_id: "anonymous", choice: 1, count: 1 },
      ];
    }
    await route.fulfill({ json: snapshot });
  });
  await openLife(page);
  const poll = page.getByRole("article", {
    name: "Anonymous vacuum poll",
    exact: true,
  });
  await expect(
    poll.getByRole("button", { name: "Yes 2", exact: true }),
  ).toBeVisible();
  await poll.getByRole("button", { name: "No 0", exact: true }).click();
  await expect(
    poll.getByRole("button", { name: "No 1", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Your anonymous vote was saved." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    poll.getByText(/2 of 2 housemates voted anonymously/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Switch person (now Alex)", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Sam", exact: true })
    .fill("test-password-123");
  await page.getByRole("button", { name: "Sam", exact: true }).click();
  await expect(
    poll.getByRole("button", { name: "Yes 1", exact: true }),
  ).toBeVisible();
  await expect(
    poll.getByText(/2 of 2 housemates voted anonymously/),
  ).toBeVisible();
  await expect(poll.getByText(/Alex|Sam/)).toHaveCount(0);
  await expect(poll.locator("[aria-pressed]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Switch person (now Sam)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "This is a shared screen", exact: true })
    .click();
  await expect(
    poll.getByRole("button", { name: "Yes 1", exact: true }),
  ).toBeDisabled();
  await expect(poll.getByText(/Alex|Sam/)).toHaveCount(0);
});
