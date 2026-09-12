import { test, expect } from "@playwright/test";

test("keyboard reordering persists and row menus support delete and undo", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^To-dos/ })
    .click();
  const rows = page.locator('[data-order-row="true"]');
  const title = await rows.first().locator(".entry-label > span").textContent();
  const handle = rows.first().getByRole("button", { name: /^Reorder/ });
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await expect(rows.nth(1).locator(".entry-label > span")).toHaveText(title!);
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^To-dos/ })
    .click();
  await expect(rows.nth(1).locator(".entry-label > span")).toHaveText(title!);
  await rows
    .nth(1)
    .getByRole("button", { name: /^Actions for/ })
    .click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(rows.filter({ hasText: title! })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rows.filter({ hasText: title! })).toHaveCount(1);
});

test("dialog close restores focus, quick notes save and edit through a shared surface", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "To-do", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "House notes" })
    .click();
  await page.getByRole("button", { name: "Leave a note", exact: true }).click();
  await page.getByLabel("Note title").fill("Cake in the fridge");
  await page.getByLabel("Your note").fill("Help yourself.");
  await page.getByRole("button", { name: "Pin note" }).click();
  await page
    .getByRole("button", { name: /Cake in the fridge Help yourself/ })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Delete entry" }).click();
  await expect(
    page.locator(".notice-board").filter({ hasText: "Cake in the fridge" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/delight-notes.png" });
});

test("night weather stays legible and ambient pause stops every decorative loop", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-08T23:00:00") });
  await page.route("**/api/weather**", (route) =>
    route.fulfill({
      json: {
        temperature: 52,
        description: "Rain",
        icon: "rain",
        high: 60,
        low: 50,
        precipitation: 90,
      },
    }),
  );
  await page.goto("/?display=1");
  await expect(page.locator(".wall-display")).toHaveAttribute(
    "data-tone",
    "night",
  );
  await expect(page.locator(".wall-particles")).toHaveAttribute(
    "data-weather",
    "rain",
  );
  await expect(
    page.getByRole("button", { name: "Pet the house cat" }),
  ).toHaveAttribute("data-night", "true");
  await page.getByRole("button", { name: "Motion on", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ambient", "off");
  await expect(page.locator(".wall-particles span").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".flip-leaf-bottom").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.screenshot({ path: "test-results/delight-night.png" });
});

test("reduced motion keeps new interactions usable without confetti", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^To-dos/ })
    .click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const complete = page.getByRole("button", { name: /^Complete / }).first();
  const label = await complete.getAttribute("aria-label");
  await complete.click();
  await expect(
    page.getByRole("button", { name: label!, exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".celebration-layer")).toHaveCount(0);
  await page
    .getByRole("button", { name: /^Reorder/ })
    .first()
    .focus();
  await page.keyboard.press("ArrowDown");
});

test("drag handles move rows without completing or opening them", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^To-dos/ })
    .click();
  const rows = page.locator('[data-order-row="true"]');
  const title = await rows.first().locator(".entry-label > span").textContent();
  const from = await rows.first().locator(".drag-handle").boundingBox();
  const to = await rows.nth(1).boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2, to!.y + to!.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(rows.nth(1).locator(".entry-label > span")).toHaveText(title!);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rows.nth(1).locator(".checkbox")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
