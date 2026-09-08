"use client";
import { useEffect, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasDatabase } from "./home-client";

// Identifies this tab in write requests so its own change pings can be
// ignored; a successful write already updated the local state.
export const TAB_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

let client: SupabaseClient | null = null;
function realtimeClient(): SupabaseClient {
  client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return client;
}

// Joins the household's broadcast channel and reports each change ping's
// scope ("home" | "expenses"), or "all" after a dropped connection comes
// back, since pings may have been missed while offline. Returns whether the
// channel is currently live.
export function useRealtime(
  channel: string | null,
  onChange: (scope: string) => void,
) {
  const [live, setLive] = useState(false);
  const handler = useRef(onChange);
  useEffect(() => {
    handler.current = onChange;
  });
  useEffect(() => {
    if (!channel || !hasDatabase) return;
    const supabase = realtimeClient();
    let everLive = false;
    const room = supabase.channel(channel, {
      config: { broadcast: { self: false } },
    });
    room.on("broadcast", { event: "changed" }, ({ payload }) => {
      const scope = typeof payload?.scope === "string" ? payload.scope : "all";
      const sender =
        typeof payload?.sender === "string" ? payload.sender : null;
      if (sender !== TAB_ID) handler.current(scope);
    });
    room.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setLive(true);
        if (everLive) handler.current("all");
        everLive = true;
      } else setLive(false);
    });
    return () => {
      setLive(false);
      void supabase.removeChannel(room);
    };
  }, [channel]);
  return live;
}
