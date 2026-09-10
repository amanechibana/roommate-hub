import { billShare, isBill, shareMoney } from "./household-actions";
import {
  expenseBalances,
  expenseMoney,
  suggestedRepayments,
  type Expense,
} from "./expenses";
import { parseDate, type Entry, type Member } from "./model";

export type Digest = { title: string; lines: string[] };

// The household lives in one place; reminders describe that day, not the
// server's UTC day.
export const HOUSEHOLD_TIME_ZONE = "America/New_York";
// Nobody wants a nudge at 2am. Between ten at night and eight in the
// morning, household time, nudges wait; the morning digest goes at eight.
export function quietHours(now: Date, timeZone = HOUSEHOLD_TIME_ZONE) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  return hour >= 22 || hour < 8;
}
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
// What the ledger says about one person, the way the overview says it:
// "You owe Alex $12", "Sam owes you $5". Nothing when they're square.
export function balanceLines(
  expenses: Expense[],
  member: Member,
  members: Member[],
): string[] {
  const name = (id: string) =>
    members.find((m) => m.user_id === id)?.name ?? "a housemate";
  return suggestedRepayments(expenseBalances(expenses))
    .filter((p) => p.from === member.user_id || p.to === member.user_id)
    .map((p) =>
      p.from === member.user_id
        ? `You owe ${name(p.to)} ${expenseMoney(p.amount)}`
        : `${name(p.from)} owes you ${expenseMoney(p.amount)}`,
    );
}
export function memberDigest(
  entries: Entry[],
  member: Member,
  today: string,
  owed: string[] = [],
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
      const share = billShare(e, member.user_id);
      const amount = e.amount
        ? share != null && share !== e.amount
          ? ` (${money(e.amount)}, your share ${shareMoney(share)})`
          : ` (${money(e.amount)})`
        : "";
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
  // Money rides along with a digest that is going out anyway; a balance on
  // its own is not worth a morning buzz.
  lines.push(...owed.slice(0, 2));
  return { title: `Good morning, ${member.name} ☀️`, lines };
}

// How the house says when something was or is due, for a nudge: near days
// get a weekday, farther ones a date, matching the board's own voice.
function dueWhen(date: string, today: string) {
  const days = daysBetween(today, date);
  if (days === 0) return "is due today";
  if (days === -1) return "was due yesterday";
  if (days === 1) return "is due tomorrow";
  const when =
    Math.abs(days) < 7
      ? parseDate(date).toLocaleDateString("en-US", { weekday: "long" })
      : parseDate(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
  return days < 0 ? `was due ${when}` : `is due ${when}`;
}

// A note pinned to the fridge, read out to the rest of the house. The body
// is the note's first line or so; the rest is on the fridge.
export function noteMessage(
  entry: Pick<Entry, "kind" | "title" | "description">,
  from: Member,
): Digest | null {
  if (entry.kind !== "note") return null;
  const body = entry.description.trim().replace(/\s+/g, " ");
  const preview = body.length > 140 ? `${body.slice(0, 139).trimEnd()}…` : body;
  return {
    title: `${from.name} left a note on the fridge`,
    lines: [entry.title, ...(preview ? [preview] : [])],
  };
}
// A chore changing hands from the row menu: the new owner hears about it
// the moment it lands, in the same voice as a nudge.
export function handoffMessage(
  entry: Entry,
  from: Member,
  today: string,
): Digest | null {
  if (entry.kind !== "task" || entry.done || !entry.assignee) return null;
  const when = entry.date ? ` ${dueWhen(entry.date, today)}` : "";
  return {
    title: `${from.name} handed you a to-do`,
    lines: [`“${entry.title}”${when}`],
  };
}
// One housemate poking another: about an open to-do of theirs, or about a
// bill share they haven't checked off (`to` says whose share). Null when a
// nudge makes no sense (done, nobody's, already paid).
export function nudgeMessage(
  entry: Entry,
  from: Member,
  today: string,
  to?: Member,
): Digest | null {
  const title = `${from.name} gave you a nudge`;
  if (isBill(entry) && to) {
    if (
      !entry.payment_members?.includes(to.user_id) ||
      entry.paid_by?.includes(to.user_id)
    )
      return null;
    const share = billShare(entry, to.user_id);
    const when = entry.date ? ` ${dueWhen(entry.date, today)}` : "";
    const yours =
      share != null && share !== entry.amount
        ? `your ${shareMoney(share)} share`
        : "your share";
    const amount =
      entry.amount && yours === "your share" ? ` (${money(entry.amount)})` : "";
    return {
      title,
      lines: [`“${entry.title}”${amount}${when} — ${yours} isn’t checked off`],
    };
  }
  if (entry.kind !== "task" || entry.done || !entry.assignee) return null;
  const line = entry.date
    ? `“${entry.title}” ${dueWhen(entry.date, today)}`
    : `“${entry.title}” is waiting on you`;
  return { title, lines: [line] };
}

export function quietDigest(name: string): Digest {
  return {
    title: `Good morning, ${name} ☀️`,
    lines: ["Nothing due right now. All caught up ♡"],
  };
}
