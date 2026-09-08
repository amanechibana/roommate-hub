"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  ReceiptText,
  Wallet,
  X,
  ArrowRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { dateKey, type Entry, type Member } from "@/lib/model";
import {
  expenseBalances,
  expenseMoney,
  splitEvenly,
  suggestedRepayments,
  toCents,
  type Expense,
  type ExpenseValues,
} from "@/lib/expenses";
import type { ExpensesController } from "@/lib/use-expenses";
import styles from "./expenses-tab.module.css";

type Draft = {
  kind: "expense" | "settlement";
  entry?: Expense;
  title?: string;
  from?: string;
  to?: string;
  amount?: number;
};
// Entry amounts are whole dollars typed by hand; expenses store integer cents.
export const estimateCents = (entry: Entry) =>
  Math.round((entry.amount || 0) * 100);
export default function ExpensesTab({
  controller,
  members,
  memberId,
  pending,
}: {
  controller: ExpensesController;
  members: Member[];
  memberId: string;
  pending: Entry[];
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const { expenses, loaded, error } = controller;
  const name = (id: string) =>
    members.find((member) => member.user_id === id)?.name || "Housemate";
  const balances = expenseBalances(expenses);
  const mine = balances[memberId] || 0;
  const month = dateKey(new Date()).slice(0, 7);
  const monthTotal = expenses
    .filter((item) => item.kind === "expense" && item.date.startsWith(month))
    .reduce((sum, item) => sum + item.amount_cents, 0);
  return (
    <div className={styles.expenses}>
      <div className="page-heading">
        <div className="heading-copy">
          <span className="page-symbol" aria-hidden="true">
            <Wallet size={23} />
          </span>
          <div>
            <h1>Expenses</h1>
            <p className="subtitle">Shared purchases and repayments.</p>
          </div>
        </div>
        <Button
          className="button"
          disabled={!loaded}
          onClick={() => setDraft({ kind: "expense" })}
        >
          <Plus size={16} /> Add expense
        </Button>
      </div>
      {error && (
        <div className={styles.error} role="alert">
          {error}
          <Button
            className="text-button"
            onClick={() => void controller.refresh()}
          >
            Retry
          </Button>
          <Button
            className="icon-button"
            aria-label="Dismiss expense error"
            onClick={controller.dismissError}
          >
            <X size={15} />
          </Button>
        </div>
      )}
      {!loaded ? (
        <div className="panel empty">
          {error ? "Expenses aren’t available yet." : "Loading expenses…"}
        </div>
      ) : (
        <>
          <div className={styles.summary}>
            <section className={`${styles.balance} panel`}>
              <span>Your balance</span>
              <strong>{expenseMoney(Math.abs(mine))}</strong>
              <p>
                {mine > 0
                  ? "Owed to you"
                  : mine < 0
                    ? "You owe"
                    : "You’re settled up"}
              </p>
            </section>
            <section className={`${styles.spending} panel`}>
              <span>Shared spending this month</span>
              <strong>{expenseMoney(monthTotal)}</strong>
              <p>Purchases only · Repayments excluded</p>
            </section>
          </div>
          <section className={`${styles.settlements} panel`}>
            <div className={styles.sectionHeading}>
              <h2>Who owes whom</h2>
              <Button
                className="text-button"
                onClick={() => setDraft({ kind: "settlement" })}
              >
                Record repayment <Plus size={14} />
              </Button>
            </div>
            {suggestedRepayments(balances).map((payment) => (
              <div
                className={styles.payment}
                key={`${payment.from}-${payment.to}`}
              >
                <span>
                  <b>{name(payment.from)}</b>
                  <ArrowRight size={14} />
                  <b>{name(payment.to)}</b>
                </span>
                <strong>{expenseMoney(payment.amount)}</strong>
                <Button
                  className="button secondary small"
                  onClick={() => setDraft({ kind: "settlement", ...payment })}
                >
                  Record paid
                </Button>
              </div>
            ))}
            {!suggestedRepayments(balances).length && (
              <p className={styles.settled}>No outstanding balances.</p>
            )}
          </section>
          {!!pending.length && (
            <section className="panel">
              <div className={styles.sectionHeading}>
                <h2>Pending from the shopping list</h2>
                <span>
                  {expenseMoney(
                    pending.reduce(
                      (sum, entry) => sum + estimateCents(entry),
                      0,
                    ),
                  )}{" "}
                  estimated
                </span>
              </div>
              {pending.map((entry) => (
                <div className={styles.pendingRow} key={entry.id}>
                  <span>{entry.title}</span>
                  <strong>{expenseMoney(estimateCents(entry))}</strong>
                </div>
              ))}
              <p className={styles.pendingNote}>
                Estimates from the shopping list. Each becomes a real expense
                when it’s marked bought.
              </p>
            </section>
          )}
          <section className={`${styles.activity} panel`}>
            <div className={styles.sectionHeading}>
              <h2>Activity</h2>
              <span>
                {expenses.length} {expenses.length === 1 ? "record" : "records"}
              </span>
            </div>
            {[...expenses]
              .sort(
                (a, b) =>
                  b.date.localeCompare(a.date) ||
                  b.created_at.localeCompare(a.created_at),
              )
              .map((item) => (
                <Button
                  key={item.id}
                  className={styles.row}
                  onClick={() => setDraft({ kind: item.kind, entry: item })}
                >
                  <span
                    className={`${styles.rowIcon} ${item.kind === "settlement" ? styles.repaymentIcon : ""}`}
                    aria-hidden="true"
                  >
                    {item.kind === "expense" ? (
                      <ReceiptText size={19} />
                    ) : (
                      <ArrowDownLeft size={19} />
                    )}
                  </span>
                  <span className={styles.copy}>
                    <strong>
                      {item.kind === "settlement"
                        ? `${name(item.paid_by)} paid ${name(item.recipient!)}`
                        : item.title}
                    </strong>
                    <small>
                      {item.date} ·{" "}
                      {item.kind === "expense"
                        ? `${name(item.paid_by)} paid · Split ${Object.keys(item.shares).length} ${Object.keys(item.shares).length === 1 ? "way" : "ways"}`
                        : "Repayment"}
                    </small>
                  </span>
                  <strong className={styles.amount}>
                    {expenseMoney(item.amount_cents)}
                  </strong>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Button>
              ))}
            {!expenses.length && (
              <div className={styles.empty}>
                <ReceiptText size={28} />
                <h3>Start with a shared purchase</h3>
                <p>
                  Add groceries, utilities, or anything one of you paid for.
                  <br />
                  Your shares and balances update together.
                </p>
                <Button
                  className="button secondary"
                  onClick={() => setDraft({ kind: "expense" })}
                >
                  Add your first expense
                </Button>
              </div>
            )}
          </section>
        </>
      )}
      {draft && (
        <ExpenseDialog
          draft={draft}
          members={members}
          memberId={memberId}
          onClose={() => setDraft(null)}
          onSave={(values) => {
            controller.save(values, draft.entry?.id);
            setDraft(null);
          }}
          onDelete={
            draft.entry
              ? () => {
                  controller.remove(draft.entry!.id);
                  setDraft(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
export function ExpenseDialog({
  draft,
  members,
  memberId,
  onClose,
  onSave,
  onDelete,
}: {
  draft: Draft;
  members: Member[];
  memberId: string;
  onClose: () => void;
  onSave: (values: ExpenseValues) => void;
  onDelete?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState(
    draft.entry
      ? (draft.entry.amount_cents / 100).toFixed(2)
      : draft.amount
        ? (draft.amount / 100).toFixed(2)
        : "",
  );
  const [payer, setPayer] = useState(
    draft.entry?.paid_by || draft.from || memberId,
  );
  const [people, setPeople] = useState(
    draft.entry
      ? Object.keys(draft.entry.shares)
      : members.map((member) => member.user_id),
  );
  const [error, setError] = useState("");
  const settlement = draft.kind === "settlement";
  const cents = toCents(amount);
  const split = splitEvenly(cents || 0, people);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`entry-dialog ${styles.dialog}`}
      aria-labelledby="expense-title"
      onCancel={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          if (!cents) {
            setError(
              "Enter an amount from $0.01 to $1,000,000 with up to two decimal places.",
            );
            return;
          }
          if (!settlement && !people.length) {
            setError("Choose at least one person for the split.");
            return;
          }
          const recipient = settlement ? String(data.get("recipient")) : null;
          if (settlement && (!recipient || recipient === payer)) {
            setError("Choose two different people for a repayment.");
            return;
          }
          onSave({
            kind: draft.kind,
            title: settlement ? "Repayment" : String(data.get("title")).trim(),
            date: String(data.get("date")),
            amount_cents: cents,
            paid_by: payer,
            shares: settlement ? {} : split,
            recipient,
          });
        }}
      >
        <div className="dialog-heading">
          <h2 id="expense-title">
            {draft.entry ? "Edit" : "Add"}{" "}
            {settlement ? "repayment" : "expense"}
          </h2>
          <Button
            type="button"
            className="icon-button"
            aria-label="Close expense"
            onClick={onClose}
          >
            <X size={20} />
          </Button>
        </div>
        {!settlement && (
          <label>
            What was it for?
            <input
              name="title"
              required
              maxLength={160}
              defaultValue={draft.entry?.title ?? draft.title}
              placeholder="Groceries, electricity, dinner…"
              autoFocus
            />
          </label>
        )}
        <div className="form-grid">
          <label>
            Amount ($)
            <input
              name="amount"
              inputMode="decimal"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              autoFocus={settlement}
            />
          </label>
          <label>
            Date
            <input
              name="date"
              type="date"
              required
              defaultValue={draft.entry?.date || dateKey(new Date())}
            />
          </label>
        </div>
        <label>
          {settlement ? "Who sent it?" : "Who paid?"}
          <select
            name="paid_by"
            value={payer}
            onChange={(event) => setPayer(event.target.value)}
          >
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        {settlement ? (
          <>
            <label>
              Who received it?
              <select
                name="recipient"
                required
                defaultValue={
                  draft.entry?.recipient ||
                  draft.to ||
                  members.find((member) => member.user_id !== payer)?.user_id
                }
              >
                {members.map((member) => (
                  <option
                    key={member.user_id}
                    value={member.user_id}
                    disabled={member.user_id === payer}
                  >
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.hint}>
              Record a repayment you’ve already made. This does not send money.
            </p>
          </>
        ) : (
          <fieldset className={styles.split}>
            <legend>Split evenly between</legend>
            {members.map((member) => (
              <label key={member.user_id}>
                <input
                  type="checkbox"
                  checked={people.includes(member.user_id)}
                  onChange={(event) =>
                    setPeople((current) =>
                      event.target.checked
                        ? [...current, member.user_id]
                        : current.filter((id) => id !== member.user_id),
                    )
                  }
                />
                <span>{member.name}</span>
                <b>{expenseMoney(split[member.user_id] || 0)}</b>
              </label>
            ))}
            <p className={styles.hint}>
              An extra cent is assigned automatically when needed.
            </p>
          </fieldset>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          {onDelete && (
            <Button
              type="button"
              className="text-button danger"
              onClick={onDelete}
            >
              Delete {settlement ? "repayment" : "expense"}
            </Button>
          )}
          <Button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button className="button">
            Save {settlement ? "repayment" : "expense"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
