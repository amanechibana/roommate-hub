"use client";
import { householdSetup } from "@/lib/household-setup";
import type { Entry, Member } from "@/lib/model";
import { Button } from "./ui/button";
import styles from "./household-setup.module.css";
export default function HouseholdSetup({
  members,
  entries,
  notificationsReviewed,
  readOnly,
  navigate,
}: {
  members: Member[];
  entries: Entry[];
  notificationsReviewed: boolean;
  readOnly: boolean;
  navigate: (step: string) => void;
}) {
  const steps = householdSetup(members, entries, notificationsReviewed);
  const count = steps.filter((s) => s.done).length;
  return (
    <section
      id="household-setup"
      className={`panel settings-panel ${styles.setup}`}
      aria-label="Household setup checklist"
    >
      <h2>Get your home ready</h2>
      <p className="subtle">
        {count} of {steps.length} steps complete. Your checklist updates as you
        set up the house; notification choices belong to your selected person.
      </p>
      <progress
        aria-label="Household setup progress"
        value={count}
        max={steps.length}
      />
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.id}>
            <span aria-label={step.done ? "Complete" : "To do"}>
              {step.done ? "✓" : "○"}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p className="subtle">{step.detail}</p>
            </div>
            <Button
              className="button secondary small"
              disabled={readOnly}
              onClick={() => navigate(step.id)}
            >
              {step.done ? "Review" : "Set up"}
            </Button>
          </li>
        ))}
      </ol>
    </section>
  );
}
