"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { saveStatus } from "@/lib/save-status";

export function SaveStatus({ demo }: { demo: boolean }) {
  const status = useSyncExternalStore(
    saveStatus.subscribe,
    saveStatus.getSnapshot,
    saveStatus.getServerSnapshot,
  );
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (demo) return null;
  const message = offline
    ? "Offline — changes can’t be saved"
    : status.pending
      ? "Saving…"
      : status.failed
        ? "Couldn’t save — try your change again"
        : status.saved
          ? "All changes saved"
          : "";
  return (
    <span
      className="save-status"
      data-error={offline || status.failed || undefined}
      role="status"
      aria-live="polite"
    >
      {message}
    </span>
  );
}
