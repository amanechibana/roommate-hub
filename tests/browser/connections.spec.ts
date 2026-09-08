import { test, expect } from "@playwright/test";

test("covering a bill checks everyone and logs the split to expenses", async ({
  page,
}) => {
  test.skip(!!process.env.PW_SHARED_API);
  // Tall enough for the noticeboard to show all demo plans on one page.
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto("/");
  await expect(page.getByText("No shared expenses yet")).toBeVisible();
  await page.getByRole("button", { name: "Rent is due", exact: true }).click();
  await page
    .getByRole("button", { name: "I covered the whole bill — split it" })
    .click();
  await expect(
    page.getByText(/Marked everyone paid and logged \$2,400\.00 to expenses/),
  ).toBeVisible();
  await expect(page.getByText("Everyone’s paid")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /I covered the whole bill/ }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByText("Alex owes you $1,200.00")).toBeVisible();
  await page.getByRole("button", { name: "Settle up" }).click();
  await expect(page.getByRole("button", { name: /Rent is due/ })).toBeVisible();
  await expect(page.getByText("Owed to you", { exact: true })).toBeVisible();
});

test("a house note becomes a to-do from the edit dialog", async ({ page }) => {
  test.skip(!!process.env.PW_SHARED_API);
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "House notes" })
    .click();
  await page.getByRole("button", { name: /A little house note/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "to-do", exact: true })
    .click();
  await expect(
    page.getByText(/Saving turns this note into a to-do/),
  ).toBeVisible();
  await page.getByRole("button", { name: /Save to our home/ }).click();
  await expect(page.getByText(/Turned .* into a to-do/)).toBeVisible();
  await expect(
    page.getByText("Your fridge is a blank canvas. Leave a note."),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "To-dos" })
    .click();
  await expect(
    page.getByRole("button", { name: "Complete A little house note" }),
  ).toBeVisible();
});
