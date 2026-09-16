import { expenseBalances, type Expense } from "./expenses";
export type QueuedChange = {
  id: string;
  path: string;
  body: {
    operation: string;
    payload: Record<string, unknown>;
    sender?: string;
  };
  at: number;
};
export type OfflineState = {
  household: string;
  member: string | null;
  savedAt: number;
  cache: Record<string, unknown>;
  queue: QueuedChange[];
  error: string;
};
export const OFFLINE_KEY = "common-ground-offline-v1";
export const emptyOfflineState = (): OfflineState => ({
  household: "",
  member: null,
  savedAt: 0,
  cache: {},
  queue: [],
  error: "",
});
export function readOffline(): OfflineState {
  try {
    const state = JSON.parse(localStorage.getItem(OFFLINE_KEY) || "null");
    return state &&
      typeof state.household === "string" &&
      state.cache &&
      typeof state.cache === "object" &&
      Array.isArray(state.queue)
      ? state
      : emptyOfflineState();
  } catch {
    return emptyOfflineState();
  }
}
export function writeOffline(state: OfflineState) {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("household-offline-status"));
}
export function clearOffline() {
  localStorage.removeItem(OFFLINE_KEY);
  sessionStorage.removeItem("household-search-target");
  window.dispatchEvent(new Event("household-offline-status"));
}
// Absolute updates are replayable; short-lived undo tokens and payment actions require a connection.
export function queueable(path: string, method: string, body: any) {
  return (
    method === "POST" &&
    ["/api/home", "/api/expenses"].includes(path) &&
    [
      "create",
      "update",
      "delete",
      ...(path === "/api/home" ? ["split_shopping"] : []),
    ].includes(body?.operation)
  );
}
export function overlayChange(
  cache: Record<string, any>,
  change: QueuedChange,
  optimistic: any,
) {
  const { operation, payload } = change.body;
  const records = () => [
    ...new Map(
      Object.entries(cache)
        .filter(([key]) => key.startsWith("/api/expenses"))
        .flatMap(
          ([, value]) =>
            value?.expenses ?? (value?.expense ? [value.expense] : []),
        )
        .map((e: Expense) => [e.id, e] as const),
    ).values(),
  ];
  const before = change.path === "/api/expenses" ? records() : [];
  const field = change.path === "/api/home" ? "entries" : "expenses";
  for (const [key, value] of Object.entries(cache)) {
    if (!key.startsWith(change.path)) continue;
    if (field === "expenses" && value?.expense?.id === payload.id) {
      value.expense =
        operation === "delete" ? null : { ...value.expense, ...payload };
    }
    if (!Array.isArray(value?.[field])) continue;
    if (operation === "create" || operation === "split_shopping") {
      const copies =
        field === "entries"
          ? (optimistic?.entries ?? [])
          : optimistic?.expense
            ? [optimistic.expense]
            : [];
      value[field] = [
        ...copies,
        ...value[field].filter(
          (e: any) =>
            !(operation === "split_shopping" && e.id === payload.id) &&
            !copies.some((c: any) => c.id === e.id),
        ),
      ];
    } else if (operation === "delete") {
      const selected = value[field].find((e: any) => e.id === payload.id);
      value[field] = value[field].filter(
        (e: any) =>
          e.id !== payload.id &&
          !(
            payload.scope === "series" &&
            selected?.series_id &&
            e.series_id === selected.series_id
          ),
      );
    } else {
      const selected = value[field].find((e: any) => e.id === payload.id);
      value[field] = value[field].map((e: any) => {
        if (e.id === payload.id) return { ...e, ...payload };
        if (
          payload.scope === "series" &&
          selected?.series_id &&
          e.series_id === selected.series_id
        ) {
          const { date, done, assignee, ...shared } = payload;
          return {
            ...e,
            ...shared,
            ...(e.rotation_members?.length ? {} : { assignee }),
          };
        }
        return e;
      });
    }
  }
  if (field === "expenses") {
    const after = records();
    const oldBalances = expenseBalances(before),
      newBalances = expenseBalances(after);
    for (const [key, value] of Object.entries(cache)) {
      if (!key.startsWith("/api/expenses")) continue;
      if (value.balances)
        for (const id of new Set([
          ...Object.keys(oldBalances),
          ...Object.keys(newBalances),
        ]))
          value.balances[id] =
            (value.balances[id] || 0) +
            (newBalances[id] || 0) -
            (oldBalances[id] || 0);
      if (Array.isArray(value.summaries)) {
        const totals = new Map(
          value.summaries.map((r: any) => [
            `${r.month}|${r.category}|${r.paid_by}`,
            { ...r },
          ]),
        );
        for (const [items, direction] of [
          [before, -1],
          [after, 1],
        ] as const)
          for (const e of items) {
            if (e.kind !== "expense") continue;
            const row = {
              month: e.date.slice(0, 7),
              category: e.category || "Other",
              paid_by: e.paid_by,
              amount_cents: 0,
            };
            const id = `${row.month}|${row.category}|${row.paid_by}`;
            const existing: any = totals.get(id) || row;
            existing.amount_cents += direction * e.amount_cents;
            totals.set(id, existing);
          }
        value.summaries = [...totals.values()];
      }
    }
  }
}
