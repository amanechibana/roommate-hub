import { shiftDay } from "./model";
import { householdDate, householdHour } from "./household-time";

export type HouseActivity = {
  id: string;
  actor: string;
  action:
    | "completed"
    | "bought"
    | "reopened"
    | "paid"
    | "noted"
    | "proposed"
    | "signed"
    | "withdrew"
    | "approved"
    | "declined"
    | "requested"
    | "accepted"
    | "recorded"
    | "added"
    | "edited"
    | "removed"
    | "attached";
  title: string;
  created_at: string;
};

export const activityVerb = (action: HouseActivity["action"]) =>
  action === "noted"
    ? "left a note:"
    : action === "paid"
      ? "marked paid:"
      : action;

/**
 * How the house talks about a moment: fresh things get a time of day, this
 * week gets a weekday, and anything older falls back to the date. Shared so
 * the board greeting and "Lately at home" describe the same event the same way.
 */
export function activityWhen(
  at: number,
  now: Date,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const today = householdDate(now, timezone);
  const then = new Date(at);
  if (now.getTime() - at < 5 * 60000) return "just now";
  if (householdDate(then, timezone) === today) {
    const hour = householdHour(then, timezone);
    return hour < 12
      ? "this morning"
      : hour < 17
        ? "this afternoon"
        : "tonight";
  }
  if (householdDate(then, timezone) === shiftDay(today, -1)) return "yesterday";
  return now.getTime() - at < 6 * 86400000
    ? then.toLocaleDateString("en-US", { timeZone: timezone, weekday: "long" })
    : then.toLocaleDateString("en-US", {
        timeZone: timezone,
        month: "short",
        day: "numeric",
        // A note stays on the fridge past New Year, and "Oct 12" on its own
        // reads as this year's.
        ...(householdDate(then, timezone).slice(0, 4) === today.slice(0, 4)
          ? {}
          : { year: "numeric" }),
      });
}
