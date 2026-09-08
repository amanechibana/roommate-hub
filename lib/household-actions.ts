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
