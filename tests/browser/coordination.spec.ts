import { test, expect } from "@playwright/test";
import { demoData, dateKey, shiftDay } from "../../lib/model";
import { emptyPlanning } from "../../lib/coordination";
import { mockBackground } from "./mock-background";

for (const mobile of [false, true]) {
  test(`house planning supports reviews, reservations, and move checklists on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!!process.env.PW_SHARED_API, "Uses the demo household.");
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?tab=House%20planning");
    await expect(
      page.getByRole("heading", { name: "Weekly house check-in" }),
    ).toBeVisible();
    await page.getByLabel("New decision").fill("Replace the sofa?");
    await page
      .getByRole("button", { name: "Add decision", exact: true })
      .click();
    await expect(
      page.getByText("Replace the sofa?", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Check-in notes")
      .fill("Reviewed rent and chores together.");
    await page.getByRole("button", { name: "Save weekly review" }).click();
    await expect(page.getByText(/Reviewed by You/)).toBeVisible();
    await page.getByRole("button", { name: "Mark decided" }).click();
    await expect(
      page.getByText("Replace the sofa?", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Reservations", exact: true })
      .click();
    await page.getByText("Reserve a resource", { exact: true }).click();
    const tomorrow = shiftDay(dateKey(new Date()), 1);
    await page.getByLabel("Starts", { exact: true }).fill(`${tomorrow}T10:00`);
    await page.getByLabel("Ends", { exact: true }).fill(`${tomorrow}T11:00`);
    await page.getByLabel("Booking notes").fill("Wash bedding");
    await page.getByRole("button", { name: "Reserve time" }).click();
    await expect(page.getByText("Wash bedding", { exact: true })).toBeVisible();
    await page.getByLabel("Starts", { exact: true }).fill(`${tomorrow}T10:30`);
    await page.getByLabel("Ends", { exact: true }).fill(`${tomorrow}T11:30`);
    await page.getByRole("button", { name: "Reserve time" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /already booked|Database needs migration/ }),
    ).toContainText("already booked");
    await page.getByRole("button", { name: "Cancel reservation" }).click();
    await expect(page.getByText("Wash bedding", { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Moving", exact: true }).click();
    await page.getByText("Start a moving checklist", { exact: true }).click();
    await page
      .getByRole("combobox", { name: "Housemate", exact: true })
      .selectOption("alex");
    await page
      .getByRole("combobox", { name: "Moving", exact: true })
      .selectOption("out");
    await page.getByRole("button", { name: "Create checklist" }).click();
    await page.getByLabel("Keys and access", { exact: true }).check();
    await page.getByLabel("Keys and access details").fill("Two keys returned");
    await page.getByRole("button", { name: "Save item" }).click();
    await expect(page.getByText(/Alex · Move-out.*1\/5 done/)).toBeVisible();
    await expect(page.getByLabel("Keys and access details")).toHaveValue(
      "Two keys returned",
    );
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      mobile ? 390 : 1440,
    );
    await expect(
      page
        .getByRole("navigation")
        .getByRole("button", { name: "Expenses", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: `/tmp/coordination-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test.describe("shared membership and planning", () => {
  test.skip(!process.env.PW_SHARED_API, "Requires mocked shared API server.");
  async function setup(page: import("@playwright/test").Page, shared = false) {
    await mockBackground(page);
    const home = demoData();
    home.members = home.members.slice(0, 2);
    const planning = emptyPlanning(home.entries);
    let identity = shared ? "shared" : "you";
    if (shared)
      home.members.push({
        user_id: "shared",
        household_id: "demo",
        name: "Housemates",
      });
    const posts: { operation: string; payload: Record<string, unknown> }[] = [];
    await page.route("**/api/session", (route) =>
      route.fulfill({ json: { authenticated: true } }),
    );
    await page.route("**/api/expenses", (route) =>
      route.fulfill({ json: { expenses: [] } }),
    );
    await page.route("**/api/home{,?*}", async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        posts.push(body);
        if (body.operation === "member")
          home.members.push({
            user_id: "replacement",
            household_id: "demo",
            name: body.payload.name,
          });
        await route.fulfill({ json: { ok: true } });
        return;
      }
      await route.fulfill({ json: { ...home, member_id: identity } });
    });
    await page.route("**/api/coordination", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: planning });
        return;
      }
      const body = route.request().postDataJSON();
      posts.push(body);
      if (body.operation === "remove_member")
        home.members = home.members.filter(
          (m) => m.user_id !== body.payload.member,
        );
      if (body.operation === "transfer_owner")
        home.household.owner_id = body.payload.member;
      await route.fulfill({ json: { ok: true } });
    });
    return { posts, home, planning };
  }
  test("owner can cancel removal, remove a housemate, and invite a replacement", async ({
    page,
  }) => {
    const { posts } = await setup(page);
    await page.goto("/?tab=Our%20household");
    await page
      .getByRole("button", { name: "Remove housemate", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(posts).toEqual([]);
    await page
      .getByRole("button", { name: "Remove housemate", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Remove housemate", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Invite a housemate" }),
    ).toBeVisible();
    await page.getByLabel("Housemate’s name").fill("Taylor");
    await page
      .getByRole("button", { name: "Invite housemate", exact: true })
      .click();
    await expect(
      page.locator(".member-row").filter({ hasText: "Taylor" }),
    ).toBeVisible();
    expect(posts.map((p) => p.operation)).toEqual(["remove_member", "member"]);
  });
  test("transfer ownership updates owner controls", async ({ page }) => {
    const { posts } = await setup(page);
    await page.goto("/?tab=Our%20household");
    await page
      .getByRole("button", { name: "Transfer ownership", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Transfer ownership", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Leave household", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Remove housemate", exact: true }),
    ).toHaveCount(0);
    expect(posts[0]).toMatchObject({
      operation: "transfer_owner",
      payload: { member: "alex" },
    });
  });
  test("shared screens can read planning and cannot author changes", async ({
    page,
  }) => {
    await setup(page, true);
    await page.goto("/?tab=House%20planning");
    await expect(
      page.getByRole("heading", { name: "Weekly house check-in" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save weekly review" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Check-in notes")).toBeDisabled();
    await page
      .getByRole("button", { name: "Reservations", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Reserve time" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Moving", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Create checklist" }),
    ).toHaveCount(0);
  });
  test("planning errors remain visible with retry", async ({ page }) => {
    await setup(page);
    await page.route("**/api/coordination", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Database needs migration 022." },
      }),
    );
    await page.goto("/?tab=House%20planning");
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /already booked|Database needs migration/ }),
    ).toContainText("Database needs migration 022");
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toBeVisible();
  });
});
