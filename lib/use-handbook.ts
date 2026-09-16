"use client";

import { homeRequest } from "@/lib/home-client";
import {
  type HandbookEntry,
  type HandbookFile,
  type HandbookSection,
} from "@/lib/handbook";
import { useCallback, useEffect, useRef, useState } from "react";

export type HandbookValues = {
  section: HandbookSection;
  title: string;
  value: string;
  notes: string;
};

export const sampleEntries: HandbookEntry[] = [
  {
    id: "demo-wifi",
    household_id: "demo",
    section: "wifi",
    title: "Home Wi-Fi",
    value: "Network: CommonGround\nPassword: welcome-home",
    notes: "Router is on the shelf beside the TV.",
    sort_order: 0,
    created_by: "you",
    updated_by: "you",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "demo-trash",
    household_id: "demo",
    section: "trash",
    title: "Collection",
    value: "Trash: Tuesday & Friday\nRecycling: Friday",
    notes: "Set bags at the curb after 8pm the night before.",
    sort_order: 0,
    created_by: "you",
    updated_by: "you",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

export function useHandbook({
  enabled,
  demo,
}: {
  enabled: boolean;
  demo: boolean;
}) {
  const [entries, setEntries] = useState<HandbookEntry[]>(
    demo ? sampleEntries : [],
  );
  const [files, setFiles] = useState<HandbookFile[]>([]);
  const [filesEnabled, setFilesEnabled] = useState(false);
  const [loaded, setLoaded] = useState(demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  const refresh = useCallback(
    async (quiet = false) => {
      if (!enabled || demo || busyRef.current) return;
      try {
        const result = await homeRequest("/api/handbook");
        setEntries(result.entries || []);
        setFiles(result.files || []);
        setFilesEnabled(result.files_enabled === true);
        setError("");
      } catch (err) {
        if (!quiet) setError((err as Error).message);
      } finally {
        setLoaded(true);
      }
    },
    [demo, enabled],
  );

  useEffect(() => {
    if (demo) {
      setEntries(sampleEntries);
      setLoaded(true);
      return;
    }
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, 15_000);
    const focus = () => void refresh(true);
    window.addEventListener("focus", focus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [demo, enabled, refresh]);

  async function run<T>(work: () => Promise<T>) {
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      return await work();
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function save(values: HandbookValues, entry?: HandbookEntry) {
    if (demo) {
      const now = new Date().toISOString();
      const next: HandbookEntry = entry
        ? { ...entry, ...values, updated_at: now }
        : {
            ...values,
            id: crypto.randomUUID(),
            household_id: "demo",
            sort_order: entries.filter(
              (item) => item.section === values.section,
            ).length,
            created_by: "you",
            updated_by: "you",
            created_at: now,
            updated_at: now,
          };
      setEntries((current) =>
        entry
          ? current.map((item) => (item.id === entry.id ? next : item))
          : [...current, next],
      );
      return;
    }
    await run(async () => {
      const result = await homeRequest("/api/handbook", "POST", {
        operation: entry ? "update" : "create",
        payload: entry
          ? { id: entry.id, ...values, sort_order: entry.sort_order }
          : { ...values, sort_order: entries.length },
      });
      setEntries((current) =>
        entry
          ? current.map((item) => (item.id === entry.id ? result.entry : item))
          : [...current, result.entry],
      );
    });
  }

  async function remove(entry: HandbookEntry) {
    if (demo) {
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setFiles((current) =>
        current.filter((file) => file.entry_id !== entry.id),
      );
      return;
    }
    await run(async () => {
      await homeRequest("/api/handbook", "POST", {
        operation: "delete",
        payload: { id: entry.id },
      });
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setFiles((current) =>
        current.filter((file) => file.entry_id !== entry.id),
      );
    });
  }

  async function upload(entry: HandbookEntry, file: File) {
    await run(async () => {
      const form = new FormData();
      form.set("entry_id", entry.id);
      form.set("file", file);
      const response = await fetch("/api/handbook/files", {
        method: "POST",
        body: form,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Could not attach file.");
      setFiles((current) => [...current, result.file]);
    });
  }

  async function removeFile(file: HandbookFile) {
    await run(async () => {
      const response = await fetch("/api/handbook/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Could not remove that file.");
      setFiles((current) => current.filter((item) => item.id !== file.id));
    });
  }

  return {
    entries,
    files,
    filesEnabled,
    loaded,
    busy,
    error,
    setError,
    refresh,
    save,
    remove,
    upload,
    removeFile,
  };
}
