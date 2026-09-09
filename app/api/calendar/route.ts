import { json, signedIn } from "@/lib/shared-server";
import { calendarFeedToken } from "@/lib/session-token";

export const runtime = "nodejs";
// The signed-in app asks for the feed's secret; the feed itself is served
// without a session, since calendar apps can't sign in.
export async function GET() {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  return json({
    token: calendarFeedToken(
      process.env.HOUSEHOLD_SESSION_SECRET!,
      process.env.HOUSEHOLD_ACCESS_CODE!,
    ),
  });
}
