import { cookies } from "next/headers";
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  accountDatabase,
  COOKIE_NAME,
  MEMBER_COOKIE,
  configured,
  json,
  sameOrigin,
  sharedDatabase,
  signedIn,
} from "@/lib/shared-server";
import {
  equalSecret,
  makeSession,
  makeMemberSession,
  SESSION_DURATION,
} from "@/lib/session-token";

export const runtime = "nodejs";
export async function GET() {
  return json({
    authenticated: await signedIn(),
    member_id: await selectedAccount(),
  });
}
async function selectedAccount() {
  if (!(await signedIn())) return null;
  const { selectedMember } = await import("@/lib/shared-server");
  return selectedMember();
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!configured())
    return json({ error: "Household sign-in is not configured yet." }, 503);
  try {
    const body = await request.text();
    if (body.length > 1024) return json({ error: "Invalid code." }, 400);
    const { code } = JSON.parse(body);
    if (typeof code !== "string" || code.length > 128)
      return json({ error: "Enter your household code." }, 400);
    // Forwarded-for headers are platform-controlled on Vercel; on any other
    // host they're spoofable, so the limiter is best-effort there.
    const ip =
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "local";
    const fingerprint = createHmac(
      "sha256",
      process.env.HOUSEHOLD_SESSION_SECRET!,
    )
      .update(ip)
      .digest("hex");
    const attempt = await sharedDatabase("attempt", { fingerprint });
    if (!attempt.allowed)
      return json({ error: "Too many tries. Please wait 15 minutes." }, 429);
    if (!equalSecret(code, process.env.HOUSEHOLD_ACCESS_CODE!))
      return json({ error: "That code doesn’t match. Try again." }, 401);
    // Both roommates share a NAT IP; a successful sign-in must not leave
    // failed-attempt credit behind that could lock the other one out.
    await sharedDatabase("attempt_clear", { fingerprint }).catch(() => {});
    (await cookies()).set(
      COOKIE_NAME,
      makeSession(
        process.env.HOUSEHOLD_SESSION_SECRET!,
        process.env.HOUSEHOLD_ACCESS_CODE!,
      ),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: SESSION_DURATION,
      },
    );
    return json({ authenticated: true });
  } catch (err) {
    console.error("POST /api/session", err);
    return json(
      { error: "Sign-in is unavailable right now. Please try again." },
      503,
    );
  }
}
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 1024) return json({ error: "Invalid person." }, 400);
    const { member_id, password, enrollment_code } = JSON.parse(raw);
    const data = await sharedDatabase("get");
    const member = data.members.find(
      (m: { user_id: string; name: string; active?: boolean }) =>
        m.user_id === member_id && m.active !== false,
    );
    if (!member)
      return json({ error: "Choose a person from this household." }, 400);
    if (member.name === "Housemates") {
      (await cookies()).delete(MEMBER_COOKIE);
      return json({ member_id });
    }
    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 128
    )
      return json(
        { error: "Enter a personal password of at least 10 characters." },
        400,
      );
    const db = accountDatabase();
    const { data: account, error } = await db
      .from("member_accounts")
      .select("password_salt,password_hash")
      .eq("member_id", member_id)
      .maybeSingle();
    if (error) throw error;
    const ip =
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "local";
    const fingerprint = createHmac(
      "sha256",
      process.env.HOUSEHOLD_SESSION_SECRET!,
    )
      .update(`member:${member_id}:${ip}`)
      .digest("hex");
    const attempt = await sharedDatabase("attempt", { fingerprint });
    if (!attempt.allowed)
      return json({ error: "Too many tries. Please wait 15 minutes." }, 429);
    if (account) {
      const actual = scryptSync(password, account.password_salt, 64);
      const expected = Buffer.from(account.password_hash, "hex");
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(actual, expected)
      )
        return json({ error: "That password doesn’t match." }, 401);
    } else {
      if (
        typeof enrollment_code !== "string" ||
        enrollment_code.length < 16 ||
        enrollment_code.length > 128
      )
        return json(
          { error: "Enter the owner setup secret or your invitation code." },
          400,
        );
      if (member_id === data.household.owner_id) {
        if (
          !process.env.HOUSEHOLD_OWNER_SETUP_SECRET ||
          !equalSecret(
            enrollment_code,
            process.env.HOUSEHOLD_OWNER_SETUP_SECRET,
          )
        )
          return json({ error: "Owner setup secret does not match." }, 401);
      } else {
        const { data: invite, error: inviteError } = await db
          .from("member_enrollments")
          .select("token_hash,expires_at")
          .eq("member_id", member_id)
          .maybeSingle();
        if (inviteError) throw inviteError;
        const actual = createHmac(
          "sha256",
          process.env.HOUSEHOLD_SESSION_SECRET!,
        )
          .update(`enroll:${member_id}:${enrollment_code}`)
          .digest("hex");
        if (
          !invite ||
          Date.parse(invite.expires_at) <= Date.now() ||
          !equalSecret(actual, invite.token_hash)
        )
          return json({ error: "Invitation code is invalid or expired." }, 401);
      }
      const salt = randomBytes(24).toString("hex");
      const hash = scryptSync(password, salt, 64).toString("hex");
      const { error: saveError } = await db
        .from("member_accounts")
        .insert({
          member_id,
          household_id: member.household_id,
          password_salt: salt,
          password_hash: hash,
        });
      if (saveError) {
        if (saveError.code === "23505")
          return json(
            { error: "This person already has a password. Sign in with it." },
            409,
          );
        throw saveError;
      }
      await db.from("member_enrollments").delete().eq("member_id", member_id);
    }
    await sharedDatabase("attempt_clear", { fingerprint }).catch(() => {});
    (await cookies()).set(
      MEMBER_COOKIE,
      makeMemberSession(
        process.env.HOUSEHOLD_SESSION_SECRET!,
        process.env.HOUSEHOLD_ACCESS_CODE!,
        member_id,
      ),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: SESSION_DURATION,
      },
    );
    return json({ member_id });
  } catch (err) {
    console.error("PATCH /api/session", err);
    return json(
      { error: "Couldn’t remember this person. Please try again." },
      503,
    );
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  (await cookies()).set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  (await cookies()).delete(MEMBER_COOKIE);
  return json({ authenticated: false });
}
