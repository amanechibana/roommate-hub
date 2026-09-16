import type { Entry, Member } from "./model";
import type { Expense } from "./expenses";
import { shiftDay } from "./model";

export type ChecklistStep = { id: string; title: string; done: boolean };
export type ChoreTemplate = {
  id: string;
  title: string;
  steps: string[];
  effort_minutes: number;
};
export const choreTemplates: ChoreTemplate[] = [
  {
    id: "kitchen",
    title: "Clean kitchen",
    steps: [
      "Wash dishes",
      "Wipe counters and stove",
      "Sweep and mop",
      "Empty trash",
    ],
    effort_minutes: 30,
  },
  {
    id: "bathroom",
    title: "Clean bathroom",
    steps: [
      "Clean sink and mirror",
      "Scrub toilet",
      "Clean shower",
      "Mop floor",
    ],
    effort_minutes: 25,
  },
];
export type NotificationTopic =
  | "chores"
  | "plans"
  | "bills"
  | "shopping"
  | "expenses"
  | "notes"
  | "agreements"
  | "nudges";
export const notificationTopics: NotificationTopic[] = [
  "chores",
  "plans",
  "bills",
  "shopping",
  "expenses",
  "notes",
  "agreements",
  "nudges",
];
export type ReminderPreferences = {
  morning: string | null;
  evening: string | null;
  topics: NotificationTopic[];
};
export type HouseholdPreferences = {
  timezone: string;
  quiet_start: string;
  quiet_end: string;
  templates: ChoreTemplate[];
};
export const defaultHouseholdPreferences: HouseholdPreferences = {
  timezone: "America/New_York",
  quiet_start: "22:00",
  quiet_end: "08:00",
  templates: [],
};
export const defaultReminderPreferences: ReminderPreferences = {
  morning: "08:00",
  evening: "19:00",
  topics: notificationTopics,
};
export function localClock(now: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}
export function inQuietHours(time: string, start: string, end: string) {
  if (start === end) return false;
  return start < end
    ? time >= start && time < end
    : time >= start || time < end;
}
export function reminderDue(
  now: Date,
  at: string | null,
  house: HouseholdPreferences,
) {
  if (!at) return false;
  const time = localClock(now, house.timezone);
  // The scheduler polls every five minutes; each configured time has one delivery window.
  const minutes = (t: string) =>
    Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return (
    (minutes(time) - minutes(at) + 1440) % 1440 < 5 &&
    !inQuietHours(time, house.quiet_start, house.quiet_end)
  );
}
export function percentageShares(
  cents: number,
  percentages: Record<string, string>,
): Record<string, number> | null {
  const parts = Object.entries(percentages).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (!parts.length || !Number.isSafeInteger(cents) || cents <= 0) return null;
  const weights = parts.map(([, value]) =>
    /^\d+(\.\d{1,2})?$/.test(value.trim())
      ? Math.round(Number(value) * 100)
      : NaN,
  );
  if (
    weights.some((w) => !Number.isFinite(w) || w < 0 || w > 10000) ||
    weights.reduce((a, b) => a + b, 0) !== 10000
  )
    return null;
  const shares = weights.map((w) => Math.floor((cents * w) / 10000));
  const remainder = cents - shares.reduce((a, b) => a + b, 0);
  const ranked = weights
    .map((w, i) => ({ i, fraction: (cents * w) % 10000 }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let n = 0; n < remainder; n++) shares[ranked[n].i]++;
  return Object.fromEntries(parts.map(([id], i) => [id, shares[i]]));
}
export function monthlySummary(expenses: Expense[], month: string) {
  const categories: Record<string, number> = {};
  const members: Record<string, number> = {};
  let total = 0;
  for (const e of expenses) {
    if (e.kind !== "expense" || !e.date.startsWith(month)) continue;
    total += e.amount_cents;
    const category = e.category || "Other";
    categories[category] = (categories[category] || 0) + e.amount_cents;
    members[e.paid_by] = (members[e.paid_by] || 0) + e.amount_cents;
  }
  return { total, categories, members };
}
export function coverageSuggestions(entries: Entry[], members: Member[]) {
  const away = (id: string, date: string) =>
    entries.some(
      (e) =>
        e.kind === "event" &&
        e.category === "Away" &&
        e.assignee === id &&
        e.date === date,
    );
  return entries
    .filter(
      (e) =>
        e.kind === "task" &&
        e.category !== "Personal" &&
        !e.done &&
        e.date &&
        e.assignee &&
        away(e.assignee, e.date),
    )
    .map((entry) => {
      const candidates = members.filter(
        (m) =>
          m.name !== "Housemates" &&
          m.user_id !== entry.assignee &&
          !away(m.user_id, entry.date!),
      );
      candidates.sort(
        (a, b) =>
          entries.filter(
            (e) =>
              e.kind === "task" &&
              !e.done &&
              e.assignee === a.user_id &&
              e.date === entry.date,
          ).length -
            entries.filter(
              (e) =>
                e.kind === "task" &&
                !e.done &&
                e.assignee === b.user_id &&
                e.date === entry.date,
            ).length || a.user_id.localeCompare(b.user_id),
      );
      return { entry, candidate: candidates[0] ?? null };
    });
}
function eventInterval(e: Pick<Entry, "date" | "time_of_day" | "end_time">) {
  if (!e.date) return null;
  const start = `${e.date}T${e.time_of_day || "00:00"}`;
  const end = !e.time_of_day
    ? `${shiftDay(e.date, 1)}T00:00`
    : `${e.end_time && e.end_time > e.time_of_day ? e.date : shiftDay(e.date, 1)}T${e.end_time || e.time_of_day}`;
  // An unspecified end for a timed event means an hour, matching calendar export.
  if (e.time_of_day && !e.end_time) {
    const minutes =
      Number(e.time_of_day.slice(0, 2)) * 60 +
      Number(e.time_of_day.slice(3)) +
      60;
    return {
      start,
      end: `${minutes >= 1440 ? shiftDay(e.date, 1) : e.date}T${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    };
  }
  return { start, end };
}
export function calendarConflicts(
  guest: Pick<Entry, "id" | "date" | "time_of_day" | "end_time" | "category">,
  entries: Entry[],
  house: HouseholdPreferences,
) {
  if (guest.category !== "Guest") return [];
  const visit = eventInterval(guest);
  if (!visit) return [];
  const warnings: string[] = [];
  for (const e of entries) {
    if (
      e.id === guest.id ||
      e.kind !== "event" ||
      ["Away", "Gym", "Guest", "Rent", "Bill"].includes(e.category)
    )
      continue;
    const interval = eventInterval(e);
    if (interval && visit.start < interval.end && interval.start < visit.end)
      warnings.push(`Overlaps ${e.title}`);
  }
  // Compare a visit with quiet hours starting both on its date and the preceding date.
  if (house.quiet_start !== house.quiet_end)
    for (const day of [shiftDay(guest.date!, -1), guest.date!]) {
      const start = `${day}T${house.quiet_start}`;
      const end = `${house.quiet_end > house.quiet_start ? day : shiftDay(day, 1)}T${house.quiet_end}`;
      if (visit.start < end && start < visit.end) {
        warnings.push("Overlaps household quiet hours");
        break;
      }
    }
  return warnings;
}
