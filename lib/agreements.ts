import { dateKey, type Entry } from "./model";

export type AgreementSlug = "house" | "gym";
export type AgreementStatus = "draft" | "proposed" | "active";
export type DayType = "Push" | "Pull" | "Legs";
export type HouseTerms = {
  swap_deadline: string; // e.g. "Wednesday 11:59 PM" (display only)
  max_swaps_month: number;
  max_skips_month: number;
  miss_trigger: number;
  failure_clause: string;
  bundles: {
    a: { name: string; items: string[] };
    b: { name: string; items: string[] };
  };
  first_bundle_a: string | null; // user_id holding Bundle A in week 1
  chore_series_ids?: string[];
};
export type GymTemplateDay = {
  on: boolean;
  day_type: DayType | "Auto";
  time: string;
};
export type GymTerms = {
  days_per_week: number;
  template: GymTemplateDay[]; // index 0 = Monday … 6 = Sunday
  ramp: null | {
    start_time: string;
    weekly_shift_min: number;
    target_time: string;
    target_date: string;
  };
  pto: { hours: number; period: "month" | "year" };
  miss_trigger: number;
  failure_clause: string;
  gym_series_id?: string;
};
export type Agreement = {
  id: string;
  household_id: string;
  slug: AgreementSlug;
  title: string;
  status: AgreementStatus;
  terms: HouseTerms | GymTerms;
  signed_by: string[];
  proposed_by: string | null;
  proposed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type Amendment = {
  id: string;
  agreement_id: string;
  title: string;
  body: string;
  terms_patch: Record<string, unknown> | null;
  status: "open" | "approved" | "declined" | "withdrawn";
  proposed_by: string;
  decided_by: string | null;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
};
export type AgreementEventKind =
  | "skip_rollover"
  | "skip_cover"
  | "swap"
  | "reschedule"
  | "pto"
  | "sick"
  | "cover_repaid";
export type AgreementEvent = {
  id: string;
  agreement_id: string;
  entry_id: string | null;
  kind: AgreementEventKind;
  status: "open" | "accepted" | "declined" | "done";
  actor: string;
  hours: number | null;
  details: Record<string, unknown>;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
};
export type GymExercise = {
  name: string;
  sets: { reps: number; weight: string }[];
};
export type GymLog = {
  id: string;
  entry_id: string;
  member: string;
  day_type: DayType;
  weights_minutes: number;
  cardio_minutes: number;
  exercises: GymExercise[];
  notes: string;
  created_at: string;
  updated_at: string;
};

// The contract's Schedule A/B checklists; the document renders these and the
// default terms seed from them, so they live in one place.
export const BUNDLE_A = {
  name: "Kitchen & Trash",
  items: [
    "Counters and stovetop wiped down",
    "Sink empty and scrubbed; no dish backlog surviving the week",
    "Floor swept; spills spot-mopped",
    "Expired or abandoned items cleared from the fridge",
    "Dish towels swapped for clean ones",
    "All bins emptied and out by collection day",
    "Liners replaced",
    "Recycling sorted and out",
  ],
} as const;
export const BUNDLE_B = {
  name: "Bathroom & Common Areas",
  items: [
    "Toilet bowl and seat cleaned",
    "Sink and mirror wiped",
    "Shower rinsed; visible hair removed from the drain (yes, that item is load-bearing)",
    "Floor wiped or swept",
    "Toilet paper stocked",
    "Floors vacuumed or swept",
    "Surfaces decluttered and dusted",
    "Couch and cushions reset",
    "Mail sorted; junk discarded",
  ],
} as const;

export function defaultHouseTerms(memberIds: string[]): HouseTerms {
  return {
    swap_deadline: "Wednesday 11:59 PM",
    max_swaps_month: 2,
    max_skips_month: 2,
    miss_trigger: 2,
    failure_clause: "",
    bundles: {
      a: { name: BUNDLE_A.name, items: [...BUNDLE_A.items] },
      b: { name: BUNDLE_B.name, items: [...BUNDLE_B.items] },
    },
    first_bundle_a: memberIds[0] ?? null,
  };
}

export function defaultGymTerms(): GymTerms {
  return {
    days_per_week: 6,
    template: Array.from({ length: 7 }, (_, day) => ({
      on: day < 6,
      day_type: "Auto" as const,
      time: "07:00",
    })),
    ramp: null,
    pto: { hours: 3, period: "month" },
    miss_trigger: 2,
    failure_clause: "",
  };
}

function inPtoWindow(
  iso: string,
  period: "month" | "year",
  now: Date,
): boolean {
  const date = new Date(iso);
  if (date.getFullYear() !== now.getFullYear()) return false;
  return period === "year" || date.getMonth() === now.getMonth();
}

export function ptoSpent(
  events: AgreementEvent[],
  memberId: string,
  terms: GymTerms,
  now: Date,
): number {
  return events
    .filter(
      (event) =>
        event.kind === "pto" &&
        event.actor === memberId &&
        inPtoWindow(event.created_at, terms.pto.period, now),
    )
    .reduce((sum, event) => sum + (event.hours ?? 0), 0);
}

export function ptoRemaining(
  events: AgreementEvent[],
  memberId: string,
  terms: GymTerms,
  now: Date,
): number {
  return Math.max(0, terms.pto.hours - ptoSpent(events, memberId, terms, now));
}

export function pendingForMember(
  agreements: Agreement[],
  amendments: Amendment[],
  events: AgreementEvent[],
  uid: string | null,
): number {
  if (!uid) return 0;
  return (
    agreements.filter(
      (agreement) =>
        agreement.status === "proposed" && !agreement.signed_by.includes(uid),
    ).length +
    amendments.filter(
      (amendment) =>
        amendment.status === "open" && amendment.proposed_by !== uid,
    ).length +
    events.filter((event) => event.status === "open" && event.actor !== uid)
      .length
  );
}

const monthWindow = (monthStart: Date): [string, string] => [
  dateKey(monthStart),
  dateKey(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)),
];

export function unexcusedGymMisses(
  entries: Entry[],
  logs: GymLog[],
  events: AgreementEvent[],
  memberId: string,
  monthStart: Date,
): number {
  const [start, end] = monthWindow(monthStart);
  const today = dateKey(new Date());
  const covered = new Set(
    events
      .filter(
        (event) =>
          event.entry_id &&
          event.actor === memberId &&
          (((event.kind === "pto" || event.kind === "sick") &&
            event.status === "done") ||
            (event.kind === "reschedule" && event.status === "accepted")),
      )
      .map((event) => event.entry_id),
  );
  return entries.filter(
    (entry) =>
      entry.kind === "event" &&
      entry.category === "Gym" &&
      entry.date &&
      entry.date >= start &&
      entry.date < end &&
      entry.date < today &&
      !logs.some(
        (log) => log.entry_id === entry.id && log.member === memberId,
      ) &&
      !covered.has(entry.id),
  ).length;
}

export function choreMisses(
  entries: Entry[],
  terms: HouseTerms,
  memberId: string,
  monthStart: Date,
): number {
  const series = terms.chore_series_ids ?? [];
  const [start, end] = monthWindow(monthStart);
  const today = dateKey(new Date());
  // Swaps, covers, and rollovers all rewrite the entry itself (assignee or
  // date), so an uncovered miss is simply a past, undone, still-assigned row.
  return entries.filter(
    (entry) =>
      entry.kind === "task" &&
      entry.series_id &&
      series.includes(entry.series_id) &&
      entry.assignee === memberId &&
      !entry.done &&
      entry.date &&
      entry.date >= start &&
      entry.date < end &&
      entry.date < today,
  ).length;
}
