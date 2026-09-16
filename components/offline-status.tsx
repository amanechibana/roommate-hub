"use client";
import { useEffect, useState } from "react";
import { flushOffline } from "@/lib/home-client";
import { readOffline, writeOffline } from "@/lib/offline";
import { Button } from "./ui/button";
export default function OfflineStatus({ demo }: { demo: boolean }) {
  const [online, setOnline] = useState(true);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  useEffect(() => {
    if (demo) return;
    const update = () => {
      setOnline(navigator.onLine);
      const state = readOffline();
      setCount(state.queue.length);
      setError(state.error);
    };
    const reconnect = () => {
      update();
      void flushOffline();
    };
    update();
    void flushOffline();
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js")
        .then(async () => {
          const registration = await navigator.serviceWorker.ready;
          registration.active?.postMessage({
            type: "save-shell-assets",
            urls: performance
              .getEntriesByType("resource")
              .map((r) => r.name)
              .filter((name) =>
                name.startsWith(location.origin + "/_next/static/"),
              ),
          });
        })
        .catch(() => {});
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", update);
    window.addEventListener("household-offline-status", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", update);
      window.removeEventListener("household-offline-status", update);
      window.removeEventListener("storage", update);
    };
  }, [demo]);
  if (demo || (online && !count && !error)) return null;
  return (
    <div className="offline-banner" role="status">
      <span>
        {online ? "Connected" : "Offline · showing saved household information"}
        {count
          ? ` · ${count} change${count === 1 ? "" : "s"} waiting to sync`
          : ""}
        {error ? ` · ${error}` : ""}
      </span>
      {count > 0 && (
        <>
          <Button
            className="text-button"
            disabled={!online}
            onClick={() => void flushOffline()}
          >
            Retry sync
          </Button>
          <Button className="text-button" onClick={() => setReview(!review)}>
            Review queued changes
          </Button>
        </>
      )}
      {review && (
        <div>
          {readOffline().queue.map((change) => (
            <div className="coverage-row" key={change.id}>
              <span>
                {change.body.operation} ·{" "}
                {String(
                  change.body.payload.title ||
                    change.body.payload.id ||
                    "household record",
                )}
              </span>
              <Button
                className="text-button danger"
                onClick={() => {
                  const state = readOffline();
                  state.queue = state.queue.filter(
                    (item) => item.id !== change.id,
                  );
                  state.error = "";
                  state.cache = {};
                  writeOffline(state);
                  if (!state.queue.length && navigator.onLine)
                    window.dispatchEvent(new Event("household-offline-synced"));
                }}
              >
                Discard change
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
