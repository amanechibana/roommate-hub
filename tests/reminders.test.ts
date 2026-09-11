import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceLines,
  doneMessage,
  eveningDigest,
  handoffMessage,
  localDateKey,
  memberDigest,
  noteMessage,
  nudgeMessage,
  paidMessage,
  quietDigest,
  quietHours,
  thanksMessage,
  weekRecap,
} from "../lib/reminders";
import type { Entry, Member } from "../lib/model";
import type { Expense } from "../lib/expenses";

const amane: Member = { user_id: "a", household_id: "h", name: "Amane" };
const barnatt: Member = { user_id: "b", household_id: "h", name: "Barnatt" };
const base = {
  household_id: "h",
  description: "",
  category: "",
  date: null,
  assignee: null,
  amount: null,
  url: "",
  done: false,
  series_id: null,
  created_by: "a",
  created_at: "2026-09-01T00:00:00Z",
} as const;
const entry = (values: Partial<Entry>): Entry =>
  ({
    ...base,
    id: crypto.randomUUID(),
    kind: "task",
    title: "",
    ...values,
  }) as Entry;

test("digest dates follow the household time zone, not UTC", () => {
  // 03:00 UTC on the 8th is still the evening of the 7th in New York.
  assert.equal(localDateKey(new Date("2026-09-08T03:00:00Z")), "2026-09-07");
  assert.equal(localDateKey(new Date("2026-09-08T15:00:00Z")), "2026-09-08");
});

test("digest gathers own and unassigned chores, skipping the other person's", () => {
  const entries = [
    entry({ title: "Dishes", date: "2026-09-08", assignee: "a" }),
    entry({ title: "Trash", date: "2026-09-06", assignee: null }),
    entry({ title: "Plants", date: "2026-09-08", assignee: "b" }),
    entry({
      title: "Done already",
      date: "2026-09-08",
      assignee: "a",
      done: true,
    }),
    entry({ title: "Later", date: "2026-09-09", assignee: "a" }),
  ];
  const digest = memberDigest(entries, amane, "2026-09-08")!;
  assert.equal(digest.title, "Good morning, Amane ☀️");
  assert.deepEqual(digest.lines, ["Overdue: Trash", "Today: Dishes"]);
});

test("digest lists bills the member has not covered within three days", () => {
  const bill = (values: Partial<Entry>) =>
    entry({
      kind: "event",
      category: "Rent",
      title: "Rent",
      amount: 2400,
      payment_members: ["a", "b"],
      paid_by: [],
      ...values,
    });
  const entries = [
    bill({ date: "2026-09-10" }),
    bill({
      title: "Internet",
      category: "Bill",
      amount: null,
      date: "2026-09-08",
    }),
    bill({ title: "Paid one", date: "2026-09-09", paid_by: ["a"] }),
    bill({ title: "Far away", date: "2026-09-20" }),
    bill({ title: "Not mine", date: "2026-09-09", payment_members: ["b"] }),
  ];
  const digest = memberDigest(entries, amane, "2026-09-08")!;
  assert.deepEqual(digest.lines, [
    "Internet — due today",
    "Rent ($2,400, your share $1,200) — due in 2 days",
  ]);
  const barnattDigest = memberDigest(entries, barnatt, "2026-09-08")!;
  assert.equal(
    barnattDigest.lines.filter((line) => line.startsWith("Paid one")).length,
    1,
  );
});

test("shopping needs only tag along when something is due", () => {
  const need = entry({ kind: "request", category: "Need", title: "Olive oil" });
  assert.equal(memberDigest([need], amane, "2026-09-08"), null);
  const withChore = memberDigest(
    [need, entry({ title: "Dishes", date: "2026-09-08" })],
    amane,
    "2026-09-08",
  )!;
  assert.equal(withChore.lines.at(-1), "1 needed item on the shopping list");
});

test("long digests fold into a count", () => {
  const entries = Array.from({ length: 9 }, (_, i) =>
    entry({ title: `Chore ${i}`, date: "2026-09-08" }),
  );
  const digest = memberDigest(entries, amane, "2026-09-08")!;
  assert.equal(digest.lines.length, 7);
  assert.equal(digest.lines.at(-1), "…and 3 more");
});

test("the quiet digest still greets by name", () => {
  assert.match(quietDigest("Barnatt").title, /Barnatt/);
});

