"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import {
  Vote,
  Package,
  Wrench,
  Utensils,
  Wallet,
  Plus,
  X,
  Pencil,
  Trash2,
  ShoppingBasket,
} from "lucide-react";
import { Button } from "./ui/button";
import { PaperDialog } from "./ui/dialog";
import { SegmentedControl } from "./ui/segmented-control";
import { expenseMoney, shareCents, type Expense } from "@/lib/expenses";
import {
  budgetSpending,
  pollOpen,
  pollTally,
  type PantryItem,
  type MaintenanceRequest,
  type Meal,
  type Ingredient,
  type LifeOperation,
} from "@/lib/household-life";
import type { HouseholdLifeController } from "@/lib/use-household-life";
import type { Entry, Member } from "@/lib/model";
import styles from "./household-life-tab.module.css";
const sections = [
  "Quick polls",
  "Pantry & supplies",
  "Maintenance",
  "Meal planning",
  "Budget",
] as const;
type Section = (typeof sections)[number];
type Editor = {
  kind: "poll" | "pantry" | "maintenance" | "meal";
  deleting?: boolean;
  item?: PantryItem | MaintenanceRequest | Meal;
};
const icons = {
  "Quick polls": Vote,
  "Pantry & supplies": Package,
  Maintenance: Wrench,
  "Meal planning": Utensils,
  Budget: Wallet,
};
export default function HouseholdLifeTab({
  life,
  members,
  uid,
  readOnly,
  entries,
  expenses,
  expensesLoaded,
  expensesError,
  moreExpenses,
  today,
  openShopping,
}: {
  life: HouseholdLifeController;
  members: Member[];
  uid: string | null;
  readOnly: boolean;
  entries: Entry[];
  expenses: Expense[];
  expensesLoaded: boolean;
  expensesError: string;
  moreExpenses?: {
    available: boolean;
    loading: boolean;
    load: () => Promise<void>;
  };
  today: string;
  openShopping: () => void;
}) {
  const [section, setSection] = useState<Section>("Quick polls");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [now, setNow] = useState(Date.now());
  const currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  useEffect(() => setMonth(currentMonth), [currentMonth]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => setEditor(null), [uid]);
  const { data, busy, error, notice } = life;
  const writable = !readOnly && !!uid;
  const people = members.filter(
    (m) => m.name !== "Housemates" && m.active !== false,
  );
  const person = (id: string | null) =>
    members.find((m) => m.user_id === id)?.name || "Unassigned";
  const shopping = entries.filter(
    (e) => e.kind === "request" && !e.done && e.category !== "Personal",
  );
  const onShopping = (title: string) =>
    shopping.some(
      (e) => e.title.trim().toLowerCase() === title.trim().toLowerCase(),
    );
  const Icon = icons[section];
  const perform = (
    operation: LifeOperation,
    payload: Record<string, unknown>,
  ) => {
    void life.mutate(operation, payload);
  };
  const editButtons = (
    kind: "pantry" | "maintenance" | "meal",
    item: PantryItem | MaintenanceRequest | Meal,
  ) =>
    writable && (
      <div className={styles.actions}>
        <Button
          disabled={busy}
          aria-label={`Edit ${item.title}`}
          onClick={() => setEditor({ kind, item })}
        >
          <Pencil size={15} />
        </Button>
        <Button
          disabled={busy}
          aria-label={`Delete ${item.title}`}
          onClick={() => setEditor({ kind, item, deleting: true })}
        >
          <Trash2 size={15} />
        </Button>
      </div>
    );
  const heading = (description: string, kind?: Editor["kind"]) => (
    <header className={styles.heading}>
      <div>
        <h2>
          <Icon size={20} />
          {section}
        </h2>
        <p>{description}</p>
      </div>
      {writable && kind && (
        <Button
          className="button"
          disabled={busy || !life.loaded}
          onClick={() => setEditor({ kind })}
        >
          <Plus size={15} />{" "}
          {kind === "poll"
            ? "New poll"
            : kind === "pantry"
              ? "Track a staple"
              : kind === "maintenance"
                ? "Report a repair"
                : "Plan dinner"}
        </Button>
      )}
    </header>
  );
  return (
    <div className={styles.page}>
      <SegmentedControl
        values={[...sections]}
        value={section}
        onChange={(value) => setSection(value as Section)}
        label="Household life sections"
      />
      {error && (
        <div className={styles.error} role="alert">
          {error}{" "}
          <Button disabled={busy} onClick={() => void life.refresh()}>
            Retry
          </Button>
        </div>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}{" "}
          {section === "Pantry & supplies" || section === "Meal planning" ? (
            <Button onClick={openShopping}>Open shopping list</Button>
          ) : null}
        </p>
      )}
      {!life.loaded && !error && <p role="status">Loading your household…</p>}
      {section === "Quick polls" && (
        <>
          {heading(
            "Ask the house, vote before the deadline, and save the final decision.",
            "poll",
          )}
          <div className={styles.grid}>
            {data.polls.map((poll) => {
              const tally = pollTally(poll, data.votes);
              const votes = data.votes.filter((v) => v.poll_id === poll.id);
              const mine = votes.find((v) => v.member_id === uid);
              const open = pollOpen(poll, now);
              return (
                <article
                  className={styles.card}
                  key={poll.id}
                  aria-label={poll.title}
                >
                  <h3>{poll.title}</h3>
                  <p className={styles.meta}>
                    {poll.decision
                      ? "Decision saved"
                      : open
                        ? "Voting open"
                        : "Voting ended"}{" "}
                    ·{" "}
                    {new Date(poll.deadline).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <div className={styles.votes}>
                    {tally.map((option, choice) => (
                      <div key={choice}>
                        <Button
                          disabled={!writable || busy || !open}
                          aria-pressed={mine?.choice === choice}
                          onClick={() =>
                            perform("poll_vote", { id: poll.id, choice })
                          }
                        >
                          <span>{option.option}</span>
                          <strong>{option.count}</strong>
                        </Button>
                        {votes.some((v) => v.choice === choice) && (
                          <small>
                            {votes
                              .filter((v) => v.choice === choice)
                              .map((v) => person(v.member_id))
                              .join(", ")}
                          </small>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className={styles.meta}>
                    {poll.decision
                      ? `${votes.length} votes saved`
                      : `${votes.length} of ${people.length} housemates voted`}
                    {mine && open
                      ? " · Tap another option to change your vote."
                      : ""}
                  </p>
                  {poll.decision ? (
                    <div className={styles.decision}>
                      <strong>Saved decision</strong>
                      <p>{poll.decision}</p>
                      <small>
                        {person(poll.decided_by)} ·{" "}
                        {new Date(poll.decided_at!).toLocaleDateString()}
                      </small>
                    </div>
                  ) : !open && writable ? (
                    <form
                      className={styles.decision}
                      onSubmit={(event) => {
                        event.preventDefault();
                        const decision = String(
                          new FormData(event.currentTarget).get("decision") ||
                            "",
                        ).trim();
                        if (decision)
                          perform("poll_decide", { id: poll.id, decision });
                      }}
                    >
                      <label>
                        Final decision
                        <textarea
                          name="decision"
                          required
                          maxLength={2000}
                          placeholder="What did the house decide? Include any next steps."
                        />
                      </label>
                      <Button className="button" disabled={busy}>
                        Save decision
                      </Button>
                      <small>
                        Voting is closed. Saving keeps this decision with its
                        votes.
                      </small>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
          {life.loaded && !data.polls.length && (
            <Empty>
              Start with a question like “Should we buy this vacuum?”
            </Empty>
          )}
        </>
      )}
      {section === "Pantry & supplies" && (
        <>
          {heading(
            "Keep staples on hand. Low supplies go straight to shopping.",
            "pantry",
          )}
          <div className={styles.grid}>
            {[...data.pantry]
              .sort(
                (a, b) =>
                  ({ out: 0, low: 1, stocked: 2 })[a.status] -
                    { out: 0, low: 1, stocked: 2 }[b.status] ||
                  a.title.localeCompare(b.title),
              )
              .map((item) => (
                <article
                  className={styles.card}
                  key={item.id}
                  aria-label={item.title}
                >
                  <div className={styles.cardHeading}>
                    <h3>{item.title}</h3>
                    {editButtons("pantry", item)}
                  </div>
                  {writable ? (
                    <label className={styles.inline}>
                      Stock level
                      <select
                        aria-label={`Stock level for ${item.title}`}
                        value={item.status}
                        disabled={busy}
                        onChange={(event) =>
                          perform("pantry_save", {
                            ...item,
                            status: event.target.value,
                          })
                        }
                      >
                        <option value="stocked">Stocked</option>
                        <option value="low">Running low</option>
                        <option value="out">Out</option>
                      </select>
                    </label>
                  ) : (
                    <p className={styles.meta}>
                      {item.status === "stocked"
                        ? "Stocked"
                        : item.status === "low"
                          ? "Running low"
                          : "Out"}
                    </p>
                  )}
                  {item.notes && <p className={styles.details}>{item.notes}</p>}
                  {onShopping(item.title) ? (
                    <p className={styles.notice}>On the shopping list</p>
                  ) : (
                    writable &&
                    item.status !== "stocked" && (
                      <Button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => perform("pantry_shop", { id: item.id })}
                      >
                        <ShoppingBasket size={15} />
                        Add to shopping
                      </Button>
                    )
                  )}
                  {item.status !== "stocked" && (
                    <small className={styles.meta}>
                      After shopping, mark this staple stocked.
                    </small>
                  )}
                </article>
              ))}
          </div>
          {life.loaded && !data.pantry.length && (
            <Empty>
              Track rice, olive oil, toilet paper, and other staples here.
            </Empty>
          )}
        </>
      )}
      {section === "Maintenance" && (
        <>
          {heading(
            "Record the problem, choose who follows up, and keep its resolution.",
            "maintenance",
          )}
          {!life.photosEnabled && !readOnly && (
            <p className={styles.meta}>
              Photo attachments are unavailable until the owner configures
              private file storage.
            </p>
          )}
          <div className={styles.grid}>
            {data.maintenance.map((request) => (
              <article
                className={styles.card}
                key={request.id}
                aria-label={request.title}
              >
                <div className={styles.cardHeading}>
                  <h3>{request.title}</h3>
                  {editButtons("maintenance", request)}
                </div>
                <p className={styles.meta}>
                  {request.status === "in_progress"
                    ? "In progress"
                    : request.status === "resolved"
                      ? "Resolved"
                      : "Open"}{" "}
                  · Follow-up: {person(request.assignee)}
                </p>
                <p className={styles.details}>{request.description}</p>
                <small className={styles.meta}>
                  Reported by {person(request.created_by)} on{" "}
                  {new Date(request.created_at).toLocaleDateString()}
                </small>
                {request.status === "resolved" && (
                  <div className={styles.decision}>
                    <strong>Resolution</strong>
                    <p>{request.resolution}</p>
                    <small>
                      {new Date(request.resolved_at!).toLocaleDateString()}
                    </small>
                  </div>
                )}
                <div className={styles.photos}>
                  {data.photos
                    .filter((p) => p.request_id === request.id)
                    .map((photo) => (
                      <figure key={photo.id}>
                        <a
                          href={
                            photo.storage_path.startsWith("blob:")
                              ? photo.storage_path
                              : `/api/household-life/photos?id=${encodeURIComponent(photo.id)}`
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            src={
                              photo.storage_path.startsWith("blob:")
                                ? photo.storage_path
                                : `/api/household-life/photos?id=${encodeURIComponent(photo.id)}`
                            }
                            alt={photo.file_name}
                          />
                        </a>
                        <figcaption>
                          {photo.file_name}
                          {writable && (
                            <Button
                              disabled={busy}
                              aria-label={`Remove photo ${photo.file_name}`}
                              onClick={() => void life.removePhoto(photo.id)}
                            >
                              <X size={14} />
                            </Button>
                          )}
                        </figcaption>
                      </figure>
                    ))}
                </div>
                {writable && life.photosEnabled && (
                  <label className={styles.upload}>
                    Attach a photo
                    <input
                      aria-label={`Attach photo to ${request.title}`}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void life.upload(request.id, file);
                        event.target.value = "";
                      }}
                    />
                    <small>JPEG, PNG, or WebP · up to 10 MB</small>
                  </label>
                )}
              </article>
            ))}
          </div>
          {life.loaded && !data.maintenance.length && (
            <Empty>
              No repairs reported. Add a broken appliance or anything that needs
              a follow-up.
            </Empty>
          )}
        </>
      )}
      {section === "Meal planning" && (
        <>
          {heading(
            "Plan a shared dinner on the calendar and shop for missing ingredients.",
            "meal",
          )}
          <div className={styles.grid}>
            {[...data.meals]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((meal) => (
                <article
                  className={styles.card}
                  key={meal.id}
                  aria-label={meal.title}
                >
                  <div className={styles.cardHeading}>
                    <h3>{meal.title}</h3>
                    {editButtons("meal", meal)}
                  </div>
                  <p className={styles.meta}>
                    {new Date(meal.date + "T12:00:00").toLocaleDateString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · Cook: {person(meal.cook)}
                  </p>
                  {meal.notes && <p className={styles.details}>{meal.notes}</p>}
                  <ul className={styles.ingredients}>
                    {meal.ingredients.map((ingredient, index) => (
                      <li key={index}>
                        {writable ? (
                          <label>
                            <input
                              type="checkbox"
                              checked={!ingredient.missing}
                              disabled={busy}
                              onChange={(event) =>
                                perform("meal_save", {
                                  ...meal,
                                  ingredients: meal.ingredients.map((i, n) =>
                                    n === index
                                      ? { ...i, missing: !event.target.checked }
                                      : i,
                                  ),
                                })
                              }
                            />
                            {ingredient.title}
                          </label>
                        ) : (
                          <span>{ingredient.title}</span>
                        )}
                        <small>
                          {!ingredient.missing
                            ? "Have it"
                            : onShopping(ingredient.title)
                              ? "On shopping list"
                              : "Missing"}
                        </small>
                      </li>
                    ))}
                  </ul>
                  {writable && meal.ingredients.some((i) => i.missing) && (
                    <Button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => perform("meal_shop", { id: meal.id })}
                    >
                      <ShoppingBasket size={15} />
                      Send missing ingredients to shopping
                    </Button>
                  )}
                </article>
              ))}
          </div>
          {life.loaded && !data.meals.length && (
            <Empty>Pick a dinner, a date, and the ingredients to share.</Empty>
          )}
        </>
      )}
      {section === "Budget" && (
        <>
          {heading(
            "Set monthly targets and compare them with purchases in Expenses.",
          )}
          <label className={styles.month}>
            Budget month
            <input
              type="month"
              value={month}
              required
              onChange={(event) => {
                if (/^\d{4}-\d{2}$/.test(event.target.value))
                  setMonth(event.target.value);
              }}
            />
          </label>
          {expensesError ? (
            <p className={styles.error} role="alert">
              {expensesError}
            </p>
          ) : !expensesLoaded ? (
            <p role="status">Loading spending…</p>
          ) : (
            <>
              <div className={styles.grid}>
                {(["groceries", "utilities"] as const).map((category) => {
                  const spent = budgetSpending(
                    expenses,
                    data.categories,
                    month,
                    data.spending,
                  )[category];
                  const target = data.targets.find(
                    (t) => t.month === month + "-01" && t.category === category,
                  )?.target_cents;
                  const label =
                    category === "groceries" ? "Groceries" : "Utilities";
                  return (
                    <article key={category} className={styles.card}>
                      <h3>{label}</h3>
                      <p className={styles.amount}>
                        {expenseMoney(spent)}{" "}
                        <small>
                          spent
                          {target !== undefined
                            ? ` of ${expenseMoney(target)}`
                            : " · no target yet"}
                        </small>
                      </p>
                      {target !== undefined && (
                        <>
                          <progress
                            max={target || 1}
                            value={Math.min(spent, target || 1)}
                            aria-label={`${label} budget used`}
                          />
                          <p className={styles.meta}>
                            {spent > target
                              ? `${expenseMoney(spent - target)} over target`
                              : `${expenseMoney(target - spent)} remaining`}
                          </p>
                        </>
                      )}
                      {writable && (
                        <form
                          key={`${month}-${target}`}
                          className={styles.target}
                          onSubmit={(event) => {
                            event.preventDefault();
                            const cents = shareCents(
                              String(
                                new FormData(event.currentTarget).get("target"),
                              ),
                            );
                            if (cents !== null)
                              perform("budget_target", {
                                month: month + "-01",
                                category,
                                target_cents: cents,
                              });
                          }}
                        >
                          <label>
                            Monthly {label.toLowerCase()} target ($)
                            <input
                              name="target"
                              type="number"
                              required
                              min="0"
                              max="1000000"
                              step="0.01"
                              defaultValue={
                                target === undefined
                                  ? ""
                                  : (target / 100).toFixed(2)
                              }
                            />
                          </label>
                          <Button
                            disabled={busy || !life.loaded}
                            className="button secondary"
                          >
                            Save target
                          </Button>
                        </form>
                      )}
                    </article>
                  );
                })}
              </div>
              <p className={styles.meta}>
                {expenseMoney(
                  budgetSpending(
                    expenses,
                    data.categories,
                    month,
                    data.spending,
                  ).unclassified,
                )}{" "}
                in uncategorized purchases. Categorize groceries and utilities
                below. Repayments are excluded; purchases count at their full
                amount.
              </p>
              {moreExpenses?.available && (
                <Button
                  className="button secondary"
                  disabled={moreExpenses.loading}
                  onClick={() => void moreExpenses.load()}
                >
                  {moreExpenses.loading
                    ? "Loading…"
                    : "Load older budget purchases"}
                </Button>
              )}
              <div className={styles.ledger}>
                {expenses
                  .filter(
                    (e) => e.kind === "expense" && e.date.startsWith(month),
                  )
                  .map((expense) => (
                    <div key={expense.id} className={styles.ledgerRow}>
                      <div>
                        <strong>{expense.title}</strong>
                        <small>
                          {expense.date} · {expenseMoney(expense.amount_cents)}
                        </small>
                      </div>
                      {writable ? (
                        <select
                          aria-label={`Budget category for ${expense.title}`}
                          disabled={busy || !life.loaded}
                          value={
                            data.categories.find(
                              (c) => c.expense_id === expense.id,
                            )?.category || ""
                          }
                          onChange={(event) =>
                            perform("budget_category", {
                              id: expense.id,
                              category: event.target.value,
                            })
                          }
                        >
                          <option value="">Uncategorized</option>
                          <option value="groceries">Groceries</option>
                          <option value="utilities">Utilities</option>
                        </select>
                      ) : (
                        <span>
                          {data.categories.find(
                            (c) => c.expense_id === expense.id,
                          )?.category || "Uncategorized"}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
              {!expenses.some(
                (e) => e.kind === "expense" && e.date.startsWith(month),
              ) && (
                <Empty>
                  No purchases in this month. Log spending in Expenses.
                </Empty>
              )}
            </>
          )}
        </>
      )}
      <AnimatePresence>
        {editor && writable && (
          <LifeEditor
            key={`${editor.kind}-${editor.item?.id || "new"}`}
            editor={editor}
            life={life}
            people={people}
            pantry={data.pantry}
            today={today}
            close={() => setEditor(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
function LifeEditor({
  editor,
  life,
  people,
  pantry,
  today,
  close,
}: {
  editor: Editor;
  life: HouseholdLifeController;
  people: Member[];
  pantry: PantryItem[];
  today: string;
  close: () => void;
}) {
  const { kind, item } = editor;
  const meal = kind === "meal" ? (item as Meal | undefined) : undefined;
  const repair =
    kind === "maintenance"
      ? (item as MaintenanceRequest | undefined)
      : undefined;
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    meal?.ingredients || [],
  );
  const [validation, setValidation] = useState("");
  const [status, setStatus] = useState(repair?.status || "open");
  const [deleting, setDeleting] = useState(!!editor.deleting);
  const memberSelect = (label: string, name: string, value?: string | null) => (
    <label>
      {label}
      <select name={name} defaultValue={value || ""}>
        <option value="">Unassigned</option>
        {people.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation("");
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) || "").trim();
    const payload: Record<string, unknown> = {
      title: text("title"),
      ...(item ? { id: item.id } : {}),
    };
    let operation: LifeOperation;
    if (kind === "poll") {
      const options = text("options")
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);
      if (
        options.length < 2 ||
        options.length > 6 ||
        options.some((o) => o.length > 120) ||
        new Set(options.map((o) => o.toLowerCase())).size !== options.length
      ) {
        setValidation(
          "Use 2 to 6 distinct options, up to 120 characters each.",
        );
        return;
      }
      const deadline = new Date(text("deadline"));
      if (
        !Number.isFinite(deadline.getTime()) ||
        deadline.getTime() <= Date.now()
      ) {
        setValidation("Choose a future deadline.");
        return;
      }
      operation = "poll_create";
      Object.assign(payload, { options, deadline: deadline.toISOString() });
    } else if (kind === "pantry") {
      operation = "pantry_save";
      Object.assign(payload, { status: text("status"), notes: text("notes") });
    } else if (kind === "maintenance") {
      operation = "maintenance_save";
      Object.assign(payload, {
        description: text("description"),
        assignee: text("assignee") || null,
        status,
        resolution: text("resolution"),
      });
    } else {
      if (
        ingredients.length > 60 ||
        ingredients.some((i) => i.title.length > 160)
      ) {
        setValidation("Use up to 60 ingredients, up to 160 characters each.");
        return;
      }
      operation = "meal_save";
      Object.assign(payload, {
        date: text("date"),
        cook: text("cook") || null,
        notes: text("notes"),
        ingredients,
      });
    }
    if (await life.mutate(operation, payload)) close();
  }
  return (
    <PaperDialog
      onClose={() => {
        if (!life.busy) close();
      }}
      aria-labelledby="life-editor-title"
    >
      <form className={styles.editor} onSubmit={submit}>
        <div className={styles.cardHeading}>
          <h2 id="life-editor-title">
            {item ? "Edit" : kind === "poll" ? "New" : "Add"}{" "}
            {kind === "poll"
              ? "quick poll"
              : kind === "pantry"
                ? "staple"
                : kind === "maintenance"
                  ? "maintenance request"
                  : "shared dinner"}
          </h2>
          <Button
            type="button"
            disabled={life.busy}
            aria-label="Close editor"
            onClick={close}
          >
            <X size={18} />
          </Button>
        </div>
        <label>
          {kind === "poll"
            ? "Question"
            : kind === "pantry"
              ? "Staple name"
              : kind === "maintenance"
                ? "What needs fixing?"
                : "Dinner name"}
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={item?.title || ""}
          />
        </label>
        {kind === "poll" && (
          <>
            <label>
              Options (one per line)
              <textarea
                name="options"
                required
                defaultValue={"Yes\nNo"}
                maxLength={730}
              />
            </label>
            <label>
              Voting deadline
              <input name="deadline" type="datetime-local" required />
            </label>
            <p className={styles.meta}>
              Each housemate gets one vote and can change it until the deadline.
              Afterward, a housemate saves the decision.
            </p>
          </>
        )}
        {kind === "pantry" && (
          <>
            <label>
              Stock level
              <select
                name="status"
                defaultValue={(item as PantryItem)?.status || "stocked"}
              >
                <option value="stocked">Stocked</option>
                <option value="low">Running low</option>
                <option value="out">Out</option>
              </select>
            </label>
            <label>
              Notes
              <textarea
                name="notes"
                maxLength={2000}
                defaultValue={(item as PantryItem)?.notes || ""}
                placeholder="Brand, size, or where it belongs"
              />
            </label>
          </>
        )}
        {kind === "maintenance" && (
          <>
            <label>
              Problem details
              <textarea
                name="description"
                maxLength={2000}
                defaultValue={repair?.description || ""}
              />
            </label>
            {memberSelect(
              "Follow-up assigned to",
              "assignee",
              repair?.assignee,
            )}
            <label>
              Repair status
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as MaintenanceRequest["status"])
                }
              >
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
            <label>
              Resolution / follow-up notes
              <textarea
                name="resolution"
                required={status === "resolved"}
                maxLength={2000}
                defaultValue={repair?.resolution || ""}
                placeholder="What was done, or the next follow-up"
              />
            </label>
            <p className={styles.meta}>
              Save the request, then attach photos to its card.
            </p>
          </>
        )}
        {kind === "meal" && (
          <>
            <label>
              Dinner date
              <input
                name="date"
                type="date"
                required
                defaultValue={meal?.date || today}
              />
            </label>
            {memberSelect("Cook / coordinator", "cook", meal?.cook)}
            <label>
              Ingredients (one per line)
              <textarea
                maxLength={9600}
                defaultValue={ingredients.map((i) => i.title).join("\n")}
                onChange={(event) => {
                  const seen = new Set<string>();
                  setIngredients(
                    event.target.value
                      .split("\n")
                      .map((title) => title.trim())
                      .filter((title) => {
                        const key = title.toLowerCase();
                        if (!title || seen.has(key)) return false;
                        seen.add(key);
                        return true;
                      })
                      .map((title) => ({
                        title,
                        missing:
                          ingredients.find(
                            (i) =>
                              i.title.toLowerCase() === title.toLowerCase(),
                          )?.missing ??
                          !pantry.some(
                            (p) =>
                              p.status === "stocked" &&
                              p.title.toLowerCase() === title.toLowerCase(),
                          ),
                      })),
                  );
                }}
              />
            </label>
            {ingredients.length > 0 && (
              <fieldset>
                <legend>Ingredients already at home</legend>
                {ingredients.map((ingredient, index) => (
                  <label className={styles.check} key={index}>
                    <input
                      type="checkbox"
                      checked={!ingredient.missing}
                      onChange={(event) =>
                        setIngredients((current) =>
                          current.map((i, n) =>
                            n === index
                              ? { ...i, missing: !event.target.checked }
                              : i,
                          ),
                        )
                      }
                    />
                    {ingredient.title}
                  </label>
                ))}
              </fieldset>
            )}
            <label>
              Dinner notes
              <textarea
                name="notes"
                maxLength={2000}
                defaultValue={meal?.notes || ""}
              />
            </label>
            <p className={styles.meta}>
              The dinner also appears on your shared calendar.
            </p>
          </>
        )}
        {(validation || life.error) && (
          <p className={styles.error} role="alert">
            {validation || life.error}
          </p>
        )}
        <div className={styles.footer}>
          <Button className="button" disabled={life.busy}>
            {life.busy
              ? "Saving…"
              : "Save " +
                (kind === "poll"
                  ? "poll"
                  : kind === "pantry"
                    ? "staple"
                    : kind === "maintenance"
                      ? "request"
                      : "dinner")}
          </Button>
          {item && (
            <Button
              type="button"
              className="button secondary"
              disabled={life.busy}
              onClick={() => setDeleting(true)}
            >
              Delete{" "}
              {kind === "pantry"
                ? "staple"
                : kind === "maintenance"
                  ? "request"
                  : "dinner"}
            </Button>
          )}
        </div>
        {deleting && item && (
          <div className={styles.error}>
            <p>
              Delete “{item.title}”?{" "}
              {kind === "maintenance"
                ? "Its photos will also be removed."
                : kind === "meal"
                  ? "Its linked calendar plan will also be removed."
                  : "Existing shopping items will stay on the list."}
            </p>
            <Button
              type="button"
              disabled={life.busy}
              onClick={() =>
                void life
                  .mutate(`${kind}_delete` as LifeOperation, { id: item.id })
                  .then((ok) => {
                    if (ok) close();
                  })
              }
            >
              Confirm delete
            </Button>
            <Button
              type="button"
              disabled={life.busy}
              onClick={() => setDeleting(false)}
            >
              Keep it
            </Button>
          </div>
        )}
      </form>
    </PaperDialog>
  );
}
