import {
  broadcastChange,
  json,
  sameOrigin,
  sharedDatabase,
  signedIn,
  selectedMember,
} from "@/lib/shared-server";
import {
  handbookStorage,
  handbookStorageConfigured,
} from "@/lib/handbook-server";

export const runtime = "nodejs";
const gateway = "shared_handbook";
const allowlists: Record<string, string[]> = {
  create: ["section", "title", "value", "notes", "sort_order"],
  update: ["id", "section", "title", "value", "notes", "sort_order"],
  delete: ["id"],
};

export async function GET() {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const result = await sharedDatabase("get", {}, gateway);
    return json({ ...result, files_enabled: handbookStorageConfigured() });
  } catch (err) {
    console.error("GET /api/handbook", err);
    return json({ error: "Could not load the house handbook." }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 12000)
      return json({ error: "This handbook entry is too long." }, 400);
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
      return json({ error: "Invalid handbook request." }, 400);
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
    if (
      operation === "delete" &&
      handbookStorageConfigured() &&
      Array.isArray(result.paths) &&
      result.paths.length
    ) {
      const { error } = await handbookStorage().remove(result.paths);
      if (error)
        console.error("Handbook object cleanup failed", {
          operation,
          code: error.statusCode,
        });
    }
    broadcastChange("home", sender);
    return json(result);
  } catch (err) {
    if ((err as { rejected?: boolean }).rejected)
      return json({ error: (err as Error).message, rejected: true }, 400);
    console.error("POST /api/handbook", err);
    return json({ error: "Could not save the handbook change." }, 400);
  }
}
