import { isBill } from "./household-actions";
import { parseDate, type Entry, type Member } from "./model";

export type Digest = { title: string; lines: string[] };

// The household lives in one place; reminders describe that day, not the
// server's UTC day.
export const HOUSEHOLD_TIME_ZONE = "America/New_York";
export function localDateKey(now: Date, timeZone = HOUSEHOLD_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

function daysBetween(from: string, to: string) {
  return Math.round(
    (parseDate(to).getTime() - parseDate(from).getTime()) / 86400000,
  );
}

// The morning digest for one person: their chores due or overdue (unassigned
// chores belong to everyone), bills their check hasn't covered yet, and a
// nudge about needed shopping items. Null when there is nothing to say.
export function memberDigest(
  entries: Entry[],
  member: Member,
  today: string,
): Digest | null {
  const chores = entries
    .filter(
      (e) =>
        e.kind === "task" &&
        !e.done &&
        e.date &&
        e.date <= today &&
        (!e.assignee || e.assignee === member.user_id),
    )
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .map((e) =>
      e.date! < today ? `Overdue: ${e.title}` : `Today: ${e.title}`,
    );
  const bills = entries
    .filter(
      (e) =>
        isBill(e) &&
        e.date &&
        e.payment_members?.includes(member.user_id) &&
        !e.paid_by?.includes(member.user_id) &&
        daysBetween(today, e.date) <= 3,
    )
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .map((e) => {
      const days = daysBetween(today, e.date!);
      const when =
        days < 0
          ? "overdue"
          : days === 0
            ? "due today"
            : days === 1
              ? "due tomorrow"
              : `due in ${days} days`;
      const amount = e.amount ? ` (${money(e.amount)})` : "";
      return `${e.title}${amount} — ${when}`;
    });
  if (!chores.length && !bills.length) return null;
  const lines = [...bills, ...chores];
  if (lines.length > 6)
    lines.splice(6, lines.length, `…and ${lines.length - 6} more`);
  const needs = entries.filter(
    (e) => e.kind === "request" && !e.done && e.category === "Need",
  ).length;
  if (needs)
    lines.push(
      needs === 1
        ? "1 needed item on the shopping list"
        : `${needs} needed items on the shopping list`,
    );
  return { title: `Good morning, ${member.name} ☀️`, lines };
}

export function quietDigest(name: string): Digest {
  return {
    title: `Good morning, ${name} ☀️`,
    lines: ["Nothing due right now. All caught up ♡"],
  };
}
