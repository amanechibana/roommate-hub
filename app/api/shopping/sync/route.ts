import {
  broadcastChange,
  json,
  sameOrigin,
  selectedMember,
  sharedDatabase,
  signedIn,
} from "@/lib/shared-server";
import { logApiFailure } from "@/lib/api-log";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Sign in at home to sync your shopping list." }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 4000)
      return json({ error: "Invalid shopping change." }, 400);
    const body = JSON.parse(raw);
    const actor = await selectedMember();
    if (!actor || body.actor !== actor)
      return json(
        { error: "Choose the person who saved this list before syncing." },
        409,
      );
    const keys = [
      "id",
      "write_id",
      "household_id",
      "done",
      "expected_done",
      "expected_completed_at",
      "expected_title",
      "expected_amount",
      "expected_category",
      "expected_assignee",
    ];
    const payload = Object.fromEntries(keys.map((key) => [key, body[key]]));
    if (
      typeof payload.done !== "boolean" ||
      typeof payload.expected_done !== "boolean"
    )
      return json({ error: "Invalid shopping change." }, 400);
    const result = await sharedDatabase(
      "sync",
      { ...payload, actor },
      "shared_shopping",
    );
    if (result.ok) {
      broadcastChange("home", null);
      broadcastChange("expenses", null);
    }
    return json(result);
  } catch (err) {
    if ((err as { rejected?: boolean }).rejected)
      return json({ error: (err as Error).message }, 409);
    logApiFailure("/api/shopping/sync", "sync", err);
    return json(
      { error: "Could not sync. Your changes are still saved on this device." },
      503,
    );
  }
}
