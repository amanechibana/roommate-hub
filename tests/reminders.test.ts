import { test } from "node:test";
import assert from "node:assert/strict";
import { localDateKey, memberDigest, quietDigest } from "../lib/reminders";
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
    "Rent ($2,400) — due in 2 days",
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
