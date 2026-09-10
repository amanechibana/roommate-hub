import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarFile,
  dateKey,
  googleCalendarUrl,
  safeUrl,
  type Entry,
} from "../lib/model";

const entry: Entry = {
  id: "abc",
  household_id: "home",
  kind: "event",
  title: "Dinner, friends; fun",
  description: "Line 1\nLine 2\\end",
  category: "Together",
  date: "2026-12-31",
  assignee: null,
  amount: null,
  url: "",
  done: false,
  series_id: null,
  created_by: "me",
  created_at: "2026-01-01T00:00:00Z",
};

test("exports all-day events with exclusive end dates across year boundaries", () => {
  const text = calendarFile([entry]);
  assert.ok(text.includes("DTSTART;VALUE=DATE:20261231\r\n"));
  assert.ok(text.includes("DTEND;VALUE=DATE:20270101\r\n"));
  assert.ok(text.includes("UID:abc@common-ground"));
  assert.ok(text.endsWith("END:VCALENDAR\r\n"));
});
test("a named calendar carries its name for the phone to list it under", () => {
  const text = calendarFile([entry], "The Maple House");
  assert.ok(text.includes("NAME:The Maple House\r\n"));
  assert.ok(text.includes("X-WR-CALNAME:The Maple House\r\n"));
  // A household name is free text, so it escapes like any other value and
  // cannot break out into a line of its own.
  const risky = calendarFile([entry], "Us, them; here\nEND:VCALENDAR");
  assert.ok(risky.includes("X-WR-CALNAME:Us\\, them\\; here\\nEND:VCALENDAR"));
  // The escaped "\\n" is two characters, not a line break, so the calendar
  // still ends exactly once.
  assert.equal(
    risky.split("\r\n").filter((line) => line === "END:VCALENDAR").length,
    1,
  );
  // An unnamed export stays exactly as it was.
  assert.ok(!calendarFile([entry]).includes("CALNAME"));
});

test("the feed asks phones to re-read it hourly", () => {
  // Without this a phone picks its own cadence, which on iOS can be daily.
  const text = calendarFile([entry], "The Maple House");
  assert.ok(text.includes("REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n"));
  assert.ok(text.includes("X-PUBLISHED-TTL:PT1H\r\n"));
});

test("escapes calendar control characters and prevents line injection", () => {
  const text = calendarFile([entry]);
  assert.ok(text.includes("SUMMARY:Dinner\\, friends\\; fun"));
  assert.ok(text.includes("DESCRIPTION:Line 1\\nLine 2\\\\end"));
  assert.equal(
    calendarFile([{ ...entry, title: "Hi\nEND:VEVENT" }]).split(
      "\r\nEND:VEVENT",
    ).length,
    2,
  );
});
test("folds UTF-8 lines within 75 bytes while preserving the content", () => {
  const title = "House dinner 🍲 ".repeat(20);
  const text = calendarFile([{ ...entry, title }]);
  assert.ok(text.split("\r\n").every((line) => Buffer.byteLength(line) <= 75));
  assert.ok(text.replaceAll("\r\n ", "").includes(`SUMMARY:${title}`));
});
test("only exports dated tasks and events", () => {
  const text = calendarFile([
    entry,
    { ...entry, id: "task", kind: "task" },
    { ...entry, id: "none", date: null },
    { ...entry, id: "shop", kind: "request" },
    { ...entry, id: "note", kind: "note" },
  ]);
  assert.equal(text.match(/BEGIN:VEVENT/g)?.length, 2);
});
test("calendar URLs encode titles and use the next local calendar day", () => {
  const url = new URL(
    googleCalendarUrl({
      ...entry,
      date: "2026-03-08",
      title: "Coffee & chores #1",
    }),
  );
  assert.equal(url.origin, "https://calendar.google.com");
  assert.equal(url.searchParams.get("dates"), "20260308/20260309");
  assert.equal(url.searchParams.get("text"), "Coffee & chores #1");
  assert.equal(dateKey(new Date(2026, 0, 2, 23, 30)), "2026-01-02");
});
test("store links reject executable protocols and malformed URLs", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///etc/passwd",
    "not-a-url",
    "",
  ])
    assert.equal(safeUrl(value), null);
  assert.equal(
    safeUrl("https://www.amazon.com/dp/example"),
    "https://www.amazon.com/dp/example",
  );
});
