"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgreementsContext } from "./agreements-context";
import AgreementView, { AGREEMENT_TITLES } from "./agreement-view";
import type { Entry, Member } from "@/lib/model";
import type { Agreement, AgreementSlug } from "@/lib/agreements";
import styles from "./agreements.module.css";

const CARDS: { slug: AgreementSlug; subtitle: string }[] = [
  { slug: "house", subtitle: "House living & chores" },
  { slug: "gym", subtitle: "Gym" },
];

export default function AgreementsSection({
  members,
  uid,
  entries,
  refreshHousehold,
}: {
  members: Member[];
  uid: string | null;
  entries: Entry[];
  refreshHousehold: (quiet?: boolean) => void;
}) {
  const controller = useAgreementsContext();
  const [open, setOpen] = useState<AgreementSlug | null>(null);
  if (!controller?.enabled || !uid) return null;
  const real = members.filter((m) => m.name !== "Housemates");
  // Entry side effects (swaps, covers, reschedules, activation) land through
  // the serialized write queue; the household GET has to trail it. Two delayed
  // refetches cover the chained activation writes, the 15s poll backstops.
  const refreshEntries = () => {
    for (const ms of [1200, 4000])
      window.setTimeout(() => void refreshHousehold(true), ms);
  };
  const chip = (agreement?: Agreement) => {
    if (!agreement || agreement.status === "draft")
      return <span className={styles.chip}>Draft</span>;
    if (agreement.status === "proposed") {
      const waiting = real.find((m) => !agreement.signed_by.includes(m.user_id));
      return (
        <span className={`${styles.chip} ${styles.chipWaiting}`}>
          Awaiting {waiting?.name ?? "signature"}
        </span>
      );
    }
    const since = agreement.proposed_at ?? agreement.updated_at;
    return (
      <span className={`${styles.chip} ${styles.chipActive}`}>
        In force since{" "}
        {new Date(since).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
    );
  };
  const pendingFor = (agreement?: Agreement) =>
    !agreement
      ? 0
      : (agreement.status === "proposed" &&
        !agreement.signed_by.includes(uid)
          ? 1
          : 0) +
        controller.amendments.filter(
          (a) =>
            a.agreement_id === agreement.id &&
            a.status === "open" &&
            a.proposed_by !== uid,
        ).length +
        controller.events.filter(
          (e) =>
            e.agreement_id === agreement.id &&
            e.status === "open" &&
            e.actor !== uid,
        ).length;
  return (
    <section className={`panel settings-panel ${styles.section}`}>
      <h2>
        <Handshake size={20} /> Agreements
      </h2>
      <p className="subtle">
        The house rules you both sign, kept where the arguments can find them.
      </p>
      {/* The open view surfaces the same error next to its actions. */}
      {controller.error && !open && (
        <p className="error" role="alert">
          {controller.error}
        </p>
      )}
      {controller.loading ? (
        <p className="subtle">Opening the agreements…</p>
      ) : open ? (
        <>
          <div className={styles.backBar}>
            <Button className="text-button" onClick={() => setOpen(null)}>
              <ArrowLeft size={14} /> All agreements
            </Button>
          </div>
          <AgreementView
            slug={open}
            controller={controller}
            members={real}
            uid={uid}
            entries={entries}
            refreshEntries={refreshEntries}
          />
        </>
      ) : (
        <div className={styles.rows}>
          {CARDS.map((card) => {
            const agreement = controller.agreements.find(
              (a) => a.slug === card.slug,
            );
            const pending = pendingFor(agreement);
            return (
              <Button
                key={card.slug}
                className={styles.row}
                onClick={() => setOpen(card.slug)}
              >
                <span className={styles.rowCopy}>
                  <strong>{AGREEMENT_TITLES[card.slug]}</strong>
                  <small className="subtle">{card.subtitle}</small>
                </span>
                {pending > 0 && (
                  <span
                    className={styles.count}
                    aria-label={`${pending} waiting on you`}
                  >
                    {pending}
                  </span>
                )}
                {chip(agreement)}
                <ChevronRight size={16} />
              </Button>
            );
          })}
        </div>
      )}
    </section>
  );
}
