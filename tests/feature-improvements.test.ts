import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarConflicts,
  coverageSuggestions,
  defaultHouseholdPreferences,
  inQuietHours,
  monthlySummary,
  percentageShares,
  reminderDue,
} from "../lib/improvements";
import { demoData, type Entry } from "../lib/model";
import { collectExpensePages } from "../lib/expense-pages";
import { overlayChange, queueable, type QueuedChange } from "../lib/offline";
test("percentage splits preserve every cent with deterministic largest remainders", () => {
  assert.deepEqual(percentageShares(101, { b: "50", a: "50" }), {
    a: 51,
    b: 50,
  });
  assert.deepEqual(percentageShares(3, { c: "0", b: "66.67", a: "33.33" }), {
    a: 1,
    b: 2,
    c: 0,
  });
  for (const values of [
    { a: "99" },
    { a: "100.001" },
    { a: "-1", b: "101" },
    { a: "" },
  ] as Record<string, string>[])
    assert.equal(percentageShares(100, values), null);
});
test("quiet hours support overnight, daytime and disabled windows", () => {
  assert.equal(inQuietHours("23:00", "22:00", "08:00"), true);
  assert.equal(inQuietHours("08:00", "22:00", "08:00"), false);
  assert.equal(inQuietHours("13:00", "12:00", "14:00"), true);
  assert.equal(inQuietHours("13:00", "12:00", "12:00"), false);
  assert.equal(
    reminderDue(
      new Date("2026-09-16T12:02:00Z"),
      "08:01",
      defaultHouseholdPreferences,
    ),
    true,
  );
  assert.equal(
    reminderDue(
      new Date("2026-01-16T13:02:00Z"),
      "08:01",
      defaultHouseholdPreferences,
    ),
    true,
  );
  assert.equal(
    reminderDue(new Date("2026-09-17T04:00:00Z"), "23:58", {
      ...defaultHouseholdPreferences,
      quiet_start: "00:00",
      quiet_end: "00:00",
    }),
    true,
  );
  assert.equal(
    reminderDue(
      new Date("2026-09-16T12:06:00Z"),
      "08:01",
      defaultHouseholdPreferences,
    ),
    false,
  );
  assert.equal(
    reminderDue(
      new Date("2026-09-16T11:59:00Z"),
      "07:58",
      defaultHouseholdPreferences,
    ),
    false,
  );
});
test("guest conflicts include overnight quiet periods and shared plans with exclusive ends", () => {
  const base = demoData().entries[3];
  const dinner: Entry = {
    ...base,
    id: "dinner",
    date: "2026-09-16",
    time_of_day: "18:00",
    end_time: "20:00",
  };
  assert.deepEqual(
    calendarConflicts(
      {
        id: "visit",
        category: "Guest",
        date: "2026-09-16",
        time_of_day: "19:00",
        end_time: "23:00",
      },
      [dinner],
      defaultHouseholdPreferences,
    ),
    ["Overlaps " + dinner.title, "Overlaps household quiet hours"],
  );
  assert.deepEqual(
    calendarConflicts(
      {
        id: "visit",
        category: "Guest",
        date: "2026-09-16",
        time_of_day: "20:00",
        end_time: "21:00",
      },
      [dinner],
      defaultHouseholdPreferences,
    ),
    [],
  );
  assert.equal(
    calendarConflicts(
      {
        id: "visit",
        category: "Guest",
        date: "2026-09-17",
        time_of_day: "06:00",
        end_time: "07:00",
      },
      [],
      defaultHouseholdPreferences,
    ).length,
    1,
  );
});
test("coverage skips unavailable candidates and leaves assignments untouched", () => {
  const { entries, members } = demoData();
  const task = { ...entries[0], date: "2026-09-16", assignee: "alex" };
  const away: Entry = {
    ...entries[3],
    id: "away",
    category: "Away",
    date: task.date,
    assignee: "alex",
  };
  const otherAway = { ...away, id: "away2", assignee: "sam" };
  assert.equal(
    coverageSuggestions([task, away, otherAway], members)[0].candidate?.user_id,
    "you",
  );
  assert.equal(task.assignee, "alex");
  assert.equal(
    coverageSuggestions([{ ...task, category: "Personal" }, away], members)
      .length,
    0,
  );
});
test("monthly summaries exclude repayments and other months", () => {
  const base = {
    id: "1",
    household_id: "demo",
    kind: "expense" as const,
    title: "Groceries",
    date: "2026-09-16",
    category: "Groceries",
    amount_cents: 101,
    paid_by: "you",
    shares: { you: 101 },
    recipient: null,
    created_by: "you",
    created_at: "",
  };
  assert.deepEqual(
    monthlySummary(
      [
        base,
        { ...base, kind: "settlement", recipient: "alex" },
        { ...base, date: "2026-08-01" },
      ],
      "2026-09",
    ),
    { total: 101, categories: { Groceries: 101 }, members: { you: 101 } },
  );
});
test("expense exports traverse all pages and reject repeated cursors", async () => {
  const seen: (string | undefined)[] = [];
  await collectExpensePages(async (cursor) => {
    seen.push(cursor);
    return { expenses: [], next_cursor: cursor ? null : "next" };
  });
  assert.deepEqual(seen, [undefined, "next"]);
  await assert.rejects(
    collectExpensePages(async () => ({ expenses: [], next_cursor: "same" })),
    /repeated/,
  );
});
test("offline changes update saved views without replaying ephemeral operations", () => {
  assert.equal(queueable("/api/home", "POST", { operation: "payment" }), false);
  assert.equal(
    queueable("/api/home", "POST", { operation: "undo_edit" }),
    false,
  );
  assert.equal(
    queueable("/api/expenses", "POST", { operation: "create" }),
    true,
  );
  const cache = {
    "/api/home": { entries: [{ id: "a", title: "Milk", done: false }] },
  };
  const change: QueuedChange = {
    id: "q",
    path: "/api/home",
    at: 0,
    body: { operation: "update", payload: { id: "a", done: true } },
  };
  overlayChange(cache, change, {});
  assert.equal(cache["/api/home"].entries[0].done, true);
});

test("offline ledger overlays update full-ledger balances and monthly aggregates", () => {
  const cache: Record<string, any> = {
    "/api/expenses": {
      expenses: [],
      balances: { you: 0, alex: 0 },
      summaries: [],
    },
  };
  const expense = {
    id: "e",
    kind: "expense",
    title: "Milk",
    date: "2026-09-16",
    category: "Groceries",
    amount_cents: 101,
    paid_by: "you",
    shares: { you: 51, alex: 50 },
    recipient: null,
  };
  overlayChange(
    cache,
    {
      id: "q",
      path: "/api/expenses",
      at: 0,
      body: { operation: "create", payload: expense },
    },
    { expense },
  );
  assert.deepEqual(cache["/api/expenses"].balances, { you: 50, alex: -50 });
  assert.equal(cache["/api/expenses"].summaries[0].amount_cents, 101);
  overlayChange(
    cache,
    {
      id: "q2",
      path: "/api/expenses",
      at: 0,
      body: { operation: "delete", payload: { id: "e" } },
    },
    {},
  );
  assert.deepEqual(cache["/api/expenses"].balances, { you: 0, alex: 0 });
  assert.equal(cache["/api/expenses"].summaries[0].amount_cents, 0);
});
