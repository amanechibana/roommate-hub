import {
  json,
  selectedMember,
  sharedDatabase,
  signedIn,
} from "@/lib/shared-server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 160)
    return json({ error: "Search with 2 to 160 characters." }, 400);
  try {
    return json(
      await sharedDatabase(
        "search",
        { query, actor: await selectedMember() },
        "shared_improvements",
      ),
    );
  } catch {
    return json({ error: "Could not search your household." }, 503);
  }
}
