"use client";
import { useState } from "react";
import { choreBalance } from "@/lib/chore-balance";
import { shiftDay, parseDate, type Entry, type Member } from "@/lib/model";
import { Button } from "./ui/button";
import styles from "./household-setup.module.css";
export default function ChoreBalance({
  entries,
  members,
  today,
  timezone,
  readOnly,
  review,
}: {
  entries: Entry[];
  members: Member[];
  today: string;
  timezone: string;
  readOnly: boolean;
  review: (entry: Entry) => void;
}) {
  const [offset, setOffset] = useState(0);
  const balance = choreBalance(
    entries,
    members,
    shiftDay(today, offset * 7),
    timezone,
  );
  const label = (date: string) =>
    parseDate(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  return (
    <section
      className={`panel ${styles.balance}`}
      aria-label="Weekly chore effort"
    >
      <div className={styles.heading}>
        <h2>Chore balance by effort</h2>
        <div className={styles.actions}>
          <Button
            className="text-button"
            aria-label="Previous chore week"
            onClick={() => setOffset(offset - 1)}
          >
            ←
          </Button>
          <span>
            {label(balance.start)} – {label(balance.end)}
          </span>
          <Button
            className="text-button"
            aria-label="Next chore week"
            onClick={() => setOffset(offset + 1)}
          >
            →
          </Button>
        </div>
      </div>
      <p className="subtle">
        Scheduled effort this week · about {Math.round(balance.target)} minutes
        per person for an equal share. Completed effort uses the day a chore was
        checked off.
      </p>
      <ul className={styles.loads}>
        {balance.rows.map(({ member, planned, completed, unknown }) => (
          <li key={member.user_id}>
            <strong>{member.name}</strong>
            <span>
              {planned} min planned · {completed} min completed
              {unknown ? ` · ${unknown} without estimates` : ""}
            </span>
            <meter
              aria-label={`${member.name}’s planned chore minutes`}
              min={0}
              max={Math.max(1, ...balance.rows.map((r) => r.planned))}
              value={planned}
            />
          </li>
        ))}
      </ul>
      {!balance.chores.length && (
        <p className="subtle">
          No chores scheduled for this week. Add a dated chore with estimated
          minutes to start balancing effort.
        </p>
      )}
      {!!balance.unknown && (
        <p className="subtle">
          {balance.unknown} chore{balance.unknown === 1 ? " needs" : "s need"}{" "}
          an effort estimate. These chores are excluded from minute totals and
          suggestions.
        </p>
      )}
      {!!balance.unassigned && (
        <p className="subtle">
          {balance.unassigned} chore{balance.unassigned === 1 ? " is" : "s are"}{" "}
          unassigned.
        </p>
      )}
      {!!balance.suggestions.length && (
        <>
          <h3>Suggested fair assignments</h3>
          <p className="subtle">
            Larger chores go to the lightest planned workload first. Housemates
            marked away on the chore date are excluded. Review each suggestion
            before saving; changing a rotating chore affects this occurrence.
          </p>
          <ul className={styles.suggestions}>
            {balance.suggestions.map(({ entry, member }) => (
              <li key={entry.id}>
                <span>
                  <strong>{entry.title}</strong> · {entry.effort_minutes} min →{" "}
                  {member.name}
                </span>
                <Button
                  className="button secondary small"
                  disabled={readOnly}
                  onClick={() => review({ ...entry, assignee: member.user_id })}
                >
                  Review assignment
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
