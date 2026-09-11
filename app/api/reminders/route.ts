import {
  json,
  sameOrigin,
  signedIn,
  selectedMember,
} from "@/lib/shared-server";
import { pushConfigured } from "@/lib/push-server";
import { cronAuthorized, sendDigests } from "@/lib/digest-server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron calls this every morning.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return json({ error: "Not allowed." }, 401);
  if (!pushConfigured()) return json({ sent: 0, pruned: 0 });
  try {
    return json(await sendDigests("morning", null));
  } catch (err) {
    console.error("GET /api/reminders", err);
    return json({ error: "Could not send reminders." }, 503);
  }
}

// The settings page's "send it now" check, scoped to the requester.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  if (!pushConfigured())
    return json({ error: "Notifications aren’t configured yet." }, 503);
  const member = await selectedMember();
  if (!member)
    return json({ error: "Choose who’s using this device first." }, 400);
  try {
    return json(await sendDigests("morning", member));
  } catch (err) {
    console.error("POST /api/reminders", err);
    return json({ error: "Could not send your digest." }, 503);
  }
}
