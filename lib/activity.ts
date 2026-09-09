import { dateKey } from "./model";

export type HouseActivity = {
  id: string;
  actor: string;
  action: "completed" | "bought" | "reopened" | "paid" | "noted";
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
export function activityWhen(at: number, now: Date): string {
  const then = new Date(at);
  if (now.getTime() - at < 5 * 60000) return "just now";
  if (dateKey(then) === dateKey(now)) {
    const hour = then.getHours();
    return hour < 12
      ? "this morning"
      : hour < 17
        ? "this afternoon"
        : "tonight";
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dateKey(then) === dateKey(yesterday)) return "yesterday";
  return now.getTime() - at < 6 * 86400000
    ? then.toLocaleDateString("en-US", { weekday: "long" })
    : then.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        // A note stays on the fridge past New Year, and "Oct 12" on its own
        // reads as this year's.
        ...(then.getFullYear() === now.getFullYear()
          ? {}
          : { year: "numeric" }),
      });
}
