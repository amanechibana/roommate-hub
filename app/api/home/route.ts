import {
  json,
  sameOrigin,
  sharedDatabase,
  signedIn,
} from "@/lib/shared-server";

export const runtime = "nodejs";
export async function GET() {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    return json(await sharedDatabase("get"));
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
      !["create", "update", "delete", "member"].includes(operation) ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    )
      return json({ error: "Invalid request." }, 400);
    const keys =
      operation === "member"
        ? ["name"]
        : [
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
      delete values.kind;
      delete values.repeat;
      delete values.repeat_until;
    }
    return json(await sharedDatabase(operation, values));
  } catch {
    return json(
      { error: "Could not save this change. Check the fields and try again." },
      400,
    );
  }
}