test("a nudge names the sender and says when the chore was due", () => {
  const today = "2026-09-08";
  const dishes = entry({ title: "Dishes", date: "2026-09-07", assignee: "b" });
  const nudge = nudgeMessage(dishes, amane, today)!;
  assert.equal(nudge.title, "Amane gave you a nudge");
  assert.deepEqual(nudge.lines, ["“Dishes” was due yesterday"]);
  assert.deepEqual(
    nudgeMessage(entry({ ...dishes, date: today }), amane, today)!.lines,
    ["“Dishes” is due today"],
  );
  assert.deepEqual(
    nudgeMessage(entry({ ...dishes, date: "2026-09-09" }), amane, today)!.lines,
    ["“Dishes” is due tomorrow"],
  );
  // Within the week a weekday reads naturally; past that it needs a date.
  assert.deepEqual(
    nudgeMessage(entry({ ...dishes, date: "2026-09-04" }), amane, today)!.lines,
    ["“Dishes” was due Friday"],
  );
  assert.deepEqual(
    nudgeMessage(entry({ ...dishes, date: "2026-08-20" }), amane, today)!.lines,
    ["“Dishes” was due Aug 20"],
  );
  assert.deepEqual(
    nudgeMessage(entry({ ...dishes, date: null }), amane, today)!.lines,
    ["“Dishes” is waiting on you"],
  );
});

test("a nudge about a claimed shopping item names the claim, not a date", () => {
  const today = "2026-09-08";
  assert.deepEqual(
    nudgeMessage(
      entry({ kind: "request", title: "Olive oil", assignee: "b" }),
      amane,
      today,
    )!.lines,
    ["“Olive oil” is still on the shopping list — you said you’d grab it"],
  );
});

test("only an open, claimed or assigned entry can be nudged", () => {
  const today = "2026-09-08";
  assert.equal(
    nudgeMessage(
      entry({ title: "Dishes", assignee: "b", done: true }),
      amane,
      today,
    ),
    null,
  );
  assert.equal(nudgeMessage(entry({ title: "Dishes" }), amane, today), null);
  // Bought, or on the list but nobody's: nothing to chase either way.
  assert.equal(
    nudgeMessage(
      entry({ kind: "request", title: "Olive oil", assignee: "b", done: true }),
      amane,
      today,
    ),
    null,
  );
  assert.equal(
    nudgeMessage(entry({ kind: "request", title: "Olive oil" }), amane, today),
    null,
  );
  // A note is nobody's errand, even addressed to someone.
  assert.equal(
    nudgeMessage(
      entry({ kind: "note", title: "Cake in the fridge", assignee: "b" }),
      amane,
      today,
    ),
    null,
  );
});

test("a bill nudge chases one person's unpaid share", () => {
  const today = "2026-09-08";
  const rent = entry({
    kind: "event",
    category: "Rent",
    title: "Rent",
    amount: 2400,
    date: today,
    payment_members: ["a", "b"],
    paid_by: ["a"],
  });
  assert.deepEqual(nudgeMessage(rent, amane, today, barnatt)!.lines, [
    "“Rent” is due today — your $1,200 share isn’t checked off",
  ]);
  // Odd cents are said to the cent, and land where the ledger would put them.
  assert.deepEqual(
    nudgeMessage(
      entry({ ...rent, amount: 1000, payment_members: ["a", "b", "c"] }),
      amane,
      today,
      barnatt,
    )!.lines,
    ["“Rent” is due today — your $333.33 share isn’t checked off"],
  );
  // One payer: the share is the bill, so say the bill.
  assert.deepEqual(
    nudgeMessage(
      entry({ ...rent, payment_members: ["b"], paid_by: [] }),
      amane,
      today,
      barnatt,
    )!.lines,
    ["“Rent” ($2,400) is due today — your share isn’t checked off"],
  );
  // Already paid, not on the bill, or no target named: nothing to chase.
  assert.equal(nudgeMessage(rent, barnatt, today, amane), null);
  assert.equal(
    nudgeMessage(
      entry({ ...rent, payment_members: ["a"] }),
      amane,
      today,
      barnatt,
    ),
    null,
  );
  assert.equal(nudgeMessage(rent, amane, today), null);
});

