import { test, expect } from "@playwright/test";

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
      page.getByRole("heading", { name: "Home sweet home." }),
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
  await expect(page.locator(".wall-pager > span")).toHaveText("1 / 3");
  await page.getByRole("button", { name: "Pause rotation" }).click();
  await page.clock.fastForward(21000);
  await expect(page.locator(".wall-pager > span")).toHaveText("1 / 3");
  await page.getByRole("button", { name: "Resume rotation" }).click();
  await page.clock.fastForward(21000);
  await expect(page.locator(".wall-pager > span")).toHaveText("2 / 3");
  await page.getByRole("button", { name: "Next display page" }).click();
  await expect(page.locator(".wall-pager > span")).toHaveText("3 / 3");
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
