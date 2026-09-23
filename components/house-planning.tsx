"use client";
import { useHouseholdClock } from "@/lib/household-clock";
import { householdDateTime, householdTimeToIso } from "@/lib/household-time";
import { agreementDocuments, renderTokens } from "@/lib/agreements-content";
import type { HouseTerms } from "@/lib/agreements";
import { useState } from "react";
import { Button } from "./ui/button";
import { SegmentedControl } from "./ui/segmented-control";
import { useCoordination } from "@/lib/use-coordination";
import { shareMoney } from "@/lib/household-actions";
import { type Entry, type Member } from "@/lib/model";
import type { MoveItem } from "@/lib/coordination";
import styles from "./house-planning.module.css";
function ItemEditor({
  item,
  disabled,
  onSave,
}: {
  item: MoveItem;
  disabled: boolean;
  onSave: (done: boolean, notes: string) => Promise<boolean>;
}) {
  const [notes, setNotes] = useState(item.notes),
    [done, setDone] = useState(item.done);
  return (
    <form
      className={styles.moveItem}
      onSubmit={async (e) => {
        e.preventDefault();
        await onSave(done, notes);
      }}
    >
      <label>
        <input
          type="checkbox"
          checked={done}
          disabled={disabled}
          onChange={(e) => setDone(e.target.checked)}
        />
        {item.title}
      </label>
      <input
        aria-label={`${item.title} details`}
        placeholder="Details, reading, or amount"
        maxLength={1000}
        value={notes}
        disabled={disabled}
        onChange={(e) => setNotes(e.target.value)}
      />
      {!disabled && (done !== item.done || notes !== item.notes) && (
        <Button className="button secondary">Save item</Button>
      )}
    </form>
  );
}
export default function HousePlanning({
  demo,
  entries,
  members,
  uid,
  readOnly,
  timezone,
}: {
  demo: boolean;
  entries: Entry[];
  members: Member[];
  uid: string | null;
  readOnly: boolean;
  timezone: string;
}) {
  const { today } = useHouseholdClock();
  const { data, loaded, busy, error, run, refresh } = useCoordination({
    demo,
    entries,
    uid,
  });
  const [section, setSection] = useState("Check-in");
  const [draft, setDraft] = useState<string | null>(null);
  const [timeError, setTimeError] = useState("");
  const disabled = readOnly || busy;
  const people = [...members, ...data.former_members].filter(
    (m) => m.name !== "Housemates",
  );
  const name = (id: string) =>
    people.find((m) => m.user_id === id)?.name || "Former housemate";
  async function submit(
    e: React.FormEvent<HTMLFormElement>,
    operation: string,
    transform?: (f: FormData) => Record<string, unknown>,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setTimeError("");
    try {
      if (
        await run(operation, transform ? transform(f) : Object.fromEntries(f))
      )
        form.reset();
    } catch (err) {
      setTimeError((err as Error).message);
    }
  }
  if (!loaded) return <p role="status">Loading house planning…</p>;
  return (
    <div className={styles.grid}>
      <div className={styles.sections}>
        <SegmentedControl
          label="House planning sections"
          values={["Check-in", "Reservations", "Moving"]}
          value={section}
          onChange={setSection}
        />
      </div>
      {error && (
        <div className={styles.error} role="alert">
          {error}{" "}
          <Button className="text-button" onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      )}
      {timeError && (
        <p className={styles.error} role="alert">
          {timeError}
        </p>
      )}
      {section === "Check-in" && (
        <section className={`panel settings-panel ${styles.checkin}`}>
          <h2>Weekly house check-in</h2>
          <p className="subtle">
            Week of {data.week}. Review unfinished chores, unpaid bills through
            next week, and decisions waiting on the house.
          </p>
          <div className={styles.review}>
            <div>
              <h3>Bills needing attention</h3>
              {data.bills.length ? (
                <ul>
                  {data.bills.map((b) => (
                    <li key={b.id}>
                      <strong>{b.title}</strong> · {b.date}
                      {b.amount != null && <> · {shareMoney(b.amount)}</>}
                      <small>
                        Waiting on{" "}
                        {(b.payment_members || [])
                          .filter((id) => !b.paid_by?.includes(id))
                          .map(name)
                          .join(", ")}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="subtle">No unpaid bills through next week.</p>
              )}
            </div>
            <div>
              <h3>Unfinished chores</h3>
              {data.chores.length ? (
                <ul>
                  {data.chores.map((c) => (
                    <li key={c.id}>
                      <strong>{c.title}</strong>
                      <small>
                        {c.date || "No due date"} ·{" "}
                        {c.assignee ? name(c.assignee) : "Anyone"}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="subtle">All caught up.</p>
              )}
            </div>
            <div>
              <h3>Decisions needing attention</h3>
              {!data.decisions.length && !data.pending_agreements.length && (
                <p className="subtle">Nothing waiting on a decision.</p>
              )}
              <ul>
                {data.pending_agreements.map((a) => (
                  <li key={a.id}>
                    {a.title}
                    <small>
                      Awaiting agreement signatures in Our household
                    </small>
                  </li>
                ))}
                {data.decisions.map((d) => (
                  <li key={d.id}>
                    <span>{d.title}</span>
                    {!readOnly && (
                      <Button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void run("resolve_decision", { id: d.id })
                        }
                      >
                        Mark decided
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {!readOnly && (
                <form onSubmit={(e) => void submit(e, "decision")}>
                  <label>
                    New decision
                    <input
                      name="title"
                      required
                      maxLength={160}
                      placeholder="What should we discuss?"
                    />
                  </label>
                  <Button className="button secondary" disabled={busy}>
                    Add decision
                  </Button>
                </form>
              )}
            </div>
          </div>
          {data.checkin && (
            <p className="subtle">
              Reviewed by {name(data.checkin.reviewed_by)} ·{" "}
              {new Date(data.checkin.reviewed_at).toLocaleString()}
            </p>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run("checkin", {
                  notes: draft ?? data.checkin?.notes ?? "",
                })
              )
                setDraft(null);
            }}
          >
            <label>
              Check-in notes
              <textarea
                maxLength={2000}
                rows={3}
                value={draft ?? data.checkin?.notes ?? ""}
                onChange={(e) => setDraft(e.target.value)}
                disabled={disabled}
              />
            </label>
            {!readOnly && (
              <Button className="button" disabled={busy}>
                Save weekly review
              </Button>
            )}
          </form>
          {!!data.checkin_history?.length && (
            <details>
              <summary>Past weekly reviews</summary>
              {data.checkin_history.map((c) => (
                <div key={c.week}>
                  <h3>Week of {c.week}</h3>
                  <p>{c.notes || "Reviewed without notes."}</p>
                  <small>Reviewed by {name(c.reviewed_by)}</small>
                </div>
              ))}
            </details>
          )}
        </section>
      )}
      {section === "Reservations" && (
        <section className="panel settings-panel">
          <h2>Shared resource bookings</h2>
          <p className="subtle">
            Reserve a resource for up to 24 hours. Times use the household time
            zone ({timezone}).
          </p>
          {!readOnly && (
            <details className={styles.composer}>
              <summary>Reserve a resource</summary>
              <form
                onSubmit={(e) =>
                  void submit(e, "book", (f) => ({
                    resource_id: f.get("resource_id"),
                    starts_at: householdTimeToIso(
                      String(f.get("starts_at")),
                      timezone,
                    ),
                    ends_at: householdTimeToIso(
                      String(f.get("ends_at")),
                      timezone,
                    ),
                    notes: f.get("notes"),
                  }))
                }
              >
                <label>
                  Resource
                  <select name="resource_id" required>
                    {data.resources.map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.times}>
                  <label>
                    Starts
                    <input type="datetime-local" name="starts_at" required />
                  </label>
                  <label>
                    Ends
                    <input type="datetime-local" name="ends_at" required />
                  </label>
                </div>
                <label>
                  Booking notes
                  <input name="notes" maxLength={1000} />
                </label>
                <Button className="button" disabled={busy}>
                  Reserve time
                </Button>
              </form>
            </details>
          )}
          <ul className={styles.bookings}>
            {[...data.bookings]
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
              .map((b) => (
                <li key={b.id}>
                  <strong>
                    {data.resources.find((r) => r.id === b.resource_id)?.name}
                  </strong>
                  <small>
                    {name(b.member)} ·{" "}
                    {householdDateTime(b.starts_at, timezone).replace("T", " ")}{" "}
                    – {householdDateTime(b.ends_at, timezone).replace("T", " ")}
                  </small>
                  {b.notes && <p>{b.notes}</p>}
                  {!readOnly && b.member === uid && (
                    <Button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void run("cancel_booking", { id: b.id })}
                    >
                      Cancel reservation
                    </Button>
                  )}
                </li>
              ))}
          </ul>
          {!data.bookings.length && (
            <p className="subtle">No reservations yet.</p>
          )}
          {!readOnly && (
            <details>
              <summary>Add a shared resource</summary>
              <form onSubmit={(e) => void submit(e, "resource")}>
                <label>
                  Resource name
                  <input name="name" required maxLength={80} />
                </label>
                <Button className="button secondary" disabled={busy}>
                  Add resource
                </Button>
              </form>
            </details>
          )}
        </section>
      )}
      {section === "Moving" && (
        <section className="panel settings-panel">
          <h2>Move-in / move-out checklist</h2>
          <p className="subtle">
            Keep keys, deposits, meter readings, cleaning, and final balances
            together. These notes do not change the expense ledger.
          </p>
          {!readOnly && (
            <details className={styles.composer}>
              <summary>Start a moving checklist</summary>
              <form onSubmit={(e) => void submit(e, "move")}>
                <label>
                  Housemate
                  <select name="member" required>
                    {people.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.times}>
                  <label>
                    Moving
                    <select name="direction">
                      <option value="in">Move-in</option>
                      <option value="out">Move-out</option>
                    </select>
                  </label>
                  <label>
                    Move date
                    <input
                      type="date"
                      name="date"
                      defaultValue={today}
                      required
                    />
                  </label>
                </div>
                <Button className="button" disabled={busy}>
                  Create checklist
                </Button>
              </form>
            </details>
          )}
          {!data.moves.length && (
            <p className="subtle">No moves being tracked.</p>
          )}
          {data.moves.map((move) => (
            <details key={move.id} open className={styles.move}>
              <summary>
                {name(move.member)} · Move-{move.direction} · {move.date} ·{" "}
                {move.items.filter((i) => i.done).length}/{move.items.length}{" "}
                done
              </summary>
              {move.items.map((item, index) => (
                <ItemEditor
                  key={`${move.id}-${index}-${item.done}-${item.notes}`}
                  item={item}
                  disabled={disabled}
                  onSave={(done, notes) =>
                    run("move_item", { id: move.id, index, done, notes })
                  }
                />
              ))}
            </details>
          ))}
          {!!data.agreement_archive?.length && (
            <details>
              <summary>Agreements before membership changes</summary>
              {data.agreement_archive.map((a) => (
                <div key={a.id}>
                  <h3>{a.agreement.title}</h3>
                  <p>
                    Archived when {name(a.departed_member)} left ·{" "}
                    {new Date(a.archived_at).toLocaleDateString()}
                  </p>
                  <small>
                    Signed by{" "}
                    {a.agreement.signed_by.map(name).join(", ") ||
                      "No signatures"}
                  </small>
                  {agreementDocuments[a.agreement.slug]?.map((section) => (
                    <div key={section.heading}>
                      <h3>{section.heading}</h3>
                      {section.paragraphs.map((paragraph, index) => (
                        <p key={index}>
                          {renderTokens(
                            paragraph,
                            a.agreement.terms,
                            people.filter((m) =>
                              a.agreement.signed_by.includes(m.user_id),
                            ),
                          )}
                        </p>
                      ))}
                      {section.checklist && (
                        <ul>
                          {(
                            (a.agreement.terms as HouseTerms).bundles?.[
                              section.heading.startsWith("SCHEDULE A")
                                ? "a"
                                : "b"
                            ]?.items ?? section.checklist
                          ).map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </details>
          )}
        </section>
      )}
    </div>
  );
}
