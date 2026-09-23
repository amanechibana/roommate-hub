import { createHmac, randomBytes } from "node:crypto";
import {
  accountDatabase,
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
  if (!actor) return json({ error: "Sign in as the owner." }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 512) return json({ error: "Invalid invitation." }, 400);
    const { member_id } = JSON.parse(raw);
    const home = await sharedDatabase("get", { actor });
    if (home.household.owner_id !== actor)
      return json({ error: "Only the owner can invite members." }, 403);
    const member = home.members.find(
      (item: { user_id: string; active?: boolean; name: string }) =>
        item.user_id === member_id &&
        item.active !== false &&
        item.name !== "Housemates",
    );
    if (!member || member_id === actor)
      return json({ error: "Choose a current housemate." }, 400);
    const db = accountDatabase();
    const { data: account, error: accountError } = await db
      .from("member_accounts")
      .select("member_id")
      .eq("member_id", member_id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (account)
      return json({ error: "This housemate already has an account." }, 409);
    const code = randomBytes(24).toString("base64url");
    const token_hash = createHmac(
      "sha256",
      process.env.HOUSEHOLD_SESSION_SECRET!,
    )
      .update(`enroll:${member_id}:${code}`)
      .digest("hex");
    const expires_at = new Date(Date.now() + 7 * 86400000).toISOString();
    const { error } = await db
      .from("member_enrollments")
      .upsert(
        {
          member_id,
          household_id: member.household_id,
          token_hash,
          expires_at,
          created_by: actor,
        },
        { onConflict: "member_id" },
      );
    if (error) throw error;
    return json({ code, expires_at });
  } catch (err) {
    return json(
      { error: (err as Error).message || "Could not create invitation." },
      400,
    );
  }
}
