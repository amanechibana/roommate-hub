import { logApiFailure } from "@/lib/api-log";
import { json } from "@/lib/shared-server";
import { cronAuthorized, runScheduledDigest } from "@/lib/digest-server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron calls this every evening, before quiet hours.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return json({ error: "Not allowed." }, 401);
  try {
    return json(await runScheduledDigest("evening"));
  } catch (err) {
    logApiFailure("/api/reminders/evening", "get", err);
    return json({ error: "Could not send reminders." }, 503);
  }
}
