import { test } from "node:test";
import assert from "node:assert/strict";
import { activityWhen } from "../lib/activity";

const at = (
  y: number,
  m: number,
  d: number,
  hour: number,
  minute = 0,
): number => new Date(y, m - 1, d, hour, minute).getTime();

test("recent activity is described by time of day, not a timestamp", () => {
  const now = new Date(2026, 8, 8, 19, 30);
  assert.equal(activityWhen(at(2026, 9, 8, 19, 28), now), "just now");
  assert.equal(activityWhen(at(2026, 9, 8, 9), now), "this morning");
  assert.equal(activityWhen(at(2026, 9, 8, 14), now), "this afternoon");
  assert.equal(activityWhen(at(2026, 9, 8, 18), now), "tonight");
});
test("yesterday reads as yesterday even a minute after midnight", () => {
  const now = new Date(2026, 8, 8, 0, 5);
  assert.equal(activityWhen(at(2026, 9, 7, 23, 50), now), "yesterday");
});
test("this week keeps a weekday; older activity falls back to the date", () => {
  const now = new Date(2026, 8, 8, 12);
  assert.equal(activityWhen(at(2026, 9, 5, 12), now), "Saturday");
  assert.equal(activityWhen(at(2026, 8, 20, 12), now), "Aug 20");
});
