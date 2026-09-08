import {
  json,
  sameOrigin,
  sharedDatabase,
  signedIn,
  selectedMember,
} from "@/lib/shared-server";

export const runtime = "nodejs";
export async function GET() {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const data = await sharedDatabase("get");
    const memberId = await selectedMember();
    return json({
      ...data,
      member_id: data.members.some(
        (m: { user_id: string; name: string }) =>
          m.user_id === memberId && m.name !== "Housemates",
      )
        ? memberId
        : null,
    });
  } catch {
    return json({ error: "Could not load your home. Please try again." }, 503);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 12000)
      return json({ error: "This entry is too long." }, 400);
    const { operation, payload } = JSON.parse(raw);
    if (
      !["create", "update", "delete", "restore", "payment", "member"].includes(
        operation,
      ) ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    )
      return json({ error: "Invalid request." }, 400);
    const keys =
      operation === "member"
        ? ["name"]
        : operation === "restore"
          ? ["undo_token"]
          : operation === "payment"
            ? ["id", "paid", "cover"]
            : [
                "undo_token",
                "rotation_partner",
                "id",
                "kind",
                "title",
                "description",
                "category",
                "date",
                "assignee",
                "amount",
                "url",
                "done",
                "repeat",
                "repeat_until",
                "scope",
              ];
    const values = Object.fromEntries(
      Object.entries(payload).filter(([key]) => keys.includes(key)),
    );
    if (operation === "create") {
      delete values.id;
      delete values.scope;
    }
    if (operation === "update") {
      delete values.repeat;
      delete values.repeat_until;
      delete values.rotation_partner;
    }
    const actor = await selectedMember();
    if (!actor)
      return json({ error: "Choose who’s using this device first." }, 400);
    return json(await sharedDatabase(operation, { ...values, actor }));
  } catch {
    return json(
      { error: "Could not save this change. Check the fields and try again." },
      400,
    );
  }
}
