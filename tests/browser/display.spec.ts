import { test, expect } from "@playwright/test";

test.describe("midnight date flip", () => {
  test.use({ timezoneId: "America/New_York" });
  for (const [start, next, label] of [
    ["2026-09-07T23:59:59-04:00", "2026-09-08", "Tuesday, September 8"],
    ["2026-12-31T23:59:59-05:00", "2027-01-01", "Friday, January 1"],
    ["2028-02-28T23:59:59-05:00", "2028-02-29", "Tuesday, February 29"],
  ]) {
    test(`date and clock roll over together to ${next}`, async ({ page }) => {
      await page.clock.install({ time: new Date(start) });
      await page.clock.pauseAt(new Date(start));
      await page.goto("/?display=1");
      const date = page.locator(".flip-date");
      await expect(date).toHaveAttribute("datetime", start.slice(0, 10));
      const previous = await date.locator(".flip-top").allTextContents();
      await page.clock.runFor(1050);
      await expect(date).toHaveAttribute("datetime", next);
      await expect(date.locator(".flip-sr")).toHaveText(label);
      await expect(date.locator(".flip-leaf-top")).toHaveText(previous);
      await expect(
        page.locator(".flip-clock:not(.flip-date) .flip-sr"),
      ).toHaveText("12:00 AM");
      // The date leaves persist through second ticks; they only flip on a date change.
      await date
        .locator(".flip-card")
        .first()
        .evaluate((el) => el.setAttribute("data-persisted", "yes"));
      await page.clock.runFor(1000);
      await expect(date.locator(".flip-card").first()).toHaveAttribute(
        "data-persisted",
        "yes",
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(
        await date
          .locator(".flip-leaf-bottom")
          .first()
          .evaluate((el) => getComputedStyle(el).animationName),
      ).toBe("none");
      await expect(date.locator(".flip-top")).toHaveText(label.split(", "));
    });
  }
});

for (const [width, height] of [
  [1920, 1080],
  [1280, 720],
  [1024, 600],
  [390, 844],
  [320, 568],
]) {
  test(`display fits ${width} x ${height} without scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/?display=1");
    await expect(
      page.getByRole("heading", { name: "Our home, today." }),
    ).toBeVisible();
    await expect(page.getByRole("navigation")).not.toBeVisible();
    const overflow = await page.evaluate(() => {
      const elements = [
        document.documentElement,
        ...document.querySelectorAll(
          ".wall-display, .noticeboard-grid, .board-card, .board-rows",
        ),
      ];
      return elements
        .filter(
          (el) =>
            el.scrollHeight > el.clientHeight + 2 ||
            el.scrollWidth > el.clientWidth + 2,
        )
        .map((el) => el.className || el.tagName);
    });
    expect(overflow).toEqual([]);
    await expect(
      page.getByRole("button", { name: "Exit display" }),
    ).toBeInViewport();
    await page.screenshot({ path: `test-results/display-${width}.png` });
    await page.getByRole("button", { name: "Exit display" }).click();
    await expect(page).not.toHaveURL(/display=1/);
    await expect(
      page.getByRole("heading", { name: "Welcome home." }),
    ).toBeVisible();
  });
}

test("display paginates a busy household, pauses, rotates, and survives reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.clock.install();
  await page.goto("/");
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "To-do", exact: true }).click();
    await page
      .getByLabel("What’s on your mind?")
      .fill(`Long household task ${i}: ${"something to remember ".repeat(5)}`);
    await page.getByRole("button", { name: "Save to our home" }).click();
  }
  await page.getByRole("button", { name: "Display mode", exact: true }).click();
  await expect(page).toHaveURL(/display=1/);
  const pager = page.locator(".wall-pager > span");
  await expect(pager).toHaveText(/1 \/ [4-8]/);
  const pages = (await pager.innerText()).split(" / ")[1];
  await page.getByRole("button", { name: "Pause rotation" }).click();
  await page.clock.fastForward(21000);
  await expect(pager).toHaveText(`1 / ${pages}`);
  await page.getByRole("button", { name: "Resume rotation" }).click();
  await page.clock.fastForward(21000);
  await expect(pager).toHaveText(`2 / ${pages}`);
  await page.getByRole("button", { name: "Next display page" }).click();
  await expect(pager).toHaveText(`3 / ${pages}`);
  expect(
    await page
      .locator(".board-rows")
      .evaluateAll((els) =>
        els.every((el) => el.scrollHeight <= el.clientHeight + 2),
      ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Our home, today." }),
  ).toBeVisible();
});

test("phone homepage leads with useful content and immediate actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Up next" })).toBeInViewport();
  await expect(
    page.getByRole("heading", { name: "A little housework" }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Complete Give the kitchen a little love" })
    .click();
  await expect(
    page.getByText("Nothing urgent. Make yourself a cup of something."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Item", exact: true }).click();
  await page.getByLabel("What’s on your mind?").fill("Milk");
  await page.getByRole("button", { name: "Save to our home" }).click();
  await expect(
    page.getByRole("button", { name: "Milk", exact: true }),
  ).toBeVisible();
});
