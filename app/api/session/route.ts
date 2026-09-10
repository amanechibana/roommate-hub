import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import {
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
  SESSION_DURATION,
} from "@/lib/session-token";

export const runtime = "nodejs";
export async function GET() {
  return json({ authenticated: await signedIn() });
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
    const { member_id } = JSON.parse(raw);
    const data = await sharedDatabase("get");
    // The shared identity is a valid choice for a kitchen or wall screen that
    // is nobody in particular. It still cannot write: every gateway function
    // refuses it as an actor, which is what makes that device read-only.
    if (!data.members.some((m: { user_id: string }) => m.user_id === member_id))
      return json({ error: "Choose a person from this household." }, 400);
    (await cookies()).set(MEMBER_COOKIE, member_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_DURATION,
    });
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
