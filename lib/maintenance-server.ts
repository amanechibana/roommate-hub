import "server-only";
import { createClient } from "@supabase/supabase-js";
export function maintenanceStorage() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).storage.from("house-maintenance");
}