test("quiet hours follow the household clock, ten to eight", () => {
  // 02:30 UTC is 22:30 in New York in September: asleep.
  assert.equal(quietHours(new Date("2026-09-09T02:30:00Z")), true);
  // 11:59 UTC is 07:59: still asleep. 12:00 UTC is 08:00: awake.
  assert.equal(quietHours(new Date("2026-09-09T11:59:00Z")), true);
  assert.equal(quietHours(new Date("2026-09-09T12:00:00Z")), false);
  // 01:59 UTC is 21:59: still up.
  assert.equal(quietHours(new Date("2026-09-09T01:59:00Z")), false);
});

test("the digest says who owes whom, only alongside something due", () => {
  const today = "2026-09-08";
  const expense = {
    id: "x",
    household_id: "h",
    kind: "expense" as const,
    title: "Groceries",
    date: today,
    amount_cents: 2400,
    paid_by: "a",
    shares: { a: 1200, b: 1200 },
    recipient: null,
    created_by: "a",
    created_at: "",
  };
  const members = [amane, barnatt];
  assert.deepEqual(balanceLines([expense], barnatt, members), [
    "You owe Amane $12.00",
  ]);
  assert.deepEqual(balanceLines([expense], amane, members), [
    "Barnatt owes you $12.00",
  ]);
  const owed = balanceLines([expense], barnatt, members);
  // Nothing due means no digest, even with money on the table.
  assert.equal(memberDigest([], barnatt, today, owed), null);
  const digest = memberDigest(
    [entry({ title: "Dishes", date: today, assignee: "b" })],
    barnatt,
    today,
    owed,
  )!;
  assert.equal(digest.lines.at(-1), "You owe Amane $12.00");
});

test("a hand-off tells the new owner what landed and when", () => {
  const today = "2026-09-08";
  const chore = entry({
    title: "Take out recycling",
    date: "2026-09-09",
    assignee: "b",
  });
  assert.deepEqual(handoffMessage(chore, amane, today), {
    title: "Amane handed you a to-do",
    lines: ["“Take out recycling” is due tomorrow"],
  });
  assert.deepEqual(
    handoffMessage(entry({ ...chore, date: null }), amane, today)!.lines,
    ["“Take out recycling”"],
  );
  assert.equal(
    handoffMessage(entry({ ...chore, done: true }), amane, today),
    null,
  );
});

test("a note is read out with its first line or so", () => {
  const note = {
    kind: "note" as const,
    title: "Heads up",
    description: "  Friends over  Saturday.\nBring snacks. ",
  };
  assert.deepEqual(noteMessage(note, amane), {
    title: "Amane left a note on the fridge",
    lines: ["Heads up", "Friends over Saturday. Bring snacks."],
  });
  const long = { ...note, description: "x".repeat(200) };
  assert.equal(noteMessage(long, amane)!.lines[1].length, 140);
  assert.deepEqual(noteMessage({ ...note, description: "" }, amane)!.lines, [
    "Heads up",
  ]);
  assert.equal(noteMessage({ ...note, kind: "task" as const }, amane), null);
});

test("a check-off by someone else is one line to whoever added it", () => {
  assert.deepEqual(
    doneMessage({ kind: "task", title: "Dishes", done: true }, amane),
    {
      title: "Amane took care of “Dishes”",
      lines: [],
    },
  );
  assert.equal(
    doneMessage({ kind: "request", title: "Olive oil", done: true }, amane)!
      .title,
    "Amane picked up “Olive oil”",
  );
  assert.equal(
    doneMessage({ kind: "task", title: "Dishes", done: false }, amane),
    null,
  );
  assert.equal(
    doneMessage({ kind: "note", title: "Hi", done: true }, amane),
    null,
  );
});

test("the evening heads-up names tomorrow's chores and what's still open today", () => {
  const today = "2026-09-08";
  const entries = [
    entry({ title: "Trash out", date: "2026-09-09", assignee: "a" }),
    entry({ title: "Plants", date: "2026-09-09", assignee: null }),
    entry({ title: "Dishes", date: today, assignee: "a" }),
    entry({ title: "Not mine", date: "2026-09-09", assignee: "b" }),
    entry({ title: "Old", date: "2026-09-06", assignee: "a" }),
    entry({ title: "Later", date: "2026-09-10", assignee: "a" }),
    entry({ title: "Done", date: "2026-09-09", assignee: "a", done: true }),
  ];
  const digest = eveningDigest(entries, amane, today)!;
  assert.equal(digest.title, "Good evening, Amane 🌙");
  assert.deepEqual(digest.lines, [
    "Still today: Dishes",
    "Tomorrow: Trash out",
    "Tomorrow: Plants",
  ]);
  // Overdue from earlier days was the morning's business; tomorrow clear and
  // today done means no buzz at all.
  assert.equal(
    eveningDigest(
      [entry({ title: "Old", date: "2026-09-06", assignee: "a" })],
      amane,
      today,
    ),
    null,
  );
});

