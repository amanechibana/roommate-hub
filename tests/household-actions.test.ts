import { test } from "node:test";
import assert from "node:assert/strict";
import { demoData } from "../lib/model";
import {
  occurrenceAssignee,
  markPaid,
  markAllPaid,
  billPaid,
  billShare,
  editEntries,
  remoteActivity,
  collapseSeries,
  dayOrder,
  shoppingListText,
  titleGroup,
} from "../lib/household-actions";

test("chores alternate from the selected first person", () => {
  assert.deepEqual(
    [0, 1, 2, 3].map((n) => occurrenceAssignee("amane", "barnatt", n)),
    ["amane", "barnatt", "amane", "barnatt"],
  );
  assert.equal(occurrenceAssignee("amane", undefined, 3), "amane");
});
test("paying and unpaying preserve the other person's check without duplicates", () => {
  const bill = demoData().entries.find((e) => e.category === "Rent")!;
  const first = markPaid(bill, "you", true);
  assert.equal(billPaid(first), false);
  const both = markPaid(first, "alex", true);
  assert.equal(billPaid(both), true);
  assert.deepEqual(markPaid(both, "you", true).paid_by, ["alex", "you"]);
  assert.deepEqual(markPaid(both, "you", false).paid_by, ["alex"]);
  assert.equal(markPaid(bill, "outsider", true), bill);
});
test("covering a bill marks every payer paid and leaves other entries alone", () => {
  const bill = demoData().entries.find((e) => e.category === "Rent")!;
  const covered = markAllPaid(bill);
  assert.equal(billPaid(covered), true);
  assert.deepEqual(covered.paid_by, bill.payment_members);
  const chore = demoData().entries.find((e) => e.category === "Chore")!;
  assert.equal(markAllPaid(chore), chore);
});
test("series edits preserve turns, per-occurrence dates, completion, and payments", () => {
  const base = demoData().entries[0];
  const first = {
    ...base,
    id: "a",
    series_id: "series",
    assignee: "you",
    rotation_members: ["you", "alex"],
  };
  const next = {
    ...first,
    id: "b",
    assignee: "alex",
    date: "2026-10-01",
    done: true,
    paid_by: ["alex"],
  };
  const changed = editEntries(
    [first, next],
    first,
    { title: "Clean dishes", assignee: "you", date: "2026-09-07", done: false },
    true,
  );
  assert.deepEqual(
    changed.map((e) => e.assignee),
    ["you", "alex"],
  );
  assert.equal(changed[1].date, "2026-10-01");
  assert.equal(changed[1].done, true);
  assert.deepEqual(changed[1].paid_by, ["alex"]);
  assert.equal(changed[1].title, "Clean dishes");
  assert.equal(
    editEntries([first, next], next, { assignee: "you" }, false)[1].assignee,
    "you",
  );
});
test("remote activity reports completions and payments seen in a refresh", () => {
  const { members, entries } = demoData();
  const chore = entries.find((e) => e.category === "Chore" && e.assignee)!;
  const item = entries.find((e) => e.kind === "request")!;
  const bill = entries.find((e) => e.category === "Rent")!;
  const before = [chore, item, bill];
  const after = [
    { ...chore, done: true },
    { ...item, done: true },
    markPaid(bill, "alex", true),
  ];
  assert.deepEqual(remoteActivity(before, after, members), [
    {
      line: `Alex took care of “${chore.title}”`,
      member: "Alex",
    },
    { line: `“${item.title}” was picked up`, member: null },
    {
      line: `Alex paid their share of “${bill.title}”`,
      member: "Alex",
    },
  ]);
});
test("remote activity skips unchanged, new, and locally-known entries", () => {
  const { members, entries } = demoData();
  const chore = entries.find((e) => e.category === "Chore")!;
  // Unchanged entries, entries this refresh introduced, and un-completions
  // all stay quiet.
  assert.deepEqual(remoteActivity([chore], [chore], members), []);
  assert.deepEqual(remoteActivity([], [{ ...chore, done: true }], members), []);
  assert.deepEqual(
    remoteActivity([{ ...chore, done: true }], [chore], members),
    [],
  );
});
test("a bill reaching fully paid reports one settled line", () => {
  const { members, entries } = demoData();
  const bill = entries.find((e) => e.category === "Rent")!;
  const one = markPaid(bill, "you", true);
  assert.deepEqual(remoteActivity([one], [markAllPaid(bill)], members), [
    { line: `“${bill.title}” is all paid`, member: null },
  ]);
});
test("a recurring series shows overdue occurrences and only its next one", () => {
  const base = demoData().entries.find((e) => e.category === "Rent")!;
  const rent = (id: string, date: string) => ({
    ...base,
    id,
    date,
    series_id: "rent",
  });
  const single = { ...base, id: "solo", date: "2026-10-05", series_id: null };
  const sorted = [
    rent("aug", "2026-08-01"),
    rent("sep", "2026-09-01"),
    rent("oct", "2026-10-01"),
    rent("nov", "2026-11-01"),
    rent("dec", "2026-12-01"),
    single,
  ].sort((a, b) => a.date!.localeCompare(b.date!));
  assert.deepEqual(
    collapseSeries(sorted, "2026-09-08").map((e) => e.id),
    ["aug", "sep", "oct", "solo"],
  );
  // A different series keeps its own next occurrence.
  const other = [
    rent("oct", "2026-10-01"),
    { ...rent("dinner", "2026-10-02"), series_id: "dinner" },
  ];
  assert.deepEqual(
    collapseSeries(other, "2026-09-08").map((e) => e.id),
    ["oct", "dinner"],
  );
});

