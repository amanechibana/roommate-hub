import { after } from "next/server";
import {
  pushConfigured,
  pushToHousemates,
  pushToMember,
} from "@/lib/push-server";
import { agreementNotification } from "@/lib/agreement-notifications";
import type { Member } from "@/lib/model";
import {
  broadcastChange,
  json,
  sameOrigin,
  sharedDatabase,
  signedIn,
  selectedMember,
} from "@/lib/shared-server";
export const runtime = "nodejs";
const gateway = "shared_agreements";
const allowlists: Record<string, string[]> = {
  save: ["slug", "title", "terms"],
  propose: ["slug"],
  revoke: ["slug"],
  sign: ["slug"],
  amend: ["agreement_id", "title", "body", "terms_patch"],
  amend_decide: ["id", "approve", "reason"],
  amend_withdraw: ["id"],
  event: ["agreement_id", "kind", "entry_id", "hours", "details"],
  event_decide: ["id", "accept"],
  log: [
    "entry_id",
    "day_type",
    "weights_minutes",
    "cardio_minutes",
    "exercises",
    "notes",
  ],
  set_sessions: ["agreement_id", "series_id", "from_date", "sessions"],
  set_chores: ["agreement_id", "first_date", "weeks", "chores"],
};
export async function GET(request: Request) {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const actor = await selectedMember();
    return json(
      await sharedDatabase(
        new URL(request.url).searchParams.has("cursor") ? "history" : "get",
        { actor, cursor: new URL(request.url).searchParams.get("cursor") },
        gateway,
      ),
    );
  } catch (err) {
    console.error("GET /api/agreements", err);
    return json(
      { error: "Could not load the agreements. Please try again." },
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
    if (raw.length > 32000)
      return json({ error: "This request is too long." }, 400);
    const { operation, payload, sender } = JSON.parse(raw);
    const allowed = Object.hasOwn(allowlists, operation)
      ? allowlists[operation]
      : null;
    if (
      !allowed ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    )
      return json({ error: "Invalid request." }, 400);
    const actor = await selectedMember();
    if (!actor)
      return json({ error: "Choose who’s using this device first." }, 400);
    const values = Object.fromEntries(
      Object.entries(payload).filter(([key]) => allowed.includes(key)),
    );
    const result = await sharedDatabase(
      operation,
      { ...values, actor },
      gateway,
    );
    broadcastChange("home", sender);
    if (pushConfigured())
      after(async () => {
        try {
          const home = await sharedDatabase("get");
          const by = (home.members as Member[]).find(
            (m) => m.user_id === actor && m.name !== "Housemates",
          );
          if (!by) return;
          const message = agreementNotification(operation, result, by.name);
          if (!message) return;
          if (message.member && message.member !== actor)
            await pushToMember(message.member, message);
          else await pushToHousemates(actor, message);
        } catch (error) {
          console.error("agreement push failed", (error as Error).name);
        }
      });
    return json(result);
  } catch (err) {
    if ((err as { rejected?: boolean }).rejected)
      return json({ error: (err as Error).message, rejected: true }, 400);
    console.error("POST /api/agreements", err);
    return json(
      { error: "Could not save this change. Please try again." },
      400,
    );
  }
}
