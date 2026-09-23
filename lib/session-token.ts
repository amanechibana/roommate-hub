import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_DURATION = 60 * 60 * 24 * 30;
export function equalSecret(a: string, b: string): boolean {
  const key = "common-ground-constant-time-comparison";
  return timingSafeEqual(
    createHmac("sha256", key).update(a).digest(),
    createHmac("sha256", key).update(b).digest(),
  );
}
export function makeSession(
  secret: string,
  code: string,
  now = Date.now(),
): string {
  const payload = `${Math.floor(now / 1000) + SESSION_DURATION}.${randomBytes(24).toString("base64url")}`;
  return `${payload}.${createHmac("sha256", secret).update(`${code}:${payload}`).digest("base64url")}`;
}
export function validSession(
  token: string | undefined,
  secret: string,
  code: string,
  now = Date.now(),
): boolean {
  if (!token || !secret || !code || token.length > 256) return false;
  const [expiry, nonce, signature, ...extra] = token.split(".");
  const seconds = Math.floor(now / 1000);
  if (
    extra.length ||
    !nonce ||
    !signature ||
    !/^\d+$/.test(expiry) ||
    Number(expiry) <= seconds ||
    Number(expiry) > seconds + SESSION_DURATION
  )
    return false;
  return equalSecret(
    signature,
    createHmac("sha256", secret)
      .update(`${code}:${expiry}.${nonce}`)
      .digest("base64url"),
  );
}
export function makeMemberSession(
  secret: string,
  code: string,
  member: string,
  now = Date.now(),
) {
  const expiry = Math.floor(now / 1000) + SESSION_DURATION;
  const nonce = randomBytes(24).toString("base64url");
  const payload = `${member}.${expiry}.${nonce}`;
  return `${payload}.${createHmac("sha256", secret).update(`member:${code}:${payload}`).digest("base64url")}`;
}
export function memberFromSession(
  token: string | undefined,
  secret: string,
  code: string,
  now = Date.now(),
): string | null {
  if (!token || token.length > 320) return null;
  const [member, expiry, nonce, signature, ...extra] = token.split(".");
  if (
    extra.length ||
    !/^[0-9a-f-]{36}$/.test(member) ||
    !/^\d+$/.test(expiry) ||
    !nonce ||
    !signature ||
    Number(expiry) <= Math.floor(now / 1000) ||
    Number(expiry) > Math.floor(now / 1000) + SESSION_DURATION
  )
    return null;
  const expected = createHmac("sha256", secret)
    .update(`member:${code}:${member}.${expiry}.${nonce}`)
    .digest("base64url");
  return equalSecret(signature, expected) ? member : null;
}
// The calendar feed's secret path segment. Derived, not stored, so changing
// the household code is what revokes every subscribed phone at once.
export function calendarFeedToken(secret: string, code: string): string {
  return createHmac("sha256", secret)
    .update(`calendar-feed:${code}`)
    .digest("base64url")
    .slice(0, 32);
}
