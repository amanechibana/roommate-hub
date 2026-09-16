import {
  json,
  sharedDatabase,
  signedIn,
  selectedMember,
} from "@/lib/shared-server";
import { logApiFailure } from "@/lib/api-log";
export async function GET(request: Request) {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() || "";
  const offset = Number(params.get("offset") || 0);
  if (
    query.length < 2 ||
    query.length > 160 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100000
  )
    return json({ error: "Enter 2–160 characters to search." }, 400);
  try {
    return json(
      await sharedDatabase(
        "search",
        { query, offset, actor: await selectedMember() },
        "shared_search",
      ),
    );
  } catch (err) {
    logApiFailure("/api/search", "search", err);
    return json(
      { error: "Could not search your household. Please try again." },
      503,
    );
  }
}