test("the evening heads-up chases a bill due tomorrow, or still unpaid today", () => {
  const today = "2026-09-08";
  const bill = (values: Partial<Entry>) =>
    entry({
      kind: "event",
      category: "Rent",
      title: "Rent",
      amount: 2400,
      payment_members: ["a", "b"],
      paid_by: [],
      ...values,
    });
  const entries = [
    bill({ date: "2026-09-09" }),
    bill({ title: "Internet", category: "Bill", amount: null, date: today }),
    bill({ title: "Paid", date: "2026-09-09", paid_by: ["a"] }),
    bill({ title: "Soon", date: "2026-09-11" }),
  ];
  assert.deepEqual(eveningDigest(entries, amane, today)!.lines, [
    "Internet — still due today",
    "Rent ($2,400, your share $1,200) — due tomorrow",
  ]);
  assert.deepEqual(eveningDigest(entries, barnatt, today)!.lines, [
    "Internet — still due today",
    "Rent ($2,400, your share $1,200) — due tomorrow",
    "Paid ($2,400, your share $1,200) — due tomorrow",
  ]);
});

test("a long evening heads-up folds like the morning one", () => {
  const entries = Array.from({ length: 8 }, (_, i) =>
    entry({ title: `Chore ${i}`, date: "2026-09-09" }),
  );
  const digest = eveningDigest(entries, amane, "2026-09-08")!;
  assert.equal(digest.lines.length, 7);
  assert.equal(digest.lines.at(-1), "…and 2 more");
});

test("a bill check tells each other payer where they stand", () => {
  const rent = entry({
    kind: "event",
    category: "Rent",
    title: "Rent",
    amount: 2400,
    payment_members: ["a", "b"],
    paid_by: ["a"],
  });
  const toBarnatt = paidMessage(rent, amane, barnatt)!;
  assert.equal(toBarnatt.title, "Amane paid their share of “Rent”");
  assert.deepEqual(toBarnatt.lines, [
    "Your $1,200 share isn’t checked off yet",
  ]);
  // The last check in: the bill is settled.
  assert.deepEqual(
    paidMessage(entry({ ...rent, paid_by: ["a", "b"] }), amane, barnatt)!.lines,
    ["“Rent” is all paid up ♡"],
  );
  // A third payer still out: the recipient who has paid hears that.
  const three = entry({
    ...rent,
    payment_members: ["a", "b", "c"],
    paid_by: ["a", "b"],
  });
  assert.deepEqual(paidMessage(three, amane, barnatt)!.lines, [
    "Still waiting on someone else’s share",
  ]);
  // Covering the bill books the shares to the ledger.
  assert.deepEqual(
    paidMessage(entry({ ...rent, paid_by: ["a", "b"] }), amane, barnatt, true),
    {
      title: "Amane covered “Rent”",
      lines: ["Your $1,200 share is on the Expenses tab now"],
    },
  );
  // Never to the payer themselves, never to someone not on the bill.
  assert.equal(paidMessage(rent, amane, amane), null);
  assert.equal(
    paidMessage(entry({ ...rent, payment_members: ["a"] }), amane, barnatt),
    null,
  );
});

