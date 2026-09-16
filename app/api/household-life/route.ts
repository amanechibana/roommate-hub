import { lifeAllowlists, type LifeOperation } from "@/lib/household-life";
import {
  broadcastChange,
  json,
  sameOrigin,
  selectedMember,
  sharedDatabase,
  signedIn,
} from "@/lib/shared-server";
import { handbookStorageConfigured } from "@/lib/handbook-server";
import { maintenanceStorage } from "@/lib/maintenance-server";
import { logApiFailure } from "@/lib/api-log";
export const runtime = "nodejs";
const gateway = "shared_household_life";
export async function GET() {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    return json({
      ...(await sharedDatabase(
        "get",
        { actor: await selectedMember() },
        gateway,
      )),
      photos_enabled: handbookStorageConfigured(),
    });
  } catch (err) {
    logApiFailure("/api/household-life", "get", err);
    return json(
      { error: (err as Error).message || "Could not load household life." },
      503,
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 24000)
      return json({ error: "This entry is too long." }, 400);
    const { operation, payload, sender } = JSON.parse(raw);
    if (
      !Object.hasOwn(lifeAllowlists, operation) ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    )
      return json({ error: "Invalid household request." }, 400);
    const actor = await selectedMember();
    if (!actor)
      return json({ error: "Choose who’s using this device first." }, 400);
    const allowed: readonly string[] =
      lifeAllowlists[operation as LifeOperation];
    const values = Object.fromEntries(
      Object.entries(payload).filter(([key]) => allowed.includes(key)),
    );
    const result = await sharedDatabase(
      operation,
      { ...values, actor },
      gateway,
    );
    if (result.paths?.length && handbookStorageConfigured()) {
      const { error } = await maintenanceStorage().remove(result.paths);
      if (error)
        console.error("Maintenance photo cleanup failed", {
          code: error.statusCode,
        });
    }
    broadcastChange("home", sender);
    return json(result);
  } catch (err) {
    if ((err as { rejected?: boolean }).rejected)
      return json({ error: (err as Error).message, rejected: true }, 400);
    logApiFailure("/api/household-life", "post", err);
    return json(
      {
        error:
          "Could not save this change. Please check the details and try again.",
      },
      400,
    );
  }
}
