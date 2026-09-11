import { billPaid, billShare, isBill, shareMoney } from "./household-actions";
import {
  expenseBalances,
  expenseMoney,
  suggestedRepayments,
  type Expense,
} from "./expenses";
import { parseDate, shiftDay, type Entry, type Member } from "./model";

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

// A bill the way a reminder names it: the total, and your cut when the
// two differ ("Rent ($2,400, your share $1,200)").
function billLine(e: Entry, member: Member) {
  const share = billShare(e, member.user_id);
  const amount = e.amount
    ? share != null && share !== e.amount
      ? ` (${money(e.amount)}, your share ${shareMoney(share)})`
      : ` (${money(e.amount)})`
    : "";
  return `${e.title}${amount}`;
}
// Whether a bill is still waiting on this person's check.
const unpaidBy = (e: Entry, member: Member) =>
  isBill(e) &&
  !!e.date &&
  !!e.payment_members?.includes(member.user_id) &&
  !e.paid_by?.includes(member.user_id);

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
    .filter((e) => unpaidBy(e, member) && daysBetween(today, e.date!) <= 3)
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
      return `${billLine(e, member)} — ${when}`;
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

// The evening heads-up for one person: tomorrow's chores and bills, and
// whatever of today's is still open at eight at night. Older overdue things
// were in the morning digest and would only nag again here. Null when there
// is nothing to say; an empty buzz at bedtime is worse than none.
export function eveningDigest(
  entries: Entry[],
  member: Member,
  today: string,
  recap: string[] = [],
): Digest | null {
  const tomorrow = shiftDay(today, 1);
  const mine = (e: Entry) =>
    e.kind === "task" &&
    !e.done &&
    (!e.assignee || e.assignee === member.user_id);
  const chores = entries.filter(
    (e) => mine(e) && (e.date === today || e.date === tomorrow),
  );
  const bills = entries.filter(
    (e) => unpaidBy(e, member) && (e.date === today || e.date === tomorrow),
  );
  if (!chores.length && !bills.length && !recap.length) return null;
  const byDate = (a: Entry, b: Entry) => a.date!.localeCompare(b.date!);
  const lines = [
    ...bills
      .sort(byDate)
      .map(
        (e) =>
          `${billLine(e, member)} — ${e.date === today ? "still due today" : "due tomorrow"}`,
      ),
    ...chores
      .sort(byDate)
      .map((e) =>
        e.date === today ? `Still today: ${e.title}` : `Tomorrow: ${e.title}`,
      ),
  ];
  if (lines.length > 6)
    lines.splice(6, lines.length, `…and ${lines.length - 6} more`);
  // The week's recap rides along on a Sunday, after tomorrow's business.
  lines.push(...recap);
  return { title: `Good evening, ${member.name} 🌙`, lines };
}

// How the week went, for everyone alike: chores done and who did them, and
// what the house spent together. Done chores are counted by their due day,
// the one date a chore carries, over the seven days ending today. Empty
// when the week left no trace.
export function weekRecap(
  entries: Entry[],
  expenses: Expense[],
  members: Member[],
  today: string,
): string[] {
  const from = shiftDay(today, -6);
  const inWeek = (date: string | null) =>
    !!date && date >= from && date <= today;
  const done = entries.filter(
    (e) => e.kind === "task" && e.done && inWeek(e.date),
  );
  const lines: string[] = [];
  if (done.length) {
    const people = members.filter((m) => m.name !== "Housemates");
    const count = (id: string | null) =>
      done.filter((e) => (e.assignee ?? null) === id).length;
    // Nobody's, or somebody the house no longer lists: shared, as the
    // board reads it.
    const shared = done.filter(
      (e) => !people.some((m) => m.user_id === e.assignee),
    ).length;
    const who = [
      ...people
        .filter((m) => count(m.user_id))
        .map((m) => `${m.name} ${count(m.user_id)}`),
      ...(shared ? [`shared ${shared}`] : []),
    ];
    lines.push(
      `${done.length} ${done.length === 1 ? "chore" : "chores"} done this week — ${who.join(", ")}`,
    );
  }
  const spent = expenses
    .filter((x) => x.kind === "expense" && inWeek(x.date))
    .reduce((sum, x) => sum + x.amount_cents, 0);
  if (spent) lines.push(`${expenseMoney(spent)} spent together this week`);
  return lines;
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

// Something you added got done by someone else: the one line that closes
// the loop. Nothing for a note, a plan, or your own check-off.
export function doneMessage(
  entry: Pick<Entry, "kind" | "title" | "done">,
  by: Member,
): Digest | null {
  if (!entry.done) return null;
  if (entry.kind === "task")
    return { title: `${by.name} took care of “${entry.title}”`, lines: [] };
  if (entry.kind === "request")
    return { title: `${by.name} picked up “${entry.title}”`, lines: [] };
  return null;
}
// Someone ticked their check on a bill you're on — the one bill moment a
// housemate actually wants to hear about — said to each other payer in
// their own terms. `ledger` means the one tap that checked everyone off and
// booked the whole bill to Expenses, so the others now owe their shares.
export function paidMessage(
  entry: Entry,
  by: Member,
  to: Member,
  ledger = false,
): Digest | null {
  if (
    !isBill(entry) ||
    !entry.payment_members?.includes(to.user_id) ||
    to.user_id === by.user_id
  )
    return null;
  const share = billShare(entry, to.user_id);
  const yours = share != null ? `${shareMoney(share)} share` : "share";
  if (ledger)
    return {
      title: `${by.name} covered “${entry.title}”`,
      lines: [`Your ${yours} is on the Expenses tab now`],
    };
  return {
    title: `${by.name} paid their share of “${entry.title}”`,
    lines: [
      billPaid(entry)
        ? `“${entry.title}” is all paid up ♡`
        : !entry.paid_by?.includes(to.user_id)
          ? `Your ${yours} isn’t checked off yet`
          : "Still waiting on someone else’s share",
    ],
  };
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
// A thank-you for something done: the small thing that keeps a house kind.
// Only for a finished to-do or a picked-up item that was somebody's.
export function thanksMessage(
  entry: Pick<Entry, "kind" | "title" | "done" | "assignee">,
  from: Member,
): Digest | null {
  if (!entry.done || !entry.assignee) return null;
  if (entry.kind === "task")
    return {
      title: `${from.name} says thanks 💛`,
      lines: [`for taking care of “${entry.title}”`],
    };
  if (entry.kind === "request")
    return {
      title: `${from.name} says thanks 💛`,
      lines: [`for picking up “${entry.title}”`],
    };
  return null;
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
// One housemate poking another: about an open to-do of theirs, a shopping
// item they claimed, or a bill share they haven't checked off (`to` says
// whose share). Null when a nudge makes no sense (done, nobody's, paid).
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
  if (entry.done || !entry.assignee) return null;
  // "I'll grab it" is a promise to the other person, and the shopping list
  // has no due date to lean on, so the nudge is about the claim itself.
  if (entry.kind === "request")
    return {
      title,
      lines: [
        `“${entry.title}” is still on the shopping list — you said you’d grab it`,
      ],
    };
  if (entry.kind !== "task") return null;
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
