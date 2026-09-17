"use client";
import { useHouseholdClock } from "@/lib/household-clock";
import { percentageShares } from "@/lib/improvements";
import { collectExpensePages } from "@/lib/expense-pages";
import { hasDatabase, homeRequest } from "@/lib/home-client";
import ReceiptAttachments from "./receipt-attachments";
import * as Collapsible from "@radix-ui/react-collapsible";
import { PresenceRow } from "./ui/presence";
import { AnimatedMoney } from "./ui/animated-money";
import { useHouseMotion } from "./ui/motion-provider";
import { PaperDialog } from "./ui/dialog";
import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Plus,
  ReceiptText,
  Wallet,
  X,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import { Button } from "./ui/button";
import { type Entry, type Member } from "@/lib/model";
import {
  expenseBalances,
  expenseMoney,
  isEvenSplit,
  shareCents,
  splitEvenly,
  suggestedRepayments,
  toCents,
  type Expense,
  type ExpenseValues,
} from "@/lib/expenses";
import { paymentNote, venmoPaymentUrl } from "@/lib/settle-up";
import type { ExpensesController } from "@/lib/use-expenses";
import { expenseCSV, expenseJSON } from "@/lib/expense-export";
import SearchField from "./search-field";
import { matchesSearch } from "@/lib/search";
import styles from "./expenses-tab.module.css";

