"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgreementsContext } from "./agreements-context";
import AgreementView, { AGREEMENT_TITLES } from "./agreement-view";
import type { Entry, Member } from "@/lib/model";
import type { Agreement, AgreementSlug } from "@/lib/agreements";
import SearchField from "./search-field";
import { matchesSearch } from "@/lib/search";
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
  const section = useRef<HTMLElement>(null);
  const controller = useAgreementsContext();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<AgreementSlug | null>(null);
  useEffect(() => {
    const sync = () => {
      const slug = new URL(window.location.href).searchParams.get("agreement");
      setOpen(slug === "house" || slug === "gym" ? slug : null);
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("household-agreement-target", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("household-agreement-target", sync);
    };
  }, []);
  useEffect(() => {
    if (!open || controller?.loading) return;
    section.current?.focus({ preventScroll: true });
    section.current?.scrollIntoView({ block: "start" });
  }, [open, controller?.loading]);
  function selectAgreement(slug: AgreementSlug | null) {
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set("agreement", slug);
    else url.searchParams.delete("agreement");
    if (url.href !== window.location.href)
      window.history.pushState(null, "", url);
    setOpen(slug);
  }
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
      const waiting = real.find(
        (m) => !agreement.signed_by.includes(m.user_id),
      );
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
      : (agreement.status === "proposed" && !agreement.signed_by.includes(uid)
          ? 1
          : 0) +
        controller.amendments.filter(
          (a) =>
            a.agreement_id === agreement.id &&
            a.status === "open" &&
            a.proposed_by !== uid &&
            !a.approved_by?.includes(uid),
        ).length +
        controller.events.filter(
          (e) =>
            e.agreement_id === agreement.id &&
            e.status === "open" &&
            e.actor !== uid &&
            !e.accepted_by?.includes(uid) &&
            (!e.details.recipient || e.details.recipient === uid),
        ).length;
  return (
    <section
      ref={section}
      tabIndex={-1}
      className={`panel settings-panel ${styles.section}`}
    >
      <h2>
        <Handshake size={20} /> Agreements
      </h2>
      <p className="subtle">
        The house rules everyone signs, kept where the arguments can find them.
      </p>
      {!open && (
        <SearchField
          label="Search agreements"
          value={query}
          onChange={setQuery}
        />
      )}
      {controller.nextCursor && (
        <Button
          className="button secondary small"
          disabled={controller.loadingMore}
          onClick={() => void controller.loadMoreHistory()}
        >
          {controller.loadingMore
            ? "Loading older agreement history…"
            : "Load older agreement history"}
        </Button>
      )}
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
            <Button
              className="text-button"
              onClick={() => selectAgreement(null)}
            >
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
          {query &&
            !CARDS.some((card) => {
              const a = controller.agreements.find((a) => a.slug === card.slug);
              return matchesSearch(
                query,
                AGREEMENT_TITLES[card.slug],
                card.subtitle,
                a?.terms,
                controller.amendments.filter((m) => m.agreement_id === a?.id),
                controller.events.filter((e) => e.agreement_id === a?.id),
              );
            }) && <p className="subtle">No matching agreements.</p>}
          {CARDS.map((card) => {
            const agreement = controller.agreements.find(
              (a) => a.slug === card.slug,
            );
            const amendments = controller.amendments.filter(
              (a) => a.agreement_id === agreement?.id,
            );
            const events = controller.events.filter(
              (e) => e.agreement_id === agreement?.id,
            );
            if (
              !matchesSearch(
                query,
                AGREEMENT_TITLES[card.slug],
                card.subtitle,
                agreement?.terms,
                amendments,
                events,
              )
            )
              return null;
            const pending = pendingFor(agreement);
            return (
              <Button
                key={card.slug}
                className={styles.row}
                onClick={() => selectAgreement(card.slug)}
              >
                <span className={styles.rowCopy}>
                  <strong>{AGREEMENT_TITLES[card.slug]}</strong>
                  <small className="subtle">{card.subtitle}</small>
                  {query &&
                    amendments
                      .filter((a) =>
                        matchesSearch(query, a.title, a.body, a.terms_patch),
                      )
                      .map((a) => (
                        <small key={a.id}>
                          {a.title}: {a.body}
                        </small>
                      ))}
                  {query &&
                    events
                      .filter((e) => matchesSearch(query, e.kind, e.details))
                      .map((e) => (
                        <small key={e.id}>
                          {e.kind.replaceAll("_", " ")} — {e.status}
                        </small>
                      ))}
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
