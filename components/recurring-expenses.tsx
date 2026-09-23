"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { homeRequest } from "@/lib/home-client";
import { TAB_ID } from "@/lib/realtime";
import { expenseMoney, type Expense } from "@/lib/expenses";
type Rule = {
  id: string;
  title: string;
  amount_cents: number;
  frequency: string;
  active: boolean;
};
type Draft = {
  id: string;
  title: string;
  amount_cents: number;
  period: string;
  possible_duplicate: boolean;
};
export default function RecurringExpenses({
  expenses,
  readOnly,
  onPost,
}: {
  expenses: Expense[];
  readOnly: boolean;
  onPost: () => Promise<unknown>;
}) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [source, setSource] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = await homeRequest("/api/expense-rules");
      setRules(result.rules || []);
      setDrafts(result.drafts || []);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function act(operation: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const result = await homeRequest("/api/expense-rules", "POST", {
        operation,
        payload,
        sender: TAB_ID,
      });
      setRules(result.rules || []);
      setDrafts(result.drafts || []);
      if (operation === "review" && payload.decision === "post") await onPost();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel settings-panel"
      aria-label="Repeating expense drafts"
      style={{ minWidth: 0, maxWidth: "100%", overflowX: "auto" }}
    >
      <h2>Repeating charges</h2>
      <p className="subtle">
        A draft appears each cycle. Review it before it enters the ledger.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!readOnly && (
        <form
          style={{ display: "grid", minWidth: 0 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (source) void act("create", { expense_id: source, frequency });
          }}
        >
          <label style={{ minWidth: 0 }}>
            Use an existing charge
            <select
              style={{ maxWidth: "100%" }}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              required
            >
              <option value="">Choose charge</option>
              {expenses
                .filter((expense) => expense.kind === "expense")
                .map((expense) => (
                  <option key={expense.id} value={expense.id}>
                    {expense.title} · {expenseMoney(expense.amount_cents)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Repeat
            <select
              value={frequency}
              onChange={(event) => setFrequency(event.target.value)}
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <Button className="button secondary" disabled={busy || !source}>
            Create rule
          </Button>
        </form>
      )}
      {drafts.map((draft) => (
        <div key={draft.id} className="member-row">
          <div>
            <strong>{draft.title}</strong>
            <small>
              {draft.period} · {expenseMoney(draft.amount_cents)}
              {draft.possible_duplicate ? " · Possible duplicate charge" : ""}
            </small>
          </div>
          {!readOnly && (
            <>
              <Button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void act("review", { id: draft.id, decision: "post" })
                }
              >
                Post charge
              </Button>
              <Button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void act("review", { id: draft.id, decision: "skip" })
                }
              >
                Skip
              </Button>
            </>
          )}
        </div>
      ))}
      {!drafts.length && (
        <p className="subtle">No drafts waiting for review.</p>
      )}
      {rules.map((rule) => (
        <div key={rule.id} className="member-row">
          <span>
            {rule.title} · {rule.frequency} ·{" "}
            {rule.active ? "Active" : "Stopped"}
          </span>
          {rule.active && !readOnly && (
            <Button
              className="text-button"
              disabled={busy}
              onClick={() => void act("stop", { id: rule.id })}
            >
              Stop
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
