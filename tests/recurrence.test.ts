import { test } from "node:test";
import assert from "node:assert/strict";
import { seriesDates } from "../lib/model";

test("weekly series includes both endpoints and steps by 7 days", () => {
  assert.deepEqual(seriesDates("2026-01-05", "weekly", "2026-01-26"), [
    "2026-01-05",
    "2026-01-12",
    "2026-01-19",
    "2026-01-26",
  ]);
});

test("biweekly series stops before passing the end date", () => {
  assert.deepEqual(seriesDates("2026-01-05", "biweekly", "2026-02-01"), [
    "2026-01-05",
    "2026-01-19",
  ]);
});

test("monthly series clamps to shorter months from a day-31 anchor", () => {
  assert.deepEqual(seriesDates("2026-01-31", "monthly", "2026-04-30"), [
    "2026-01-31",
    "2026-02-28",
    "2026-03-31",
    "2026-04-30",
  ]);
});

test("an end date before the start yields no occurrences", () => {
  assert.deepEqual(seriesDates("2026-01-05", "weekly", "2026-01-04"), []);
});

test("weekly series across a year boundary stays on the same weekday", () => {
  assert.deepEqual(seriesDates("2025-12-22", "weekly", "2026-01-05"), [
    "2025-12-22",
    "2025-12-29",
    "2026-01-05",
  ]);
});
