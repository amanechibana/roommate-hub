"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { homeRequest } from "./home-client";
import { TAB_ID } from "./realtime";
import type { Expense, ExpenseValues } from "./expenses";

export function useExpenses(
  householdId: string | undefined,
  memberId: string | null,
  demo: boolean,
  active: boolean,
  sync?: {
    drain: () => Promise<void>;
    resolveId: (id: string) => string;
    afterDelete?: (id: string) => void;
  },
) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [undo, setUndo] = useState<{
    token: string;
    before: Expense;
    expires: number;
  } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(
      () => setUndo(null),
      Math.max(0, undo.expires - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [undo]);
  useEffect(() => setUndo(null), [memberId]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(0);
  const writes = useRef(Promise.resolve());
  const generation = useRef(0);
  const revision = useRef(0);
  const readSequence = useRef(0);
  const recovery = useRef(false);
  const interested = useRef(false);
  const refresh = useCallback(async () => {
    if (!householdId || pending.current) return;
    if (demo) {
      setLoaded(true);
      return;
    }
    const current = generation.current;
    const version = revision.current;
    const read = ++readSequence.current;
    try {
      const data = await homeRequest("/api/expenses");
      if (
        current !== generation.current ||
        version !== revision.current ||
        read !== readSequence.current ||
        pending.current
      )
        return;
      setExpenses(data.expenses);
      setLoaded(true);
      setError((current) =>
        current.startsWith("Could not load") ? "" : current,
      );
    } catch {
      if (current === generation.current)
        setError("Could not load expenses. Try again.");
    }
  }, [householdId, demo]);
  useEffect(() => {
    generation.current++;
    revision.current++;
    interested.current = false;
    setUndo(null);
    setExpenses([]);
    setLoaded(false);
    setError("");
  }, [householdId, demo]);
  useEffect(() => {
    if (active && !interested.current) {
      interested.current = true;
      void refresh();
    }
  }, [active, refresh]);
  useEffect(() => {
    const poll = () => {
      if (interested.current && document.visibilityState === "visible")
        void refresh();
    };
    const timer = window.setInterval(poll, 15000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [refresh]);
  function persist(
    operation: "create" | "update" | "delete" | "undo_edit",
    payload: Record<string, unknown>,
    after?: () => void,
  ) {
    revision.current++;
    if (demo) {
      after?.();
      return;
    }
    pending.current++;
    const current = generation.current;
    writes.current = writes.current.then(async () => {
      try {
        let resolved = payload;
        // Wait out the home queue and mirror its optimistic-id remaps so a
        // purchase logged before its entry finishes saving still shares the
        // entry's final id.
        if (sync && typeof payload.id === "string") {
          await sync.drain();
          const id = sync.resolveId(payload.id);
          if (id !== payload.id) {
            const previous = payload.id;
            resolved = { ...payload, id };
            setExpenses((current) =>
              current.map((item) =>
                item.id === previous ? { ...item, id } : item,
              ),
            );
          }
        }
        const result = await homeRequest("/api/expenses", "POST", {
          operation,
          payload: resolved,
          sender: TAB_ID,
        });
        if (generation.current === current) {
          if (operation === "delete" && typeof resolved.id === "string")
            sync?.afterDelete?.(resolved.id);
          if (operation === "undo_edit") {
            recovery.current = true;
            setExpenses((items) =>
              items.map(
                (item) =>
                  (result.restored as Expense[] | undefined)?.find(
                    (old) => old.id === item.id,
                  ) || item,
              ),
            );
          }
          after?.();
        }
      } catch (err) {
        if (generation.current === current) {
          recovery.current = true;
          setError(
            (err as Error & { rejected?: boolean }).rejected
              ? (err as Error).message
              : "Couldn’t save that expense. Refreshing the shared records.",
          );
        }
      } finally {
        pending.current--;
        if (
          !pending.current &&
          recovery.current &&
          current === generation.current
        ) {
          recovery.current = false;
          void refresh();
        }
      }
    });
  }
  // Purchases pass the entry's id so double-logging is caught here and by the
  // server's idempotent create.
  function create(values: ExpenseValues, id: string) {
    if (!memberId || !householdId) return;
    setError("");
    setExpenses((current) => [
      {
        ...values,
        id,
        household_id: householdId,
        created_by: memberId,
        created_at: new Date().toISOString(),
      },
      ...current,
    ]);
    persist("create", { ...values, id });
  }
  function save(values: ExpenseValues, id?: string) {
    if (!memberId || !householdId) return;
    if (!id) return create(values, crypto.randomUUID());
    setError("");
    setExpenses((current) =>
      current.map((item) => (item.id === id ? { ...item, ...values } : item)),
    );
    const before = expenses.find((item) => item.id === id);
    const token = crypto.randomUUID();
    persist("update", { ...values, id, undo_token: token }, () => {
      if (before) setUndo({ token, before, expires: Date.now() + 10000 });
    });
  }
  // Optimistic insert without an expense write; the caller persists the row
  // through another channel, so only bump the revision to keep in-flight
  // reads from clobbering it.
  function inject(expense: Expense) {
    revision.current++;
    setExpenses((current) => [
      expense,
      ...current.filter((e) => e.id !== expense.id),
    ]);
  }
  function remove(id: string) {
    setExpenses((current) => current.filter((item) => item.id !== id));
    persist("delete", { id });
    if (demo) sync?.afterDelete?.(id);
  }
  // An expense persisted through another queue (a cover payment on the home
  // queue) holds that promise here so polls and pings defer exactly like they
  // do during a native expense write.
  function hold(promise: Promise<unknown>) {
    pending.current++;
    const current = generation.current;
    const release = () => {
      pending.current--;
      if (
        !pending.current &&
        recovery.current &&
        current === generation.current
      ) {
        recovery.current = false;
        void refresh();
      }
    };
    void promise.then(release, release);
  }
  // Realtime change ping from another device. During a local write the ping
  // is deferred to after the queue drains, like failure recovery.
  function ping() {
    if (!interested.current || document.visibilityState !== "visible") return;
    if (pending.current) recovery.current = true;
    else void refresh();
  }
  function undoEdit() {
    if (!undo || undo.expires <= Date.now()) return;
    const { token, before } = undo;
    setUndo(null);
    if (demo)
      setExpenses((items) =>
        items.map((item) => (item.id === before.id ? before : item)),
      );
    else persist("undo_edit", { undo_token: token });
  }
  return {
    undo,
    undoEdit,
    expenses,
    loaded,
    error,
    refresh,
    ping,
    save,
    create,
    inject,
    hold,
    remove,
    flush: () => writes.current,
    // Failure hook for a held write: the refresh runs when the hold drains,
    // mirroring a native write failure.
    recover: () => {
      recovery.current = true;
    },
    dismissError: () => setError(""),
  };
}
export type ExpensesController = ReturnType<typeof useExpenses>;
