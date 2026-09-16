"use client";
import { readOffline } from "@/lib/offline";
import { sampleEntries } from "@/lib/use-handbook";
import type { Expense } from "@/lib/expenses";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "./ui/button";
import { PaperDialog } from "./ui/dialog";
import SearchField from "./search-field";
import { matchesSearch } from "@/lib/search";
import { homeRequest } from "@/lib/home-client";
import { kindTabs, type Tab } from "@/lib/household-config";
import type { Entry } from "@/lib/model";
type Result = {
  id: string;
  title: string;
  detail: string;
  tab: Tab;
  type: string;
};
export default function GlobalSearch({
  entries,
  expenses,
  demo,
  setTab,
  onEntry,
}: {
  entries: Entry[];
  expenses: Expense[];
  demo: boolean;
  setTab: (tab: Tab) => void;
  onEntry: (entry: Entry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setError("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      if (demo || !navigator.onLine) {
        const saved = readOffline();
        const ledger: Expense[] = demo
          ? expenses
          : [
              ...new Map(
                Object.entries(saved.cache)
                  .filter(([key]) => key.startsWith("/api/expenses"))
                  .flatMap(([, value]: [string, any]) => value.expenses ?? [])
                  .map((item: Expense) => [item.id, item] as const),
              ).values(),
            ];
        const handbook = demo
          ? sampleEntries
          : ((saved.cache["/api/handbook"] as any)?.entries ?? []);
        const records: Result[] = [
          ...entries.map((e) => ({
            id: e.id,
            title: e.title,
            detail: [
              e.description,
              e.category,
              e.store,
              e.unit,
              JSON.stringify(e.checklist ?? []),
            ]
              .filter(Boolean)
              .join(" "),
            tab: kindTabs[e.kind],
            type: e.kind,
          })),
          ...ledger.map((e) => ({
            id: e.id,
            title: e.title,
            detail: [e.category, e.date].join(" "),
            tab: "Expenses" as const,
            type: "expense",
          })),
          ...handbook.map((e: any) => ({
            id: e.id,
            title: e.title,
            detail: [e.value, e.notes, e.section].join(" "),
            tab: "House handbook" as const,
            type: "handbook",
          })),
        ];
        setResults(
          records.filter((r) => matchesSearch(query, r.title, r.detail)),
        );
        setError(
          navigator.onLine
            ? ""
            : "Offline: searching saved household records. Reconnect to include records not saved on this device.",
        );
        setLoading(false);
        return;
      }
      try {
        const data = await homeRequest(
          `/api/search?q=${encodeURIComponent(query.trim())}`,
        );
        if (!cancelled) setResults(data.results);
      } catch (e) {
        if (!cancelled) {
          setResults([]);
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, entries, expenses, demo]);
  return (
    <>
      <Button
        className="icon-button"
        aria-label="Search across the household"
        onClick={() => setOpen(true)}
      >
        <Search size={18} />
      </Button>
      {open && (
        <PaperDialog
          onClose={() => setOpen(false)}
          className="entry-dialog global-search-dialog"
          aria-labelledby="global-search-title"
        >
          <div className="dialog-heading">
            <h2 id="global-search-title">Search your household</h2>
            <Button
              className="icon-button"
              aria-label="Close household search"
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </Button>
          </div>
          <SearchField
            label="Search chores, notes, expenses and handbook"
            value={query}
            onChange={setQuery}
          />
          {loading && <p role="status">Searching…</p>}
          {error && <p role="status">{error}</p>}
          {!loading &&
            query.trim().length >= 2 &&
            !results.length &&
            !error && <p>No matching records.</p>}
          {results.slice(0, 50).map((result) => (
            <Button
              key={`${result.type}-${result.id}`}
              className="search-result"
              onClick={async () => {
                sessionStorage.setItem(
                  "household-search-target",
                  JSON.stringify(result),
                );
                setTab(result.tab);
                window.dispatchEvent(new Event("household-search-result"));
                const entry = entries.find((e) => e.id === result.id);
                if (entry) onEntry(entry);
                else if (
                  ["task", "event", "request", "note"].includes(result.type)
                ) {
                  try {
                    const data = await homeRequest(
                      `/api/home?id=${encodeURIComponent(result.id)}`,
                    );
                    onEntry(data.entry);
                  } catch (e) {
                    setError((e as Error).message);
                    return;
                  }
                }
                setOpen(false);
              }}
            >
              <strong>{result.title}</strong>
              <small>
                {result.tab} · {result.detail.slice(0, 180)}
              </small>
            </Button>
          ))}
          {results.length > 50 && (
            <p className="subtle">
              Showing the first 50 matches. Add another word to narrow your
              search.
            </p>
          )}
        </PaperDialog>
      )}
    </>
  );
}
