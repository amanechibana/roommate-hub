import { activityWhen } from "../lib/activity";
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageFromUrl, pageSlugs, pageUrl } from "../lib/navigation";
import { householdDate, householdHour } from "../lib/household-time";
import { localDateKey } from "../lib/reminders";
import { attentionItems } from "../lib/attention";
import {
  defaultHouseTerms,
  defaultGymTerms,
  ptoSpent,
  type Agreement,
  type Amendment,
  type AgreementEvent,
} from "../lib/agreements";
import { demoData, type Entry } from "../lib/model";
import type { CoverageRequest } from "../lib/use-improvements";

test("every page URL round-trips and preserves display and unrelated query flags", () => {
  for (const tab of Object.keys(pageSlugs) as (keyof typeof pageSlugs)[]) {
    const url = pageUrl(
      new URL("https://home.test/?display=1&keep=yes&agreement=house#old"),
      tab,
    );
    assert.equal(pageFromUrl(url), tab);
    assert.equal(url.searchParams.get("display"), "1");
    assert.equal(url.searchParams.get("keep"), "yes");
    assert.equal(url.searchParams.has("agreement"), false);
    assert.equal(url.hash, "");
    assert.equal(
      pageFromUrl(new URL(`https://home.test/?tab=${encodeURIComponent(tab)}`)),
      tab,
    );
  }
  assert.equal(
    pageFromUrl(new URL("https://home.test/?tab=invalid")),
    "Overview",
  );
});
test("household today matches reminders across travel, midnight, DST and year boundaries", () => {
  for (const [instant, zone, expected] of [
    ["2026-01-01T02:00:00Z", "America/New_York", "2025-12-31"],
    ["2026-09-18T03:59:00Z", "America/New_York", "2026-09-17"],
    ["2026-09-18T04:00:00Z", "America/New_York", "2026-09-18"],
    ["2026-03-08T06:59:00Z", "America/New_York", "2026-03-08"],
    ["2026-03-08T07:00:00Z", "America/New_York", "2026-03-08"],
    ["2026-11-01T06:00:00Z", "America/New_York", "2026-11-01"],
    ["2026-09-17T18:30:00Z", "Asia/Kolkata", "2026-09-18"],
    ["2026-09-17T18:30:00Z", "America/Los_Angeles", "2026-09-17"],
  ]) {
    assert.equal(householdDate(new Date(instant), zone), expected);
    assert.equal(localDateKey(new Date(instant), zone), expected);
  }
  assert.equal(
    householdHour(new Date("2026-03-08T06:59:00Z"), "America/New_York"),
    1,
  );
  assert.equal(
    householdHour(new Date("2026-03-08T07:00:00Z"), "America/New_York"),
    3,
  );
});
const base = demoData().entries[0];
const entry = (id: string, fields: Partial<Entry> = {}): Entry => ({
  ...base,
  id,
  kind: "task",
  category: "Chore",
  title: id,
  assignee: "you",
  created_by: "you",
  date: "2026-09-17",
  done: false,
  series_id: null,
  ...fields,
});
const agreement: Agreement = {
  id: "agreement",
  household_id: base.household_id,
  slug: "house",
  title: "House rules",
  status: "proposed",
  terms: defaultHouseTerms(["you", "alex"]),
  signed_by: ["alex"],
  proposed_by: "alex",
  proposed_at: null,
  created_at: "2026-09-17T12:00:00Z",
  updated_at: "2026-09-17T12:00:00Z",
};
const request: CoverageRequest = {
  id: "cover",
  entry_id: "chore",
  original: "alex",
  candidate: "you",
  requester: "alex",
  date: "2026-09-18",
  status: "open",
};
test("attention excludes other people, paid shares, completed chores and unactionable decisions", () => {
  const input = {
    uid: "you",
    today: "2026-09-17",
    entries: [
      entry("chore"),
      entry("done", { done: true }),
      entry("other", { assignee: "alex" }),
      entry("private-other", { visibility: "private", created_by: "alex" }),
      entry("bill", {
        kind: "event",
        category: "Bill",
        amount: 12,
        payment_members: ["you", "alex"],
        paid_by: ["alex"],
      }),
      entry("paid", {
        kind: "event",
        category: "Bill",
        payment_members: ["you"],
        paid_by: ["you"],
      }),
      entry("zero-share", {
        kind: "event",
        category: "Bill",
        amount: 12,
        payment_members: ["you", "alex"],
        bill_shares: { you: 0, alex: 1200 },
      }),
    ],
    agreements: [agreement],
    amendments: [],
    events: [],
    coverage: [
      request,
      { ...request, id: "own-request", requester: "you" },
      { ...request, id: "closed", status: "approved" as const },
      { ...request, id: "unrelated", candidate: "sam" },
    ],
  };
  assert.deepEqual(
    new Set(attentionItems(input).map((i) => i.id)),
    new Set(["chore", "bill", "agreement", "cover"]),
  );
  assert.deepEqual(attentionItems({ ...input, uid: null }), []);
  assert.equal(
    attentionItems({
      ...input,
      agreements: [{ ...agreement, signed_by: ["you"] }],
    }).some((i) => i.id === "agreement"),
    false,
  );
});
test("attention keeps all arrears, collapses future recurrence, and orders overdue before today and upcoming", () => {
  const items = attentionItems({
    uid: "you",
    today: "2026-09-17",
    agreements: [],
    amendments: [],
    events: [],
    coverage: [],
    entries: [
      entry("later", { date: "2026-09-25", series_id: "repeat" }),
      entry("next", { date: "2026-09-18", series_id: "repeat" }),
      entry("arrears2", { date: "2026-09-16", series_id: "repeat" }),
      entry("arrears1", { date: "2026-09-15", series_id: "repeat" }),
      entry("today"),
      entry("undated", { date: null }),
    ],
  });
  assert.deepEqual(
    items.map((i) => i.id),
    ["arrears1", "arrears2", "today", "next", "undated"],
  );
});

