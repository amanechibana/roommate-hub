import { test, expect } from "@playwright/test";

test("TV button has a keyboard-accessible hint and opens display mode", async ({
  page,
}) => {
  await page.goto("/");
  const tv = page.getByRole("button", { name: "Display mode", exact: true });
  await expect(tv).toBeVisible();
  // The ambient flag lands with hydration; a focus before that finds a
  // button with no tooltip behind it yet.
  await expect(page.locator("html")).toHaveAttribute("data-ambient", "on");
  await tv.focus();
  await expect(page.getByRole("tooltip")).toContainText(
    "Made for the big screen",
  );
  await expect(page.locator(".tv-screen")).toHaveCSS(
    "animation-name",
    "screen-breathe",
  );
  await page.keyboard.press("Enter");
  await expect(page.locator(".board-welcome h1")).toHaveText(/\S/);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.locator(".board-plan").first()).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/motion-wall.png" });
});

test("ambient pause persists through reload and also stops the TV button", async ({
  page,
}) => {
  await page.goto("/?display=1");
  await page.getByRole("button", { name: "Motion on", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ambient", "off");
  await expect(page.locator(".wall-ambient i").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Motion off", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-ambient", "off");
  await page.getByRole("button", { name: "Exit display" }).click();
  await expect(page.locator(".tv-screen")).toHaveCSS("animation-name", "none");
});

test("reduced motion disables idle effects and keeps the controls usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-ambient", "off");
  await expect(page.locator(".tv-screen")).toHaveCSS("animation-name", "none");
  await page.getByRole("button", { name: "To-do", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Display mode", exact: true }).click();
  await expect(page.locator(".wall-ambient i").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(
    page.getByRole("button", { name: "Motion off", exact: true }),
  ).toBeDisabled();
});

test("Radix filters support arrow keys and retain the selected value", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "To-dos" })
    .click();
  const group = page.getByRole("toolbar", { name: "To-do filters" });
  await group.getByRole("button", { name: "All", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    group.getByRole("button", { name: "Mine", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    group.getByRole("button", { name: "Mine", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(
    group.getByRole("button", { name: "Mine", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".task-row")).toHaveCount(1);
  await expect(page.locator(".task-row")).toHaveCSS("transform", "none");
  await page.screenshot({ path: "test-results/motion-todos.png" });
});

test("house cat has real idle motion, reacts to keyboard and completed tasks", async ({
  page,
}) => {
  await page.goto("/");
  const cat = page.getByRole("button", { name: "Pet the house cat" });
  await expect(cat).toBeVisible();
  const running = () =>
    cat.evaluate(
      (el) =>
        el
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running").length,
    );
  await expect.poll(running).toBeGreaterThan(3);
  await cat.focus();
  await page.keyboard.press("Enter");
  await expect(cat).toHaveAttribute("data-reaction", "1");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "To-dos" })
    .click();
  await page
    .getByRole("button", {
      name: "Complete Give the kitchen a little love",
      exact: true,
    })
    .click();
  await expect(cat).toHaveAttribute("data-reaction", "2");
  await expect(
    page.getByRole("button", {
      name: "Reopen Give the kitchen a little love",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Open household settings" }).click();
  await page.getByRole("button", { name: "Motion on", exact: true }).click();
  await expect.poll(running).toBe(0);
  await page.getByRole("button", { name: "Motion off", exact: true }).click();
  await expect.poll(running).toBeGreaterThan(3);
});

test("cat fits the phone header across tabs and TV scene stays beside the clock", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const name of ["Calendar", "To-dos", "Shopping list", "House notes"]) {
    await page.getByRole("navigation").getByRole("button", { name }).click();
    await expect(
      page.getByRole("button", { name: "Pet the house cat" }),
    ).toBeInViewport();
  }
  await page.setViewportSize({ width: 1024, height: 600 });
  await expect(
    page.getByRole("button", { name: "Pet the house cat" }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Display mode", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pet the house cat" }),
  ).toBeInViewport();
  const [cat, title] = await Promise.all([
    page.getByRole("button", { name: "Pet the house cat" }).boundingBox(),
    page.locator(".board-welcome h1").boundingBox(),
  ]);
  expect(cat!.x).toBeGreaterThan(title!.x + title!.width);
  await expect(page.locator(".board-plan").first()).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/companion-tv.png" });
});

test("reduced motion leaves the cat illustration still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const cat = page.getByRole("button", { name: "Pet the house cat" });
  await expect(cat).toBeVisible();
  await cat.click();
  expect(
    await cat.evaluate((el) => el.getAnimations({ subtree: true }).length),
  ).toBe(0);
});
