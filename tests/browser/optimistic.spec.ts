import { test, expect, type Page } from "@playwright/test";
import { demoData, seriesDates, type Entry } from "../../lib/model";

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
  const posts: {
    operation: string;
    payload: Partial<Entry> & {
      rotation_partner?: string;
      undo_token?: string;
      paid?: boolean;
      scope?: string;
    };
  }[] = [];
  const deleted = new Map<string, Entry[]>();
  let hold: Promise<void> = Promise.resolve();
  let fail = false;
  await page.route("**/api/session", async (route) => {
    if (route.request().method() === "PATCH")
      memberId = route.request().postDataJSON().member_id;
    await route.fulfill({ json: { authenticated: true, member_id: memberId } });
  });
  // An unmocked 401 here would sign the whole mocked household out.
  await page.route("**/api/expenses", (route) =>
    route.fulfill({ json: { expenses: [] } }),
  );
  await page.route("**/api/home", async (route) => {
    if (route.request().method() === "GET") {
      gets++;
      await route.fulfill({ json: { ...data, member_id: memberId } });
      return;
    }
    const body = route.request().postDataJSON();
    // The tab id that suppresses a writer's own realtime ping is transport
    // metadata, not part of the operation the assertions care about.
    delete body.sender;
    posts.push(body);
    await hold;
    if (fail) {
      await route.fulfill({ status: 400, json: { error: "Could not save" } });
      return;
    }
    let saved: Entry[] = [];
    if (body.operation === "create") {
      const dates = body.payload.repeat
        ? seriesDates(
            body.payload.date,
            body.payload.repeat,
            body.payload.repeat_until,
          )
        : [body.payload.date || null];
      saved = dates.map((date, index) => ({
        ...data.entries[0],
        ...body.payload,
        date,
        id: index ? `saved-${posts.length}-${index}` : `saved-${posts.length}`,
        assignee:
          body.payload.rotation_partner && index % 2
            ? body.payload.rotation_partner
            : body.payload.assignee,
        rotation_members: body.payload.rotation_partner
          ? [body.payload.assignee, body.payload.rotation_partner]
          : [],
        payment_members:
          body.payload.kind === "event" &&
          ["Rent", "Bill"].includes(body.payload.category)
            ? ["you", "alex"]
            : [],
        paid_by: [],
        created_by: memberId,
        series_id: body.payload.repeat ? `series-${posts.length}` : null,
      }));
      data.entries.push(...saved);
    } else if (body.operation === "delete") {
      const selected = data.entries.find((e) => e.id === body.payload.id);
      const removed = data.entries.filter((e) =>
        body.payload.scope === "series"
          ? e.series_id === selected?.series_id
          : e.id === body.payload.id,
      );
      deleted.set(body.payload.undo_token, removed);
      data.entries = data.entries.filter((e) => !removed.includes(e));
    } else if (body.operation === "restore") {
      saved = deleted.get(body.payload.undo_token) || [];
      data.entries.push(...saved);
      deleted.delete(body.payload.undo_token);
    } else if (body.operation === "payment") {
      data.entries = data.entries.map((e) =>
        e.id === body.payload.id
          ? {
              ...e,
              paid_by: [
                ...(e.paid_by || []).filter((id) => id !== memberId),
                ...(body.payload.paid ? [memberId!] : []),
              ],
            }
          : e,
      );
    } else {
      const selected = data.entries.find((e) => e.id === body.payload.id);
      data.entries = data.entries.map((e) =>
        e.id === body.payload.id ||
        (body.payload.scope === "series" && e.series_id === selected?.series_id)
          ? {
              ...e,
              ...body.payload,
              id: e.id,
              ...(body.payload.scope === "series"
                ? {
                    assignee: e.rotation_members?.length
                      ? e.assignee
                      : body.payload.assignee,
                  }
                : {}),
              ...(e.id !== body.payload.id
                ? { date: e.date, done: e.done }
                : {}),
            }
          : e,
      );
    }
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
  await expect(page.locator(".save-status")).toHaveText("Saving…");
  release();
  await expect.poll(() => mock.posts.length).toBe(3);
  await expect(page.locator(".save-status")).toHaveText("All changes saved");
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
  await expect(page.locator(".save-status")).toHaveText(
    "Couldn’t save — try your change again",
  );
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

async function addAlternatingChore(page: Page) {
  await page.getByRole("button", { name: "To-do", exact: true }).click();
  await page.getByLabel("What’s on your mind?").fill("Dishes rotation");
  await page.getByLabel("Who’s on it?").selectOption("you");
  await page.getByLabel("Due date (optional)").fill("2026-10-01");
  await page
    .getByRole("combobox", { name: "Repeats", exact: true })
    .selectOption("weekly");
  await page.getByLabel("Repeat until").fill("2026-10-15");
  await page.getByLabel("Alternate each occurrence").check();
  await page.getByLabel("Take turns with").selectOption("alex");
  await page.getByRole("button", { name: "Save to our home" }).click();
}

test("alternating series keeps turns through edits and whole-series undo", async ({
  page,
}) => {
  const mock = await home(page);
  await addAlternatingChore(page);
  await tasks(page);
  const rows = page.locator(".task-row").filter({ hasText: "Dishes rotation" });
  await expect(rows).toHaveCount(3);
  await expect(rows.locator(".person-tag")).toHaveText([
    "Amane",
    "Barnatt",
    "Amane",
  ]);
  await expect.poll(() => mock.posts.length).toBe(1);
  expect(mock.posts[0].payload.rotation_partner).toBe("alex");
  await rows.first().locator(".entry-label").click();
  await page.getByLabel("Apply to every occurrence of this plan").check();
  await expect(page.getByLabel("Who’s on it?")).toBeDisabled();
  await page.getByLabel("What’s on your mind?").fill("Clean dishes");
  await page.getByRole("button", { name: "Save to our home" }).click();
  const changed = page.locator(".task-row").filter({ hasText: "Clean dishes" });
  await expect(changed.locator(".person-tag")).toHaveText([
    "Amane",
    "Barnatt",
    "Amane",
  ]);
  await changed.first().locator(".entry-label").click();
  await page.getByLabel("Apply to every occurrence of this plan").check();
  await page.getByRole("button", { name: "Delete entry" }).click();
  await expect(changed).toHaveCount(0);
  await expect(page.locator(".toast-stack").getByRole("status")).toContainText(
    "3 occurrences deleted",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(changed.locator(".person-tag")).toHaveText([
    "Amane",
    "Barnatt",
    "Amane",
  ]);
  await expect.poll(() => mock.posts.length).toBe(4);
  await page.reload();
  await tasks(page);
  await expect(
    page
      .locator(".task-row")
      .filter({ hasText: "Clean dishes" })
      .locator(".person-tag"),
  ).toHaveText(["Amane", "Barnatt", "Amane"]);
});

test("bill check-offs are instant and each person changes only their own check", async ({
  page,
}) => {
  const mock = await home(page);
  await page.getByRole("button", { name: "Rent is due", exact: true }).click();
  const release = mock.pause();
  await expect(
    page.getByRole("button", { name: "Mark paid: Barnatt", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Mark paid: Amane", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mark unpaid: Amane", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  release();
  await expect.poll(() => mock.posts.length).toBe(1);
  expect(mock.posts[0]).toEqual({
    operation: "payment",
    payload: { id: "5", paid: true },
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Switch person" }).click();
  await page.getByRole("button", { name: "Barnatt", exact: true }).click();
  await page.getByRole("button", { name: "Rent is due", exact: true }).click();
  await page
    .getByRole("button", { name: "Mark paid: Barnatt", exact: true })
    .click();
  await expect(
    page.getByText("Everyone’s paid", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mark unpaid: Barnatt", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mark unpaid: Amane", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/bill-checks-mobile.png" });
});

test("delete undo works before the delete finishes and expires without a confirmation dialog", async ({
  page,
}) => {
  await page.clock.install();
  const mock = await home(page);
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.type());
    void dialog.dismiss();
  });
  await tasks(page);
  await page
    .locator(".entry-label")
    .filter({ hasText: "Take out recycling" })
    .click();
  const release = mock.pause();
  await page.getByRole("button", { name: "Delete entry" }).click();
  await expect(
    page.getByRole("button", {
      name: "Complete Take out recycling",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Complete Take out recycling",
      exact: true,
    }),
  ).toBeVisible();
  release();
  await expect.poll(() => mock.posts.length).toBe(2);
  expect(mock.posts.map((p) => p.operation)).toEqual(["delete", "restore"]);
  expect(dialogs).toEqual([]);
  await page
    .locator(".entry-label")
    .filter({ hasText: "Take out recycling" })
    .click();
  await page.getByRole("button", { name: "Delete entry" }).click();
  await page.clock.fastForward(8001);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toHaveCount(0);
});

test("two deletions have independent undo notices", async ({ page }) => {
  await home(page);
  await tasks(page);
  for (const title of ["Take out recycling", "Water our green friends"]) {
    await page.locator(".entry-label").filter({ hasText: title }).click();
    await page.getByRole("button", { name: "Delete entry" }).click();
  }
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("status")
    .filter({ hasText: "Take out recycling" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Complete Take out recycling",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Complete Water our green friends",
      exact: true,
    }),
  ).toHaveCount(0);
});
