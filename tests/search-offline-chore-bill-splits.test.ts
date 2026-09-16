import { test } from "node:test";
import assert from "node:assert/strict";
import { demoData, calendarFile, type Entry } from "../lib/model";
import { billShare } from "../lib/household-actions";
import { billPaymentValues } from "../lib/bill-posting";
import { lastChoreDone, choreHistoryLabel } from "../lib/chore-history";
import { searchEntries } from "../lib/household-search";
import { eventMessage } from "../lib/reminders";
const { entries, members } = demoData();
const bill: Entry = {
  ...entries.find((e) => e.category === "Rent")!,
  amount: 100.01,
  bill_shares: { you: 7000, alex: 3001 },
};
test("custom bill shares agree in checks, posting, partial covers and calendar exports", () => {
  assert.equal(billShare(bill, "you"), 70);
  assert.equal(billShare(bill, "alex"), 30.01);
  assert.equal(billShare(bill), null);
  assert.deepEqual(billPaymentValues(bill, "you", true)?.shares, {
    you: 7000,
    alex: 3001,
  });
  assert.deepEqual(
    billPaymentValues({ ...bill, paid_by: ["you"] }, "alex", true)?.shares,
    { alex: 3001 },
  );
  assert.equal(billPaymentValues(bill, "alex", false)?.amount_cents, 3001);
  const calendar = calendarFile([bill], "Home", members);
  assert.match(calendar, /You: \$70/);
  assert.doesNotMatch(calendar, /each/);
});
test("new bill notifications do not claim an even split for custom shares", () => {
  const result = eventMessage(
    { ...bill, bill_shares: { you: 7000, alex: 3001 } },
    members[0],
    bill.date!,
    2,
  );
  assert.doesNotMatch(result!.lines.join(" "), /each/);
});
test("last done follows the latest actual completion in a series after reopening, never the due date", () => {
  const first = {
    ...entries[0],
    series_id: "chores",
    done: false,
    last_done_at: "2026-09-10T15:00:00Z",
    last_done_by: "alex",
  };
  const second = {
    ...first,
    id: "second",
    date: "2026-12-01",
    last_done_at: "2026-09-12T17:00:00Z",
    last_done_by: "you",
  };
  const next = { ...first, id: "next", last_done_at: null, last_done_by: null };
  assert.deepEqual(lastChoreDone(next, [first, second, next]), {
    last_done_at: second.last_done_at,
    last_done_by: "you",
  });
  assert.match(
    choreHistoryLabel(next, [first, second, next], members),
    /by You/,
  );
  assert.equal(
    choreHistoryLabel(entries[0], [entries[0]], members),
    "Last done: not recorded yet",
  );
});
test("household entry search crosses kinds, finds completed and personal records, and normalizes names", () => {
  const records = [
    {
      ...entries[0],
      title: "Café chore",
      description: "Blue kettle",
      done: true,
      category: "Personal",
    },
    {
      ...entries[0],
      id: "note",
      kind: "note" as const,
      title: "Kettle manual",
      description: "Cafe shelf",
    },
  ];
  const found = searchEntries("cafe kettle", records, members);
  assert.equal(found.length, 2);
  assert.equal(found[0].tab, "To-dos");
  assert.equal(found[1].tab, "House notes");
});
