import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validSession } from "./session-token";

export const COOKIE_NAME = "common_ground_home";
export const MEMBER_COOKIE = "common_ground_person";
export async function selectedMember() {
  return (await cookies()).get(MEMBER_COOKIE)?.value || null;
}
export function configured() {
  return Boolean(
    process.env.HOUSEHOLD_ACCESS_CODE &&
    process.env.HOUSEHOLD_SESSION_SECRET &&
    process.env.HOUSEHOLD_DATA_TOKEN &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export async function signedIn() {
  return (
    configured() &&
    validSession(
      (await cookies()).get(COOKIE_NAME)?.value,
      process.env.HOUSEHOLD_SESSION_SECRET!,
      process.env.HOUSEHOLD_ACCESS_CODE!,
    )
  );
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
export async function sharedDatabase(
  operation: string,
  payload: Record<string, unknown> = {},
  gateway: "shared_home" | "shared_expenses" | "shared_push" = "shared_home",
) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await db.rpc(gateway, {
    access_token: process.env.HOUSEHOLD_DATA_TOKEN,
    operation,
    payload,
  });
  if (error)
    throw new Error(
      "The household could not be loaded or updated. Please try again.",
    );
  return data;
}
// The broadcast channel name is a secret shared only with signed-in clients;
// pings carry no household data, so knowing the name reveals activity timing
// at most. Derived rather than stored so code rotation needs no migration.
export function realtimeChannel() {
  return `hub-${createHmac("sha256", process.env.HOUSEHOLD_SESSION_SECRET!)
    .update("realtime-broadcast-channel")
    .digest("base64url")
    .slice(0, 24)}`;
}
// Fire-and-forget change ping after the response is sent. Other tabs refetch
// through the authed routes; the sending tab recognizes itself and skips.
export function broadcastChange(scope: "home" | "expenses", sender: unknown) {
  after(async () => {
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`,
        {
          method: "POST",
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [
              {
                topic: realtimeChannel(),
                event: "changed",
                payload: {
                  scope,
                  sender:
                    typeof sender === "string" && sender.length <= 64
                      ? sender
                      : null,
                },
                private: false,
              },
            ],
          }),
        },
      );
    } catch {
      // Missed pings are covered by the fallback poll.
    }
  });
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
