import type { Entry, Member } from "./model";
export function lastChoreDone(
  entry: Entry,
  entries: Entry[],
): Pick<Entry, "last_done_at" | "last_done_by"> | null {
  const candidates = entries.filter(
    (e) =>
      e.kind === "task" &&
      (e.id === entry.id ||
        (!!entry.series_id && e.series_id === entry.series_id)) &&
      (e.last_done_at || e.completed_at),
  );
  candidates.sort((a, b) =>
    (b.last_done_at || b.completed_at!).localeCompare(
      a.last_done_at || a.completed_at!,
    ),
  );
  const last = candidates[0];
  return last
    ? {
        last_done_at: last.last_done_at || last.completed_at,
        last_done_by: last.last_done_by,
      }
    : null;
}
export function choreHistoryLabel(
  entry: Entry,
  entries: Entry[],
  members: Member[],
): string {
  const last = lastChoreDone(entry, entries);
  if (!last?.last_done_at) return "Last done: not recorded yet";
  const name = members.find((m) => m.user_id === last.last_done_by)?.name;
  return `Last done ${new Date(last.last_done_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}${name ? ` by ${name}` : ""}`;
}
