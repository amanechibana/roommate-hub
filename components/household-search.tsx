"use client";
import { useEffect, useState, useRef } from "react";
import { Search, X } from "lucide-react";
import { PaperDialog } from "./ui/dialog";
import { Button } from "./ui/button";
import SearchField from "./search-field";
import { homeRequest } from "@/lib/home-client";
import { useHandbook } from "@/lib/use-handbook";
import {
  searchEntries,
  type HouseholdSearchResult,
} from "@/lib/household-search";
import { matchesSearch } from "@/lib/search";
import type { Entry, Member } from "@/lib/model";
import type { Expense } from "@/lib/expenses";
import type { Tab } from "@/lib/household-config";
import styles from "./household-search.module.css";
export default function HouseholdSearch({
  demo,
  entries,
  members,
  expenses,
  onClose,
  onOpen,
}: {
  demo: boolean;
  entries: Entry[];
  members: Member[];
  expenses: Expense[];
  onClose: () => void;
  onOpen: (result: HouseholdSearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HouseholdSearchResult[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<HouseholdSearchResult | null>(null);
  const handbook = useHandbook({ demo, enabled: demo });
  useEffect(() => {
    let active = true;
    setResults([]);
    setNext(null);
    setError("");
    setSelected(null);
    if (query.trim().length < 2) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        if (demo) {
          const extra: HouseholdSearchResult[] = [
            ...expenses.map((e) => ({
              key: `expense:${e.id}`,
              tab: "Expenses" as Tab,
              title: e.title,
              detail: `${e.date} · $${(e.amount_cents / 100).toFixed(2)}`,
            })),
            ...handbook.entries.map((h) => ({
              key: `handbook:${h.id}`,
              tab: "House handbook" as Tab,
              title: h.title,
              detail: `${h.value}\n${h.notes}`,
            })),
          ];
          if (active)
            setResults([
              ...searchEntries(query, entries, members),
              ...extra.filter((r) => matchesSearch(query, r.title, r.detail)),
            ]);
        } else {
          const data = await homeRequest(
            `/api/search?q=${encodeURIComponent(query.trim())}`,
          );
          if (active) {
            setResults(data.results);
            setNext(data.next_offset);
          }
        }
      } catch (err) {
        if (active) setError((err as Error).message);
      } finally {
        if (active) setBusy(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, demo, entries, members, expenses, handbook.entries]);
  // Query changes unmount the pagination request owner, so late pages cannot mix.
  return (
    <PaperDialog onClose={onClose} aria-labelledby="house-search-title">
      <div className="dialog-heading">
        <h2 id="house-search-title">
          <Search size={20} /> Search the household
        </h2>
        <Button
          className="icon-button"
          aria-label="Close search"
          onClick={onClose}
        >
          <X size={20} />
        </Button>
      </div>
      <SearchField
        label="Search all household records"
        value={query}
        onChange={setQuery}
      />
      <p className="subtle">
        Chores, plans, shopping, notes, expenses, handbook, agreements and
        household tools, including older records.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p role="status" className="subtle">
        {busy
          ? "Searching…"
          : query.trim().length < 2
            ? "Type at least two characters."
            : !results.length && !error
              ? "No household records match."
              : `${results.length} results${next !== null ? " so far" : ""}`}
      </p>
      {selected ? (
        <section className={styles.detail}>
          <h3>{selected.title}</h3>
          <p>{selected.detail || "No additional details."}</p>
          <div className={styles.actions}>
            <Button
              className="button secondary small"
              onClick={() => setSelected(null)}
            >
              Back to results
            </Button>
            <Button className="button small" onClick={() => onOpen(selected)}>
              Open {selected.tab}
            </Button>
          </div>
        </section>
      ) : (
        <ul className={styles.results}>
          {results.map((r) => (
            <li key={r.key}>
              <Button className={styles.result} onClick={() => setSelected(r)}>
                <small>
                  {r.tab}
                  {r.entry?.done ? " · Completed" : ""}
                  {r.entry?.category === "Personal" ? " · Personal" : ""}
                </small>
                <strong>{r.title}</strong>
                <span>{r.detail.slice(0, 180)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {next !== null && !selected && (
        <MoreResults
          key={query}
          query={query}
          offset={next}
          onPage={(data) => {
            setResults((current) => [...current, ...data.results]);
            setNext(data.next_offset);
          }}
        />
      )}
    </PaperDialog>
  );
}
function MoreResults({
  query,
  offset,
  onPage,
}: {
  query: string;
  offset: number;
  onPage: (data: {
    results: HouseholdSearchResult[];
    next_offset: number | null;
  }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  return (
    <>
      <Button
        className="button secondary small"
        disabled={busy}
        onClick={async () => {
          const version = generation.current;
          setBusy(true);
          setError("");
          try {
            const data = await homeRequest(
              `/api/search?q=${encodeURIComponent(query.trim())}&offset=${offset}`,
            );
            if (version === generation.current) onPage(data);
          } catch (err) {
            if (version === generation.current)
              setError((err as Error).message);
          } finally {
            if (version === generation.current) setBusy(false);
          }
        }}
      >
        {busy ? "Loading…" : "More results"}
      </Button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}
