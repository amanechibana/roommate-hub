import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarFeedToken,
  makeSession,
  validSession,
  SESSION_DURATION,
} from "../lib/session-token";

test("sessions validate, expire, and reject tampering", () => {
  const now = Date.now();
  const token = makeSession("test-secret", "test-code", now);
  assert.equal(validSession(token, "test-secret", "test-code", now), true);
  assert.equal(
    validSession(token + "x", "test-secret", "test-code", now),
    false,
  );
  assert.equal(validSession(token, "other-secret", "test-code", now), false);
  assert.equal(validSession(token, "test-secret", "new-code", now), false);
  assert.equal(
    validSession(
      token,
      "test-secret",
      "test-code",
      now + SESSION_DURATION * 1000,
    ),
    false,
  );
  assert.equal(validSession(undefined, "test-secret", "test-code", now), false);
  assert.equal(
    validSession("999999999999.nope.nope", "test-secret", "test-code", now),
    false,
  );
});

test("the calendar feed token is stable, URL-safe, and changes with the code", () => {
  const token = calendarFeedToken("test-secret", "test-code");
  assert.equal(token, calendarFeedToken("test-secret", "test-code"));
  assert.match(token, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(token, calendarFeedToken("test-secret", "new-code"));
  assert.notEqual(token, calendarFeedToken("other-secret", "test-code"));
});
