import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarFeedToken,
  makeSession,
  validSession,
  SESSION_DURATION,
  makeMemberSession,
  memberFromSession,
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
test("member sessions bind one person to the household code and expire", () => {
  const now = Date.now();
  const person = "0b12b08e-f4f1-4aef-9f76-f892a9fd21be";
  const token = makeMemberSession("secret", "code", person, now);
  assert.equal(memberFromSession(token, "secret", "code", now), person);
  assert.equal(memberFromSession(token, "secret", "other", now), null);
  assert.equal(
    memberFromSession(
      token.replace(person, "1" + person.slice(1)),
      "secret",
      "code",
      now,
    ),
    null,
  );
  assert.equal(
    memberFromSession(token, "secret", "code", now + SESSION_DURATION * 1000),
    null,
  );
  assert.equal(memberFromSession(person, "secret", "code", now), null);
});

test("the calendar feed token is stable, URL-safe, and changes with the code", () => {
  const token = calendarFeedToken("test-secret", "test-code");
  // Pinned: changing the derivation would silently revoke every subscribed
  // phone, so that has to be a deliberate edit here too.
  assert.equal(token, "pd5TKsny0Zk2tK0yjxLft9frmNIWMTHF");
  assert.match(token, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(token, calendarFeedToken("test-secret", "new-code"));
  assert.notEqual(token, calendarFeedToken("other-secret", "test-code"));
});
