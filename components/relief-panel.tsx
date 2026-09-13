"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  choreMisses,
  ptoRemaining,
  unexcusedGymMisses,
  type Agreement,
  type AgreementEvent,
  type GymTerms,
  type HouseTerms,
} from "@/lib/agreements";
import {
  dateKey,
  parseDate,
  shiftDay,
  type Entry,
  type Member,
} from "@/lib/model";
import type { AgreementsController } from "@/lib/use-agreements";
import styles from "./agreements.module.css";

export default function ReliefPanel({
  agreement,
  members,
  uid,
  entries,
  controller,
  refreshEntries,
}: {
  agreement: Agreement;
  members: Member[];
  uid: string;
  entries: Entry[];
  controller: AgreementsController;
  refreshEntries: () => void;
}) {
  const [skipFor, setSkipFor] = useState<string | null>(null);
  const [reschedFor, setReschedFor] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [hours, setHours] = useState("1");
  const [session, setSession] = useState("");
  const events = controller.events.filter(
    (e) => e.agreement_id === agreement.id,
  );
  const openEvents = events.filter((e) => e.status === "open");
  const other = members.find((m) => m.user_id !== uid);
  const nameOf = (id: string | null) =>
    members.find((m) => m.user_id === id)?.name ?? "Someone";
  const now = new Date();
  const today = dateKey(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const entryIds = (e: AgreementEvent) =>
    e.entry_id
      ? [e.entry_id]
      : Array.isArray(e.details.entry_ids)
        ? (e.details.entry_ids as string[])
        : [];
  const eventThing = (e: AgreementEvent) =>
    entryIds(e)
      .map((id) => entries.find((entry) => entry.id === id)?.title)
      .filter(Boolean)
      .join(", ");
  const friendly = (date: string) =>
    parseDate(date).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  const friendlyIso = (iso: string) => {
    const date = new Date(iso);
    const days = Math.abs(now.getTime() - date.getTime()) / 86400000;
    return date.toLocaleDateString(
      "en-US",
      days < 7 ? { weekday: "short" } : { month: "short", day: "numeric" },
    );
  };
  const requestedFor = (id: string) =>
    openEvents.some((e) => entryIds(e).includes(id));
  const describe = (e: AgreementEvent) => {
    const what = eventThing(e);
    switch (e.kind) {
      case "swap":
        return `${nameOf(e.actor)} asks to swap ${what || "a chore"}`;
      case "skip_cover":
        return `${nameOf(e.actor)} asks ${
          e.actor === uid ? (other?.name ?? "them") : "you"
        } to cover ${what || "a chore"}`;
      case "reschedule":
        return `${nameOf(e.actor)} proposes moving ${what || "a session"} to ${String(e.details.new_date ?? "")} ${String(e.details.new_time ?? "")}`;
      default:
        return `${nameOf(e.actor)} sent a request`;
    }
  };
  const requests = !openEvents.length ? null : (
    <>
      <h5>Open requests</h5>
      {openEvents.map((e) => (
        <div className={styles.item} key={e.id}>
          <span className={styles.itemCopy}>
            <strong>{describe(e)}</strong>
            <small>{friendlyIso(e.created_at)}</small>
          </span>
          <span className={styles.itemActions}>
            {e.actor === uid ? (
              <span className={styles.chip}>
                Waiting for {other?.name ?? "them"}
              </span>
            ) : (
              <>
                <Button
                  className="button small"
                  onClick={() => {
                    controller.decideEvent(e.id, true);
                    refreshEntries();
                  }}
                >
                  Accept
                </Button>
                <Button
                  className="button secondary small"
                  onClick={() => controller.decideEvent(e.id, false)}
                >
                  Decline
                </Button>
              </>
            )}
          </span>
        </div>
      ))}
    </>
  );

  if (agreement.slug === "house") {
    const terms = agreement.terms as HouseTerms;
    const monday = shiftDay(today, -((parseDate(today).getDay() + 6) % 7));
    const sunday = shiftDay(monday, 6);
    const series = terms.chore_series_ids ?? [];
    const weekChores = entries
      .filter(
        (e) =>
          e.kind === "task" &&
          e.category === "Chore" &&
          e.series_id &&
          series.includes(e.series_id) &&
          e.date &&
          e.date >= monday &&
          e.date <= sunday,
      )
      .sort((a, b) => (a.date! + a.title).localeCompare(b.date! + b.title));
    const repaid = new Set(
      events
        .filter((e) => e.kind === "cover_repaid")
        .map((e) => String(e.details.covers ?? "")),
    );
    const debts = events.filter(
      (e) =>
        e.kind === "skip_cover" && e.status === "accepted" && !repaid.has(e.id),
    );
    return (
      <section className={styles.subPanel}>
        <h4>Relief valves</h4>
        <p className="subtle">
          Swaps and skips, per Articles 5 and 6. Swap and cover requests wait
          for the other of you.
        </p>
        <h5>This week’s bundles</h5>
        {!weekChores.length && (
          <p className="subtle">No bundle chores on the calendar this week.</p>
        )}
        {weekChores.map((chore) => (
          <div className={styles.item} key={chore.id}>
            <span className={styles.itemCopy}>
              <strong>{chore.title}</strong>
              <small>
                {nameOf(chore.assignee)} · {friendly(chore.date!)}
                {chore.done ? " · done" : ""}
              </small>
            </span>
            {!chore.done && chore.assignee === uid && (
              <span className={styles.itemActions}>
                {requestedFor(chore.id) ? (
                  <span className={styles.chip}>Requested</span>
                ) : skipFor === chore.id ? (
                  <>
                    <Button
                      className="button secondary small"
                      onClick={() => {
                        controller.createEvent(agreement.id, "skip_rollover", {
                          entry_id: chore.id,
                        });
                        refreshEntries();
                        setSkipFor(null);
                      }}
                    >
                      Roll into my next week
                    </Button>
                    <Button
                      className="button secondary small"
                      onClick={() => {
                        controller.createEvent(agreement.id, "skip_cover", {
                          details: { entry_ids: [chore.id] },
                        });
                        setSkipFor(null);
                      }}
                    >
                      Ask {other?.name ?? "them"} to cover
                    </Button>
                    <Button
                      className="text-button"
                      onClick={() => setSkipFor(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      className="button secondary small"
                      onClick={() =>
                        controller.createEvent(agreement.id, "swap", {
                          details: { entry_ids: [chore.id] },
                        })
                      }
                    >
                      Swap
                    </Button>
                    <Button
                      className="button secondary small"
                      onClick={() => setSkipFor(chore.id)}
                    >
                      Skip…
                    </Button>
                  </>
                )}
              </span>
            )}
          </div>
        ))}
        {requests}
        {!!debts.length && (
          <>
            <h5>Cover debts</h5>
            {debts.map((debt) => (
              <div className={styles.item} key={debt.id}>
                <span className={styles.itemCopy}>
                  <strong>
                    {nameOf(debt.actor)} owes {nameOf(debt.decided_by)} a
                    comparable chore
                    {eventThing(debt) ? ` for ${eventThing(debt)}` : ""}
                  </strong>
                  <small>{friendlyIso(debt.created_at)}</small>
                </span>
                <span className={styles.itemActions}>
                  <Button
                    className="text-button"
                    onClick={() =>
                      controller.createEvent(agreement.id, "cover_repaid", {
                        details: { covers: debt.id },
                      })
                    }
                  >
                    Mark repaid
                  </Button>
                </span>
              </div>
            ))}
          </>
        )}
        <h5>Misses this month</h5>
        <p className={styles.statLine}>
          {members.map((member) => (
            <span key={member.user_id}>
              <strong>{member.name}</strong>{" "}
              {choreMisses(entries, terms, member.user_id, monthStart)}
            </span>
          ))}
          <small>
            {terms.miss_trigger} unexcused misses trigger the failure clause.
          </small>
        </p>
      </section>
    );
  }

  const terms = agreement.terms as GymTerms;
  const nearby = entries
    .filter(
      (e) =>
        e.kind === "event" &&
        e.category === "Gym" &&
        e.date &&
        e.date >= shiftDay(today, -7) &&
        e.date <= shiftDay(today, 7),
    )
    .sort((a, b) =>
      `${a.date} ${a.time_of_day ?? ""}`.localeCompare(
        `${b.date} ${b.time_of_day ?? ""}`,
      ),
    );
  const upcoming = nearby.filter((e) => e.date! >= today);
  const history = events.slice(0, 15);
  const hoursValue = Number(hours);
  const hoursValid =
    Number.isFinite(hoursValue) &&
    hoursValue > 0 &&
    hoursValue <= 24 &&
    Math.round(hoursValue * 4) === hoursValue * 4;
  const sessionLabel = (e: Entry) =>
    `${friendly(e.date!)}${e.time_of_day ? ` ${e.time_of_day}` : ""} · ${e.title}`;
  const sentence = (e: AgreementEvent) => {
    const what = eventThing(e);
    const line =
      e.kind === "pto"
        ? `${nameOf(e.actor)} spent ${e.hours ?? 0}h PTO`
        : e.kind === "sick"
          ? `${nameOf(e.actor)} marked a sick day`
          : e.kind === "reschedule"
            ? e.status === "accepted"
              ? `${nameOf(e.actor)} moved ${what || "a session"} to ${String(e.details.new_date ?? "")} ${String(e.details.new_time ?? "")}`
              : e.status === "declined"
                ? `${nameOf(e.actor)}’s reschedule was declined`
                : `${nameOf(e.actor)} proposed a reschedule`
            : `${nameOf(e.actor)} · ${e.kind.replace(/_/g, " ")}`;
    return `${line} · ${friendlyIso(e.created_at)}`;
  };
  return (
    <section className={styles.subPanel}>
      <h4>Relief valves</h4>
      <p className="subtle">
        PTO, sick days, and reschedules, per Articles 6 and 7. Reschedules wait
        for the other of you.
      </p>
      <h5>PTO remaining</h5>
      <p className={styles.statLine}>
        {members.map((member) => (
          <span key={member.user_id}>
            <strong>{member.name}</strong>{" "}
            {ptoRemaining(events, member.user_id, terms, now)}h
          </span>
        ))}
        <small>
          of {terms.pto.hours}h per{" "}
          {terms.pto.period === "month" ? "calendar month" : "year"}
        </small>
      </p>
      <h5>Time off</h5>
      <div className={styles.inlineForm}>
        <select
          aria-label="Session it covers"
          value={session}
          onChange={(event) => setSession(event.target.value)}
        >
          <option value="">No particular session</option>
          {nearby.map((e) => (
            <option key={e.id} value={e.id}>
              {sessionLabel(e)}
            </option>
          ))}
        </select>
        <input
          aria-label="PTO hours"
          className={styles.hoursInput}
          type="number"
          min={0.25}
          max={24}
          step={0.25}
          value={hours}
          onChange={(event) => setHours(event.target.value)}
        />
        <Button
          className="button secondary small"
          disabled={!hoursValid}
          onClick={() =>
            controller.createEvent(agreement.id, "pto", {
              hours: hoursValue,
              ...(session ? { entry_id: session } : {}),
            })
          }
        >
          Spend PTO
        </Button>
        <Button
          className="button secondary small"
          onClick={() =>
            controller.createEvent(
              agreement.id,
              "sick",
              session ? { entry_id: session } : {},
            )
          }
        >
          Mark a sick day
        </Button>
      </div>
      <p className="subtle">
        Pick the session it covers so the miss count knows. PTO spends in
        0.25-hour steps.
      </p>
      <h5>Next 7 days</h5>
      {!upcoming.length && (
        <p className="subtle">No sessions scheduled this week.</p>
      )}
      {upcoming.map((gymSession) => (
        <div className={styles.item} key={gymSession.id}>
          <span className={styles.itemCopy}>
            <strong>{gymSession.title}</strong>
            <small>
              {friendly(gymSession.date!)}
              {gymSession.time_of_day ? ` · ${gymSession.time_of_day}` : ""}
            </small>
          </span>
          <span className={styles.itemActions}>
            {requestedFor(gymSession.id) ? (
              <span className={styles.chip}>Requested</span>
            ) : reschedFor === gymSession.id ? (
              <span className={styles.inlineForm}>
                <input
                  aria-label="New date"
                  type="date"
                  value={newDate}
                  onChange={(event) => setNewDate(event.target.value)}
                />
                <input
                  aria-label="New time"
                  type="time"
                  value={newTime}
                  onChange={(event) => setNewTime(event.target.value)}
                />
                <Button
                  className="button small"
                  disabled={!newDate || !newTime}
                  onClick={() => {
                    controller.createEvent(agreement.id, "reschedule", {
                      entry_id: gymSession.id,
                      details: { new_date: newDate, new_time: newTime },
                    });
                    setReschedFor(null);
                  }}
                >
                  Ask
                </Button>
                <Button
                  className="text-button"
                  onClick={() => setReschedFor(null)}
                >
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                className="button secondary small"
                onClick={() => {
                  setReschedFor(gymSession.id);
                  setNewDate(gymSession.date!);
                  setNewTime(gymSession.time_of_day ?? "07:00");
                }}
              >
                Propose reschedule
              </Button>
            )}
          </span>
        </div>
      ))}
      {requests}
      <h5>Misses this month</h5>
      <p className={styles.statLine}>
        {members.map((member) => (
          <span key={member.user_id}>
            <strong>{member.name}</strong>{" "}
            {unexcusedGymMisses(
              entries,
              controller.logs,
              events,
              member.user_id,
              monthStart,
            )}
          </span>
        ))}
        <small>
          {terms.miss_trigger} unexcused misses trigger the failure clause.
        </small>
      </p>
      {!!history.length && (
        <>
          <h5>Lately</h5>
          <ul className={styles.history}>
            {history.map((e) => (
              <li key={e.id}>{sentence(e)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
