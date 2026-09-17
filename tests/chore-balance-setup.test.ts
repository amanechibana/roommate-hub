import test from "node:test";
import assert from "node:assert/strict";
import { choreBalance } from "../lib/chore-balance";
import { householdSetup } from "../lib/household-setup";
import { houseChores } from "../lib/gym-schedule";
import { defaultHouseTerms, pendingForMember } from "../lib/agreements";
import { demoData, type Entry } from "../lib/model";
const { members, entries } = demoData();
const people = members.slice(0, 3);
const [a, b, c] = people.map((m) => m.user_id);
const chore = (
  id: string,
  assignee: string | null,
  effort: number | null,
  overrides: Partial<Entry> = {},
): Entry => ({
  ...entries[0],
  id,
  kind: "task",
  category: "Chore",
  date: "2026-09-17",
  assignee,
  effort_minutes: effort,
  done: false,
  series_id: null,
  ...overrides,
});
test("weekly totals use minutes, exclude other weeks, personal items, and missing estimates", () => {
  const balance = choreBalance(
    [
      chore("bathroom", a, 45),
      chore("trash", b, 5),
      chore("unknown", c, null),
      chore("later", a, 99, { date: "2026-09-21" }),
      chore("personal", a, 200, { category: "Personal" }),
    ],
    people,
    "2026-09-17",
  );
  assert.deepEqual(
    balance.rows.map((r) => r.planned),
    [45, 5, 0],
  );
  assert.equal(balance.unknown, 1);
  assert.equal(balance.target, 50 / 3);
});
test("suggestions place larger unassigned chores first and distribute effort across all members", () => {
  const balance = choreBalance(
    [
      chore("bathroom", null, 45),
      chore("kitchen", null, 30),
      chore("trash", null, 5),
    ],
    people,
    "2026-09-17",
  );
  assert.equal(balance.suggestions.length, 3);
  assert.equal(
    new Set(balance.suggestions.map((s) => s.member.user_id)).size,
    3,
  );
  assert.deepEqual(
    balance.suggestions.map((s) => s.entry.effort_minutes),
    [45, 30, 5],
  );
});
test("fair assignments reduce an existing imbalance and leave balanced assignments alone", () => {
  assert.ok(
    choreBalance(
      [chore("a", a, 45), chore("b", a, 30), chore("c", a, 5)],
      people,
      "2026-09-17",
    ).suggestions.length > 0,
  );
  assert.equal(
    choreBalance(
      [chore("a", a, 30), chore("b", b, 30), chore("c", c, 30)],
      people,
      "2026-09-17",
    ).suggestions.length,
    0,
  );
});
test("suggestions preserve completed chores and exclude away and former housemates", () => {
  const away = {
    ...chore("away", a, null),
    kind: "event" as const,
    category: "Away",
  };
  const balance = choreBalance(
    [away, chore("fixed", b, 45, { done: true }), chore("open", null, 30)],
    [...people, { ...people[0], user_id: "former", active: false }],
    "2026-09-17",
  );
  assert.equal(balance.rows.length, 3);
  assert.deepEqual(
    balance.suggestions.map((s) => [s.entry.id, s.member.user_id]),
    [["open", c]],
  );
});
test("completion totals use occurrence identity and household timezone rather than series history", () => {
  const balance = choreBalance(
    [
      chore("done", a, 45, {
        done: true,
        date: "2026-09-06",
        completed_at: "2026-09-14T02:00:00Z",
        completed_by: b,
        last_done_by: c,
      }),
    ],
    people,
    "2026-09-13",
    "America/New_York",
  );
  assert.deepEqual(
    balance.rows.map((r) => r.completed),
    [0, 45, 0],
  );
  assert.deepEqual(
    balance.rows.map((r) => r.planned),
    [0, 0, 0],
  );
});
test("setup requires recurrence, effort and a rotation, and permits opting out of notifications", () => {
  const plain = householdSetup(people, [chore("one-off", a, 20)], false);
  assert.deepEqual(
    plain.map((s) => s.done),
    [true, false, false, false],
  );
  const complete = householdSetup(
    people,
    [
      chore("recurring", a, 20, {
        series_id: "series",
        rotation_members: [a, b, c],
      }),
      {
        ...chore("bill", null, null),
        kind: "event",
        category: "Bill",
        series_id: "bill-series",
      },
    ],
    true,
  );
  assert.ok(complete.every((s) => s.done));
});
test("three-person agreement bundles rotate through everyone with staggered first assignments", () => {
  const terms = { ...defaultHouseTerms([a, b, c]), first_bundle_a: b };
  const chores = houseChores(terms, [a, b, c], new Date("2026-09-19T12:00:00"));
  assert.deepEqual(
    chores.map((e) => e.rotation),
    [
      [b, a, c],
      [a, c, b],
    ],
  );
  assert.deepEqual(houseChores(terms, [a], new Date()), []);
});
test("pending agreement counts exclude votes already cast and requests addressed to another housemate", () => {
  assert.equal(
    pendingForMember(
      [],
      [{ status: "open", proposed_by: a, approved_by: [b] } as any],
      [{ status: "open", actor: a, details: { recipient: c } } as any],
      b,
    ),
    0,
  );
  assert.equal(
    pendingForMember(
      [],
      [{ status: "open", proposed_by: a, approved_by: [b] } as any],
      [{ status: "open", actor: a, details: { recipient: c } } as any],
      c,
    ),
    2,
  );
});

test("agreement notifications address the chosen recipient and describe partial approval accurately", async () => {
  const { agreementNotification } =
    await import("../lib/agreement-notifications");
  const request = {
    id: "request",
    kind: "swap",
    status: "open",
    actor: a,
    details: { recipient: c },
  };
  assert.equal(
    agreementNotification("event", { event: request }, "You")?.member,
    c,
  );
  assert.match(
    agreementNotification(
      "amend_decide",
      {
        amendment: {
          id: "change",
          title: "New rule",
          status: "open",
          proposed_by: a,
        },
      },
      "Alex",
    )!.title,
    /awaiting other housemates/,
  );
});
