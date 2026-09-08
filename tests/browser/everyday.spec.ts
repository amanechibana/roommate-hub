import { test, expect } from "@playwright/test";
test.skip(
  !!process.env.PW_SHARED_API,
  "Demo interactions; shared writes covered by optimistic tests.",
);

test("phone users can switch person, tap member details, and reach every home item", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".board-task")).toHaveCount(3);
  await expect(page.locator(".board-shopping")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Next home page" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Open household settings" }).click();
  await page
    .getByRole("button", { name: "Change person on this device" })
    .click();
  await page.getByRole("button", { name: "Alex", exact: true }).click();
  await expect(
    page.getByText("Using this device as", { exact: false }),
  ).toContainText("Alex");
  await page.getByRole("button", { name: "About Alex", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "About Alex" })).toContainText(
    "open to-do",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "To-dos", exact: true })
    .click();
  const handle = await page.locator(".drag-handle").first().boundingBox();
  expect(handle!.width).toBeGreaterThanOrEqual(44);
  expect(handle!.height).toBeGreaterThanOrEqual(44);
});

test("weekly shortcut supplies dates and completion appears in home activity", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "To-do", exact: true }).click();
  await page.getByLabel("What’s on your mind?").fill("Weekly plant care");
  await page.getByRole("button", { name: "Make this a weekly chore" }).click();
  await expect(
    page.getByRole("combobox", { name: "Repeats", exact: true }),
  ).toHaveValue("weekly");
  const start = await page.getByLabel("Due date (optional)").inputValue();
  await page.getByLabel("Repeat until").fill(start);
  await page.getByRole("button", { name: "Assign to me", exact: true }).click();
  await page.getByRole("button", { name: "Save to our home" }).click();
  await page
    .getByRole("button", { name: "Complete Weekly plant care", exact: true })
    .click();
  await expect(page.locator(".activity-feed")).toContainText(
    "completed Weekly plant care",
  );
  await expect(page.locator(".activity-feed time")).toHaveAttribute(
    "datetime",
    /T/,
  );
});

test("weather failure offers a retry and recovers", async ({ page }) => {
  let failed = true;
  await page.route("**/api/weather**", (route) =>
    route.fulfill(
      failed
        ? { status: 503, json: { error: "unavailable" } }
        : {
            json: {
              temperature: 71,
              feelsLike: 71,
              description: "Clear",
              icon: "sun",
              high: null,
              low: null,
              precipitation: null,
            },
          },
    ),
  );
  await page.goto("/");
  await expect(
    page.getByText("Weather unavailable", { exact: true }),
  ).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Retry weather" }).click();
  await expect(page.locator(".commute-weather")).toContainText("71°");
  await expect(page.getByRole("button", { name: "Retry weather" })).toHaveCount(
    0,
  );
});
