import { householdDate } from "./household-time";
import type { Agreement } from "./agreements";
import { billPaid, isBill, isPersonal } from "./household-actions";
import { dateKey, parseDate, shiftDay, type Entry, type Member } from "./model";
export type Resource = { id: string; name: string };
export type Booking = {
  id: string;
  resource_id: string;
  member: string;
  starts_at: string;
  ends_at: string;
  notes: string;
};
export type MoveItem = { title: string; done: boolean; notes: string };
export type Move = {
  id: string;
  member: string;
  direction: "in" | "out";
  date: string;
  items: MoveItem[];
};
export type Decision = { id: string; title: string };
export type Planning = {
  resources: Resource[];
  bookings: Booking[];
  week: string;
  checkin: null | { notes: string; reviewed_by: string; reviewed_at: string };
  decisions: Decision[];
  moves: Move[];
  bills: Entry[];
  chores: Entry[];
  pending_agreements: Decision[];
  former_members: Member[];
  checkin_history: {
    week: string;
    notes: string;
    reviewed_by: string;
    reviewed_at: string;
  }[];
  agreement_archive: {
    id: string;
    departed_member: string;
    archived_at: string;
    agreement: Agreement;
  }[];
};
export const moveTitles = [
  "Keys and access",
  "Deposit",
  "Meter readings",
  "Cleaning",
  "Final balances",
];
export function weekStart(today: string) {
  return shiftDay(today, -((parseDate(today).getDay() + 6) % 7));
}
export function weeklyItems(entries: Entry[], today: string) {
  const until = shiftDay(weekStart(today), 13);
  return {
    bills: entries.filter(
      (e) =>
        isBill(e) &&
        e.date &&
        e.date <= until &&
        !!e.payment_members?.length &&
        !billPaid(e),
    ),
    chores: entries.filter(
      (e) =>
        e.kind === "task" &&
        !isPersonal(e) &&
        !e.done &&
        (!e.date || e.date <= until),
    ),
  };
}
export function bookingsOverlap(
  a: Pick<Booking, "starts_at" | "ends_at">,
  b: Pick<Booking, "starts_at" | "ends_at">,
) {
  return (
    new Date(a.starts_at) < new Date(b.ends_at) &&
    new Date(a.ends_at) > new Date(b.starts_at)
  );
}
export function emptyPlanning(
  entries: Entry[] = [],
  today = householdDate(new Date()),
): Planning {
  return {
    resources: [
      { id: "laundry", name: "Laundry" },
      { id: "parking", name: "Parking spot" },
      { id: "workspace", name: "Shared workspace" },
    ],
    bookings: [],
    week: weekStart(today),
    checkin: null,
    decisions: [],
    moves: [],
    pending_agreements: [],
    former_members: [],
    checkin_history: [],
    agreement_archive: [],
    ...weeklyItems(entries, today),
  };
}
