import { test, expect } from "@playwright/test";

test("TV button has a keyboard-accessible hint and opens display mode", async ({
  page,
}) => {
  await page.goto("/");
  const tv = page.getByRole("button", { name: "Display mode", exact: true });
  await expect(tv).toBeVisible();
  await tv.focus();
  await expect(page.getByRole("tooltip")).toContainText(
    "Made for the big screen",
  );
  await expect(page.locator("html")).toHaveAttribute("data-ambient", "on");
  await expect(page.locator(".tv-screen")).toHaveCSS(
    "animation-name",
    "screen-breathe",
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Our home, today." }),
  ).toBeVisible();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.locator(".board-plan").first()).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/motion-wall.png" });
});

test("ambient pause persists through reload and also stops the TV button", async ({
  page,
}) => {
  await page.goto("/?display=1");
  await page.getByRole("button", { name: "Pause ambient motion" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ambient", "off");
  await expect(page.locator(".wall-ambient i").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Resume ambient motion" }),
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
    page.getByRole("button", { name: "Pause ambient motion" }),
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
  await expect(page.locator(".task-row")).toHaveCSS("transform", "none");
  await page.screenshot({ path: "test-results/motion-todos.png" });
});
