import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localDateKey,
  memberDigest,
  nudgeMessage,
  quietDigest,
} from "../lib/reminders";
import type { Entry, Member } from "../lib/model";

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

test("only an open, assigned to-do can be nudged", () => {
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
  assert.equal(
    nudgeMessage(
      entry({ kind: "request", title: "Olive oil", assignee: "b" }),
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
