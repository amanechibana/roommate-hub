"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { homeRequest } from "./home-client";
import type { Expense, ExpenseValues } from "./expenses";

export function useExpenses(
  householdId: string | undefined,
  memberId: string | null,
  demo: boolean,
  active: boolean,
) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
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
    operation: "create" | "update" | "delete",
    payload: Record<string, unknown>,
  ) {
    revision.current++;
    if (demo) return;
    pending.current++;
    const current = generation.current;
    writes.current = writes.current.then(async () => {
      try {
        await homeRequest("/api/expenses", "POST", { operation, payload });
      } catch {
        if (generation.current === current) {
          recovery.current = true;
          setError(
            "Couldn’t save that expense. Refreshing the shared records.",
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
  function save(values: ExpenseValues, id?: string) {
    if (!memberId || !householdId) return;
    const eid = id || crypto.randomUUID();
    setError("");
    if (id)
      setExpenses((current) =>
        current.map((item) => (item.id === id ? { ...item, ...values } : item)),
      );
    else
      setExpenses((current) => [
        {
          ...values,
          id: eid,
          household_id: householdId,
          created_by: memberId,
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
    persist(id ? "update" : "create", { ...values, id: eid });
  }
  function remove(id: string) {
    setExpenses((current) => current.filter((item) => item.id !== id));
    persist("delete", { id });
  }
  return {
    expenses,
    loaded,
    error,
    refresh,
    save,
    remove,
    flush: () => writes.current,
    dismissError: () => setError(""),
  };
}
export type ExpensesController = ReturnType<typeof useExpenses>;