test("the week's recap counts done chores by person and what was spent", () => {
  const today = "2026-09-13"; // a Sunday
  const entries = [
    entry({ title: "Dishes", date: "2026-09-07", assignee: "a", done: true }),
    entry({ title: "Trash", date: "2026-09-10", assignee: "a", done: true }),
    entry({ title: "Plants", date: "2026-09-13", assignee: "b", done: true }),
    entry({ title: "Hall", date: "2026-09-12", assignee: null, done: true }),
    entry({
      title: "Last week",
      date: "2026-09-06",
      assignee: "b",
      done: true,
    }),
    entry({ title: "Not yet", date: "2026-09-11", assignee: "b" }),
    entry({ kind: "request", title: "Oil", date: "2026-09-11", done: true }),
  ];
  const expense = (values: Partial<Expense>): Expense => ({
    id: crypto.randomUUID(),
    household_id: "h",
    kind: "expense",
    title: "",
    date: "2026-09-10",
    amount_cents: 0,
    paid_by: "a",
    shares: { a: 0, b: 0 },
    recipient: null,
    created_by: "a",
    created_at: "2026-09-10T00:00:00Z",
    ...values,
  });
  const expenses = [
    expense({ title: "Groceries", amount_cents: 8250 }),
    expense({ title: "Wine", amount_cents: 2400, date: "2026-09-13" }),
    expense({ title: "Old", amount_cents: 9900, date: "2026-09-06" }),
    expense({ kind: "settlement", amount_cents: 5000, recipient: "b" }),
  ];
  assert.deepEqual(weekRecap(entries, expenses, [amane, barnatt], today), [
    "4 chores done this week — Amane 2, Barnatt 1, shared 1",
    "$106.50 spent together this week",
  ]);
  assert.deepEqual(weekRecap([], [], [amane, barnatt], today), []);
  // A chore left with someone the house no longer lists reads as shared.
  assert.deepEqual(
    weekRecap(
      [entry({ title: "Old", date: today, assignee: "gone", done: true })],
      [],
      [amane, barnatt],
      today,
    ),
    ["1 chore done this week — shared 1"],
  );
  assert.deepEqual(weekRecap([entries[0]], [], [amane, barnatt], today), [
    "1 chore done this week — Amane 1",
  ]);
});

test("a Sunday recap goes out on its own, after tomorrow's business", () => {
  const today = "2026-09-13";
  const recap = ["3 chores done this week — Amane 3"];
  assert.deepEqual(eveningDigest([], amane, today, recap)!.lines, recap);
  assert.deepEqual(
    eveningDigest(
      [entry({ title: "Trash", date: "2026-09-14", assignee: "a" })],
      amane,
      today,
      recap,
    )!.lines,
    ["Tomorrow: Trash", ...recap],
  );
  assert.equal(eveningDigest([], amane, today), null);
});

test("a thank-you names the sender and what it was for", () => {
  assert.deepEqual(
    thanksMessage(entry({ title: "Dishes", assignee: "b", done: true }), amane),
    { title: "Amane says thanks 💛", lines: ["for taking care of “Dishes”"] },
  );
  assert.deepEqual(
    thanksMessage(
      entry({ kind: "request", title: "Olive oil", assignee: "b", done: true }),
      amane,
    )!.lines,
    ["for picking up “Olive oil”"],
  );
  // Nothing to thank for: not done, nobody's, or a note.
  assert.equal(
    thanksMessage(entry({ title: "Dishes", assignee: "b" }), amane),
    null,
  );
  assert.equal(
    thanksMessage(entry({ title: "Dishes", done: true }), amane),
    null,
  );
  assert.equal(
    thanksMessage(
      entry({ kind: "note", title: "Hi", assignee: "b", done: true }),
      amane,
    ),
    null,
  );
});

test("the house's plans ride along: today's in the morning, tomorrow's at night", () => {
  const today = "2026-09-08";
  const plan = (title: string, date: string) =>
    entry({ kind: "event", category: "Together", title, date });
  const entries = [
    plan("House dinner", today),
    plan("Movie night", "2026-09-09"),
    plan("Old thing", "2026-09-07"),
    entry({
      kind: "event",
      category: "Rent",
      title: "Rent",
      date: today,
      amount: 2400,
      payment_members: ["a", "b"],
      paid_by: ["a"],
    }),
    entry({ title: "Dishes", date: today, assignee: "a" }),
  ];
  // A plan on its own is worth the morning buzz; a paid bill is not a plan.
  assert.deepEqual(memberDigest(entries, amane, today)!.lines, [
    "Plan today: House dinner",
    "Today: Dishes",
  ]);
  assert.deepEqual(
    memberDigest([plan("House dinner", today)], amane, today)!.lines,
    ["Plan today: House dinner"],
  );
  assert.deepEqual(eveningDigest(entries, amane, today)!.lines, [
    "Plan tomorrow: Movie night",
    "Still today: Dishes",
  ]);
  assert.deepEqual(
    eveningDigest([plan("Movie night", "2026-09-09")], amane, today)!.lines,
    ["Plan tomorrow: Movie night"],
  );
  // A plan crossed off is over, like everywhere else on the board.
  assert.equal(
    eveningDigest(
      [{ ...plan("Movie night", "2026-09-09"), done: true }],
      amane,
      today,
    ),
    null,
  );
});
