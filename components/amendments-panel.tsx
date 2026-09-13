"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  Agreement,
  AgreementSlug,
  Amendment,
} from "@/lib/agreements";
import type { Member } from "@/lib/model";
import type { AgreementsController } from "@/lib/use-agreements";
import styles from "./agreements.module.css";

const NUMERIC_TERMS: Record<AgreementSlug, { key: string; label: string }[]> = {
  house: [
    { key: "max_swaps_month", label: "Max swaps / month" },
    { key: "max_skips_month", label: "Max skips / month" },
    { key: "miss_trigger", label: "Misses to trigger" },
  ],
  gym: [
    { key: "days_per_week", label: "Days per week" },
    { key: "miss_trigger", label: "Misses to trigger" },
  ],
};
const CHIP_LABEL: Record<Amendment["status"], string> = {
  open: "Open",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export default function AmendmentsPanel({
  agreement,
  members,
  uid,
  controller,
  refreshEntries,
}: {
  agreement: Agreement;
  members: Member[];
  uid: string;
  controller: AgreementsController;
  refreshEntries: () => void;
}) {
  const [showNumbers, setShowNumbers] = useState(false);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const list = controller.amendments.filter(
    (a) => a.agreement_id === agreement.id,
  );
  const nameOf = (id: string | null) =>
    members.find((m) => m.user_id === id)?.name ?? "Housemate";
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  const chipClass = (status: Amendment["status"]) =>
    status === "open"
      ? `${styles.chip} ${styles.chipWaiting}`
      : status === "approved"
        ? `${styles.chip} ${styles.chipActive}`
        : styles.chip;
  return (
    <section className={styles.subPanel}>
      <h4>Amendments</h4>
      <p className="subtle">
        Approved amendments take effect immediately and stay on the record.
      </p>
      {!list.length && (
        <p className="subtle">Nothing yet. The terms stand as signed.</p>
      )}
      {list.map((amendment) => (
        <div className={styles.item} key={amendment.id}>
          <span className={styles.itemCopy}>
            <strong>{amendment.title}</strong>
            <p>{amendment.body}</p>
            {amendment.terms_patch && (
              <small>
                Changes:{" "}
                {Object.entries(amendment.terms_patch)
                  .map(([key, value]) => `${key} → ${String(value)}`)
                  .join(" · ")}
              </small>
            )}
            <small>
              Proposed by {nameOf(amendment.proposed_by)} ·{" "}
              {when(amendment.created_at)}
              {amendment.status === "declined" && amendment.reason
                ? ` · Declined by ${nameOf(amendment.decided_by)}: “${amendment.reason}”`
                : ""}
            </small>
          </span>
          <span className={styles.itemActions}>
            <span className={chipClass(amendment.status)}>
              {CHIP_LABEL[amendment.status]}
            </span>
            {amendment.status === "open" &&
              (amendment.proposed_by === uid ? (
                <Button
                  className="text-button"
                  onClick={() => controller.withdrawAmendment(amendment.id)}
                >
                  Withdraw
                </Button>
              ) : declining === amendment.id ? (
                <span className={styles.inlineForm}>
                  <input
                    aria-label="Reason for declining"
                    placeholder="Because…"
                    maxLength={1000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <Button
                    className="button secondary small"
                    onClick={() => {
                      controller.decideAmendment(
                        amendment.id,
                        false,
                        reason.trim() || undefined,
                      );
                      setDeclining(null);
                      setReason("");
                    }}
                  >
                    Confirm decline
                  </Button>
                  <Button
                    className="text-button"
                    onClick={() => setDeclining(null)}
                  >
                    Cancel
                  </Button>
                </span>
              ) : (
                <>
                  <Button
                    className="button small"
                    onClick={() => {
                      controller.decideAmendment(amendment.id, true);
                      if (amendment.terms_patch) refreshEntries();
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    className="button secondary small"
                    onClick={() => {
                      setDeclining(amendment.id);
                      setReason("");
                    }}
                  >
                    Decline…
                  </Button>
                </>
              ))}
          </span>
        </div>
      ))}
      <form
        className={styles.amendForm}
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const title = String(data.get("title") || "").trim();
          const body = String(data.get("body") || "").trim();
          if (!title || !body) return;
          const patch: Record<string, unknown> = {};
          for (const { key } of NUMERIC_TERMS[agreement.slug]) {
            const raw = String(data.get(key) || "").trim();
            const value = Number(raw);
            if (raw && Number.isFinite(value)) patch[key] = value;
          }
          controller.amend(
            agreement.id,
            title,
            body,
            Object.keys(patch).length ? patch : null,
          );
          form.reset();
          setShowNumbers(false);
        }}
      >
        <h5>Request an amendment</h5>
        <label>
          Title
          <input name="title" required maxLength={160} placeholder="Article, in short" />
        </label>
        <label>
          What changes, and why
          <textarea name="body" required maxLength={4000} rows={3} />
        </label>
        {showNumbers ? (
          <div className={styles.numbersRow}>
            {NUMERIC_TERMS[agreement.slug].map(({ key, label }) => (
              <label key={key}>
                {label}
                <input
                  name={key}
                  type="number"
                  min={0}
                  max={99}
                  placeholder={String(
                    (agreement.terms as unknown as Record<string, unknown>)[
                      key
                    ] ?? "",
                  )}
                />
              </label>
            ))}
          </div>
        ) : (
          <Button
            type="button"
            className="text-button"
            onClick={() => setShowNumbers(true)}
          >
            Also change these numbers…
          </Button>
        )}
        <div>
          <Button className="button secondary">
            Send to {members.find((m) => m.user_id !== uid)?.name ?? "your housemate"}
          </Button>
        </div>
      </form>
    </section>
  );
}
