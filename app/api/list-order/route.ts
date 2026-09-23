import {
  broadcastChange,
  json,
  sameOrigin,
  selectedMember,
  sharedDatabase,
  signedIn,
} from "@/lib/shared-server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!(await signedIn())) return json({ error: "Sign in first." }, 401);
  const list = new URL(request.url).searchParams.get("list");
  if (list !== "tasks" && list !== "shopping")
    return json({ error: "Invalid list." }, 400);
  try {
    return json(await sharedDatabase("get", { list }, "shared_list_order"));
  } catch {
    return json({ error: "Could not load list order." }, 503);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn())) return json({ error: "Sign in first." }, 401);
  const actor = await selectedMember();
  if (!actor) return json({ error: "Sign in as a housemate." }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 40000)
      return json({ error: "List order is too long." }, 400);
    const { list, ids, sender } = JSON.parse(raw);
    if (
      (list !== "tasks" && list !== "shopping") ||
      !Array.isArray(ids) ||
      ids.length > 1000 ||
      ids.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id))
    )
      return json({ error: "Invalid list order." }, 400);
    const result = await sharedDatabase(
      "save",
      { list, ids, actor },
      "shared_list_order",
    );
    broadcastChange("home", sender);
    return json(result);
  } catch {
    return json({ error: "Could not save list order." }, 503);
  }
}
