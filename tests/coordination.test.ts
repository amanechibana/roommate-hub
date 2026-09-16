import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingsOverlap, weekStart, weeklyItems } from "../lib/coordination";
import { demoData } from "../lib/model";
test("house weeks start on Monday across month and year boundaries", () => {
  assert.equal(weekStart("2026-09-20"), "2026-09-14");
  assert.equal(weekStart("2026-09-14"), "2026-09-14");
  assert.equal(weekStart("2027-01-01"), "2026-12-28");
});
test("weekly review retains overdue unpaid bills and undated chores while excluding personal or completed work", () => {
  const base = demoData().entries[0];
  const bill = {
    ...base,
    id: "bill",
    kind: "event" as const,
    category: "Bill",
    date: "2020-01-01",
    payment_members: ["you", "alex"],
    paid_by: ["you"],
  };
  const entries = [
    bill,
    { ...bill, id: "paid", paid_by: ["you", "alex"] },
    { ...bill, id: "future", date: "2026-09-28" },
    { ...base, id: "undated", date: null },
    { ...base, id: "personal", category: "Personal" },
    { ...base, id: "done", done: true },
    { ...base, id: "nextweek", date: "2026-09-27" },
  ];
  const review = weeklyItems(entries, "2026-09-16");
  assert.deepEqual(
    review.bills.map((e) => e.id),
    ["bill"],
  );
  assert.deepEqual(
    review.chores.map((e) => e.id),
    ["undated", "nextweek"],
  );
});
test("bookings overlap by instant; adjacent reservations and offsets are handled", () => {
  const a = {
    starts_at: "2026-09-16T10:00:00-04:00",
    ends_at: "2026-09-16T11:00:00-04:00",
  };
  assert.equal(
    bookingsOverlap(a, {
      starts_at: "2026-09-16T15:00:00Z",
      ends_at: "2026-09-16T16:00:00Z",
    }),
    false,
  );
  assert.equal(
    bookingsOverlap(a, {
      starts_at: "2026-09-16T14:30:00Z",
      ends_at: "2026-09-16T16:00:00Z",
    }),
    true,
  );
});
