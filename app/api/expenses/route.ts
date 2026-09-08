import {
  broadcastChange,
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
    return json(await sharedDatabase("get", {}, "shared_expenses"));
  } catch (err) {
    console.error("GET /api/expenses", err);
    return json({ error: "Could not load expenses. Please try again." }, 503);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 12000)
      return json({ error: "This expense is too long." }, 400);
    const { operation, payload, sender } = JSON.parse(raw);
    if (
      !["create", "update", "delete"].includes(operation) ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    )
      return json({ error: "Invalid expense." }, 400);
    const actor = await selectedMember();
    if (!actor)
      return json({ error: "Choose who’s using this device first." }, 400);
    const allowed =
      operation === "delete"
        ? ["id"]
        : [
            "id",
            "kind",
            "title",
            "date",
            "amount_cents",
            "paid_by",
            "shares",
            "recipient",
          ];
    const values = Object.fromEntries(
      Object.entries(payload).filter(([key]) => allowed.includes(key)),
    );
    const result = await sharedDatabase(
      operation,
      { ...values, actor },
      "shared_expenses",
    );
    broadcastChange("expenses", sender);
    return json(result);
  } catch (err) {
    if ((err as { rejected?: boolean }).rejected)
      return json({ error: (err as Error).message, rejected: true }, 400);
    console.error("POST /api/expenses", err);
    return json(
      {
        error:
          "Couldn’t save the expense. Check the amount and split, then try again.",
      },
      400,
    );
  }
}
