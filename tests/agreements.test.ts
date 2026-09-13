import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultGymTerms,
  defaultHouseTerms,
  pendingForMember,
  ptoRemaining,
  ptoSpent,
} from "../lib/agreements";
import type { Agreement, AgreementEvent, GymTerms } from "../lib/agreements";
import { gymSessions, houseChores } from "../lib/gym-schedule";

const MONDAY = new Date(2026, 8, 14); // 2026-09-14 is a Monday

function ptoEvent(overrides: Partial<AgreementEvent>): AgreementEvent {
  return {
    id: "e1",
    agreement_id: "g1",
    entry_id: null,
    kind: "pto",
    status: "done",
    actor: "amane",
    hours: 1,
    details: {},
    created_at: "2026-09-10T12:00:00Z",
    decided_by: null,
    decided_at: null,
    ...overrides,
  };
}

test("default gym template generates Mon-Sat sessions cycling Push/Pull/Legs", () => {
  const sessions = gymSessions(defaultGymTerms(), MONDAY, "series");
  assert.deepEqual(
    sessions.slice(0, 6).map((s) => s.title),
    ["Push day", "Pull day", "Legs day", "Push day", "Pull day", "Legs day"],
  );
  assert.equal(sessions[0].date, "2026-09-14");
  assert.equal(sessions[0].time, "07:00");
  assert.ok(!sessions.some((s) => s.date === "2026-09-20")); // Sunday off
});

test("the Push/Pull/Legs cycle rolls across weeks instead of restarting", () => {
  const sessions = gymSessions(defaultGymTerms(), MONDAY, "series");
  const week2Monday = sessions.find((s) => s.date === "2026-09-21");
  assert.equal(week2Monday?.title, "Push day"); // 6 sessions/week keeps 3-cycle aligned
  const week2Tuesday = sessions.find((s) => s.date === "2026-09-22");
  assert.equal(week2Tuesday?.title, "Pull day");
});

test("an explicit day type repositions the Auto cycle after it", () => {
  const terms = defaultGymTerms();
  terms.template[0].day_type = "Legs";
  const sessions = gymSessions(terms, MONDAY, "series");
  assert.equal(sessions[0].title, "Legs day");
  assert.equal(sessions[1].title, "Push day");
});

test("ramp shifts start earlier weekly and floors at the target time", () => {
  const terms: GymTerms = {
    ...defaultGymTerms(),
    ramp: {
      start_time: "07:00",
      weekly_shift_min: 15,
      target_time: "06:00",
      target_date: "2026-12-01",
    },
  };
  const sessions = gymSessions(terms, MONDAY, "series");
  const at = (date: string) => sessions.find((s) => s.date === date)?.time;
  assert.equal(at("2026-09-14"), "07:00"); // week 1
  assert.equal(at("2026-09-19"), "07:00"); // still week 1
  assert.equal(at("2026-09-21"), "06:45"); // week 2
  assert.equal(at("2026-10-12"), "06:00"); // week 5: floor reached exactly
  assert.equal(at("2026-10-19"), "06:00"); // week 6: floored, not 05:45
});

test("ramp horizon extends through the target date", () => {
  const terms: GymTerms = {
    ...defaultGymTerms(),
    ramp: {
      start_time: "07:00",
      weekly_shift_min: 5,
      target_time: "06:00",
      target_date: "2026-12-14",
    },
  };
  const sessions = gymSessions(terms, MONDAY, "series");
  assert.ok(sessions.some((s) => s.date === "2026-12-14"));
});

test("houseChores alternates rotation so first_bundle_a gets Bundle A first", () => {
  const terms = defaultHouseTerms(["amane", "barnatt"]);
  const saturday = new Date(2026, 8, 19); // 2026-09-19 is a Saturday
  const chores = houseChores(terms, ["amane", "barnatt"], saturday);
  assert.equal(chores.length, 2);
  assert.equal(chores[0].weekday, 0);
  assert.deepEqual(chores[0].rotation, ["amane", "barnatt"]);
  assert.deepEqual(chores[1].rotation, ["barnatt", "amane"]);
  assert.ok(chores[0].description.startsWith("• "));
});

test("PTO windows are per calendar month and per member", () => {
  const terms = defaultGymTerms(); // 3h / month
  const now = new Date(2026, 8, 15);
  const events = [
    ptoEvent({ id: "a", hours: 1 }),
    ptoEvent({ id: "b", hours: 0.5, created_at: "2026-08-30T12:00:00Z" }),
    ptoEvent({ id: "c", hours: 2, actor: "barnatt" }),
    ptoEvent({ id: "d", hours: 1, kind: "sick" }), // sick days are free
  ];
  assert.equal(ptoSpent(events, "amane", terms, now), 1);
  assert.equal(ptoRemaining(events, "amane", terms, now), 2);
  assert.equal(ptoRemaining(events, "barnatt", terms, now), 1);
});

test("yearly PTO pools count the whole calendar year", () => {
  const terms: GymTerms = { ...defaultGymTerms(), pto: { hours: 7, period: "year" } };
  const now = new Date(2026, 8, 15);
  const events = [
    ptoEvent({ id: "a", hours: 1, created_at: "2026-02-01T12:00:00Z" }),
    ptoEvent({ id: "b", hours: 1, created_at: "2025-12-31T12:00:00Z" }), // last year
  ];
  assert.equal(ptoRemaining(events, "amane", terms, now), 6);
});

test("pendingForMember counts only items awaiting this member", () => {
  const agreement = {
    id: "g1",
    household_id: "h",
    slug: "gym",
    title: "The Iron Pact",
    status: "proposed",
    terms: defaultGymTerms(),
    signed_by: ["barnatt"],
    proposed_by: "barnatt",
    proposed_at: "2026-09-10T12:00:00Z",
    created_at: "2026-09-10T12:00:00Z",
    updated_at: "2026-09-10T12:00:00Z",
  } as Agreement;
  const openEvent = ptoEvent({ kind: "swap", status: "open", actor: "barnatt" });
  assert.equal(pendingForMember([agreement], [], [openEvent], "amane"), 2);
  assert.equal(pendingForMember([agreement], [], [openEvent], "barnatt"), 0);
});
