import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [1280, 720],
  [1024, 600],
  [390, 844],
  [375, 667],
  [320, 568],
]) {
  test(`home and calendar fit ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Home sweet home." }),
    ).toBeVisible();
    for (const screen of ["home", "calendar"]) {
      if (screen === "calendar")
        await page
          .getByRole("navigation")
          .getByRole("button", { name: "Calendar", exact: true })
          .click();
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() =>
        [
          document.documentElement,
          ...document.querySelectorAll(
            ".fitted-app, .fitted-app .main-shell, .fitted-app .content, .home-board, .noticeboard-grid, .board-card, .board-rows, .calendar-panel, .calendar-grid, .calendar-cell, .mobile-agenda",
          ),
        ]
          .filter(
            (el) =>
              el.clientHeight &&
              (el.scrollHeight > el.clientHeight + 2 ||
                el.scrollWidth > el.clientWidth + 2),
          )
          .map((el) => ({
            el: el.className || el.tagName,
            scroll: el.scrollHeight,
            height: el.clientHeight,
          })),
      );
      expect(overflow).toEqual([]);
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(100);
      expect(
        await page.locator(".topbar").evaluate((el) => ({
          top: el.getBoundingClientRect().top,
          scrollers: [...document.querySelectorAll("*")]
            .filter((e) => e.scrollTop)
            .map((e) => [e.className, e.scrollTop]),
        })),
      ).toEqual({ top: 0, scrollers: [] });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await page.screenshot({
        path: `test-results/${screen}-fit-${width}.png`,
      });
      if (screen === "calendar" && width > 650) {
        // Navigate to a six-week month regardless of the current date.
        for (
          let i = 0;
          i < 12 && (await page.locator(".calendar-cell").count()) !== 42;
          i++
        )
          await page
            .getByRole("button", { name: "Next month", exact: true })
            .click();
        await expect(page.locator(".calendar-cell")).toHaveCount(42);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollHeight <= innerHeight,
          ),
        ).toBe(true);
        expect(
          await page
            .locator(".calendar-grid")
            .evaluate((el) => el.scrollHeight <= el.clientHeight + 2),
        ).toBe(true);
      }
    }
  });
}

test("crowded days open all entries and phone agenda pages remain reachable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByLabel("What’s on your mind?").fill("Another plan today");
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await page.getByLabel("Date", { exact: true }).fill(today);
  await page.getByRole("button", { name: "Save to our home" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Calendar", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Show all 2 entries on ${today}` })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Another plan today/ })
    .click();
  await expect(page.getByLabel("What’s on your mind?")).toHaveValue(
    "Another plan today",
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(
    page.getByRole("button", { name: "Next agenda page" }),
  ).toBeEnabled();
  const first = (await page.locator(".mobile-agenda").textContent())!;
  await page.getByRole("button", { name: "Next agenda page" }).click();
  await expect(page.locator(".mobile-agenda")).not.toHaveText(first);
  await page.getByRole("button", { name: "Previous agenda page" }).click();
  await expect(page.locator(".mobile-agenda")).toHaveText(first);
});
