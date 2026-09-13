import { test } from "node:test";
import assert from "node:assert/strict";
import { demoData, nextSaturday, shiftDay } from "../lib/model";
import type { Entry } from "../lib/model";
import {
  occurrenceAssignee,
  markPaid,
  markAllPaid,
  billPaid,
  billShare,
  editEntries,
  houseHeadline,
  houseTasks,
  isPersonal,
  isSharedScreen,
  pinnedFirst,
  remoteActivity,
  shareDraft,
  collapseSeries,
  dayOrder,
  shoppingListText,
  titleGroup,
  yoursFirst,
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

test("a shared list writes a title's own list one thing per line", () => {
  const { entries, members } = demoData();
  const text = shoppingListText(
    entries.map((e) =>
      e.title === "Olive oil"
        ? { ...e, title: "Costco: olive oil, rice, coffee" }
        : e,
    ),
    members,
    "The Maple House",
  );
  assert.match(
    text,
    /• Costco — \$12\.00\n   – olive oil\n   – rice\n   – coffee\n/,
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

test("the household identity marks a device as a shared screen", () => {
  const { members } = demoData();
  const shared = [
    ...members,
    { user_id: "house", name: "Housemates", household_id: "demo" },
  ];
  assert.equal(isSharedScreen("house", shared), true);
  // A person is not a shared screen, and neither is a device that has not
  // chosen yet or one whose stored identity is no longer in the household.
  assert.equal(isSharedScreen("you", shared), false);
  assert.equal(isSharedScreen(null, shared), false);
  assert.equal(isSharedScreen("gone", shared), false);
  // A household with no legacy row has no shared identity to sign in as.
  assert.equal(isSharedScreen("house", members), false);
});

test("a list opens with what is waiting on you", () => {
  const { entries } = demoData();
  const chores = entries.filter((e) => e.kind === "task");
  // Demo chores are Alex's, yours, then Sam's.
  assert.deepEqual(
    yoursFirst(chores, "you").map((e) => e.assignee),
    ["you", "alex", "sam"],
  );
  // Your own finished chore has stopped waiting on you, so it stays put.
  const done = chores.map((e) =>
    e.assignee === "you" ? { ...e, done: true } : e,
  );
  assert.deepEqual(
    yoursFirst(done, "you").map((e) => e.assignee),
    ["alex", "you", "sam"],
  );
  // A housemate's order is otherwise untouched, and a shared screen with
  // nobody signed in reorders nothing.
  assert.deepEqual(
    yoursFirst(chores, "sam").map((e) => e.assignee),
    ["sam", "alex", "you"],
  );
  assert.deepEqual(yoursFirst(chores, null), chores);
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

test("the headline says what the house needs today, in one sentence", () => {
  const { entries } = demoData();
  const today = entries.find((e) =>
    e.title.startsWith("Give the kitchen"),
  )!.date!;
  // Demo: one chore due today (Alex's), rent in 5 days, two needs.
  assert.equal(
    houseHeadline(entries, today, "you"),
    "One thing to do, rent in 5 days, and olive oil and dishwasher tablets to grab.",
  );
  assert.equal(
    houseHeadline(entries, today, "alex"),
    "One thing to do, and it’s yours, rent in 5 days, and olive oil and dishwasher tablets to grab.",
  );
  // Nothing waiting says nothing, so the board can choose its own words.
  assert.equal(houseHeadline([], today, "you"), "");
  // Many needs fold into a count; a paid bill and a far-off one stay quiet.
  const busy = [
    ...entries.map((e) =>
      e.category === "Rent" ? { ...e, paid_by: e.payment_members } : e,
    ),
    { ...entries[5], id: "n1", title: "Milk" },
  ];
  assert.equal(
    houseHeadline(busy, today, null),
    "One thing to do and 3 things to grab.",
  );
});

test("the headline reaches for the nearest bill, not the oldest", () => {
  const { entries } = demoData();
  const today = entries.find((e) =>
    e.title.startsWith("Give the kitchen"),
  )!.date!;
  const rent = entries.find((e) => e.category === "Rent")!;
  // Someone paid January in cash and never ticked the box. It should not hold
  // the line for months and hide the rent that is actually coming up.
  const stale = { ...rent, id: "stale", date: shiftDay(today, -40) };
  assert.match(
    houseHeadline([...entries, stale], today, null),
    /rent in 5 days/,
  );
  // Overdue by a little still beats upcoming: it is the one still owed.
  const recent = { ...rent, id: "recent", date: shiftDay(today, -2) };
  const soon = { ...rent, id: "soon", date: shiftDay(today, 2) };
  assert.match(houseHeadline([recent, soon], today, null), /[Rr]ent overdue/);
  // Same distance either side, and the overdue one still wins.
  assert.match(
    houseHeadline([{ ...soon, date: shiftDay(today, 2) }, recent], today, null),
    /[Rr]ent overdue/,
  );
});

test("the headline names a title's own list by its heading", () => {
  const { entries } = demoData();
  const today = entries.find((e) =>
    e.title.startsWith("Give the kitchen"),
  )!.date!;
  // Spelling the whole list out here would swallow the sentence.
  const grouped = entries.map((e) =>
    e.title === "Dishwasher tablets"
      ? { ...e, title: "Household supplies: dish soap, sponges, paper towels" }
      : e,
  );
  assert.equal(
    houseHeadline(grouped, today, "you"),
    "One thing to do, rent in 5 days, and olive oil and household supplies to grab.",
  );
});

test("a shared product page becomes a shopping draft", () => {
  // A browser shares title + url; a store app usually puts both in the text.
  assert.deepEqual(
    shareDraft(
      new URLSearchParams({
        title: "Olive oil, 1L",
        url: "https://www.amazon.com/dp/B000",
      }),
    ),
    { title: "Olive oil, 1L", url: "https://www.amazon.com/dp/B000" },
  );
  assert.deepEqual(
    shareDraft(
      new URLSearchParams({
        text: "Olive oil, 1L  https://a.co/d/abc  ",
      }),
    ),
    { title: "Olive oil, 1L", url: "https://a.co/d/abc" },
  );
  // Plain words with no link are still an item; an unsafe link is dropped.
  assert.deepEqual(shareDraft(new URLSearchParams({ text: "Paper towels" })), {
    title: "Paper towels",
    url: "",
  });
  assert.deepEqual(
    shareDraft(new URLSearchParams({ url: "javascript:alert(1)" })),
    null,
  );
  assert.equal(shareDraft(new URLSearchParams({ text: "   " })), null);
  // Android now and then puts the link in the title; the name still comes
  // from wherever it was, and a sentence's punctuation stays out of the link.
  assert.deepEqual(
    shareDraft(
      new URLSearchParams({
        title: "https://www.amazon.com/dp/B000",
        text: "Olive oil",
      }),
    ),
    { title: "Olive oil", url: "https://www.amazon.com/dp/B000" },
  );
  assert.deepEqual(
    shareDraft(
      new URLSearchParams({ text: "Get https://a.co/abc123, it’s cheap" }),
    ),
    { title: "Get, it’s cheap", url: "https://a.co/abc123" },
  );
});

test("pinned notes come first and everything else keeps its order", () => {
  const note = (id: string, category = "Note") =>
    ({ ...demoData().entries[0], id, kind: "note", category }) as const;
  const notes = [
    note("a"),
    note("b", "Pinned"),
    note("c"),
    note("d", "Pinned"),
  ];
  assert.deepEqual(
    pinnedFirst(notes as never).map((e) => e.id),
    ["b", "d", "a", "c"],
  );
  assert.deepEqual(pinnedFirst([]), []);
});

test("a personal to-do is the house's business only to the person whose it is", () => {
  const task = (category: string) =>
    ({ kind: "task", category }) as Pick<Entry, "kind" | "category">;
  assert.equal(isPersonal(task("Personal")), true);
  assert.equal(isPersonal(task("Chore")), false);
  // Only a to-do can be personal; a note keeps its own categories.
  assert.equal(isPersonal({ kind: "note", category: "Personal" }), false);
  assert.deepEqual(
    houseTasks([task("Chore"), task("Personal"), task("To-do")]).map(
      (e) => e.category,
    ),
    ["Chore", "To-do"],
  );
});

test("the house headline counts house to-dos, not personal ones", () => {
  const today = "2026-09-13";
  const due = (category: string, assignee: string | null) =>
    ({
      ...demoData().entries[0],
      kind: "task",
      category,
      date: today,
      done: false,
      assignee,
    }) as Entry;
  // A personal to-do due today is not something the house is waiting on.
  assert.equal(houseHeadline([due("Personal", "you")], today, "you"), "");
  assert.equal(
    houseHeadline([due("Chore", "you"), due("Personal", "you")], today, "you"),
    "One thing to do, and it’s yours.",
  );
});

test("the weekend is the first Saturday strictly after a day", () => {
  // 2026-09-08 is a Tuesday; 2026-09-12 the Saturday after.
  assert.equal(nextSaturday("2026-09-08"), "2026-09-12");
  assert.equal(nextSaturday("2026-09-11"), "2026-09-12");
  assert.equal(nextSaturday("2026-09-12"), "2026-09-19");
  assert.equal(nextSaturday("2026-09-13"), "2026-09-19");
  assert.equal(nextSaturday("2026-12-30"), "2027-01-02");
});
