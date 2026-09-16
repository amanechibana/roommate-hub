import type { Expense } from "./expenses";
export async function collectExpensePages(
  load: (
    cursor?: string,
  ) => Promise<{ expenses: Expense[]; next_cursor?: string | null }>,
) {
  const items = new Map<string, Expense>();
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await load(cursor);
    for (const item of page.expenses) items.set(item.id, item);
    cursor = page.next_cursor || undefined;
    if (cursor && seen.has(cursor))
      throw new Error(
        "Expense history cursor repeated. Refresh and try again.",
      );
    if (cursor) seen.add(cursor);
  } while (cursor);
  return [...items.values()];
}
