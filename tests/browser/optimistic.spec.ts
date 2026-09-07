import { test, expect, type Page } from "@playwright/test";
import { demoData, type Entry } from "../../lib/model";

test.skip(
  !process.env.PW_SHARED_API,
  "Run against a server with public Supabase variables set; requests are mocked.",
);

async function home(page: Page, picked: string | null = "you") {
  const data = demoData();
  data.members = data.members.slice(0, 2);
  data.members[0].name = "Amane";
  data.members[1].name = "Barnatt";
  let memberId = picked;
  let gets = 0;
  const posts: { operation: string; payload: Partial<Entry> }[] = [];
  let hold: Promise<void> = Promise.resolve();
  let fail = false;
  await page.route("**/api/session", async (route) => {
    if (route.request().method() === "PATCH")
      memberId = route.request().postDataJSON().member_id;
    await route.fulfill({ json: { authenticated: true, member_id: memberId } });
  });
  await page.route("**/api/home", async (route) => {
    if (route.request().method() === "GET") {
      gets++;
      await route.fulfill({ json: { ...data, member_id: memberId } });
      return;
    }
    const body = route.request().postDataJSON();
    posts.push(body);
    await hold;
    if (fail) {
      await route.fulfill({ status: 400, json: { error: "Could not save" } });
      return;
    }
    let saved: Entry[] = [];
    if (body.operation === "create") {
      saved = [
        {
          ...data.entries[0],
          ...body.payload,
          id: `saved-${posts.length}`,
          created_by: memberId,
          series_id: null,
        },
      ];
      data.entries.push(...saved);
    } else if (body.operation === "delete") {
      data.entries = data.entries.filter((e) => e.id !== body.payload.id);
    } else
      data.entries = data.entries.map((e) =>
        e.id === body.payload.id ? { ...e, ...body.payload } : e,
      );
    await route.fulfill({ json: { ok: true, entries: saved } });
  });
  await page.goto("/");
  return {
    data,
    posts,
    gets: () => gets,
    fail: () => {
      fail = true;
    },
    pause: () => {
      let release!: () => void;
      hold = new Promise<void>((r) => {
        release = r;
      });
      return release;
    },
  };
}
const tasks = (page: Page) =>
  page
    .getByRole("navigation")
    .getByRole("button", { name: "To-dos", exact: true })
    .click();

test("three rapid checkboxes update before the first POST completes, with no refetch", async ({
  page,
}) => {
  const mock = await home(page);
  await tasks(page);
  const release = mock.pause();
  for (const title of [
    "Give the kitchen a little love",
    "Take out recycling",
    "Water our green friends",
  ]) {
    await page
      .getByRole("button", { name: `Complete ${title}`, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: `Reopen ${title}`, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  expect(mock.posts).toHaveLength(1);
  release();
  await expect.poll(() => mock.posts.length).toBe(3);
  expect(mock.gets()).toBe(1);
});

test("failed save refreshes quietly and restores server state", async ({
  page,
}) => {
  const mock = await home(page);
  await tasks(page);
  const release = mock.pause();
  mock.fail();
  await page
    .getByRole("button", { name: "Complete Take out recycling", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Reopen Take out recycling",
      exact: true,
    }),
  ).toBeVisible();
  release();
  await expect(page.getByRole("status")).toContainText("Couldn’t save");
  await expect(
    page.getByRole("button", {
      name: "Complete Take out recycling",
      exact: true,
    }),
  ).toBeVisible();
  expect(mock.gets()).toBe(2);
  await expect(page.locator(".error")).toHaveCount(0);
});

test("quick add can be completed before its saved ID arrives", async ({
  page,
}) => {
  const mock = await home(page);
  await tasks(page);
  const release = mock.pause();
  await page
    .getByRole("textbox", { name: "Quick add to-do" })
    .fill("Fresh task");
  await page.getByRole("textbox", { name: "Quick add to-do" }).press("Enter");
  await page
    .getByRole("button", { name: "Complete Fresh task", exact: true })
    .click();
  release();
  await expect.poll(() => mock.posts.length).toBe(2);
  expect(mock.posts[1].payload.id).toBe("saved-1");
  await expect(
    page.getByRole("button", { name: "Reopen Fresh task", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(mock.gets()).toBe(1);
});

test("person picker persists the choice, enables Mine, and allows switching", async ({
  page,
}) => {
  await home(page, null);
  await expect(
    page.getByRole("heading", { name: "Who’s this?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Barnatt" }).click();
  await tasks(page);
  await page.getByRole("button", { name: "Mine", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Complete Give the kitchen a little love",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Complete Take out recycling",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch person" })).toHaveText(
    "Barnatt",
  );
  await page.getByRole("button", { name: "Switch person" }).click();
  await page.getByRole("button", { name: "Amane" }).click();
  await expect(page.getByRole("button", { name: "Switch person" })).toHaveText(
    "Amane",
  );
});

test("delete disappears before save, unpriced shopping hides total", async ({
  page,
}) => {
  const mock = await home(page);
  await tasks(page);
  await page
    .getByRole("button", {
      name: /Take out recycling Tomorrow|Take out recycling Sep/,
    })
    .click();
  const release = mock.pause();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete entry" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Complete Take out recycling",
      exact: true,
    }),
  ).toHaveCount(0);
  release();
  mock.data.entries = mock.data.entries.map((e) => ({ ...e, amount: null }));
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Shopping list/ })
    .click();
  await expect(page.getByText("Estimated total", { exact: false })).toHaveCount(
    0,
  );
  await expect(page.locator(".shopping-art")).toHaveCount(0);
});

test("rapid reopening preserves click order and polling waits for saves", async ({
  page,
}) => {
  await page.clock.install();
  const mock = await home(page);
  await tasks(page);
  const release = mock.pause();
  await page
    .getByRole("button", { name: "Complete Take out recycling", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reopen Take out recycling", exact: true })
    .click();
  await page.clock.fastForward(16000);
  expect(mock.gets()).toBe(1);
  release();
  await expect.poll(() => mock.posts.length).toBe(2);
  expect(mock.posts.map((p) => p.payload.done)).toEqual([true, false]);
  await expect(
    page.getByRole("button", {
      name: "Complete Take out recycling",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("compact shopping and person picker fit desktop and phone", async ({
  page,
}) => {
  await home(page, null);
  await page.screenshot({ path: "test-results/person-picker.png" });
  await page.getByRole("button", { name: "Amane" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Shopping list/ })
    .click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: "Olive oil" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/compact-shopping-${width}.png`,
      fullPage: true,
    });
  }
});
