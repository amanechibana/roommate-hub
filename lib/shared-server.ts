import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { validSession } from "./session-token";

export const COOKIE_NAME = "common_ground_home";
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
) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await db.rpc("shared_home", {
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
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