type Draft = {
  kind: "expense" | "settlement";
  entry?: Expense;
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
  householdName,
}: {
  controller: ExpensesController;
  members: Member[];
  memberId: string | null;
  pending: Entry[];
  householdName: string;
}) {
  // A shared screen reads the ledger but is nobody in particular: no "you"
  // balance, and nothing here can be authored.
  const { today } = useHouseholdClock();
  const readOnly = !memberId;
  const { reduced, celebrate } = useHouseMotion();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copyResult, setCopyResult] = useState<{
    payment: string;
    ok: boolean;
  } | null>(null);
  const { expenses, loaded, error } = controller;
  const name = (id: string) =>
    members.find((member) => member.user_id === id)?.name || "Housemate";
  const expensesRef = useRef(expenses);
  expensesRef.current = expenses;
  useEffect(() => {
    let cancelled = false;
    const openTarget = () => {
      let target: any;
      try {
        target = JSON.parse(
          sessionStorage.getItem("household-search-target") || "null",
        );
      } catch {
        return;
      }
      if (target?.tab !== "Expenses") return;
      sessionStorage.removeItem("household-search-target");
      setQuery(target.title);
      if (readOnly) return;
      const known = expensesRef.current.find((e) => e.id === target.id);
      if (known) {
        setDraft({ kind: known.kind, entry: known });
        return;
      }
      if (hasDatabase)
        void homeRequest(`/api/expenses?id=${encodeURIComponent(target.id)}`)
          .then((data) => {
            if (!cancelled && data.expense)
              setDraft({ kind: data.expense.kind, entry: data.expense });
          })
          .catch(() => {});
    };
    openTarget();
    window.addEventListener("household-search-result", openTarget);
    return () => {
      cancelled = true;
      window.removeEventListener("household-search-result", openTarget);
    };
  }, [readOnly]);
  const balances = controller.balances;
  const mine = (memberId && balances[memberId]) || 0;
  const month = today.slice(0, 7);
  const monthTotal = controller.summary(month).total;
  const [exportError, setExportError] = useState("");
  const [summaryMonth, setSummaryMonth] = useState(month);
  useEffect(() => setSummaryMonth(month), [month]);
  const summary = controller.summary(summaryMonth);
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T12:00:00`));
  async function copyPaymentNote(
    payment: ReturnType<typeof suggestedRepayments>[number],
  ) {
    const key = `${payment.from}-${payment.to}`;
    try {
      await navigator.clipboard.writeText(
        paymentNote({
          payer: name(payment.from),
          recipient: name(payment.to),
          amountCents: payment.amount,
          household: householdName,
        }),
      );
      setCopyResult({ payment: key, ok: true });
    } catch {
      setCopyResult({ payment: key, ok: false });
    }
  }
  async function exportLedger(format: "csv" | "json") {
    setExportError("");
    let records = expenses;
    try {
      if (controller.nextCursor)
        records = await collectExpensePages((cursor) =>
          homeRequest(
            "/api/expenses" +
              (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""),
          ),
        );
    } catch {
      setExportError(
        "Could not load the complete ledger for export. Try again when connected.",
      );
      return;
    }
    const blob = new Blob(
      [
        format === "csv"
          ? expenseCSV(records, members)
          : expenseJSON(records, members, householdName),
      ],
      {
        type: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
      },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `common-ground-expenses.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
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
          hidden={readOnly}
          onClick={() => setDraft({ kind: "expense" })}
        >
          <Plus size={16} /> Add expense
        </Button>
      </div>
      {exportError && (
        <p className="error" role="alert">
          {exportError}
        </p>
      )}
      <div className="filters">
        <Button
          className="button secondary small"
          disabled={!loaded || !!error}
          onClick={() => exportLedger("csv")}
        >
          Export CSV
        </Button>
        <Button
          className="button secondary small"
          disabled={!loaded || !!error}
          onClick={() => exportLedger("json")}
        >
          Export JSON
        </Button>
      </div>
      {controller.undo && !readOnly && (
        <div className="toast" role="status">
          <span>Saved changes to “{controller.undo.before.title}”</span>
          <Button className="undo-button" onClick={controller.undoEdit}>
            Undo
          </Button>
        </div>
      )}
      <section className="panel monthly-summary">
        <h2>Monthly spending summary</h2>
        <label>
          Summary month
          <input
            type="month"
            required
            value={summaryMonth}
            onChange={(event) => setSummaryMonth(event.target.value)}
          />
        </label>
        <strong>{expenseMoney(summary.total)} in purchases</strong>
        <p className="subtle">
          Repayments are excluded. Totals include the full ledger.
        </p>
        <div className="form-grid">
          <div>
            {Object.entries(summary.categories)
              .filter(([, amount]) => amount > 0)
              .map(([category, amount]) => (
                <p key={category}>
                  {category}: <strong>{expenseMoney(amount)}</strong>
                </p>
              ))}
          </div>
          <div>
            {Object.entries(summary.members)
              .filter(([, amount]) => amount > 0)
              .map(([id, amount]) => (
                <p key={id}>
                  {name(id)} paid: <strong>{expenseMoney(amount)}</strong>
                </p>
              ))}
          </div>
        </div>
      </section>
      <SearchField label="Search expenses" value={query} onChange={setQuery} />
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
        <div className="panel expense-loading" aria-busy="true">
          {error ? (
            <p>{error}</p>
          ) : (
            <>
              <span className="skeleton skeleton-wide" />
              <span className="skeleton" />
              <span className="skeleton skeleton-short" />
            </>
          )}
        </div>
      ) : (
        <>
          {!!expenses.length && (
            <div
              className={`${styles.summary} ${readOnly ? styles.houseOnly : ""}`}
            >
              {/* Nobody in particular is reading a shared screen, so "you're
                  settled up" would be a claim about the house it can't make. */}
              {!readOnly && (
                <section className={`${styles.balance} panel`}>
                  <span>Your balance</span>
                  <strong>
                    <AnimatedMoney cents={Math.abs(mine)} />
                  </strong>
                  <p>
                    {mine > 0
                      ? "Owed to you"
                      : mine < 0
                        ? "You owe"
                        : "You’re settled up"}
                  </p>
                </section>
              )}
              <section className={`${styles.spending} panel`}>
                <span>Shared spending this month</span>
                <strong>
                  <AnimatedMoney cents={monthTotal} />
                </strong>
                <p>Purchases only, repayments excluded</p>
              </section>
            </div>
          )}
          <section className={`${styles.settlements} panel`}>
            <div className={styles.sectionHeading}>
              <h2>Who owes whom</h2>
              <Button
                className="text-button"
                hidden={readOnly}
                onClick={() => setDraft({ kind: "settlement" })}
              >
                Record repayment <Plus size={14} />
              </Button>
            </div>
            <p className={styles.settlementHelp}>
              Pay outside Common Ground with Venmo, or copy the note for Zelle
              or another payment app. Record paid only after money moves—it
              updates the ledger and does not transfer money.
            </p>
            <AnimatePresence initial={false}>
              {suggestedRepayments(balances).map((payment) => {
                const payer = name(payment.from);
                const recipient = name(payment.to);
                const key = `${payment.from}-${payment.to}`;
                const handoff = {
                  payer,
                  recipient,
                  amountCents: payment.amount,
                  household: householdName,
                };
                return (
                  <PresenceRow className={styles.payment} key={key}>
                    <span className={styles.paymentRoute}>
                      <b>{payer}</b>
                      <ArrowRight size={14} />
                      <b>{recipient}</b>
                    </span>
                    <strong>{expenseMoney(payment.amount)}</strong>
                    <div className={styles.paymentActions}>
                      <a
                        className="button secondary small"
                        href={venmoPaymentUrl(handoff)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open Venmo for ${payer} to pay ${recipient} ${expenseMoney(payment.amount)}`}
                      >
                        Venmo <ExternalLink size={13} aria-hidden="true" />
                      </a>
                      <Button
                        className="button secondary small"
                        aria-label={`Copy payment note for ${payer} to pay ${recipient}`}
                        onClick={() => void copyPaymentNote(payment)}
                      >
                        {copyResult?.payment === key && copyResult.ok ? (
                          <Check size={13} aria-hidden="true" />
                        ) : (
                          <Copy size={13} aria-hidden="true" />
                        )}
                        {copyResult?.payment === key
                          ? copyResult.ok
                            ? "Copied"
                            : "Copy failed"
                          : "Copy note"}
                      </Button>
                      <Button
                        className="button secondary small"
                        hidden={readOnly}
                        onClick={() =>
                          setDraft({ kind: "settlement", ...payment })
                        }
                      >
                        Record paid
                      </Button>
                    </div>
                  </PresenceRow>
                );
              })}
            </AnimatePresence>
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
          <section className={`${styles.activity} panel paper-ledger`}>
            <div className={styles.sectionHeading}>
              <h2>Activity</h2>
              <span>
                {expenses.length} {expenses.length === 1 ? "record" : "records"}
              </span>
            </div>
            <AnimatePresence initial={false}>
              {[
                ...new Set(
                  expenses
                    .filter((item) =>
                      matchesSearch(
                        query,
                        item.title,
                        item.kind,
                        item.category,
                        item.date,
                        name(item.paid_by),
                        item.recipient ? name(item.recipient) : "",
                      ),
                    )
                    .map((item) => item.date.slice(0, 7)),
                ),
              ]
                .sort()
                .reverse()
                .map((period) => (
                  <PresenceRow key={period}>
                    <Collapsible.Root
                      open={query ? true : undefined}
                      defaultOpen={period === month}
                      className="expense-month"
                    >
                      <Collapsible.Trigger className="expense-month-heading">
                        {new Date(`${period}-02T12:00:00`).toLocaleDateString(
                          "en-US",
                          { month: "long", year: "numeric" },
                        )}
                        <ChevronDown size={15} aria-hidden="true" />
                      </Collapsible.Trigger>
                      <Collapsible.Content className="expense-month-content">
                        <AnimatePresence initial={false}>
                          {[...expenses]
                            .filter(
                              (item) =>
                                item.date.startsWith(period) &&
                                matchesSearch(
                                  query,
                                  item.title,
                                  item.kind,
                                  item.category,
                                  item.date,
                                  name(item.paid_by),
                                  item.recipient ? name(item.recipient) : "",
                                ),
                            )
                            .sort(
                              (a, b) =>
                                b.date.localeCompare(a.date) ||
                                b.created_at.localeCompare(a.created_at),
                            )
                            .map((item) => (
                              <Button
                                key={item.id}
                                layout={reduced ? false : "position"}
                                layoutId={
                                  reduced ? undefined : `expense-${item.id}`
                                }
                                initial={reduced ? false : { opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{
                                  opacity: 0,
                                  height: 0,
                                  paddingTop: 0,
                                  paddingBottom: 0,
                                }}
                                transition={{ duration: reduced ? 0 : 0.18 }}
                                className={styles.row}
                                disabled={readOnly}
                                onClick={() =>
                                  setDraft({ kind: item.kind, entry: item })
                                }
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
                                    {item.category || "Other"} ·{" "}
                                    {formatDate(item.date)},{" "}
                                    {item.kind === "expense"
                                      ? `${name(item.paid_by)} paid, split ${Object.keys(item.shares).length} ${Object.keys(item.shares).length === 1 ? "way" : "ways"}`
                                      : "repayment"}
                                  </small>
                                </span>
                                <strong className={styles.amount}>
                                  {expenseMoney(item.amount_cents)}
                                </strong>
                                <ArrowUpRight size={15} aria-hidden="true" />
                              </Button>
                            ))}
                        </AnimatePresence>
                      </Collapsible.Content>
                    </Collapsible.Root>
                  </PresenceRow>
                ))}
            </AnimatePresence>
            {controller.nextCursor && (
              <Button
                className="button secondary"
                disabled={controller.loadingMore}
                onClick={() => void controller.loadMore()}
              >
                {controller.loadingMore
                  ? "Loading older expenses…"
                  : "Load older expenses"}
              </Button>
            )}
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
                  hidden={readOnly}
                  onClick={() => setDraft({ kind: "expense" })}
                >
                  Add your first expense
                </Button>
              </div>
            )}
          </section>
        </>
      )}
      <AnimatePresence>
        {draft && memberId && (
          <ExpenseDialog
            draft={draft}
            members={members}
            memberId={memberId}
            onReceiptsChanged={() => void controller.refresh()}
            onClose={() => setDraft(null)}
            onSave={(values) => {
              controller.save(values, draft.entry?.id);
              if (values.kind === "settlement" && !draft.entry)
                celebrate({
                  kind: "settlement",
                  from: name(values.paid_by),
                  to: name(values.recipient!),
                });
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
      </AnimatePresence>
    </div>
  );
}
function ExpenseDialog({
  draft,
  members,
  memberId,
  onReceiptsChanged,
  onClose,
  onSave,
  onDelete,
}: {
  onReceiptsChanged: () => void;
  draft: Draft;
  members: Member[];
  memberId: string;
  onClose: () => void;
  onSave: (values: ExpenseValues) => void;
  onDelete?: () => void;
}) {
  const { today } = useHouseholdClock();
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
  // Who received a repayment follows who sent it: picking the recipient as
  // the sender would otherwise leave the row pointing at one person.
  const [recipient, setRecipient] = useState(
    draft.entry?.recipient ||
      draft.to ||
      members.find((member) => member.user_id !== payer)?.user_id ||
      "",
  );
  const [people, setPeople] = useState(
    draft.entry
      ? Object.keys(draft.entry.shares)
      : members
          .filter((member) => member.active !== false)
          .map((member) => member.user_id),
  );
  // An expense saved with hand-set shares reopens that way, so editing the
  // title doesn't quietly even the split back out.
  const [uneven, setUneven] = useState(
    !!draft.entry &&
      draft.entry.kind === "expense" &&
      !isEvenSplit(draft.entry.shares, draft.entry.amount_cents),
  );
  const [custom, setCustom] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(draft.entry?.shares ?? {}).map(([id, share]) => [
        id,
        (share / 100).toFixed(2),
      ]),
    ),
  );
  const [error, setError] = useState("");
  const [percentageMode, setPercentageMode] = useState(
    !!draft.entry?.percentages,
  );
  const [percentages, setPercentages] = useState<Record<string, string>>(
    draft.entry?.percentages ?? {},
  );
  const percentageSplit = percentageShares(
    toCents(amount) || 0,
    Object.fromEntries(people.map((id) => [id, percentages[id] ?? ""])),
  );
  const settlement = draft.kind === "settlement";
  const cents = toCents(amount);
  const split = splitEvenly(cents || 0, people);
  // A field left blank reads as its placeholder, 0, so the hint and the
  // save rule agree; only text that isn't money is refused.
  const customShares = Object.fromEntries(
    people.map((id) => {
      const raw = (custom[id] ?? "").trim();
      return [id, raw === "" ? 0 : shareCents(raw)];
    }),
  );
  const assigned = Object.values(customShares).reduce<number>(
    (sum, share) => sum + (share ?? 0),
    0,
  );
  const shares = percentageMode
    ? (percentageSplit ?? {})
    : uneven
      ? (customShares as Record<string, number>)
      : split;
  return (
    <PaperDialog
      onClose={onClose}
      className={`entry-dialog ${styles.dialog}`}
      aria-labelledby="expense-title"
      sharedId={draft.entry ? `expense-${draft.entry.id}` : undefined}
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
          if (!settlement && percentageMode && !percentageSplit) {
            setError(
              "Percentages must add up to 100, with up to two decimal places.",
            );
            return;
          }
          if (!settlement && uneven && !percentageMode) {
            if (Object.values(customShares).some((share) => share === null)) {
              setError("Check the shares: amounts like 12.50, or blank for 0.");
              return;
            }
            if (assigned !== cents) {
              setError(
                `Shares add up to ${expenseMoney(assigned)}, not ${expenseMoney(cents)}.`,
              );
              return;
            }
          }
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
            shares: settlement ? {} : shares,
            recipient: settlement ? recipient : null,
            category: settlement
              ? "Other"
              : String(data.get("category") || "Other"),
            percentages:
              !settlement && percentageMode
                ? Object.fromEntries(people.map((id) => [id, percentages[id]]))
                : null,
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
              defaultValue={draft.entry?.title}
              placeholder="Groceries, electricity, dinner…"
              autoFocus
            />
          </label>
        )}
        {!settlement && (
          <label>
            Spending category
            <select
              name="category"
              defaultValue={draft.entry?.category || "Other"}
            >
              {[
                "Groceries",
                "Utilities",
                "Rent",
                "Household",
                "Dining",
                "Transport",
                "Other",
              ].map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
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
              defaultValue={draft.entry?.date || today}
            />
          </label>
        </div>
        <label>
          {settlement ? "Who sent it?" : "Who paid?"}
          <select
            name="paid_by"
            value={payer}
            onChange={(event) => {
              const sender = event.target.value;
              if (sender === recipient)
                setRecipient(
                  members.find((member) => member.user_id !== sender)
                    ?.user_id || "",
                );
              setPayer(sender);
            }}
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
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
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
            <legend>{uneven ? "Split between" : "Split evenly between"}</legend>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={percentageMode}
                onChange={(event) => {
                  setPercentageMode(event.target.checked);
                  if (
                    event.target.checked &&
                    !Object.keys(percentages).length
                  ) {
                    const basis = splitEvenly(10000, people);
                    setPercentages(
                      Object.fromEntries(
                        people.map((id) => [
                          id,
                          ((basis[id] || 0) / 100).toFixed(2),
                        ]),
                      ),
                    );
                  }
                }}
              />
              Split by percentage
            </label>
            {members.map((member) => (
              <div key={member.user_id} className={styles.person}>
                <label>
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
                </label>
                {percentageMode && people.includes(member.user_id) ? (
                  <div>
                    <input
                      className={styles.share}
                      inputMode="decimal"
                      aria-label={`${member.name}’s percentage (%)`}
                      value={percentages[member.user_id] ?? ""}
                      onChange={(event) =>
                        setPercentages((current) => ({
                          ...current,
                          [member.user_id]: event.target.value,
                        }))
                      }
                    />
                    <small>{expenseMoney(shares[member.user_id] || 0)}</small>
                  </div>
                ) : uneven && people.includes(member.user_id) ? (
                  <input
                    className={styles.share}
                    inputMode="decimal"
                    aria-label={`${member.name}’s share ($)`}
                    placeholder="0.00"
                    value={custom[member.user_id] ?? ""}
                    onChange={(event) =>
                      setCustom((current) => ({
                        ...current,
                        [member.user_id]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <b>{expenseMoney(shares[member.user_id] || 0)}</b>
                )}
              </div>
            ))}
            <div className={styles.splitFooter}>
              <p className={styles.hint}>
                {percentageMode
                  ? percentageSplit
                    ? "Percentages add up to 100%."
                    : "Percentages must add up to 100%."
                  : uneven
                    ? cents && assigned !== cents
                      ? assigned < cents
                        ? `${expenseMoney(cents - assigned)} left to assign.`
                        : `${expenseMoney(assigned - cents)} over the total.`
                      : cents
                        ? "These add up."
                        : "Shares must add up to the total."
                    : "An extra cent is assigned automatically when needed."}
              </p>
              <Button
                type="button"
                className="text-button muted"
                onClick={() => {
                  // Start from the even split so there is something to nudge.
                  if (!uneven)
                    setCustom(
                      Object.fromEntries(
                        people.map((id) => [
                          id,
                          ((split[id] || 0) / 100).toFixed(2),
                        ]),
                      ),
                    );
                  setPercentageMode(false);
                  setUneven((current) => !current);
                }}
              >
                {uneven ? "Split evenly" : "Adjust shares"}
              </Button>
            </div>
          </fieldset>
        )}
        {!settlement && (
          <ReceiptAttachments
            expense={draft.entry}
            onChanged={onReceiptsChanged}
          />
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
    </PaperDialog>
  );
}
