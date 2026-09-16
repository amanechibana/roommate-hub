import { json, signedIn, sharedDatabase } from "@/lib/shared-server";
import { logApiFailure } from "@/lib/api-log";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const cursor = new URL(request.url).searchParams.get("cursor");
    return json(await sharedDatabase("history", cursor ? { cursor } : {}));
  } catch (error) {
    logApiFailure("/api/home/history", "get", error);
    return json(
      { error: "Could not load history. Refresh and try again." },
      503,
    );
  }
}
