"use client";
import { useEffect, useState } from "react";
import { homeRequest } from "@/lib/home-client";
import { Button } from "./ui/button";
type Run = {
  edition: "morning" | "evening";
  date: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  sent: number;
  failed: number;
  attempts: number;
};
export default function HouseholdReliability({
  readOnly,
}: {
  readOnly: boolean;
}) {
  const [status, setStatus] = useState<{
    attachments_enabled: boolean;
    schema_version: string;
    reminders: Run[];
    custom_reminders?: Run[];
    timezone?: string;
    schedules: { kind: string; through_date: string }[];
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    try {
      setStatus(await homeRequest("/api/household-status"));
      setError("");
    } catch {
      setError(
        "Household status unavailable. Check pending database migrations.",
      );
    }
  };
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => clearInterval(timer);
  }, []);
  const retry = async (edition: Run["edition"]) => {
    setBusy(true);
    try {
      await homeRequest("/api/household-status", "POST", { edition });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="panel settings-panel"
      aria-label="Household reliability"
    >
      <h2>Household reliability</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <>
          <p>
            Handbook attachments:{" "}
            <strong>{status.attachments_enabled ? "on" : "off"}</strong>
          </p>
          {!status.attachments_enabled && (
            <p className="subtle">
              Text entries still work. Attachments need a server-only storage
              key configured in Vercel.
            </p>
          )}
          <h3>Scheduled reminders</h3>
          <p className="subtle">
            The scheduler checks every five minutes. Your chosen morning and
            evening times use the household timezone and respect quiet hours.
            Delivery can follow the selected time by up to five minutes.
          </p>
          {!status.reminders.length && !status.custom_reminders?.length && (
            <p className="subtle">No scheduled delivery recorded yet.</p>
          )}
          {[
            ...new Map(
              [...status.reminders, ...(status.custom_reminders ?? [])].map(
                (run) => [run.edition, run],
              ),
            ).values(),
          ].map((run) => {
            const interrupted =
              run.status === "sending" &&
              Date.now() - Date.parse(run.started_at) > 120000;
            return (
              <div key={run.edition}>
                <p>
                  <strong>
                    {run.edition === "morning" ? "Morning" : "Evening"}
                  </strong>
                  : {interrupted ? "interrupted / not confirmed" : run.status} —{" "}
                  {run.sent} sent, {run.failed} failed ({run.date})
                </p>
                <p className="subtle">
                  Last attempt:{" "}
                  {new Date(run.finished_at || run.started_at).toLocaleString(
                    "en-US",
                    { timeZone: status.timezone || "America/New_York" },
                  )}{" "}
                  {status.timezone || "America/New_York"}; {run.attempts}{" "}
                  attempt(s).
                </p>
                {!readOnly &&
                  (["failed", "partial"].includes(run.status) ||
                    interrupted) && (
                    <Button
                      className="button secondary small"
                      disabled={busy}
                      onClick={() => void retry(run.edition)}
                    >
                      Retry {run.edition} delivery
                    </Button>
                  )}
              </div>
            );
          })}
          <p className="subtle">
            Schema {status.schema_version}. Active schedule horizons:{" "}
            {status.schedules
              .map((s) => `${s.kind} through ${s.through_date}`)
              .join("; ") || "none activated"}
            .
          </p>
        </>
      )}
    </section>
  );
}
