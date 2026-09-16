import type { Entry } from "./model";

// Each RPC/HTTP response stays bounded. Merge pages only at the consumer,
// never in /api/home where another single oversized response would defeat it.
export async function collectEntryPages<
  T extends { entries: Entry[]; next_cursor?: string | null },
>(read: (cursor?: string) => Promise<T>): Promise<T> {
  const first = await read();
  const entries = new Map(first.entries.map((e) => [e.id, e]));
  const seen = new Set<string>();
  let cursor = first.next_cursor;
  while (cursor) {
    if (seen.has(cursor))
      throw new Error("Entry pagination did not advance. Please refresh.");
    seen.add(cursor);
    const page = await read(cursor);
    for (const entry of page.entries) entries.set(entry.id, entry);
    cursor = page.next_cursor;
  }
  return { ...first, entries: [...entries.values()], next_cursor: null };
}