test("incoming agreement amendments and requests are actionable; own and closed decisions are excluded", () => {
  const amendment: Amendment = {
    id: "amendment",
    agreement_id: agreement.id,
    title: "Change chore days",
    body: "Review the new days",
    terms_patch: null,
    status: "open",
    proposed_by: "alex",
    decided_by: null,
    reason: null,
    created_at: agreement.created_at,
    decided_at: null,
  };
  const event: AgreementEvent = {
    id: "swap",
    agreement_id: agreement.id,
    entry_id: null,
    kind: "swap",
    status: "open",
    actor: "alex",
    hours: null,
    details: {},
    created_at: agreement.created_at,
    decided_by: null,
    decided_at: null,
  };
  const items = attentionItems({
    uid: "you",
    today: "2026-09-17",
    entries: [],
    agreements: [{ ...agreement, status: "active" }],
    coverage: [],
    amendments: [
      amendment,
      { ...amendment, id: "own", proposed_by: "you" },
      { ...amendment, id: "closed", status: "approved" },
      { ...amendment, id: "already-approved", approved_by: ["you"] },
    ],
    events: [
      event,
      { ...event, id: "my-request", actor: "you" },
      { ...event, id: "done", status: "accepted" },
      { ...event, id: "already-accepted", accepted_by: ["you"] },
      { ...event, id: "other-recipient", details: { recipient: "sam" } },
    ],
  });
  assert.deepEqual(
    new Set(items.map((i) => i.id)),
    new Set(["amendment", "swap"]),
  );
  assert.ok(items.every((i) => i.kind === "agreement" && i.slug === "house"));
});

test("agreement PTO month boundaries follow the configured household timezone", () => {
  const event: AgreementEvent = {
    id: "pto",
    agreement_id: agreement.id,
    entry_id: null,
    kind: "pto",
    status: "done",
    actor: "you",
    hours: 1,
    details: {},
    created_at: "2026-10-01T02:00:00Z",
    decided_by: null,
    decided_at: null,
  };
  const now = new Date("2026-10-01T06:00:00Z");
  const terms = defaultGymTerms();
  assert.equal(ptoSpent([event], "you", terms, now, "America/New_York"), 0);
  assert.equal(ptoSpent([event], "you", terms, now, "Asia/Kolkata"), 1);
});

test("activity yesterday follows the household day while traveling", () => {
  const now = new Date("2026-09-18T04:30:00Z");
  const at = Date.parse("2026-09-18T03:50:00Z");
  assert.equal(activityWhen(at, now, "America/New_York"), "yesterday");
  assert.equal(activityWhen(at, now, "Pacific/Honolulu"), "tonight");
});
