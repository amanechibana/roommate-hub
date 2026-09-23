import { logApiFailure } from "@/lib/api-log";
import {
  accountDatabase,
  broadcastChange,
  json,
  sameOrigin,
  selectedMember,
  sharedDatabase,
  signedIn,
} from "@/lib/shared-server";
export const runtime = "nodejs";
const fields: Record<string, string[]> = {
  resource: ["name"],
  book: ["resource_id", "starts_at", "ends_at", "notes"],
  cancel_booking: ["id"],
  checkin: ["notes"],
  decision: ["title"],
  resolve_decision: ["id"],
  move: ["member", "direction", "date"],
  move_item: ["id", "index", "done", "notes"],
  invite: ["name"],
  remove_member: ["member"],
  leave: [],
  transfer_owner: ["member"],
};
export async function GET() {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    return json(await sharedDatabase("get", {}, "shared_coordination"));
  } catch (err) {
    logApiFailure("/api/coordination", "get", err);
    return json(
      {
        error:
          "Could not load house planning. Check that pending migrations are applied.",
      },
      503,
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 12000)
      return json({ error: "This change is too long." }, 400);
    const { operation, payload, sender } = JSON.parse(raw);
    if (
      !Object.hasOwn(fields, operation) ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    )
      return json({ error: "Invalid house planning request." }, 400);
    const actor = await selectedMember();
    if (!actor)
      return json({ error: "Choose who’s using this device first." }, 400);
    const values = Object.fromEntries(
      Object.entries(payload).filter(([key]) =>
        fields[operation].includes(key),
      ),
    );
    if (operation === "transfer_owner") {
      const { data: account, error } = await accountDatabase()
        .from("member_accounts")
        .select("member_id")
        .eq("member_id", values.member)
        .maybeSingle();
      if (error) throw error;
      if (!account)
        return json(
          {
            error:
              "Ask this housemate to create their account before transferring ownership.",
          },
          400,
        );
    }
    const result = await sharedDatabase(
      operation,
      { ...values, actor },
      "shared_coordination",
    );
    broadcastChange("home", sender);
    return json(result);
  } catch (err) {
    if ((err as { rejected?: boolean }).rejected)
      return json({ error: (err as Error).message, rejected: true }, 400);
    logApiFailure("/api/coordination", "post", err);
    return json(
      { error: "Could not save this change. Check the details and try again." },
      400,
    );
  }
}
