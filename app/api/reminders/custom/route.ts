import { cronAuthorized, sendDigests } from "@/lib/digest-server";
import { pushConfigured } from "@/lib/push-server";
import { json, sharedDatabase } from "@/lib/shared-server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return json({ error: "Not allowed." }, 401);
  try {
    const schedules = await sharedDatabase(
      "roll_forward",
      {},
      "shared_household_ops",
    );
    if (!pushConfigured()) return json({ sent: 0, schedules });
    const [morning, evening] = await Promise.all([
      sendDigests("morning", null, undefined, true),
      sendDigests("evening", null, undefined, true),
    ]);
    return json({ morning, evening, schedules });
  } catch {
    return json({ error: "Could not send configured reminders." }, 503);
  }
}
