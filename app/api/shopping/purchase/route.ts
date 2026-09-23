import {
  broadcastChange,
  json,
  sameOrigin,
  selectedMember,
  sharedDatabase,
  signedIn,
} from "@/lib/shared-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn())) return json({ error: "Sign in first." }, 401);
  const actor = await selectedMember();
  if (!actor) return json({ error: "Sign in as a housemate." }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: "Invalid purchase." }, 400);
    const { id, quantity, amount_cents, purchase_id, sender } = JSON.parse(raw);
    if (
      ![id, purchase_id].every(
        (value) => typeof value === "string" && /^[0-9a-f-]{36}$/.test(value),
      ) ||
      typeof quantity !== "number" ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 100000 ||
      !Number.isInteger(amount_cents) ||
      amount_cents <= 0 ||
      amount_cents > 100000000
    )
      return json({ error: "Enter a valid quantity and price." }, 400);
    const result = await sharedDatabase(
      "purchase_partial",
      { actor, id, quantity, amount_cents, purchase_id },
      "shared_shopping",
    );
    broadcastChange("home", sender);
    return json(result);
  } catch (err) {
    return json(
      { error: (err as Error).message || "Could not record purchase." },
      400,
    );
  }
}
