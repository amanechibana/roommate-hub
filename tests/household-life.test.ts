import { test } from "node:test";
import assert from "node:assert/strict";
import {
  budgetSpending,
  maintenanceImageType,
  missingIngredients,
  pollOpen,
  pollTally,
  type Poll,
} from "../lib/household-life";
import type { Expense } from "../lib/expenses";
const poll: Poll = {
  id: "poll",
  title: "Vacuum?",
  options: ["Yes", "No"],
  deadline: "2026-09-16T12:00:00Z",
  decision: null,
  decided_at: null,
  decided_by: null,
  created_by: "a",
  created_at: "2026-09-16T10:00:00Z",
};
test("poll closes exactly at the deadline and a saved decision stays closed", () => {
  assert.equal(pollOpen(poll, Date.parse(poll.deadline) - 1), true);
  assert.equal(pollOpen(poll, Date.parse(poll.deadline)), false);
  assert.equal(
    pollOpen({ ...poll, decision: "Buy it" }, Date.parse(poll.deadline) - 1),
    false,
  );
  assert.deepEqual(
    pollTally(poll, [
      { poll_id: "poll", choice: 0, count: 3 },
      { poll_id: "poll", choice: 1, count: 2 },
      { poll_id: "other", choice: 0, count: 3 },
    ]),
    [
      { option: "Yes", count: 3 },
      { option: "No", count: 2 },
    ],
  );
});
test("only missing ingredients are queued, with case and whitespace deduplication", () => {
  assert.deepEqual(
    missingIngredients(
      [
        { title: " Rice ", missing: true },
        { title: "rice", missing: true },
        { title: "Oil", missing: false },
        { title: "Beans", missing: true },
        { title: "Salt", missing: true },
      ],
      [" beans "],
    ),
    ["Rice", "Salt"],
  );
});
test("budget uses current full purchase amounts for the selected month and excludes repayments", () => {
  const expenses = [
    { id: "a", kind: "expense", date: "2026-09-02", amount_cents: 501 },
    { id: "b", kind: "expense", date: "2026-09-03", amount_cents: 9900 },
    { id: "c", kind: "settlement", date: "2026-09-04", amount_cents: 400 },
    { id: "d", kind: "expense", date: "2026-08-31", amount_cents: 1234 },
    { id: "e", kind: "expense", date: "2026-09-15", amount_cents: 250 },
  ] as Expense[];
  const categories = [
    { expense_id: "a", category: "groceries" as const },
    { expense_id: "b", category: "utilities" as const },
    { expense_id: "c", category: "groceries" as const },
    { expense_id: "deleted", category: "groceries" as const },
  ];
  assert.deepEqual(budgetSpending(expenses, categories, "2026-09"), {
    groceries: 501,
    utilities: 9900,
    unclassified: 250,
  });
  assert.deepEqual(
    budgetSpending(
      expenses.map((e) => (e.id === "a" ? { ...e, amount_cents: 601 } : e)),
      categories,
      "2026-09",
    ),
    { groceries: 601, utilities: 9900, unclassified: 250 },
  );
  assert.deepEqual(
    budgetSpending(
      expenses.filter((e) => e.id !== "a"),
      categories,
      "2026-09",
    ),
    { groceries: 0, utilities: 9900, unclassified: 250 },
  );
});

test("maintenance photos reject mislabeled SVG and unknown bytes", () => {
  assert.equal(
    maintenanceImageType(new Uint8Array([255, 216, 255, 224])),
    "image/jpeg",
  );
  assert.equal(
    maintenanceImageType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
  );
  assert.equal(
    maintenanceImageType(new TextEncoder().encode("RIFF1234WEBP")),
    "image/webp",
  );
  assert.equal(
    maintenanceImageType(
      new TextEncoder().encode("<svg><script>alert(1)</script></svg>"),
    ),
    null,
  );
  assert.equal(maintenanceImageType(new Uint8Array()), null);
});
