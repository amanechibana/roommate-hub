"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { homeRequest } from "./home-client";
import {
  bookingsOverlap,
  emptyPlanning,
  moveTitles,
  weeklyItems,
  type Planning,
} from "./coordination";
import { dateKey, type Entry } from "./model";
export function useCoordination({
  demo,
  entries = [],
  uid,
}: {
  demo: boolean;
  entries?: Entry[];
  uid: string | null;
}) {
  const [data, setData] = useState<Planning>(() => emptyPlanning(entries));
  const [loaded, setLoaded] = useState(demo),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const writing = useRef(false),
    generation = useRef(0);
  const refresh = useCallback(async () => {
    if (demo || writing.current) return;
    const version = generation.current;
    try {
      const next = await homeRequest("/api/coordination");
      if (version === generation.current) {
        setData(next);
        setError("");
      }
    } catch (err) {
      if (version === generation.current) setError((err as Error).message);
    } finally {
      if (version === generation.current) setLoaded(true);
    }
  }, [demo]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
      generation.current++;
    };
  }, [refresh]);
  async function run(operation: string, payload: Record<string, unknown>) {
    if (writing.current || !uid) return false;
    writing.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const id = crypto.randomUUID();
        if (operation === "book") {
          const booking = {
            id,
            member: uid,
            resource_id: String(payload.resource_id),
            starts_at: String(payload.starts_at),
            ends_at: String(payload.ends_at),
            notes: String(payload.notes || ""),
          };
          if (
            new Date(booking.starts_at) < new Date() ||
            new Date(booking.ends_at) <= new Date(booking.starts_at) ||
            +new Date(booking.ends_at) - +new Date(booking.starts_at) > 86400000
          )
            throw Error("Choose a future booking lasting at most 24 hours.");
          if (
            data.bookings.some(
              (b) =>
                b.resource_id === booking.resource_id &&
                bookingsOverlap(b, booking),
            )
          )
            throw Error("That resource is already booked during this time.");
          setData((d) => ({ ...d, bookings: [...d.bookings, booking] }));
        } else
          setData((d) => {
            if (operation === "resource")
              return {
                ...d,
                resources: [...d.resources, { id, name: String(payload.name) }],
              };
            if (operation === "cancel_booking")
              return {
                ...d,
                bookings: d.bookings.filter((b) => b.id !== payload.id),
              };
            if (operation === "checkin")
              return {
                ...d,
                checkin: {
                  notes: String(payload.notes || ""),
                  reviewed_by: uid,
                  reviewed_at: new Date().toISOString(),
                },
              };
            if (operation === "decision")
              return {
                ...d,
                decisions: [
                  ...d.decisions,
                  { id, title: String(payload.title) },
                ],
              };
            if (operation === "resolve_decision")
              return {
                ...d,
                decisions: d.decisions.filter((x) => x.id !== payload.id),
              };
            if (operation === "move")
              return {
                ...d,
                moves: [
                  ...d.moves,
                  {
                    id,
                    member: String(payload.member),
                    direction: payload.direction as "in" | "out",
                    date: String(payload.date),
                    items: moveTitles.map((title) => ({
                      title,
                      done: false,
                      notes: "",
                    })),
                  },
                ],
              };
            if (operation === "move_item")
              return {
                ...d,
                moves: d.moves.map((m) =>
                  m.id === payload.id
                    ? {
                        ...m,
                        items: m.items.map((item, i) =>
                          i === payload.index
                            ? {
                                ...item,
                                done: payload.done === true,
                                notes: String(payload.notes || ""),
                              }
                            : item,
                        ),
                      }
                    : m,
                ),
              };
            return d;
          });
      } else {
        await homeRequest("/api/coordination", "POST", { operation, payload });
        writing.current = false;
        await refresh();
      }
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  return {
    data: demo
      ? { ...data, ...weeklyItems(entries, dateKey(new Date())) }
      : data,
    loaded,
    busy,
    error,
    run,
    refresh,
  };
}
