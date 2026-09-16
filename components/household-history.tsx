"use client";
import { useState } from "react";
import { homeRequest } from "@/lib/home-client";
import type { Entry } from "@/lib/model";
import { Button } from "./ui/button";
export default function HouseholdHistory() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      const result = await homeRequest(
        "/api/home/history" +
          (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
      );
      setEntries((current) => [
        ...new Map<string, Entry>(
          [...current, ...result.entries].map((e: Entry) => [e.id, e]),
        ).values(),
      ]);
      setCursor(result.next_cursor);
    } catch {
      setError("Could not load history. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel">
      <h2>Household history</h2>
      <p className="subtle">
        Older bought shopping, completed items, and past plans stay saved here.
        Current lists load separately.
      </p>
      {entries.map((e) => (
        <p key={e.id}>
          <strong>{e.title}</strong> — {e.category},{" "}
          {e.date || e.created_at.slice(0, 10)}
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
      {cursor !== null && (
        <Button
          disabled={busy}
          className="button secondary small"
          onClick={() => void load()}
        >
          {cursor === undefined ? "Browse history" : "Load older items"}
        </Button>
      )}
      {cursor === null && <p className="subtle">End of history.</p>}
    </section>
  );
}
