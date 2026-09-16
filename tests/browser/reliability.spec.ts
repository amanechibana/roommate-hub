import { test, expect, type Page } from "@playwright/test";
import { demoData } from "../../lib/model";
import { defaultGymTerms, type Agreement } from "../../lib/agreements";
import type { HandbookEntry, HandbookFile } from "../../lib/handbook";

test.skip(
  !process.env.PW_SHARED_API,
  "Run against the mocked shared API server.",
);

async function mockHome(page: Page) {
  const data = demoData();
  data.members = data.members.slice(0, 2);
  data.members[0].name = "Amane";
  data.members[1].name = "Barnatt";
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json: {
        expenses: [],
        agreements: [],
        amendments: [],
        events: [],
        logs: [],
        departures: [],
        temperature: 70,
        icon: "sun",
        condition: "Clear",
        high: 73,
        low: 65,
        station: "Journal Square",
      },
    }),
  );
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { authenticated: true, member_id: "you" } }),
  );
  await page.route("**/api/home{,?*}", (route) =>
    route.fulfill({ json: { ...data, member_id: "you", next_cursor: null } }),
  );
  await page.route("**/api/household-status", (route) =>
    route.fulfill({
      json: {
        attachments_enabled: false,
        schema_version: "021",
        reminders: [],
        schedules: [],
      },
    }),
  );
  return data;
}

