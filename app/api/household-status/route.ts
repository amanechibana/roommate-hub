import { householdQuietHours } from "@/lib/notification-preferences-server";
import {
  json,
  signedIn,
  sameOrigin,
  selectedMember,
  sharedDatabase,
} from "@/lib/shared-server";
import { handbookStorageConfigured } from "@/lib/handbook-server";
import { sendDigests, runScheduledDigest } from "@/lib/digest-server";
import { logApiFailure } from "@/lib/api-log";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    return json({
      ...(await sharedDatabase("status", {}, "shared_household_ops")),
      attachments_enabled: handbookStorageConfigured(),
    });
  } catch (error) {
    logApiFailure("/api/household-status", "get", error);
    return json(
      {
        error:
          "Household status unavailable. Check pending database migrations.",
      },
      503,
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  const actor = await selectedMember();
  if (!actor) return json({ error: "Choose a household member first." }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 100) return json({ error: "Invalid request." }, 400);
    const { edition } = JSON.parse(raw);
    if (edition !== "morning" && edition !== "evening")
      return json({ error: "Invalid edition." }, 400);
    if (await householdQuietHours(new Date()))
      return json(
        {
          error:
            "The household is in quiet hours. Retry after the configured quiet-hours end.",
        },
        409,
      );
    const status = await sharedDatabase("status", {}, "shared_household_ops");
    const custom = status.custom_reminders?.find(
      (run: { edition: string }) => run.edition === edition,
    );
    if (custom)
      return json(
        await sendDigests(edition, null, undefined, true, true, custom.date),
      );
    return json(await runScheduledDigest(edition, actor));
  } catch (error) {
    if ((error as { code?: string }).code === "42501")
      return json({ error: "Choose a household member first." }, 403);
    logApiFailure("/api/household-status", "retry", error);
    return json(
      { error: "Retry failed. Check household reminder status." },
      503,
    );
  }
}
