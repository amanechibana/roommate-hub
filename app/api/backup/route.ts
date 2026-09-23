import {
  json,
  sameOrigin,
  selectedMember,
  sharedDatabase,
  signedIn,
} from "@/lib/shared-server";
export const runtime = "nodejs";
export async function GET() {
  if (!(await signedIn())) return json({ error: "Sign in first." }, 401);
  const actor = await selectedMember();
  if (!actor) return json({ error: "Sign in as the owner." }, 403);
  try {
    return json(
      await sharedDatabase("export", { actor }, "shared_household_backup"),
    );
  } catch (err) {
    return json(
      { error: (err as Error).message || "Could not export household." },
      403,
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn())) return json({ error: "Sign in first." }, 401);
  const actor = await selectedMember();
  if (!actor) return json({ error: "Sign in as the owner." }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 10_000_000)
      return json({ error: "Backup is too large." }, 413);
    const backup = JSON.parse(raw);
    if (
      backup?.format !== "common-ground-household" ||
      backup?.version !== 1 ||
      typeof backup.household_id !== "string" ||
      !backup.tables ||
      typeof backup.tables !== "object"
    )
      return json({ error: "Invalid household backup." }, 400);
    return json(
      await sharedDatabase(
        "restore",
        { actor, household_id: backup.household_id, tables: backup.tables },
        "shared_household_backup",
      ),
    );
  } catch (err) {
    return json(
      { error: (err as Error).message || "Could not restore household." },
      400,
    );
  }
}