test("Settings surface attachment/digest status, retry, history, and the two-person limit", async ({
  page,
}) => {
  const data = await mockHome(page);
  let retried = false;
  const pages: string[] = [];
  await page.route("**/api/household-status", (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ edition: "morning" });
      retried = true;
    }
    return route.fulfill({
      json: {
        attachments_enabled: false,
        schema_version: "021",
        schedules: [],
        reminders: [
          {
            edition: "morning",
            date: "2026-09-16",
            status: retried ? "sent" : "partial",
            started_at: "2026-09-16T12:00:00Z",
            finished_at: "2026-09-16T12:01:00Z",
            sent: retried ? 2 : 1,
            failed: retried ? 0 : 1,
            attempts: retried ? 2 : 1,
          },
        ],
      },
    });
  });
  await page.route("**/api/home/history{,?*}", (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    pages.push(cursor || "first");
    return route.fulfill({
      json: {
        entries: [
          {
            ...data.entries[0],
            id: cursor ? "old2" : "old1",
            title: cursor ? "Older receipt" : "Archived shopping",
          },
        ],
        next_cursor: cursor ? null : "old1",
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open household settings", exact: true })
    .click();
  await expect(page.getByText("Handbook attachments:")).toContainText("off");
  await expect(
    page.getByRole("button", { name: "Add housemate", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Adding more housemates is disabled/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry morning delivery" }).click();
  await expect(page.getByText(/Morning: sent/)).toBeVisible();
  await page.getByRole("button", { name: "Browse history" }).click();
  await expect(
    page.getByText("Archived shopping", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load older items" }).click();
  await expect(page.getByText("Older receipt", { exact: true })).toBeVisible();
  await expect(page.getByText("End of history.")).toBeVisible();
  expect(pages).toEqual(["first", "old1"]);
});

test("a proposed gym agreement opens, signs, and generates the existing session series", async ({
  page,
}) => {
  const data = await mockHome(page);
  const operations: string[] = [];
  let agreement: Agreement = {
    id: "gym",
    household_id: data.household.id,
    slug: "gym",
    title: "The Iron Pact",
    status: "proposed",
    terms: defaultGymTerms(),
    signed_by: ["alex"],
    proposed_by: "alex",
    proposed_at: "2026-09-01T12:00:00Z",
    created_at: "2026-09-01T12:00:00Z",
    updated_at: "2026-09-01T12:00:00Z",
  };
  await page.route("**/api/agreements", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      operations.push(body.operation);
      if (body.operation === "sign")
        agreement = {
          ...agreement,
          status: "active",
          signed_by: ["alex", "you"],
        };
      if (body.operation === "set_sessions") {
        expect(body.payload.sessions.length).toBeGreaterThan(40);
        expect(body.payload.sessions[0].time).toMatch(/^\d{2}:\d{2}$/);
      }
      return route.fulfill({ json: { agreement, count: 48 } });
    }
    return route.fulfill({
      json: { agreements: [agreement], amendments: [], events: [], logs: [] },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open household settings", exact: true })
    .click();
  await page.getByRole("button", { name: /The Iron Pact/ }).click();
  await page.getByRole("button", { name: "I agree — sign" }).click();
  await expect.poll(() => operations).toContain("set_sessions");
  await expect(
    page.getByText("Signed", { exact: false }).first(),
  ).toBeVisible();
});

test("handbook CRUD and authenticated file opening stay usable", async ({
  page,
  context,
}) => {
  const data = await mockHome(page);
  let entries: HandbookEntry[] = [];
  let files: HandbookFile[] = [];
  await page.route("**/api/handbook", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { entries, files, files_enabled: true } });
    const { operation, payload } = route.request().postDataJSON();
    if (operation === "delete") {
      entries = [];
      files = [];
      return route.fulfill({ json: { ok: true } });
    }
    const entry = {
      ...payload,
      id: "wifi",
      household_id: data.household.id,
      sort_order: 0,
      created_by: "you",
      updated_by: "you",
      created_at: "2026-09-01T12:00:00Z",
      updated_at: "2026-09-01T12:00:00Z",
    };
    entries = [entry];
    return route.fulfill({ json: { entry } });
  });
  await page.route("**/api/handbook/files{,?*}", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        contentType: "text/html",
        body: "<p>Private router manual</p>",
      });
    expect(route.request().headers()["content-type"]).toContain(
      "multipart/form-data",
    );
    files = [
      {
        id: "manual",
        entry_id: "wifi",
        household_id: data.household.id,
        file_name: "router.txt",
        content_type: "text/plain",
        size_bytes: 13,
        storage_path: "private/router.txt",
        created_by: "you",
        created_at: "2026-09-01T12:00:00Z",
      },
    ];
    return route.fulfill({ json: { file: files[0] } });
  });
  await context.route("**/api/handbook/files{,?*}", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Private router manual</p>",
    }),
  );
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "House handbook", exact: true })
    .click();
  await page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Wi-Fi", exact: true }) })
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Guest Wi-Fi");
  await page
    .getByLabel("Details", { exact: true })
    .fill("Network: Jersey City");
  await page.getByRole("button", { name: "Save detail", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Guest Wi-Fi" }),
  ).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "router.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Router manual"),
  });
  const link = page.getByRole("link", { name: /router.txt/ });
  await expect(link).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await expect(popup.getByText("Private router manual")).toBeVisible();
  await popup.close();
  await page.getByRole("button", { name: "Edit Guest Wi-Fi" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Updated Wi-Fi");
  await page.getByRole("button", { name: "Save detail", exact: true }).click();
  await page.getByRole("button", { name: "Delete Updated Wi-Fi" }).click();
  await expect(
    page.getByRole("heading", { name: "Updated Wi-Fi" }),
  ).toHaveCount(0);
});

test("private file and history endpoints refuse unauthenticated reads", async ({
  request,
}) => {
  for (const path of [
    "/api/handbook/files?id=manual",
    "/api/home/history",
    "/api/expenses/receipts?id=receipt",
    "/api/improvements",
    "/api/search?q=kitchen",
    "/api/household-status",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
});

test("a shared household screen can read the handbook but gets no editing controls", async ({
  page,
}) => {
  const data = await mockHome(page);
  data.members.push({
    user_id: "screen",
    household_id: data.household.id,
    name: "Housemates",
  });
  await page.route("**/api/home{,?*}", (route) =>
    route.fulfill({
      json: { ...data, member_id: "screen", next_cursor: null },
    }),
  );
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { authenticated: true, member_id: "screen" } }),
  );
  await page.route("**/api/handbook", (route) =>
    route.fulfill({ json: { entries: [], files: [], files_enabled: true } }),
  );
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "House handbook", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Wi-Fi", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Attach a file", exact: true }),
  ).toHaveCount(0);
});
