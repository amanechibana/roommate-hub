import type { Entry, Household, Member } from "./model";
export const SHOPPING_CACHE_KEY = "common-ground-offline-shopping-v1";
export const SHOPPING_QUEUE_KEY = "common-ground-offline-shopping-queue-v1";
export function clearOfflineShopping() {
  try {
    localStorage.removeItem(SHOPPING_CACHE_KEY);
    localStorage.removeItem(SHOPPING_QUEUE_KEY);
  } catch {}
}
export function saveOfflineShopping(
  household: Household,
  members: Member[],
  actor: string | null,
  entries: Entry[],
  demo: boolean,
) {
  try {
    const previous = JSON.parse(
      localStorage.getItem(SHOPPING_CACHE_KEY) || "null",
    );
    if (
      previous &&
      (previous.household.id !== household.id || previous.actor !== actor)
    )
      clearOfflineShopping();
    localStorage.setItem(
      SHOPPING_CACHE_KEY,
      JSON.stringify({
        household: { id: household.id, name: household.name },
        members: members.map((m) => ({ user_id: m.user_id, name: m.name })),
        actor,
        entries: entries.filter((e) => e.kind === "request"),
        saved_at: new Date().toISOString(),
        demo,
      }),
    );
  } catch {}
}
