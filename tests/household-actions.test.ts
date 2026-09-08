import { test } from "node:test";
import assert from "node:assert/strict";
import { demoData } from "../lib/model";
import {
  occurrenceAssignee,
  markPaid,
  markAllPaid,
  billPaid,
  editEntries,
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
