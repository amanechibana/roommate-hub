import type { Page } from "@playwright/test";

// These routes also mount on the overview/settings pages. Leaving them live
// would produce a real 401 and sign an otherwise mocked household out.
export async function mockBackground(page: Page) {
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
