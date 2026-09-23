import {
  broadcastChange,
  json,
  sameOrigin,
  selectedMember,
  sharedDatabase,
  signedIn,
} from "@/lib/shared-server";
export const runtime = "nodejs";
export async function GET() {
  if (!(await signedIn())) return json({ error: "Sign in first." }, 401);
  try {
    return json(
      await sharedDatabase(
        "get",
        { actor: await selectedMember() },
        "shared_expense_rules",
      ),
    );
  } catch {
    return json({ error: "Could not load repeating charges." }, 503);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn())) return json({ error: "Sign in first." }, 401);
  const actor = await selectedMember();
  if (!actor) return json({ error: "Sign in as a housemate." }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: "Invalid rule." }, 400);
    const { operation, payload, sender } = JSON.parse(raw);
    if (
      !["create", "review", "stop"].includes(operation) ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    )
      return json({ error: "Invalid rule." }, 400);
    const allowed =
      operation === "create"
        ? ["expense_id", "frequency"]
        : operation === "review"
          ? ["id", "decision"]
          : ["id"];
    const values = Object.fromEntries(
      Object.entries(payload).filter(([key]) => allowed.includes(key)),
    );
    const result = await sharedDatabase(
      operation,
      { ...values, actor },
      "shared_expense_rules",
    );
    broadcastChange("expenses", sender);
    return json(result);
  } catch (err) {
    return json(
      { error: (err as Error).message || "Could not save repeating charge." },
      400,
    );
  }
}
