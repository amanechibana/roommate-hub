import {
  json,
  sameOrigin,
  sharedDatabase,
  signedIn,
  selectedMember,
} from "@/lib/shared-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 4000) return json({ error: "Invalid subscription." }, 400);
    const { operation, subscription } = JSON.parse(raw);
    if (
      !["subscribe", "unsubscribe"].includes(operation) ||
      typeof subscription?.endpoint !== "string"
    )
      return json({ error: "Invalid subscription." }, 400);
    const member = await selectedMember();
    if (!member)
      return json({ error: "Choose who’s using this device first." }, 400);
    await sharedDatabase(
      operation,
      operation === "subscribe"
        ? {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
            member,
          }
        : { endpoint: subscription.endpoint },
      "shared_push",
    );
    return json({ ok: true });
  } catch {
    return json({ error: "Couldn’t update notifications. Try again." }, 400);
  }
}
