"use client";
import { coverageSuggestions } from "@/lib/improvements";
import type { Entry, Member } from "@/lib/model";
import type { ImprovementsController } from "@/lib/use-improvements";
import { Button } from "./ui/button";
export default function ChoreCoverage({
  entries,
  members,
  uid,
  controller,
  refresh,
}: {
  entries: Entry[];
  members: Member[];
  uid: string | null;
  controller: ImprovementsController;
  refresh: (quiet?: boolean) => void;
}) {
  const requests = controller.coverage.filter((r) => r.status === "open");
  const suggestions = coverageSuggestions(entries, members).filter(
    ({ entry }) => !requests.some((r) => r.entry_id === entry.id),
  );
  if (!suggestions.length && !requests.length) return null;
  const name = (id: string) =>
    members.find((m) => m.user_id === id)?.name ?? "Housemate";
  return (
    <section className="panel coverage-panel">
      <h2>Coverage while someone is away</h2>
      <p className="subtle">
        Suggestions keep the current rotation. Both involved housemates agree
        before one occurrence changes.
      </p>
      {suggestions.map(({ entry, candidate }) => (
        <div className="coverage-row" key={entry.id}>
          <p>
            <strong>{entry.title}</strong> · {entry.date}
            <br />
            {name(entry.assignee!)} is away.{" "}
            {candidate
              ? `${candidate.name} is available.`
              : "Everyone is away; choose another date in the chore editor."}
          </p>
          {candidate &&
            uid &&
            [entry.assignee, candidate.user_id].includes(uid) && (
              <Button
                className="button secondary small"
                disabled={controller.busy}
                onClick={() =>
                  void controller.requestCoverage(entry.id, candidate.user_id)
                }
              >
                Request coverage
              </Button>
            )}
        </div>
      ))}
      {requests.map((r) => (
        <div className="coverage-row" key={r.id}>
          <p>
            <strong>
              {entries.find((e) => e.id === r.entry_id)?.title ?? "Chore"}
            </strong>{" "}
            · {r.date}
            <br />
            {name(r.candidate)} covering for {name(r.original)}. Awaiting{" "}
            {name(r.requester === r.original ? r.candidate : r.original)}.
          </p>
          {uid &&
            uid !== r.requester &&
            [r.original, r.candidate].includes(uid) && (
              <div>
                <Button
                  className="button secondary small"
                  disabled={controller.busy}
                  onClick={async () => {
                    if (await controller.decideCoverage(r.id, true))
                      refresh(true);
                  }}
                >
                  Approve coverage
                </Button>{" "}
                <Button
                  className="text-button"
                  disabled={controller.busy}
                  onClick={() => void controller.decideCoverage(r.id, false)}
                >
                  Decline
                </Button>
              </div>
            )}
        </div>
      ))}
      {controller.error && (
        <p className="error" role="alert">
          {controller.error}
        </p>
      )}
    </section>
  );
}