test("a calendar day gives its one visible slot to what still needs doing", () => {
  const rent = demoData().entries.find((e) => e.category === "Rent")!;
  const chore = demoData().entries.find((e) => e.category === "Chore")!;
  const finished = { ...chore, id: "finished", done: true };
  assert.deepEqual(
    dayOrder([finished, rent]).map((e) => e.id),
    [rent.id, "finished"],
  );
  // A paid bill asks nothing of anyone either, so an open chore goes first.
  assert.deepEqual(
    dayOrder([markAllPaid(rent), chore]).map((e) => e.id),
    [chore.id, rent.id],
  );
  assert.deepEqual(
    dayOrder([chore, rent]).map((e) => e.id),
    [chore.id, rent.id],
  );
});

test("the shareable shopping list reads needs first with prices and claims", () => {
  const { entries, members } = demoData();
  const text = shoppingListText(
    entries.map((e) =>
      e.title === "Olive oil" ? { ...e, assignee: "alex" } : e,
    ),
    members,
    "The Maple House",
  );
  assert.equal(
    text,
    [
      "Shopping for The Maple House",
      "",
      "Need",
      "• Olive oil — $12.00 — Alex is getting it",
      "• Dishwasher tablets — $16.00",
      "",
      "Want",
      "• A softer living room — $32.00",
    ].join("\n"),
  );
});

test("bought items and the legacy identity stay off the shared list", () => {
  const { entries, members } = demoData();
  const bought = entries.map((e) =>
    e.kind === "request" ? { ...e, done: true } : e,
  );
  assert.equal(shoppingListText(bought, members, "The Maple House"), "");
  const legacy = [
    ...members,
    { user_id: "all", name: "Housemates", household_id: "demo" },
  ];
  const claimedByHouse = entries.map((e) =>
    e.title === "Olive oil" ? { ...e, assignee: "all" } : e,
  );
  assert.match(
    shoppingListText(claimedByHouse, legacy, "The Maple House"),
    /• Olive oil — \$12\.00\n/,
  );
});

test("a bill share is the amount divided among its payers, to the cent", () => {
  const rent = demoData().entries.find((e) => e.category === "Rent")!;
  assert.equal(billShare(rent), 1200);
  const thirds = { ...rent, amount: 1000, payment_members: ["a", "b", "c"] };
  assert.equal(billShare(thirds), 333.33);
  // Named, the share is what covering the bill would book: the odd cent
  // lands on the first sorted payer, same as splitEvenly.
  assert.equal(billShare(thirds, "a"), 333.34);
  assert.equal(billShare(thirds, "b"), 333.33);
  assert.equal(billShare(thirds, "zed"), null);
  assert.equal(
    billShare({ ...rent, amount: 2, payment_members: ["a", "b", "c"] }),
    0.67,
  );
  assert.equal(billShare({ ...rent, payment_members: [] }), null);
  assert.equal(billShare({ ...rent, amount: null }), null);
  const chore = demoData().entries.find((e) => e.category === "Chore")!;
  assert.equal(
    billShare({ ...chore, amount: 50, payment_members: ["a"] }),
    null,
  );
});

test("a title written as its own list is read as a heading and its things", () => {
  assert.deepEqual(
    titleGroup("Household supplies: Toilet Paper, Soap, Paper Towels"),
    {
      heading: "Household supplies",
      items: ["Toilet Paper", "Soap", "Paper Towels"],
    },
  );
  // Loose spacing and a trailing comma are how people actually type these.
  assert.deepEqual(titleGroup("Snacks:chips , salsa ,"), {
    heading: "Snacks",
    items: ["chips", "salsa"],
  });
});
test("an ordinary title stays one thing", () => {
  // One thing after the colon is a note about the item, not a list.
  assert.equal(titleGroup("Costco: olive oil"), null);
  assert.equal(titleGroup("Dinner at 7:30"), null);
  assert.equal(titleGroup("Olive oil"), null);
  assert.equal(titleGroup(": soap, wipes"), null);
  assert.equal(titleGroup("Milk, eggs, bread"), null);
});
