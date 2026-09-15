import "server-only";
import { createClient } from "@supabase/supabase-js";

export const HANDBOOK_BUCKET = "house-handbook";

export function handbookStorageConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function handbookStorage() {
  if (!handbookStorageConfigured())
    throw new Error("Handbook file storage is not configured");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).storage.from(HANDBOOK_BUCKET);
}
