import { test } from "node:test";
import assert from "node:assert/strict";
import { collectEntryPages } from "../lib/home-pages";
import { deliverAll } from "../lib/delivery";
import { billPaymentValues } from "../lib/bill-posting";
import { calendarFile, demoData } from "../lib/model";

test("entry consumers fetch every bounded page and deduplicate ids", async () => {
  const entry = demoData().entries[0];
  const cursors: (string | undefined)[] = [];
  const result = await collectEntryPages(async (cursor) => {
    cursors.push(cursor);
    return cursor
      ? {
          entries: [
            { ...entry, title: "updated" },
            { ...entry, id: "other" },
          ],
          next_cursor: null,
          household: "retained",
        }
      : { entries: [entry], next_cursor: "next", household: "retained" };
  });
  assert.deepEqual(cursors, [undefined, "next"]);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].title, "updated");
  assert.equal(result.household, "retained");
});
test("a broken pagination cursor fails instead of looping forever", async () => {
  await assert.rejects(
    collectEntryPages(async () => ({ entries: [], next_cursor: "same" })),
    /did not advance/,
  );
});
test("push fan-out isolates rejected devices and respects concurrency", async () => {
  let active = 0;
  let max = 0;
  const result = await deliverAll(
    [1, 2, 3, 4],
    async (item) => {
      active++;
      max = Math.max(max, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (item === 2) throw Error("Failed device");
      return item === 3 ? "pruned" : "sent";
    },
    1000,
    2,
  );
  assert.deepEqual(result, ["sent", "failed", "pruned", "sent"]);
  assert.equal(max, 2);
});
test("expired push budget leaves unattempted devices retryable", async () => {
  let calls = 0;
  assert.deepEqual(
    await deliverAll(
      [1, 2],
      async () => {
        calls++;
        return "sent";
      },
      0,
    ),
    ["failed", "failed"],
  );
  assert.equal(calls, 0);
});
test("cover posts only unpaid original shares, without redistributing odd cents", () => {
  const bill = {
    ...demoData().entries.find((e) => e.category === "Rent")!,
    amount: 50.01,
    payment_members: ["b", "a"],
    paid_by: ["b"],
  };
  assert.equal(billPaymentValues(bill, "a", true)?.amount_cents, 2501);
  assert.deepEqual(billPaymentValues(bill, "a", true)?.shares, { a: 2501 });
  assert.deepEqual(billPaymentValues(bill, "b", false)?.shares, { b: 2500 });
  assert.equal(
    billPaymentValues({ ...bill, paid_by: ["a", "b"] }, "a", true),
    null,
  );
  assert.equal(billPaymentValues(bill, "stranger", true), null);
});
test("Personal entries never enter the household calendar export", () => {
  const entry = {
    ...demoData().entries[0],
    kind: "task" as const,
    date: "2026-09-16",
    category: "Personal",
    title: "Private appointment",
  };
  assert.equal(calendarFile([entry]).includes("BEGIN:VEVENT"), false);
  assert.equal(
    calendarFile([{ ...entry, category: "To-do" }]).includes("BEGIN:VEVENT"),
    true,
  );
});
