import { configured, sharedDatabase } from "@/lib/shared-server";
import { calendarFeedToken, equalSecret } from "@/lib/session-token";
import { calendarFile, type Entry, type Member } from "@/lib/model";

export const runtime = "nodejs";
// A subscription feed for phone calendars: dated plans and chores, refreshed
// on the calendar app's own schedule. The path segment is the only key, so
// a wrong one gets the same 404 as a path that doesn't exist.
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (
    !configured() ||
    token.length > 64 ||
    !equalSecret(
      token,
      calendarFeedToken(
        process.env.HOUSEHOLD_SESSION_SECRET!,
        process.env.HOUSEHOLD_ACCESS_CODE!,
      ),
    )
  )
    return new Response("Not found", { status: 404 });
  try {
    const data = await sharedDatabase("get");
    return new Response(
      calendarFile(
        data.entries as Entry[],
        data.household?.name,
        data.members as Member[],
      ),
      {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (err) {
    console.error("GET /api/calendar/[token]", err);
    return new Response("Calendar unavailable", { status: 503 });
  }
}
