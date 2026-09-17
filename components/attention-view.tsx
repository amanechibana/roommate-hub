"use client";
import { attentionItems } from "@/lib/attention";
import { billShare, shareMoney } from "@/lib/household-actions";
import { useHouseholdClock } from "@/lib/household-clock";
import { parseDate, type Entry } from "@/lib/model";
import type { Tab } from "@/lib/household-config";
import type { AgreementsController } from "@/lib/use-agreements";
import type { ImprovementsController } from "@/lib/use-improvements";
import { Button } from "./ui/button";

export default function AttentionView({
  entries,
  uid,
  agreements,
  improvements,
  busy,
  onOpen,
  onToggle,
  onPay,
  onNavigate,
  refresh,
}: {
  entries: Entry[];
  uid: string | null;
  agreements: AgreementsController;
  improvements: ImprovementsController;
  busy: boolean;
  onOpen: (entry: Entry) => void;
  onToggle: (entry: Entry) => void;
  onPay: (entry: Entry) => void;
  onNavigate: (tab: Tab) => void;
  refresh: (quiet?: boolean) => void;
}) {
  const { today, timezone } = useHouseholdClock();
  const items = attentionItems({
    entries,
    uid,
    today,
    agreements: agreements.agreements,
    amendments: agreements.amendments,
    events: agreements.events,
    coverage: improvements.coverage,
  });
  if (!uid)
    return (
      <section className="panel attention-panel">
        <p>Select a person to see what needs their attention.</p>
      </section>
    );
  const incomplete = agreements.loading || !improvements.loaded;
  const unavailable = agreements.error || improvements.error;
  const dateLabel = (date: string | null) =>
    !date
      ? "No due date"
      : date < today
        ? `Overdue · ${parseDate(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
        : date === today
          ? "Due today"
          : `Upcoming · ${parseDate(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  return (
    <section
      className="panel attention-panel"
      aria-label="Personal attention list"
    >
      {incomplete && (
        <p role="status">Loading agreements and coverage requests…</p>
      )}
      {unavailable && (
        <div role="alert">
          <p className="error">
            Some requests could not be loaded. This list may be incomplete.
          </p>
          <Button
            className="button secondary small"
            onClick={() => {
              void agreements.refresh();
              void improvements.refresh();
            }}
          >
            Retry requests
          </Button>
        </div>
      )}
      {!items.length && !incomplete && !unavailable && (
        <p>You’re all caught up. Nothing needs your attention.</p>
      )}
      <ul className="attention-list">
        {items.map((item) => (
          <li className="attention-row" key={`${item.kind}:${item.id}`}>
            <div>
              <strong>{item.title}</strong>
              <p className="subtle">
                {item.kind === "agreement"
                  ? item.reason
                  : `${item.kind === "chore" ? "To-do" : item.kind === "bill" ? "Unpaid bill" : "Coverage approval"} · ${dateLabel(item.date)}`}
                {item.kind === "bill" && billShare(item.entry, uid) != null
                  ? ` · Your share ${shareMoney(billShare(item.entry, uid)!)}`
                  : ""}
                {item.kind === "coverage"
                  ? ` · ${item.request.candidate === uid ? "You would cover this chore" : "Someone would cover your chore"}`
                  : ""}
              </p>
            </div>
            <div className="attention-actions">
              {(item.kind === "chore" || item.kind === "bill") && (
                <>
                  <Button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => onOpen(item.entry)}
                  >
                    Review
                  </Button>
                  <Button
                    className="button small"
                    disabled={busy}
                    onClick={() =>
                      item.kind === "chore"
                        ? onToggle(item.entry)
                        : onPay(item.entry)
                    }
                  >
                    {item.kind === "chore" ? "Mark done" : "Mark my share paid"}
                  </Button>
                </>
              )}
              {item.kind === "agreement" && (
                <Button
                  className="button secondary small"
                  onClick={() => {
                    onNavigate("Our household");
                    const url = new URL(window.location.href);
                    url.searchParams.set("agreement", item.slug);
                    window.history.replaceState(null, "", url);
                    window.dispatchEvent(
                      new Event("household-agreement-target"),
                    );
                  }}
                >
                  Review agreement
                </Button>
              )}
              {item.kind === "coverage" && (
                <>
                  <Button
                    className="button secondary small"
                    disabled={improvements.busy}
                    onClick={async () => {
                      if (await improvements.decideCoverage(item.id, true))
                        refresh(true);
                    }}
                  >
                    Approve coverage
                  </Button>
                  <Button
                    className="text-button"
                    disabled={improvements.busy}
                    onClick={() =>
                      void improvements.decideCoverage(item.id, false)
                    }
                  >
                    Decline
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="subtle">
        Dates follow {timezone}. Showing your open to-dos and unpaid bill
        shares, including upcoming ones, plus requests waiting for your
        decision.
      </p>
    </section>
  );
}
