import { test } from "node:test";
import assert from "node:assert/strict";
import {
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
