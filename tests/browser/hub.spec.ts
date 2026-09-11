import { test, expect } from "@playwright/test";

test("shared task creation, completion, editing, and deletion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".board-welcome h1")).toHaveText(/\S/);
  await page.getByRole("button", { name: "To-do", exact: true }).click();
  await page.getByLabel("What’s on your mind?").fill("Test our household flow");
  await page.getByLabel("Who’s on it?").selectOption("you");
  await page.getByRole("button", { name: "Save to our home" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "To-dos" })
    .click();
  await page.getByRole("button", { name: "Mine", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Complete Test our household flow",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: /Test our household flow Chore, anytime/ })
    .click();
  await page.getByLabel("What’s on your mind?").fill("Verified household flow");
  await page.getByRole("button", { name: "Save to our home" }).click();
  await expect(
    page.getByText("Verified household flow", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Verified household flow Chore, anytime/ })
    .click();
  await page.getByRole("button", { name: "Delete entry" }).click();
  await expect(
    page.getByText("Verified household flow", { exact: true }),
  ).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("shopping filters, event export, and dialog keyboard support", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Shopping list" })
    .click();
  await page.getByRole("button", { name: "Want", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A softer living room" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Olive oil" }),
  ).not.toBeVisible();
  // Typed while Want is the list on show, so it belongs on the Want list
  // rather than filed as a need where it cannot be seen.
  await page.getByLabel("Add items, one per line").fill("Reading lamp");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Reading lamp" }),
  ).toBeVisible();
  await page
    .getByLabel("Add items, one per line")
    .fill("Floor lamp\nSide table");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Side table" })).toBeVisible();
  await page
    .getByRole("button", { name: "Mark as bought: A softer living room" })
    .click();
  await expect(page.getByText(/Logged \$32\.00 to expenses/)).toBeVisible();
  await page.getByRole("button", { name: "Bought", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A softer living room" }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Calendar", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export .ics" }).click();
  expect((await download).suggestedFilename()).toBe("common-ground.ics");
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("a pasted product link fills in the item’s name and price", async ({
  page,
}) => {
  await page.route("**/api/preview", (route) =>
    route.fulfill({ json: { title: "Fancy Olive Oil 500ml", price: 18.5 } }),
  );
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Shopping list" })
    .click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByLabel("Product link (optional)")
    .fill("https://store.example.com/olive-oil");
  await page.getByLabel("Product link (optional)").blur();
  await expect(page.getByLabel("What’s on your mind?")).toHaveValue(
    "Fancy Olive Oil 500ml",
  );
  await expect(page.getByLabel("Amount in USD (optional)")).toHaveValue("18.5");
  await page.getByRole("button", { name: "Save to our home" }).click();
  await expect(
    page.getByRole("heading", { name: "Fancy Olive Oil 500ml" }),
  ).toBeVisible();
});

test("keyboard shortcuts switch tabs, add entries, and stay out of inputs", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".board-welcome h1")).toHaveText(/\S/);
  await expect
    .poll(async () => {
      await page.keyboard.press("4");
      return page
        .getByRole("heading", { level: 1, name: "Shopping list" })
        .isVisible();
    })
    .toBe(true);
  await page.keyboard.press("/");
  await expect(
    page.getByRole("textbox", { name: "Add items, one per line" }),
  ).toBeFocused();
  await page.keyboard.type("Batteries 4 pack");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Batteries 4 pack" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Shopping list" }),
  ).toBeVisible();
  await page.getByRole("heading", { level: 1, name: "Shopping list" }).click();
  await page.keyboard.press("3");
  await expect(
    page.getByRole("heading", { level: 1, name: "To-dos" }),
  ).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("1");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { level: 1, name: "To-dos" }),
  ).toBeVisible();
  await page.keyboard.press("?");
  await expect(
    page.getByRole("heading", { name: "Keyboard shortcuts" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("mobile navigation and layout fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".board-welcome h1")).toHaveText(/\S/);
  await page.screenshot({
    path: "test-results/mobile-overview.png",
    fullPage: true,
  });
  // The waiting counts ride the icons here, as they do in the sidebar, so a
  // tab's name carries its badge: "To-dos 1 due", not "To-dos".
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: /^To-dos \d+ due$/ }),
  ).toBeVisible();
  for (const tab of ["Calendar", "To-dos", "Shopping list", "House notes"]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: tab })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: tab }),
    ).toBeVisible();
    if (tab === "Calendar") {
      await expect(page.getByLabel("This month’s agenda")).toBeVisible();
      await expect(page.locator(".calendar-scroll")).not.toBeVisible();
      await page
        .getByLabel("This month’s agenda")
        .getByRole("button")
        .first()
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Open household settings" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Our household" }),
  ).toBeVisible();
});

test("desktop overview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".board-welcome h1")).toHaveText(/\S/);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/desktop-overview.png",
    fullPage: true,
  });
});
