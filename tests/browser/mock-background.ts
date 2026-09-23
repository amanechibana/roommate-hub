import type { Page } from "@playwright/test";
import { emptyPlanning } from "../../lib/coordination";

// These routes also mount on the overview/settings pages. Leaving them live
// would produce a real 401 and sign an otherwise mocked household out.
export async function mockBackground(page: Page) {
  await page.route("**/api/list-order?**", (route) =>
    route.fulfill({ json: { ids: [] } }),
  );
  await page.route("**/api/list-order", (route) =>
    route.fulfill({ json: { ids: route.request().postDataJSON()?.ids || [] } }),
  );
  await page.route("**/api/expense-rules", (route) =>
    route.fulfill({ json: { rules: [], drafts: [] } }),
  );
  await page.route("**/api/coordination", (route) =>
    route.fulfill({ json: emptyPlanning() }),
  );
  await page.route("**/api/improvements", (route) =>
    route.fulfill({ json: { household: {}, reminders: {}, coverage: [] } }),
  );
  await page.route("**/api/agreements", (route) =>
    route.fulfill({
      json: { agreements: [], amendments: [], events: [], logs: [] },
    }),
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
  await page.route("**/api/calendar", (route) =>
    route.fulfill({
      json: { url: "https://calendar.example.test/private-feed" },
    }),
  );
}
