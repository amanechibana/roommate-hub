// Bounded parallel fan-out; one rejected send never prevents another device.
export async function deliverAll<T>(
  items: T[],
  send: (item: T) => Promise<"sent" | "pruned" | "failed" | "skipped">,
  budgetMs = 45000,
  concurrency = 6,
) {
  const results: ("sent" | "pruned" | "failed" | "skipped")[] = items.map(
    () => "failed",
  );
  const deadline = Date.now() + budgetMs;
  let index = 0;
  await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length && Date.now() < deadline) {
        const current = index++;
        try {
          results[current] = await send(items[current]);
        } catch {
          results[current] = "failed";
        }
      }
    }),
  );
  return results;
}
