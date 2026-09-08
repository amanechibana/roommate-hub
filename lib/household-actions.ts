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
