import { test } from "node:test";
import assert from "node:assert/strict";
import { demoData, seriesDates } from "../lib/model";
import { memberDigest, eveningDigest } from "../lib/reminders";
import { expenseCSV, expenseJSON } from "../lib/expense-export";
import { matchesSearch } from "../lib/search";
import { parseWeather } from "../lib/transit";
import { agreementNotification } from "../lib/agreement-notifications";
import type { Expense } from "../lib/expenses";

test("gym-only days stay quiet and gym never consumes either digest's line budget", () => {
  const { entries, members } = demoData();
  const gym = Array.from({ length: 8 }, (_, i) => ({
    ...entries[3],
    id: `gym-${i}`,
    category: "Gym",
    date: "2026-09-16",
  }));
  assert.equal(memberDigest(gym, members[0], "2026-09-16"), null);
  assert.equal(eveningDigest(gym, members[0], "2026-09-15"), null);
  const chore = {
    ...entries[0],
    title: "Trash",
    date: "2026-09-16",
    assignee: members[0].user_id,
  };
  assert.deepEqual(
    memberDigest([...gym, chore], members[0], "2026-09-16")?.lines,
    ["Today: Trash"],
  );
  assert.deepEqual(
    eveningDigest([...gym, chore], members[0], "2026-09-15")?.lines,
    ["Tomorrow: Trash"],
  );
});

test("Tue/Fri recurrence is one chronological series, with Monday-anchored week intervals", () => {
  assert.deepEqual(
    seriesDates("2026-09-15", "weekdays", "2026-09-29", [2, 5]),
    ["2026-09-15", "2026-09-18", "2026-09-22", "2026-09-25", "2026-09-29"],
  );
  assert.deepEqual(
    seriesDates("2026-09-16", "weekdays", "2026-10-02", [2, 5], 2),
    ["2026-09-18", "2026-09-29", "2026-10-02"],
  );
  assert.equal(
    seriesDates("2026-01-01", "weekdays", "2027-01-01", [1, 2, 3, 4, 5]).length,
    262,
  );
  assert.deepEqual(seriesDates("2026-09-15", "weekdays", "2026-09-20", []), []);
  assert.deepEqual(seriesDates("2026-01-31", "monthly", "2026-07-31", [], 2), [
    "2026-01-31",
    "2026-03-31",
    "2026-05-31",
    "2026-07-31",
  ]);
});

test("ledger exports preserve cent-exact purchases and repayments and escape CSV formulas", () => {
  const { members } = demoData();
  const purchase: Expense = {
    id: "expense",
    household_id: "demo",
    kind: "expense",
    title: '=SUM(1,2)\n"Dinner"',
    date: "2026-09-16",
    amount_cents: 201,
    paid_by: "you",
    shares: { you: 101, alex: 100 },
    recipient: null,
    created_by: "you",
    created_at: "2026-09-16T12:00:00Z",
  };
  const repayment: Expense = {
    ...purchase,
    id: "repayment",
    kind: "settlement",
    title: "Dinner repayment",
    paid_by: "alex",
    recipient: "you",
    shares: {},
    amount_cents: 100,
  };
  const csv = expenseCSV([purchase, repayment], members);
  assert.ok(csv.includes('"\'=SUM(1,2)\n""Dinner"""'));
  assert.ok(csv.includes('"201"'));
  assert.ok(csv.includes('"settlement"'));
  const json = JSON.parse(
    expenseJSON([purchase, repayment], members, "Our home"),
  );
  assert.deepEqual(json.expenses, [purchase, repayment]);
  assert.equal(json.amount_unit, "cents");
});

test("search matches all words across fields, ignoring accents, and finds attachment filenames", () => {
  assert.ok(
    matchesSearch("manual café", "Café machine", ["instruction-manual.pdf"]),
  );
  assert.ok(
    matchesSearch("router password", "Router", "password in the cupboard"),
  );
  assert.ok(!matchesSearch("manual oven", "Café machine", "manual.pdf"));
});

test("weather retains tomorrow and weekend data and handles incomplete daily readings", () => {
  const weather = parseWeather({
    current: { temperature_2m: 70 },
    daily: {
      time: ["2026-09-16", "2026-09-17", "2026-09-19"],
      weather_code: [0, 61, 3],
      temperature_2m_max: [71, 72, null],
      temperature_2m_min: [60, 61, 62],
      precipitation_probability_max: [0, 75, 20],
    },
  });
  assert.equal(weather.forecast?.[1].precipitation, 75);
  assert.equal(weather.forecast?.[2].date, "2026-09-19");
  assert.equal(weather.forecast?.[2].high, null);
});

test("agreement notifications request decisions, target proposers on decisions, and treat PTO as a heads-up", () => {
  const amendment = {
    id: "am",
    title: "Trash day",
    status: "open",
    proposed_by: "alex",
  };
  assert.match(
    agreementNotification("amend", { amendment }, "Amane")!.body,
    /decision is needed/,
  );
  assert.equal(
    agreementNotification(
      "amend_decide",
      { amendment: { ...amendment, status: "approved" } },
      "Amane",
    )!.member,
    "alex",
  );
  const event = {
    id: "ev",
    kind: "pto",
    status: "done",
    actor: "alex",
    hours: 0.75,
  };
  assert.match(
    agreementNotification("event", { event }, "Barnatt")!.body,
    /gym PTO \(0.75 hours\)/,
  );
  assert.ok(
    !agreementNotification("event", { event }, "Barnatt")!.body.includes(
      "decision",
    ),
  );
  assert.equal(
    agreementNotification(
      "event_decide",
      { event: { ...event, status: "declined", kind: "swap" } },
      "Amane",
    )!.member,
    "alex",
  );
  assert.equal(agreementNotification("log", {}, "Amane"), null);
});
