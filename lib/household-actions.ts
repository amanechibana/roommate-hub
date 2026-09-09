import { splitEvenly } from "./expenses";
import type { Entry } from "./model";

export const UNDO_DURATION = 8000;
export function isBill(entry: Pick<Entry, "kind" | "category">) {
  return entry.kind === "event" && ["Rent", "Bill"].includes(entry.category);
}
export function billPaid(entry: Entry) {
  return (
    !!entry.payment_members?.length &&
    entry.payment_members.every((id) => entry.paid_by?.includes(id))
  );
}
// One person's cut of a bill, in dollars to the cent: the number a housemate
// actually wants when the rent line says $2,400. With a member it is exactly
// what covering the bill would book for them (the odd cents land the same
// way splitEvenly lands them); without, the rounded average for "each".
// Null when there is nothing to divide or nobody to divide it among.
export function billShare(entry: Entry, member?: string): number | null {
  const payers = entry.payment_members || [];
  if (!isBill(entry) || !entry.amount || !payers.length) return null;
  const cents = Math.round(entry.amount * 100);
  if (member) {
    const share = splitEvenly(cents, payers)[member];
    return share === undefined ? null : share / 100;
  }
  return Math.round(cents / payers.length) / 100;
}
// Shares are the one money figure the house shows to the cent, but only
// when the cents are there: $1,200 and $333.33, never $1,200.00.
export const shareMoney = (dollars: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(dollars);
export function markPaid(entry: Entry, memberId: string, paid: boolean): Entry {
  if (!isBill(entry) || !entry.payment_members?.includes(memberId))
    return entry;
  const others = (entry.paid_by || []).filter((id) => id !== memberId);
  return { ...entry, paid_by: paid ? [...others, memberId] : others };
}
export function markAllPaid(entry: Entry): Entry {
  if (!isBill(entry) || !entry.payment_members?.length) return entry;
  return { ...entry, paid_by: [...entry.payment_members] };
}
// The open shopping list as a message: what a housemate texts to whoever is
// already at the store. Needs first, then wants, each with its price and
// whoever has claimed it. Empty when there is nothing to buy.
export function shoppingListText(
  entries: Entry[],
  members: { user_id: string; name: string }[],
  household: string,
): string {
  const open = entries.filter((e) => e.kind === "request" && !e.done);
  if (!open.length) return "";
  const money = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  const lines = [`Shopping for ${household}`];
  for (const category of ["Need", "Want"]) {
    const items = open.filter((e) => e.category === category);
    if (!items.length) continue;
    lines.push("", category);
    for (const item of items) {
      const who = members.find(
        (m) => m.user_id === item.assignee && m.name !== "Housemates",
      );
      lines.push(
        [
          `• ${item.title}`,
          item.amount != null ? money(Number(item.amount)) : "",
          who ? `${who.name} is getting it` : "",
        ]
          .filter(Boolean)
          .join(" — "),
      );
    }
  }
  return lines.join("\n");
}
export type ActivityEvent = { line: string; member: string | null };
/**
 * Fridge-ticker lines for changes another device made, read off a refresh's
 * entries versus the ones already on screen. Local writes are optimistic, so
 * they sit in `before` by the time a refresh runs — anything that flips here
 * happened elsewhere in the house. `member` names who did it when the entry
 * says (assignee, payment check); null means the line suits everyone.
 */
export function remoteActivity(
  before: Entry[],
  after: Entry[],
  members: { user_id: string; name: string }[],
): ActivityEvent[] {
  const name = (id: string | null) =>
    members.find((m) => m.user_id === id && m.name !== "Housemates")?.name ??
    null;
  const prev = new Map(before.map((entry) => [entry.id, entry]));
  const events: ActivityEvent[] = [];
  for (const entry of after) {
    const seen = prev.get(entry.id);
    if (!seen) continue;
    if (entry.kind === "task" && !seen.done && entry.done) {
      const who = name(entry.assignee);
      events.push({
        line: who
          ? `${who} took care of “${entry.title}”`
          : `“${entry.title}” got done`,
        member: who,
      });
    }
    if (entry.kind === "request" && !seen.done && entry.done)
      events.push({ line: `“${entry.title}” was picked up`, member: null });
    if (isBill(entry)) {
      if (billPaid(entry) && !billPaid(seen))
        events.push({ line: `“${entry.title}” is all paid`, member: null });
      else if (!billPaid(entry))
        for (const id of entry.paid_by ?? []) {
          if (seen.paid_by?.includes(id)) continue;
          const who = name(id);
          if (who)
            events.push({
              line: `${who} paid their share of “${entry.title}”`,
              member: who,
            });
        }
    }
  }
  return events;
}
/**
 * Keeps one upcoming occurrence per series — the first in the given
 * (date-sorted) list — while every overdue occurrence stays actionable.
 * A monthly rent otherwise puts all of its future months on the board.
 */
export function collapseSeries(entries: Entry[], today: string): Entry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.series_id || !entry.date || entry.date < today) return true;
    if (seen.has(entry.series_id)) return false;
    seen.add(entry.series_id);
    return true;
  });
}
/**
 * A calendar day shows one entry and hides the rest behind "+N", so the slot
 * goes to whatever still wants doing: an open chore or an unpaid bill sits
 * ahead of anything already crossed off or settled. Same order in the day
 * dialog, so the row on the grid is the row at the top of the list.
 */
export function dayOrder(entries: Entry[]): Entry[] {
  const settled = (entry: Entry) =>
    entry.done || (isBill(entry) && billPaid(entry));
  return [...entries].sort((a, b) => Number(settled(a)) - Number(settled(b)));
}
export function occurrenceAssignee(
  first: string | null,
  partner: string | undefined,
  index: number,
) {
  return partner && index % 2 === 1 ? partner : first;
}
// Series edits change shared details while retaining each occurrence's turn,
// date, completion, and payment check-offs.
export function editEntries(
  entries: Entry[],
  selected: Entry,
  values: Partial<Entry>,
  wholeSeries: boolean,
): Entry[] {
  const {
    date: _date,
    done: _done,
    paid_by: _paid,
    payment_members: _payers,
    rotation_members: _rotation,
    ...shared
  } = values;
  return entries.map((entry) => {
    if (
      entry.id !== selected.id &&
      !(
        wholeSeries &&
        selected.series_id &&
        entry.series_id === selected.series_id
      )
    )
      return entry;
    return {
      ...entry,
      ...(entry.id === selected.id ? values : shared),
      ...(wholeSeries && entry.rotation_members?.length
        ? { assignee: entry.assignee }
        : {}),
    };
  });
}
