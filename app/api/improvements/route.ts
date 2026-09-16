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
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    return json(
      await sharedDatabase(
        "get",
        { actor: await selectedMember() },
        "shared_improvements",
      ),
    );
  } catch {
    return json({ error: "Could not load household preferences." }, 503);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 32000)
      return json({ error: "Settings are too long." }, 400);
    const { operation, payload } = JSON.parse(raw);
    if (
      ![
        "save_household",
        "save_reminders",
        "request_coverage",
        "decide_coverage",
      ].includes(operation) ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    )
      return json({ error: "Invalid request." }, 400);
    const result = await sharedDatabase(
      operation,
      { ...payload, actor: await selectedMember() },
      "shared_improvements",
    );
    broadcastChange("home", null);
    return json(result);
  } catch (error) {
    return json(
      {
        error: (error as { rejected?: boolean }).rejected
          ? (error as Error).message
          : "Could not save this change.",
      },
      400,
    );
  }
}
