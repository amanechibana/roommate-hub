import { json } from "@/lib/shared-server";
import { pushConfigured } from "@/lib/push-server";
import { cronAuthorized, sendDigests } from "@/lib/digest-server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron calls this every evening, before quiet hours.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return json({ error: "Not allowed." }, 401);
  if (!pushConfigured()) return json({ sent: 0, pruned: 0 });
  try {
    return json(await sendDigests("evening", null));
  } catch (err) {
    console.error("GET /api/reminders/evening", err);
    return json({ error: "Could not send reminders." }, 503);
  }
}
