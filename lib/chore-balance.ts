import { shiftDay, type Entry, type Member } from "./model";
import { weekStart } from "./coordination";

export function choreBalance(
  entries: Entry[],
  members: Member[],
  today: string,
  timezone = "America/New_York",
) {
  const start = weekStart(today);
  const end = shiftDay(start, 6);
  const people = members.filter(
    (m) => m.name !== "Housemates" && m.active !== false,
  );
  const chores = entries.filter(
    (e) =>
      e.kind === "task" &&
      e.category === "Chore" &&
      e.visibility !== "private" &&
      e.date &&
      e.date >= start &&
      e.date <= end,
  );
  const rows = people.map((member) => ({
    member,
    planned: 0,
    completed: 0,
    unknown: 0,
  }));
  const byId = new Map(rows.map((r) => [r.member.user_id, r]));
  for (const chore of chores) {
    const row = byId.get(chore.assignee ?? "");
    if (!row) continue;
    if (chore.effort_minutes) row.planned += chore.effort_minutes;
    else row.unknown++;
  }
  // completed_at belongs to this occurrence. last_done_at may be the most
  // recent completion of a different occurrence, supplied by the home API.
  for (const chore of entries) {
    if (
      chore.kind !== "task" ||
      chore.category !== "Chore" ||
      chore.visibility === "private" ||
      !chore.done ||
      !chore.completed_at
    )
      continue;
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
    }).format(new Date(chore.completed_at));
    if (date < start || date > end) continue;
    const row = byId.get(
      chore.completed_by ?? chore.last_done_by ?? chore.assignee ?? "",
    );
    if (row && chore.effort_minutes) row.completed += chore.effort_minutes;
  }
  const loads = new Map(rows.map((r) => [r.member.user_id, 0]));
  for (const chore of chores.filter((e) => e.done && e.effort_minutes)) {
    if (loads.has(chore.assignee ?? ""))
      loads.set(
        chore.assignee!,
        loads.get(chore.assignee!)! + chore.effort_minutes!,
      );
  }
  const pending = chores
    .filter((e) => !e.done && e.effort_minutes)
    .sort(
      (a, b) =>
        b.effort_minutes! - a.effort_minutes! || a.id.localeCompare(b.id),
    );
  const proposals: { entry: Entry; member: Member }[] = [];
  for (const entry of pending) {
    const available = people.filter(
      (m) =>
        !entries.some(
          (e) =>
            e.kind === "event" &&
            e.category === "Away" &&
            e.assignee === m.user_id &&
            e.date === entry.date,
        ),
    );
    available.sort(
      (a, b) =>
        loads.get(a.user_id)! - loads.get(b.user_id)! ||
        Number(b.user_id === entry.assignee) -
          Number(a.user_id === entry.assignee) ||
        a.user_id.localeCompare(b.user_id),
    );
    const member = available[0];
    if (!member) continue;
    loads.set(
      member.user_id,
      loads.get(member.user_id)! + entry.effort_minutes!,
    );
    if (member.user_id !== entry.assignee) proposals.push({ entry, member });
  }
  const spread = (values: number[]) =>
    values.length ? Math.max(...values) - Math.min(...values) : 0;
  const improves =
    spread([...loads.values()]) < spread(rows.map((r) => r.planned));
  return {
    start,
    end,
    rows,
    chores,
    unknown: chores.filter((e) => !e.effort_minutes).length,
    unassigned: chores.filter((e) => !byId.has(e.assignee ?? "")).length,
    suggestions: proposals.filter(
      (p) =>
        improves ||
        !byId.has(p.entry.assignee ?? "") ||
        entries.some(
          (e) =>
            e.kind === "event" &&
            e.category === "Away" &&
            e.assignee === p.entry.assignee &&
            e.date === p.entry.date,
        ),
    ),
    target: people.length
      ? chores.reduce((n, e) => n + (e.effort_minutes ?? 0), 0) / people.length
      : 0,
  };
}
