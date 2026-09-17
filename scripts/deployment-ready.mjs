// Vercel ignoreCommand: exit 0 holds this build; exit 1 lets it continue.
import { pathToFileURL } from "node:url";
/** @param {Record<string, string | undefined>} env */
export async function deploymentReady(env = process.env, request = fetch) {
  if (env.VERCEL_ENV !== "production") return true;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = env.HOUSEHOLD_DATA_TOKEN;
  if (!url && !key && !token) return true; // Demo deployment.
  if (!url || !key || !token) return false;
  try {
    const response = await request(`${url}/rest/v1/rpc/shared_household_ops`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        operation: "status",
        payload: {},
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;
    const status = await response.json();
    return Number(status.schema_version) >= 29;
  } catch {
    return false;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  deploymentReady().then((ready) => {
    console.log(
      ready
        ? "Database supports this release; build continues."
        : "Production build held: apply migration 029 and verify database access, then redeploy.",
    );
    process.exit(ready ? 1 : 0);
  });
}
