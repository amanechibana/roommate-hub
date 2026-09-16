import type { Entry, Member } from "./model";
import type { Tab } from "./household-config";
import { matchesSearch } from "./search";
export type HouseholdSearchResult = {
  key: string;
  tab: Tab;
  title: string;
  detail: string;
  entry?: Entry | null;
};
export function searchEntries(
  query: string,
  entries: Entry[],
  members: Member[],
): HouseholdSearchResult[] {
  const tab: Record<Entry["kind"], Tab> = {
    task: "To-dos",
    event: "Calendar",
    request: "Shopping list",
    note: "House notes",
  };
  return entries
    .filter((e) =>
      matchesSearch(
        query,
        e.title,
        e.description,
        e.category,
        e.date,
        e.amount,
        e.quantity,
        e.unit,
        e.store,
        JSON.stringify(e.checklist || []),
        members.find((m) => m.user_id === (e.assignee || e.created_by))?.name,
      ),
    )
    .map((e) => ({
      key: `entry:${e.id}`,
      tab: tab[e.kind],
      title: e.title,
      detail: e.description,
      entry: e,
    }));
}
